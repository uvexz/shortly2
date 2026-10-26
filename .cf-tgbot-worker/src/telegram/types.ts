/** Minimal Telegram Bot API types used by this Worker (no SDK dependency). */

export type TelegramUser = {
	id: number;
	is_bot?: boolean;
	first_name?: string;
	last_name?: string;
	username?: string;
	language_code?: string;
};

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export type TelegramChat = {
	id: number;
	type: TelegramChatType;
	title?: string;
	username?: string;
};

export type TelegramMessage = {
	message_id: number;
	date?: number;
	chat: TelegramChat;
	from?: TelegramUser;
	text?: string;
};

export type TelegramCallbackQuery = {
	id: string;
	from: TelegramUser;
	message?: TelegramMessage;
	data?: string;
};

export type TelegramUpdate = {
	update_id: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
};

export type InlineKeyboardButton = {
	text: string;
	callback_data?: string;
	url?: string;
	copy_text?: { text: string };
};

export type InlineKeyboardMarkup = {
	inline_keyboard: InlineKeyboardButton[][];
};

export type ReplyKeyboardMarkup = {
	keyboard: Array<Array<{ text: string }>>;
	resize_keyboard?: boolean;
	is_persistent?: boolean;
	input_field_placeholder?: string;
};

export type TelegramApiEnvelope<T> = {
	ok: boolean;
	result?: T;
	description?: string;
	parameters?: {
		retry_after?: number;
		migrate_to_chat_id?: number;
	};
};

export type TelegramSendResult = {
	message_id: number;
};
