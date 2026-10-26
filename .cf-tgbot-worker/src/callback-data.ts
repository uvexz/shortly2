/**
 * Callback data is the single source of truth for button actions.
 * Telegram limits callback_data to 64 bytes, so keep the schema compact.
 */

export type CallbackKind =
	| 'nav:home'
	| 'nav:help'
	| 'bind:start'
	| 'bind:cancel'
	| 'link:new'
	| 'link:next'
	| 'link:list'
	| 'link:view'
	| 'link:rerand'
	| 'link:slug'
	| 'link:domain'
	| 'link:expiry'
	| 'link:clicks'
	| 'link:create'
	| 'link:cancel'
	| 'link:back'
	| 'mail:new'
	| 'mail:next'
	| 'mail:list'
	| 'mail:view'
	| 'mail:msgs'
	| 'mail:rerand'
	| 'mail:prefix'
	| 'mail:domain'
	| 'mail:create'
	| 'mail:cancel'
	| 'mail:back'
	| 'mail:del'
	| 'mail:delok'
	| 'msg:view'
	| 'msg:read'
	| 'msg:del'
	| 'msg:delok'
	| 'msg:detail'
	| 'msg:back'
	| 'set:show'
	| 'set:short-domain'
	| 'set:email-domain'
	| 'set:bind'
	| 'set:unbind'
	| 'set:unbindok'
	| 'acct:show'
	| 'help:show'
	| 'noop'
	| 'legacy:email-read'
	| 'legacy:email-delete'
	| 'legacy:email-detail';

export type CallbackAction = {
	kind: CallbackKind;
	/** Positional arguments parsed after the kind prefix. */
	args: string[];
};

const CALLBACK_KINDS: CallbackKind[] = [
	'nav:home',
	'nav:help',
	'bind:start',
	'bind:cancel',
	'link:new',
	'link:next',
	'link:list',
	'link:view',
	'link:rerand',
	'link:slug',
	'link:domain',
	'link:expiry',
	'link:clicks',
	'link:create',
	'link:cancel',
	'link:back',
	'mail:new',
	'mail:next',
	'mail:list',
	'mail:view',
	'mail:msgs',
	'mail:rerand',
	'mail:prefix',
	'mail:domain',
	'mail:create',
	'mail:cancel',
	'mail:back',
	'mail:del',
	'mail:delok',
	'msg:view',
	'msg:read',
	'msg:del',
	'msg:delok',
	'msg:detail',
	'msg:back',
	'set:show',
	'set:short-domain',
	'set:email-domain',
	'set:bind',
	'set:unbind',
	'set:unbindok',
	'acct:show',
	'help:show',
	'noop',
	'legacy:email-read',
	'legacy:email-delete',
	'legacy:email-detail',
];

// Longest first, so `link:clicks:custom` resolves to `link:clicks` + args, never a shorter prefix.
const SORTED_KINDS = [...CALLBACK_KINDS].sort((a, b) => b.length - a.length);

/** Kinds that never touch the Shortly API, therefore never require a bound API key. */
const PUBLIC_CALLBACK_KINDS = new Set<CallbackKind>(['nav:home', 'nav:help', 'bind:start', 'bind:cancel', 'help:show', 'noop']);

export function requiresBinding(kind: CallbackKind): boolean {
	return !PUBLIC_CALLBACK_KINDS.has(kind);
}

export function isCallbackKind(value: string): value is CallbackKind {
	return (CALLBACK_KINDS as string[]).includes(value);
}

const LEGACY_EMAIL_ACTIONS: Record<string, CallbackKind> = {
	read: 'legacy:email-read',
	delete: 'legacy:email-delete',
	detail: 'legacy:email-detail',
};

/**
 * Parses callback data produced by this worker *or* by the Shortly app's
 * inbound-email notification (`email:read|delete|detail:<messageId>`).
 * Returns null for anything unknown or malformed.
 */
export function parseCallbackData(data: string | undefined): CallbackAction | null {
	if (!data) return null;
	if (new TextEncoder().encode(data).length > 64) return null;

	// Backwards compatibility with notifications sent by src/lib/telegram.ts.
	if (data.startsWith('email:')) {
		const [, action, ...rest] = data.split(':');
		const kind = LEGACY_EMAIL_ACTIONS[action ?? ''];
		const id = rest.join(':').trim();
		if (!kind || !id) return null;
		return { kind, args: [id] };
	}

	const kind = SORTED_KINDS.find((candidate) => data === candidate || data.startsWith(`${candidate}:`));
	if (!kind) return null;

	if (data === kind) return { kind, args: [] };

	const args = data
		.slice(kind.length + 1)
		.split(':')
		.filter((part) => part.length > 0);

	return { kind, args };
}

function withIndex(prefix: string, index?: number | string): string {
	return index === undefined ? prefix : `${prefix}:${index}`;
}

/** Typed callback-data builders. Screens must use these instead of raw strings. */
export const cb = {
	home: 'nav:home',
	help: 'nav:help',
	bindStart: 'bind:start',
	bindCancel: 'bind:cancel',

	linkNew: 'link:new',
	linkNext: 'link:next',
	linkList: (page = 1) => `link:list:${page}`,
	linkView: (linkId: string) => `link:view:${linkId}`,
	linkRerand: 'link:rerand',
	linkSlug: 'link:slug',
	linkDomain: (index?: number) => withIndex('link:domain', index),
	linkExpiry: (index?: number) => withIndex('link:expiry', index),
	linkClicks: (value?: number | 'custom') => withIndex('link:clicks', value),
	linkCreate: 'link:create',
	linkCancel: 'link:cancel',
	linkBack: 'link:back',

	mailNew: 'mail:new',
	mailNext: 'mail:next',
	mailList: (page = 1) => `mail:list:${page}`,
	mailView: (mailboxId: string) => `mail:view:${mailboxId}`,
	mailMsgs: (mailboxId: string, page = 1) => `mail:msgs:${mailboxId}:${page}`,
	mailRerand: 'mail:rerand',
	mailPrefix: 'mail:prefix',
	mailDomain: (index?: number) => withIndex('mail:domain', index),
	mailCreate: 'mail:create',
	mailCancel: 'mail:cancel',
	mailBack: 'mail:back',
	mailDel: (mailboxId: string) => `mail:del:${mailboxId}`,
	mailDelOk: (mailboxId: string) => `mail:delok:${mailboxId}`,

	msgView: (messageId: string) => `msg:view:${messageId}`,
	msgRead: (messageId: string) => `msg:read:${messageId}`,
	msgDel: (messageId: string) => `msg:del:${messageId}`,
	msgDelOk: (messageId: string) => `msg:delok:${messageId}`,
	msgDetail: (messageId: string) => `msg:detail:${messageId}`,
	msgBack: (mailboxId: string, page = 1) => `msg:back:${mailboxId}:${page}`,

	setShow: 'set:show',
	setShortDomain: (index?: number) => withIndex('set:short-domain', index),
	setEmailDomain: (index?: number) => withIndex('set:email-domain', index),
	setBind: 'set:bind',
	setUnbind: 'set:unbind',
	setUnbindOk: 'set:unbindok',
	acctShow: 'acct:show',
	noop: 'noop',
} as const;

/** Parses a positive integer argument, clamped to [min, max]. */
export function parseIndexArg(args: string[], position: number): number | null {
	const raw = args[position];
	if (raw === undefined) return null;
	if (!/^\d+$/.test(raw)) return null;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : null;
}

export function parsePageArg(args: string[], position: number, fallback = 1): number {
	const value = parseIndexArg(args, position);
	if (value === null || value < 1) return fallback;
	return Math.min(value, 100000);
}
