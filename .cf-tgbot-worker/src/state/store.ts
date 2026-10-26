/** KV-backed persistence: binding, wizard session, chat settings, caches, one-time tokens. */

import type { Bindings } from '../env';
import {
	EMAIL_DETAIL_TOKEN_TTL_SECONDS,
	RATE_LIMIT_MAX_ACTIONS,
	RATE_LIMIT_WINDOW_MS,
	SESSION_TTL_SECONDS,
	UPDATE_DEDUPE_TTL_MS,
} from '../env';
import { maskSecret } from '../telegram/format';
import type { DomainInfo } from '../api/types';

export type BindingRecord = {
	apiKey: string;
	chatId: number;
	username?: string;
	/** Telegram user id that performed the binding; used to authorise group-chat actions. */
	ownerUserId?: number;
	boundAt: number;
	keyHint: string;
};

export type FlowName = 'bind' | 'link:new' | 'mail:new' | 'mail:delete';

export type SessionRecord = {
	flow: FlowName;
	step: string;
	awaiting?: string;
	data: Record<string, string>;
	anchorMessageId?: number;
	updatedAt: number;
};

export type ChatSettings = {
	defaultShortDomain?: string;
	defaultEmailDomain?: string;
};

export type DomainCache = {
	short: DomainInfo[];
	email: DomainInfo[];
	fetchedAt: number;
};

export type EmailDetailTokenPayload = {
	chatId: number;
	emailId: string;
	createdAt: number;
};

export type BotStore = {
	getBinding(chatId: number): Promise<BindingRecord | null>;
	saveBinding(record: Omit<BindingRecord, 'keyHint'> & { keyHint?: string }): Promise<void>;
	clearBinding(chatId: number): Promise<void>;
	getSession(chatId: number): Promise<SessionRecord | null>;
	saveSession(chatId: number, session: SessionRecord): Promise<void>;
	clearSession(chatId: number): Promise<void>;
	getChatSettings(chatId: number): Promise<ChatSettings>;
	saveChatSettings(chatId: number, settings: ChatSettings): Promise<void>;
	isDuplicateUpdate(updateId: number): Promise<boolean>;
	takeRateLimitToken(chatId: number, now?: number): boolean;
	getDomainCache(): Promise<DomainCache | null>;
	saveDomainCache(value: DomainCache): Promise<void>;
	createEmailDetailToken(input: { chatId: number; emailId: string }): Promise<string>;
	consumeEmailDetailToken(token: string): Promise<EmailDetailTokenPayload | null>;
};

const KEY_BINDING = (chatId: number) => `b:${chatId}`;
const KEY_SESSION = (chatId: number) => `s:${chatId}`;
const KEY_SETTINGS = (chatId: number) => `cfg:${chatId}`;
const KEY_DOMAIN_CACHE = 'dom:v1';
const KEY_EMAIL_DETAIL_TOKEN = (token: string) => `edt:${token}`;
const KEY_UPDATE = (updateId: number) => `upd:${updateId}`;

const UPDATE_DEDUPE_MAX_ENTRIES = 200;
const RATE_LIMIT_MAX_CHATS = 500;

// Module-level (per-isolate) state: Workers isolates live long enough to absorb
// duplicate deliveries and bursts without spending KV write quota.
const seenUpdates = new Map<number, number>();
const rateWindows = new Map<number, number[]>();

export function resetBotMemory(): void {
	seenUpdates.clear();
	rateWindows.clear();
}

function pruneMap<K>(map: Map<K, number>, maxEntries: number): void {
	if (map.size <= maxEntries) return;
	const overflow = map.size - maxEntries;
	let removed = 0;
	for (const key of map.keys()) {
		map.delete(key);
		removed += 1;
		if (removed >= overflow) break;
	}
}

async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
	const raw = await kv.get(key);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		console.error(`Failed to parse KV value for ${key}:`, error);
		return null;
	}
}

function isValidEmailDetailPayload(value: unknown): value is EmailDetailTokenPayload {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Record<string, unknown>;
	return (
		Number.isFinite(payload.chatId) &&
		typeof payload.emailId === 'string' &&
		Boolean(payload.emailId.trim()) &&
		Number.isFinite(payload.createdAt)
	);
}

export function createStore(env: Bindings): BotStore {
	const kv = env.TGBOT_KV;

	return {
		async getBinding(chatId) {
			const record = await getJson<BindingRecord>(kv, KEY_BINDING(chatId));
			if (!record || typeof record.apiKey !== 'string' || !record.apiKey.trim()) return null;
			return record;
		},

		async saveBinding(record) {
			const value: BindingRecord = {
				...record,
				keyHint: record.keyHint?.trim() || maskSecret(record.apiKey),
			};
			await kv.put(KEY_BINDING(record.chatId), JSON.stringify(value));
		},

		async clearBinding(chatId) {
			await kv.delete(KEY_BINDING(chatId));
		},

		async getSession(chatId) {
			const record = await getJson<SessionRecord>(kv, KEY_SESSION(chatId));
			if (!record || typeof record.flow !== 'string' || typeof record.step !== 'string') return null;
			return record;
		},

		async saveSession(chatId, session) {
			await kv.put(KEY_SESSION(chatId), JSON.stringify({ ...session, updatedAt: Date.now() }), {
				expirationTtl: SESSION_TTL_SECONDS,
			});
		},

		async clearSession(chatId) {
			await kv.delete(KEY_SESSION(chatId));
		},

		async getChatSettings(chatId) {
			const record = await getJson<ChatSettings>(kv, KEY_SETTINGS(chatId));
			return record ?? {};
		},

		async saveChatSettings(chatId, settings) {
			await kv.put(KEY_SETTINGS(chatId), JSON.stringify(settings));
		},

		async isDuplicateUpdate(updateId) {
			const now = Date.now();
			const previous = seenUpdates.get(updateId);
			if (previous && now - previous < UPDATE_DEDUPE_TTL_MS) {
				return true;
			}

			for (const [id, seenAt] of seenUpdates) {
				if (now - seenAt >= UPDATE_DEDUPE_TTL_MS) seenUpdates.delete(id);
			}
			seenUpdates.set(updateId, now);
			pruneMap(seenUpdates, UPDATE_DEDUPE_MAX_ENTRIES);

			if ((env.STRICT_UPDATE_DEDUPE ?? '').trim().toLowerCase() === 'true') {
				const key = KEY_UPDATE(updateId);
				const existing = await kv.get(key);
				if (existing) return true;
				await kv.put(key, '1', { expirationTtl: 5 * 60 });
			}

			return false;
		},

		takeRateLimitToken(chatId, now = Date.now()) {
			const windowStart = now - RATE_LIMIT_WINDOW_MS;
			const hits = (rateWindows.get(chatId) ?? []).filter((timestamp) => timestamp > windowStart);
			if (hits.length >= RATE_LIMIT_MAX_ACTIONS) {
				rateWindows.set(chatId, hits);
				return false;
			}
			hits.push(now);
			rateWindows.set(chatId, hits);
			if (rateWindows.size > RATE_LIMIT_MAX_CHATS) {
				const oldest = rateWindows.keys().next();
				if (!oldest.done) rateWindows.delete(oldest.value);
			}
			return true;
		},

		async getDomainCache() {
			const cache = await getJson<DomainCache>(kv, KEY_DOMAIN_CACHE);
			if (!cache || !Array.isArray(cache.short) || !Array.isArray(cache.email) || !Number.isFinite(cache.fetchedAt)) {
				return null;
			}
			return cache;
		},

		async saveDomainCache(value) {
			await kv.put(KEY_DOMAIN_CACHE, JSON.stringify(value), { expirationTtl: 60 * 60 });
		},

		async createEmailDetailToken(input) {
			const bytes = new Uint8Array(24);
			crypto.getRandomValues(bytes);
			const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
			const payload: EmailDetailTokenPayload = { chatId: input.chatId, emailId: input.emailId, createdAt: Date.now() };
			await kv.put(KEY_EMAIL_DETAIL_TOKEN(token), JSON.stringify(payload), {
				expirationTtl: EMAIL_DETAIL_TOKEN_TTL_SECONDS,
			});
			return token;
		},

		async consumeEmailDetailToken(token) {
			if (!/^[a-f0-9]{48}$/.test(token)) return null;
			const key = KEY_EMAIL_DETAIL_TOKEN(token);
			const payload = await getJson<unknown>(kv, key);
			if (!payload) return null;
			// One-time use: delete before returning, even if the payload is malformed.
			await kv.delete(key);
			return isValidEmailDetailPayload(payload) ? payload : null;
		},
	};
}
