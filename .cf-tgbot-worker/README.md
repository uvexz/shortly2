# Shortly Telegram Bot Worker

基于 **Cloudflare Workers + Hono** 的 Telegram Bot，把 Shortly 的短链与临时邮箱能力搬到 Telegram 对话里：除了「目标链接 / 自定义前缀 / 自定义数字 / API Key」这类天生自由的输入，其余操作全部可以通过按钮完成。

- 交互契约：[`DESIGN.md`](./DESIGN.md)（流程、回调数据、屏幕文案以它为准）
- 后端接口：只调用 Shortly 现有 `/v1/**`，不新增公开 API、不改数据库
- 部署契约（不能变）：`GET /`、`GET /email-detail/:token`、`POST /webhook`

## 和主程序的职责边界

| 能力                                                         | 由谁负责                                             |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| 新邮件主动推送（含 `email:read / delete / detail` 内联按钮） | Shortly 主程序 `src/lib/telegram.ts`                 |
| 后台「API Key → Telegram chat」绑定关系                      | Shortly 主程序 `POST /v1/integrations/telegram/bind` |
| 本 Worker 里的按钮交互、向导、列表、详情、一次性网页         | 本 Worker                                            |
| Bot 侧保存的 API Key（KV）                                   | 本 Worker（`b:<chatId>`）                            |

> 主程序侧的绑定用于「往这个 chat 推新邮件」；Worker 侧的 KV 绑定用于「这个 chat 调 `/v1`」。两者互相独立：在 Bot 里解除本地绑定不会停止主程序的通知推送。

## 功能一览

| 模块         | 入口                                      | 说明                                                         |
| ------------ | ----------------------------------------- | ------------------------------------------------------------ |
| 主页         | `/start`、`/menu`、回复键盘               | 绑定状态、默认域名、所有功能入口                             |
| API Key 绑定 | `🔑 绑定 API Key`、`/setkey <key>`        | 绑定成功后立即删除含 Key 的消息，只显示掩码指纹              |
| 新建短链     | `➕ 新建短链`、`/short`                   | 6 步向导：目标 → 短链标识 → 域名 → 有效期 → 点击上限 → 确认  |
| 我的短链     | `🔗 我的短链`、`/links [page]`            | 分页列表（每页 5 条）、详情页复制/打开                       |
| 新建邮箱     | `✉️ 新建邮箱`、`/email [prefix] [domain]` | 随机/自定义前缀 + 域名选择 + 确认                            |
| 我的邮箱     | `📬 我的邮箱`、`/emails [page]`           | 邮箱列表 → 收件箱（每页 5 封）→ 邮件详情                     |
| 邮件操作     | 邮件详情页                                | 自动标记已读、一次性完整邮件网页、删除确认                   |
| 删除邮箱     | `🗑 删除邮箱`、`/delete <邮箱地址>`        | 二次确认，按 mailbox **UUID** 删除                           |
| 账号         | `📊 我的账号`、`/me`                      | 绑定状态 / key 指纹 / 默认域名 / 解除本地绑定                |
| 设置         | `⚙️ 设置`、`/settings`                    | 本 chat 的默认短链域名与默认邮箱域名（存 KV `cfg:<chatId>`） |
| 帮助         | `❓ 帮助`、`/help`                        | 功能说明 + 每个功能的直达按钮                                |
| 旧通知回调   | 主程序推送的邮件通知                      | `email:read` / `email:delete` / `email:detail` 继续可用      |

设计约束：菜单原地 `editMessageText`（不刷屏）、私聊附带持久回复键盘、复制用 `copy_text`（Bot API 7.11+，同时保留 `<code>` 文本兜底）、破坏性操作二次确认、失败页永远有出口（重试/返回/主页）。

## 交互地图

### 主页

未绑定时只提供绑定与帮助：

```
🔑 绑定 API Key | ❓ 帮助
```

已绑定后（私聊同时下发持久回复键盘）：

```
[➕ 新建短链] [✉️ 新建邮箱]
[🔗 我的短链] [📬 我的邮箱]
[📊 我的账号] [⚙️ 设置] [❓ 帮助]
```

### 短链

```
➕ 新建短链
   └─ target   发送要缩短的链接（唯一需要打字的步骤）
      └─ slug     🎲 随机 / ✏️ 自定义（打字）/ 下一步
         └─ domain   域名按钮（来自 /v1/domains）
            └─ expiry   永久 / 1h / 1d / 1w / 1m / 3m / 6m / 1y
               └─ clicks   不限 / 10 / 100 / 1000 / 自定义（1..1,000,000）
                  └─ confirm   ✅ 创建 / ✏️ 返回修改 / ❌ 取消
                     └─ 成功页：📋 复制 / 🌐 打开 / ➕ 再建一个 / 🔗 我的短链 / 🏠 主页

🔗 我的短链
   └─ 列表（每页 5 条，[详情 N] 进入）
      └─ 详情：📋 复制（copy_text）/ 🌐 打开 / ◀ 返回列表 / 🏠 主页
```

- 创建失败（400 / 409 / 429 / 网络）：保留草稿，提供 `🔁 重试 / ✏️ 修改 / ❌ 取消`。
- 草稿过期（KV 无 session）：任何 `link:*` 回调回落到「草稿已过期」页 → `➕ 重新开始`。
- `/short <url> [slug] [domain]` 跳过向导直接创建（兼容旧行为）。

### 临时邮箱

```
✉️ 新建邮箱
   └─ prefix   🎲 换一个 / ✏️ 自定义（打字）/ 下一步
      └─ domain   域名按钮（展示 minLocalPartLength 提示）
         └─ confirm   ✅ 创建 / ✏️ 修改 / ❌ 取消
            └─ 成功页：📋 复制 / 📬 收件箱 / ✉️ 再建一个 / 🏠 主页

📬 我的邮箱
   └─ 邮箱列表（地址 · 未读/总数，每页 5 个）
      └─ 邮箱详情：📨 查看邮件 / 🗑 删除邮箱 / ◀ 返回 / 🏠 主页
         └─ 收件箱（每页 5 封，未读邮件进入详情时自动标记已读）
            └─ 邮件详情：🌐 完整邮件（一次性网页）/ 🗑 删除 / ◀ 返回邮件列表 / 🏠 主页
```

- 删除邮箱：二次确认（`mail:del` → `mail:delok`），调 `DELETE /v1/emails/<UUID>`。
- 删除邮件：二次确认（`msg:del` → `msg:delok`）。
- `/email [prefix] [domain]` 跳过向导直接创建（兼容旧行为）。
- `/delete <邮箱地址>`：翻页查找（limit 100，最多 5 页）→ 找到 mailbox UUID → 确认删除。

### 新邮件通知（主程序推送）

主程序推送的消息自带内联按钮，Worker 处理三种回调：

| 回调                       | 行为                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `email:read:<messageId>`   | 标记已读，原通知键盘换成 `🗑 删除 / 🌐 完整邮件`，并 toast                                                         |
| `email:delete:<messageId>` | 第一次点击把原消息键盘换成 `⚠️ 确认删除 / ❌ 取消`（callback 仍为 `email:delete:<id>`）；确认后删除邮件并移除键盘 |
| `email:detail:<messageId>` | 渲染邮件详情页（等同 `msg:view`），含一次性网页按钮                                                               |

一次性网页：`GET /email-detail/<token>`，token 10 分钟有效、读取即失效；页面沿用旧样式并补齐 cc / replyTo / 附件，HTML 正文在 `sandbox` iframe 中渲染（**不加** `allow-scripts`）。

## 绑定 API Key

1. 打开 Shortly 后台「API Key」页面，创建一个 Key。
2. 在 Bot 里点 `🔑 绑定 API Key`，然后**把 Key 作为一条普通消息发给 Bot**。
3. Worker 校验收到的文本：长度 8..200、无空白；随后调用 `POST /v1/integrations/telegram/bind`。
4. 成功：先删除你那条含 Key 的消息（best effort）→ KV 写入 `b:<chatId>`（含掩码指纹 `keyHint`）→ 渲染成功页 + 持久回复键盘。
5. 失败（401 / 409 / 网络）：提示原因 + `🔁 重试 / ❌ 取消`，**不会保存 Key**。

Key 永远不会写日志、不会完整回显；任何界面只显示 `${key.slice(0,4)}…${key.slice(-4)}`。

也可以直接 `/setkey <key>`（命令消息同样会被删除）。

## 群聊与权限

- 私聊下发持久回复键盘；群聊只用内联键盘（不显示回复键盘）。
- **群聊里只有绑定者本人**（绑定时记录的 Telegram user id，`ownerUserId`）能使用受保护功能：新建短链/邮箱、列表与详情、账号、设置、收件箱等；其他成员点击会被拒绝，且不会调用 `/v1`。
- 公开入口任何群成员都能用：主页、帮助、绑定/取消（`/start`、`/menu`、`/home`、`/help`、`/cancel`、`/setkey`、`/bind`）。
- 群聊首次绑定：任一群成员点 `🔑 绑定 API Key` 或发 `/setkey <key>`，成功写入 Key 的人即成为该群绑定的 owner。
- 旧版本留下的“无 owner”绑定（没有 `ownerUserId`）升级后继续兼容放行（日志会打印 warning）；建议在私聊重新绑定一次，让群聊也获得 owner 保护。
- `📊 我的账号` / `/me` 会展示 key 指纹，因此**不对群成员公开**：未绑定时先走绑定引导，非 owner 会被拒绝。
- 已绑定的群聊里，只有绑定者本人能重新绑定（`/setkey`、`/bind`、`🔑 更换 API Key`）；尚未绑定的群聊里，任一群成员都可以先完成绑定并成为 owner。如果群里有不可信成员，请只在私聊使用 Bot。
- 单人使用建议在私聊里操作；群聊更适合接收邮件通知与只读浏览。

## 命令快捷方式

命令只是按钮的快捷方式，不是主路径：

| 命令                                 | 等价按钮 / 说明                 |
| ------------------------------------ | ------------------------------- |
| `/start`、`/menu`、`/home`           | 主页（未绑定则显示绑定引导）    |
| `/help`                              | `❓ 帮助`                       |
| `/setkey <key>`、`/bind`             | `🔑 绑定 API Key`               |
| `/short`                             | 新建短链向导                    |
| `/short <url> [slug] [domain]`       | 跳过向导直接创建                |
| `/links [page]`                      | `🔗 我的短链`                   |
| `/email`、`/email [prefix] [domain]` | 新建邮箱向导 / 跳过向导直接创建 |
| `/emails [page]`                     | `📬 我的邮箱`                   |
| `/delete <邮箱地址>`                 | 删除邮箱（二次确认）            |
| `/me`、`/account`                    | `📊 我的账号`                   |
| `/settings`                          | `⚙️ 设置`                       |
| `/cancel`                            | 取消当前向导                    |

私聊里的持久回复键盘（`➕ 新建短链`、`✉️ 新建邮箱`、`🔗 我的短链`、`📬 我的邮箱`、`📊 我的`、`⚙️ 设置`、`❓ 帮助`）点击后等价于对应命令。

可选：在 @BotFather 里用 `/setcommands` 让命令出现在输入框提示中：

```text
start - 打开主页
short - 新建短链
links - 我的短链
email - 新建临时邮箱
emails - 我的邮箱
delete - 删除邮箱
me - 我的账号
settings - 设置
help - 帮助
cancel - 取消当前操作
setkey - 绑定 API Key
```

## 环境变量

| 变量                       | 必需 | 说明                                                                                                                       |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`       | ✅   | BotFather 的 Bot Token，用 `wrangler secret put` 注入                                                                      |
| `TELEGRAM_WEBHOOK_SECRET`  | 推荐 | 与 `setWebhook` 的 `secret_token` 一致；设置后校验 `X-Telegram-Bot-Api-Secret-Token`，不匹配返回 401；未设置仍兼容但会告警 |
| `API_BASE_URL`             | ✅   | Shortly `/v1` 根地址，如 `https://shortly.example.com/v1`                                                                  |
| `DEFAULT_SHORT_DOMAIN`     | 可选 | 逗号分隔，`/v1/domains` 失败/为空时的兜底                                                                                  |
| `DEFAULT_EMAIL_DOMAIN`     | 可选 | 同上                                                                                                                       |
| `DOMAIN_CACHE_TTL_SECONDS` | 可选 | `/v1/domains` 的 KV 缓存秒数，默认 `600`                                                                                   |
| `STRICT_UPDATE_DEDUPE`     | 可选 | `true` 时额外用 KV（5 分钟 TTL）做 `update_id` 去重；更稳但多耗 KV 写额度                                                  |
| `TGBOT_KV`                 | ✅   | KV binding（不是 secret），在 `wrangler.jsonc` 里配置                                                                      |

`DEFAULT_*` 只是**兜底**：Worker 优先请求 `GET /v1/domains`，使用 Shortly 后台当前启用的默认域名；接口不可用时才回退到环境变量。

### KV 里存了什么

| key              | 内容                                              | TTL                                                                                |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `b:<chatId>`     | API Key 绑定（含 `keyHint`）                      | 永久                                                                               |
| `s:<chatId>`     | 向导草稿 / 等待输入状态                           | 30 分钟（每次保存续期）                                                            |
| `cfg:<chatId>`   | 本 chat 的默认域名                                | 永久                                                                               |
| `dom:v1`         | 域名列表缓存                                      | KV 存 1 小时；`fetchedAt` 超过 `DOMAIN_CACHE_TTL_SECONDS`（默认 600 秒）即重新拉取 |
| `edt:<token>`    | 一次性邮件详情 token                              | 10 分钟，读取即删                                                                  |
| `upd:<updateId>` | update 去重标记（仅 `STRICT_UPDATE_DEDUPE=true`） | 5 分钟                                                                             |

> 免费额度是「读多写少」：域名缓存命中、普通翻页都不会写 KV，只有向导状态变化才会写。

## 部署

前置条件：Shortly 主程序已部署且 `/v1` 可访问；已通过 @BotFather 创建 Bot；有 Cloudflare 账号。

```bash
cd .cf-tgbot-worker

# 1) 安装依赖（本机沙箱需要可写的 TMPDIR，见下文「本地测试」）
bun install

# 2) 生成实际配置文件（wrangler.jsonc 已被 .gitignore 忽略）
cp wrangler.example.jsonc wrangler.jsonc
#    编辑 wrangler.jsonc：API_BASE_URL / DEFAULT_* / DOMAIN_CACHE_TTL_SECONDS / STRICT_UPDATE_DEDUPE

# 3) 创建 KV 命名空间，把返回的 id 填进 wrangler.jsonc 的 kv_namespaces[0].id
bunx wrangler kv namespace create TGBOT_KV

# 4) 写入两个 secret（推荐都设置）
bunx wrangler secret put TELEGRAM_BOT_TOKEN
bunx wrangler secret put TELEGRAM_WEBHOOK_SECRET

# 5) 部署
bun run deploy
```

### 注册 Webhook

部署完成后把 Worker 地址注册给 Telegram，`secret_token` 必须与 `TELEGRAM_WEBHOOK_SECRET` 完全一致：

```bash
export TELEGRAM_BOT_TOKEN='<bot-token>'
export TELEGRAM_WEBHOOK_SECRET='<webhook-secret>'
export WORKER_URL='https://shortly-telegram-bot-worker.<你的子域>.workers.dev'

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{
    \"url\": \"${WORKER_URL}/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"],
    \"drop_pending_updates\": true
  }"
```

返回 `{"ok":true,...}` 即成功。随后自检：

```bash
# Worker 健康检查（应返回 Shortly Telegram Bot Worker is running!）
curl -sS "${WORKER_URL}/"

# Webhook 状态（url / pending_update_count / last_error_message）
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# 实时日志
bunx wrangler tail
```

最后在 Telegram 里对 Bot 发 `/start`，应该看到绑定引导或主页。

> 自定义域名：在 Cloudflare Dashboard 给 Worker 配好 Custom Domain 后，把 `setWebhook` 的 URL 换成 `https://<你的域名>/webhook` 即可，路径必须保持 `/webhook`。

## 升级

1. 拉取代码并安装依赖：`cd .cf-tgbot-worker && bun install`。
2. 对比 `wrangler.example.jsonc`，把新增的 `vars`（如 `DOMAIN_CACHE_TTL_SECONDS`、`STRICT_UPDATE_DEDUPE`）补进本地 `wrangler.jsonc`（都是可选项，不补也能跑）。
3. `bun run deploy`。KV 数据、binding 关系、webhook 地址都不受部署影响。
4. **首次启用 `TELEGRAM_WEBHOOK_SECRET` 时**：先 `bunx wrangler secret put TELEGRAM_WEBHOOK_SECRET`，再重新执行一次 `setWebhook`（带相同的 `secret_token`）。否则 Telegram 仍不带 header，Worker 会返回 401。
5. 升级后按「注册 Webhook」里的自检步骤确认 `getWebhookInfo` 没有 `last_error_message`，再发 `/start` 验证。
6. 出问题时快速回滚：`bunx wrangler rollback`（回滚代码，不动 KV）。

兼容性说明：

- 旧路径与旧回调不变：`GET /`、`GET /email-detail/:token`、`POST /webhook`、`email:read|delete|detail:<id>`。
- 旧命令仍可用；它们只是按钮的快捷方式。
- 已存在的 KV 数据（`b:`、`s:`、`cfg:`）格式向后兼容，不需要清理。

## 故障排查

| 现象                             | 排查方向                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bot 完全没反应                   | `getWebhookInfo` 看 `last_error_message`；`wrangler tail` 看请求是否到达；检查 `setWebhook` URL 是否为 `.../webhook`                 |
| 所有 update 都 401               | Webhook 的 `secret_token` 与 `TELEGRAM_WEBHOOK_SECRET` 不一致（或设置了 secret 却没有重新 setWebhook）                               |
| 点按钮提示「请先绑定 API Key」   | KV 绑定丢失（`b:<chatId>`）：换过 KV namespace、清了 KV，或另一个 worker 环境；重新绑定即可                                          |
| 提示「API Key 已失效或已被删除」 | 主程序里 Key 被删除/禁用；Worker 已自动清除本地绑定，重新 `🔑 绑定 API Key`                                                          |
| `setWebhook` 返回 400            | URL 必须是公网 HTTPS；`secret_token` 只允许 `A-Za-z0-9_-`，1–256 字符                                                                |
| 域名下拉不是后台配置的域名       | `/v1/domains` 失败或缓存未过期（默认 10 分钟）；看 `wrangler tail` 的 `/v1` 报错，或清 KV `dom:v1` / 调小 `DOMAIN_CACHE_TTL_SECONDS` |
| 短链/邮箱列表一直是空的          | 确认 `API_BASE_URL` 指向当前主程序、Key 有权限；用 `curl -H "Authorization: Bearer <key>" <API_BASE_URL>/links` 对照                 |
| 按钮点击后消息没变化             | 内容与旧消息完全一致时 Telegram 返回 `message is not modified`，属正常；若 `message to edit not found` 会回退为发送新消息            |
| 频繁提示「操作太频繁」           | 每 chat 10 秒最多 20 次回调，稍等再点                                                                                                |
| 复制按钮没有反应                 | `copy_text` 需要 Telegram 客户端支持 Bot API 7.11+；旧客户端请用消息里的 `<code>` 文本手动复制                                       |
| 邮件详情网页 410                 | token 一次性且 10 分钟过期，回 Telegram 重新点 `🌐 完整邮件`                                                                         |
| `wrangler deploy` 报 KV 未绑定   | `wrangler.jsonc` 的 `kv_namespaces[0].id` 还是占位符，换成真实 namespace id                                                          |
| 本地 `wrangler dev` 外呼失败     | `.dev.vars` 里配置 `TELEGRAM_BOT_TOKEN` / `API_BASE_URL`；本地默认会真的请求 Telegram 与主程序                                       |

## 本地开发与测试

### 本地跑 Worker

```bash
cd .cf-tgbot-worker
cp wrangler.example.jsonc wrangler.jsonc   # 首次
cat > .dev.vars <<'EOF'
TELEGRAM_BOT_TOKEN=<bot-token>
API_BASE_URL=http://127.0.0.1:3000/v1
TELEGRAM_WEBHOOK_SECRET=dev-secret
EOF
bun run dev
```

`wrangler dev` 默认在 `http://127.0.0.1:8787`，用 curl 模拟一条 update：

```bash
curl -sS -X POST 'http://127.0.0.1:8787/webhook' \
  -H 'content-type: application/json' \
  -H 'x-telegram-bot-api-secret-token: dev-secret' \
  -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":123456789,"type":"private"},"from":{"id":123456789,"first_name":"Dev"},"text":"/start"}}'
```

### 测试与检查（只用 bun）

```bash
cd .cf-tgbot-worker

# 单元 + 端到端模拟测试（bun:test）
TMPDIR="$PWD/.tmp" bun test

# 类型检查（strict）
TMPDIR="$PWD/.tmp" bunx tsc --noEmit

# 代码风格（tabs / 单引号 / printWidth 140）
bun run check          # = prettier --check src test

# 打包验证（不真正部署）
TMPDIR="$PWD/.tmp" bunx wrangler deploy --dry-run --outdir .tmp/dist --config wrangler.example.jsonc
```

> **沙箱提示**：`bun install` / `bun test` / wrangler 需要可写的临时目录。本仓库约定把临时文件放在 `.cf-tgbot-worker/.tmp`（已 gitignore），所以命令前面统一加 `TMPDIR="$PWD/.tmp"`。安装依赖时如需指定缓存：`TMPDIR="$PWD/.tmp" BUN_INSTALL_CACHE_DIR="$PWD/.tmp/cache" bun install`。
>
> `bun run check` 使用本目录 `devDependencies.prettier`（随 `bun install` 安装；Prettier 只做格式检查，不是运行时依赖）。

### 测试结构

| 文件                  | 内容                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/harness.ts`     | FakeKV（含 TTL）、fake fetch（记录 + 可脚本化 Telegram/Shortly 响应与错误）、update 驱动器、按钮/API/KV 断言助手、数据工厂                                                            |
| `test/flows.test.ts`  | Webhook 鉴权、主页、绑定（成功/401/格式错误/`/setkey`）、账号与解绑、设置与域名缓存、未绑定拦截、update 去重、频控、每次点击只 ack 一次、群聊 owner 权限、`/` 与 `/email-detail` 契约 |
| `test/unit.test.ts`   | callback-data 解析与 64 字节上限、格式化、runtime config、`/v1` 客户端错误映射、Telegram 客户端 429/not-modified、KV store（TTL/去重/频控/token）、域名解析回退                       |
| `test/wizard.test.ts` | 短链与邮箱向导全流程、列表分页、详情 `copy_text`、邮件自动已读/删除、旧通知回调、草稿过期、401 自动清绑定、一次性邮件详情页                                                           |

当前共 **104** 个用例（`bun test` 全绿）：flows 45 + unit 37 + wizard 22（数字随实现演进可能变化，以 `bun test` 输出为准）。

测试约定：

- 每个用例通过 `createHarness()` 拿到独立 env + 独立 KV；`resetBotMemory()` 清理进程内 update 去重与频控（Worker 的模块级 Map）。
- 断言以结构为主：`callback_data`、`/v1` 请求的 method/path/query/body、KV 内容、是否删除含 Key 的消息、toast 文案的关键词；不匹配整段屏幕文案。
- 不 mock 业务流程本身：测试驱动的是真实的 Hono 路由、dispatch、flow、store、client。

## 目录结构

```
.cf-tgbot-worker/
  src/
    index.ts            # Hono app：GET /、GET /email-detail/:token、POST /webhook
    dispatch.ts         # update 分发、ctx、鉴权门、去重、频控、错误兜底
    callback-data.ts    # 回调数据解析/构造（唯一事实来源）
    env.ts              # Bindings 与 runtime config
    telegram/           # Bot API 客户端（429 / not-modified 处理）、格式化、类型
    api/                # /v1 客户端（ApiResult 统一错误）、域名解析
    state/store.ts      # KV：binding / session / settings / 域名缓存 / token / 去重 / 频控
    ui/                 # 键盘与公共文案
    flows/              # home / bind / links / mail / account / settings / help
    web/email-detail.ts # 一次性邮件详情页
  test/                 # bun:test 夹具与用例
  DESIGN.md             # 交互契约（唯一事实来源）
  README.md             # 本文件
  wrangler.example.jsonc
```

相关主程序代码：

- 绑定接口：`src/routes/v1/integrations/telegram/bind.ts`
- 域名发现：`src/routes/v1/domains.ts`
- 短链创建：`src/routes/v1/shorten.ts`
- 临时邮箱：`src/routes/v1/emails/**`
- 主程序推送通知：`src/lib/telegram.ts`
