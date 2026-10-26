/**
 * One-time email detail page (`GET /email-detail/:token`).
 *
 * The token is consumed on the first read, so a render is either the message
 * document or a readable terminal notice (no retry loop possible by design).
 * Every value that comes from the /v1 API is escaped; HTML mail bodies are
 * rendered inside a sandboxed iframe that never gets `allow-scripts`.
 */

import type { Bindings } from '../env';
import { createShortlyApi } from '../api/client';
import type { MessageAttachment, MessageContact, MessageDetail, MessageHeader } from '../api/types';
import { createStore } from '../state/store';
import { escapeHtml, escapeHtmlAttribute, formatBytes, formatDateTime, stripHtml } from '../telegram/format';

export type EmailDetailPageInput = {
	env: Bindings;
	token: string;
	origin: string;
};

export type EmailDetailPageResult = {
	status: number;
	html: string;
};

/** Email HTML may never execute scripts: no `allow-scripts` in the sandbox. */
const FRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

const FOOTER_DETAIL = '这个一次性链接已经失效。再次查看请回到 Telegram 重新生成。';

const NOTICE_EXPIRED = '这个邮件详情链接不存在、已经打开过，或已经超过有效期（10 分钟）。请回到 Telegram 重新生成。';

export async function renderEmailDetailPage(input: EmailDetailPageInput): Promise<EmailDetailPageResult> {
	// `origin` is passed for completeness (the route already owns the response
	// headers); the page itself is self-contained so it cannot leak the host.
	const { env, token } = input;

	try {
		const store = createStore(env);
		const payload = await store.consumeEmailDetailToken(token);
		if (!payload) {
			return { status: 410, html: renderNoticeDocument('链接已失效', NOTICE_EXPIRED) };
		}

		const binding = await store.getBinding(payload.chatId);
		if (!binding) {
			return {
				status: 401,
				html: renderNoticeDocument('无法打开邮件详情', '当前 Telegram 会话没有可用的 API Key 绑定，请回到机器人重新绑定后再试。'),
			};
		}

		const api = createShortlyApi(env);
		const result = await api.getMessage(binding.apiKey, payload.emailId);
		if (!result.ok) {
			if (result.error.kind === 'not_found') {
				return { status: 404, html: renderNoticeDocument('邮件不存在', '这封邮件可能已经被删除了。请回到 Telegram 查看收件箱。') };
			}
			if (result.error.kind === 'unauthorized') {
				return {
					status: 401,
					html: renderNoticeDocument('无法访问这个邮箱', 'API Key 已失效或被删除，请回到机器人重新绑定后再试。'),
				};
			}
			return {
				status: 502,
				html: renderNoticeDocument('无法加载邮件', '连接 Shortly 服务失败，请稍后再试。如果一直失败，请回到 Telegram 重新生成链接。'),
			};
		}

		const detail = result.data?.data;
		if (!detail || typeof detail !== 'object' || typeof detail.id !== 'string' || !detail.id) {
			return {
				status: 502,
				html: renderNoticeDocument('无法加载邮件', '接口返回的数据格式异常，请回到 Telegram 重新生成链接。'),
			};
		}

		return { status: 200, html: renderDetailDocument(detail) };
	} catch (error) {
		console.error('Failed to render email detail page:', error);
		return {
			status: 502,
			html: renderNoticeDocument('无法打开邮件详情', '服务临时不可用，请稍后再试。如果一直失败，请回到 Telegram 重新生成链接。'),
		};
	}
}

// ---------------------------------------------------------------------------
// Document sections
// ---------------------------------------------------------------------------

function formatContact(contact: MessageContact): string {
	const name = contact.name?.trim() ?? '';
	const address = contact.address?.trim() ?? '';
	if (name && address) return `${name} <${address}>`;
	return address || name;
}

function formatContactList(contacts: MessageContact[] | undefined | null): string {
	return (contacts ?? []).map(formatContact).filter(Boolean).join('，');
}

function definitionRow(label: string, value: string, options: { mono?: boolean } = {}): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	const content = options.mono ? `<code>${escapeHtml(trimmed)}</code>` : escapeHtml(trimmed);
	return `<div><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
}

function renderBodySection(detail: MessageDetail): string {
	const textBody = detail.text?.trim() ?? '';
	const htmlBody = detail.html?.trim() ?? '';

	if (!htmlBody) {
		const fallback = textBody || '（无正文）';
		return `<section><h2>正文</h2><pre>${escapeHtml(fallback)}</pre></section>`;
	}

	const parts: string[] = [
		'<section><h2>HTML 正文</h2>',
		`<iframe class="email-frame" title="HTML 邮件正文" sandbox="${FRAME_SANDBOX}" referrerpolicy="no-referrer" srcdoc="${escapeHtmlAttribute(htmlBody)}"></iframe>`,
	];
	if (textBody) {
		parts.push(`<details><summary>查看纯文本正文</summary><pre>${escapeHtml(textBody)}</pre></details>`);
	} else {
		parts.push(`<details><summary>查看文本预览</summary><pre>${escapeHtml(stripHtml(htmlBody) || '（无文本内容）')}</pre></details>`);
	}
	parts.push(`<details><summary>查看 HTML 源码</summary><pre>${escapeHtml(htmlBody)}</pre></details>`);
	parts.push('</section>');
	return parts.join('');
}

function renderAttachmentsSection(attachments: MessageAttachment[] | undefined | null): string {
	const items = attachments ?? [];
	if (!items.length) return '';
	const list = items
		.map((attachment) => {
			const label = attachment.filename?.trim() || '未命名附件';
			const meta = [attachment.mimeType?.trim(), formatBytes(attachment.size)].filter(Boolean).join(' · ');
			return `<li><span>${escapeHtml(label)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</li>`;
		})
		.join('');
	return `<section><h2>附件（${items.length}）</h2><ul>${list}</ul></section>`;
}

function renderHeadersSection(headers: MessageHeader[] | undefined | null): string {
	const items = (headers ?? []).filter((header) => (header.name ?? '').trim() || (header.value ?? '').trim());
	if (!items.length) return '';
	const list = items
		.map(
			(header) =>
				`<li><span>${escapeHtml((header.name ?? '').trim())}</span><small>${escapeHtml((header.value ?? '').trim())}</small></li>`,
		)
		.join('');
	return `<section><details><summary>邮件头（${items.length}）</summary><ul>${list}</ul></details></section>`;
}

function renderDetailDocument(detail: MessageDetail): string {
	const subject = detail.subject?.trim() || '(无主题)';
	const sender = formatContact({ name: detail.fromName, address: detail.from }) || '(未知发件人)';
	const receivedAt = formatDateTime(detail.receivedAt);

	const metadata = [
		definitionRow('收件邮箱', detail.mailboxEmailAddress ?? '', { mono: true }),
		definitionRow('发件人', sender),
		definitionRow('接收时间', receivedAt),
		definitionRow('状态', detail.isRead ? '已读' : '未读'),
		definitionRow('抄送', formatContactList(detail.cc)),
		definitionRow('回复地址', formatContactList(detail.replyTo)),
		definitionRow('Message-ID', detail.messageId ?? '', { mono: true }),
	]
		.filter(Boolean)
		.join('');

	const body = [
		'<main>',
		'<header>',
		'<p class="eyebrow">Shortly 临时邮箱</p>',
		`<h1>${escapeHtml(subject)}</h1>`,
		'</header>',
		`<dl>${metadata}</dl>`,
		renderBodySection(detail),
		renderAttachmentsSection(detail.attachments),
		renderHeadersSection(detail.headers),
		`<footer>${escapeHtml(FOOTER_DETAIL)}</footer>`,
		'</main>',
	].join('');

	return renderBasePage(subject, body);
}

function renderNoticeDocument(title: string, message: string): string {
	return renderBasePage(title, `<main class="notice"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main>`);
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function renderBasePage(title: string, body: string): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; referrer no-referrer">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f5;
      --panel: #ffffff;
      --text: #1f2328;
      --muted: #687076;
      --border: #deded9;
      --accent: #155e75;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 32px auto;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 18px 45px rgb(31 35 40 / 8%);
    }
    .notice {
      width: min(560px, calc(100% - 32px));
      margin-top: 15vh;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 26px 0 10px;
      font-size: 15px;
    }
    dl {
      display: grid;
      gap: 10px;
      margin: 24px 0 0;
      padding: 18px 0;
      border-block: 1px solid var(--border);
    }
    dl div {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 12px;
    }
    dt {
      color: var(--muted);
      font-size: 13px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    pre {
      margin: 0;
      padding: 16px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #fafafa;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: inherit;
    }
    .email-frame {
      display: block;
      width: 100%;
      min-height: 560px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
    }
    details {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fafafa;
    }
    summary {
      cursor: pointer;
      padding: 12px 16px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      user-select: none;
    }
    details pre {
      border-width: 1px 0 0;
      border-radius: 0 0 8px 8px;
      background: #ffffff;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li + li {
      margin-top: 8px;
    }
    small {
      display: block;
      color: var(--muted);
    }
    footer {
      margin-top: 28px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 560px) {
      main { padding: 20px; }
      dl div { grid-template-columns: 1fr; gap: 2px; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
