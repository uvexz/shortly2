# AGENTS.md

Shortly v2：v1（Next.js）到 TanStack Start 的迁移版本。后端 HTTP 契约与数据库结构保持不变，只重做 UI/UX。

## 命令（只用 bun）

```bash
bun install
bun run dev            # 开发服务器 :3000
bun run build          # Nitro 生产构建 → .output
bun run start          # 运行生产构建
bun run typecheck      # tsc --noEmit
bun run lint           # ESLint
bun run check          # Prettier 检查
bun run format         # Prettier + ESLint 修复
bun run generate-routes
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
bun run db:seed        # 本地种子：short.local + admin/user + 示例邮件
```

## 技术栈

- TanStack Start + TanStack Router + TanStack Query + Vite + Nitro
- Tailwind CSS v4 + Kumo UI 2（Base UI）+ Phosphor Icons + Inter
- Drizzle ORM + `@libsql/client`（Turso / 本地 `file:local.db`）
- Better Auth：邮箱 OTP、GitHub OAuth、Passkey；**不启用邮箱密码**

## 目录

```
src/
  db/          schema.ts（与 v1 一致）、index.ts（libsql + initDb）
  lib/         业务逻辑、会话、缓存、API 响应、类型、格式化
  hooks/       浏览器端 TanStack Query hooks（调用现有 HTTP API）
  components/  layout / dashboard / admin / auth / landing / ui
  routes/
    api/**     v1 /api 的 1:1 平移
    v1/**      v1 /v1 的 1:1 平移
    $slug.ts   短链跳转 server route
    dashboard/ 用户工作台（layout: dashboard.tsx）
    admin/     管理后台（layout: admin.tsx）
    index / login / register
```

`src/routeTree.gen.ts` 自动生成，不要手改。

## 后端规则

- **不要新增公开 API、不要改 schema**。仪表盘统计、搜索、分析都必须基于现有接口做展示或客户端聚合，并在 UI 标注样本范围。
- 所有 v1 路由的行为、响应包装、状态码、CORS、缓存头、鉴权必须保持：
  - `/api/**` 使用 session；写操作带 origin 校验。
  - `/v1/**` 使用 API Key；`/v1/domains` 公开；`/v1/emails/inbound` 使用共享密钥。
  - `requireActiveUser` / `requireActiveAdmin` / `requireApiKeyUser` 已封装在 `src/lib/session.ts`、`src/lib/api-auth.ts`。
- TanStack Start 路由写法：`createFileRoute('/path')({ server: { handlers: { GET, POST, ... } } })`；参数通过 `({ request, params })` 获取。
- 响应统一用 `src/lib/api-response.ts` 的 `jsonResponse` / `errorResponse`。
- 现有 Cloudflare Email Worker / Telegram Worker 依赖的路径和响应不能破坏。

## 数据库

- 连接：`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`；本地可用 `file:local.db`。
- 开发环境首次请求自动建表；生产默认不自举，必要时临时 `DATABASE_AUTO_INIT=true`。
- 复用 **已有 v1 Turso 库**：直接指向即可，**不要**执行 `db:migrate` / `db:push`。
- 全新库：`bun run db:migrate`（含 `site_setting` 默认行）或 `bun run db:push`。
- `session.user_id` 是唯一索引，**单会话**是 v1 语义。`src/lib/auth.ts` 的 `session.create.before` 会先删除旧会话，勿移除。

## 认证

- `BETTER_AUTH_URL`、`BETTER_AUTH_SECRET` 必填。
- OTP 需要 `RESEND_API_KEY` / `RESEND_FROM_EMAIL`。
- 开发环境可设 `AUTH_OTP_DEV_LOG=true`，验证码打印到 dev server 日志；生产强制禁用。
- GitHub 需要 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。
- Passkey 需要 HTTPS 或 localhost。
- 管理员：`BOOTSTRAP_ADMIN_EMAILS`。

## UI 约定

- 使用 Kumo 组件（Dialog、Table、Tabs、Select、Switch、Toasty 等），Tailwind 做布局；不要引入 shadcn/Radix。
- 使用 Kumo 默认语义色（品牌蓝、Cloudflare 橙作为品牌点缀），浅色模式；主题基础样式在 `src/styles.css`，不要在 `@theme` 里覆盖 Kumo 颜色 token。
- 页面外壳：`src/components/layout/app-shell.tsx`；桌面侧栏 208px、移动端底部导航、顶栏面包屑/搜索/通知。
- 数据请求用 `src/hooks/**`，同源 `fetch` 已封装在 `src/lib/api-client.ts`；不要绕过 hooks 直连数据库。
- 错误/空态/加载态要齐全；删除操作使用 `ConfirmDialog`；复制使用 `CopyButton`；Toast 用 `src/lib/toast.ts`。
- Kumo Dialog 宽度用 `size` 属性（`lg` / `xl`），不要只靠 `max-w-*`。
- 临时邮箱 HTML 在 sandbox iframe 中渲染，不要加 `allow-scripts`。

## 零后端新增下的已知限制

- 全局跨链接趋势/来源占比 → 最近最多 500 条链接样本 + 按链接分析。
- 链接备注 → 未实现。
- 临时邮箱有效期/倒计时 → 未实现（地址保留到手动删除）。
- 链接搜索 → 最近 500 条客户端筛选；收件箱使用现有 `search`。
- 个人资料编辑 → 未实现（v1 无接口）。

## 环境变量

`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET`、`APP_URL`、`API_KEY_PEPPER`、`BOOTSTRAP_ADMIN_EMAILS`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`AUTH_OTP_DEV_LOG`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`INBOUND_EMAIL_SECRET`、`TELEGRAM_BOT_TOKEN`、`TRUST_X_FORWARDED_FOR`、`TRUST_PROXY_HOPS`、`DATABASE_AUTO_INIT`、`DATABASE_QUERY_LOG`。

完整说明见 `README.md`；迁移决策与验证记录见 `plan.md`。

## 提交前检查

```bash
bun run typecheck
bun run lint
bun run check
bun run build
```

UI 改动需在桌面与移动端各验证一遍；API 改动（当前不应发生）需用 curl 对照 v1 契约。
