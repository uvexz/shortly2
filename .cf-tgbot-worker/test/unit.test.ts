/**
 * Unit tests for the worker's pure modules: callback-data parsing, formatting, KV store,
 * domain resolution, runtime config, the Telegram client and the Shortly /v1 client.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { cb, parseCallbackData, parseIndexArg, parsePageArg, requiresBinding } from '../src/callback-data';
import { getRuntimeConfig } from '../src/env';
import type { Bindings } from '../src/env';
import { createShortlyApi } from '../src/api/client';
import { findDomain, pickDefaultDomain, resolveDefaultHost, resolveDomains } from '../src/api/domains';
import { createTelegramClient } from '../src/telegram/client';
import { resetBotMemory, createStore } from '../src/state/store';
import {
	escapeAndTruncate,
	escapeHtml,
	formatBytes,
	formatDateTime,
	escapeHtmlAttribute,
	maskSecret,
	normalizeUrlInput,
	plural,
	stripHtml,
	truncate,
} from '../src/telegram/format';
import { generateRandomEmailPrefix } from '../src/random-email-prefix';
import { API_BASE_URL, BOT_TOKEN, BOT_USER, FakeApi, FakeKV, FakeTelegram, createEnv, createFakeFetch } from './harness';

const TEST_KEY = 'testkeyunit000000000001';

function fakeBackends() {
	const kv = new FakeKV();
	const env = createEnv({ kv });
	const telegram = new FakeTelegram();
	const api = new FakeApi();
	const fetchImpl = createFakeFetch({ apiBaseUrl: env.API_BASE_URL, telegram, api });
	return { kv, env, telegram, api, fetchImpl };
}

beforeEach(() => {
	resetBotMemory();
});

describe('callback data', () => {
	it('parses simple and parameterised callbacks', () => {
		expect(parseCallbackData('nav:home')).toEqual({ kind: 'nav:home', args: [] });
		expect(parseCallbackData('link:list:2')).toEqual({ kind: 'link:list', args: ['2'] });
		expect(parseCallbackData('link:clicks:custom')).toEqual({ kind: 'link:clicks', args: ['custom'] });
		expect(parseCallbackData('mail:msgs:mailbox-1:3')).toEqual({ kind: 'mail:msgs', args: ['mailbox-1', '3'] });
		expect(parseCallbackData('msg:back:mailbox-1:2')).toEqual({ kind: 'msg:back', args: ['mailbox-1', '2'] });
		expect(parseCallbackData(cb.linkView('11111111-1111-4111-8111-111111111111'))).toEqual({
			kind: 'link:view',
			args: ['11111111-1111-4111-8111-111111111111'],
		});
	});

	it('resolves legacy notification callbacks', () => {
		expect(parseCallbackData('email:read:message-1')).toEqual({ kind: 'legacy:email-read', args: ['message-1'] });
		expect(parseCallbackData('email:delete:message-1')).toEqual({ kind: 'legacy:email-delete', args: ['message-1'] });
		expect(parseCallbackData('email:detail:message-1')).toEqual({ kind: 'legacy:email-detail', args: ['message-1'] });
		expect(parseCallbackData('email:read:a:b')).toEqual({ kind: 'legacy:email-read', args: ['a:b'] });
	});

	it('rejects unknown, malformed and oversized callback data', () => {
		expect(parseCallbackData(undefined)).toBeNull();
		expect(parseCallbackData('')).toBeNull();
		expect(parseCallbackData('unknown:thing')).toBeNull();
		expect(parseCallbackData('email:unknown:id')).toBeNull();
		expect(parseCallbackData('email:read:')).toBeNull();
		expect(parseCallbackData(`link:view:${'x'.repeat(60)}`)).toBeNull();
	});

	it('keeps every builder within Telegram 64-byte callback_data limit', () => {
		const uuid = '11111111-1111-4111-8111-111111111111';
		const values = [
			cb.home,
			cb.help,
			cb.bindStart,
			cb.bindCancel,
			cb.linkNew,
			cb.linkNext,
			cb.linkList(12),
			cb.linkView(uuid),
			cb.linkRerand,
			cb.linkSlug,
			cb.linkDomain(3),
			cb.linkExpiry(7),
			cb.linkClicks('custom'),
			cb.linkClicks(1000),
			cb.linkCreate,
			cb.linkCancel,
			cb.linkBack,
			cb.mailNew,
			cb.mailNext,
			cb.mailList(2),
			cb.mailView(uuid),
			cb.mailMsgs(uuid, 12),
			cb.mailRerand,
			cb.mailPrefix,
			cb.mailDomain(0),
			cb.mailCreate,
			cb.mailCancel,
			cb.mailBack,
			cb.mailDel(uuid),
			cb.mailDelOk(uuid),
			cb.msgView(uuid),
			cb.msgRead(uuid),
			cb.msgDel(uuid),
			cb.msgDelOk(uuid),
			cb.msgDetail(uuid),
			cb.msgBack(uuid, 5),
			cb.setShow,
			cb.setShortDomain(1),
			cb.setEmailDomain(1),
			cb.setBind,
			cb.setUnbind,
			cb.setUnbindOk,
			cb.acctShow,
			cb.noop,
		];
		for (const value of values) {
			expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(64);
			expect(parseCallbackData(value)).not.toBeNull();
		}
	});

	it('classifies which callbacks require a binding', () => {
		expect(requiresBinding('nav:home')).toBe(false);
		expect(requiresBinding('bind:start')).toBe(false);
		expect(requiresBinding('help:show')).toBe(false);
		// The account screen exposes the key fingerprint, so it is not public.
		expect(requiresBinding('acct:show')).toBe(true);
		expect(requiresBinding('noop')).toBe(false);
		expect(requiresBinding('link:list')).toBe(true);
		expect(requiresBinding('link:next')).toBe(true);
		expect(requiresBinding('mail:new')).toBe(true);
		expect(requiresBinding('mail:next')).toBe(true);
		expect(requiresBinding('msg:view')).toBe(true);
		expect(requiresBinding('set:show')).toBe(true);
		expect(requiresBinding('legacy:email-read')).toBe(true);
	});

	it('parses numeric arguments defensively', () => {
		expect(parseIndexArg(['2'], 0)).toBe(2);
		expect(parseIndexArg(['abc'], 0)).toBeNull();
		expect(parseIndexArg([], 0)).toBeNull();
		expect(parsePageArg(['0'], 0)).toBe(1);
		expect(parsePageArg(['3'], 0)).toBe(3);
		expect(parsePageArg(['999999'], 0)).toBe(100000);
	});
});

describe('format helpers', () => {
	it('escapes HTML for Telegram parse_mode=HTML', () => {
		expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
		expect(escapeHtmlAttribute("it's <b>")).toBe('it&#39;s &lt;b&gt;');
	});

	it('truncates without splitting entities', () => {
		expect(truncate('abcdef', 4)).toBe('abc…');
		expect(truncate('abc', 10)).toBe('abc');
		expect(truncate('abc', 0)).toBe('');
		expect(escapeAndTruncate('<b>', 10)).toBe('&lt;b&gt;');
	});

	it('strips HTML and preformatted text', () => {
		expect(stripHtml('<style>p{}</style><p>Hi&nbsp;<b>there</b></p><script>x()</script>')).toBe('Hi there');
		expect(stripHtml(null)).toBe('');
	});

	it('formats timestamps in Beijing time', () => {
		expect(formatDateTime('2026-01-02T03:04:05.000Z')).toBe('2026-01-02 11:04');
		expect(formatDateTime(null)).toBe('');
		expect(formatDateTime(new Date('2026-06-01T16:00:00.000Z'))).toBe('2026-06-02 00:00');
	});

	it('formats byte sizes and masks secrets', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(1048576)).toBe('1.0 MB');
		expect(formatBytes(-1)).toBe('');
		expect(maskSecret('tiny')).toBe('ti…');
		expect(maskSecret(TEST_KEY)).toBe('test…0001');
		expect(maskSecret('')).toBe('');
	});

	it('pluralises and normalises URL input', () => {
		expect(plural(1, 'link')).toBe('link');
		expect(plural(2, 'link')).toBe('links');
		expect(normalizeUrlInput('example.com/path')).toBe('https://example.com/path');
		expect(normalizeUrlInput('https://example.com')).toBe('https://example.com');
		expect(normalizeUrlInput('t.me/shortly')).toBe('https://t.me/shortly');
		expect(normalizeUrlInput('')).toBe('');
	});
});

describe('runtime config', () => {
	it('trims and defaults every field', () => {
		const config = getRuntimeConfig({
			API_BASE_URL: 'https://shortly.test/v1/',
			TELEGRAM_BOT_TOKEN: '',
			TGBOT_KV: new FakeKV().asBinding(),
		});
		expect(config.apiBaseUrl).toBe('https://shortly.test/v1');
		expect(config.webhookSecret).toBe('');
		expect(config.domainCacheTtlSeconds).toBe(600);
		expect(config.strictUpdateDedupe).toBe(false);
		expect(config.fallbackShortDomains).toEqual(['short.ly']);
		expect(config.fallbackEmailDomains).toEqual(['mail.short.ly']);
	});

	it('honours optional overrides', () => {
		const config = getRuntimeConfig({
			API_BASE_URL: 'https://shortly.test/v1',
			TELEGRAM_BOT_TOKEN: 'token',
			TGBOT_KV: new FakeKV().asBinding(),
			TELEGRAM_WEBHOOK_SECRET: ' secret ',
			DOMAIN_CACHE_TTL_SECONDS: '120',
			STRICT_UPDATE_DEDUPE: 'TRUE',
			DEFAULT_SHORT_DOMAIN: 'a.test, b.test',
			DEFAULT_EMAIL_DOMAIN: 'mail.test',
		});
		expect(config.webhookSecret).toBe('secret');
		expect(config.domainCacheTtlSeconds).toBe(120);
		expect(config.strictUpdateDedupe).toBe(true);
		expect(config.fallbackShortDomains).toEqual(['a.test', 'b.test']);
		expect(config.fallbackEmailDomains).toEqual(['mail.test']);
	});

	it('falls back for malformed numeric values', () => {
		const config = getRuntimeConfig({
			API_BASE_URL: 'https://shortly.test/v1',
			TELEGRAM_BOT_TOKEN: '',
			TGBOT_KV: new FakeKV().asBinding(),
			DOMAIN_CACHE_TTL_SECONDS: 'not-a-number',
		});
		expect(config.domainCacheTtlSeconds).toBe(600);
	});
});

describe('Shortly /v1 client', () => {
	it('calls endpoints with the expected URLs, auth headers and bodies', async () => {
		const { env, api, fetchImpl } = fakeBackends();
		const client = createShortlyApi(env, fetchImpl);

		expect((await client.getDomains()).ok).toBe(true);
		expect((await client.listLinks(TEST_KEY, 2)).ok).toBe(true);
		expect((await client.listMailboxes(TEST_KEY, 3)).ok).toBe(true);
		expect((await client.createMailbox(TEST_KEY, 'hello@mail.short.ly')).ok).toBe(true);
		expect(
			(
				await client.shorten(TEST_KEY, {
					url: 'https://example.com',
					customSlug: 'custom',
					domain: 'short.ly',
					expiresIn: '1d',
					maxClicks: 100,
				})
			).ok,
		).toBe(true);
		expect((await client.listMessages(TEST_KEY, 'mailbox-1', 2)).ok).toBe(true);
		expect((await client.getMessage(TEST_KEY, 'message-1')).ok).toBe(true);
		expect((await client.markMessageRead(TEST_KEY, 'message-1')).ok).toBe(true);
		expect((await client.deleteMessage(TEST_KEY, 'message-1')).ok).toBe(true);
		expect((await client.deleteMailbox(TEST_KEY, 'mailbox-1')).ok).toBe(true);
		expect((await client.bindTelegram(TEST_KEY, '42', 'tester')).ok).toBe(true);

		expect(api.lastCall('GET /domains')?.path).toBe('/domains');

		const linksCall = api.lastCall('GET /links');
		expect(linksCall?.query.get('page')).toBe('2');
		expect(linksCall?.query.get('limit')).toBe('5');
		expect(linksCall?.authorization).toBe(`Bearer ${TEST_KEY}`);

		const shortenCall = api.lastCall('POST /shorten');
		expect(shortenCall?.body).toEqual({
			url: 'https://example.com',
			customSlug: 'custom',
			domain: 'short.ly',
			expiresIn: '1d',
			maxClicks: 100,
		});
		expect(shortenCall?.headers['content-type']).toBe('application/json');

		expect(api.lastCall('DELETE /emails/*')?.path).toBe('/emails/mailbox-1');
		expect(api.lastCall('GET /emails/*/messages')?.path).toBe('/emails/mailbox-1/messages');
		expect(api.lastCall('GET /emails/messages/*')?.path).toBe('/emails/messages/message-1');
		expect(api.lastCall('POST /emails/messages/*/read')?.path).toBe('/emails/messages/message-1/read');
		expect(api.lastCall('POST /integrations/telegram/bind')?.body).toEqual({ chatId: '42', username: 'tester' });
	});

	it('maps HTTP failures to ApiFailure kinds', async () => {
		const { env, api, fetchImpl } = fakeBackends();
		const client = createShortlyApi(env, fetchImpl);

		api.failNext('GET /links', { status: 401, body: { error: 'Invalid API key' } });
		const unauthorized = await client.listLinks(TEST_KEY, 1);
		expect(unauthorized).toEqual({
			ok: false,
			error: { status: 401, kind: 'unauthorized', message: 'Invalid API key' },
		});

		api.failNext('GET /links', { status: 404, body: { error: 'Not found' } });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'not_found' } });

		api.failNext('POST /shorten', { status: 409, body: { error: 'Slug taken' } });
		expect(await client.shorten(TEST_KEY, { url: 'https://example.com' })).toMatchObject({
			ok: false,
			error: { kind: 'bad_request', message: 'Slug taken' },
		});

		api.failNext('GET /links', { status: 429, body: { error: 'Slow down' } });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'rate_limited' } });

		api.failNext('GET /links', { status: 503, body: { error: 'Down' } });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'server' } });

		api.failNext('GET /links', { networkError: true });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'network' } });

		api.failNext('GET /links', { rawBody: 'not json at all' });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });

		api.failNext('GET /links', { rawBody: 'null' });
		expect(await client.listLinks(TEST_KEY, 1)).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
	});

	it('reads plain-text error bodies as the failure message', async () => {
		const { env, api, fetchImpl } = fakeBackends();
		const client = createShortlyApi(env, fetchImpl);
		api.failNext('GET /links', { status: 500, rawBody: 'upstream exploded', headers: { 'content-type': 'text/plain' } });
		const result = await client.listLinks(TEST_KEY, 1);
		expect(result).toMatchObject({ ok: false, error: { status: 500, kind: 'server', message: 'upstream exploded' } });
	});

	it('reports a network failure when API_BASE_URL is missing', async () => {
		const kv = new FakeKV();
		const env = createEnv({ kv, overrides: { API_BASE_URL: '' } });
		const client = createShortlyApi(env, (() => Promise.reject(new Error('should not fetch'))) as unknown as typeof fetch);
		const result = await client.getDomains();
		expect(result).toMatchObject({ ok: false, error: { kind: 'network' } });
	});
});

describe('Telegram client', () => {
	it('sends well-formed Bot API payloads', async () => {
		const { env, telegram, fetchImpl } = fakeBackends();
		const client = createTelegramClient(env, fetchImpl);

		const sent = await client.sendMessage({
			chatId: 42,
			text: 'hello',
			keyboard: { inline_keyboard: [[{ text: 'x', callback_data: 'noop' }]] },
		});
		expect(sent?.message_id).toBeGreaterThan(0);

		const sendCall = telegram.lastCall('sendMessage');
		expect(sendCall?.url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
		expect(sendCall?.payload).toMatchObject({
			chat_id: 42,
			text: 'hello',
			parse_mode: 'HTML',
			disable_web_page_preview: true,
			reply_markup: { inline_keyboard: [[{ text: 'x', callback_data: 'noop' }]] },
		});

		expect(await client.editMessageText({ chatId: 42, messageId: 7, text: 'edited' })).toBe('ok');
		expect(telegram.lastCall('editMessageText')?.payload).toMatchObject({
			chat_id: 42,
			message_id: 7,
			text: 'edited',
			reply_markup: { inline_keyboard: [] },
		});

		await client.answerCallbackQuery({ callbackQueryId: 'cb-1', text: 'done', showAlert: true });
		expect(telegram.lastCall('answerCallbackQuery')?.payload).toEqual({
			callback_query_id: 'cb-1',
			text: 'done',
			show_alert: true,
		});

		expect(await client.deleteMessage(42, 7)).toBe(true);
		await client.sendChatAction(42);
		expect(telegram.lastCall('sendChatAction')?.payload).toEqual({ chat_id: 42, action: 'typing' });
		expect(await client.getMe()).toEqual(BOT_USER);
	});

	it('treats "message is not modified" as unchanged and not-found as failed', async () => {
		const { env, telegram, fetchImpl } = fakeBackends();
		const client = createTelegramClient(env, fetchImpl);

		telegram.failNext('editMessageText', { status: 400, description: 'Bad Request: message is not modified' });
		expect(await client.editMessageText({ chatId: 1, messageId: 2, text: 'same' })).toBe('unchanged');

		telegram.failNext('editMessageText', { status: 400, description: 'Bad Request: message to edit not found' });
		expect(await client.editMessageText({ chatId: 1, messageId: 2, text: 'gone' })).toBe('failed');
	});

	it('retries a 429 once using retry_after, then gives up', async () => {
		const { env, telegram, fetchImpl } = fakeBackends();
		const client = createTelegramClient(env, fetchImpl);

		telegram.failNext('sendMessage', { status: 429, description: 'Too Many Requests: retry after 0', retryAfter: 0 });
		const sent = await client.sendMessage({ chatId: 1, text: 'retry' });
		expect(sent).not.toBeNull();
		expect(telegram.callsOf('sendMessage')).toHaveLength(2);

		telegram.fail('sendMessage', { status: 429, description: 'Too Many Requests', retryAfter: 0 }, 2);
		expect(await client.sendMessage({ chatId: 1, text: 'give up' })).toBeNull();
		expect(telegram.callsOf('sendMessage')).toHaveLength(4);
	});

	it('never calls fetch when the bot token is missing', async () => {
		const kv = new FakeKV();
		const env = createEnv({ kv, overrides: { TELEGRAM_BOT_TOKEN: '' } });
		const telegram = new FakeTelegram();
		const api = new FakeApi();
		const fetchImpl = createFakeFetch({ apiBaseUrl: env.API_BASE_URL, telegram, api });
		const client = createTelegramClient(env, fetchImpl);
		expect(await client.sendMessage({ chatId: 1, text: 'hi' })).toBeNull();
		expect(telegram.calls).toHaveLength(0);
	});
});

describe('KV store', () => {
	it('persists bindings with a derived key hint and no TTL', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		await store.saveBinding({ apiKey: TEST_KEY, chatId: 7, username: 'tester', boundAt: 123 });
		const binding = await store.getBinding(7);
		expect(binding).toMatchObject({ apiKey: TEST_KEY, chatId: 7, username: 'tester', boundAt: 123 });
		expect(binding?.keyHint).toBe(maskSecret(TEST_KEY));
		expect(kv.entry('b:7')?.expirationTtl).toBeUndefined();

		await store.clearBinding(7);
		expect(await store.getBinding(7)).toBeNull();
	});

	it('persists sessions with a 30-minute TTL and refreshes settings', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		await store.saveSession(7, { flow: 'link:new', step: 'target', data: { target: 'https://example.com' }, updatedAt: 1 });
		expect(kv.entry('s:7')?.expirationTtl).toBe(30 * 60);
		expect((await store.getSession(7))?.flow).toBe('link:new');

		await store.saveChatSettings(7, { defaultShortDomain: 'go.short.ly', defaultEmailDomain: 'inbox.short.ly' });
		expect(await store.getChatSettings(7)).toEqual({
			defaultShortDomain: 'go.short.ly',
			defaultEmailDomain: 'inbox.short.ly',
		});

		await store.clearSession(7);
		expect(await store.getSession(7)).toBeNull();
	});

	it('survives malformed KV values', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		kv.seed('b:9', 'not-json');
		expect(await store.getBinding(9)).toBeNull();

		kv.seed('b:9', JSON.stringify({ chatId: 9 }));
		expect(await store.getBinding(9)).toBeNull();

		kv.seed('s:9', JSON.stringify({ flow: 'bind' }));
		expect(await store.getSession(9)).toBeNull();
	});

	it('dedupes update ids in memory and in KV strict mode', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		expect(await store.isDuplicateUpdate(555)).toBe(false);
		expect(await store.isDuplicateUpdate(555)).toBe(true);
		expect(kv.has('upd:555')).toBe(false);

		resetBotMemory();
		const strictEnv = { ...env, STRICT_UPDATE_DEDUPE: 'true' } as Bindings;
		const strictStore = createStore(strictEnv);
		expect(await strictStore.isDuplicateUpdate(556)).toBe(false);
		expect(kv.raw('upd:556')).toBe('1');

		// Simulate a cold isolate: in-memory state is gone, KV still dedupes.
		resetBotMemory();
		expect(await strictStore.isDuplicateUpdate(556)).toBe(true);
	});

	it('throttles callbacks per chat', async () => {
		const { env } = fakeBackends();
		const store = createStore(env);

		for (let index = 0; index < 20; index += 1) {
			expect(store.takeRateLimitToken(1)).toBe(true);
		}
		expect(store.takeRateLimitToken(1)).toBe(false);
		expect(store.takeRateLimitToken(2)).toBe(true);
	});

	it('caches domain lists for an hour', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		await store.saveDomainCache({ short: [{ host: 'short.ly', isDefault: true }], email: [], fetchedAt: 42 });
		expect(kv.entry('dom:v1')?.expirationTtl).toBe(60 * 60);
		expect((await store.getDomainCache())?.fetchedAt).toBe(42);
	});

	it('issues single-use email detail tokens', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		const token = await store.createEmailDetailToken({ chatId: 7, emailId: 'message-1' });
		expect(token).toMatch(/^[a-f0-9]{48}$/);
		expect(kv.entry(`edt:${token}`)?.expirationTtl).toBe(10 * 60);

		expect(await store.consumeEmailDetailToken(token)).toMatchObject({ chatId: 7, emailId: 'message-1' });
		expect(await store.consumeEmailDetailToken(token)).toBeNull();
		expect(kv.has(`edt:${token}`)).toBe(false);
	});

	it('rejects malformed email detail tokens and payloads', async () => {
		const { kv, env } = fakeBackends();
		const store = createStore(env);

		expect(await store.consumeEmailDetailToken('not-hex')).toBeNull();

		const token = 'a'.repeat(48);
		kv.seed(`edt:${token}`, JSON.stringify({ chatId: 'nope', emailId: 42 }));
		expect(await store.consumeEmailDetailToken(token)).toBeNull();
		expect(kv.has(`edt:${token}`)).toBe(false);
	});
});

describe('domain resolution', () => {
	it('normalises /v1/domains responses (defaults first, deduped) and caches them', async () => {
		const { kv, env, api, fetchImpl } = fakeBackends();
		const store = createStore(env);
		const client = createShortlyApi(env, fetchImpl);

		const domains = await resolveDomains(client, store, env);
		expect(domains.short.map((domain) => domain.host)).toEqual(['short.ly', 'go.short.ly']);
		expect(domains.email.map((domain) => domain.host)).toEqual(['mail.short.ly', 'inbox.short.ly']);
		expect(domains.short[0].isDefault).toBe(true);
		expect(kv.json<{ fetchedAt: number }>('dom:v1')?.fetchedAt).toBeGreaterThan(0);

		// Second resolution is served from the KV cache: no extra /v1 call.
		const callsBefore = api.callsTo('GET /domains').length;
		await resolveDomains(client, store, env);
		expect(api.callsTo('GET /domains').length).toBe(callsBefore);
	});

	it('uses env fallbacks when /v1/domains fails', async () => {
		const { env, api, fetchImpl } = fakeBackends();
		const store = createStore(env);
		const client = createShortlyApi(env, fetchImpl);
		api.fail('GET /domains', { status: 500, body: { error: 'boom' } });

		const domains = await resolveDomains(client, store, {
			...env,
			DEFAULT_SHORT_DOMAIN: 'https://A.test, a.test',
			DEFAULT_EMAIL_DOMAIN: 'mail.test',
		} as Bindings);
		expect(domains.short.map((domain) => domain.host)).toEqual(['a.test']);
		expect(domains.email.map((domain) => domain.host)).toEqual(['mail.test']);
	});

	it('falls back to a stale cache before env defaults', async () => {
		const { kv, env, api, fetchImpl } = fakeBackends();
		const store = createStore(env);
		const client = createShortlyApi(env, fetchImpl);
		kv.seed(
			'dom:v1',
			JSON.stringify({
				short: [{ host: 'stale.test', isDefault: true }],
				email: [{ host: 'mail.stale.test', isDefault: true }],
				fetchedAt: 0,
			}),
		);
		api.fail('GET /domains', { networkError: true });

		const domains = await resolveDomains(client, store, env);
		expect(domains.short[0].host).toBe('stale.test');
		expect(domains.email[0].host).toBe('mail.stale.test');
	});

	it('picks defaults across helpers', () => {
		const domains = [
			{ host: 'short.ly', isDefault: false },
			{ host: 'go.short.ly', isDefault: true },
		];
		expect(pickDefaultDomain(domains)?.host).toBe('go.short.ly');
		expect(pickDefaultDomain([])).toBeNull();
		expect(findDomain(domains, 'HTTPS://GO.SHORT.LY/')?.host).toBe('go.short.ly');
		expect(findDomain(domains, null)).toBeNull();
		expect(resolveDefaultHost(domains, 'go.short.ly')).toBe('go.short.ly');
		expect(resolveDefaultHost(domains, 'unknown.test')).toBe('go.short.ly');
		expect(resolveDefaultHost([], 'unknown.test')).toBe('');
	});
});

describe('random email prefix', () => {
	it('produces name-nameDDD prefixes deterministically', () => {
		expect(generateRandomEmailPrefix(() => 0)).toBe('james-smith000');
		const prefix = generateRandomEmailPrefix(() => 0.999);
		expect(prefix).toMatch(/^[a-z]+-[a-z]+\d{3}$/);
	});

	it('uses the supplied random source for every segment', () => {
		const values = [0, 0, 0.5];
		const prefix = generateRandomEmailPrefix(() => values.shift() ?? 0);
		expect(prefix).toBe('james-smith500');
	});
});
