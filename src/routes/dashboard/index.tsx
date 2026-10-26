import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@cloudflare/kumo'
import {
  ArrowRight,
  ChartLineUp,
  EnvelopeSimple,
  Eye,
  Key,
  LinkSimple,
  Plus,
  ShieldCheck,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react'
import { useBootstrap } from '@/lib/bootstrap'
import { useRecentLinks } from '@/hooks/links'
import { useMailboxesPage, useMessages } from '@/hooks/mail'
import { usePublicDomains } from '@/hooks/settings'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { getLinkHealth } from '@/lib/link-ui'
import type { ShortLinkDto } from '@/lib/api-types'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { StatCard } from '@/components/dashboard/stat-card'
import { BarChart } from '@/components/dashboard/bar-chart'
import { StatusDonut } from '@/components/dashboard/status-donut'
import {
  ActivityFeed,
  type ActivityItem,
} from '@/components/dashboard/activity-feed'
import { LinkTable } from '@/components/dashboard/link-table'
import { LinkLogsDialog } from '@/components/dashboard/link-logs-dialog'
import { CopyButton } from '@/components/ui/copy-button'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

export const Route = createFileRoute('/dashboard/')({
  component: DashboardOverview,
})

function DashboardOverview() {
  const { user } = useBootstrap()
  const { openCreateLink, openCreateMailbox } = useQuickActions()
  const recentLinks = useRecentLinks()
  const mailboxes = useMailboxesPage(1, 5)
  const messages = useMessages({
    page: 1,
    limit: 5,
    search: '',
    mailboxId: '',
  })
  const publicDomains = usePublicDomains()
  const [logsLink, setLogsLink] = useState<ShortLinkDto | null>(null)

  const links = recentLinks.data?.links ?? []
  const sampled = recentLinks.data?.sampled ?? false
  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0)

  const topLinks = useMemo(
    () =>
      [...links]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 6)
        .map((link) => ({
          id: link.id,
          label: link.shortUrl.replace(/^https?:\/\//, ''),
          sublabel: link.originalUrl,
          value: link.clicks,
        })),
    [links],
  )

  const statusSegments = useMemo(() => {
    const counts = { healthy: 0, expiring: 0, expired: 0 }
    for (const link of links) {
      const health = getLinkHealth(link)
      if (health.tone === 'danger') counts.expired += 1
      else if (health.tone === 'warning') counts.expiring += 1
      else counts.healthy += 1
    }
    return [
      { label: '正常', value: counts.healthy, color: '#262626' },
      { label: '即将到期', value: counts.expiring, color: '#a3a3a3' },
      { label: '已过期', value: counts.expired, color: '#d4d4d4' },
    ]
  }, [links])

  const activityItems: ActivityItem[] = useMemo(() => {
    const linkItems: ActivityItem[] = links.slice(0, 4).map((link) => ({
      id: `link-${link.id}`,
      icon: LinkSimple,
      title: '创建了短链接',
      subtitle: link.shortUrl.replace(/^https?:\/\//, ''),
      time: link.createdAt,
      href: '/dashboard/links',
    }))
    const messageItems: ActivityItem[] = (messages.data?.data ?? [])
      .slice(0, 4)
      .map((message) => ({
        id: `message-${message.id}`,
        icon: EnvelopeSimple,
        title: '收到新邮件',
        subtitle: `${message.from} · ${message.subject || '（无主题）'}`,
        time: message.receivedAt,
        href: '/dashboard/inbox',
      }))
    return [...linkItems, ...messageItems]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5)
  }, [links, messages.data?.data])

  const latestMailbox = mailboxes.data?.data[0] ?? null
  const hasQueryError =
    recentLinks.isError || mailboxes.isError || messages.isError

  return (
    <>
      <PageHeader
        title={`你好，${user?.name ?? '用户'}`}
        description="欢迎回来，这里是你的网络工具工作台。"
        actions={
          <>
            <Button
              variant="primary"
              className="h-10 gap-2 px-4 text-xs"
              onClick={openCreateLink}
              icon={<Plus className="size-3.5" weight="bold" />}
            >
              创建短链接
            </Button>
            <Button
              variant="secondary"
              className="h-10 gap-2 px-4 text-xs"
              onClick={openCreateMailbox}
              icon={<Plus className="size-3.5" weight="bold" />}
            >
              生成临时邮箱
            </Button>
          </>
        }
      />

      {hasQueryError ? (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-2 text-xs text-red-700">
            <WarningCircle className="mt-0.5 size-4 shrink-0" />
            <span>部分仪表盘数据加载失败，统计可能不完整。</span>
          </div>
          <Button
            variant="secondary"
            className="h-8 shrink-0 px-2.5 text-[10px] sm:ml-auto"
            onClick={() => {
              void recentLinks.refetch()
              void mailboxes.refetch()
              void messages.refetch()
            }}
          >
            重试
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LinkSimple}
          label="短链接总数"
          value={recentLinks.data ? formatNumber(recentLinks.data.total) : '—'}
          meta="全部时间"
          hint="精确值"
        />
        <StatCard
          icon={Eye}
          label="累计访问量"
          value={recentLinks.data ? formatNumber(totalClicks) : '—'}
          meta={sampled ? `最近 ${links.length} 条` : '全部链接'}
        />
        <StatCard
          icon={EnvelopeSimple}
          label="临时邮箱总数"
          value={mailboxes.data ? formatNumber(mailboxes.data.total) : '—'}
          meta="全部地址"
        />
        <StatCard
          icon={Tray}
          label="邮件总数"
          value={messages.data ? formatNumber(messages.data.total) : '—'}
          meta="全部收件"
          hint={
            messages.data
              ? `未读 ${formatNumber(messages.data.unread)} 封`
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">
                  最近链接表现
                </h2>
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  基于最近 {links.length || 0} 条短链接的真实点击数据
                </p>
              </div>
              <Link
                to="/dashboard/analytics"
                className="text-xs text-neutral-500 transition-colors hover:text-neutral-900"
              >
                访问分析 →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_210px]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    链接访问排行
                  </h3>
                  <span className="text-[10px] text-neutral-400">
                    {sampled ? '最近 500 条样本' : '全部链接'}
                  </span>
                </div>
                <BarChart
                  items={topLinks}
                  emptyLabel="还没有可统计的链接"
                  className="min-h-52 content-center"
                />
              </div>
              <div className="border-t border-neutral-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <h3 className="text-sm font-semibold text-neutral-900">
                  链接状态构成
                </h3>
                <div className="mt-5">
                  <StatusDonut
                    segments={statusSegments}
                    totalLabel="链接总数"
                  />
                </div>
              </div>
            </div>
            {sampled ? (
              <p className="border-t border-neutral-100 px-4 py-2.5 text-[10px] text-neutral-400">
                为保证零后端新增，图表只统计最近最多 500
                条短链接；完整数据请在链接管理中分页查看。
              </p>
            ) : null}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="最近创建的短链接"
              action={
                <Link
                  to="/dashboard/links"
                  className="text-xs text-neutral-500 transition-colors hover:text-neutral-900"
                >
                  查看全部 →
                </Link>
              }
            />
            <LinkTable
              links={links.slice(0, 5)}
              loading={recentLinks.isPending}
              onViewLogs={setLogsLink}
              emptyAction={
                <Button
                  variant="primary"
                  className="h-9 px-3 text-xs"
                  onClick={openCreateLink}
                >
                  创建短链接
                </Button>
              }
            />
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                最近动态
              </h2>
              <Link
                to="/dashboard/inbox"
                className="text-[10px] text-neutral-400 hover:text-neutral-700"
              >
                全部 →
              </Link>
            </div>
            <ActivityFeed items={activityItems} />
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">
                临时邮箱
              </h2>
              <Link
                to="/dashboard/inbox"
                className="text-[10px] text-neutral-400 hover:text-neutral-700"
              >
                收件箱 →
              </Link>
            </div>
            {latestMailbox ? (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-neutral-900">
                    {latestMailbox.emailAddress}
                  </span>
                  <CopyButton
                    value={latestMailbox.emailAddress}
                    successMessage="邮箱地址已复制"
                    variant="secondary"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500">
                  <span>{latestMailbox.messageCount} 封邮件</span>
                  <span>{latestMailbox.unreadCount} 封未读</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-neutral-700"
                    style={{
                      width: `${
                        latestMailbox.messageCount
                          ? Math.max(
                              8,
                              (latestMailbox.unreadCount /
                                latestMailbox.messageCount) *
                                100,
                            )
                          : 8
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<EnvelopeSimple className="size-5" />}
                title="还没有临时邮箱"
                description="生成一个地址，用于接收验证码或测试邮件。"
                className="py-6"
              />
            )}
            <Button
              variant="secondary"
              className="mt-3 h-9 w-full gap-2 text-xs"
              onClick={openCreateMailbox}
              icon={<Plus className="size-3.5" />}
            >
              生成新邮箱
            </Button>
            <p className="mt-3 text-[10px] leading-4 text-neutral-400">
              临时邮箱用于接收邮件，请勿用于重要账户或敏感信息。
            </p>
          </Panel>

          <Panel className="border-neutral-900 bg-neutral-900 p-4 text-white">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                <ShieldCheck className="size-4" />
              </span>
              <h2 className="text-xs font-semibold">隐私优先的工具体验</h2>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-neutral-300">
              集中管理短链接与临时邮箱，让日常网络操作更简单。你的链接数据只属于你。
            </p>
            <Link
              to="/dashboard/settings"
              className="mt-3 inline-block text-[11px] text-white underline decoration-white/40 underline-offset-4"
            >
              查看账户设置
            </Link>
          </Panel>
        </aside>
      </div>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="text-sm font-semibold text-neutral-900">快速创建</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickAction
              icon={<LinkSimple className="size-5" />}
              title="创建短链接"
              description="自定义后缀与有效期"
              onClick={openCreateLink}
            />
            <QuickAction
              icon={<EnvelopeSimple className="size-5" />}
              title="生成临时邮箱"
              description="快速获取临时收件地址"
              onClick={openCreateMailbox}
            />
          </div>
        </Panel>
        <Panel className="p-4">
          <h2 className="text-sm font-semibold text-neutral-900">快捷入口</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Shortcut
              icon={<ChartLineUp className="size-4" />}
              label="访问分析"
              to="/dashboard/analytics"
            />
            <Shortcut
              icon={<Tray className="size-4" />}
              label="收件箱"
              to="/dashboard/inbox"
            />
            <Shortcut
              icon={<Key className="size-4" />}
              label="API 管理"
              to="/dashboard/api"
            />
            <Shortcut
              icon={<ShieldCheck className="size-4" />}
              label="账户安全"
              to="/dashboard/security"
            />
          </div>
        </Panel>
      </section>

      <p className="mt-5 text-[10px] text-neutral-400">
        可用短链域名 {publicDomains.data?.shortDomains.length ?? 0} 个 ·
        可用邮箱域名 {publicDomains.data?.emailDomains.length ?? 0} 个 ·
        数据刷新于 {formatRelativeTime(new Date())}
      </p>

      <LinkLogsDialog
        link={logsLink}
        open={Boolean(logsLink)}
        onOpenChange={(open) => {
          if (!open) setLogsLink(null)
        }}
      />
    </>
  )
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-neutral-200 p-3 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-50"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-xs font-medium text-neutral-900">
          {title}
        </strong>
        <small className="mt-1 block text-[10px] text-neutral-500">
          {description}
        </small>
      </span>
      <ArrowRight className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function Shortcut({
  icon,
  label,
  to,
}: {
  icon: React.ReactNode
  label: string
  to: string
}) {
  return (
    <Link
      to={to as never}
      className="rounded-lg border border-neutral-100 p-3 text-center transition-colors hover:bg-neutral-50"
    >
      <span className="mx-auto flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        {icon}
      </span>
      <span className="mt-2 block text-[11px] text-neutral-700">{label}</span>
    </Link>
  )
}
