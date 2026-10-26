/**
 * Temp-mailbox flows: mailbox list / detail / inbox / message detail, the create
 * wizard (`mail:new`), one-time web detail links and compatibility with the
 * inbound-email notification callbacks sent by the Shortly app
 * (`email:read|delete|detail:<messageId>`).
 *
 * Screens are edited in place (the dispatcher anchors the wizard message), all
 * user/API text is escaped before it reaches Telegram's HTML parser, and every
 * failure renders an exit (retry / back / home) instead of throwing.
 */

import { cb, parseIndexArg, parsePageArg } from '../callback-data';
import type { CallbackAction } from '../callback-data';
import { findDomain, resolveDefaultHost } from '../api/domains';
import type { ApiFailure, DomainInfo, MailboxItem, MailMessageItem, MessageDetail, Paginated, ResolvedDomains } from '../api/types';
import type { BotContext, BotModule, Screen } from '../dispatch';
import { generateRandomEmailPrefix } from '../random-email-prefix';
import type { SessionRecord } from '../state/store';
import type { InlineKeyboardButton } from '../telegram/types';
import { code, escapeHtml, formatDateTime, quote, stripHtml, truncate } from '../telegram/format';
import { button, copyButton, markup, pagerRow, urlButton } from '../ui/keyboard';
import { BTN, joinLines } from '../ui/texts';

/** Mailbox list page size (`GET /v1/emails?page&limit=5`). */
const LIST_PAGE_SIZE = 5;
/** Mailbox lookups scan a bigger page so one request is usually enough. */
const SCAN_PAGE_SIZE = 100;
const SCAN_MAX_PAGES = 5;
/** Telegram message body budget for a single mail preview. */
const BODY_PREVIEW_LIMIT = 900;
const LABEL_LIMIT = 60;
const FIELD_LIMIT = 120;
const LOCAL_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const WIZARD_FLOW = 'mail:new';
const DELETE_FLOW = 'mail:delete';

type WizardStep = 'prefix' | 'domain' | 'confirm';

type WizardState = {
	step: WizardStep;
	prefix: string;
	domain: string;
};

type MailboxLookup = {
	mailbox: MailboxItem;
	listPage: number;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function textScreen(lines: Array<string | null | undefined | false>): string {
	return joinLines(lines);
}

function plainLabel(value: string): string {
	return truncate(value.replace(/\s+/g, ' ').trim(), LABEL_LIMIT);
}

function senderLabel(from: string | null | undefined, fromName: string | null | undefined): string {
	const name = (fromName ?? '').trim();
	const address = (from ?? '').trim();
	if (name && address) return `${name} <${address}>`;
	return address || name || '(未知发件人)';
}

function normalizeLocalPart(value: string): string {
	return value.trim().toLowerCase();
}

/** Mirrors the local-part rules of Shortly's `createTempMailboxForUser`. */
function localPartError(prefix: string, domain: DomainInfo | null): string | null {
	if (!prefix) return '前缀不能为空。';
	if (!LOCAL_PART_PATTERN.test(prefix)) {
		return '前缀只能使用小写字母、数字和 . _ -，并且以字母或数字开头（最长 64 个字符）。';
	}
	const min = domain?.minLocalPartLength ?? 0;
	if (min > 0 && prefix.length < min) {
		return `域名 ${domain?.host ?? ''} 要求前缀至少 ${min} 个字符。`;
	}
	return null;
}

function mailboxAddress(mailbox: MailboxItem): string {
	return (mailbox.emailAddress ?? '').trim();
}

function mailboxButtonLabel(mailbox: MailboxItem): string {
	const address = mailboxAddress(mailbox) || '(未知邮箱)';
	const unread = Number.isFinite(mailbox.unreadCount) ? mailbox.unreadCount : 0;
	const total = Number.isFinite(mailbox.messageCount) ? mailbox.messageCount : 0;
	return plainLabel(`${address} · ${unread}/${total}`);
}

function messageButtonLabel(message: MailMessageItem): string {
	const mark = message.isRead ? '📖' : '📩';
	const sender = (message.fromName ?? '').trim() || (message.from ?? '').trim() || '(未知发件人)';
	const subject = (message.subject ?? '').trim() || '(无主题)';
	return plainLabel(`${mark} ${sender} · ${subject}`);
}

function totalPagesOf(page: Paginated<unknown>, pageSize: number): number {
	const totalPages = Number(page.totalPages);
	if (Number.isFinite(totalPages) && totalPages > 0) return Math.floor(totalPages);
	const total = Number(page.total);
	if (Number.isFinite(total) && total > 0) return Math.ceil(total / pageSize);
	return 1;
}

/** The domain step is skipped when Shortly only exposes a single email domain. */
function wizardStepTotal(domains: ResolvedDomains): number {
	return domains.email.length > 1 ? 3 : 2;
}

// ---------------------------------------------------------------------------
// Shared screens
// ---------------------------------------------------------------------------

async function renderNotice(
	ctx: BotContext,
	options: { title: string; lines: Array<string | null | undefined | false>; buttons: Array<InlineKeyboardButton[] | null | undefined> },
): Promise<void> {
	await ctx.render({ text: textScreen([`<b>${options.title}</b>`, '', ...options.lines]), keyboard: markup(options.buttons) });
}

async function renderWizardExpired(ctx: BotContext): Promise<void> {
	await renderNotice(ctx, {
		title: '⌛️ 创建邮箱的草稿已过期',
		lines: ['超过 30 分钟没有操作，草稿已经失效。', '点下方按钮重新开始一次创建就好。'],
		buttons: [[button('✉️ 重新开始', cb.mailNew)], [button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
	});
}

async function renderInvalidAction(ctx: BotContext): Promise<void> {
	await renderNotice(ctx, {
		title: '⚠️ 这个按钮已失效',
		lines: ['按钮里缺少必要的参数（可能来自很早之前的消息）。', '回到邮箱列表重新打开即可。'],
		buttons: [[button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
	});
}

async function renderNoEmailDomains(ctx: BotContext): Promise<void> {
	await renderNotice(ctx, {
		title: '⚠️ 没有可用的邮箱域名',
		lines: ['Shortly 后台还没有启用邮箱域名，请先在 Shortly 后台配置邮箱域名后再试。'],
		buttons: [[button('🔁 重试', cb.mailNew), button(BTN.home, cb.home)]],
	});
}

async function renderMailboxMissing(ctx: BotContext): Promise<void> {
	await renderNotice(ctx, {
		title: '⚠️ 邮箱不存在',
		lines: ['这个邮箱可能已经被删除了。'],
		buttons: [[button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
	});
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

function readWizardState(session: SessionRecord | null): WizardState | null {
	if (!session || session.flow !== WIZARD_FLOW) return null;
	const step: WizardStep = session.step === 'domain' ? 'domain' : session.step === 'confirm' ? 'confirm' : 'prefix';
	return {
		step,
		prefix: normalizeLocalPart(session.data.prefix ?? ''),
		domain: (session.data.domain ?? '').trim().toLowerCase(),
	};
}

/** Persists wizard state while keeping the single anchored wizard message. */
async function saveWizardState(
	ctx: BotContext,
	patch: { step: WizardStep; awaiting?: string; prefix?: string; domain?: string },
): Promise<void> {
	const anchorId = ctx.session?.anchorMessageId ?? ctx.sourceMessageId;
	await ctx.updateSession((session) => {
		const data: Record<string, string> = { ...(session.data ?? {}) };
		if (patch.prefix !== undefined) data.prefix = patch.prefix;
		if (patch.domain !== undefined) data.domain = patch.domain;
		const next: SessionRecord = { ...session, flow: WIZARD_FLOW, step: patch.step, data, updatedAt: Date.now() };
		if (patch.awaiting) next.awaiting = patch.awaiting;
		else delete next.awaiting;
		if (anchorId) next.anchorMessageId = anchorId;
		return next;
	});
}

/**
 * Renders one wizard step, then persists the anchored message id the first time
 * Telegram assigns one (a wizard started from a text command has no source message).
 */
async function renderWizardScreen(ctx: BotContext, screen: Screen): Promise<void> {
	const anchorBefore = ctx.session?.anchorMessageId;
	await ctx.render(screen);
	const session = ctx.session;
	if (session?.anchorMessageId && session.anchorMessageId !== anchorBefore) {
		await ctx.store.saveSession(ctx.chat.id, session);
	}
}

async function resolveWizardDomain(ctx: BotContext, host: string): Promise<{ domain: DomainInfo; domains: ResolvedDomains } | null> {
	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return null;
	}
	const domain = findDomain(domains.email, host) ?? findDomain(domains.email, domains.email[0].host) ?? domains.email[0];
	return { domain, domains };
}

// ---------------------------------------------------------------------------
// Create wizard screens
// ---------------------------------------------------------------------------

async function renderPrefixStep(ctx: BotContext, state: WizardState, options: { notice?: string } = {}): Promise<void> {
	const domains = await ctx.getDomains();
	const domain = findDomain(domains.email, state.domain) ?? domains.email[0] ?? null;
	const host = domain?.host ?? state.domain;
	const address = state.prefix && host ? `${state.prefix}@${host}` : state.prefix;
	const minHint = domain && domain.minLocalPartLength ? `当前域名要求前缀至少 ${domain.minLocalPartLength} 个字符。` : null;

	await renderWizardScreen(ctx, {
		text: textScreen([
			'<b>✉️ 新建临时邮箱</b>',
			`第 1/${wizardStepTotal(domains)} 步 · 选择前缀`,
			'',
			`随机前缀：${code(state.prefix || '—')}`,
			address ? `预览地址：${code(address)}` : null,
			minHint ? `<i>${escapeHtml(minHint)}</i>` : null,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'点「🎲 换一个」重新随机，点「✏️ 自定义」后直接发一条消息告诉我想要的前缀；也可以随时发消息自定义前缀。',
		]),
		keyboard: markup([
			[button('🎲 换一个', cb.mailRerand), button('✏️ 自定义', cb.mailPrefix)],
			[button(BTN.next, cb.mailNext)],
			[button(BTN.cancel, cb.mailCancel)],
		]),
	});
}

async function renderDomainStep(ctx: BotContext, state: WizardState, options: { notice?: string } = {}): Promise<void> {
	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return;
	}
	const current = findDomain(domains.email, state.domain)?.host ?? domains.email[0].host;
	const rows: InlineKeyboardButton[][] = domains.email.map((domain, index) => [
		button(
			plainLabel(
				`${domain.host === current ? '✅' : '✉️'} ${domain.host}${domain.minLocalPartLength ? ` · ≥${domain.minLocalPartLength} 字` : ''}`,
			),
			cb.mailDomain(index),
		),
	]);

	await renderWizardScreen(ctx, {
		text: textScreen([
			'<b>✉️ 新建临时邮箱</b>',
			`第 2/${wizardStepTotal(domains)} 步 · 选择域名`,
			'',
			`前缀：${code(state.prefix || '—')}`,
			`当前域名：${code(current)}`,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'点一个域名切换（✅ 表示当前选择），然后点「下一步 ▶」。',
		]),
		keyboard: markup([...rows, [button('◀ 上一步', cb.mailBack), button(BTN.next, cb.mailNext)], [button(BTN.cancel, cb.mailCancel)]]),
	});
}

async function renderConfirmStep(ctx: BotContext, state: WizardState, options: { notice?: string } = {}): Promise<void> {
	const domains = await ctx.getDomains();
	const domain = findDomain(domains.email, state.domain) ?? domains.email[0] ?? null;
	const host = domain?.host ?? state.domain;
	const error = localPartError(state.prefix, domain);
	const address = state.prefix && host ? `${state.prefix}@${host}` : '';
	const minHint = domain?.minLocalPartLength ? `（前缀至少 ${domain.minLocalPartLength} 个字符）` : '';

	const buttons: InlineKeyboardButton[][] = [];
	buttons.push(address ? [copyButton('📋 复制地址', address), button(BTN.create, cb.mailCreate)] : [button(BTN.create, cb.mailCreate)]);
	buttons.push([button('◀ 上一步', cb.mailBack), button(BTN.cancel, cb.mailCancel)]);

	await renderWizardScreen(ctx, {
		text: textScreen([
			'<b>✉️ 确认创建临时邮箱</b>',
			`第 ${wizardStepTotal(domains)}/${wizardStepTotal(domains)} 步 · 确认`,
			'',
			address ? `地址：${code(address)}` : '地址：—（前缀无效，请返回上一步修改）',
			host ? `域名：${code(host)}${minHint}` : null,
			error ? `<i>⚠️ ${escapeHtml(error)}</i>` : null,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'<i>创建后地址会一直保留，直到你手动删除；收到的新邮件会推送到这里。</i>',
		]),
		keyboard: markup(buttons),
	});
}

async function renderCreatedScreen(ctx: BotContext, mailbox: MailboxItem): Promise<void> {
	const address = mailboxAddress(mailbox);
	const rows: Array<InlineKeyboardButton[] | null> = [];
	rows.push(
		address
			? [copyButton('📋 复制地址', address), button('📬 收件箱', cb.mailMsgs(mailbox.id, 1))]
			: [button('📬 收件箱', cb.mailMsgs(mailbox.id, 1))],
	);
	rows.push([button('✉️ 再建一个', cb.mailNew)]);
	rows.push([button(BTN.home, cb.home)]);

	await ctx.render({
		text: textScreen([
			'<b>✅ 临时邮箱已创建</b>',
			'',
			address ? `地址：${code(address)}` : null,
			mailbox.domain ? `域名：${code(mailbox.domain)}` : null,
			`未读：${mailbox.unreadCount ?? 0} 封 / 共 ${mailbox.messageCount ?? 0} 封`,
			'',
			'现在可以把这个地址填到需要邮箱验证的网站；收到的新邮件会推送到这里。',
		]),
		keyboard: markup(rows),
	});
}

// ---------------------------------------------------------------------------
// Mailbox list / detail
// ---------------------------------------------------------------------------

async function renderMailboxList(ctx: BotContext, page: number, options: { notice?: string } = {}): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.listMailboxes(binding.apiKey, Math.max(1, page), LIST_PAGE_SIZE);
	if (!result.ok) {
		await ctx.handleApiError(result.error, { retryCallback: cb.mailList(page), backCallback: cb.home });
		return;
	}

	const data = result.data;
	const total = Number.isFinite(Number(data.total)) ? Number(data.total) : data.data.length;
	const totalPages = totalPagesOf(data, LIST_PAGE_SIZE);
	const currentPage = Math.min(Math.max(1, Number(data.page) || page), totalPages);

	if (!data.data.length) {
		if (total > 0 && page !== currentPage) {
			await renderMailboxList(ctx, currentPage);
			return;
		}
		await renderNotice(ctx, {
			title: '📬 我的邮箱',
			lines: [
				'你还没有创建任何临时邮箱。',
				'',
				'临时邮箱可以接收验证码、注册通知等邮件，收到的新邮件会推送到这里。',
				options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			],
			buttons: [[button('✉️ 立即创建', cb.mailNew)], [button(BTN.home, cb.home)]],
		});
		return;
	}

	const rows: Array<InlineKeyboardButton[] | null> = data.data.map((mailbox) => [
		button(mailboxButtonLabel(mailbox), cb.mailView(mailbox.id)),
	]);
	rows.push(pagerRow(currentPage, totalPages, (target) => cb.mailList(target)));
	rows.push([button('✉️ 新建邮箱', cb.mailNew), button(BTN.home, cb.home)]);

	await ctx.render({
		text: textScreen([
			'<b>📬 我的邮箱</b>',
			`第 ${currentPage}/${totalPages} 页 · 共 ${total} 个`,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'点下方按钮查看邮箱详情和收件箱（地址 · 未读/总数）。',
		]),
		keyboard: markup(rows),
	});
}

async function renderMailboxView(
	ctx: BotContext,
	mailbox: MailboxItem,
	listPage: number,
	options: { notice?: string } = {},
): Promise<void> {
	const address = mailboxAddress(mailbox);
	const rows: Array<InlineKeyboardButton[] | null> = [];
	rows.push(
		address
			? [copyButton('📋 复制地址', address), button('📨 查看邮件', cb.mailMsgs(mailbox.id, 1))]
			: [button('📨 查看邮件', cb.mailMsgs(mailbox.id, 1))],
	);
	rows.push([button('🗑 删除邮箱', cb.mailDel(mailbox.id))]);
	rows.push([button('◀ 返回', cb.mailList(listPage)), button(BTN.home, cb.home)]);

	const createdAt = formatDateTime(mailbox.createdAt);
	await ctx.render({
		text: textScreen([
			'<b>📬 邮箱详情</b>',
			'',
			address ? `地址：${code(address)}` : '地址：—',
			`未读：${mailbox.unreadCount ?? 0} 封 / 共 ${mailbox.messageCount ?? 0} 封`,
			createdAt ? `创建时间：${createdAt}` : null,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'<i>把这个地址填到需要邮箱验证的网站；收到的新邮件会推送到这里。</i>',
		]),
		keyboard: markup(rows),
	});
}

/** Finds a mailbox (and the mailbox-list page it lives on) with as few requests as possible. */
async function findMailbox(
	ctx: BotContext,
	apiKey: string,
	mailboxId: string,
	retry: { retryCallback: string; backCallback: string },
): Promise<MailboxLookup | null | 'handled'> {
	for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
		const result = await ctx.api.listMailboxes(apiKey, page, SCAN_PAGE_SIZE);
		if (!result.ok) {
			await ctx.handleApiError(result.error, retry);
			return 'handled';
		}
		const index = result.data.data.findIndex((item) => item.id === mailboxId);
		if (index >= 0) {
			const globalIndex = (page - 1) * SCAN_PAGE_SIZE + index;
			return { mailbox: result.data.data[index], listPage: Math.floor(globalIndex / LIST_PAGE_SIZE) + 1 };
		}
		if (page >= totalPagesOf(result.data, SCAN_PAGE_SIZE)) break;
	}
	return null;
}

async function renderMailboxDeleteConfirm(ctx: BotContext, mailbox: MailboxItem, listPage: number): Promise<void> {
	const address = mailboxAddress(mailbox);
	await ctx.render({
		text: textScreen([
			'<b>⚠️ 确认删除这个临时邮箱？</b>',
			'',
			address ? `地址：${code(address)}` : null,
			`邮件：共 ${mailbox.messageCount ?? 0} 封（未读 ${mailbox.unreadCount ?? 0} 封）`,
			'',
			'删除后邮箱地址和其中所有邮件都会被永久删除，无法恢复。',
		]),
		keyboard: markup([
			[button('🗑 确认删除', cb.mailDelOk(mailbox.id))],
			[button('◀ 取消', cb.mailView(mailbox.id)), button('📬 我的邮箱', cb.mailList(listPage))],
		]),
	});
}

// ---------------------------------------------------------------------------
// Inbox / message screens
// ---------------------------------------------------------------------------

async function renderMessageList(ctx: BotContext, mailboxId: string, page: number, options: { notice?: string } = {}): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const requested = Math.max(1, page);
	const result = await ctx.api.listMessages(binding.apiKey, mailboxId, requested, LIST_PAGE_SIZE);
	if (!result.ok) {
		if (result.error.kind === 'not_found') {
			await renderMailboxMissing(ctx);
			return;
		}
		await ctx.handleApiError(result.error, { retryCallback: cb.mailMsgs(mailboxId, requested), backCallback: cb.mailList(1) });
		return;
	}

	const data = result.data;
	const total = Number.isFinite(Number(data.total)) ? Number(data.total) : data.data.length;
	const totalPages = totalPagesOf(data, LIST_PAGE_SIZE);
	const currentPage = Math.min(Math.max(1, Number(data.page) || requested), totalPages);
	const address = (data.mailbox?.emailAddress ?? '').trim();

	if (!data.data.length) {
		if (total > 0 && currentPage !== requested) {
			await renderMessageList(ctx, mailboxId, currentPage);
			return;
		}
		await ctx.render({
			text: textScreen([
				'<b>📨 收件箱</b>',
				address ? `邮箱：${code(address)}` : null,
				options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
				'',
				'收件箱还是空的，等待新邮件…',
				'新邮件到达后 Shortly 会主动推送到这里，也可以点「🔄 刷新」查看。',
			]),
			keyboard: markup([
				[button('🔄 刷新', cb.mailMsgs(mailboxId, currentPage))],
				[button('◀ 返回邮箱', cb.mailView(mailboxId)), button(BTN.home, cb.home)],
			]),
		});
		return;
	}

	const rows: Array<InlineKeyboardButton[] | null> = data.data.map((message) => [
		button(messageButtonLabel(message), cb.msgView(message.id)),
	]);
	rows.push(pagerRow(currentPage, totalPages, (target) => cb.mailMsgs(mailboxId, target)));
	rows.push([button('🔄 刷新', cb.mailMsgs(mailboxId, currentPage)), button('◀ 返回邮箱', cb.mailView(mailboxId))]);
	rows.push([button(BTN.home, cb.home)]);

	await ctx.render({
		text: textScreen([
			'<b>📨 收件箱</b>',
			address ? `邮箱：${code(address)}` : null,
			`第 ${currentPage}/${totalPages} 页 · 共 ${total} 封`,
			options.notice ? `<i>${escapeHtml(options.notice)}</i>` : null,
			'',
			'点下方按钮查看邮件（📩 未读 / 📖 已读）；未读邮件打开后会自动标记为已读。',
		]),
		keyboard: markup(rows),
	});
}

function buildMessageViewScreen(detail: MessageDetail, isRead: boolean): Screen {
	const mailbox = (detail.mailboxEmailAddress ?? '').trim();
	const subject = (detail.subject ?? '').trim() || '(无主题)';
	const sender = senderLabel(detail.from, detail.fromName);
	const rawBody = (detail.text ?? '').trim() || stripHtml(detail.html ?? '');
	const attachmentCount = detail.attachments?.length ?? 0;
	const receivedAt = formatDateTime(detail.receivedAt);

	const actions: InlineKeyboardButton[] = [];
	if (!isRead) actions.push(button('✅ 标记已读', cb.msgRead(detail.id)));
	actions.push(button('🌐 完整邮件', cb.msgDetail(detail.id)));

	const mailboxId = (detail.mailboxId ?? '').trim();
	const back = mailboxId ? button('◀ 返回邮件列表', cb.msgBack(mailboxId, 1)) : button('📬 我的邮箱', cb.mailList(1));

	return {
		text: textScreen([
			'<b>📧 邮件详情</b>',
			'',
			mailbox ? `收件邮箱：${code(mailbox)}` : null,
			`发件人：${escapeHtml(truncate(sender, FIELD_LIMIT))}`,
			`主题：${escapeHtml(truncate(subject, FIELD_LIMIT))}`,
			`时间：${receivedAt || '未知'}`,
			attachmentCount ? `附件：${attachmentCount} 个` : null,
			`状态：${isRead ? '已读' : '未读'}`,
			'',
			rawBody ? quote(truncate(rawBody, BODY_PREVIEW_LIMIT)) : '<i>（无正文）</i>',
			rawBody.length > BODY_PREVIEW_LIMIT ? '<i>正文已截断，点「🌐 完整邮件」查看全文。</i>' : null,
		]),
		keyboard: markup([actions, [button('🗑 删除', cb.msgDel(detail.id))], [back], [button(BTN.home, cb.home)]]),
	};
}

/** Renders a message detail; opening an unread message marks it read once (and toasts). */
async function renderMessageView(
	ctx: BotContext,
	messageId: string,
	options: { autoRead?: boolean; forceRead?: boolean } = {},
): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.getMessage(binding.apiKey, messageId);
	if (!result.ok) {
		await handleMessageActionError(ctx, result.error, messageId);
		return;
	}

	const detail = result.data?.data;
	if (!detail || typeof detail !== 'object' || typeof detail.id !== 'string' || !detail.id) {
		await renderNotice(ctx, {
			title: '⚠️ 邮件数据异常',
			lines: ['接口没有返回完整的邮件内容，请稍后再试。'],
			buttons: [[button('🔁 重新加载', cb.msgView(messageId))], [button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
		});
		return;
	}

	let isRead = detail.isRead === true || options.forceRead === true;
	let markedRead = false;
	if (!isRead && options.autoRead !== false) {
		const readResult = await ctx.api.markMessageRead(binding.apiKey, messageId);
		if (readResult.ok) {
			isRead = true;
			markedRead = true;
		}
	}

	if (markedRead) await ctx.toast('已标记为已读');
	await ctx.render(buildMessageViewScreen(detail, isRead));
}

async function renderMessageDeleteConfirm(ctx: BotContext, detail: MessageDetail): Promise<void> {
	await ctx.render({
		text: textScreen([
			'<b>⚠️ 确认删除这封邮件？</b>',
			'',
			`发件人：${escapeHtml(truncate(senderLabel(detail.from, detail.fromName), FIELD_LIMIT))}`,
			`主题：${escapeHtml(truncate((detail.subject ?? '').trim() || '(无主题)', FIELD_LIMIT))}`,
			`时间：${formatDateTime(detail.receivedAt) || '未知'}`,
			'',
			'删除后无法恢复。',
		]),
		keyboard: markup([[button('🗑 确认删除', cb.msgDelOk(detail.id))], [button('◀ 取消', cb.msgView(detail.id))]]),
	});
}

async function renderDetailLinkScreen(ctx: BotContext, messageId: string, url: string): Promise<void> {
	await ctx.render({
		text: textScreen([
			'<b>🌐 完整邮件链接已生成</b>',
			'',
			'链接 10 分钟内有效，<b>打开一次后立即失效</b>。',
			'页面会用网页形式展示正文、附件和 HTML 版本（脚本被禁用）。',
			'',
			`<i>${escapeHtml(url)}</i>`,
		]),
		keyboard: markup([
			[urlButton('🌐 打开完整邮件', url)],
			[copyButton('📋 复制链接', url)],
			[button('◀ 返回邮件', cb.msgView(messageId)), button(BTN.home, cb.home)],
		]),
	});
}

async function handleMessageActionError(ctx: BotContext, error: ApiFailure, messageId: string): Promise<void> {
	if (error.kind === 'unauthorized') {
		await ctx.handleApiError(error);
		return;
	}
	if (error.kind === 'not_found') {
		await renderNotice(ctx, {
			title: '⚠️ 邮件不存在',
			lines: ['这封邮件可能已经被删除了。'],
			buttons: [[button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
		});
		return;
	}
	await ctx.handleApiError(error, { retryCallback: cb.msgView(messageId), backCallback: cb.mailList(1) });
}

// ---------------------------------------------------------------------------
// Wizard handlers
// ---------------------------------------------------------------------------

async function startMailWizard(ctx: BotContext, options: { prefix?: string; notice?: string } = {}): Promise<void> {
	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return;
	}
	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const host = resolveDefaultHost(domains.email, settings.defaultEmailDomain) || domains.email[0].host;
	const prefix = normalizeLocalPart(options.prefix ?? '') || generateRandomEmailPrefix();
	await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix, domain: host });
	await renderPrefixStep(ctx, { step: 'prefix', prefix, domain: host }, { notice: options.notice });
}

async function handleMailNew(ctx: BotContext): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;
	await startMailWizard(ctx);
}

async function handleMailRerand(ctx: BotContext): Promise<void> {
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	const prefix = generateRandomEmailPrefix();
	await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix, domain: state.domain });
	await renderPrefixStep(ctx, { step: 'prefix', prefix, domain: state.domain }, { notice: '已换一个新的随机前缀。' });
	await ctx.toast('已换一个随机前缀');
}

async function handleMailPrefix(ctx: BotContext): Promise<void> {
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: state.domain });
	await renderPrefixStep(
		ctx,
		{ step: 'prefix', prefix: state.prefix, domain: state.domain },
		{ notice: '请直接把想要的前缀作为下一条消息发给我（不用带 @ 和域名）。' },
	);
	await ctx.toast('等待你发送前缀');
}

async function handleMailDomain(ctx: BotContext, action: CallbackAction): Promise<void> {
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return;
	}

	const index = parseIndexArg(action.args, 0);
	if (index === null) {
		await saveWizardState(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
		await renderDomainStep(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
		return;
	}

	const domain = domains.email[index];
	if (!domain) {
		await ctx.toast('域名列表已更新，请重新选择');
		await saveWizardState(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
		await renderDomainStep(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
		return;
	}

	const error = localPartError(state.prefix, domain);
	if (error) {
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: domain.host });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: domain.host }, { notice: error });
		return;
	}

	await saveWizardState(ctx, { step: 'domain', prefix: state.prefix, domain: domain.host });
	await renderDomainStep(ctx, { step: 'domain', prefix: state.prefix, domain: domain.host }, { notice: `已选择域名 ${domain.host}。` });
}

async function handleMailNext(ctx: BotContext): Promise<void> {
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	const resolved = await resolveWizardDomain(ctx, state.domain);
	if (!resolved) return;
	const { domain, domains } = resolved;
	const error = localPartError(state.prefix, domain);
	if (error) {
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: domain.host });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: domain.host }, { notice: error });
		return;
	}

	if (state.step === 'prefix' && domains.email.length > 1) {
		await saveWizardState(ctx, { step: 'domain', prefix: state.prefix, domain: domain.host });
		await renderDomainStep(ctx, { step: 'domain', prefix: state.prefix, domain: domain.host });
		return;
	}

	await saveWizardState(ctx, { step: 'confirm', prefix: state.prefix, domain: domain.host });
	await renderConfirmStep(ctx, { step: 'confirm', prefix: state.prefix, domain: domain.host });
}

async function handleMailBack(ctx: BotContext): Promise<void> {
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	if (state.step === 'confirm') {
		const domains = await ctx.getDomains();
		if (domains.email.length > 1) {
			await saveWizardState(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
			await renderDomainStep(ctx, { step: 'domain', prefix: state.prefix, domain: state.domain });
			return;
		}
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: state.domain });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: state.domain });
		return;
	}
	if (state.step === 'domain') {
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: state.domain });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: state.domain });
		return;
	}
	await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: state.domain });
	await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: state.domain }, { notice: '已经在第一步了。' });
}

async function handleMailCancel(ctx: BotContext): Promise<void> {
	// Legacy notification delete confirmation reuses the `mail:delete` flow.
	if (ctx.session?.flow === DELETE_FLOW) {
		const messageId = (ctx.session.data.messageId ?? '').trim();
		await ctx.store.clearSession(ctx.chat.id);
		ctx.session = null;
		if (messageId && ctx.sourceMessageId) {
			await ctx.telegram.editMessageReplyMarkup({
				chatId: ctx.chat.id,
				messageId: ctx.sourceMessageId,
				keyboard: notificationKeyboard(messageId),
			});
		}
		await ctx.toast('已取消删除');
		return;
	}

	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await renderNotice(ctx, {
		title: '✅ 已取消创建邮箱',
		lines: ['需要时随时可以重新创建。'],
		buttons: [[button('✉️ 新建邮箱', cb.mailNew), button('📬 我的邮箱', cb.mailList(1))], [button(BTN.home, cb.home)]],
	});
	await ctx.toast('已取消');
}

async function handleMailCreate(ctx: BotContext): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;
	const state = readWizardState(ctx.session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}
	const resolved = await resolveWizardDomain(ctx, state.domain);
	if (!resolved) return;
	const { domain } = resolved;
	const error = localPartError(state.prefix, domain);
	if (error) {
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: domain.host });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: domain.host }, { notice: error });
		return;
	}

	const emailAddress = `${state.prefix}@${domain.host}`;
	if (ctx.chat.type === 'private') await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

	const result = await ctx.api.createMailbox(binding.apiKey, emailAddress);
	if (!result.ok) {
		if (result.error.kind === 'unauthorized') {
			await ctx.handleApiError(result.error);
			return;
		}
		await renderConfirmStep(
			ctx,
			{ step: 'confirm', prefix: state.prefix, domain: domain.host },
			{ notice: `创建失败：${result.error.message}` },
		);
		await ctx.toast('创建失败，可重试', { alert: true });
		return;
	}

	const mailbox = result.data?.data;
	if (!mailbox || typeof mailbox.id !== 'string' || !mailbox.id) {
		await renderConfirmStep(
			ctx,
			{ step: 'confirm', prefix: state.prefix, domain: domain.host },
			{ notice: '接口返回的数据不完整，请重试一次。' },
		);
		await ctx.toast('创建失败', { alert: true });
		return;
	}

	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await renderCreatedScreen(ctx, mailbox);
	await ctx.toast('邮箱已创建');
}

async function handleMailTextInput(ctx: BotContext, text: string, session: SessionRecord): Promise<void> {
	const state = readWizardState(session);
	if (!state) {
		await renderWizardExpired(ctx);
		return;
	}

	if (session.awaiting !== 'prefix') {
		if (state.step === 'domain') {
			await renderDomainStep(ctx, state, { notice: '当前步骤请点击下方域名按钮选择；点「◀ 上一步」可以改前缀。' });
			return;
		}
		if (state.step === 'prefix') {
			await renderPrefixStep(ctx, state, { notice: '当前步骤请点「下一步 ▶」，或先发一条消息自定义前缀。' });
			return;
		}
		await renderConfirmStep(ctx, state, { notice: '当前步骤请点击下方按钮操作；点「◀ 上一步」可以改前缀或域名。' });
		return;
	}

	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return;
	}

	const input = text.trim().toLowerCase();
	let prefix = input;
	let host = state.domain;
	if (input.includes('@')) {
		const [left, right] = input.split('@');
		prefix = normalizeLocalPart(left ?? '');
		if ((right ?? '').trim()) host = (right ?? '').trim();
	}
	const domain = findDomain(domains.email, host) ?? findDomain(domains.email, state.domain) ?? domains.email[0];

	const error = localPartError(prefix, domain);
	if (error) {
		await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix: state.prefix, domain: domain.host });
		await renderPrefixStep(ctx, { step: 'prefix', prefix: state.prefix, domain: domain.host }, { notice: error });
		return;
	}

	await saveWizardState(ctx, { step: 'prefix', awaiting: 'prefix', prefix, domain: domain.host });
	await renderPrefixStep(ctx, { step: 'prefix', prefix, domain: domain.host }, { notice: `已使用前缀 ${prefix}。` });
}

// ---------------------------------------------------------------------------
// Mailbox handlers
// ---------------------------------------------------------------------------

async function handleMailList(ctx: BotContext, action: CallbackAction): Promise<void> {
	await renderMailboxList(ctx, parsePageArg(action.args, 0));
}

async function handleMailView(ctx: BotContext, action: CallbackAction): Promise<void> {
	const mailboxId = (action.args[0] ?? '').trim();
	if (!mailboxId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const lookup = await findMailbox(ctx, binding.apiKey, mailboxId, {
		retryCallback: cb.mailView(mailboxId),
		backCallback: cb.mailList(1),
	});
	if (lookup === 'handled') return;
	if (!lookup) {
		await renderMailboxMissing(ctx);
		return;
	}
	await renderMailboxView(ctx, lookup.mailbox, lookup.listPage);
}

async function handleMailMsgs(ctx: BotContext, action: CallbackAction): Promise<void> {
	const mailboxId = (action.args[0] ?? '').trim();
	if (!mailboxId) {
		await renderInvalidAction(ctx);
		return;
	}
	await renderMessageList(ctx, mailboxId, parsePageArg(action.args, 1));
}

async function handleMailDel(ctx: BotContext, action: CallbackAction): Promise<void> {
	const mailboxId = (action.args[0] ?? '').trim();
	if (!mailboxId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const lookup = await findMailbox(ctx, binding.apiKey, mailboxId, {
		retryCallback: cb.mailDel(mailboxId),
		backCallback: cb.mailList(1),
	});
	if (lookup === 'handled') return;
	if (!lookup) {
		await renderMailboxMissing(ctx);
		return;
	}
	await renderMailboxDeleteConfirm(ctx, lookup.mailbox, lookup.listPage);
}

async function handleMailDelOk(ctx: BotContext, action: CallbackAction): Promise<void> {
	// The delete endpoint takes the mailbox UUID (regression: v1 deleted by address).
	const mailboxId = (action.args[0] ?? '').trim();
	if (!mailboxId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.deleteMailbox(binding.apiKey, mailboxId);
	if (!result.ok) {
		if (result.error.kind === 'unauthorized') {
			await ctx.handleApiError(result.error);
			return;
		}
		if (result.error.kind === 'not_found') {
			await ctx.toast('这个邮箱已经不存在了');
			await renderMailboxList(ctx, 1);
			return;
		}
		await ctx.handleApiError(result.error, { retryCallback: cb.mailDelOk(mailboxId), backCallback: cb.mailList(1) });
		return;
	}

	await ctx.toast('邮箱已删除');
	await renderMailboxList(ctx, 1, { notice: '邮箱已删除。' });
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

async function handleMessageView(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await renderInvalidAction(ctx);
		return;
	}
	await renderMessageView(ctx, messageId);
}

async function handleMessageRead(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.markMessageRead(binding.apiKey, messageId);
	if (!result.ok) {
		await handleMessageActionError(ctx, result.error, messageId);
		return;
	}
	await ctx.toast('已标记为已读');
	await renderMessageView(ctx, messageId, { autoRead: false, forceRead: true });
}

async function handleMessageDelete(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.getMessage(binding.apiKey, messageId);
	if (!result.ok) {
		await handleMessageActionError(ctx, result.error, messageId);
		return;
	}
	const detail = result.data?.data;
	if (!detail || !detail.id) {
		await renderInvalidAction(ctx);
		return;
	}
	await renderMessageDeleteConfirm(ctx, detail);
}

async function handleMessageDelOk(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	// Fetch first: the inbox to return to is only known from the message itself.
	const detailResult = await ctx.api.getMessage(binding.apiKey, messageId);
	if (!detailResult.ok) {
		if (detailResult.error.kind === 'not_found') {
			await ctx.toast('这封邮件已经不存在了');
			await renderMailboxList(ctx, 1);
			return;
		}
		await handleMessageActionError(ctx, detailResult.error, messageId);
		return;
	}
	const mailboxId = (detailResult.data?.data?.mailboxId ?? '').trim();

	const result = await ctx.api.deleteMessage(binding.apiKey, messageId);
	if (!result.ok) {
		if (result.error.kind === 'not_found') {
			await ctx.toast('这封邮件已经不存在了');
			if (mailboxId) await renderMessageList(ctx, mailboxId, 1);
			else await renderMailboxList(ctx, 1);
			return;
		}
		await handleMessageActionError(ctx, result.error, messageId);
		return;
	}

	await ctx.toast('邮件已删除');
	if (mailboxId) await renderMessageList(ctx, mailboxId, 1);
	else await renderMailboxList(ctx, 1);
}

async function handleMessageBack(ctx: BotContext, action: CallbackAction): Promise<void> {
	const mailboxId = (action.args[0] ?? '').trim();
	if (!mailboxId) {
		await renderInvalidAction(ctx);
		return;
	}
	await renderMessageList(ctx, mailboxId, parsePageArg(action.args, 1));
}

async function handleMessageDetail(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await renderInvalidAction(ctx);
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const origin = ctx.origin.trim().replace(/\/+$/, '');
	if (!origin) {
		await renderNotice(ctx, {
			title: '⚠️ 暂时无法生成网页链接',
			lines: ['这个 Worker 没有可用的对外域名（origin 为空），所以无法生成一次性网页。', '可以先用上面的正文预览查看内容，或者稍后再试。'],
			buttons: [[button('◀ 返回邮件', cb.msgView(messageId))], [button(BTN.home, cb.home)]],
		});
		await ctx.toast('无法生成网页链接', { alert: true });
		return;
	}

	const token = await ctx.store.createEmailDetailToken({ chatId: ctx.chat.id, emailId: messageId });
	const url = `${origin}/email-detail/${token}`;
	await renderDetailLinkScreen(ctx, messageId, url);
	await ctx.toast('完整邮件链接已生成');
}

// ---------------------------------------------------------------------------
// Legacy notification callbacks (`email:read|delete|detail:<messageId>`)
// ---------------------------------------------------------------------------

function legacyCallbackData(action: 'read' | 'delete' | 'detail', messageId: string): string {
	return `email:${action}:${messageId}`;
}

function notificationKeyboard(messageId: string) {
	return markup([
		[button('✅ 已读', legacyCallbackData('read', messageId)), button('🗑 删除', legacyCallbackData('delete', messageId))],
		[button('🌐 查看邮件详情', legacyCallbackData('detail', messageId))],
	]);
}

function notificationKeyboardAfterRead(messageId: string) {
	return markup([
		[button('🗑 删除', legacyCallbackData('delete', messageId)), button('🌐 完整邮件', legacyCallbackData('detail', messageId))],
	]);
}

function notificationDeleteConfirmKeyboard(messageId: string) {
	return markup([[button('⚠️ 确认删除', legacyCallbackData('delete', messageId)), button('❌ 取消', cb.mailCancel)]]);
}

async function reportLegacyFailure(ctx: BotContext, error: ApiFailure, actionLabel: string): Promise<void> {
	if (error.kind === 'unauthorized') {
		await ctx.handleApiError(error);
		return;
	}
	await ctx.toast(`${actionLabel}：${error.message}`, { alert: true });
}

async function handleLegacyRead(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await ctx.toast('邮件参数无效', { alert: true });
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const result = await ctx.api.markMessageRead(binding.apiKey, messageId);
	if (!result.ok) {
		await reportLegacyFailure(ctx, result.error, '标记已读失败');
		return;
	}

	if (ctx.sourceMessageId) {
		await ctx.telegram.editMessageReplyMarkup({
			chatId: ctx.chat.id,
			messageId: ctx.sourceMessageId,
			keyboard: notificationKeyboardAfterRead(messageId),
		});
	}
	await ctx.toast('已标记为已读');
}

async function handleLegacyDelete(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await ctx.toast('邮件参数无效', { alert: true });
		return;
	}
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const pendingId = ctx.session?.flow === DELETE_FLOW ? (ctx.session.data.messageId ?? '').trim() : '';
	if (pendingId !== messageId) {
		// First tap: edit the notification into a confirmation (callback data stays
		// `email:delete:<id>` so old buttons keep working), remember the pending id.
		await ctx.updateSession(() => ({ flow: DELETE_FLOW, step: 'confirm', data: { messageId }, updatedAt: Date.now() }));
		if (ctx.sourceMessageId) {
			await ctx.telegram.editMessageReplyMarkup({
				chatId: ctx.chat.id,
				messageId: ctx.sourceMessageId,
				keyboard: notificationDeleteConfirmKeyboard(messageId),
			});
		} else {
			await ctx.render({
				text: textScreen(['<b>⚠️ 确认删除这封邮件？</b>', '', '删除后无法恢复。']),
				keyboard: notificationDeleteConfirmKeyboard(messageId),
			});
		}
		await ctx.toast('请再点一次确认删除');
		return;
	}

	const result = await ctx.api.deleteMessage(binding.apiKey, messageId);
	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	if (!result.ok) {
		await reportLegacyFailure(ctx, result.error, '删除邮件失败');
		return;
	}

	if (ctx.sourceMessageId) {
		await ctx.telegram.editMessageReplyMarkup({ chatId: ctx.chat.id, messageId: ctx.sourceMessageId, keyboard: markup([]) });
	}
	await ctx.toast('邮件已删除');
}

async function handleLegacyDetail(ctx: BotContext, action: CallbackAction): Promise<void> {
	const messageId = (action.args[0] ?? '').trim();
	if (!messageId) {
		await ctx.toast('邮件参数无效', { alert: true });
		return;
	}
	await renderMessageView(ctx, messageId);
}

// ---------------------------------------------------------------------------
// Command aliases
// ---------------------------------------------------------------------------

async function createMailboxDirect(ctx: BotContext, prefix: string, domain: DomainInfo): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const emailAddress = `${prefix}@${domain.host}`;
	if (ctx.chat.type === 'private') await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

	const result = await ctx.api.createMailbox(binding.apiKey, emailAddress);
	if (!result.ok) {
		if (result.error.kind === 'unauthorized') {
			await ctx.handleApiError(result.error);
			return;
		}
		await renderNotice(ctx, {
			title: '⚠️ 邮箱创建失败',
			lines: [escapeHtml(result.error.message), '', '可以换一个前缀再试。'],
			buttons: [[button('✉️ 重新创建', cb.mailNew)], [button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
		});
		return;
	}

	const mailbox = result.data?.data;
	if (!mailbox || typeof mailbox.id !== 'string' || !mailbox.id) {
		await renderNotice(ctx, {
			title: '⚠️ 邮箱创建失败',
			lines: ['接口返回的数据不完整，请重试一次。'],
			buttons: [[button('✉️ 重新创建', cb.mailNew)], [button('📬 我的邮箱', cb.mailList(1))]],
		});
		return;
	}

	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await renderCreatedScreen(ctx, mailbox);
	await ctx.toast('邮箱已创建');
}

/** `/email [prefix] [domain]` — creates immediately; without args starts the wizard. */
async function handleEmailAlias(ctx: BotContext, args: string[]): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const domains = await ctx.getDomains();
	if (!domains.email.length) {
		await renderNoEmailDomains(ctx);
		return;
	}

	const rawPrefix = (args[0] ?? '').trim().toLowerCase();
	if (!rawPrefix) {
		await startMailWizard(ctx);
		return;
	}

	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const defaultHost = resolveDefaultHost(domains.email, settings.defaultEmailDomain) || domains.email[0].host;

	let prefix = rawPrefix;
	let hostInput = (args[1] ?? '').trim().toLowerCase();
	if (prefix.includes('@')) {
		const [left, right] = prefix.split('@');
		prefix = (left ?? '').trim();
		hostInput = hostInput || (right ?? '').trim();
	}

	const domain = hostInput ? findDomain(domains.email, hostInput) : findDomain(domains.email, defaultHost);
	if (!domain) {
		await renderNotice(ctx, {
			title: '⚠️ 域名不可用',
			lines: [
				`域名 ${code(hostInput || defaultHost)} 不在 Shortly 当前启用的邮箱域名里。`,
				'',
				'可以点「✉️ 重新创建」在向导里选择可用域名。',
			],
			buttons: [[button('✉️ 重新创建', cb.mailNew)], [button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
		});
		return;
	}

	const error = localPartError(prefix, domain);
	if (error) {
		await renderNotice(ctx, {
			title: '⚠️ 前缀不可用',
			lines: [escapeHtml(error), '', `可用域名：${escapeHtml(domain.host)}`],
			buttons: [[button('✏️ 重新填写', cb.mailNew)], [button('📬 我的邮箱', cb.mailList(1)), button(BTN.home, cb.home)]],
		});
		return;
	}

	await createMailboxDirect(ctx, prefix, domain);
}

/** `/emails [page]`. */
async function handleEmailsAlias(ctx: BotContext, args: string[]): Promise<void> {
	await renderMailboxList(ctx, parsePageArg(args, 0));
}

/** `/delete <address>` — scans the mailbox list, then asks for confirmation. */
async function handleDeleteAlias(ctx: BotContext, args: string[]): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const raw = args
		.join(' ')
		.trim()
		.replace(/[<>"']/g, '')
		.toLowerCase();
	if (!raw) {
		await renderNotice(ctx, {
			title: '🗑 删除临时邮箱',
			lines: ['请带上要删除的邮箱地址，例如：', code('/delete name@mail.short.ly'), '', '也可以进入「📬 我的邮箱」详情页删除。'],
			buttons: [[button('📬 我的邮箱', cb.mailList(1))], [button(BTN.home, cb.home)]],
		});
		return;
	}

	for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
		const result = await ctx.api.listMailboxes(binding.apiKey, page, SCAN_PAGE_SIZE);
		if (!result.ok) {
			await ctx.handleApiError(result.error, { retryCallback: cb.mailList(1), backCallback: cb.home });
			return;
		}
		const index = result.data.data.findIndex((item) => mailboxAddress(item).toLowerCase() === raw);
		if (index >= 0) {
			const globalIndex = (page - 1) * SCAN_PAGE_SIZE + index;
			await renderMailboxDeleteConfirm(ctx, result.data.data[index], Math.floor(globalIndex / LIST_PAGE_SIZE) + 1);
			return;
		}
		if (page >= totalPagesOf(result.data, SCAN_PAGE_SIZE)) break;
	}

	await renderMailboxList(ctx, 1, { notice: `没有找到邮箱 ${raw}。` });
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const mailModule: BotModule = {
	name: 'mail',
	callbacks: {
		'mail:new': handleMailNew,
		'mail:next': handleMailNext,
		'mail:list': handleMailList,
		'mail:view': handleMailView,
		'mail:msgs': handleMailMsgs,
		'mail:rerand': handleMailRerand,
		'mail:prefix': handleMailPrefix,
		'mail:domain': handleMailDomain,
		'mail:create': handleMailCreate,
		'mail:cancel': handleMailCancel,
		'mail:back': handleMailBack,
		'mail:del': handleMailDel,
		'mail:delok': handleMailDelOk,
		'msg:view': handleMessageView,
		'msg:read': handleMessageRead,
		'msg:del': handleMessageDelete,
		'msg:delok': handleMessageDelOk,
		'msg:detail': handleMessageDetail,
		'msg:back': handleMessageBack,
		'legacy:email-read': handleLegacyRead,
		'legacy:email-delete': handleLegacyDelete,
		'legacy:email-detail': handleLegacyDetail,
	},
	textInputs: {
		'mail:new': handleMailTextInput,
	},
	aliases: {
		email: handleEmailAlias,
		emails: handleEmailsAlias,
		delete: handleDeleteAlias,
	},
};
