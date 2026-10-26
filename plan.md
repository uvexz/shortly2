# Shortly v2 — TanStack Start 迁移施工计划

> 目标：将 v1（Next.js 16 App Router）完整迁移到 v2（TanStack Start），后端 HTTP 契约与数据库结构保持不变，只重做 UI/UX。
> 参考原型：`../orz-dashboard-prototype.html`
> 包管理器：**bun**（安装与脚本一律使用 `bun` / `bunx`）

## 1. 已确认的产品决策

- **后端零新增**：不新增接口、不改表结构；所有 `/api/**`、`/v1/**`、`/[slug]` 的路径、响应结构、状态码、CORS、缓存头、鉴权方式与 v1 完全一致。
- **数据库**：沿用 v1 的 18 张表；使用 `@libsql/client` 连接 **Turso**，本地开发使用 `file:local.db`；可直接指向现有 v1 数据库。
- **认证**：GitHub OAuth + 邮件 OTP（Resend）+ Passkey；不启用邮箱密码登录。
- **品牌**：视觉按 Orz 原型，品牌名动态读取 `site_setting.site_name`，默认 `Shortly`。
- **域名管理**：仅管理员可见（`/admin/domains`）；普通用户只在创建表单/API 文档中看到可用域名。
- **迁移范围**：公开页、登录/注册、用户工作台、管理后台、全部 API、短链跳转、临时邮箱入站、Telegram 绑定、Addy.io 兼容接口、ShareX 文档。

## 2. 零后端新增带来的原型降级

| 原型能力               | v2 处理                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| 链接备注               | 不实现（v1 无字段）                                                               |
| 临时邮箱有效期/倒计时  | 不实现（v1 无字段）；展示创建时间、复制地址、进入收件箱                           |
| 全站访问趋势、来源占比 | 不做跨链接聚合；使用「最近 100/500 条链接」真实样本并在 UI 明确标注               |
| 统计分析               | 改为按链接分析：链接选择器 + `/api/logs/:linkId` 的真实事件、状态、来源、访问日志 |
| 今日收件数             | 不实现（无聚合接口）；改为邮件总数、临时邮箱总数                                  |
| 全局搜索               | 收件箱走现有 `search` 参数；短链对最近抓取的有限条数做客户端筛选并标注范围        |
| 个人资料编辑           | 不实现（v1 无接口）；设置页展示账户信息、Passkey、API Key 入口                    |

仪表盘统计卡：

1. 短链总数（精确，`/api/links.total`）
2. 累计访问量（对最近最多 500 条链求和，超过则标注「最近 500 条」）
3. 临时邮箱总数（精确，`/api/emails.total`）
4. 邮件总数（精确，`/api/emails/messages.total`）

图表：

- 「最近链接访问表现」：最近链接按点击量排序的条形图（真实样本）。
- 「链接状态构成」：基于同一样本的有效/即将到期/已过期的分布。

## 3. 技术选型

- TanStack Start 1.169 + TanStack Router 1.170 + TanStack Query 5
- Drizzle ORM + `@libsql/client`（Turso / file）
- Better Auth 1.7 + `@better-auth/passkey` + `tanstackStartCookies`
- Tailwind CSS v4 + Kumo UI 2.15（Base UI 内核）
- Phosphor Icons
- Inter + 中文系统字体回退
- 数据获取：TanStack Query 调用 v1 同路径 HTTP API；登录态/站点配置走框架内部 server function
- 缓存：进程内 TTL 缓存替代 Next `unstable_cache`；短链跳转不缓存，避免多实例陈旧 302
- `after()`：替换为响应后 best-effort 异步写入（审计日志失败不影响主响应）

## 4. 目标目录

```
v2/
  plan.md
  .env.example
  src/
    db/
      index.ts            # libsql + drizzle + initDb
      schema.ts           # 与 v1 完全一致
    lib/
      auth.ts  auth-client.ts  session.ts  app-config.ts
      http.ts  ip.ts  rate-limit.ts  slug.ts  site-domains.ts  site-settings.ts
      shorten.ts  links.ts  link-status.ts  link-logs.ts  link-cleanup.ts
      api-auth.ts  api-keys.ts  admin-links.ts
      temp-email.ts  temp-email-prefix.ts  random-email-prefix.ts
      telegram.ts  log-events.ts  gravatar.ts  utils.ts  observability.ts
      cache.ts  server-fns.ts
    components/
      layout/    app-shell, sidebar-nav, topbar, mobile-nav, page-header
      dashboard/ stat-card, trend-chart, status-donut, activity-feed,
                 link-table, create-link-dialog, link-logs-dialog,
                 mailbox-panel, create-mailbox-dialog, message-list,
                 message-detail-dialog, api-keys-panel, passkey-panel
      admin/     admin-links, admin-users, admin-emails, admin-domains,
                 admin-settings
      ui/        confirm-dialog, pagination, copy-button, empty-state,
                 loading, status-badge, field wrappers
    hooks/        query hooks + api client
    routes/
      __root.tsx  index.tsx  login.tsx  register.tsx  $slug.ts
      dashboard.tsx
      dashboard/index.tsx  links.tsx  analytics.tsx  mailboxes.tsx
                inbox.tsx  api.tsx  security.tsx  settings.tsx
      admin.tsx
      admin/links.tsx  users.tsx  emails.tsx  domains.tsx  settings.tsx
      api/**  v1/**      # 1:1 对应 v1 路由
    styles.css
```

## 5. 后端路由清单（必须 1:1 平移）

### Dashboard Session API

- `POST /api/shorten`
- `GET /api/links`
- `DELETE /api/links/:id`
- `GET /api/logs/:linkId`
- `GET/POST /api/emails`
- `DELETE /api/emails/:id`
- `GET /api/emails/:id/messages`
- `GET /api/emails/messages`
- `GET/DELETE /api/emails/messages/:messageId`
- `POST /api/emails/messages/:messageId/read`
- `GET /api/emails/options`
- `GET /api/domains`
- `POST/OPTIONS /api/v1/aliases`

### Admin API（session + admin）

- `GET /api/admin/links`
- `GET/DELETE /api/admin/links/:id`
- `GET/POST /api/admin/domains`
- `PATCH/DELETE /api/admin/domains/:id`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `GET/POST /api/admin/settings`
- `GET /api/admin/emails/mailboxes`
- `GET /api/admin/emails/messages`
- `GET /api/admin/emails/messages/:messageId`
- `GET /api/admin/emails/archives`
- `GET /api/admin/emails/archives/:archiveId`

### Open API（API Key）

- `GET/POST /v1/keys`
- `DELETE /v1/keys/:id`
- `GET /v1/links`
- `POST /v1/shorten`
- `GET /v1/domains`
- `GET/POST /v1/emails`
- `DELETE /v1/emails/:id`
- `GET /v1/emails/:id/messages`
- `GET/DELETE /v1/emails/messages/:messageId`
- `POST /v1/emails/messages/:messageId/read`
- `POST /v1/emails/inbound`（共享密钥）
- `POST /v1/integrations/telegram/bind`（API Key）

### Auth / Redirect

- `GET/POST /api/auth/*`（Better Auth catch-all）
- `GET /:slug`（302 跳转、点击计数、过期/封顶处理、审计日志、自动删除）

## 6. UI 页面映射

| 原型视图  | v2 路由                | 数据来源                                                            |
| --------- | ---------------------- | ------------------------------------------------------------------- |
| 仪表盘    | `/dashboard`           | `/api/links`、`/api/emails`、`/api/emails/messages`、`/api/domains` |
| 链接管理  | `/dashboard/links`     | `/api/links`、`/api/shorten`、`/api/links/:id`、`/api/logs/:linkId` |
| 统计分析  | `/dashboard/analytics` | `/api/links` + `/api/logs/:linkId`（按链接）                        |
| 邮箱管理  | `/dashboard/mailboxes` | `/api/emails`、`/api/emails/options`                                |
| 收件箱    | `/dashboard/inbox`     | `/api/emails/messages`、消息详情/已读/删除                          |
| API       | `/dashboard/api`       | `/v1/keys`、`/api/domains`                                          |
| 安全      | `/dashboard/security`  | Better Auth Passkey                                                 |
| 个人设置  | `/dashboard/settings`  | session 信息 + 页面入口                                             |
| 域名管理  | `/admin/domains`       | `/api/admin/domains`（仅管理员）                                    |
| 全站链接  | `/admin/links`         | `/api/admin/links`                                                  |
| 用户管理  | `/admin/users`         | `/api/admin/users`                                                  |
| 邮件管理  | `/admin/emails`        | `/api/admin/emails/*`                                               |
| 站点设置  | `/admin/settings`      | `/api/admin/settings`                                               |
| 落地页    | `/`                    | 站点配置 + 示例短链预览                                             |
| 登录/注册 | `/login`、`/register`  | Better Auth OTP/GitHub/Passkey                                      |

管理导航仅在 `user.role === "admin"` 时显示。

## 7. 施工阶段

### Phase 1 — 地基

- [x] 依赖替换：`@libsql/client`、`@better-auth/passkey`、`resend`、`zod`、`nanoid`、Inter 字体；移除 `better-sqlite3`
- [x] `src/db/schema.ts` 对齐 v1；`src/db/index.ts` 使用 libsql/Turso + v1 `initDb` 逻辑
- [x] `.env.example` / `.env.local`；保留 v1 环境变量名
- [x] Better Auth（OTP、GitHub、Passkey、ban hooks、roles、cookie cache）
- [x] 共享 lib 移植与 Next API 解耦
- [x] Kumo + Tailwind 主题（黑白中性色）、根路由、Toasty、错误页/404
- [x] `bun run build` 通过

### Phase 2 — 后端平移

- [x] Dashboard API
- [x] Admin API
- [x] Open API + aliases + inbound + Telegram
- [x] `/:slug` 跳转
- [x] curl 契约矩阵对照 v1

### Phase 3 — 设计系统与 App Shell

- [x] 侧栏（208px / 图标折叠 / 移动端）
- [x] 顶栏、面包屑、全局搜索、通知入口、用户菜单
- [x] 页面头、卡片、状态徽章、空态、加载态、分页、确认弹窗、复制按钮

### Phase 4 — 公开页

- [x] 落地页
- [x] 登录/注册（OTP 两步、GitHub、Passkey、注册后添加 Passkey）

### Phase 5 — 用户工作台

- [x] 仪表盘
- [x] 链接管理 + 创建/日志/删除
- [x] 访问分析（按链接）
- [x] 邮箱管理
- [x] 收件箱 + 消息详情
- [x] API 管理（密钥、域名、Telegram、ShareX、Bitwarden/Addy、端点示例）
- [x] 安全（Passkey）
- [x] 设置

### Phase 6 — 管理后台

- [x] 链接
- [x] 用户（封禁/解封）
- [x] 邮件（邮箱/消息/归档）
- [x] 域名 CRUD
- [x] 站点设置

### Phase 7 — 验证与收尾

- [x] `bunx tsc --noEmit`、`bun run lint`、`bun run build`
- [x] 浏览器桌面/移动端实测
- [x] API 契约与短链跳转验证
- [x] README / 环境变量说明

## 8. 验证边界

可验证：构建、类型、lint、API 契约、短链跳转、UI 桌面/移动端、分页、弹窗、复制、空态、错误态。
无法在本地真实验证：GitHub OAuth、Resend 真实发信、Passkey 硬件流程、生产 Turso 多实例行为。

## 9. 关键风险

- Kumo 默认视觉偏 Cloudflare，需要通过主题 token + className 收敛为原型的中性单色。
- 零后端新增意味着仪表盘聚合与搜索只能基于有限样本，UI 必须明确标注，避免误导。
- 复用现有 Turso 库时不要执行破坏性迁移；新库可通过 v1 迁移/自动初始化建表。

---

## 10. 施工结果（2026-10-26）

### 已完成

- 全部 39 个 v1 HTTP 路由已平移为 TanStack Start server handlers，路径与响应结构保持一致。
- 短链跳转验证：成功 302、点击封顶 410、自动删除、未知 slug 307 回首页、Host 不匹配回首页。
- API Key、`/v1/shorten`、`/v1/links`、Addy.io aliases、入站邮件 Webhook（含 archive）均已实测。
- Better Auth 登录（邮箱 OTP dev log）、单会话约束、管理员/普通用户权限与前台守卫均已实测。
- 用户工作台、管理后台、落地页、登录/注册页完成；桌面与 Pixel 7 移动端浏览器验收。
- `bun run typecheck`、`bun run lint`、`bun run build` 通过；生产构建可通过 `bun run start` 启动。

### 验证中的修正

- v1 `session.user_id` 唯一索引导致 Better Auth 二次登录 UNIQUE 冲突：在 `session.create.before` 中先删除旧会话，保留单会话语义。
- 开发环境新增 `AUTH_OTP_DEV_LOG=true`，仅用于本地读取邮箱验证码，生产环境不生效。
- Kumo Dialog 宽度通过 `size` 属性显式设置；移动端侧栏展开宽度改为 280px。

### 本地未覆盖

- GitHub OAuth 真实回调、Resend 真实发信、Passkey 硬件注册/登录、生产 Turso 多实例缓存行为。
