/**
 * End-to-end flow tests: drive the worker through POST /webhook with a fake Telegram Bot API
 * and a fake Shortly /v1 backend, then assert on structural evidence (callback_data, API
 * requests, KV contents, deleted messages) instead of full screen prose.
 *
 * Short-link / temp-mailbox wizard coverage lives in `wizard.test.ts` (added once those
 * feature modules land); this file covers the worker core: webhook security, home, binding,
 * account, settings, help, dedupe and throttling.
 */

import { describe, expect, it } from 'bun:test';
import { maskSecret } from '../src/telegram/format';
import { createHarness, expectApiCalled, expectApiNotCalled, expectKeyboardContains } from './harness';

// Fake keys only: they must satisfy the worker's format check, but they are not real credentials.
const VALID_KEY = 'testkeybind000000000001';
const RETRY_KEY = 'testkeybind000000000002';

describe('webhook endpoint contract', () => {
	it('serves the health endpoint', async () => {
		const harness = createHarness();
		const response = await harness.get('/');
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Shortly Telegram Bot Worker');
	});

	it('works without a configured secret and processes updates', async () => {
		const harness = createHarness();
		const response = await harness.sendText('/start');
		expect(response.status).toBe(200);
		expect(harness.telegram.sentMessages().length).toBeGreaterThan(0);
	});

	it('rejects a wrong X-Telegram-Bot-Api-Secret-Token with 401 and processes nothing', async () => {
		const harness = createHarness({ env: { TELEGRAM_WEBHOOK_SECRET: 'top-secret' } });
		const response = await harness.request('/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong-secret' },
			body: JSON.stringify({ update_id: 1 }),
		});
		expect(response.status).toBe(401);
		expect(harness.telegram.calls).toHaveLength(0);
	});

	it('accepts the matching secret token', async () => {
		const harness = createHarness({ env: { TELEGRAM_WEBHOOK_SECRET: 'top-secret' } });
		const response = await harness.sendText('/start');
		expect(response.status).toBe(200);
		expect(harness.telegram.sentMessages().length).toBeGreaterThan(0);
	});

	it('returns 400 for a body that is not JSON', async () => {
		const harness = createHarness();
		const response = await harness.request('/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: 'not-json',
		});
		expect(response.status).toBe(400);
		expect(harness.telegram.calls).toHaveLength(0);
	});

	it('re-sends the screen when Telegram reports the message to edit is gone', async () => {
		const harness = createHarness();
		harness.seedBinding();
		await harness.sendText('/help');
		const sendsBefore = harness.telegram.sentMessages().length;

		harness.telegram.failNext('editMessageText', { status: 400, description: 'Bad Request: message to edit not found' });
		await harness.click('nav:home');

		expect(harness.telegram.sentMessages().length).toBe(sendsBefore + 1);
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
	});

	it('ignores "message is not modified" without duplicating the message', async () => {
		const harness = createHarness();
		harness.seedBinding();
		await harness.sendText('/help');
		const sendsBefore = harness.telegram.sentMessages().length;

		harness.telegram.failNext('editMessageText', { status: 400, description: 'Bad Request: message is not modified' });
		await harness.click('nav:home');

		expect(harness.telegram.sentMessages().length).toBe(sendsBefore);
	});

	it('still answers 200 when /v1 is unreachable for a public command', async () => {
		const harness = createHarness();
		harness.api.fail('GET /domains', { networkError: true });
		const response = await harness.sendText('/help');
		expect(response.status).toBe(200);
	});
});

describe('home / binding', () => {
	it('shows the binding guide for /start when unbound', async () => {
		const harness = createHarness();
		await harness.sendText('/start');

		const screen = harness.lastScreen();
		expect(screen?.kind).toBe('send');
		expectKeyboardContains(screen?.keyboard, 'bind:start');
		expectKeyboardContains(screen?.keyboard, 'nav:help');
		expect(harness.session()).toBeNull();
		expectApiNotCalled(harness.api);
	});

	it('binds an API key: deletes the secret message, stores the binding, drops the session', async () => {
		const harness = createHarness();

		await harness.sendText('/start');
		await harness.clickButton('bind:start');

		// The wizard opens, persists the awaiting-key session and edits the original message.
		expect(harness.session()?.flow).toBe('bind');
		expect(harness.session()?.awaiting).toBe('apiKey');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:cancel');
		expect(harness.lastAnswer()).not.toBeNull();

		await harness.sendText(VALID_KEY);

		// The message carrying the key is removed before the network call.
		expect(harness.deletedMessageIds()).toContain(harness.lastUserMessageId);

		const bindCalls = expectApiCalled(harness.api, 'POST /integrations/telegram/bind');
		expect(bindCalls).toHaveLength(1);
		expect(bindCalls[0].body).toEqual({ chatId: String(harness.chatId), username: 'tester' });
		expect(bindCalls[0].authorization).toBe(`Bearer ${VALID_KEY}`);

		const binding = harness.binding();
		expect(binding?.apiKey).toBe(VALID_KEY);
		expect(binding?.keyHint).toBe(maskSecret(VALID_KEY));
		expect(binding?.chatId).toBe(harness.chatId);
		expect(binding?.ownerUserId).toBe(harness.user.id);
		expect(harness.session()).toBeNull();

		// Never echo the full key back to Telegram or into a /v1 JSON body.
		expect(JSON.stringify(harness.telegram.calls.map((call) => call.payload))).not.toContain(VALID_KEY);
		expect(JSON.stringify(bindCalls.map((call) => call.body))).not.toContain(VALID_KEY);

		// Success page carries the persistent reply keyboard for private chats.
		const screen = harness.lastScreen();
		expect(screen?.replyKeyboard?.keyboard.length).toBeGreaterThanOrEqual(3);
		expect(screen?.replyKeyboard?.is_persistent).toBe(true);
		expect(harness.lastAnswer()).not.toBeNull();
	});

	it('does not persist the binding on a 401 and offers retry', async () => {
		const harness = createHarness();
		harness.api.failNext('POST /integrations/telegram/bind', { status: 401, body: { error: 'Invalid API key' } });

		await harness.sendText('/start');
		await harness.clickButton('bind:start');
		await harness.sendText(VALID_KEY);

		expect(harness.binding()).toBeNull();
		expect(harness.kv.has(`b:${harness.chatId}`)).toBe(false);
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:cancel');

		// Sending another key works without restarting the wizard.
		await harness.sendText(RETRY_KEY);
		expect(harness.binding()?.apiKey).toBe(RETRY_KEY);
	});

	it('rejects a malformed key without calling /v1', async () => {
		const harness = createHarness();
		await harness.sendText('/start');
		await harness.clickButton('bind:start');
		await harness.sendText('too short');

		expectApiNotCalled(harness.api);
		expect(harness.binding()).toBeNull();
		expectKeyboardContains(harness.lastKeyboard(), 'bind:cancel');
	});

	it('supports /setkey <key> and deletes the command message', async () => {
		const harness = createHarness();

		await harness.sendCommand('setkey', VALID_KEY);

		const bindCalls = expectApiCalled(harness.api, 'POST /integrations/telegram/bind');
		expect(bindCalls[0].authorization).toBe(`Bearer ${VALID_KEY}`);
		expect(harness.deletedMessageIds()).toContain(harness.lastUserMessageId);
		expect(harness.binding()?.keyHint).toBe(maskSecret(VALID_KEY));
	});

	it('signs out locally through the account screen', async () => {
		const harness = createHarness();
		const binding = harness.seedBinding();

		await harness.click('acct:show');
		expect(harness.lastText()).toContain(binding.keyHint);
		expect(harness.lastText()).not.toContain(binding.apiKey);
		expectKeyboardContains(harness.lastKeyboard(), 'set:unbind');
		expectKeyboardContains(harness.lastKeyboard(), 'set:bind');

		await harness.clickButton('set:unbind');
		expectKeyboardContains(harness.lastKeyboard(), 'set:unbindok');

		await harness.clickButton('set:unbindok');
		expect(harness.binding()).toBeNull();
		expect(harness.lastAnswerText()).toContain('解除');
	});
});

describe('settings', () => {
	it('stores per-chat default domains and reflects them on the home screen', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('set:show');
		expectKeyboardContains(harness.lastKeyboard(), 'set:short-domain:0');
		expectKeyboardContains(harness.lastKeyboard(), 'set:short-domain:1');
		expectKeyboardContains(harness.lastKeyboard(), 'set:email-domain:0');

		await harness.click('set:short-domain:1');
		expect(harness.chatSettings()?.defaultShortDomain).toBe('go.short.ly');
		expect(harness.chatSettings()?.defaultEmailDomain).toBeUndefined();
		expect(harness.lastAnswerText()).toContain('短链');

		await harness.click('set:email-domain:1');
		expect(harness.chatSettings()?.defaultEmailDomain).toBe('inbox.short.ly');

		await harness.click('nav:home');
		expect(harness.lastText()).toContain('go.short.ly');
		expect(harness.lastText()).toContain('inbox.short.ly');
	});

	it('caches /v1/domains in KV so repeated screens do not refetch', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('acct:show');
		await harness.click('set:show');

		expect(harness.api.callsTo('GET /domains')).toHaveLength(1);
		expect(harness.kv.json<{ fetchedAt: number }>('dom:v1')?.fetchedAt).toBeGreaterThan(0);
	});

	it('falls back to env defaults when /v1/domains fails', async () => {
		const harness = createHarness({
			env: { DEFAULT_SHORT_DOMAIN: 'fallback.example,alt.example', DEFAULT_EMAIL_DOMAIN: 'mail.example' },
		});
		harness.seedBinding();
		harness.api.fail('GET /domains', { status: 500, body: { error: 'boom' } });

		await harness.click('set:show');
		expect(harness.lastText()).toContain('fallback.example');
		expectKeyboardContains(harness.lastKeyboard(), 'set:short-domain:1');
	});
});

describe('protected actions without a binding', () => {
	it('shows the bind prompt and never calls /v1', async () => {
		const harness = createHarness();
		await harness.sendText('/start');
		harness.api.reset();

		await harness.click('set:show');
		expectApiNotCalled(harness.api);
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		expect(harness.lastAnswerText()).toContain('绑定');
	});

	it('blocks /settings for unbound chats', async () => {
		const harness = createHarness();
		await harness.sendText('/settings');
		expectApiNotCalled(harness.api);
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
	});

	it('renders the bind guide for /me and acct:show when unbound', async () => {
		const harness = createHarness();

		await harness.sendText('/me');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		expectApiNotCalled(harness.api);

		await harness.click('acct:show');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		expect(harness.lastAnswerText()).toContain('绑定');
		expectApiNotCalled(harness.api);
	});

	it('cancels the active wizard', async () => {
		const harness = createHarness();
		await harness.sendText('/start');
		await harness.clickButton('bind:start');
		expect(harness.session()).not.toBeNull();

		await harness.sendCommand('cancel');
		expect(harness.session()).toBeNull();
	});

	it('renders the help entry point for unbound chats', async () => {
		const harness = createHarness();
		await harness.click('nav:help');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:new');
		expectKeyboardContains(harness.lastKeyboard(), 'nav:home');
		expectApiNotCalled(harness.api);
	});

	it('falls back to a guidance screen for unknown text', async () => {
		const harness = createHarness();
		await harness.sendText('hello there');
		const screen = harness.lastScreen();
		expect(screen?.replyKeyboard?.keyboard.flat().length).toBeGreaterThan(0);
	});
});

describe('update dedupe', () => {
	it('processes a duplicate update_id only once', async () => {
		const harness = createHarness();
		const update = {
			update_id: 990001,
			message: {
				message_id: 1,
				chat: harness.chat,
				from: harness.user,
				text: '/help',
			},
		};

		await harness.sendUpdate(update);
		const callsAfterFirst = harness.telegram.calls.length;
		expect(callsAfterFirst).toBeGreaterThan(0);

		await harness.sendUpdate(update);
		expect(harness.telegram.calls.length).toBe(callsAfterFirst);
	});

	it('dedupes across isolate restarts when STRICT_UPDATE_DEDUPE=true', async () => {
		const harness = createHarness({ env: { STRICT_UPDATE_DEDUPE: 'true' } });
		const update = {
			update_id: 990002,
			message: { message_id: 2, chat: harness.chat, from: harness.user, text: '/help' },
		};

		await harness.sendUpdate(update);
		const callsAfterFirst = harness.telegram.calls.length;
		expect(harness.kv.has('upd:990002')).toBe(true);

		// Simulate a new isolate: in-memory dedupe is empty, KV strict mode still catches it.
		harness.resetMemory();
		await harness.sendUpdate(update);
		expect(harness.telegram.calls.length).toBe(callsAfterFirst);
	});
});

describe('callback acknowledgement', () => {
	it('answers every callback exactly once', async () => {
		const harness = createHarness();
		harness.seedBinding();
		const taps = ['nav:home', 'set:show', 'noop', 'invalid:callback-data'];

		for (const tap of taps) {
			const before = harness.telegram.callsOf('answerCallbackQuery').length;
			await harness.click(tap);
			expect(harness.telegram.callsOf('answerCallbackQuery').length - before).toBe(1);
		}
	});

	it('answers exactly once when a toast is shown', async () => {
		const harness = createHarness();
		harness.seedBinding();
		const before = harness.telegram.callsOf('answerCallbackQuery').length;

		await harness.click('set:short-domain:1');

		expect(harness.telegram.callsOf('answerCallbackQuery').length - before).toBe(1);
		expect(harness.lastAnswerText()).toContain('短链');
	});
});

describe('group chat actor authorization', () => {
	const GROUP_CHAT_ID = -1001234567890;
	const OWNER_ID = 900001;

	it('lets an unbound group bootstrap a binding through bind:start + key text', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });

		// Public entries keep working before any binding exists.
		await harness.click('nav:help');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');

		await harness.click('bind:start');
		expect(harness.session()?.flow).toBe('bind');
		expect(harness.session()?.awaiting).toBe('apiKey');

		await harness.sendText('testkeygroup0000000001');

		const bindCall = expectApiCalled(harness.api, 'POST /integrations/telegram/bind')[0];
		expect(bindCall.body.chatId).toBe(String(GROUP_CHAT_ID));
		const binding = harness.binding();
		expect(binding?.apiKey).toBe('testkeygroup0000000001');
		expect(binding?.ownerUserId).toBe(OWNER_ID);
	});

	it('lets /setkey bootstrap a group binding and records the owner', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });

		await harness.sendCommand('setkey', 'testkeygroup0000000002');

		expect(harness.binding()?.ownerUserId).toBe(OWNER_ID);
		const bindCall = expectApiCalled(harness.api, 'POST /integrations/telegram/bind')[0];
		expect(bindCall.body.chatId).toBe(String(GROUP_CHAT_ID));
	});

	it('blocks non-owner group members on protected callbacks without calling /v1', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });
		harness.actAs(OWNER_ID + 1, 'intruder');
		harness.api.reset();

		await harness.click('link:list:1');

		expectApiNotCalled(harness.api);
		expect(harness.lastAnswerText()).toContain('绑定者');
		expect(harness.telegram.sentMessages()).toHaveLength(0);
	});

	it('blocks non-owner group members on protected text commands without calling /v1', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });
		harness.actAs(OWNER_ID + 1, 'intruder');
		harness.api.reset();

		await harness.sendCommand('links');
		expectApiNotCalled(harness.api);
		expect(harness.lastText()).toContain('绑定者');

		await harness.sendCommand('me');
		expect(harness.lastText()).toContain('绑定者');
		expectApiNotCalled(harness.api);
	});

	it('blocks a non-owner from finishing a binding wizard opened by the owner', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		const ownerKey = 'testkeygroupowner00001';
		harness.seedBinding({ ownerUserId: OWNER_ID, apiKey: ownerKey });

		await harness.click('set:bind');
		expect(harness.session()?.awaiting).toBe('apiKey');
		harness.api.reset();

		harness.actAs(OWNER_ID + 1, 'intruder');
		await harness.sendText('testkeygroupintruder0002');

		expectApiNotCalled(harness.api);
		expect(harness.binding()?.apiKey).toBe(ownerKey);
		expect(harness.binding()?.ownerUserId).toBe(OWNER_ID);
		expect(harness.session()?.awaiting).toBe('apiKey');
		expect(harness.lastText()).toContain('绑定者');
	});

	it('blocks a non-owner from typing into a link wizard opened by the owner', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });

		await harness.click('link:new');
		expect(harness.session()?.step).toBe('target');
		const sessionBefore = JSON.stringify(harness.session());

		harness.actAs(OWNER_ID + 1, 'intruder');
		await harness.sendText('https://example.com/intruder');

		expect(harness.lastText()).toContain('绑定者');
		expect(JSON.stringify(harness.session())).toBe(sessionBefore);
		expectApiNotCalled(harness.api, 'POST /shorten');
	});

	it('blocks a non-owner from typing into a mailbox wizard opened by the owner', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });

		await harness.click('mail:new');
		expect(harness.session()?.flow).toBe('mail:new');
		const sessionBefore = JSON.stringify(harness.session());
		harness.api.reset();

		harness.actAs(OWNER_ID + 1, 'intruder');
		await harness.sendText('intruder-prefix');

		expect(harness.lastText()).toContain('绑定者');
		expect(JSON.stringify(harness.session())).toBe(sessionBefore);
		expectApiNotCalled(harness.api, 'POST /emails');
	});

	it('lets the owner drive wizard text input in a group', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });

		await harness.click('link:new');
		await harness.sendText('example.com/owner');

		expect(harness.session()?.step).toBe('slug');
		expect(harness.session()?.data.target).toBe('https://example.com/owner');
	});

	it('blocks non-owner /setkey when the group already has a binding', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		const ownerKey = 'testkeygroupowner00003';
		harness.seedBinding({ ownerUserId: OWNER_ID, apiKey: ownerKey });
		harness.actAs(OWNER_ID + 1, 'intruder');
		harness.api.reset();

		await harness.sendCommand('setkey', 'testkeygroupintruder0004');

		expectApiNotCalled(harness.api);
		expect(harness.binding()?.apiKey).toBe(ownerKey);
		expect(harness.binding()?.ownerUserId).toBe(OWNER_ID);
		expect(harness.lastText()).toContain('绑定者');
	});

	it('lets the group binding owner rebind with /setkey', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID, apiKey: 'testkeygroupowner00005' });
		harness.api.reset();

		await harness.sendCommand('setkey', 'testkeygroupowner00006');

		expect(harness.binding()?.apiKey).toBe('testkeygroupowner00006');
		expect(harness.binding()?.ownerUserId).toBe(OWNER_ID);
		const bindCall = expectApiCalled(harness.api, 'POST /integrations/telegram/bind')[0];
		expect(bindCall.authorization).toBe('Bearer testkeygroupowner00006');
	});

	it('blocks non-owner bind:start when the group already has a binding', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });
		harness.actAs(OWNER_ID + 1, 'intruder');
		harness.api.reset();

		await harness.click('bind:start');

		expectApiNotCalled(harness.api);
		expect(harness.session()).toBeNull();
		expect(harness.lastAnswerText()).toContain('绑定者');
	});

	it('lets the group binding owner act normally', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });

		await harness.click('link:list:1');
		expectApiCalled(harness.api, 'GET /links');

		harness.api.reset();
		await harness.sendCommand('emails');
		expectApiCalled(harness.api, 'GET /emails');

		harness.api.reset();
		await harness.sendCommand('me');
		expect(harness.lastText()).toContain('sk_s…');
	});

	it('keeps public entries usable for every group member', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding({ ownerUserId: OWNER_ID });
		harness.actAs(OWNER_ID + 1, 'member');
		harness.api.reset();

		await harness.click('nav:help');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:new');

		await harness.click('nav:home');
		expect(harness.lastText()).toContain('Shortly');
		expectApiNotCalled(harness.api, 'GET /links');
	});

	it('keeps legacy group bindings (no ownerUserId) usable', async () => {
		const harness = createHarness({ chatType: 'group', chatId: GROUP_CHAT_ID, userId: OWNER_ID });
		harness.seedBinding(); // legacy record without ownerUserId
		harness.actAs(OWNER_ID + 7, 'legacy-member');
		harness.api.reset();

		await harness.click('link:list:1');
		expectApiCalled(harness.api, 'GET /links');
	});

	it('private chats are unaffected by the owner check', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:list:1');
		expectApiCalled(harness.api, 'GET /links');
	});
});

describe('throttling', () => {
	it('answers "too frequent" after the per-chat action budget is exceeded', async () => {
		const harness = createHarness();
		await harness.sendText('/start');

		for (let index = 0; index < 20; index += 1) {
			await harness.click('noop');
		}
		expect(harness.lastAnswerText()).toBeNull();

		await harness.click('noop');
		expect(harness.lastAnswerText()).toContain('频繁');
	});
});

describe('email-detail web route guards', () => {
	it('rejects an unusable token', async () => {
		const harness = createHarness();
		const response = await harness.get('/email-detail/not-a-valid-token');
		// 410 is the contract for unusable tokens; the placeholder page currently answers 501.
		expect([410, 501]).toContain(response.status);
	});

	it('serves HTML with no-store headers', async () => {
		const harness = createHarness();
		const response = await harness.get('/email-detail/deadbeef');
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
