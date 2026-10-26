/** Per-chat settings: default short-link / mailbox domains used by the wizards. */

import { cb, parseIndexArg } from '../callback-data';
import type { BotContext, BotModule } from '../dispatch';
import type { CallbackAction } from '../callback-data';
import type { DomainInfo } from '../api/types';
import { resolveDefaultHost } from '../api/domains';
import { escapeHtml } from '../telegram/format';
import { button, chunkRows, markup } from '../ui/keyboard';
import { joinLines } from '../ui/texts';
import { renderBindPrompt } from './bind';

type DomainKind = 'short' | 'email';

function domainButtons(domains: DomainInfo[], kind: DomainKind, currentHost: string) {
	const prefix = kind === 'short' ? '🔗' : '✉️';
	return domains.map((domain, index) => {
		const selected = domain.host === currentHost;
		const label = `${selected ? '✅' : prefix} ${domain.host}`;
		const data = kind === 'short' ? cb.setShortDomain(index) : cb.setEmailDomain(index);
		return button(label, data);
	});
}

async function renderSettings(ctx: BotContext, notice?: string): Promise<void> {
	if (!ctx.binding) {
		await renderBindPrompt(ctx);
		return;
	}

	const domains = await ctx.getDomains();
	const settings = await ctx.store.getChatSettings(ctx.chat.id);
	const shortHost = resolveDefaultHost(domains.short, settings.defaultShortDomain);
	const emailHost = resolveDefaultHost(domains.email, settings.defaultEmailDomain);

	const text = joinLines([
		'<b>⚙️ 设置</b>',
		'',
		`🔗 短链默认域名：${shortHost ? `<code>${escapeHtml(shortHost)}</code>` : '—（无可选域名）'}`,
		`✉️ 邮箱默认域名：${emailHost ? `<code>${escapeHtml(emailHost)}</code>` : '—（无可选域名）'}`,
		'',
		'点下方域名按钮即可切换默认值（✅ 为当前选中）。',
		'域名列表来自 Shortly 后台的启用配置；这里的选择只影响本 Bot。',
		notice ? `\n<i>${escapeHtml(notice)}</i>` : '',
	]);

	await ctx.render({
		text,
		keyboard: markup([
			...chunkRows(domainButtons(domains.short, 'short', shortHost), 2),
			...chunkRows(domainButtons(domains.email, 'email', emailHost), 2),
			[button('🔑 更换 API Key', cb.setBind), button('📊 我的账号', cb.acctShow)],
			[button('🏠 主页', cb.home)],
		]),
	});
}

async function selectDomain(ctx: BotContext, action: CallbackAction, kind: DomainKind): Promise<void> {
	const index = parseIndexArg(action.args, 0);
	if (index === null) {
		await renderSettings(ctx);
		return;
	}

	const domains = await ctx.getDomains();
	const list = kind === 'short' ? domains.short : domains.email;
	const domain = list[index];
	if (!domain) {
		await ctx.toast('域名列表已更新，请重新选择');
		await renderSettings(ctx);
		return;
	}

	const current = await ctx.store.getChatSettings(ctx.chat.id);
	const next = kind === 'short' ? { ...current, defaultShortDomain: domain.host } : { ...current, defaultEmailDomain: domain.host };
	await ctx.store.saveChatSettings(ctx.chat.id, next);

	await ctx.toast(kind === 'short' ? '已更新短链默认域名' : '已更新邮箱默认域名');
	await renderSettings(ctx, `已设为 ${domain.host}`);
}

export const settingsModule: BotModule = {
	name: 'settings',
	callbacks: {
		'set:show': async (ctx) => {
			await renderSettings(ctx);
		},
		'set:short-domain': async (ctx, action) => {
			await selectDomain(ctx, action, 'short');
		},
		'set:email-domain': async (ctx, action) => {
			await selectDomain(ctx, action, 'email');
		},
	},
	aliases: {
		settings: async (ctx) => {
			await renderSettings(ctx);
		},
	},
};
