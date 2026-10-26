/** Text/HTML formatting helpers shared by every screen. */

import { MAX_MESSAGE_LENGTH } from '../env';

export function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function escapeHtmlAttribute(value: string): string {
	return escapeHtml(value).replaceAll("'", '&#39;');
}

export function truncate(value: string, maxLength: number): string {
	if (maxLength <= 0) return '';
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Escape then truncate, so truncation never happens in the middle of an entity. */
export function escapeAndTruncate(value: string, maxLength: number): string {
	return escapeHtml(truncate(value, maxLength));
}

export function stripHtml(value: string | null | undefined): string {
	if (!value) return '';
	return value
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Deterministic (timezone-free ICU) date formatting in Asia/Shanghai.
 * Workers runtime timezone is UTC; users of this bot are assumed to be in UTC+8.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	const date = value instanceof Date ? value : new Date(value);
	const time = date.getTime();
	if (!Number.isFinite(time)) return String(value);

	const shifted = new Date(time + BEIJING_OFFSET_MS);
	const pad = (input: number) => String(input).padStart(2, '0');
	return [
		`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
		`${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
	].join(' ');
}

export function formatBytes(value: number | null | undefined): string {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/** `sk_ab…f9a2` style fingerprint. Never expose the full key. */
export function maskSecret(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}…`;
	return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return count === 1 ? singular : pluralForm;
}

/** Guard for Telegram's 4096-char message limit; caller must pass already-safe HTML. */
export function clampMessage(text: string): string {
	if (text.length <= MAX_MESSAGE_LENGTH) return text;
	return `${text.slice(0, MAX_MESSAGE_LENGTH - 20)}\n\n<i>…内容过长已截断</i>`;
}

/** Build a copy-friendly `<code>` snippet. */
export function code(value: string): string {
	return `<code>${escapeHtml(value)}</code>`;
}

export function bold(value: string): string {
	return `<b>${escapeHtml(value)}</b>`;
}

export function quote(value: string): string {
	return `<blockquote expandable>${escapeHtml(value)}</blockquote>`;
}

export function isUrlLike(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;
	if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return true;
	return /^[^\s/]+\.[^\s/]{2,}/.test(trimmed);
}

export function normalizeUrlInput(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return trimmed;
	if (/^(?:t\.me|telegram\.me)\//i.test(trimmed)) return `https://${trimmed}`;
	if (isUrlLike(trimmed)) return `https://${trimmed}`;
	return trimmed;
}
