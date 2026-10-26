/** Thin Telegram Bot API client with retry / 429 / not-modified handling. */

import type { Bindings } from '../env';
import type { InlineKeyboardMarkup, ReplyKeyboardMarkup, TelegramApiEnvelope, TelegramMessage, TelegramUser } from './types';

const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_SLEEP_MS = 3000;

export type EditMessageResult = 'ok' | 'unchanged' | 'failed';

export type TelegramClient = {
	sendMessage(input: {
		chatId: number;
		text: string;
		keyboard?: InlineKeyboardMarkup | ReplyKeyboardMarkup;
		disablePreview?: boolean;
	}): Promise<TelegramMessage | null>;
	editMessageText(input: { chatId: number; messageId: number; text: string; keyboard?: InlineKeyboardMarkup }): Promise<EditMessageResult>;
	editMessageReplyMarkup(input: { chatId: number; messageId: number; keyboard?: InlineKeyboardMarkup }): Promise<boolean>;
	answerCallbackQuery(input: { callbackQueryId: string; text?: string; showAlert?: boolean }): Promise<void>;
	deleteMessage(chatId: number, messageId: number): Promise<boolean>;
	sendChatAction(chatId: number, action?: 'typing'): Promise<void>;
	getMe(): Promise<TelegramUser | null>;
};

type ApiCallOutcome<T> = { ok: true; result: T | null } | { ok: false; description: string; status: number; retryAfter?: number };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotModified(description: string): boolean {
	return /message is not modified/i.test(description);
}

export function createTelegramClient(env: Bindings, fetchImpl: typeof fetch = fetch): TelegramClient {
	const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();

	async function call<T>(method: string, payload: Record<string, unknown>, attempt = 0): Promise<ApiCallOutcome<T>> {
		if (!token) {
			console.error('Telegram client: TELEGRAM_BOT_TOKEN is not configured');
			return { ok: false, description: 'missing bot token', status: 0 };
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetchImpl(`${TELEGRAM_API_ORIGIN}/bot${token}/${method}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			const data = (await response.json().catch(() => null)) as TelegramApiEnvelope<T> | null;

			if (response.ok && data?.ok) {
				return { ok: true, result: data.result ?? null };
			}

			const description = data?.description ?? `HTTP ${response.status}`;
			const retryAfter = data?.parameters?.retry_after;

			if (response.status === 429 && attempt === 0) {
				const waitMs = Math.min(MAX_SLEEP_MS, Math.max(0, (retryAfter ?? 1) * 1000));
				await sleep(waitMs);
				return call<T>(method, payload, attempt + 1);
			}

			return { ok: false, description, status: response.status, retryAfter };
		} catch (error) {
			console.error(`Telegram ${method} request failed:`, error);
			return { ok: false, description: 'network error', status: 0 };
		} finally {
			clearTimeout(timer);
		}
	}

	async function sendMessage(input: Parameters<TelegramClient['sendMessage']>[0]): Promise<TelegramMessage | null> {
		const outcome = await call<TelegramMessage>('sendMessage', {
			chat_id: input.chatId,
			text: input.text,
			parse_mode: 'HTML',
			disable_web_page_preview: input.disablePreview ?? true,
			...(input.keyboard ? { reply_markup: input.keyboard } : {}),
		});

		if (!outcome.ok) {
			console.error(`Telegram sendMessage failed for chat ${input.chatId}: ${outcome.description}`);
			return null;
		}

		return outcome.result;
	}

	async function editMessageText(input: Parameters<TelegramClient['editMessageText']>[0]): Promise<EditMessageResult> {
		const outcome = await call<TelegramMessage>('editMessageText', {
			chat_id: input.chatId,
			message_id: input.messageId,
			text: input.text,
			parse_mode: 'HTML',
			disable_web_page_preview: true,
			...(input.keyboard ? { reply_markup: input.keyboard } : { reply_markup: { inline_keyboard: [] } }),
		});

		if (outcome.ok) return 'ok';
		if (isNotModified(outcome.description)) return 'unchanged';
		console.error(`Telegram editMessageText failed (chat ${input.chatId}, message ${input.messageId}): ${outcome.description}`);
		return 'failed';
	}

	async function editMessageReplyMarkup(input: Parameters<TelegramClient['editMessageReplyMarkup']>[0]): Promise<boolean> {
		const outcome = await call<TelegramMessage>('editMessageReplyMarkup', {
			chat_id: input.chatId,
			message_id: input.messageId,
			...(input.keyboard ? { reply_markup: input.keyboard } : {}),
		});

		if (outcome.ok) return true;
		if (isNotModified(outcome.description)) return true;
		console.error(`Telegram editMessageReplyMarkup failed: ${outcome.description}`);
		return false;
	}

	async function answerCallbackQuery(input: Parameters<TelegramClient['answerCallbackQuery']>[0]): Promise<void> {
		// answerCallbackQuery is best effort: a failure only leaves a spinner in the client.
		await call<boolean>('answerCallbackQuery', {
			callback_query_id: input.callbackQueryId,
			...(input.text ? { text: input.text } : {}),
			...(input.showAlert ? { show_alert: true } : {}),
		});
	}

	async function deleteMessage(chatId: number, messageId: number): Promise<boolean> {
		const outcome = await call<boolean>('deleteMessage', { chat_id: chatId, message_id: messageId });
		if (outcome.ok) return true;
		// Deleting messages older than 48h (or already gone) is expected to fail.
		console.warn(`Telegram deleteMessage skipped: ${outcome.description}`);
		return false;
	}

	async function sendChatAction(chatId: number, action: 'typing' = 'typing'): Promise<void> {
		await call<boolean>('sendChatAction', { chat_id: chatId, action });
	}

	async function getMe(): Promise<TelegramUser | null> {
		const outcome = await call<TelegramUser>('getMe', {});
		return outcome.ok ? outcome.result : null;
	}

	return { sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery, deleteMessage, sendChatAction, getMe };
}
