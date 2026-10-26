/**
 * Short-link / temp-mailbox wizard coverage (DESIGN §10 scenarios 3-8, 10-12).
 *
 * These tests exercise the real flow modules against the fake Telegram Bot API and fake
 * Shortly `/v1`, asserting structural evidence: callback_data on keyboards, `/v1` request
 * method/path/query/body, KV session/binding contents, deleted messages and one-time tokens.
 */

import { describe, expect, it } from 'bun:test';
import {
	createHarness,
	expectApiCalled,
	expectApiNotCalled,
	expectKeyboardContains,
	linkItem,
	mailboxItem,
	mailMessage,
	messageDetail,
	type Harness,
} from './harness';

const MAILBOX_ID = '33333333-3333-4333-8333-333333333333';

function copyButtonOf(harness: Harness) {
	return harness.buttons().find((button) => button.copy_text);
}

function urlButtonOf(harness: Harness) {
	return harness.buttons().find((button) => button.url);
}

describe('short-link create wizard', () => {
	it('walks target → slug → domain → expiry → clicks → confirm and posts the full /shorten body', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:new');
		expect(harness.session()?.flow).toBe('link:new');
		expect(harness.session()?.step).toBe('target');
		expect(harness.session()?.awaiting).toBe('target');
		expect(harness.session()?.data.slug).toMatch(/^[0-9a-zA-Z]{6}$/);
		expectKeyboardContains(harness.lastKeyboard(), 'link:cancel');

		// 1. target (the only free-text step)
		await harness.sendText('example.com/landing');
		expect(harness.session()?.step).toBe('slug');
		expect(harness.session()?.data.target).toBe('https://example.com/landing');
		expectKeyboardContains(harness.lastKeyboard(), 'link:rerand');
		expectKeyboardContains(harness.lastKeyboard(), 'link:slug');
		expectKeyboardContains(harness.lastKeyboard(), 'link:next');

		// 2a. reroll the random slug
		const firstRandomSlug = harness.session()?.data.slug;
		await harness.click('link:rerand');
		expect(harness.session()?.data.slug).not.toBe(firstRandomSlug);
		expect(harness.session()?.data.slugMode).toBe('random');

		// 2b. custom slug
		await harness.click('link:slug');
		expect(harness.session()?.step).toBe('custom-slug');
		await harness.sendText('My-Custom_Slug');
		expect(harness.session()?.data.slug).toBe('My-Custom_Slug');
		expect(harness.session()?.data.slugMode).toBe('custom');

		// 3. domain (two enabled domains from /v1/domains)
		await harness.click('link:next');
		expect(harness.session()?.step).toBe('domain');
		expectKeyboardContains(harness.lastKeyboard(), 'link:domain:0');
		expectKeyboardContains(harness.lastKeyboard(), 'link:domain:1');
		expect(harness.session()?.data.domain).toBe('short.ly');
		await harness.click('link:domain:1');
		expect(harness.session()?.data.domain).toBe('go.short.ly');

		// 4. expiry → 1 day (EXPIRY_OPTIONS[1])
		await harness.click('link:next');
		expect(harness.session()?.step).toBe('expiry');
		expectKeyboardContains(harness.lastKeyboard(), 'link:expiry:0');
		expectKeyboardContains(harness.lastKeyboard(), 'link:expiry:7');
		await harness.click('link:expiry:2');
		expect(harness.session()?.data.expiry).toBe('2');

		// 5. clicks → 100
		await harness.click('link:next');
		expect(harness.session()?.step).toBe('clicks');
		expectKeyboardContains(harness.lastKeyboard(), 'link:clicks:0');
		expectKeyboardContains(harness.lastKeyboard(), 'link:clicks:100');
		expectKeyboardContains(harness.lastKeyboard(), 'link:clicks:custom');
		await harness.click('link:clicks:100');
		expect(harness.session()?.data.clicks).toBe('100');

		// 6. confirm → create
		await harness.click('link:next');
		expect(harness.session()?.step).toBe('confirm');
		expectKeyboardContains(harness.lastKeyboard(), 'link:create');
		expectKeyboardContains(harness.lastKeyboard(), 'link:back');

		await harness.click('link:create');
		const shortenCalls = expectApiCalled(harness.api, 'POST /shorten');
		expect(shortenCalls).toHaveLength(1);
		expect(shortenCalls[0].body).toEqual({
			url: 'https://example.com/landing',
			customSlug: 'My-Custom_Slug',
			domain: 'go.short.ly',
			expiresIn: '1d',
			maxClicks: 100,
		});
		expect(shortenCalls[0].authorization).toContain('Bearer ');

		// Result screen: one-tap copy + open + follow-up entries; session cleared.
		expect(harness.session()).toBeNull();
		const copy = copyButtonOf(harness);
		expect(copy?.copy_text?.text).toBe('https://go.short.ly/My-Custom_Slug');
		expect(urlButtonOf(harness)?.url).toBe('https://go.short.ly/My-Custom_Slug');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		expectKeyboardContains(harness.lastKeyboard(), 'link:list:1');
		expectKeyboardContains(harness.lastKeyboard(), 'nav:home');
		expect(harness.lastAnswerText()).toContain('成功');
	});

	it('supports a custom click limit through free text input', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:new');
		await harness.sendText('https://example.com/custom');
		await harness.click('link:next'); // slug → domain
		await harness.click('link:next'); // domain → expiry
		await harness.click('link:next'); // expiry → clicks
		await harness.click('link:clicks:custom');
		expect(harness.session()?.step).toBe('custom-clicks');
		await harness.sendText('250');
		expect(harness.session()?.data.clicks).toBe('250');

		await harness.click('link:next'); // clicks → confirm
		await harness.click('link:create');
		expect(expectApiCalled(harness.api, 'POST /shorten')[0].body).toMatchObject({ maxClicks: 250 });
	});

	it('keeps the draft on a 409 conflict and can retry', async () => {
		const harness = createHarness();
		harness.seedBinding();
		harness.seedSession({
			flow: 'link:new',
			step: 'confirm',
			data: { target: 'https://example.com/conflict', slug: 'abc123', slugMode: 'random', domain: 'short.ly', expiry: '0', clicks: '0' },
		});
		harness.api.failNext('POST /shorten', { status: 409, body: { error: 'Custom slug already taken' } });

		await harness.click('link:create');
		expect(harness.session()?.flow).toBe('link:new');
		expect(harness.session()?.step).toBe('confirm');
		expectKeyboardContains(harness.lastKeyboard(), 'link:create');
		expectKeyboardContains(harness.lastKeyboard(), 'link:back');
		expectKeyboardContains(harness.lastKeyboard(), 'link:cancel');
		expect(harness.session()?.data.target).toBe('https://example.com/conflict');

		await harness.click('link:create');
		expect(harness.session()).toBeNull();
		expect(expectApiCalled(harness.api, 'POST /shorten')).toHaveLength(2);
	});

	it('creates directly through /short <url> [slug] [domain]', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.sendCommand('short', 'https://example.com/direct', 'direct-slug', 'go.short.ly');

		const shortenCall = expectApiCalled(harness.api, 'POST /shorten')[0];
		expect(shortenCall.body).toEqual({
			url: 'https://example.com/direct',
			customSlug: 'direct-slug',
			domain: 'go.short.ly',
		});
		expect(harness.session()).toBeNull();
		expect(copyButtonOf(harness)?.copy_text?.text).toBe('https://go.short.ly/direct-slug');
	});

	it('rejects an invalid target URL without leaving the target step', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:new');
		await harness.sendText('not a url');

		expect(harness.session()?.step).toBe('target');
		expectApiNotCalled(harness.api, 'POST /shorten');
		expectKeyboardContains(harness.lastKeyboard(), 'link:cancel');
	});

	it('falls back to the "draft expired" screen when there is no session', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:create');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		await harness.click('link:next');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		await harness.click('link:view:11111111-1111-4111-8111-111111111111');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		expectApiNotCalled(harness.api, 'POST /shorten');
	});
});

describe('short-link list + detail', () => {
	it('paginates with limit=5 and shows copy_text without another API call on detail', async () => {
		const harness = createHarness();
		harness.seedBinding();

		const pageOne = Array.from({ length: 5 }, (_, index) => linkItem({ id: `link-${index}`, slug: `slug${index}` }));
		const pageTwo = [linkItem({ id: 'link-5', slug: 'five', originalUrl: 'https://example.com/five' })];
		harness.api.on('GET /links', (call) => {
			const page = Number(call.query.get('page') ?? '1');
			return { body: { data: page === 1 ? pageOne : pageTwo, total: 6, page, limit: 5, totalPages: 2 } };
		});

		await harness.click('link:list:1');
		expect(harness.api.lastCall('GET /links')?.query.get('limit')).toBe('5');
		expect(harness.api.lastCall('GET /links')?.query.get('page')).toBe('1');
		expectKeyboardContains(harness.lastKeyboard(), 'link:view:link-0');
		expectKeyboardContains(harness.lastKeyboard(), 'link:view:link-4');
		expectKeyboardContains(harness.lastKeyboard(), 'link:list:2');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');

		await harness.click('link:list:2');
		expect(harness.api.lastCall('GET /links')?.query.get('page')).toBe('2');
		expectKeyboardContains(harness.lastKeyboard(), 'link:view:link-5');

		const callsBeforeDetail = harness.api.callsTo('GET /links').length;
		await harness.click('link:view:link-5');
		expect(harness.api.callsTo('GET /links').length).toBe(callsBeforeDetail);

		expect(copyButtonOf(harness)?.copy_text?.text).toBe('https://short.ly/five');
		expect(urlButtonOf(harness)?.url).toBe('https://short.ly/five');
		expectKeyboardContains(harness.lastKeyboard(), 'link:list:2');
		expectKeyboardContains(harness.lastKeyboard(), 'nav:home');
	});

	it('guides to create when the list is empty', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('link:list:1');
		expectKeyboardContains(harness.lastKeyboard(), 'link:new');
		expect(harness.callbackData()).not.toContain('link:list:2');
	});
});

describe('temp-mailbox create wizard', () => {
	it('walks prefix → domain → confirm and posts the full email address', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('mail:new');
		expect(harness.session()?.flow).toBe('mail:new');
		expect(harness.session()?.step).toBe('prefix');
		expect(harness.session()?.awaiting).toBe('prefix');
		expect(harness.session()?.data.prefix).toMatch(/^[a-z]+-[a-z]+\d{3}$/);
		expectKeyboardContains(harness.lastKeyboard(), 'mail:rerand');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:prefix');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:next');

		// Random reroll + custom prefix (normalised to lower case).
		await harness.click('mail:rerand');
		await harness.click('mail:prefix');
		expect(harness.lastAnswerText()).toContain('前缀');
		await harness.sendText('MyTeam');
		expect(harness.session()?.data.prefix).toBe('myteam');

		// Two email domains are available, so the domain step is shown.
		await harness.click('mail:next');
		expect(harness.session()?.step).toBe('domain');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:domain:0');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:domain:1');
		await harness.click('mail:domain:1');
		expect(harness.session()?.data.domain).toBe('inbox.short.ly');

		await harness.click('mail:next');
		expect(harness.session()?.step).toBe('confirm');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:create');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:back');
		expect(copyButtonOf(harness)?.copy_text?.text).toBe('myteam@inbox.short.ly');

		harness.api.on('POST /emails', (call) => ({
			status: 201,
			body: { data: mailboxItem({ id: MAILBOX_ID, emailAddress: String(call.body?.emailAddress), unreadCount: 0, messageCount: 0 }) },
		}));
		await harness.click('mail:create');

		expect(expectApiCalled(harness.api, 'POST /emails')[0].body).toEqual({ emailAddress: 'myteam@inbox.short.ly' });
		expect(harness.session()).toBeNull();
		expect(copyButtonOf(harness)?.copy_text?.text).toBe('myteam@inbox.short.ly');
		expectKeyboardContains(harness.lastKeyboard(), `mail:msgs:${MAILBOX_ID}:1`);
		expectKeyboardContains(harness.lastKeyboard(), 'mail:new');
		expect(harness.lastAnswerText()).toContain('创建');
	});

	it('creates directly through /email <prefix> <domain>', async () => {
		const harness = createHarness();
		harness.seedBinding();
		harness.api.on('POST /emails', (call) => ({
			status: 201,
			body: { data: mailboxItem({ id: MAILBOX_ID, emailAddress: String(call.body?.emailAddress) }) },
		}));

		await harness.sendCommand('email', 'quickbox', 'inbox.short.ly');

		expect(expectApiCalled(harness.api, 'POST /emails')[0].body).toEqual({ emailAddress: 'quickbox@inbox.short.ly' });
		expect(harness.session()).toBeNull();
		expect(copyButtonOf(harness)?.copy_text?.text).toBe('quickbox@inbox.short.ly');
	});

	it('shows the expired screen when the wizard draft is gone', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('mail:next');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:new');
		await harness.click('mail:create');
		expectKeyboardContains(harness.lastKeyboard(), 'mail:new');
		expectApiNotCalled(harness.api, 'POST /emails');
	});
});

describe('temp-mailbox list / inbox / message detail', () => {
	it('navigates list → mailbox → inbox → message, auto-marks read and deletes with confirmation', async () => {
		const harness = createHarness();
		harness.seedBinding();

		const mailbox = mailboxItem({ id: MAILBOX_ID, unreadCount: 1, messageCount: 2 });
		harness.api.on('GET /emails', (call) => {
			const limit = Number(call.query.get('limit') ?? '5');
			return { body: { data: [mailbox], total: 1, page: 1, limit, totalPages: 1 } };
		});
		harness.api.on('GET /emails/*/messages', () => ({
			body: {
				mailbox: { id: MAILBOX_ID, emailAddress: 'demo-user123@mail.short.ly' },
				data: [mailMessage({ id: 'message-1', subject: 'Hello Shortly' }), mailMessage({ id: 'message-2', isRead: true })],
				total: 2,
				page: 1,
				limit: 5,
				totalPages: 1,
			},
		}));
		harness.api.on('GET /emails/messages/*', () => ({
			body: { data: messageDetail({ id: 'message-1', mailboxId: MAILBOX_ID, isRead: false }) },
		}));

		// Mailbox list
		await harness.click('mail:list:1');
		expect(harness.api.lastCall('GET /emails')?.query.get('limit')).toBe('5');
		expectKeyboardContains(harness.lastKeyboard(), `mail:view:${MAILBOX_ID}`);

		// Mailbox detail (lookup scans with limit=100)
		await harness.clickButton(`mail:view:${MAILBOX_ID}`);
		expect(harness.api.lastCall('GET /emails')?.query.get('limit')).toBe('100');
		expect(copyButtonOf(harness)?.copy_text?.text).toBe('demo-user123@mail.short.ly');
		expectKeyboardContains(harness.lastKeyboard(), `mail:msgs:${MAILBOX_ID}:1`);
		expectKeyboardContains(harness.lastKeyboard(), `mail:del:${MAILBOX_ID}`);

		// Inbox
		await harness.clickButton(`mail:msgs:${MAILBOX_ID}:1`);
		expect(harness.api.lastCall(`GET /emails/${MAILBOX_ID}/messages`)?.query.get('limit')).toBe('5');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:view:message-1');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:view:message-2');
		expectKeyboardContains(harness.lastKeyboard(), `mail:view:${MAILBOX_ID}`);

		// Open an unread message: one automatic mark-read, then the read view hides the button.
		await harness.clickButton('msg:view:message-1');
		const readCalls = harness.api.callsTo('POST /emails/messages/*/read');
		expect(readCalls).toHaveLength(1);
		expect(readCalls[0].path).toBe('/emails/messages/message-1/read');
		expect(harness.lastAnswerText()).toContain('已读');
		expect(harness.hasButton('msg:read:message-1')).toBe(false);
		expectKeyboardContains(harness.lastKeyboard(), 'msg:detail:message-1');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:del:message-1');
		expectKeyboardContains(harness.lastKeyboard(), `msg:back:${MAILBOX_ID}:1`);

		// Delete requires confirmation, then calls DELETE with the message id.
		await harness.clickButton('msg:del:message-1');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:delok:message-1');
		expect(harness.api.called('DELETE /emails/messages/*')).toBe(false);

		await harness.clickButton('msg:delok:message-1');
		expect(harness.api.lastCall('DELETE /emails/messages/*')?.path).toBe('/emails/messages/message-1');
		expect(harness.lastAnswerText()).toContain('邮件已删除');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:view:message-1');
	});
});

describe('mailbox deletion regression (UUID, not address)', () => {
	it('deletes through inbox buttons using the mailbox UUID', async () => {
		const harness = createHarness();
		harness.seedBinding();
		const mailbox = mailboxItem({ id: MAILBOX_ID, emailAddress: 'bye@mail.short.ly' });
		harness.api.on('GET /emails', (call) => ({
			body: { data: [mailbox], total: 1, page: 1, limit: Number(call.query.get('limit') ?? '5'), totalPages: 1 },
		}));

		await harness.click(`mail:del:${MAILBOX_ID}`);
		expectKeyboardContains(harness.lastKeyboard(), `mail:delok:${MAILBOX_ID}`);

		await harness.clickButton(`mail:delok:${MAILBOX_ID}`);
		expect(harness.api.lastCall('DELETE /emails/*')?.path).toBe(`/emails/${MAILBOX_ID}`);
		expect(harness.api.called('DELETE /emails/bye@mail.short.ly')).toBe(false);
		expect(harness.lastAnswerText()).toContain('邮箱已删除');
	});

	it('supports /delete <address> by scanning the mailbox list first', async () => {
		const harness = createHarness();
		harness.seedBinding();
		const mailbox = mailboxItem({ id: MAILBOX_ID, emailAddress: 'scan-me@mail.short.ly' });
		harness.api.on('GET /emails', (call) => ({
			body: { data: [mailbox], total: 1, page: 1, limit: Number(call.query.get('limit') ?? '5'), totalPages: 1 },
		}));

		await harness.sendCommand('delete', 'scan-me@mail.short.ly');
		expect(harness.api.lastCall('GET /emails')?.query.get('limit')).toBe('100');
		expectKeyboardContains(harness.lastKeyboard(), `mail:delok:${MAILBOX_ID}`);

		await harness.clickButton(`mail:delok:${MAILBOX_ID}`);
		expect(harness.api.lastCall('DELETE /emails/*')?.path).toBe(`/emails/${MAILBOX_ID}`);
	});
});

describe('legacy notification callbacks', () => {
	it('handles email:read by marking read and rewriting the notification keyboard', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('email:read:message-legacy');

		expect(harness.api.lastCall('POST /emails/messages/*/read')?.path).toBe('/emails/messages/message-legacy/read');
		const markupCall = harness.telegram.lastCall('editMessageReplyMarkup');
		const data = (markupCall?.payload.reply_markup.inline_keyboard as Array<Array<{ callback_data?: string }>>)
			.flat()
			.map((button) => button.callback_data);
		expect(data).toContain('email:delete:message-legacy');
		expect(data).toContain('email:detail:message-legacy');
		expect(harness.lastAnswerText()).toContain('已读');
	});

	it('handles email:delete with a second confirmation tap', async () => {
		const harness = createHarness();
		harness.seedBinding();

		await harness.click('email:delete:message-legacy');
		expect(harness.api.called('DELETE /emails/messages/*')).toBe(false);
		expect(harness.session()?.flow).toBe('mail:delete');
		const confirmMarkup = harness.telegram.lastCall('editMessageReplyMarkup');
		const data = (confirmMarkup?.payload.reply_markup.inline_keyboard as Array<Array<{ callback_data?: string }>>)
			.flat()
			.map((button) => button.callback_data);
		expect(data).toContain('email:delete:message-legacy');
		expect(data).toContain('mail:cancel');
		expect(harness.lastAnswerText()).toContain('确认');

		await harness.click('email:delete:message-legacy');
		expect(harness.api.lastCall('DELETE /emails/messages/*')?.path).toBe('/emails/messages/message-legacy');
		expect(harness.session()).toBeNull();
		expect(harness.lastAnswerText()).toContain('邮件已删除');
	});

	it('handles email:detail by rendering the message view with its actions', async () => {
		const harness = createHarness();
		harness.seedBinding();
		harness.api.on('GET /emails/messages/*', () => ({
			body: { data: messageDetail({ id: 'message-legacy', mailboxId: MAILBOX_ID, isRead: true }) },
		}));

		await harness.click('email:detail:message-legacy');

		expect(harness.api.lastCall('GET /emails/messages/*')?.path).toBe('/emails/messages/message-legacy');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:detail:message-legacy');
		expectKeyboardContains(harness.lastKeyboard(), 'msg:del:message-legacy');
		expectKeyboardContains(harness.lastKeyboard(), `msg:back:${MAILBOX_ID}:1`);
	});
});

describe('binding gate + expired API key', () => {
	it('protects link/mail callbacks for unbound chats without touching /v1', async () => {
		const harness = createHarness();
		await harness.sendText('/start');
		harness.api.reset();

		await harness.click('link:new');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		await harness.click('mail:list:1');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
		await harness.click('msg:view:message-1');
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');

		expectApiNotCalled(harness.api);
	});

	it('clears the local binding when /v1 answers 401', async () => {
		const harness = createHarness();
		harness.seedBinding();
		harness.api.failNext('GET /links', { status: 401, body: { error: 'Invalid API key' } });

		await harness.click('link:list:1');

		expect(harness.binding()).toBeNull();
		expect(harness.kv.has(`b:${harness.chatId}`)).toBe(false);
		expectKeyboardContains(harness.lastKeyboard(), 'bind:start');
	});
});

describe('one-time email detail page', () => {
	it('answers 410 for an unknown or already-used token', async () => {
		const harness = createHarness();

		const invalid = await harness.get('/email-detail/not-a-token');
		expect(invalid.status).toBe(410);

		const token = 'b'.repeat(48);
		harness.kv.seed(`edt:${token}`, JSON.stringify({ chatId: harness.chatId, emailId: 'message-1', createdAt: Date.now() }));
		const first = await harness.get(`/email-detail/${token}`);
		// Token exists but the chat has no binding yet → 401; either way it is consumed.
		expect(first.status).toBe(401);

		const second = await harness.get(`/email-detail/${token}`);
		expect(second.status).toBe(410);
	});

	it('renders message HTML in a sandboxed iframe and invalidates the token', async () => {
		const harness = createHarness();
		harness.seedBinding();
		harness.api.on('GET /emails/messages/*', () => ({
			body: {
				data: messageDetail({
					id: 'message-1',
					html: '<p>hello <strong>world</strong></p><script>alert(1)</script>',
					text: 'plain body',
					attachments: [{ filename: 'invoice.pdf', mimeType: 'application/pdf', size: 2048 }],
				}),
			},
		}));

		// Ask the bot for a one-time link.
		await harness.click('msg:detail:message-1');
		const url = urlButtonOf(harness)?.url ?? '';
		expect(url).toMatch(/^https:\/\/bot\.test\/email-detail\/[a-f0-9]{48}$/);
		expect(copyButtonOf(harness)?.copy_text?.text).toBe(url);

		const page = await harness.get(new URL(url).pathname);
		expect(page.status).toBe(200);
		expect(page.headers.get('content-type')).toContain('text/html');
		expect(page.headers.get('cache-control')).toBe('no-store');
		const html = await page.text();
		expect(html).toContain('plain body');
		expect(html).toContain('invoice.pdf');
		expect(html).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
		expect(html).not.toContain('allow-scripts');

		// The token is single-use.
		const again = await harness.get(new URL(url).pathname);
		expect(again.status).toBe(410);
	});

	it('answers 401 when the token is valid but the chat has no binding', async () => {
		const harness = createHarness();
		const token = 'c'.repeat(48);
		harness.kv.seed(`edt:${token}`, JSON.stringify({ chatId: harness.chatId, emailId: 'message-1', createdAt: Date.now() }));

		const page = await harness.get(`/email-detail/${token}`);
		expect(page.status).toBe(401);
	});
});
