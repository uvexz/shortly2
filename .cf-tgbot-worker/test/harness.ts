/**
 * End-to-end simulation harness for the Shortly Telegram Bot Worker.
 *
 * The harness replaces the two external dependencies of the worker — Telegram Bot API and
 * Shortly `/v1` — with scriptable fakes, then drives the real Hono app through
 * `POST /webhook` exactly like Telegram would.
 *
 * Every harness owns an isolated KV namespace and restarts the worker's in-memory state
 * (update dedupe + rate limit), so one test never leaks into the next.
 */

import { expect } from 'bun:test';
import { createApp } from '../src/index';
import type { Bindings } from '../src/env';
import { maskSecret } from '../src/telegram/format';
import { resetBotMemory } from '../src/state/store';
import type { BindingRecord, ChatSettings, FlowName, SessionRecord } from '../src/state/store';
import type { DomainsResponse, LinkItem, MailboxItem, MailMessageItem, MessageDetail, Paginated } from '../src/api/types';
import type {
	InlineKeyboardButton,
	InlineKeyboardMarkup,
	ReplyKeyboardMarkup,
	TelegramChat,
	TelegramUpdate,
	TelegramUser,
} from '../src/telegram/types';

export const BOT_TOKEN = '123456:test-bot-token';
export const API_BASE_URL = 'https://shortly.test/v1';
export const ORIGIN = 'https://bot.test';
export const DEFAULT_API_KEY = 'sk_shortly_test_key_9f3a';

export const BOT_USER: TelegramUser = { id: 424242, is_bot: true, first_name: 'Shortly', username: 'shortly_test_bot' };

let requestSequence = 0;

function nextSequence(): number {
	requestSequence += 1;
	return requestSequence;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

function toHeadersRecord(input: HeadersInit | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	if (!input) return result;
	if (Array.isArray(input)) {
		for (const [key, value] of input) result[key.toLowerCase()] = value;
		return result;
	}
	const candidate = input as Headers;
	if (typeof candidate.forEach === 'function' && typeof candidate.get === 'function') {
		candidate.forEach((value, key) => {
			result[key.toLowerCase()] = value;
		});
		return result;
	}
	for (const [key, value] of Object.entries(input as Record<string, string>)) result[key.toLowerCase()] = value;
	return result;
}

function safeJsonParse(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return raw;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSpec(spec: string): { method: string; pattern: RegExp } {
	const [method, ...rest] = spec.trim().split(/\s+/);
	const path = rest.join(' ');
	const pattern = path
		.split('*')
		.map((part) => escapeRegExp(part))
		.join('[^/]+');
	return { method: method.toUpperCase(), pattern: new RegExp(`^${pattern}$`) };
}

function inlineKeyboardOf(markup: unknown): InlineKeyboardMarkup | null {
	if (!markup || typeof markup !== 'object') return null;
	const candidate = markup as InlineKeyboardMarkup;
	return Array.isArray(candidate.inline_keyboard) ? candidate : null;
}

function replyKeyboardOf(markup: unknown): ReplyKeyboardMarkup | null {
	if (!markup || typeof markup !== 'object') return null;
	const candidate = markup as ReplyKeyboardMarkup;
	return Array.isArray(candidate.keyboard) ? candidate : null;
}

function flattenButtons(keyboard: InlineKeyboardMarkup | null | undefined): InlineKeyboardButton[] {
	if (!keyboard) return [];
	return keyboard.inline_keyboard.flat();
}

// ---------------------------------------------------------------------------
// Fake KV namespace
// ---------------------------------------------------------------------------

export type FakeKvPutOptions = { expirationTtl?: number; expiration?: number; metadata?: unknown };

export type FakeKvEntry = {
	value: string;
	expiresAt: number | null;
	expirationTtl?: number;
	metadata?: unknown;
};

/** Minimal in-memory KVNamespace with real TTL bookkeeping (advance() moves the fake clock). */
export class FakeKV {
	private readonly data = new Map<string, FakeKvEntry>();
	private timeOffsetMs = 0;

	/** Moves the fake clock forward, which expires entries written with a TTL. */
	advance(ms: number): void {
		this.timeOffsetMs += ms;
	}

	get size(): number {
		return this.data.size;
	}

	async get(key: string, type?: string): Promise<unknown> {
		const entry = this.read(key);
		if (!entry) return null;
		if (type === 'json') {
			try {
				return JSON.parse(entry.value) as unknown;
			} catch {
				return null;
			}
		}
		return entry.value;
	}

	async put(key: string, value: unknown, options: FakeKvPutOptions = {}): Promise<void> {
		const text = typeof value === 'string' ? value : value instanceof ArrayBuffer ? new TextDecoder().decode(value) : String(value);
		const expiresAt =
			options.expirationTtl && options.expirationTtl > 0
				? this.now() + options.expirationTtl * 1000
				: options.expiration
					? options.expiration * 1000
					: null;
		this.data.set(key, { value: text, expiresAt, expirationTtl: options.expirationTtl, metadata: options.metadata });
	}

	async delete(key: string): Promise<void> {
		this.data.delete(key);
	}

	/** Test helper: writes without going through the worker. */
	seed(key: string, value: unknown, options: FakeKvPutOptions = {}): void {
		const text = typeof value === 'string' ? value : JSON.stringify(value);
		const expiresAt = options.expirationTtl ? this.now() + options.expirationTtl * 1000 : null;
		this.data.set(key, { value: text, expiresAt, expirationTtl: options.expirationTtl, metadata: options.metadata });
	}

	has(key: string): boolean {
		return this.read(key) !== null;
	}

	raw(key: string): string | null {
		return this.read(key)?.value ?? null;
	}

	json<T>(key: string): T | null {
		const raw = this.raw(key);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}

	keys(): string[] {
		return [...this.data.keys()].filter((key) => this.read(key) !== null);
	}

	entry(key: string): FakeKvEntry | null {
		return this.read(key);
	}

	clear(): void {
		this.data.clear();
	}

	/** The object the worker receives as `env.TGBOT_KV`. */
	asBinding(): KVNamespace {
		return this as unknown as KVNamespace;
	}

	private now(): number {
		return Date.now() + this.timeOffsetMs;
	}

	private read(key: string): FakeKvEntry | null {
		const entry = this.data.get(key);
		if (!entry) return null;
		if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
			this.data.delete(key);
			return null;
		}
		return entry;
	}
}

// ---------------------------------------------------------------------------
// Fake Telegram Bot API
// ---------------------------------------------------------------------------

export type FakeTelegramFailure = {
	status?: number;
	description?: string;
	retryAfter?: number;
};

export type TelegramCall = {
	seq: number;
	kind: 'telegram';
	telegramMethod: string;
	url: string;
	headers: Record<string, string>;
	payload: Record<string, any>;
	responseBody: any;
	status: number;
};

export class FakeTelegram {
	readonly calls: TelegramCall[] = [];
	private readonly queuedFailures = new Map<string, FakeTelegramFailure[]>();
	private messageId: number;

	constructor(options: { firstMessageId?: number } = {}) {
		this.messageId = options.firstMessageId ?? 900;
	}

	/** Queues a failure (HTTP status + Telegram envelope) for the next call of `method`. */
	failNext(method: string, failure: FakeTelegramFailure): this {
		return this.fail(method, failure, 1);
	}

	fail(method: string, failure: FakeTelegramFailure, times = 1): this {
		const queue = this.queuedFailures.get(method) ?? [];
		for (let index = 0; index < times; index += 1) queue.push(failure);
		this.queuedFailures.set(method, queue);
		return this;
	}

	async handle(method: string, payload: Record<string, any>, headers: Record<string, string>, url: string): Promise<Response> {
		const failure = this.queuedFailures.get(method)?.shift() ?? null;
		let status = 200;
		let responseBody: unknown;

		if (failure) {
			status = failure.status ?? 400;
			responseBody = {
				ok: false,
				description: failure.description ?? 'Bad Request',
				...(failure.retryAfter !== undefined ? { parameters: { retry_after: failure.retryAfter } } : {}),
			};
		} else {
			responseBody = { ok: true, result: this.defaultResult(method, payload) };
		}

		this.calls.push({
			seq: nextSequence(),
			kind: 'telegram',
			telegramMethod: method,
			url,
			headers,
			payload,
			responseBody,
			status,
		});

		return jsonResponse(responseBody, status);
	}

	callsOf(method: string): TelegramCall[] {
		return this.calls.filter((call) => call.telegramMethod === method);
	}

	lastCall(method?: string): TelegramCall | null {
		const pool = method ? this.callsOf(method) : this.calls;
		return pool.length ? pool[pool.length - 1] : null;
	}

	sentMessages(): TelegramCall[] {
		return this.callsOf('sendMessage');
	}

	editedMessages(): TelegramCall[] {
		return this.callsOf('editMessageText');
	}

	sentTexts(): string[] {
		return this.sentMessages().map((call) => String(call.payload.text ?? ''));
	}

	lastSentMessageId(): number | null {
		const call = this.lastCall('sendMessage');
		const id = call?.responseBody?.result?.message_id;
		return typeof id === 'number' ? id : null;
	}

	buttonsOf(call: TelegramCall | null = this.lastCall()): InlineKeyboardButton[] {
		if (!call) return [];
		return flattenButtons(inlineKeyboardOf(call.payload.reply_markup));
	}

	/** All visible texts (sent + edited) in order. */
	allTexts(): string[] {
		return [...this.sentTexts(), ...this.editedMessages().map((call) => String(call.payload.text ?? ''))];
	}

	clear(): void {
		this.calls.length = 0;
		this.queuedFailures.clear();
	}

	private defaultResult(method: string, payload: Record<string, any>): unknown {
		switch (method) {
			case 'sendMessage': {
				this.messageId += 1;
				return {
					message_id: this.messageId,
					date: Math.floor(Date.now() / 1000),
					chat: { id: payload.chat_id, type: 'private' },
					from: BOT_USER,
					text: payload.text,
				};
			}
			case 'editMessageText': {
				return {
					message_id: payload.message_id,
					date: Math.floor(Date.now() / 1000),
					chat: { id: payload.chat_id, type: 'private' },
					from: BOT_USER,
					text: payload.text,
				};
			}
			case 'getMe':
				return BOT_USER;
			default:
				return true;
		}
	}
}

// ---------------------------------------------------------------------------
// Fake Shortly /v1 API
// ---------------------------------------------------------------------------

export type ApiCall = {
	seq: number;
	kind: 'api';
	method: string;
	url: string;
	/** Path relative to API_BASE_URL, e.g. `/links`. Query is available via `query`. */
	path: string;
	query: URLSearchParams;
	headers: Record<string, string>;
	authorization: string | null;
	body: any;
};

export type FakeApiResponse = {
	status?: number;
	body?: unknown;
	rawBody?: string;
	headers?: Record<string, string>;
	/** Simulates a fetch-level failure (the client maps it to `kind: 'network'`). */
	networkError?: boolean;
};

export type FakeApiHandler = (call: ApiCall) => FakeApiResponse | Promise<FakeApiResponse>;

type ApiRoute = { method: string; pattern: RegExp; handler: FakeApiHandler };

type QueuedApiFailure = { method: string; pattern: RegExp; response: FakeApiResponse; remaining: number };

function buildApiResponse(response: FakeApiResponse): Response {
	const status = response.status ?? 200;
	const headers = { 'content-type': 'application/json', ...response.headers };
	if (response.rawBody !== undefined) return new Response(response.rawBody, { status, headers });
	const body = response.body ?? {};
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return new Response(text, { status, headers });
}

export class FakeApi {
	readonly calls: ApiCall[] = [];
	private readonly routes: ApiRoute[] = [];
	private readonly failures: QueuedApiFailure[] = [];

	constructor(options: { withDefaults?: boolean } = {}) {
		if (options.withDefaults !== false) this.registerDefaults();
	}

	/** Registers a route; `*` matches a single path segment. Later registrations win over earlier ones. */
	on(spec: string, handler: FakeApiHandler): this {
		const { method, pattern } = parseSpec(spec);
		this.routes.unshift({ method, pattern, handler });
		return this;
	}

	/** Injects a one-shot (or N-shot) failure for matching requests. Takes priority over routes. */
	failNext(spec: string, response: FakeApiResponse): this {
		return this.fail(spec, response, 1);
	}

	fail(spec: string, response: FakeApiResponse, times = 1): this {
		const { method, pattern } = parseSpec(spec);
		this.failures.push({ method, pattern, response, remaining: times });
		return this;
	}

	async handle(call: ApiCall): Promise<Response> {
		this.calls.push(call);

		for (const failure of this.failures) {
			if (failure.remaining > 0 && failure.method === call.method && failure.pattern.test(call.path)) {
				failure.remaining -= 1;
				if (failure.response.networkError) throw new TypeError('fetch failed (simulated)');
				return buildApiResponse(failure.response);
			}
		}

		for (const route of this.routes) {
			if (route.method === call.method && route.pattern.test(call.path)) {
				const response = await route.handler(call);
				if (response.networkError) throw new TypeError('fetch failed (simulated)');
				return buildApiResponse(response);
			}
		}

		return jsonResponse({ error: `no fake /v1 route for ${call.method} ${call.path}` }, 404);
	}

	/** Calls matching `GET /links` style specs; omit the spec to get every call. */
	callsTo(spec?: string): ApiCall[] {
		if (!spec) return [...this.calls];
		const { method, pattern } = parseSpec(spec);
		return this.calls.filter((call) => call.method === method && pattern.test(call.path));
	}

	lastCall(spec?: string): ApiCall | null {
		const pool = this.callsTo(spec);
		return pool.length ? pool[pool.length - 1] : null;
	}

	called(spec: string): boolean {
		return this.callsTo(spec).length > 0;
	}

	reset(): void {
		this.calls.length = 0;
		this.failures.length = 0;
	}

	private registerDefaults(): void {
		this.on('GET /domains', () => ({ body: defaultDomains() }));
		this.on('POST /integrations/telegram/bind', () => ({ body: { success: true, data: {} } }));
		this.on('POST /shorten', (call) => {
			const slug = typeof call.body?.customSlug === 'string' && call.body.customSlug ? call.body.customSlug : 'abc123';
			const domain = typeof call.body?.domain === 'string' && call.body.domain ? call.body.domain : 'short.ly';
			return {
				status: 201,
				body: { shortUrl: `https://${domain}/${slug}`, slug, domain, maxClicks: call.body?.maxClicks ?? null },
			};
		});
		this.on('GET /links', () => ({ body: paginated([]) }));
		this.on('GET /emails', () => ({ body: paginated([]) }));
		this.on('POST /emails', (call) => ({
			status: 201,
			body: { data: mailboxItem({ emailAddress: String(call.body?.emailAddress ?? 'demo-user123@mail.short.ly') }) },
		}));
		this.on('GET /emails/messages/*', () => ({ body: { data: messageDetail() } }));
		this.on('POST /emails/messages/*/read', () => ({ body: { success: true } }));
		this.on('DELETE /emails/messages/*', () => ({ body: { success: true } }));
		this.on('GET /emails/*/messages', (call) => {
			const mailboxId = call.path.split('/')[2] ?? 'mailbox-id';
			return {
				body: { ...paginated([]), mailbox: { id: mailboxId, emailAddress: 'demo-user123@mail.short.ly' } },
			};
		});
		this.on('DELETE /emails/*', () => ({ body: { success: true } }));
	}
}

// ---------------------------------------------------------------------------
// Fake fetch router
// ---------------------------------------------------------------------------

export type FakeFetchOptions = {
	apiBaseUrl: string;
	telegram: FakeTelegram;
	api: FakeApi;
};

/** Routes Telegram Bot API and Shortly /v1 calls to the fakes; records everything. */
export function createFakeFetch(options: FakeFetchOptions): typeof fetch {
	const apiBase = new URL(options.apiBaseUrl);
	const apiBasePath = apiBase.pathname.replace(/\/+$/, '');

	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
		const headers = toHeadersRecord(init?.headers);
		const rawBody = typeof init?.body === 'string' ? init.body : null;
		const body = rawBody === null ? null : safeJsonParse(rawBody);

		if (url.startsWith('https://api.telegram.org/bot')) {
			const telegramMethod = url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
			return options.telegram.handle(telegramMethod, (body ?? {}) as Record<string, any>, headers, url);
		}

		if (url.startsWith(options.apiBaseUrl)) {
			const parsed = new URL(url);
			const path = parsed.pathname.startsWith(apiBasePath) ? parsed.pathname.slice(apiBasePath.length) || '/' : parsed.pathname;
			const call: ApiCall = {
				seq: nextSequence(),
				kind: 'api',
				method,
				url,
				path,
				query: parsed.searchParams,
				headers,
				authorization: headers.authorization ?? null,
				body,
			};
			return options.api.handle(call);
		}

		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	};

	return fetchImpl as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

export function defaultDomains(): DomainsResponse {
	return {
		shortDomains: [
			{ host: 'short.ly', isDefault: true, minSlugLength: 3 },
			{ host: 'go.short.ly', isDefault: false },
		],
		emailDomains: [
			{ host: 'mail.short.ly', isDefault: true, minLocalPartLength: 3 },
			{ host: 'inbox.short.ly', isDefault: false },
		],
		telegramBotUsername: 'shortly_test_bot',
	};
}

export function paginated<T>(data: T[], overrides: Partial<Paginated<T>> = {}): Paginated<T> {
	return {
		data,
		total: data.length,
		page: 1,
		limit: 5,
		totalPages: data.length ? Math.ceil(data.length / (overrides.limit ?? 5)) : 0,
		...overrides,
	};
}

export function linkItem(overrides: Partial<LinkItem> = {}): LinkItem {
	const slug = overrides.slug ?? 'abc123';
	const domain = overrides.domain ?? 'short.ly';
	return {
		id: '11111111-1111-4111-8111-111111111111',
		slug,
		domain,
		shortUrl: `https://${domain}/${slug}`,
		originalUrl: 'https://example.com/very/long/path?with=query',
		clicks: 12,
		maxClicks: null,
		expiresAt: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		hasClickLimit: false,
		hasExpiration: false,
		isExpired: false,
		expiredByClicks: false,
		expiredByDate: false,
		...overrides,
	};
}

export function mailboxItem(overrides: Partial<MailboxItem> = {}): MailboxItem {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		emailAddress: 'demo-user123@mail.short.ly',
		domain: 'mail.short.ly',
		createdAt: '2026-01-01T00:00:00.000Z',
		unreadCount: 1,
		messageCount: 2,
		...overrides,
	};
}

export function mailMessage(overrides: Partial<MailMessageItem> = {}): MailMessageItem {
	return {
		id: 'message-1',
		messageId: '<message-1@example.com>',
		from: 'alice@example.com',
		fromName: 'Alice',
		subject: 'Hello Shortly',
		text: 'Hello from the test harness',
		html: null,
		receivedAt: '2026-01-02T03:04:05.000Z',
		isRead: false,
		hasAttachments: false,
		...overrides,
	};
}

export function messageDetail(overrides: Partial<MessageDetail> = {}): MessageDetail {
	return {
		id: 'message-1',
		mailboxId: '22222222-2222-4222-8222-222222222222',
		mailboxEmailAddress: 'demo-user123@mail.short.ly',
		messageId: '<message-1@example.com>',
		from: 'alice@example.com',
		fromName: 'Alice',
		subject: 'Hello Shortly',
		text: 'Hello from the test harness',
		html: null,
		receivedAt: '2026-01-02T03:04:05.000Z',
		isRead: false,
		cc: [],
		replyTo: [],
		headers: [],
		attachments: [],
		hasText: true,
		hasHtml: false,
		hasAttachments: false,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export type CreateEnvOptions = {
	kv?: FakeKV;
	overrides?: Partial<Bindings>;
};

export function createEnv(options: CreateEnvOptions = {}): Bindings {
	const kv = options.kv ?? new FakeKV();
	return {
		TELEGRAM_BOT_TOKEN: BOT_TOKEN,
		API_BASE_URL,
		DEFAULT_SHORT_DOMAIN: 'short.ly',
		DEFAULT_EMAIL_DOMAIN: 'mail.short.ly',
		...options.overrides,
		TGBOT_KV: kv.asBinding(),
	};
}

export type HarnessOptions = {
	env?: Partial<Bindings>;
	chatId?: number;
	/** Telegram user id of the simulated actor (defaults to the chat id). */
	userId?: number;
	firstName?: string;
	username?: string;
	chatType?: TelegramChat['type'];
};

export type Screen = {
	kind: 'send' | 'edit';
	messageId: number | null;
	text: string;
	keyboard: InlineKeyboardMarkup | null;
	replyKeyboard: ReplyKeyboardMarkup | null;
	call: TelegramCall;
};

export type ClickOptions = {
	/** Message that carries the inline keyboard (defaults to the last bot message). */
	sourceMessageId?: number;
	/** Pass `null` to omit the webhook secret header. */
	secret?: string | null;
};

let harnessCounter = 0;

export class Harness {
	readonly env: Bindings;
	readonly kv: FakeKV;
	readonly telegram: FakeTelegram;
	readonly api: FakeApi;
	readonly app: ReturnType<typeof createApp>;
	readonly chatId: number;
	readonly user: TelegramUser;
	readonly chat: TelegramChat;
	readonly origin = ORIGIN;

	private nextUpdateId = 5000;
	private nextUserMessageId = 100;
	private lastUserMessageIdValue: number | null = null;
	private lastBotMessageId: number | null = null;
	private readonly fetchImpl: typeof fetch;

	constructor(options: HarnessOptions = {}) {
		resetBotMemory();
		harnessCounter += 1;

		this.kv = new FakeKV();
		this.env = createEnv({ kv: this.kv, overrides: options.env });
		this.chatId = options.chatId ?? 700000 + harnessCounter;
		this.chat = { id: this.chatId, type: options.chatType ?? 'private', username: options.username ?? 'tester' };
		this.user = {
			id: options.userId ?? this.chatId,
			is_bot: false,
			first_name: options.firstName ?? 'Tester',
			username: options.username ?? 'tester',
		};

		this.telegram = new FakeTelegram();
		this.api = new FakeApi();
		this.fetchImpl = createFakeFetch({ apiBaseUrl: this.env.API_BASE_URL, telegram: this.telegram, api: this.api });
		this.app = createApp({ fetchImpl: this.fetchImpl });
	}

	/** Sends an arbitrary HTTP request to the worker (`/`, `/webhook`, `/email-detail/:token`). */
	async request(path: string, init: RequestInit = {}): Promise<Response> {
		return this.withGlobalFetch(() => this.app.fetch(new Request(`${this.origin}${path}`, init), this.env));
	}

	async get(path: string): Promise<Response> {
		return this.request(path, { method: 'GET' });
	}

	/** Simulates a private-chat text message from the test user. */
	async sendText(text: string): Promise<Response> {
		this.nextUserMessageId += 1;
		this.lastUserMessageIdValue = this.nextUserMessageId;
		const update: TelegramUpdate = {
			update_id: this.nextUpdateId++,
			message: {
				message_id: this.nextUserMessageId,
				date: Math.floor(Date.now() / 1000),
				chat: this.chat,
				from: this.user,
				text,
			},
		};
		return this.sendUpdate(update);
	}

	/** Simulates `/command arg1 arg2`. */
	async sendCommand(command: string, ...args: string[]): Promise<Response> {
		const normalized = command.startsWith('/') ? command : `/${command}`;
		return this.sendText([normalized, ...args].join(' '));
	}

	/** Simulates tapping an inline button. */
	async click(data: string, options: ClickOptions = {}): Promise<Response> {
		const update: TelegramUpdate = {
			update_id: this.nextUpdateId++,
			callback_query: {
				id: `callback-${this.nextUpdateId}`,
				from: this.user,
				message: {
					message_id: options.sourceMessageId ?? this.lastBotMessageId ?? 1,
					date: Math.floor(Date.now() / 1000),
					chat: this.chat,
					from: BOT_USER,
					text: '',
				},
				data,
			},
		};
		return this.sendUpdate(update, { secret: options.secret });
	}

	/** Finds a button on the current screen (by callback_data exact/prefix or label) and taps it. */
	async clickButton(matcher: string | RegExp, options: ClickOptions = {}): Promise<Response> {
		const button = this.findButton(matcher);
		if (!button) {
			throw new Error(`Button not found: ${String(matcher)}. Current buttons: ${formatButtons(this.buttons())}`);
		}
		if (!button.callback_data) {
			throw new Error(`Button "${button.text}" has no callback_data (url/copy button)`);
		}
		return this.click(button.callback_data, options);
	}

	async sendUpdate(update: TelegramUpdate, options: { secret?: string | null } = {}): Promise<Response> {
		const callsBefore = this.telegram.calls.length;
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		const secret = options.secret === undefined ? this.env.TELEGRAM_WEBHOOK_SECRET : options.secret;
		if (secret) headers['x-telegram-bot-api-secret-token'] = secret;

		const response = await this.request('/webhook', { method: 'POST', headers, body: JSON.stringify(update) });
		this.trackBotMessage(callsBefore);
		return response;
	}

	/** Last successful `sendMessage` / `editMessageText` screen. */
	lastScreen(): Screen | null {
		const screens = this.screens();
		return screens.length ? screens[screens.length - 1] : null;
	}

	screens(): Screen[] {
		const result: Screen[] = [];
		for (const call of this.telegram.calls) {
			// Failed Bot API calls never produced a visible screen.
			if (call.status !== 200) continue;
			if (call.telegramMethod === 'sendMessage') {
				result.push({
					kind: 'send',
					messageId: typeof call.responseBody?.result?.message_id === 'number' ? call.responseBody.result.message_id : null,
					text: String(call.payload.text ?? ''),
					keyboard: inlineKeyboardOf(call.payload.reply_markup),
					replyKeyboard: replyKeyboardOf(call.payload.reply_markup),
					call,
				});
			} else if (call.telegramMethod === 'editMessageText') {
				result.push({
					kind: 'edit',
					messageId: typeof call.payload.message_id === 'number' ? call.payload.message_id : null,
					text: String(call.payload.text ?? ''),
					keyboard: inlineKeyboardOf(call.payload.reply_markup),
					replyKeyboard: null,
					call,
				});
			}
		}
		return result;
	}

	lastText(): string {
		return this.lastScreen()?.text ?? '';
	}

	lastKeyboard(): InlineKeyboardMarkup | null {
		return this.lastScreen()?.keyboard ?? null;
	}

	buttons(screen: Screen | null = this.lastScreen()): InlineKeyboardButton[] {
		return flattenButtons(screen?.keyboard);
	}

	callbackData(screen: Screen | null = this.lastScreen()): string[] {
		return this.buttons(screen)
			.map((button) => button.callback_data)
			.filter((value): value is string => typeof value === 'string');
	}

	findButton(matcher: string | RegExp, screen: Screen | null = this.lastScreen()): InlineKeyboardButton | null {
		for (const button of this.buttons(screen)) {
			const data = button.callback_data;
			if (typeof matcher === 'string') {
				if (data === matcher || button.text === matcher) return button;
				if (data?.startsWith(matcher)) return button;
			} else {
				if (matcher.test(button.text)) return button;
				if (data && matcher.test(data)) return button;
			}
		}
		return null;
	}

	hasButton(matcher: string | RegExp, screen: Screen | null = this.lastScreen()): boolean {
		return this.findButton(matcher, screen) !== null;
	}

	/** Last `answerCallbackQuery` (toast) issued by the worker. */
	lastAnswer(): { text?: string; showAlert?: boolean } | null {
		const call = this.telegram.lastCall('answerCallbackQuery');
		if (!call) return null;
		return { text: call.payload.text, showAlert: call.payload.show_alert };
	}

	/** Text of the most recent non-empty callback toast (the dispatcher also sends empty acks). */
	lastAnswerText(): string | null {
		const answers = this.telegram.callsOf('answerCallbackQuery');
		for (let index = answers.length - 1; index >= 0; index -= 1) {
			const text = answers[index].payload.text;
			if (typeof text === 'string' && text.length > 0) return text;
		}
		return null;
	}

	/** Message id of the last text message sent by the simulated user (useful for delete-assertions). */
	get lastUserMessageId(): number | null {
		return this.lastUserMessageIdValue;
	}

	deletedMessageIds(): number[] {
		return this.telegram.callsOf('deleteMessage').map((call) => Number(call.payload.message_id));
	}

	/** Switches the simulated Telegram user (for group-chat permission tests). */
	actAs(userId: number, username?: string): TelegramUser {
		this.user.id = userId;
		if (username !== undefined) this.user.username = username;
		return this.user;
	}

	/** Reads the binding the worker persisted for its chat. */
	binding(): BindingRecord | null {
		return this.kv.json<BindingRecord>(`b:${this.chatId}`);
	}

	session(): SessionRecord | null {
		return this.kv.json<SessionRecord>(`s:${this.chatId}`);
	}

	chatSettings(): ChatSettings | null {
		return this.kv.json<ChatSettings>(`cfg:${this.chatId}`);
	}

	seedBinding(overrides: Partial<BindingRecord> = {}): BindingRecord {
		const apiKey = overrides.apiKey ?? DEFAULT_API_KEY;
		const record: BindingRecord = {
			apiKey,
			chatId: this.chatId,
			username: this.user.username,
			boundAt: Date.now(),
			keyHint: maskSecret(apiKey),
			...overrides,
		};
		this.kv.seed(`b:${this.chatId}`, record);
		return record;
	}

	seedSession(session: Partial<SessionRecord> & { flow: FlowName; step: string }): SessionRecord {
		const record: SessionRecord = {
			data: {},
			updatedAt: Date.now(),
			...session,
		};
		this.kv.seed(`s:${this.chatId}`, record);
		return record;
	}

	seedChatSettings(settings: ChatSettings): ChatSettings {
		this.kv.seed(`cfg:${this.chatId}`, settings);
		return settings;
	}

	/** Mutates the runtime env between updates (e.g. to test secret changes). */
	setEnv(overrides: Partial<Bindings>): void {
		Object.assign(this.env, overrides);
	}

	resetMemory(): void {
		resetBotMemory();
	}

	/** Runs `fn` with the fake fetch installed as the global `fetch` (needed by route code without DI). */
	async withGlobalFetch<T>(fn: () => T | Promise<T>): Promise<T> {
		const original = globalThis.fetch;
		globalThis.fetch = this.fetchImpl;
		try {
			return await fn();
		} finally {
			globalThis.fetch = original;
		}
	}

	private trackBotMessage(callsBefore: number): void {
		for (const call of this.telegram.calls.slice(callsBefore)) {
			if (call.telegramMethod === 'sendMessage' && typeof call.responseBody?.result?.message_id === 'number') {
				this.lastBotMessageId = call.responseBody.result.message_id;
			} else if (call.telegramMethod === 'editMessageText' || call.telegramMethod === 'editMessageReplyMarkup') {
				if (typeof call.payload.message_id === 'number') this.lastBotMessageId = call.payload.message_id;
			}
		}
	}
}

export function createHarness(options: HarnessOptions = {}): Harness {
	return new Harness(options);
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function formatButtons(buttons: InlineKeyboardButton[]): string {
	if (!buttons.length) return '(none)';
	return buttons.map((button) => `"${button.text}"[${button.callback_data ?? button.url ?? 'copy'}]`).join(', ');
}

/** Asserts that the keyboard contains a button whose callback_data/label matches `expected`. */
export function expectKeyboardContains(keyboard: InlineKeyboardMarkup | null | undefined, expected: string | RegExp): void {
	const buttons = flattenButtons(keyboard);
	const matched = buttons.some((button) => {
		if (typeof expected === 'string') {
			return button.callback_data === expected || button.text === expected || button.callback_data?.startsWith(expected);
		}
		return expected.test(button.text) || (button.callback_data ? expected.test(button.callback_data) : false);
	});
	if (!matched) {
		throw new Error(`Keyboard does not contain ${String(expected)}. Buttons: ${formatButtons(buttons)}`);
	}
	expect(matched).toBe(true);
}

/** Asserts that at least one /v1 request matching `spec` was made; returns the calls. */
export function expectApiCalled(api: FakeApi, spec: string): ApiCall[] {
	const calls = api.callsTo(spec);
	if (!calls.length) {
		throw new Error(`Expected /v1 call ${spec}, got: ${api.calls.map((call) => `${call.method} ${call.path}`).join(', ') || '(none)'}`);
	}
	return calls;
}

/** Asserts that no /v1 request matching `spec` (or any request when omitted) was made. */
export function expectApiNotCalled(api: FakeApi, spec?: string): void {
	const calls = spec ? api.callsTo(spec) : api.calls;
	if (calls.length) {
		throw new Error(`Expected no /v1 call${spec ? ` ${spec}` : ''}, got: ${calls.map((call) => `${call.method} ${call.path}`).join(', ')}`);
	}
}
