/** Account overview + local unbind. */

import { cb } from '../callback-data';
import type { BotContext, BotModule } from '../dispatch';
import { resolveDefaultHost } from '../api/domains';
import { escapeHtml, formatDateTime } from '../telegram/format';
import { button, markup } from '../ui/keyboard';
import { bindingLine, joinLines } from '../ui/texts';
import { renderBindPrompt } from './bind';

async function renderAccount(ctx: BotContext): Promise<void> {
	if (!ctx.binding) {
		await renderBindPrompt(ctx);
		return;
	}

	const domains = await ctx.getDomains();
	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const shortHost = resolveDefaultHost(domains.short, settings.defaultShortDomain);
	const emailHost = resolveDefaultHost(domains.email, settings.defaultEmailDomain);

	const text = joinLines([
		'<b>📊 我的账号</b>',
		'',
		`绑定状态：${bindingLine(ctx.binding)}`,
		ctx.binding.username ? `Telegram：@${escapeHtml(ctx.binding.username)}` : null,
		`绑定时间：${formatDateTime(ctx.binding.boundAt) || '未知'}`,
		'',
		`短链默认域名：${shortHost ? `<code>${escapeHtml(shortHost)}</code>` : '—'}`,
		`邮箱默认域名：${emailHost ? `<code>${escapeHtml(emailHost)}</code>` : '—'}`,
		'',
		'<i>解除本地绑定只会清除这个 Bot 保存的 Key；Shortly 主程序仍可能向本会话推送新邮件通知。</i>',
	]);

	await ctx.render({
		text,
		keyboard: markup([
			[button('🔑 更换 API Key', cb.setBind)],
			[button('⚙️ 设置', cb.setShow), button('❓ 帮助', cb.help)],
			[button('🔓 解除本地绑定', cb.setUnbind)],
			[button('🏠 主页', cb.home)],
		]),
	});
}

async function renderUnbindConfirm(ctx: BotContext): Promise<void> {
	await ctx.render({
		text: joinLines([
			'<b>⚠️ 确认解除本地绑定？</b>',
			'',
			'解除后这个 Bot 将不再保存你的 API Key，所有需要账号的操作都会要求重新绑定。',
			'',
			'Shortly 主程序侧的通知绑定不会被删除，如需彻底停止推送，请到 Shortly 后台处理。',
		]),
		keyboard: markup([[button('⚠️ 确认解除', cb.setUnbindOk)], [button('◀ 返回', cb.acctShow)]]),
	});
}

async function handleUnbindConfirm(ctx: BotContext): Promise<void> {
	await ctx.store.clearBinding(ctx.chat.id);
	await ctx.store.clearSession(ctx.chat.id);
	ctx.binding = null;
	ctx.session = null;

	await ctx.render({
		text: joinLines(['<b>已解除本地绑定</b>', '', '这个 Bot 已清除你的 API Key。需要时随时可以重新绑定。']),
		keyboard: markup([[button('🔑 重新绑定', cb.bindStart)], [button('🏠 主页', cb.home)]]),
	});
	await ctx.toast('已解除本地绑定');
}

export const accountModule: BotModule = {
	name: 'account',
	callbacks: {
		'acct:show': renderAccount,
		'set:unbind': renderUnbindConfirm,
		'set:unbindok': handleUnbindConfirm,
	},
	aliases: {
		me: async (ctx) => {
			await renderAccount(ctx);
		},
		account: async (ctx) => {
			await renderAccount(ctx);
		},
	},
};
