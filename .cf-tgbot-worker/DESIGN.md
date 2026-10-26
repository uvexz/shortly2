# Shortly Telegram Bot — 交互优先重新设计（实现契约）

> 本文件是 `.cf-tgbot-worker` 重构的唯一契约来源。所有模块必须严格按此文件的
> 文件布局、接口签名、回调数据格式实现，避免并行开发时接口漂移。
>
> 维护者：Lead。任何偏离都必须先改本文件。

## 1. 目标

1. **交互优先**：用户几乎不需要输入命令。所有功能都有按钮入口、二级菜单、向导流程；
   只有「目标 URL / 自定义前缀 / 自定义数字 / API Key」这类天生自由的输入才允许打字。
2. **保持后端契约**：只调用既有 `/v1/**` 接口，不新增公开 API、不改数据库。
3. **保持部署契约**：`GET /`、`GET /email-detail/:token`、`POST /webhook` 路径不变；
   Shortly 主程序（`src/lib/telegram.ts`）推送的新邮件通知里使用的
   `email:read|<delete>|<detail>:<messageId>` 回调必须继续可用。
4. **旧命令仍可用**（`/start`、`/short`、`/links`、`/email`、`/emails`、`/delete`、
   `/me`、`/cancel`、`/setkey`），但命令只是按钮的快捷方式，不再是主路径。
5. **零新增运行时依赖**：只保留 `hono`，Telegram Bot API 直接 `fetch`。
6. 修复旧实现的缺陷：删除邮箱用 mailbox UUID（不是邮箱地址）、webhook 鉴权、
   update 去重、速率限制、Telegram 429 / `message is not modified` 处理、
   有效期 / 点击上限、`copy_text` 一键复制、失败可重试。

### 交互原则

- 菜单原地编辑（`editMessageText`）而不是刷屏发新消息；向导消息始终复用同一条。
- 私聊显示持久回复键盘（常驻底部大按钮）；群聊不显示回复键盘，只用内联键盘。
- 复制类操作优先用 `copy_text` 按钮（Bot API 7.11+），并保留 `<code>` 兜底。
- 长正文用 `<blockquote expandable>`；消息正文严格 < 4096 字符。
- 破坏性操作必须二次确认（`🗑 删除` → `⚠️ 确认删除`）。
- 任何失败页面都要有可继续的出口（重试 / 返回 / 主页）。
- 慢操作前发 `sendChatAction(typing)`。

## 2. 屏幕与流程

### 2.1 主页（`nav:home`）

```
🤖 Shortly 助手
<b>绑定状态</b>：已绑定（key 指纹 sk_…3f9a） / 未绑定
<b>默认域名</b>：short.ly / mail.short.ly

[➕ 新建短链] [✉️ 新建邮箱]
[🔗 我的短链] [📬 我的邮箱]
[📊 我的账号] [⚙️ 设置] [❓ 帮助]
```

未绑定时：主页只显示 `[🔑 绑定 API Key] [❓ 帮助]`。
私聊同时附带持久回复键盘（`ui/texts.ts` 的 `REPLY_KEYBOARD`）。

### 2.2 绑定 API Key（`bind:start`）

1. 点按钮 → 提示「请把 API Key 作为一条消息发给我；绑定后我会立刻删除这条消息」+ `[❌ 取消]`。
2. 用户发文本 → session flow `bind`，awaiting `apiKey`：
   - 校验格式（长度 8..200、无空白）→ 调 `POST /integrations/telegram/bind`；
   - 成功：删除用户那条含 key 的消息（best effort）、KV 写入 binding（含 keyHint）、
     清 session、渲染成功页 + 主页按钮，并下发回复键盘；
   - 失败（401/409/网络）：提示原因 + `[🔁 重试] [❌ 取消]`，**不要**保存 key。
3. `/setkey <key>` 保持兼容，行为同上（先删除命令消息）。

`keyHint` 规则：`${key.slice(0, 4)}…${key.slice(-4)}`，永不回显完整 key。

### 2.3 短链接

| 入口     | callback / 命令              |
| -------- | ---------------------------- |
| 列表     | `link:list`、`/links [page]` |
| 新建向导 | `link:new`、`/short [url]`   |
| 详情     | `link:view:<linkId>`         |

**列表**（每页 5 条，`/v1/links?page&limit=5`）：

```
🔗 我的短链（第 1/3 页 · 共 12 条）
1. short.ly/abc123 · 点击 12 · 有效
   https://example.com/…
[详情 1] [详情 2] [详情 3] [详情 4] [详情 5]
[◀ 上一页] [1/3] [下一页 ▶]
[➕ 新建短链] [🏠 主页]
```

- 空列表：引导 `[➕ 立即创建]`。
- 每条短链一个按钮 → `link:view:<id>`。

**详情**（数据来自列表项，不额外请求）：

```
🔗 short.ly/abc123
目标：https://example.com/…
状态：✅ 有效 / ⛔️ 已失效（原因）
点击：12 / 上限 100 / 创建时间 / 过期时间
[📋 复制短链 copy_text] [🌐 打开]
[◀ 返回列表] [🏠 主页]
```

**新建向导**（单条消息原地编辑，session flow `link:new`）：

| step      | 内容                                              | 按钮                                |
| --------- | ------------------------------------------------- | ----------------------------------- |
| `target`  | 请发送要缩短的链接（必填，awaiting text）         | `[❌ 取消]`                         |
| `slug`    | 随机 slug（可重掷）/ 自定义                       | `[🎲 随机] [✏️ 自定义] [下一步 ▶]`  |
| `domain`  | 域名选择（来自 `/v1/domains`，默认选中项打勾）    | 每行 1 个域名 + `[下一步 ▶]`        |
| `expiry`  | 有效期（永久 / 1h / 1d / 1w / 1m / 3m / 6m / 1y） | 选项按钮 + `[下一步 ▶]`             |
| `clicks`  | 点击上限（不限 / 10 / 100 / 1000 / 自定义）       | 选项按钮 + `[下一步 ▶]`             |
| `confirm` | 预览全部字段                                      | `[✅ 创建] [✏️ 返回修改] [❌ 取消]` |

- 选择类步骤点选后立即原地刷新（勾选状态），再点「下一步」（`link:next`）；向导内回退用 `link:back`。
- 创建成功：结果页（短链 <code> + copy_text、目标、域名、有效期、点击上限）
  - `[📋 复制] [🌐 打开] [➕ 再建一个] [🔗 我的短链] [🏠 主页]`；清 session。
- 创建失败（400/409/429/网络）：保留草稿，错误原因 + `[🔁 重试] [✏️ 修改] [❌ 取消]`。
- 自定义 slug 用 awaiting text（`step: custom-slug`），返回后回到确认/预览。
- 自定义点击上限用 awaiting text（`step: custom-clicks`），必须 1..1_000_000 的整数。
- 草稿过期（KV 无 session）：任何 `link:*` 回调都要回落到「草稿已过期」页 → `[➕ 重新开始]`。
- 直接 `/short <url> [slug] [domain]`：跳过向导直接创建（兼容旧行为）。

### 2.4 临时邮箱

| 入口               | callback / 命令                                              |
| ------------------ | ------------------------------------------------------------ |
| 邮箱列表           | `mail:list`、`/emails [page]`                                |
| 新建向导           | `mail:new`、`/email [prefix] [domain]`                       |
| 邮箱详情           | `mail:view:<mailboxId>`                                      |
| 邮件列表           | `mail:msgs:<mailboxId>:<page>`                               |
| 邮件详情           | `msg:view:<messageId>`                                       |
| 删除邮箱           | `mail:del:<id>` → `mail:delok:<id>`，或 `/delete <邮箱地址>` |
| 删除邮件           | `msg:del:<id>` → `msg:delok:<id>`                            |
| 标记已读           | `msg:read:<id>`                                              |
| 一次性完整详情网页 | `msg:detail:<id>`                                            |

- **邮箱列表**：每页 5 个，`地址 · 未读/总数` 按钮进入详情。
  空列表 → `[✉️ 立即创建]`。
- **邮箱详情**：地址（copy_text）、未读/总数、创建时间；
  `[📨 查看邮件] [🗑 删除邮箱] [◀ 返回] [🏠 主页]`。
- **邮件列表**：每页 5 封；`未读标记 + 发件人 + 主题`；空收件箱提示「等待新邮件」+ 刷新按钮。
- **邮件详情**（`GET /v1/emails/messages/<messageId>`）：
  - 头部：收件邮箱 / 发件人 / 主题 / 时间 / 附件数量；
  - 正文：优先 `text`，否则 `stripHtml(html)`；> 900 字符截断 + 「…」；
    全文用 `<blockquote expandable>` 包裹；
  - 按钮：`[✅ 标记已读]`（已读则隐藏）`[🌐 完整邮件]`（一次性网页）
    `[🗑 删除] [◀ 返回邮件列表] [🏠 主页]`；
  - 删除走二次确认 `msg:del:` → `msg:delok:`；
  - 列表页里点未读邮件进入详情时**自动**调用一次 `markRead`，然后 toast「已标记为已读」。
- **新建向导**（session flow `mail:new`）：
  - `prefix`：随机前缀（`generateRandomEmailPrefix`）+ `[🎲 换一个] [✏️ 自定义] [下一步 ▶]`；
  - `domain`：域名按钮（`/v1/domains` 的 `emailDomains`，展示 `minLocalPartLength` 提示）；
  - `confirm`：预览完整地址（copy_text）→ `[✅ 创建] [✏️ 修改] [❌ 取消]`；步骤推进用 `mail:next`、`mail:back`；
  - 创建成功：地址 + `[📋 复制] [📬 收件箱] [✉️ 再建一个] [🏠 主页]`；
  - `/email [prefix] [domain]`：跳过向导直接创建（兼容旧行为）。
- **删除邮箱（命令兼容）**：`/delete <address>` 会翻页查找（limit 100，最多 5 页），
  找到 mailbox UUID 后进入确认页；找不到提示 + 进入邮箱列表。
- **一次性网页** `GET /email-detail/:token`：token 消耗式（10 分钟 TTL），
  页面沿用旧样式但补齐 cc / replyTo / 附件，HTML 正文 iframe `sandbox` 不加 `allow-scripts`。

### 2.5 账号 / 设置 / 帮助

- **账号** `acct:show`（`/me`）：绑定状态、key 指纹、默认短链/邮箱域名、
  `[🔑 更换 API Key] [🔓 解除本地绑定] [◀ 返回]`。
  解除绑定只清 Worker 侧 KV 并说明「主程序的通知仍会发送到该会话」，
  需要二次确认（`set:unbind` → `set:unbindok`）。
- **设置** `set:show`（`/settings`）：默认短链域名、默认邮箱域名（按域名按钮选择，
  存 `cfg:<chatId>`），`[🔑 绑定/更换 Key] [◀ 返回]`。
- **帮助** `help:show`（`/help`）：功能说明 + 每个功能的入口按钮（纯内联，无需打字）。

### 2.6 通知回调兼容（来自主程序 sendMessage 的内联按钮）

解析 `email:read:<id>` / `email:delete:<id>` / `email:detail:<id>`：

- `read`：调用标记已读，编辑原通知消息的键盘为 `[🗑 删除] [🌐 完整邮件]`，toast。
- `delete`：二次确认（编辑原消息键盘为 `[⚠️ 确认删除] [❌ 取消]`，callback 仍为
  `email:delete:<id>` 以兼容；确认后再执行），成功后移除键盘并 toast。
- `detail`：渲染邮件详情页（同 `msg:view`），包含一次性网页按钮 `[🌐 完整邮件]`。

## 3. 目录结构与所有权

```
.cf-tgbot-worker/
  src/
    index.ts                # Lead · Hono app：GET /、GET /email-detail/:token、POST /webhook
    env.ts                  # Lead · Bindings / 运行配置
    dispatch.ts             # Lead · update 分发、ctx 构造、鉴权门、频控、错误兜底
    callback-data.ts        # Lead · 回调数据解析/构造（唯一事实来源）
    telegram/
      types.ts              # Lead · Telegram 类型
      client.ts             # Lead · Telegram Bot API 客户端（含 429 / not-modified 处理）
      format.ts             # Lead · escapeHtml / truncate / 时间 / 大小 / stripHtml / mask
    api/
      types.ts              # Lead · /v1 数据结构
      client.ts             # Lead · Shortly API 客户端（ApiResult 统一错误）
      domains.ts            # Lead · 域名解析（cache-first + env 兜底）
    state/
      store.ts              # Lead · KV 存储：binding / session / settings / 域名缓存 / token / 去重 / 频控
    ui/
      keyboard.ts           # Lead · button / urlButton / copyButton / pagerRow / navRow
      texts.ts              # Lead · 公共文案、回复键盘、别名映射
    flows/
      index.ts              # Lead · 模块注册表（links / mail 由队友提供）
      home.ts               # Lead
      help.ts               # Lead
      account.ts            # Lead
      settings.ts           # Lead
      bind.ts               # Lead
      links.ts              # 队友 links
      mail.ts               # 队友 mail
    web/
      email-detail.ts       # 队友 mail · 一次性邮件详情 HTML 页面
                            #   renderEmailDetailPage({ env, token, origin }) => { status, html }
  test/                     # 队友 harness
    harness.ts              # 假 KV / 假 fetch / update 驱动器 / 断言助手
    flows.test.ts           # 端到端用例（bun test）
    unit.test.ts            # 纯函数用例
  DESIGN.md                 # 本文件（Lead 维护）
  README.md                 # 队友 harness（部署/使用文档）
  wrangler.example.jsonc    # 队友 harness（新增配置项）
  package.json              # 队友 harness（scripts: test / typecheck / check）
```

## 4. 关键接口（必须逐字一致）

```ts
// src/env.ts
export type Bindings = {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_WEBHOOK_SECRET?: string;
	API_BASE_URL: string;
	TGBOT_KV: KVNamespace;
	DEFAULT_SHORT_DOMAIN?: string;
	DEFAULT_EMAIL_DOMAIN?: string;
	DOMAIN_CACHE_TTL_SECONDS?: string;
	STRICT_UPDATE_DEDUPE?: string;
};

// src/telegram/types.ts（节选）
export type TelegramUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
export type TelegramChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string; username?: string };
export type TelegramMessage = { message_id: number; date?: number; chat: TelegramChat; from?: TelegramUser; text?: string };
export type TelegramCallbackQuery = { id: string; from: TelegramUser; message?: TelegramMessage; data?: string };
export type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };
export type InlineKeyboardButton = { text: string; callback_data?: string; url?: string; copy_text?: { text: string } };
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };
export type ReplyKeyboardMarkup = {
	keyboard: Array<Array<{ text: string }>>;
	resize_keyboard?: boolean;
	is_persistent?: boolean;
	input_field_placeholder?: string;
};

// src/telegram/client.ts
export type TelegramClient = {
	sendMessage(input: {
		chatId: number;
		text: string;
		keyboard?: InlineKeyboardMarkup | ReplyKeyboardMarkup;
		disablePreview?: boolean;
	}): Promise<TelegramMessage | null>;
	editMessageText(input: {
		chatId: number;
		messageId: number;
		text: string;
		keyboard?: InlineKeyboardMarkup;
	}): Promise<'ok' | 'unchanged' | 'failed'>; // unchanged = "message is not modified"
	editMessageReplyMarkup(input: { chatId: number; messageId: number; keyboard?: InlineKeyboardMarkup }): Promise<boolean>;
	answerCallbackQuery(input: { callbackQueryId: string; text?: string; showAlert?: boolean }): Promise<void>;
	deleteMessage(chatId: number, messageId: number): Promise<boolean>;
	sendChatAction(chatId: number, action?: 'typing'): Promise<void>;
	getMe(): Promise<TelegramUser | null>;
};
export function createTelegramClient(env: Bindings, fetchImpl?: typeof fetch): TelegramClient;

// src/api/client.ts
export type ApiFailure = {
	status: number;
	message: string;
	kind: 'unauthorized' | 'rate_limited' | 'not_found' | 'bad_request' | 'server' | 'network' | 'invalid_response';
};
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };
export type ShortlyApi = { ... 见 §6 };
export function createShortlyApi(env: Bindings, fetchImpl?: typeof fetch): ShortlyApi;

// src/state/store.ts
export type BindingRecord = {
	apiKey: string;
	chatId: number;
	username?: string;
	ownerUserId?: number; // Telegram user id of whoever bound this chat (group-chat authorisation)
	boundAt: number;
	keyHint: string;
};
export type FlowName = 'bind' | 'link:new' | 'mail:new' | 'mail:delete';
export type SessionRecord = {
	flow: FlowName;
	step: string;
	awaiting?: string;
	data: Record<string, string>;
	anchorMessageId?: number;
	updatedAt: number;
};
export type ChatSettings = { defaultShortDomain?: string; defaultEmailDomain?: string };
export type BotStore = {
	getBinding(chatId: number): Promise<BindingRecord | null>;
	saveBinding(record: Omit<BindingRecord, 'keyHint'> & { keyHint?: string }): Promise<void>;
	clearBinding(chatId: number): Promise<void>;
	getSession(chatId: number): Promise<SessionRecord | null>;
	saveSession(chatId: number, session: SessionRecord): Promise<void>;
	clearSession(chatId: number): Promise<void>;
	getChatSettings(chatId: number): Promise<ChatSettings>;
	saveChatSettings(chatId: number, settings: ChatSettings): Promise<void>;
	isDuplicateUpdate(updateId: number): Promise<boolean>;
	takeRateLimitToken(chatId: number, now?: number): boolean;
	getDomainCache(): Promise<{ short: DomainInfo[]; email: DomainInfo[]; fetchedAt: number } | null>;
	saveDomainCache(value: { short: DomainInfo[]; email: DomainInfo[]; fetchedAt: number }): Promise<void>;
	createEmailDetailToken(input: { chatId: number; emailId: string }): Promise<string>;
	consumeEmailDetailToken(token: string): Promise<{ chatId: number; emailId: string } | null>;
};
export function createStore(env: Bindings): BotStore;

// src/dispatch.ts
export type Screen = { text: string; keyboard?: InlineKeyboardMarkup };
export type BotContext = {
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
	/** Id of the user's text message, so flows can delete sensitive input (API keys). */
	userMessageId?: number;
	getDomains(): Promise<ResolvedDomains>;
	render(screen: Screen, options?: { newMessage?: boolean; withReplyKeyboard?: boolean }): Promise<void>;
	toast(text: string, options?: { alert?: boolean }): Promise<void>;
	deleteMessage(messageId: number): Promise<void>;
	deleteUserMessage(): Promise<void>;
	requireBinding(): Promise<BindingRecord | null>;
	updateSession(mutator: (session: SessionRecord) => SessionRecord | null): Promise<void>;
	handleApiError(
		error: ApiFailure,
		options?: { retryCallback?: string; retryLabel?: string; backCallback?: string | null },
	): Promise<void>;
	ack(): Promise<void>;
};
export type CallbackHandler = (ctx: BotContext, action: CallbackAction) => Promise<void>;
export type TextInputHandler = (ctx: BotContext, text: string, session: SessionRecord) => Promise<void>;
export type BotModule = {
	name: string;
	callbacks?: Partial<Record<CallbackKind, CallbackHandler>>;
	textInputs?: Partial<Record<FlowName, TextInputHandler>>;
	aliases?: Record<string, (ctx: BotContext, args: string[]) => Promise<void>>;
};
```

`ctx.requireBinding()`：无绑定时它自己渲染绑定引导并返回 `null`；
分发层已对需要鉴权的 callback/alias 做统一拦截，因此 handler 里可假定非空。

## 5. 回调数据规范（≤ 64 字节，UTF-8）

`src/callback-data.ts` 导出：

```ts
export type CallbackKind =
	| 'nav:home'
	| 'nav:help'
	| 'bind:start'
	| 'bind:cancel'
	| 'link:new'
	| 'link:list'
	| 'link:view'
	| 'link:rerand'
	| 'link:slug'
	| 'link:domain'
	| 'link:expiry'
	| 'link:clicks'
	| 'link:create'
	| 'link:cancel'
	| 'link:back'
	| 'mail:new'
	| 'mail:next'
	| 'mail:list'
	| 'mail:view'
	| 'mail:msgs'
	| 'mail:rerand'
	| 'mail:prefix'
	| 'mail:domain'
	| 'mail:create'
	| 'mail:cancel'
	| 'mail:back'
	| 'mail:del'
	| 'mail:delok'
	| 'msg:view'
	| 'msg:read'
	| 'msg:del'
	| 'msg:delok'
	| 'msg:detail'
	| 'msg:back'
	| 'set:show'
	| 'set:short-domain'
	| 'set:email-domain'
	| 'set:bind'
	| 'set:unbind'
	| 'set:unbindok'
	| 'acct:show'
	| 'help:show'
	| 'noop'
	| 'legacy:email-read'
	| 'legacy:email-delete'
	| 'legacy:email-detail';
export type CallbackAction = { kind: CallbackKind; args: string[] };
export function parseCallbackData(data: string): CallbackAction | null;
export const cb: {
	home: string;
	help: string;
	bindStart: string;
	bindCancel: string;
	linkNew: string;
	linkNext: string;
	linkList: (page?: number) => string;
	linkView: (id: string) => string;
	linkRerand: string;
	linkSlug: string;
	linkDomain: (index?: number) => string;
	linkExpiry: (index?: number) => string;
	linkClicks: (value?: number | 'custom') => string;
	linkCreate: string;
	linkCancel: string;
	linkBack: string;
	mailNew: string;
	mailNext: string;
	mailList: (page?: number) => string;
	mailView: (id: string) => string;
	mailMsgs: (mailboxId: string, page?: number) => string;
	mailRerand: string;
	mailPrefix: string;
	mailDomain: (index?: number) => string;
	mailCreate: string;
	mailCancel: string;
	mailBack: string;
	mailDel: (id: string) => string;
	mailDelOk: (id: string) => string;
	msgView: (id: string) => string;
	msgRead: (id: string) => string;
	msgDel: (id: string) => string;
	msgDelOk: (id: string) => string;
	msgDetail: (id: string) => string;
	msgBack: (mailboxId: string, page: number) => string;
	setShow: string;
	setShortDomain: (index?: number) => string;
	setEmailDomain: (index?: number) => string;
	setBind: string;
	setUnbind: string;
	setUnbindOk: string;
	acctShow: string;
	noop: string;
};
```

数据示例：`nav:home`、`link:list:2`、`link:view:<36 位 id>`、`link:domain:0`、
`link:expiry:3`、`link:clicks:100`、`link:clicks:custom`、`mail:msgs:<id>:2`、
`msg:view:<id>`、`set:short-domain:1`。`legacy:email-*` 由 `email:read|delete|detail:<id>` 解析得到。

> 页面指示按钮（`1/3`）用 `noop`，点击只 toast，不重绘。

## 6. `/v1` API 契约（只读参考，勿改主程序）

| 方法   | 路径                                | 鉴权    | 请求                                                    | 响应                                                                                                            |
| ------ | ----------------------------------- | ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/domains`                          | 公开    | —                                                       | `{ emailDomains: DomainInfo[], shortDomains: DomainInfo[], telegramBotUsername }`，`Cache-Control: s-maxage=60` |
| POST   | `/shorten`                          | API Key | `{ url, customSlug?, domain?, expiresIn?, maxClicks? }` | 201 `{ shortUrl, slug, domain, maxClicks }`                                                                     |
| GET    | `/links`                            | API Key | `?page&limit`（limit ≤ 100）                            | `{ data: LinkItem[], total, page, limit, totalPages }`                                                          |
| GET    | `/emails`                           | API Key | `?page&limit`                                           | `{ data: MailboxItem[], total, page, limit, totalPages }`                                                       |
| POST   | `/emails`                           | API Key | `{ emailAddress }`                                      | 201 `{ data: MailboxItem }`                                                                                     |
| DELETE | `/emails/<mailboxId>`               | API Key | —                                                       | `{ success: true }`（**UUID**）                                                                                 |
| GET    | `/emails/<mailboxId>/messages`      | API Key | `?page&limit`                                           | `{ mailbox: { id, emailAddress }, data: MailMessageItem[], total, page, limit, totalPages }`                    |
| GET    | `/emails/messages/<messageId>`      | API Key | —                                                       | `{ data: MessageDetail }`                                                                                       |
| POST   | `/emails/messages/<messageId>/read` | API Key | —                                                       | `{ success: true }`                                                                                             |
| DELETE | `/emails/messages/<messageId>`      | API Key | —                                                       | `{ success: true }`                                                                                             |
| POST   | `/integrations/telegram/bind`       | API Key | `{ chatId, username? }`                                 | `{ success: true, data }`；409 chatId 已被占用                                                                  |

`DomainInfo = { host: string; isDefault: boolean; minSlugLength?: number; minLocalPartLength?: number }`。

错误：`{ error: string }` + 状态码。API 客户端映射：
`401 → unauthorized`、`404 → not_found`、`409/400 → bad_request`、`429 → rate_limited`、`5xx → server`、
`fetch 抛错 → network`、`JSON 解析失败 → invalid_response`。

**401 处理**：`ctx.handleApiError()` 捕获 `unauthorized` 时清 KV binding 并渲染重新绑定引导
（避免死循环）；其余错误渲染可重试的错误页（`retryCallback` 由调用方传入当前动作的
callback data）。

## 7. KV schema 与 TTL

| key              | 值                                                                                | TTL                                             |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `b:<chatId>`     | `BindingRecord`                                                                   | 永久                                            |
| `s:<chatId>`     | `SessionRecord`                                                                   | 30 分钟（每次保存续期）                         |
| `cfg:<chatId>`   | `ChatSettings`                                                                    | 永久                                            |
| `dom:v1`         | `{ short, email, fetchedAt }`                                                     | 10 分钟（可由 `DOMAIN_CACHE_TTL_SECONDS` 调整） |
| `ll:<chatId>`    | 短链列表页缓存 `{ page, total, totalPages, items[] }`（详情页只读，不额外调 API） | 30 分钟                                         |
| `edt:<token>`    | `{ chatId, emailId, createdAt }`（48 hex token）                                  | 10 分钟，读取即删                               |
| `upd:<updateId>` | `1`                                                                               | 5 分钟（仅 `STRICT_UPDATE_DEDUPE=true` 时写入） |

另外：进程内 LRU（Map）做 update 去重（10 分钟 / 200 条）与频控（10 秒窗口 / 20 次），
避免 KV 写入配额被高频操作打爆。KV 免费额度写少读多，**任何 handler 不得每次更新都写 KV**
（session 变更才写；域名缓存命中不写）。

## 8. 安全与可靠性要求

1. `TELEGRAM_WEBHOOK_SECRET` 设置后，`POST /webhook` 必须校验
   `X-Telegram-Bot-Api-Secret-Token`，不匹配返回 401；未设置时记录一次告警日志但仍工作（向后兼容）。
2. **操作者鉴权**：私聊里 chat == actor，直接允许；群聊/超级群里只有 `binding.ownerUserId`
   （绑定者本人，绑定时写入的 Telegram user id）可以驱动**受保护操作**（`requiresBinding(kind)`
   为 true 的 callback、`PUBLIC_ALIASES` 之外的命令），其他人只 toast「只有绑定者本人可以使用
   这个操作」且不调用 `/v1`。
   - **bootstrap**：未绑定的群聊放行公开入口（`nav:home`/`nav:help`/`help:show`/`bind:start`/
     `bind:cancel`、`/start`、`/help`、`/setkey`、`/bind`），否则群聊永远无法建立绑定。
   - `acct:show` 与 `/me` 属于受保护操作（会展示绑定信息），不走公开入口。
   - 旧绑定（无 `ownerUserId`）打印 warning 后放行以兼容升级。
   - `callback_query.from` 是唯一 actor 来源，不能用消息内容推断。
3. API Key 永不写日志、永不在消息里回显；绑定成功即删除用户那条含 key 的消息。
4. `update_id` 去重（进程内必做，KV 严格模式可选）。
5. 频控触发时 `answerCallbackQuery` 提示「操作太频繁」，不渲染。
6. Telegram 429：读取 `parameters.retry_after`，等待（≤ 3s）重试一次。
7. `editMessageText` 返回 `message is not modified` / `message to edit not found` 视为可忽略，
   后者回退为 `sendMessage`。
8. 整个 `handleUpdate` 外层 try/catch：记录 `console.error`，尽力 toast，
   `POST /webhook` 始终返回 200（避免 Telegram 重试风暴）；只有鉴权失败返回 401。
9. 所有 `/v1` 失败页面都必须可操作（重试/返回），不展示堆栈或内部字段。
10. 不破坏旧路径/响应：`/`、`/email-detail/:token`、`/webhook` 方法不变。

## 9. 配置与环境

| 变量                       | 必需 | 说明                                                  |
| -------------------------- | ---- | ----------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`       | ✅   | secret，`wrangler secret put`                         |
| `TELEGRAM_WEBHOOK_SECRET`  | 推荐 | secret，与 `setWebhook` 的 `secret_token` 一致        |
| `API_BASE_URL`             | ✅   | Shortly `/v1` 根地址                                  |
| `DEFAULT_SHORT_DOMAIN`     | 可选 | 逗号分隔，`/v1/domains` 失败时的兜底                  |
| `DEFAULT_EMAIL_DOMAIN`     | 可选 | 同上                                                  |
| `DOMAIN_CACHE_TTL_SECONDS` | 可选 | 默认 600                                              |
| `STRICT_UPDATE_DEDUPE`     | 可选 | `true` 时启用 KV 级 update 去重（更稳但耗 KV 写额度） |

部署步骤写进 README：`bun install` → 建 KV → `wrangler secret put` 两个 secret →
改 `wrangler.jsonc` → `bun run deploy` → `setWebhook` 带 `secret_token` → 用 `/start` 自检。

> 本机沙箱注意事项：`bun install` 需要可写的 tmp/cache，命令模板：
> `TMPDIR="$PWD/.tmp" BUN_INSTALL_CACHE_DIR="$PWD/.tmp/cache" bun install`。

## 10. 测试与验收（队友 harness 负责）

### 测试夹具

- 假 `KVNamespace`：Map 实现 `get/put/delete`，支持 TTL 语义（测试可忽略过期或 mock 时间）。
- 假 `fetch`：拦截 `https://api.telegram.org/bot*/<method>` 与 `API_BASE_URL`，
  记录请求、返回脚本化响应（可注入错误、429、409）。
- 驱动：`app.fetch(new Request('https://bot.test/webhook', { method:'POST', headers, body: JSON.stringify(update) }), env)`；
  助手 `sendText(text)`、`click('link:new')`、`expectKeyboardContains(...)`、`expectApiCalled(...)`。
- 每个用例新建 env（独立 KV）。覆盖场景：
  1. `/start` 未绑定 → 绑定引导；绑定成功（删除含 key 消息、KV 写入、回复键盘）。
  2. 绑定失败 401 → 不写 KV、可重试。
  3. 短链向导全流程：输入 URL → 随机/自定义 slug → 域名 → 有效期 → 点击上限 → 创建，
     断言 `POST /shorten` 的 body（含 `expiresIn`/`maxClicks`）。创建失败 409 → 草稿保留 + 重试。
  4. 短链列表分页与详情（copy_text 按钮存在）。
  5. 邮箱向导 → 创建 → 发件箱列表 → 邮件列表 → 详情自动已读 → 删除邮件确认。
  6. 删除邮箱用 UUID（回归旧 bug）。
  7. 旧通知回调 `email:read/delete/detail` 三个都能用；delete 需二次确认。
  8. 未绑定点受保护按钮 → 绑定引导，不发起 `/v1` 调用。
  9. webhook secret 校验（错误 401、正确 200）；重复 update_id 只处理一次。
  10. KV 无 session 时点 `link:view`/`link:create` → 「草稿已过期」页。
  11. `/email-detail/:token`：无效 token → 410；有效 token → HTML 页面 + token 失效。
  12. `/v1` 401 时自动清绑定并提示重绑。

### 命令

```bash
cd .cf-tgbot-worker
TMPDIR="$PWD/.tmp" BUN_INSTALL_CACHE_DIR="$PWD/.tmp/cache" bun install
TMPDIR="$PWD/.tmp" bun run typecheck    # tsc --noEmit
TMPDIR="$PWD/.tmp" bun run test         # bun test
TMPDIR="$PWD/.tmp" bun run check        # prettier --check src test
TMPDIR="$PWD/.tmp" BUN_INSTALL_CACHE_DIR="$PWD/.tmp/cache" \
  bunx wrangler deploy --dry-run --outdir .tmp/dist --config wrangler.example.jsonc
```

## 11. 完成定义（DoD）

- [ ] `bunx tsc --noEmit` 零错误（strict）。
- [ ] `bun test` 全绿，覆盖 §10 场景。
- [ ] `wrangler deploy --dry-run` 打包成功。
- [ ] 旧路径与旧回调兼容（`/`、`/email-detail/:token`、`/webhook`、`email:*`）。
- [ ] 所有功能都能只点按钮走通（除 URL / 前缀 / 数字 / key 输入）。
- [ ] README 更新：功能一览、交互示意图、部署与升级步骤、故障排查。
- [ ] 代码风格：Prettier（tabs、单引号、printWidth 140），中文注释只在必要处。
