/** Cloudflare Worker bindings + runtime config helpers. */

export type Bindings = {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_WEBHOOK_SECRET?: string;
	API_BASE_URL: string;
	TGBOT_KV: KVNamespace;
	DEFAULT_SHORT_DOMAIN?: string;
	DEFAULT_EMAIL_DOMAIN?: string;
	DOMAIN_CACHE_TTL_SECONDS?: string;
	STRICT_UPDATE_DEDUPE?: string;
};

/** Session (wizard draft) TTL: 30 minutes, refreshed on every save. */
export const SESSION_TTL_SECONDS = 30 * 60;

/** One-time email detail page token TTL: 10 minutes. */
export const EMAIL_DETAIL_TOKEN_TTL_SECONDS = 10 * 60;

/** Domain list cache TTL, in seconds. */
export const DEFAULT_DOMAIN_CACHE_TTL_SECONDS = 10 * 60;

/** Update-id dedupe TTL (in-memory + optional KV). */
export const UPDATE_DEDUPE_TTL_MS = 10 * 60 * 1000;

/** Callback/message throttle: at most N actions per chat per window. */
export const RATE_LIMIT_MAX_ACTIONS = 20;
export const RATE_LIMIT_WINDOW_MS = 10 * 1000;

/** Telegram hard limit for a single message body. Keep a safety margin. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Telegram limits: callback_data is 1..64 bytes; copy_text.text is 1..256 chars. */
export const MAX_CALLBACK_DATA_BYTES = 64;
export const MAX_COPY_TEXT_LENGTH = 256;

function splitList(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type RuntimeConfig = {
	apiBaseUrl: string;
	webhookSecret: string;
	domainCacheTtlSeconds: number;
	strictUpdateDedupe: boolean;
	fallbackShortDomains: string[];
	fallbackEmailDomains: string[];
};

export function getRuntimeConfig(env: Bindings): RuntimeConfig {
	return {
		apiBaseUrl: (env.API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
		webhookSecret: (env.TELEGRAM_WEBHOOK_SECRET ?? '').trim(),
		domainCacheTtlSeconds: parsePositiveInt(env.DOMAIN_CACHE_TTL_SECONDS, DEFAULT_DOMAIN_CACHE_TTL_SECONDS),
		strictUpdateDedupe: (env.STRICT_UPDATE_DEDUPE ?? '').trim().toLowerCase() === 'true',
		fallbackShortDomains: splitList(env.DEFAULT_SHORT_DOMAIN ?? 'short.ly'),
		fallbackEmailDomains: splitList(env.DEFAULT_EMAIL_DOMAIN ?? 'mail.short.ly'),
	};
}
