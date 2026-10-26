/**
 * Short-link flows: list, detail and the single-message create wizard.
 *
 * Wizard contract (DESIGN §2.3): session flow `link:new`, steps
 * target → slug → domain → expiry → clicks → confirm. The wizard reuses one
 * anchor message, so every step writes the draft session and then re-renders
 * that same message. `link:new` starts a fresh wizard, `link:next` advances one
 * step, `link:back` goes back one step.
 */

import { cb, parseIndexArg, parsePageArg } from '../callback-data';
import type { CallbackAction } from '../callback-data';
import type { ApiFailure, DomainInfo, LinkItem, ShortenInput, ShortenResult } from '../api/types';
import { CLICK_LIMIT_OPTIONS, EXPIRY_OPTIONS } from '../api/types';
import { findDomain, resolveDefaultHost } from '../api/domains';
import type { BotContext, BotModule } from '../dispatch';
import { SESSION_TTL_SECONDS } from '../env';
import type { SessionRecord } from '../state/store';
import { clampMessage, escapeAndTruncate, escapeHtml, formatDateTime, normalizeUrlInput, truncate } from '../telegram/format';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from '../telegram/types';
import { button, chunkRows, copyButton, markup, pagerRow, urlButton } from '../ui/keyboard';
import { BTN } from '../ui/texts';
import { renderHome } from './home';

const LIST_PAGE_SIZE = 5;
const WIZARD_STEP_TOTAL = 6;
const MAX_URL_LENGTH = 2048;
const MAX_CLICKS = 1_000_000;
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;
const RANDOM_SLUG_LENGTH = 6;
const RANDOM_SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Detail screens reuse the last list page instead of spending another API call. */
const LIST_CACHE_PREFIX = 'll:';
const LIST_CACHE_TTL_SECONDS = SESSION_TTL_SECONDS;

type WizardStep = 'target' | 'slug' | 'domain' | 'expiry' | 'clicks' | 'custom-slug' | 'custom-clicks' | 'confirm' | 'direct';
type AwaitingInput = 'target' | 'custom-slug' | 'custom-clicks';

const WIZARD_STEPS = new Set<string>(['target', 'slug', 'domain', 'expiry', 'clicks', 'custom-slug', 'custom-clicks', 'confirm', 'direct']);
/** Steps whose "下一步 ▶" button reuses the `link:new` callback. */
const ADVANCEABLE_STEPS = new Set<string>(['slug', 'domain', 'expiry', 'clicks']);

type Draft = {
	target: string;
	slug: string;
	slugMode: 'random' | 'custom';
	domain: string;
	expiry: string;
	clicks: string;
};

type LinkListCache = {
	page: number;
	total: number;
	totalPages: number;
	items: LinkItem[];
	savedAt: number;
};

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

function isWizardSession(session: SessionRecord | null): session is SessionRecord {
	return Boolean(session && session.flow === 'link:new' && WIZARD_STEPS.has(session.step));
}

function randomSlug(): string {
	const bytes = new Uint8Array(RANDOM_SLUG_LENGTH);
	crypto.getRandomValues(bytes);
	let slug = '';
	for (const byte of bytes) {
		slug += RANDOM_SLUG_ALPHABET[byte % RANDOM_SLUG_ALPHABET.length];
	}
	return slug;
}

function readDraft(session: SessionRecord): Draft {
	const data = session.data ?? {};
	return {
		target: data.target ?? '',
		slug: data.slug ?? '',
		slugMode: data.slugMode === 'custom' ? 'custom' : 'random',
		domain: data.domain ?? '',
		expiry: data.expiry ?? '0',
		clicks: data.clicks ?? '0',
	};
}

function toDraftData(draft: Draft): Record<string, string> {
	return {
		target: draft.target,
		slug: draft.slug,
		slugMode: draft.slugMode,
		domain: draft.domain,
		expiry: draft.expiry,
		clicks: draft.clicks,
	};
}

function draftSession(ctx: BotContext, draft: Draft, step: WizardStep, awaiting?: AwaitingInput): SessionRecord {
	const session: SessionRecord = {
		flow: 'link:new',
		step,
		data: toDraftData(draft),
		updatedAt: Date.now(),
	};
	const anchorMessageId = ctx.session?.anchorMessageId ?? ctx.sourceMessageId;
	if (anchorMessageId !== undefined) session.anchorMessageId = anchorMessageId;
	if (awaiting !== undefined) session.awaiting = awaiting;
	return session;
}

/** Puts the draft in ctx.session *before* rendering, so render can capture the anchor message id. */
function stageDraft(ctx: BotContext, draft: Draft, step: WizardStep, awaiting?: AwaitingInput): void {
	ctx.session = draftSession(ctx, draft, step, awaiting);
}

/** Persists the staged draft plus the anchor id resolved by the render. */
async function persistDraft(ctx: BotContext): Promise<void> {
	if (ctx.session && ctx.session.flow === 'link:new') {
		await ctx.store.saveSession(ctx.chat.id, ctx.session);
	}
}

async function requireWizard(ctx: BotContext): Promise<{ session: SessionRecord; draft: Draft } | null> {
	const session = ctx.session;
	if (!isWizardSession(session)) {
		await renderExpired(ctx);
		return null;
	}
	return { session, draft: readDraft(session) };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

async function show(ctx: BotContext, text: string, keyboard?: InlineKeyboardMarkup): Promise<void> {
	await ctx.render({ text: clampMessage(text), keyboard });
}

function codeText(value: string, maxLength = 300): string {
	return `<code>${escapeAndTruncate(value, maxLength)}</code>`;
}

function optionLabel(selected: boolean, text: string): string {
	return selected ? `✅ ${text}` : text;
}

function expiryLabel(value: string): string {
	const index = Number.parseInt(value, 10);
	if (!Number.isFinite(index) || index <= 0) return '永久';
	return EXPIRY_OPTIONS[index - 1]?.label ?? '永久';
}

function clicksLabel(value: string | number | null | undefined): string {
	const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return '不限';
	return `${parsed} 次`;
}

function statusLabel(item: LinkItem): string {
	if (!item.isExpired) return '✅ 有效';
	if (item.expiredByClicks) return '⛔️ 已失效（点击达上限）';
	if (item.expiredByDate) return '⛔️ 已失效（已过期）';
	return '⛔️ 已失效';
}

function shortLabel(item: LinkItem): string {
	const raw = typeof item.shortUrl === 'string' ? item.shortUrl.trim() : '';
	const withoutScheme = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
	if (withoutScheme) return withoutScheme;
	if (item.domain && item.slug) return `${item.domain}/${item.slug}`;
	return typeof item.slug === 'string' ? item.slug : '—';
}

function openUrl(shortUrl: string, fallbackLabel: string): string {
	const raw = (shortUrl ?? '').trim();
	if (/^https?:\/\//i.test(raw)) return raw;
	const label = (fallbackLabel ?? '').replace(/^\/+/, '').trim();
	return label ? `https://${label}` : '';
}

function isLinkItem(value: unknown): value is LinkItem {
	if (!value || typeof value !== 'object') return false;
	const item = value as Partial<LinkItem>;
	return typeof item.id === 'string' && typeof item.slug === 'string' && typeof item.domain === 'string';
}

type UrlValidation = { ok: true; url: string } | { ok: false; reason: string };

function validateTargetUrl(raw: string): UrlValidation {
	const url = normalizeUrlInput(raw);
	if (!url) return { ok: false, reason: '请发送要缩短的链接。' };
	if (url.length > MAX_URL_LENGTH) return { ok: false, reason: `链接过长，最多支持 ${MAX_URL_LENGTH} 个字符。` };
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: '链接格式不正确，请发送完整链接（例如 https://example.com/page）。' };
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { ok: false, reason: '仅支持 http:// 或 https:// 开头的链接。' };
	}
	return { ok: true, url };
}

// ---------------------------------------------------------------------------
// List-page cache (used by link:view, which must not call the API again)
// ---------------------------------------------------------------------------

function listCacheKey(chatId: number): string {
	return `${LIST_CACHE_PREFIX}${chatId}`;
}

async function saveListCache(ctx: BotContext, cache: LinkListCache): Promise<void> {
	try {
		await ctx.env.TGBOT_KV.put(listCacheKey(ctx.chat.id), JSON.stringify(cache), { expirationTtl: LIST_CACHE_TTL_SECONDS });
	} catch (error) {
		// A cache miss only degrades link:view to the "expired" screen; never block the list itself.
		console.error('Failed to cache link list page:', error);
	}
}

async function readListCache(ctx: BotContext): Promise<LinkListCache | null> {
	try {
		const raw = await ctx.env.TGBOT_KV.get(listCacheKey(ctx.chat.id));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<LinkListCache> | null;
		if (!parsed || !Array.isArray(parsed.items)) return null;
		const items = parsed.items.filter(isLinkItem);
		return {
			page: Number.isFinite(parsed.page) ? Number(parsed.page) : 1,
			total: Number.isFinite(parsed.total) ? Number(parsed.total) : items.length,
			totalPages: Number.isFinite(parsed.totalPages) ? Number(parsed.totalPages) : 1,
			items,
			savedAt: Number.isFinite(parsed.savedAt) ? Number(parsed.savedAt) : 0,
		};
	} catch (error) {
		console.error('Failed to read link list cache:', error);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Wizard screens
// ---------------------------------------------------------------------------

async function renderExpired(ctx: BotContext, listPage = 1): Promise<void> {
	const text = [
		'<b>⌛️ 草稿已过期</b>',
		'',
		'这次操作的数据已经失效（超过 30 分钟未操作，或草稿已被清理）。',
		'',
		'点下方按钮重新开始；如果是从列表点开的详情，请重新打开列表后再试。',
	].join('\n');
	await show(
		ctx,
		text,
		markup([[button('➕ 重新开始', cb.linkNew)], [button('🔗 我的短链', cb.linkList(listPage)), button(BTN.home, cb.home)]]),
	);
	await ctx.toast('操作已过期，请重新开始');
}

async function renderTargetStep(ctx: BotContext, notice?: string): Promise<void> {
	const lines = [
		'<b>➕ 新建短链</b>',
		`第 1/${WIZARD_STEP_TOTAL} 步 · 目标链接`,
		'',
		'请直接发送要缩短的链接（可以省略 https://），例如：',
		'<code>https://example.com/page</code>',
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	lines.push('', '<i>发送 /cancel 可以随时取消。</i>');
	await show(ctx, lines.join('\n'), markup([[button(BTN.cancel, cb.linkCancel)]]));
}

async function renderSlugStep(ctx: BotContext, draft: Draft, notice?: string): Promise<void> {
	const preview = draft.domain ? `${draft.domain}/${draft.slug}` : draft.slug;
	const lines = [
		'<b>➕ 新建短链</b>',
		`第 2/${WIZARD_STEP_TOTAL} 步 · 短链标识`,
		'',
		`目标：${codeText(draft.target, 120)}`,
		`标识：${codeText(draft.slug || '（未生成）', 60)}`,
		`预览：${codeText(preview || '—', 120)}`,
		'',
		'随机标识为 6 位字母数字；也可以自定义（字母、数字、连字符、下划线，最多 50 字符）。',
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	await show(
		ctx,
		lines.join('\n'),
		markup([
			[button('🎲 换一个', cb.linkRerand), button('✏️ 自定义', cb.linkSlug)],
			[button('◀ 上一步', cb.linkBack), button(BTN.next, cb.linkNext)],
			[button(BTN.cancel, cb.linkCancel)],
		]),
	);
}

async function renderDomainStep(ctx: BotContext, draft: Draft, domains: DomainInfo[], notice?: string): Promise<void> {
	const lines = [
		'<b>➕ 新建短链</b>',
		`第 3/${WIZARD_STEP_TOTAL} 步 · 选择域名`,
		'',
		`标识：${codeText(draft.slug || '—', 60)}`,
		`当前域名：${draft.domain ? codeText(draft.domain, 80) : '未选择（将使用默认域名）'}`,
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	if (!domains.length) {
		lines.push('', '⚠️ 暂时没有获取到可用短链域名，可以继续下一步使用后台默认域名，或稍后到 Shortly 后台检查域名配置。');
	}
	const domainRows = domains.map((domain, index) => {
		const selected = domain.host === draft.domain;
		return [button(`${selected ? '✅' : '🔗'} ${domain.host}`, cb.linkDomain(index))];
	});
	await show(
		ctx,
		lines.join('\n'),
		markup([...domainRows, [button('◀ 上一步', cb.linkBack), button(BTN.next, cb.linkNext)], [button(BTN.cancel, cb.linkCancel)]]),
	);
}

async function renderExpiryStep(ctx: BotContext, draft: Draft): Promise<void> {
	const expiryButtons = [
		button(optionLabel(draft.expiry === '0', '永久'), cb.linkExpiry(0)),
		...EXPIRY_OPTIONS.map((option, index) =>
			button(optionLabel(draft.expiry === String(index + 1), `${option.label}`), cb.linkExpiry(index + 1)),
		),
	];
	await show(
		ctx,
		[
			'<b>➕ 新建短链</b>',
			`第 4/${WIZARD_STEP_TOTAL} 步 · 有效期`,
			'',
			`当前：${escapeHtml(expiryLabel(draft.expiry))}`,
			'',
			'到期后短链会自动失效；选择「永久」则不会过期。',
		].join('\n'),
		markup([
			...chunkRows(expiryButtons, 3),
			[button('◀ 上一步', cb.linkBack), button(BTN.next, cb.linkNext)],
			[button(BTN.cancel, cb.linkCancel)],
		]),
	);
}

async function renderClicksStep(ctx: BotContext, draft: Draft, notice?: string): Promise<void> {
	const lines = [
		'<b>➕ 新建短链</b>',
		`第 5/${WIZARD_STEP_TOTAL} 步 · 点击上限`,
		'',
		`当前：${escapeHtml(clicksLabel(draft.clicks))}`,
		'',
		'达到点击上限后短链会自动失效；选择「不限」则不限制点击次数。',
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	const clickButtons = [
		button(optionLabel(draft.clicks === '0', '不限'), cb.linkClicks(0)),
		...CLICK_LIMIT_OPTIONS.map((value) => button(optionLabel(draft.clicks === String(value), `${value} 次`), cb.linkClicks(value))),
		button('✏️ 自定义', cb.linkClicks('custom')),
	];
	await show(
		ctx,
		lines.join('\n'),
		markup([
			...chunkRows(clickButtons, 3),
			[button('◀ 上一步', cb.linkBack), button(BTN.next, cb.linkNext)],
			[button(BTN.cancel, cb.linkCancel)],
		]),
	);
}

async function renderCustomSlugStep(ctx: BotContext, draft: Draft, notice?: string): Promise<void> {
	const lines = [
		'<b>✏️ 自定义短链标识</b>',
		'',
		'请直接发送要使用的标识：字母、数字、连字符或下划线，长度 1-50。',
		'例如：<code>my-link-2026</code>',
		'',
		`当前目标：${codeText(draft.target, 120)}`,
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	lines.push('', '<i>发送 /cancel 可以随时取消。</i>');
	await show(ctx, lines.join('\n'), markup([[button('◀ 返回', cb.linkBack), button(BTN.cancel, cb.linkCancel)]]));
}

async function renderCustomClicksStep(ctx: BotContext, draft: Draft, notice?: string): Promise<void> {
	const lines = [
		'<b>✏️ 自定义点击上限</b>',
		'',
		'请直接发送点击上限：1 到 1,000,000 之间的整数。',
		'例如：<code>500</code>',
		'',
		`当前：${escapeHtml(clicksLabel(draft.clicks))}`,
	];
	if (notice) lines.push('', `⚠️ ${escapeHtml(notice)}`);
	lines.push('', '<i>发送 /cancel 可以随时取消。</i>');
	await show(ctx, lines.join('\n'), markup([[button('◀ 返回', cb.linkBack), button(BTN.cancel, cb.linkCancel)]]));
}

async function renderConfirmStep(ctx: BotContext, draft: Draft): Promise<void> {
	const preview = draft.domain ? `${draft.domain}/${draft.slug}` : draft.slug;
	await show(
		ctx,
		[
			'<b>✅ 确认创建</b>',
			'',
			`目标：${codeText(draft.target, 300)}`,
			`短链：${codeText(preview || '—', 120)}`,
			`域名：${draft.domain ? codeText(draft.domain, 80) : '默认域名'}`,
			`有效期：${escapeHtml(expiryLabel(draft.expiry))}`,
			`点击上限：${escapeHtml(clicksLabel(draft.clicks))}`,
			`标识来源：${draft.slugMode === 'custom' ? '自定义' : '随机生成'}`,
			'',
			'确认无误后点「✅ 创建」。',
		].join('\n'),
		markup([[button(BTN.create, cb.linkCreate), button('✏️ 返回修改', cb.linkBack), button(BTN.cancel, cb.linkCancel)]]),
	);
}

async function renderCurrentStep(ctx: BotContext, session: SessionRecord, draft: Draft): Promise<void> {
	switch (session.step) {
		case 'target':
			await renderTargetStep(ctx);
			return;
		case 'slug':
			await renderSlugStep(ctx, draft);
			return;
		case 'domain':
			await renderDomainStep(ctx, draft, (await ctx.getDomains()).short);
			return;
		case 'expiry':
			await renderExpiryStep(ctx, draft);
			return;
		case 'clicks':
			await renderClicksStep(ctx, draft);
			return;
		case 'custom-slug':
			await renderCustomSlugStep(ctx, draft);
			return;
		case 'custom-clicks':
			await renderCustomClicksStep(ctx, draft);
			return;
		case 'confirm':
		case 'direct':
			await renderConfirmStep(ctx, draft);
			return;
		default:
			await renderExpired(ctx);
	}
}

async function renderTextFallback(ctx: BotContext): Promise<void> {
	await show(
		ctx,
		['<b>当前没有等待输入的步骤</b>', '', '向导可能已经被更新，请用下方按钮继续操作。'].join('\n'),
		markup([[button('➕ 新建短链', cb.linkNew)], [button('🔗 我的短链', cb.linkList(1)), button(BTN.home, cb.home)]]),
	);
}

// ---------------------------------------------------------------------------
// Wizard transitions
// ---------------------------------------------------------------------------

async function startWizard(ctx: BotContext, notice?: string): Promise<void> {
	const draft: Draft = {
		target: '',
		slug: randomSlug(),
		slugMode: 'random',
		domain: '',
		expiry: '0',
		clicks: '0',
	};
	stageDraft(ctx, draft, 'target', 'target');
	await renderTargetStep(ctx, notice);
	await persistDraft(ctx);
}

async function handleLinkNew(ctx: BotContext): Promise<void> {
	await startWizard(ctx);
}

async function handleLinkNext(ctx: BotContext): Promise<void> {
	const session = ctx.session;
	if (!isWizardSession(session) || !ADVANCEABLE_STEPS.has(session.step)) {
		await renderExpired(ctx);
		return;
	}

	const draft = readDraft(session);
	switch (session.step) {
		case 'slug': {
			if (!draft.slug) draft.slug = randomSlug();
			if (!draft.domain) {
				const domains = await ctx.getDomains();
				const settings = await ctx.store.getChatSettings(ctx.chat.id);
				draft.domain = resolveDefaultHost(domains.short, settings.defaultShortDomain);
			}
			const domains = await ctx.getDomains();
			stageDraft(ctx, draft, 'domain');
			await renderDomainStep(ctx, draft, domains.short);
			await persistDraft(ctx);
			return;
		}
		case 'domain': {
			stageDraft(ctx, draft, 'expiry');
			await renderExpiryStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'expiry': {
			stageDraft(ctx, draft, 'clicks');
			await renderClicksStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'clicks': {
			stageDraft(ctx, draft, 'confirm');
			await renderConfirmStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		default: {
			await renderExpired(ctx);
			return;
		}
	}
}

async function handleLinkRerand(ctx: BotContext): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;
	const { draft } = wizard;
	draft.slug = randomSlug();
	draft.slugMode = 'random';
	stageDraft(ctx, draft, 'slug');
	await renderSlugStep(ctx, draft);
	await persistDraft(ctx);
	await ctx.toast('已换一个新的随机标识');
}

async function handleLinkSlug(ctx: BotContext): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;
	stageDraft(ctx, wizard.draft, 'custom-slug', 'custom-slug');
	await renderCustomSlugStep(ctx, wizard.draft);
	await persistDraft(ctx);
}

async function handleLinkDomain(ctx: BotContext, action: CallbackAction): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;
	const domains = await ctx.getDomains();
	const index = parseIndexArg(action.args, 0);
	const selected = index === null ? undefined : domains.short[index];
	if (!selected) {
		await renderDomainStep(ctx, wizard.draft, domains.short);
		await ctx.toast('域名列表已更新，请重新选择');
		return;
	}
	wizard.draft.domain = selected.host;
	stageDraft(ctx, wizard.draft, 'domain');
	await renderDomainStep(ctx, wizard.draft, domains.short);
	await persistDraft(ctx);
	await ctx.toast(`已选择 ${selected.host}`);
}

async function handleLinkExpiry(ctx: BotContext, action: CallbackAction): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;
	const rawIndex = parseIndexArg(action.args, 0);
	const index = rawIndex === null ? 0 : rawIndex;
	if (index > EXPIRY_OPTIONS.length) {
		await renderExpiryStep(ctx, wizard.draft);
		await ctx.toast('有效期选项已更新，请重新选择');
		return;
	}
	wizard.draft.expiry = String(index);
	stageDraft(ctx, wizard.draft, 'expiry');
	await renderExpiryStep(ctx, wizard.draft);
	await persistDraft(ctx);
	await ctx.toast(`有效期：${expiryLabel(wizard.draft.expiry)}`);
}

async function handleLinkClicks(ctx: BotContext, action: CallbackAction): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;

	const raw = action.args[0];
	if (raw === 'custom') {
		stageDraft(ctx, wizard.draft, 'custom-clicks', 'custom-clicks');
		await renderCustomClicksStep(ctx, wizard.draft);
		await persistDraft(ctx);
		return;
	}

	const value = raw === undefined ? 0 : parseIndexArg(action.args, 0);
	if (value === null || value < 0 || value > MAX_CLICKS) {
		await renderClicksStep(ctx, wizard.draft, '这个点击上限无效，请重新选择。');
		return;
	}
	wizard.draft.clicks = String(value);
	stageDraft(ctx, wizard.draft, 'clicks');
	await renderClicksStep(ctx, wizard.draft);
	await persistDraft(ctx);
	await ctx.toast(value > 0 ? `点击上限：${value} 次` : '点击上限：不限');
}

async function handleLinkBack(ctx: BotContext): Promise<void> {
	const wizard = await requireWizard(ctx);
	if (!wizard) return;
	const { session, draft } = wizard;

	switch (session.step) {
		case 'confirm': {
			stageDraft(ctx, draft, 'clicks');
			await renderClicksStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'clicks': {
			stageDraft(ctx, draft, 'expiry');
			await renderExpiryStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'expiry': {
			const domains = await ctx.getDomains();
			stageDraft(ctx, draft, 'domain');
			await renderDomainStep(ctx, draft, domains.short);
			await persistDraft(ctx);
			return;
		}
		case 'domain': {
			stageDraft(ctx, draft, 'slug');
			await renderSlugStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'slug': {
			stageDraft(ctx, draft, 'target', 'target');
			await renderTargetStep(ctx);
			await persistDraft(ctx);
			return;
		}
		case 'custom-slug': {
			stageDraft(ctx, draft, 'slug');
			await renderSlugStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'custom-clicks': {
			stageDraft(ctx, draft, 'clicks');
			await renderClicksStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'direct': {
			stageDraft(ctx, draft, 'slug');
			await renderSlugStep(ctx, draft);
			await persistDraft(ctx);
			return;
		}
		case 'target': {
			await renderTargetStep(ctx);
			return;
		}
		default: {
			await renderExpired(ctx);
		}
	}
}

async function handleLinkCancel(ctx: BotContext): Promise<void> {
	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await ctx.toast('已取消创建');
	await renderHome(ctx);
}

async function handleLinkTextInput(ctx: BotContext, text: string, session: SessionRecord): Promise<void> {
	if (session.flow !== 'link:new') {
		await renderTextFallback(ctx);
		return;
	}
	const draft = readDraft(session);
	const mode = session.awaiting ?? session.step;

	if (mode === 'target') {
		const validation = validateTargetUrl(text);
		if (!validation.ok) {
			await renderTargetStep(ctx, validation.reason);
			return;
		}
		draft.target = validation.url;
		if (!draft.slug) {
			draft.slug = randomSlug();
			draft.slugMode = 'random';
		}
		if (!draft.domain) {
			// Resolve the default domain early so the slug step can show the full preview.
			const domains = await ctx.getDomains();
			const settings = await ctx.store.getChatSettings(ctx.chat.id);
			draft.domain = resolveDefaultHost(domains.short, settings.defaultShortDomain);
		}
		stageDraft(ctx, draft, 'slug');
		await renderSlugStep(ctx, draft);
		await persistDraft(ctx);
		return;
	}

	if (mode === 'custom-slug') {
		const slug = text.trim();
		if (!SLUG_PATTERN.test(slug)) {
			await renderCustomSlugStep(ctx, draft, '标识只能包含字母、数字、连字符和下划线，长度 1-50。');
			return;
		}
		draft.slug = slug;
		draft.slugMode = 'custom';
		stageDraft(ctx, draft, 'slug');
		await renderSlugStep(ctx, draft);
		await persistDraft(ctx);
		return;
	}

	if (mode === 'custom-clicks') {
		const digits = text.replace(/[\s,，]/g, '');
		const value = /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : Number.NaN;
		if (!Number.isFinite(value) || value < 1 || value > MAX_CLICKS) {
			await renderCustomClicksStep(ctx, draft, '请输入 1 到 1,000,000 之间的整数。');
			return;
		}
		draft.clicks = String(value);
		stageDraft(ctx, draft, 'clicks');
		await renderClicksStep(ctx, draft);
		await persistDraft(ctx);
		return;
	}

	await renderTextFallback(ctx);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function buildShortenInput(draft: Draft): ShortenInput | null {
	const url = draft.target.trim();
	if (!url) return null;
	const input: ShortenInput = { url };

	const slug = draft.slug.trim();
	if (slug) input.customSlug = slug;

	const domain = draft.domain.trim();
	if (domain) input.domain = domain;

	const expiryIndex = Number.parseInt(draft.expiry, 10);
	if (Number.isFinite(expiryIndex) && expiryIndex > 0) {
		const option = EXPIRY_OPTIONS[expiryIndex - 1];
		if (option) input.expiresIn = option.value;
	}

	const clicks = Number.parseInt(draft.clicks, 10);
	if (Number.isFinite(clicks) && clicks > 0 && clicks <= MAX_CLICKS) input.maxClicks = clicks;

	return input;
}

function isDuplicateSlugMessage(message: string): boolean {
	return /already taken|duplicate|占用/i.test(message);
}

function describeCreateFailure(error: ApiFailure): string {
	if (error.kind === 'bad_request') {
		if (isDuplicateSlugMessage(error.message)) return '这个短链标识已经被占用，换一个标识再试。';
		if (/invalid custom slug/i.test(error.message)) {
			return '自定义标识不合法：只能包含字母、数字、连字符和下划线，且不超过 50 个字符。';
		}
		if (/no enabled short-link domain/i.test(error.message)) return 'Shortly 后台没有启用可用的短链域名，请先到后台启用域名。';
		if (/rate limit/i.test(error.message)) return '创建太频繁了，请稍等一会儿再试。';
		return error.message || '请求参数有误，请返回修改后再试。';
	}
	if (error.kind === 'rate_limited') return '创建太频繁，被 Shortly 限流了，请稍等一会儿再重试。';
	if (error.kind === 'network') return '无法连接 Shortly API，请检查网络后重试。';
	if (error.kind === 'not_found') return '接口不存在，请确认 Shortly API 地址与版本配置。';
	if (error.kind === 'invalid_response') return 'Shortly API 返回格式异常，请稍后重试。';
	return 'Shortly 服务暂时异常，请稍后再试。';
}

async function renderCreateFailure(ctx: BotContext, error: ApiFailure, draft: Draft): Promise<void> {
	const reason = truncate(describeCreateFailure(error), 300);
	const keptHint = draft.target ? '草稿已保留，可以直接重试，或返回修改后再创建。' : '可以直接重试，或返回修改。';
	await show(
		ctx,
		['<b>⚠️ 创建失败</b>', '', escapeHtml(reason), '', keptHint].join('\n'),
		markup([[button(BTN.retry, cb.linkCreate), button('✏️ 修改', cb.linkBack)], [button(BTN.cancel, cb.linkCancel)]]),
	);
}

async function renderResult(ctx: BotContext, result: ShortenResult, draft: Draft): Promise<void> {
	const rawShortUrl = typeof result.shortUrl === 'string' ? result.shortUrl.trim() : '';
	const domain = (typeof result.domain === 'string' && result.domain) || draft.domain;
	const slug = (typeof result.slug === 'string' && result.slug) || draft.slug;
	const label = rawShortUrl ? rawShortUrl.replace(/^https?:\/\//i, '') : domain ? `${domain}/${slug}` : slug;
	const url = openUrl(rawShortUrl, label);
	const maxClicks = typeof result.maxClicks === 'number' ? result.maxClicks : null;
	const actionButtons = url ? [copyButton(BTN.copy, url), urlButton(BTN.open, url)] : [];

	await show(
		ctx,
		[
			'<b>✅ 短链创建成功</b>',
			'',
			`短链：${codeText(url || label || '—', 200)}`,
			`目标：${codeText(draft.target, 300)}`,
			`域名：${codeText(domain || '—', 80)}`,
			`有效期：${escapeHtml(expiryLabel(draft.expiry))}`,
			`点击上限：${escapeHtml(clicksLabel(maxClicks ?? draft.clicks))}`,
			'',
			'点「📋 复制」即可复制短链，也可以直接打开。',
		].join('\n'),
		markup([actionButtons, [button('➕ 再建一个', cb.linkNew), button('🔗 我的短链', cb.linkList(1))], [button(BTN.home, cb.home)]]),
	);
}

async function submitCreate(ctx: BotContext, draft: Draft): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	const input = buildShortenInput(draft);
	if (!input) {
		await renderTargetStep(ctx, '请先填写目标链接。');
		return;
	}

	if (ctx.chat.type === 'private') await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
	const result = await ctx.api.shorten(binding.apiKey, input);

	if (!result.ok) {
		if (result.error.kind === 'unauthorized') {
			await ctx.handleApiError(result.error);
			return;
		}
		// A generated slug collided with an existing link: roll a new one before retrying.
		if (isDuplicateSlugMessage(result.error.message) && draft.slugMode === 'random') {
			const currentStep: WizardStep = isWizardSession(ctx.session) ? (ctx.session.step as WizardStep) : 'confirm';
			draft.slug = randomSlug();
			stageDraft(ctx, draft, currentStep);
		}
		await renderCreateFailure(ctx, result.error, draft);
		await persistDraft(ctx);
		return;
	}

	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await renderResult(ctx, result.data, draft);
	await ctx.toast('短链创建成功');
}

async function handleLinkCreate(ctx: BotContext): Promise<void> {
	const session = ctx.session;
	if (!isWizardSession(session)) {
		await renderExpired(ctx);
		return;
	}
	const draft = readDraft(session);
	if (session.step !== 'confirm' && session.step !== 'direct') {
		await renderCurrentStep(ctx, session, draft);
		await ctx.toast('请先完成前面的步骤');
		return;
	}
	await submitCreate(ctx, draft);
}

// ---------------------------------------------------------------------------
// Command aliases
// ---------------------------------------------------------------------------

async function handleShortAlias(ctx: BotContext, args: string[]): Promise<void> {
	const rawUrl = args[0]?.trim() ?? '';
	if (!rawUrl) {
		await startWizard(ctx);
		return;
	}

	const validation = validateTargetUrl(rawUrl);
	if (!validation.ok) {
		await startWizard(ctx, validation.reason);
		return;
	}

	const domains = await ctx.getDomains();
	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const defaultHost = resolveDefaultHost(domains.short, settings.defaultShortDomain);

	let domain = defaultHost;
	const rawDomain = args[2]?.trim();
	if (rawDomain) {
		const matched = findDomain(domains.short, rawDomain);
		if (!matched) {
			const draft: Draft = {
				target: validation.url,
				slug: randomSlug(),
				slugMode: 'random',
				domain: defaultHost,
				expiry: '0',
				clicks: '0',
			};
			stageDraft(ctx, draft, 'domain');
			await renderDomainStep(ctx, draft, domains.short, `域名 ${rawDomain} 不在可用列表中，请重新选择。`);
			await persistDraft(ctx);
			return;
		}
		domain = matched.host;
	}

	const slug = args[1]?.trim() ?? '';
	if (slug && !SLUG_PATTERN.test(slug)) {
		const draft: Draft = {
			target: validation.url,
			slug: randomSlug(),
			slugMode: 'random',
			domain,
			expiry: '0',
			clicks: '0',
		};
		stageDraft(ctx, draft, 'slug');
		await renderSlugStep(ctx, draft, '自定义标识不合法：只能包含字母、数字、连字符和下划线，长度 1-50。');
		await persistDraft(ctx);
		return;
	}

	const draft: Draft = {
		target: validation.url,
		slug,
		slugMode: slug ? 'custom' : 'random',
		domain,
		expiry: '0',
		clicks: '0',
	};
	stageDraft(ctx, draft, 'direct');
	await persistDraft(ctx);
	await submitCreate(ctx, draft);
}

// ---------------------------------------------------------------------------
// List + detail
// ---------------------------------------------------------------------------

function listEntry(item: LinkItem, index: number): string {
	const clicks = Math.max(0, Number(item.clicks) || 0);
	const target = typeof item.originalUrl === 'string' ? item.originalUrl : '';
	return [
		`${index + 1}. ${codeText(shortLabel(item), 60)} · 点击 ${clicks} · ${statusLabel(item)}`,
		`　　${escapeAndTruncate(target, 70)}`,
	].join('\n');
}

async function renderList(ctx: BotContext, requestedPage: number): Promise<void> {
	const binding = await ctx.requireBinding();
	if (!binding) return;

	let page = Math.max(1, Math.min(requestedPage, 100000));
	const result = await ctx.api.listLinks(binding.apiKey, page, LIST_PAGE_SIZE);
	if (!result.ok) {
		await ctx.handleApiError(result.error, { retryCallback: cb.linkList(page) });
		return;
	}

	let data = result.data;
	// A stale pager (e.g. the last links were deleted) may point past the final page.
	if (Array.isArray(data.data) && data.data.length === 0 && data.totalPages > 0 && page > data.totalPages) {
		const fallback = await ctx.api.listLinks(binding.apiKey, data.totalPages, LIST_PAGE_SIZE);
		if (fallback.ok) data = fallback.data;
	}

	const items = (Array.isArray(data.data) ? data.data : []).filter(isLinkItem);
	const totalPages = Math.max(1, Number.isFinite(data.totalPages) ? data.totalPages : 1);
	page = Math.min(Math.max(1, Number.isFinite(data.page) ? data.page : page), totalPages);
	const total = Number.isFinite(data.total) ? data.total : items.length;

	await saveListCache(ctx, { page, total, totalPages, items, savedAt: Date.now() });

	if (total === 0) {
		await show(
			ctx,
			['<b>🔗 我的短链</b>', '', '还没有创建过短链。', '点下方按钮创建第一条，创建后可以在这里查看点击量与失效状态。'].join('\n'),
			markup([[button('➕ 立即创建', cb.linkNew)], [button(BTN.home, cb.home)]]),
		);
		return;
	}

	const detailButtons = items.map((item, index) => button(`详情 ${index + 1}`, cb.linkView(item.id)));
	const body = items.length ? items.map(listEntry) : ['这一页没有短链记录。'];
	const text = [`<b>🔗 我的短链</b>（第 ${page}/${totalPages} 页 · 共 ${total} 条）`, '', ...body].join('\n');

	await show(
		ctx,
		text,
		markup([
			...chunkRows(detailButtons, 5),
			pagerRow(page, totalPages, cb.linkList),
			[button('➕ 新建短链', cb.linkNew), button(BTN.home, cb.home)],
		]),
	);
}

async function renderDetail(ctx: BotContext, linkId: string): Promise<void> {
	const cache = await readListCache(ctx);
	const item = cache ? cache.items.find((entry) => entry.id === linkId) : undefined;
	if (!cache || !item) {
		await renderExpired(ctx, cache?.page ?? 1);
		return;
	}

	const label = shortLabel(item);
	const url = openUrl(item.shortUrl, label);
	const clicks = Math.max(0, Number(item.clicks) || 0);
	const hasLimit = item.hasClickLimit || (typeof item.maxClicks === 'number' && item.maxClicks > 0);
	const maxClicksText = hasLimit ? `${item.maxClicks ?? '—'} 次` : '不限';
	const createdAt = formatDateTime(item.createdAt) || '未知';
	const expiresAt =
		item.hasExpiration && item.expiresAt ? `${formatDateTime(item.expiresAt) || '未知'}${item.expiredByDate ? '（已过期）' : ''}` : '永久';

	const rows: Array<InlineKeyboardButton[] | null> = [];
	const actions = url ? [copyButton('📋 复制短链', url), urlButton(BTN.open, url)] : [];
	if (actions.length) rows.push(actions);
	rows.push([button('◀ 返回列表', cb.linkList(cache.page)), button(BTN.home, cb.home)]);

	await show(
		ctx,
		[
			`<b>🔗 ${escapeHtml(label)}</b>`,
			'',
			`目标：${codeText(typeof item.originalUrl === 'string' ? item.originalUrl : '', 300)}`,
			`状态：${statusLabel(item)}`,
			`点击：${clicks} 次`,
			`上限：${escapeHtml(maxClicksText)}`,
			`创建时间：${escapeHtml(createdAt)}`,
			`过期时间：${escapeHtml(expiresAt)}`,
		].join('\n'),
		markup(rows),
	);
}

// ---------------------------------------------------------------------------
// Module registration
// ---------------------------------------------------------------------------

export const linksModule: BotModule = {
	name: 'links',
	callbacks: {
		'link:new': handleLinkNew,
		'link:next': handleLinkNext,
		'link:list': async (ctx, action) => {
			await renderList(ctx, parsePageArg(action.args, 0));
		},
		'link:view': async (ctx, action) => {
			const linkId = action.args[0];
			if (!linkId) {
				await renderExpired(ctx);
				return;
			}
			await renderDetail(ctx, linkId);
		},
		'link:rerand': handleLinkRerand,
		'link:slug': handleLinkSlug,
		'link:domain': handleLinkDomain,
		'link:expiry': handleLinkExpiry,
		'link:clicks': handleLinkClicks,
		'link:create': handleLinkCreate,
		'link:cancel': handleLinkCancel,
		'link:back': handleLinkBack,
	},
	textInputs: {
		'link:new': handleLinkTextInput,
	},
	aliases: {
		short: handleShortAlias,
		links: async (ctx, args) => {
			await renderList(ctx, parsePageArg(args, 0));
		},
	},
};
