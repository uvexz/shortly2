/** Inline/reply keyboard builders. */

import { MAX_COPY_TEXT_LENGTH } from '../env';
import { cb, parseIndexArg } from '../callback-data';
import type { InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup } from '../telegram/types';
import { REPLY_KEYBOARD_ROWS } from './texts';

export function button(text: string, callbackData: string): InlineKeyboardButton {
	return { text, callback_data: callbackData };
}

export function urlButton(text: string, url: string): InlineKeyboardButton {
	return { text, url };
}

/** One tap copies the value to the clipboard (Bot API 7.11+). */
export function copyButton(text: string, value: string): InlineKeyboardButton {
	const trimmed = value.trim();
	return { text, copy_text: { text: trimmed.slice(0, MAX_COPY_TEXT_LENGTH) } };
}

export function row(...buttons: InlineKeyboardButton[]): InlineKeyboardButton[] {
	return buttons.filter(Boolean);
}

export function chunkRows(buttons: InlineKeyboardButton[], perRow = 2): InlineKeyboardButton[][] {
	const rows: InlineKeyboardButton[][] = [];
	for (let index = 0; index < buttons.length; index += perRow) {
		rows.push(buttons.slice(index, index + perRow));
	}
	return rows;
}

export function markup(rows: Array<InlineKeyboardButton[] | null | undefined>): InlineKeyboardMarkup {
	return {
		inline_keyboard: rows.filter((item): item is InlineKeyboardButton[] => Array.isArray(item) && item.length > 0),
	};
}

/**
 * `[◀ 上一页] [2/5] [下一页 ▶]`, with the indicator being a harmless noop button.
 * Returns null when there is only a single page.
 */
export function pagerRow(page: number, totalPages: number, buildCallback: (targetPage: number) => string): InlineKeyboardButton[] | null {
	const safeTotal = Math.max(1, totalPages);
	if (safeTotal <= 1) return null;
	const safePage = Math.min(Math.max(1, page), safeTotal);
	const prev = safePage > 1 ? button('◀ 上一页', buildCallback(safePage - 1)) : button('·', cb.noop);
	const next = safePage < safeTotal ? button('下一页 ▶', buildCallback(safePage + 1)) : button('·', cb.noop);
	return [prev, button(`${safePage}/${safeTotal}`, cb.noop), next];
}

/** `[◀ 返回] [🏠 主页]`; omit either side by passing null. */
export function navRow(options: { back?: string | null; home?: boolean } = {}): InlineKeyboardButton[] | null {
	const buttons: InlineKeyboardButton[] = [];
	if (options.back) buttons.push(button('◀ 返回', options.back));
	if (options.home !== false) buttons.push(button('🏠 主页', cb.home));
	return buttons.length ? buttons : null;
}

export function homeRow(): InlineKeyboardButton[] {
	return [button('🏠 主页', cb.home)];
}

export function replyKeyboard(): ReplyKeyboardMarkup {
	return {
		keyboard: REPLY_KEYBOARD_ROWS.map((rowLabels) => rowLabels.map((text) => ({ text }))),
		resize_keyboard: true,
		is_persistent: true,
		input_field_placeholder: '点下方按钮操作，或直接发链接',
	};
}

/** Reads a domain index from callback args and validates it against the list length. */
export function parseDomainIndex(args: string[], position = 0): number | null {
	return parseIndexArg(args, position);
}
