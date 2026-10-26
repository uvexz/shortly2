# Shortly v2

Shortly 的 TanStack Start 版本：保留 v1 的全部后端 HTTP 契约与数据库结构，重做用户工作台、管理后台与公开页 UI/UX。

## 技术栈

- **框架**：TanStack Start + TanStack Router + Vite + Nitro
- **数据请求**：TanStack Query（浏览器端调用现有 HTTP API）
- **数据库**：Drizzle ORM + `@libsql/client`（Turso / 本地 libSQL 文件）
- **认证**：Better Auth（邮箱 OTP、GitHub OAuth、Passkey；不启用邮箱密码）
- **样式**：Tailwind CSS v4 + Kumo UI 2（Base UI）+ Phosphor Icons + Inter

## 快速开始

> 本项目统一使用 **bun**。

```bash
bun install
cp .env.example .env.local
# 编辑 .env.local：至少设置 BETTER_AUTH_SECRET
bun run dev
```

打开 http://localhost:3000。

### 本地数据库

本地开发默认使用 `file:local.db`：

```env
TURSO_DATABASE_URL=file:local.db
TURSO_AUTH_TOKEN=
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<至少 32 位随机字符串>
APP_URL=http://localhost:3000
```

开发环境首次请求会自动建表（`initDb()`）。也可以手动播种测试数据：

```bash
bun run db:seed
```

`db:seed` 会创建：

- 域名 `short.local`（短链 + 临时邮箱，默认域名）
- 管理员 `admin@short.local`
- 普通用户 `user@short.local`
- 两封示例邮件

并打印 admin / member 的会话 Cookie，方便本地 API 调试。**仅在开发环境使用。**

### 使用现有 v1 Turso 数据库

v2 的 schema 与 v1 完全一致，可以直接复用：

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
```

已有表结构的数据库**不要**执行 `db:migrate` / `db:push`，否则可能与现有表冲突。v2 会按 v1 的方式读取和写入相同表。

### 初始化全新数据库

```bash
bun run db:migrate   # 应用 drizzle/0000_*.sql（含 site_setting 默认行）
# 或
bun run db:push
```

生产环境默认不在请求时自举 schema。仅当无法在部署期执行迁移时，临时设置 `DATABASE_AUTO_INIT=true`，完成后移除。

## 环境变量

| 变量                                         | 说明                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `TURSO_DATABASE_URL`                         | Turso URL 或 `file:local.db`                                          |
| `TURSO_AUTH_TOKEN`                           | Turso Token（本地文件不需要）                                         |
| `BETTER_AUTH_URL`                            | Better Auth 基础地址                                                  |
| `BETTER_AUTH_SECRET`                         | 会话签名密钥，必须配置                                                |
| `APP_URL`                                    | 站点公开地址，用于链接校验与文档示例                                  |
| `API_KEY_PEPPER`                             | API Key 哈希 pepper；留空时回退到 `BETTER_AUTH_SECRET`                |
| `BOOTSTRAP_ADMIN_EMAILS`                     | 逗号分隔邮箱，新用户首次登录时自动提升为管理员                        |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL`       | 启用邮箱验证码登录                                                    |
| `AUTH_OTP_DEV_LOG`                           | 仅开发环境；为 `true` 时启用邮箱 OTP 并把验证码打印到 dev server 日志 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`  | 启用 GitHub 登录                                                      |
| `INBOUND_EMAIL_SECRET`                       | `/v1/emails/inbound` 共享密钥，需与 Cloudflare Email Worker 一致      |
| `TELEGRAM_BOT_TOKEN`                         | 新邮件 Telegram 通知                                                  |
| `TRUST_X_FORWARDED_FOR` / `TRUST_PROXY_HOPS` | 反向代理 IP 解析                                                      |
| `DATABASE_QUERY_LOG`                         | 打印 SQL（调试用）                                                    |
| `DATABASE_AUTO_INIT`                         | 生产环境临时自举 schema                                               |

`NEXT_PUBLIC_APP_URL` 仍作为兼容回退读取，但新部署建议使用 `APP_URL`。

## 可用命令

```bash
bun run dev            # 开发服务器（3000）
bun run build          # Nitro 生产构建 → .output
bun run start          # 运行生产构建
bun run typecheck      # tsc --noEmit
bun run lint           # ESLint
bun run check          # Prettier 检查
bun run format         # Prettier + ESLint 修复
bun run db:generate    # Drizzle 迁移生成
bun run db:migrate     # 应用迁移
bun run db:push        # 直接推送 schema（谨慎用于已有库）
bun run db:studio      # Drizzle Studio
bun run db:seed        # 本地种子数据
```

## 页面结构

| 路径                   | 说明                                           |
| ---------------------- | ---------------------------------------------- |
| `/`                    | 落地页（含示例短链预览）                       |
| `/login`、`/register`  | 邮箱 OTP / GitHub / Passkey 登录注册           |
| `/dashboard`           | 仪表盘总览                                     |
| `/dashboard/links`     | 链接管理（创建、复制、日志、删除）             |
| `/dashboard/analytics` | 按链接查看真实访问事件与来源                   |
| `/dashboard/mailboxes` | 临时邮箱管理                                   |
| `/dashboard/inbox`     | 收件箱与邮件详情（TXT / HTML / 源码 / 头部）   |
| `/dashboard/api`       | API Key、端点示例、Bitwarden/Addy 别名、ShareX |
| `/dashboard/security`  | Passkey 管理                                   |
| `/dashboard/settings`  | 账户与站点信息                                 |
| `/admin/links`         | 全站链接                                       |
| `/admin/users`         | 用户封禁 / 解封                                |
| `/admin/emails`        | 全站邮箱 / 邮件 / 归档                         |
| `/admin/domains`       | 域名 CRUD、默认域名与支持能力                  |
| `/admin/settings`      | 站点名称、地址、Telegram 用户名、小时限额      |

## 后端兼容性

已按 v1 契约 1:1 平移：

- `/api/auth/**`（Better Auth catch-all）
- `/api/shorten`、`/api/links/**`、`/api/logs/**`
- `/api/emails/**`、`/api/domains`
- `/api/admin/**`（链接、用户、域名、设置、邮件、归档）
- `/api/v1/aliases`（Addy.io 兼容，含 CORS 预检）
- `/v1/keys/**`、`/v1/links`、`/v1/shorten`、`/v1/domains`
- `/v1/emails/**`、`/v1/emails/inbound`
- `/v1/integrations/telegram/bind`
- `/:slug` 短链跳转（302 / 410、点击计数、日志、过期与封顶自动删除）

现有 `.cf-email-forwarding-worker` 与 `.cf-tgbot-worker` 不需要修改。

## 与 v1 的运行时差异

- **缓存**：`unstable_cache` 替换为进程内 TTL 缓存（站点设置/域名），短链跳转不做缓存。
- **响应后任务**：Next `after()` 替换为响应后 best-effort 异步写入。
- **单会话**：保留 v1 `session.user_id` 唯一索引；Better Auth 创建新会话前会删除该用户旧会话。
- **开发 OTP**：`AUTH_OTP_DEV_LOG=true` 时在 dev server 日志打印验证码，生产环境强制禁用。

## 零后端新增带来的 UI 取舍

为保证 v1 接口与表结构完全不变，v2 没有以下数据能力：

- 全局跨链接访问趋势 / 来源占比 → 改为「最近最多 500 条链接」样本 + 按链接分析
- 链接备注 → 未实现
- 临时邮箱有效期 / 倒计时 → 未实现（地址保留到手动删除）
- 跨全部链接的服务端搜索 → 链接页对最近 500 条做客户端筛选；收件箱使用现有 `search` 参数
- 个人资料编辑 → 未实现（v1 无对应接口）

UI 会在相应位置明确标注样本范围，避免把部分数据展示成全量。

## 部署

```bash
bun run build
bun run start
```

- 通过 Nitro 部署到 Node 或任意受支持 preset。
- 设置 `BETTER_AUTH_URL` 为最终 HTTPS 地址；Passkey 需要 HTTPS（localhost 例外）。
- 反向代理需传递真实 Host / `X-Forwarded-For`，并按部署拓扑设置 `TRUST_PROXY_HOPS`。
- 已有 v1 Turso 数据库无需迁移；全新数据库先执行迁移或 push。
