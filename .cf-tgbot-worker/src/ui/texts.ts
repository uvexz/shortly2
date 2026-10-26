/** Shared copy and reply-keyboard/model aliases. Feature modules own their screen prose. */

import type { BindingRecord } from '../state/store';

export const BOT_NAME = 'Shortly 助手';

export const REPLY_KEYBOARD_ROWS: string[][] = [
	['➕ 新建短链', '✉️ 新建邮箱'],
	['🔗 我的短链', '📬 我的邮箱'],
	['📊 我的', '⚙️ 设置', '❓ 帮助'],
];

/**
 * Exact reply-keyboard label → internal alias key.
 * Aliases are what modules register as `aliases` (and what commands map to).
 */
export const REPLY_LABEL_ALIASES: Record<string, string> = {
	'➕ 新建短链': 'short',
	'✉️ 新建邮箱': 'email',
	'🔗 我的短链': 'links',
	'📬 我的邮箱': 'emails',
	'📊 我的': 'me',
	'⚙️ 设置': 'settings',
	'❓ 帮助': 'help',
};

export const BTN = {
	home: '🏠 主页',
	back: '◀ 返回',
	cancel: '❌ 取消',
	next: '下一步 ▶',
	create: '✅ 创建',
	save: '✅ 保存',
	retry: '🔁 重试',
	close: '✖️ 关闭',
	copy: '📋 复制',
	open: '🌐 打开',
	refresh: '🔄 刷新',
	bindKey: '🔑 绑定 API Key',
	changeKey: '🔑 更换 API Key',
	settings: '⚙️ 设置',
	account: '📊 我的账号',
	help: '❓ 帮助',
} as const;

export const TIME_ZONE_HINT = '时间均为北京时间（UTC+8）';

export function bindingLine(binding: BindingRecord | null): string {
	if (!binding) return '未绑定';
	const username = binding.username?.trim() ? ` @${binding.username.trim()}` : '';
	return `<b>已绑定</b>${username} · 密钥 ${binding.keyHint}`;
}

export function joinLines(lines: Array<string | null | undefined | false>): string {
	return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}

export function divider(): string {
	return '──────────';
}
