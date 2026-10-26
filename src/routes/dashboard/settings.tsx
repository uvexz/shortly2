import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Button } from '@cloudflare/kumo'
import {
  ArrowRight,
  CheckCircle,
  EnvelopeSimple,
  GlobeHemisphereWest,
  Key,
  ShieldCheck,
  SignOut,
} from '@phosphor-icons/react'
import { authClient } from '@/lib/auth-client'
import { useBootstrap } from '@/lib/bootstrap'
import { usePublicDomains } from '@/hooks/settings'
import { formatDateTime } from '@/lib/format'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/page-header'
import { UserAvatar } from '@/components/ui/user-avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { toastSuccess } from '@/lib/toast'

export const Route = createFileRoute('/dashboard/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const bootstrap = useBootstrap()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const domains = usePublicDomains()

  const user = session?.user ?? bootstrap.user
  const role = (user as { role?: string } | null)?.role ?? 'user'
  const createdAt = (user as { createdAt?: string } | null)?.createdAt
  const expiresAt = session?.session?.expiresAt

  async function handleSignOut() {
    await authClient.signOut()
    await router.invalidate()
    await navigate({ to: '/' })
    toastSuccess({ title: '已退出登录' })
  }

  return (
    <>
      <PageHeader
        title="个人设置"
        description="查看账户信息、安全状态与站点配置。"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="账户信息" description="来自当前登录会话" />
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <UserAvatar
                  name={user?.name ?? '用户'}
                  image={user?.image}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold text-kumo-strong">
                      {user?.name ?? '用户'}
                    </h2>
                    <StatusBadge
                      label={role === 'admin' ? '管理员' : '普通用户'}
                      tone={role === 'admin' ? 'info' : 'neutral'}
                    />
                    <StatusBadge
                      label={
                        (user as { emailVerified?: boolean } | null)
                          ?.emailVerified
                          ? '邮箱已验证'
                          : '邮箱未验证'
                      }
                      tone={
                        (user as { emailVerified?: boolean } | null)
                          ?.emailVerified
                          ? 'success'
                          : 'warning'
                      }
                    />
                  </div>
                  <p className="mt-1 break-all text-sm text-kumo-subtle">
                    {user?.email ?? '—'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Info
                  label="账户角色"
                  value={role === 'admin' ? '管理员' : '用户'}
                />
                <Info
                  label="注册时间"
                  value={createdAt ? formatDateTime(createdAt) : '—'}
                />
                <Info
                  label="当前会话到期"
                  value={expiresAt ? formatDateTime(expiresAt) : '—'}
                />
                <Info label="账户 ID" value={user?.id ?? '—'} mono />
              </div>

              <p className="mt-4 rounded-lg bg-kumo-elevated p-3 text-sm leading-5 text-kumo-placeholder ring ring-kumo-hairline">
                为保证后端接口不变，v2
                暂不提供资料编辑接口；邮箱与姓名由登录方式提供。
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="安全与访问"
              description="管理登录凭证和外部集成"
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <SettingsLink
                to="/dashboard/security"
                icon={<ShieldCheck className="size-4" />}
                title="账户安全"
                description="添加或删除 Passkey，查看登录保护说明。"
              />
              <SettingsLink
                to="/dashboard/api"
                icon={<Key className="size-4" />}
                title="API 管理"
                description="创建 API Key，接入 ShareX 和 Bitwarden 别名。"
              />
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
                <GlobeHemisphereWest className="size-4" />
              </span>
              <h2 className="text-base font-semibold text-kumo-strong">
                站点信息
              </h2>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">站点名称</span>
                <span className="truncate font-medium text-kumo-default">
                  {bootstrap.siteName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">站点地址</span>
                <span className="max-w-48 truncate text-kumo-default">
                  {bootstrap.siteUrl || '未配置'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">短链域名</span>
                <span className="numeric text-kumo-default">
                  {domains.data?.shortDomains.length ?? 0} 个
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">邮箱域名</span>
                <span className="numeric text-kumo-default">
                  {domains.data?.emailDomains.length ?? 0} 个
                </span>
              </div>
            </div>
            {domains.data?.telegramBotUsername ? (
              <p className="mt-4 rounded-lg bg-kumo-elevated p-3 text-xs leading-4 text-kumo-subtle ring ring-kumo-hairline">
                Telegram 通知已启用：@
                {domains.data.telegramBotUsername.replace(/^@+/, '')}
              </p>
            ) : null}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
                <EnvelopeSimple className="size-4" />
              </span>
              <h2 className="text-base font-semibold text-kumo-strong">
                本版本说明
              </h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-kumo-subtle">
              <li className="flex gap-2">
                <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-kumo-success" />
                现有 API 与短链跳转行为保持不变。
              </li>
              <li className="flex gap-2">
                <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-kumo-success" />
                仪表盘统计基于最近链接样本，并在页面中标注。
              </li>
              <li className="flex gap-2">
                <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-kumo-success" />
                临时邮箱不设有效期，需手动删除。
              </li>
            </ul>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-base font-semibold text-kumo-strong">
              退出当前账户
            </h2>
            <p className="mt-2 text-sm leading-5 text-kumo-subtle">
              退出后需要重新通过邮箱验证码、GitHub 或 Passkey 登录。
            </p>
            <Button
              variant="secondary-destructive"
              className="mt-4 w-full"
              onClick={handleSignOut}
              icon={<SignOut className="size-4" />}
            >
              退出登录
            </Button>
          </Panel>
        </aside>
      </div>
    </>
  )
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
      <p className="text-xs text-kumo-placeholder">{label}</p>
      <p
        className={`mt-1 truncate text-sm text-kumo-default ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function SettingsLink({
  to,
  icon,
  title,
  description,
}: {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      to={to as never}
      className="group flex items-center gap-3 rounded-lg p-3 ring ring-kumo-line hover:bg-kumo-tint hover:ring-kumo-interact"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium text-kumo-default">
          {title}
        </strong>
        <small className="mt-1 block text-xs leading-4 text-kumo-subtle">
          {description}
        </small>
      </span>
      <ArrowRight className="size-4 text-kumo-placeholder transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
