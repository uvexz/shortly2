/**
 * Update dispatcher: builds the per-update context, enforces webhook-level
 * concerns (dedupe, throttling, binding gate, error safety) and routes
 * callbacks / text input / command aliases to feature modules.
 */

import type { Bindings } from './env';
import { createStore } from './state/store';
import type { BindingRecord, BotStore, FlowName, SessionRecord } from './state/store';
import { createShortlyApi } from './api/client';
import type { ApiFailure, ResolvedDomains, ShortlyApi } from './api/types';
import { resolveDomains } from './api/domains';
import { createTelegramClient } from './telegram/client';
import type { TelegramClient } from './telegram/client';
import { parseCallbackData, requiresBinding } from './callback-data';
import type { CallbackAction, CallbackKind } from './callback-data';
import { escapeHtml } from './telegram/format';
import { button, markup, navRow, replyKeyboard } from './ui/keyboard';
import { BTN, REPLY_LABEL_ALIASES } from './ui/texts';
import type {
	InlineKeyboardMarkup,
	TelegramCallbackQuery,
	TelegramChat,
	TelegramMessage,
	TelegramUpdate,
	TelegramUser,
} from './telegram/types';
import { modules } from './flows';
import { renderBindPrompt } from './flows/bind';

export type Screen = {
	text: string;
	keyboard?: InlineKeyboardMarkup;
};

export type BotContext = {
	env: Bindings;
	store: BotStore;
	api: ShortlyApi;
	telegram: TelegramClient;
	chat: TelegramChat;
	user?: TelegramUser;
	/** Worker origin, used for one-time email-detail web links. */
	origin: string;
	binding: BindingRecord | null;
	session: SessionRecord | null;
	callbackQueryId?: string;
	/** Message that carried the tapped inline button (used for in-place edits). */
	sourceMessageId?: number;
	/** The user's text message id, so flows can clean up sensitive input. */
	userMessageId?: number;
	getDomains(): Promise<ResolvedDomains>;
	render(screen: Screen, options?: { newMessage?: boolean; withReplyKeyboard?: boolean }): Promise<void>;
	toast(text: string, options?: { alert?: boolean }): Promise<void>;
	deleteMessage(messageId: number): Promise<void>;
	deleteUserMessage(): Promise<void>;
	requireBinding(): Promise<BindingRecord | null>;
	updateSession(mutator: (session: SessionRecord) => SessionRecord | null): Promise<void>;
	/** Standard error screen; handles expired/invalid API keys by clearing the binding. */
	handleApiError(error: ApiFailure, options?: { retryCallback?: string; retryLabel?: string; backCallback?: string | null }): Promise<void>;
	/** Called by the dispatcher when no handler answered the callback query. */
	ack(): Promise<void>;
};

export type CallbackHandler = (ctx: BotContext, action: CallbackAction) => Promise<void>;
export type TextInputHandler = (ctx: BotContext, text: string, session: SessionRecord) => Promise<void>;
export type AliasHandler = (ctx: BotContext, args: string[]) => Promise<void>;

export type BotModule = {
	name: string;
	callbacks?: Partial<Record<CallbackKind, CallbackHandler>>;
	textInputs?: Partial<Record<FlowName, TextInputHandler>>;
	aliases?: Record<string, AliasHandler>;
};

export type DispatcherDeps = {
	fetchImpl?: typeof fetch;
	origin?: string;
};

type Registry = {
	callbacks: Map<CallbackKind, CallbackHandler>;
	textInputs: Partial<Record<FlowName, TextInputHandler>>;
	aliases: Map<string, AliasHandler>;
};

/** Aliases that work without a bound API key (they lead to the bind flow). */
const PUBLIC_ALIASES = new Set(['start', 'menu', 'home', 'help', 'cancel', 'setkey', 'bind']);

/** Rebind entry points stay public for bootstrap, but must not let group members hijack a bound chat. */
function isAliasProtectedFromOtherMembers(aliasKey: string, ctx: BotContext): boolean {
	if (!PUBLIC_ALIASES.has(aliasKey)) return true;
	if ((aliasKey === 'setkey' || aliasKey === 'bind') && ctx.binding) return true;
	return false;
}

/** Module registry with duplicate detection (duplicates would silently shadow handlers). */
export function createRegistry(moduleList: BotModule[]): Registry {
	const callbacks = new Map<CallbackKind, CallbackHandler>();
	const textInputs: Partial<Record<FlowName, TextInputHandler>> = {};
	const aliases = new Map<string, AliasHandler>();

	for (const module of moduleList) {
		for (const [kind, handler] of Object.entries(module.callbacks ?? {}) as Array<[CallbackKind, CallbackHandler]>) {
			if (callbacks.has(kind)) {
				console.warn(`Bot module "${module.name}" overwrote callback handler: ${kind}`);
			}
			callbacks.set(kind, handler);
		}
		for (const [flow, handler] of Object.entries(module.textInputs ?? {}) as Array<[FlowName, TextInputHandler]>) {
			if (textInputs[flow]) {
				console.warn(`Bot module "${module.name}" overwrote text input handler: ${flow}`);
			}
			textInputs[flow] = handler;
		}
		for (const [alias, handler] of Object.entries(module.aliases ?? {})) {
			if (aliases.has(alias)) {
				console.warn(`Bot module "${module.name}" overwrote alias: ${alias}`);
			}
			aliases.set(alias, handler);
		}
	}

	return { callbacks, textInputs, aliases };
}

let cachedRegistry: Registry | null = null;

function getRegistry(): Registry {
	cachedRegistry ??= createRegistry(modules);
	return cachedRegistry;
}

function isPrivateChat(chat: TelegramChat): boolean {
	return chat.type === 'private';
}

/**
 * Private chats are 1:1 by construction, so the chat binding *is* the actor.
 * In groups/supergroups the binding belongs to whoever ran the bind flow; only
 * that Telegram user may drive /v1 actions through this chat. Bindings created
 * before owner tracking existed keep working (with a warning) for compatibility.
 */
function isActorAuthorized(ctx: BotContext): boolean {
	if (isPrivateChat(ctx.chat)) return true;
	const binding = ctx.binding;
	// Bootstrap: an unbound group chat must still be able to run /setkey or bind:start.
	// Only protected actions call this helper, so public entries are unaffected.
	if (!binding) return true;
	if (binding.ownerUserId === undefined) {
		console.warn(`Legacy group binding for chat ${ctx.chat.id} has no ownerUserId; allowing action`);
		return true;
	}
	return ctx.user?.id === binding.ownerUserId;
}

function createContext(params: {
	env: Bindings;
	store: BotStore;
	api: ShortlyApi;
	telegram: TelegramClient;
	chat: TelegramChat;
	user?: TelegramUser;
	origin: string;
	binding: BindingRecord | null;
	session: SessionRecord | null;
	callbackQueryId?: string;
	sourceMessageId?: number;
	userMessageId?: number;
}): BotContext {
	let domainsPromise: Promise<ResolvedDomains> | null = null;
	let answered = false;

	const ctx: BotContext = {
		env: params.env,
		store: params.store,
		api: params.api,
		telegram: params.telegram,
		chat: params.chat,
		user: params.user,
		origin: params.origin,
		binding: params.binding,
		session: params.session,
		callbackQueryId: params.callbackQueryId,
		sourceMessageId: params.sourceMessageId,
		userMessageId: params.userMessageId,

		async getDomains() {
			domainsPromise ??= resolveDomains(params.api, params.store, params.env);
			return domainsPromise;
		},

		async render(screen, options = {}) {
			const chatId = params.chat.id;
			const targetMessageId = options.newMessage ? undefined : (ctx.session?.anchorMessageId ?? params.sourceMessageId);

			if (targetMessageId) {
				const result = await params.telegram.editMessageText({
					chatId,
					messageId: targetMessageId,
					text: screen.text,
					keyboard: screen.keyboard,
				});
				if (result !== 'failed') {
					if (result === 'ok' && ctx.session) ctx.session.anchorMessageId = targetMessageId;
					return;
				}
			}

			const keyboard = options.withReplyKeyboard && isPrivateChat(params.chat) ? replyKeyboard() : screen.keyboard;
			const sent = await params.telegram.sendMessage({ chatId, text: screen.text, keyboard });
			if (sent && ctx.session && !ctx.session.anchorMessageId) {
				ctx.session.anchorMessageId = sent.message_id;
			}
		},

		async toast(text, options = {}) {
			if (!params.callbackQueryId || answered) return;
			answered = true;
			await params.telegram.answerCallbackQuery({
				callbackQueryId: params.callbackQueryId,
				text: text.slice(0, 190),
				showAlert: options.alert,
			});
		},

		async deleteMessage(messageId) {
			await params.telegram.deleteMessage(params.chat.id, messageId);
		},

		async deleteUserMessage() {
			if (!params.userMessageId) return;
			await params.telegram.deleteMessage(params.chat.id, params.userMessageId);
		},

		async requireBinding() {
			if (ctx.binding) return ctx.binding;
			await renderBindPrompt(ctx);
			return null;
		},

		async updateSession(mutator) {
			const base: SessionRecord = ctx.session ?? { flow: 'bind', step: 'start', data: {}, updatedAt: Date.now() };
			const next = mutator(base);
			if (next === null) {
				ctx.session = null;
				await params.store.clearSession(params.chat.id);
				return;
			}
			ctx.session = next;
			await params.store.saveSession(params.chat.id, next);
		},

		async handleApiError(error, options = {}) {
			if (error.kind === 'unauthorized') {
				ctx.binding = null;
				await params.store.clearBinding(params.chat.id);
				await params.store.clearSession(params.chat.id);
				ctx.session = null;
				await renderBindPrompt(ctx, 'API Key 已失效或已被删除，请重新绑定后再试。');
				return;
			}

			const title = error.kind === 'rate_limited' ? '⏳ 请求过于频繁' : error.kind === 'network' ? '🌐 网络异常' : '⚠️ 操作失败';
			const hint =
				error.kind === 'rate_limited'
					? 'Shortly 限流了，请稍等一会儿再重试。'
					: error.kind === 'network'
						? '无法连接 Shortly API，请检查网络后重试。'
						: '如果问题持续出现，请稍后再试。';

			await ctx.render({
				text: [`<b>${title}</b>`, '', escapeHtml(error.message), '', `<i>${hint}</i>`].join('\n'),
				keyboard: markup([
					options.retryCallback ? [button(options.retryLabel ?? BTN.retry, options.retryCallback)] : null,
					navRow({ back: options.backCallback ?? null }),
				]),
			});
		},

		async ack() {
			if (!params.callbackQueryId || answered) return;
			answered = true;
			await params.telegram.answerCallbackQuery({ callbackQueryId: params.callbackQueryId });
		},
	};

	return ctx;
}

/** Renders a compact "I didn't get that" screen; works with or without a binding. */
async function renderFallbackGuide(ctx: BotContext): Promise<void> {
	await ctx.render(
		{
			text: [
				'<b>没认出这条输入</b>',
				'',
				'直接点下方按钮就能完成大部分操作：新建短链、查看短链、临时邮箱、账号与设置。',
				'',
				`需要帮助可以点 ${BTN.help}。`,
			].join('\n'),
			keyboard: markup([[button(BTN.home, 'nav:home')], [button(BTN.help, 'nav:help')]]),
		},
		{ withReplyKeyboard: true },
	);
}

function buildServices(env: Bindings, deps: DispatcherDeps) {
	return {
		store: createStore(env),
		api: createShortlyApi(env, deps.fetchImpl),
		telegram: createTelegramClient(env, deps.fetchImpl),
	};
}

type Services = ReturnType<typeof buildServices>;

async function handleCallback(env: Bindings, services: Services, query: TelegramCallbackQuery, deps: DispatcherDeps): Promise<void> {
	const { store, api, telegram } = services;

	if (!query.message) {
		await telegram.answerCallbackQuery({ callbackQueryId: query.id, text: '请从聊天窗口中操作。' });
		return;
	}

	const chat = query.message.chat;
	const action = parseCallbackData(query.data);

	const ctx = createContext({
		env,
		store,
		api,
		telegram,
		chat,
		user: query.from,
		origin: deps.origin ?? '',
		binding: await store.getBinding(chat.id),
		session: await store.getSession(chat.id),
		callbackQueryId: query.id,
		sourceMessageId: query.message.message_id,
	});

	if (!action) {
		await ctx.toast('这个按钮已过期，请重新打开菜单。');
		return;
	}

	if (!store.takeRateLimitToken(chat.id)) {
		await ctx.toast('操作太频繁，请稍后再试。');
		return;
	}

	if (action.kind === 'noop') {
		await ctx.ack();
		return;
	}

	const registry = getRegistry();
	const handler = registry.callbacks.get(action.kind);

	if (!handler) {
		await ctx.toast('该功能暂不可用。');
		return;
	}

	if (requiresBinding(action.kind) && !ctx.binding) {
		await ctx.toast('请先绑定 API Key。');
		await renderBindPrompt(ctx);
		return;
	}

	const actorCheckedCallback = requiresBinding(action.kind) || (action.kind === 'bind:start' && Boolean(ctx.binding));
	if (actorCheckedCallback && !isActorAuthorized(ctx)) {
		await ctx.toast('只有绑定者本人可以使用这个操作，请在私聊中操作。', { alert: true });
		return;
	}

	try {
		await handler(ctx, action);
	} catch (error) {
		console.error(`Callback handler failed for ${action.kind}:`, error);
		try {
			await ctx.toast('操作失败，请重试。');
		} catch {
			/* ignore */
		}
	} finally {
		await ctx.ack();
	}
}

function parseCommand(text: string): { command: string; args: string[] } | null {
	const match = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text);
	if (!match) return null;
	const command = match[1].toLowerCase();
	const rest = (match[2] ?? '').trim();
	return { command, args: rest ? rest.split(/\s+/) : [] };
}

async function handleTextMessage(env: Bindings, services: Services, message: TelegramMessage, deps: DispatcherDeps): Promise<void> {
	const { store, api, telegram } = services;
	const chat = message.chat;
	const rawText = message.text?.trim();
	if (!rawText) return;

	const ctx = createContext({
		env,
		store,
		api,
		telegram,
		chat,
		user: message.from,
		origin: deps.origin ?? '',
		binding: await store.getBinding(chat.id),
		session: await store.getSession(chat.id),
		userMessageId: message.message_id,
	});

	const registry = getRegistry();
	const parsedCommand = parseCommand(rawText);
	const labelAlias = REPLY_LABEL_ALIASES[rawText];

	const aliasKey = parsedCommand?.command ?? labelAlias ?? null;
	const args = parsedCommand?.args ?? [];

	if (aliasKey) {
		const aliasHandler = registry.aliases.get(aliasKey);
		if (!aliasHandler) {
			await renderFallbackGuide(ctx);
			return;
		}

		if (!PUBLIC_ALIASES.has(aliasKey) && !ctx.binding) {
			await renderBindPrompt(ctx);
			return;
		}

		if (isAliasProtectedFromOtherMembers(aliasKey, ctx) && !isActorAuthorized(ctx)) {
			await ctx.render({
				text: '<b>只有绑定者本人可以使用这个操作</b>\n\n当前是群聊会话，请在私聊中操作，或让绑定者本人发送指令。',
				keyboard: markup([navRow({})]),
			});
			return;
		}

		try {
			await aliasHandler(ctx, args);
		} catch (error) {
			console.error(`Alias handler failed for /${aliasKey}:`, error);
			await ctx.render({
				text: '<b>操作失败</b>\n\n处理这条指令时出现异常，请重试或回到主页。',
				keyboard: markup([navRow({})]),
			});
		}
		return;
	}

	if (ctx.session) {
		const inputHandler = registry.textInputs[ctx.session.flow];
		if (inputHandler) {
			// Same authorisation gate as callbacks/aliases: in group chats a wizard opened by
			// the owner must not be driven (e.g. rebinding the chat) by another member.
			if (!isActorAuthorized(ctx)) {
				await ctx.render({
					text: '<b>只有绑定者本人可以使用这个操作</b>\n\n当前是群聊会话，请在私聊中操作，或让绑定者本人继续。',
					keyboard: markup([navRow({})]),
				});
				return;
			}

			// Show "typing" while we may hit the API (e.g. binding a key).
			if (isPrivateChat(chat)) await telegram.sendChatAction(chat.id);
			try {
				await inputHandler(ctx, rawText, ctx.session);
			} catch (error) {
				console.error(`Text input handler failed for flow ${ctx.session.flow}:`, error);
				await ctx.render({
					text: '<b>操作失败</b>\n\n保存这条输入时出现异常，请重试。',
					keyboard: markup([navRow({})]),
				});
			}
			return;
		}
	}

	await renderFallbackGuide(ctx);
}

/**
 * Entry point used by the Hono webhook route. Never throws: Telegram must get a
 * 200 even when a handler fails, otherwise it retries the same update forever.
 */
export async function handleUpdate(env: Bindings, update: TelegramUpdate, deps: DispatcherDeps = {}): Promise<void> {
	if (!update || typeof update.update_id !== 'number') return;

	const services = buildServices(env, deps);
	if (await services.store.isDuplicateUpdate(update.update_id)) return;

	try {
		if (update.callback_query) {
			await handleCallback(env, services, update.callback_query, deps);
		} else if (update.message?.text) {
			await handleTextMessage(env, services, update.message, deps);
		}
	} catch (error) {
		console.error('Unhandled bot update error:', error);
		// Handlers answer the callback themselves (ctx.ack/toast); only failures need a best-effort ack.
		if (update.callback_query) {
			await services.telegram
				.answerCallbackQuery({ callbackQueryId: update.callback_query.id, text: '操作失败，请重试。' })
				.catch(() => undefined);
		}
	}
}
