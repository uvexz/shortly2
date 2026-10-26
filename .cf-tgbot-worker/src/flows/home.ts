/** Home screen: the interaction hub every other screen returns to. */

import { cb } from '../callback-data';
import type { BotContext, BotModule } from '../dispatch';
import { resolveDefaultHost } from '../api/domains';
import { escapeHtml } from '../telegram/format';
import { button, markup } from '../ui/keyboard';
import { BOT_NAME, bindingLine, joinLines } from '../ui/texts';
import { renderBindPrompt } from './bind';

export type HomeOptions = {
	/** Send the persistent reply keyboard instead of inline buttons (private chats). */
	useReplyKeyboard?: boolean;
};

export async function renderHome(ctx: BotContext, options: HomeOptions = {}): Promise<void> {
	if (!ctx.binding) {
		await renderBindPrompt(ctx);
		return;
	}

	const domains = await ctx.getDomains();
	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const shortHost = resolveDefaultHost(domains.short, settings.defaultShortDomain);
	const emailHost = resolveDefaultHost(domains.email, settings.defaultEmailDomain);
	const shortDefault = shortHost ? `<code>${escapeHtml(shortHost)}</code>` : '—';
	const emailDefault = emailHost ? `<code>${escapeHtml(emailHost)}</code>` : '—';

	const text = joinLines([
		`<b>${BOT_NAME}</b>`,
		'',
		bindingLine(ctx.binding),
		`短链默认域名：${shortDefault}`,
		`邮箱默认域名：${emailDefault}`,
		'',
		'点下方按钮开始操作 👇',
	]);

	if (options.useReplyKeyboard && ctx.chat.type === 'private') {
		await ctx.render({ text }, { newMessage: true, withReplyKeyboard: true });
		return;
	}

	await ctx.render({
		text,
		keyboard: markup([
			[button('➕ 新建短链', cb.linkNew), button('✉️ 新建邮箱', cb.mailNew)],
			[button('🔗 我的短链', cb.linkList(1)), button('📬 我的邮箱', cb.mailList(1))],
			[button('📊 我的账号', cb.acctShow), button('⚙️ 设置', cb.setShow), button('❓ 帮助', cb.help)],
		]),
	});
}

async function handleStartAlias(ctx: BotContext, args: string[]): Promise<void> {
	const payload = args[0]?.trim().toLowerCase() ?? '';
	if (payload === 'bind') {
		await renderBindPrompt(ctx);
		return;
	}
	await renderHome(ctx, { useReplyKeyboard: ctx.chat.type === 'private' });
}

async function handleCancelAlias(ctx: BotContext): Promise<void> {
	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await ctx.toast('已取消当前操作');
	await renderHome(ctx);
}

export const homeModule: BotModule = {
	name: 'home',
	callbacks: {
		'nav:home': async (ctx) => {
			await renderHome(ctx);
		},
	},
	aliases: {
		start: handleStartAlias,
		menu: async (ctx) => {
			await renderHome(ctx);
		},
		home: async (ctx) => {
			await renderHome(ctx);
		},
		cancel: handleCancelAlias,
	},
};
