/** API Key binding flow. The key is validated against /v1/integrations/telegram/bind. */

import { cb } from '../callback-data';
import type { BotContext } from '../dispatch';
import type { BotModule } from '../dispatch';
import type { SessionRecord } from '../state/store';
import { escapeHtml, maskSecret } from '../telegram/format';
import { button, markup } from '../ui/keyboard';
import { BTN } from '../ui/texts';

const API_KEY_PATTERN = /^[A-Za-z0-9_.-]{8,200}$/;

function isValidApiKey(value: string): boolean {
	return API_KEY_PATTERN.test(value);
}

function bindInstructionText(notice?: string): string {
	return [
		'<b>🔑 绑定 Shortly 账号</b>',
		'',
		'1. 打开 Shortly 后台「API Key」页面，创建一个新的 Key；',
		'2. 点下面的按钮，然后把这个 Key 作为一条消息发给我；',
		'3. 绑定成功后我会立即删除那条包含 Key 的消息。',
		'',
		notice ? `<i>${escapeHtml(notice)}</i>` : '<i>Key 只保存在 Cloudflare KV 中，聊天里不会回显完整内容。</i>',
	].join('\n');
}

/** Rendered by the dispatcher whenever a protected action is attempted without a binding. */
export async function renderBindPrompt(ctx: BotContext, notice?: string): Promise<void> {
	await ctx.render({
		text: bindInstructionText(notice),
		keyboard: markup([[button(BTN.bindKey, cb.bindStart)], [button(BTN.help, cb.help)]]),
	});
}

async function beginBind(ctx: BotContext, notice?: string): Promise<void> {
	await ctx.updateSession(() => ({
		flow: 'bind',
		step: 'awaiting-key',
		awaiting: 'apiKey',
		data: {},
		updatedAt: Date.now(),
	}));

	await ctx.render({
		text: [
			'<b>请发送你的 API Key</b>',
			'',
			'直接把 Key 作为下一条消息发给我即可（我会在绑定成功后删除这条消息）。',
			'',
			notice ? `<i>${escapeHtml(notice)}</i>` : '',
		]
			.filter(Boolean)
			.join('\n'),
		keyboard: markup([[button(BTN.cancel, cb.bindCancel)]]),
	});
	await ctx.toast('等待你发送 API Key');
}

async function archiveBinding(ctx: BotContext, rawKey: string, options: { deleteUserMessage: boolean }): Promise<void> {
	const apiKey = rawKey.trim();
	if (!isValidApiKey(apiKey)) {
		await ctx.render({
			text: [
				'<b>Key 格式看起来不对</b>',
				'',
				'Shortly 的 API Key 形如 <code>sk_shortly_xxxxxxxx</code>，请不要带空格或引号。',
				'',
				'可以重新发送一次，或取消后到后台重新生成。',
			].join('\n'),
			keyboard: markup([[button(BTN.cancel, cb.bindCancel)]]),
		});
		return;
	}

	if (options.deleteUserMessage) {
		// Delete the message that carries the secret *before* any slow network call.
		await ctx.deleteUserMessage();
	}

	if (ctx.chat.type === 'private') await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

	const result = await ctx.api.bindTelegram(apiKey, String(ctx.chat.id), ctx.user?.username);
	if (!result.ok) {
		const hint =
			result.error.kind === 'unauthorized'
				? '这个 Key 无效、已删除或被禁用，请到 Shortly 后台重新生成。'
				: result.error.kind === 'bad_request'
					? result.error.message
					: '绑定请求失败，请稍后重试。';

		await ctx.render({
			text: ['<b>绑定失败</b>', '', escapeHtml(hint), '', '<i>你可以直接再发一次 Key，或取消。</i>'].join('\n'),
			keyboard: markup([[button(BTN.retry, cb.bindStart)], [button(BTN.cancel, cb.bindCancel)]]),
		});
		await ctx.toast('绑定失败');
		return;
	}

	await ctx.store.saveBinding({
		apiKey,
		chatId: ctx.chat.id,
		username: ctx.user?.username,
		ownerUserId: ctx.user?.id,
		boundAt: Date.now(),
		keyHint: maskSecret(apiKey),
	});
	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;

	await ctx.render(
		{
			text: [
				'<b>✅ 绑定成功</b>',
				'',
				`密钥：<code>${escapeHtml(maskSecret(apiKey))}</code>`,
				'',
				'现在可以直接用下方按钮创建短链、管理临时邮箱。',
			].join('\n'),
		},
		{ withReplyKeyboard: true },
	);
	await ctx.toast('绑定成功');
}

async function handleBindTextInput(ctx: BotContext, text: string, session: SessionRecord): Promise<void> {
	if (session.flow !== 'bind' || session.awaiting !== 'apiKey') {
		await renderBindPrompt(ctx);
		return;
	}

	await archiveBinding(ctx, text, { deleteUserMessage: true });
}

async function handleBindStart(ctx: BotContext): Promise<void> {
	if (ctx.binding) {
		await beginBind(ctx, '你当前已绑定；继续发送新的 Key 会覆盖原来的绑定。');
		return;
	}
	await beginBind(ctx);
}

async function handleBindCancel(ctx: BotContext): Promise<void> {
	await ctx.store.clearSession(ctx.chat.id);
	ctx.session = null;
	await ctx.toast('已取消绑定');
	await renderBindPrompt(ctx);
}

async function handleSetKeyAlias(ctx: BotContext, args: string[]): Promise<void> {
	const key = args[0]?.trim();
	if (!key) {
		await beginBind(ctx);
		return;
	}
	await archiveBinding(ctx, key, { deleteUserMessage: true });
}

export const bindModule: BotModule = {
	name: 'bind',
	callbacks: {
		'bind:start': handleBindStart,
		'bind:cancel': handleBindCancel,
		'set:bind': async (ctx) => {
			await beginBind(ctx);
		},
	},
	textInputs: {
		bind: handleBindTextInput,
	},
	aliases: {
		setkey: handleSetKeyAlias,
		bind: async (ctx) => {
			await beginBind(ctx);
		},
	},
};
