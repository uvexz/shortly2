/**
 * Worker entry point.
 *
 * Routes are part of the deployment contract and must not change:
 *   GET  /                    simple health text
 *   GET  /email-detail/:token one-time email detail web page
 *   POST /webhook             Telegram update receiver
 */

import { Hono } from 'hono';
import type { Bindings } from './env';
import { getRuntimeConfig } from './env';
import { handleUpdate } from './dispatch';
import { renderEmailDetailPage } from './web/email-detail';
import type { TelegramUpdate } from './telegram/types';

export type AppOptions = {
	/** Dependency injection for tests; production uses the global fetch. */
	fetchImpl?: typeof fetch;
};

let warnedMissingWebhookSecret = false;

/** Builds the Hono app. Exported so tests can inject a fake Telegram/Shortly fetch. */
export function createApp(options: AppOptions = {}) {
	const app = new Hono<{ Bindings: Bindings }>();

	app.get('/', (c) => c.text('Shortly Telegram Bot Worker is running!'));

	app.get('/email-detail/:token', async (c) => {
		const token = c.req.param('token');
		const result = await renderEmailDetailPage({
			env: c.env,
			token,
			origin: new URL(c.req.url).origin,
		});

		return new Response(result.html, {
			status: result.status,
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'no-store',
				'referrer-policy': 'no-referrer',
				'x-robots-tag': 'noindex',
			},
		});
	});

	app.post('/webhook', async (c) => {
		const config = getRuntimeConfig(c.env);

		if (config.webhookSecret) {
			const provided = c.req.header('x-telegram-bot-api-secret-token') ?? '';
			if (provided !== config.webhookSecret) {
				console.warn('Rejected webhook request with invalid secret token');
				return c.text('unauthorized', 401);
			}
		} else if (!warnedMissingWebhookSecret) {
			warnedMissingWebhookSecret = true;
			console.warn('TELEGRAM_WEBHOOK_SECRET is not set: webhook requests are unauthenticated');
		}

		const update = await c.req.json().catch(() => null);
		if (!update || typeof update !== 'object') {
			return c.text('bad request', 400);
		}

		await handleUpdate(c.env as Bindings, update as TelegramUpdate, {
			origin: new URL(c.req.url).origin,
			fetchImpl: options.fetchImpl,
		});
		return c.text('OK');
	});

	return app;
}

const app = createApp();

export default app;
