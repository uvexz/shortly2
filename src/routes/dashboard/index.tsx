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
import { BarChart } from '@/components/dashboard/bar-chart'
import { StatusDonut } from '@/components/dashboard/status-donut'
import {
  ActivityFeed,
  type ActivityItem,
} from '@/components/dashboard/activity-feed'
import { LinkTable } from '@/components/dashboard/link-table'
import { LinkLogsDialog } from '@/components/dashboard/link-logs-dialog'
import { CopyButton } from '@/components/ui/copy-button'
import { MailboxExpiryBadge } from '@/components/ui/mailbox-expiry-badge'
import { Metric, MetricStrip } from '@/components/ui/metric-strip'
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
      {
        label: '正常',
        value: counts.healthy,
        color: 'var(--color-kumo-success)',
      },
      {
        label: '即将到期',
        value: counts.expiring,
        color: 'var(--color-kumo-warning)',
      },
      {
        label: '已过期',
        value: counts.expired,
        color: 'var(--color-kumo-danger)',
      },
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
              onClick={openCreateLink}
              icon={<Plus className="size-4" weight="bold" />}
            >
              创建短链接
            </Button>
            <Button
              variant="secondary"
              onClick={openCreateMailbox}
              icon={<Plus className="size-4" weight="bold" />}
            >
              生成临时邮箱
            </Button>
          </>
        }
      />

      {hasQueryError ? (
        <div className="mb-4 flex flex-col gap-3 rounded-panel border border-kumo-danger/20 bg-kumo-danger-tint px-3 py-2.5 text-kumo-danger sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-2 text-sm">
            <WarningCircle className="mt-0.5 size-4 shrink-0" />
            <span>部分仪表盘数据加载失败，统计可能不完整。</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 sm:ml-auto"
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

      <MetricStrip>
        <Metric
          icon={LinkSimple}
          label="短链接总数"
          value={recentLinks.data ? formatNumber(recentLinks.data.total) : '—'}
          meta="全部时间"
          hint="精确值"
        />
        <Metric
          icon={Eye}
          label="累计访问量"
          value={recentLinks.data ? formatNumber(totalClicks) : '—'}
          meta={sampled ? `最近 ${links.length} 条` : '全部链接'}
        />
        <Metric
          icon={EnvelopeSimple}
          label="可用临时邮箱"
          value={mailboxes.data ? formatNumber(mailboxes.data.total) : '—'}
          meta="不含已失效地址"
        />
        <Metric
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
      </MetricStrip>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHeader
              title="最近链接表现"
              description={`基于最近 ${links.length || 0} 条短链接的真实点击数据`}
              action={
                <Link
                  to="/dashboard/analytics"
                  className="app-focus inline-flex items-center gap-1 rounded text-xs font-medium text-kumo-link hover:underline"
                >
                  访问分析
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_200px]">
              <div className="min-w-0">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-kumo-strong">
                    链接访问排行
                  </h3>
                  <span className="text-xs text-kumo-placeholder">
                    {sampled ? '最近 500 条样本' : '全部链接'}
                  </span>
                </div>
                <BarChart
                  items={topLinks}
                  emptyLabel="还没有可统计的链接"
                  className="min-h-52 content-center"
                />
              </div>
              <div className="border-t border-kumo-hairline pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                <h3 className="text-sm font-medium text-kumo-strong">
                  链接状态构成
                </h3>
                <div className="mt-4">
                  <StatusDonut
                    segments={statusSegments}
                    totalLabel="链接总数"
                  />
                </div>
              </div>
            </div>
            {sampled ? (
              <p className="border-t border-kumo-hairline px-4 py-2 text-xs text-kumo-placeholder">
                为保证零后端新增，图表只统计最近最多 500
                条短链接；完整数据请在链接管理中分页查看。
              </p>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader
              title="最近创建的短链接"
              action={
                <Link
                  to="/dashboard/links"
                  className="app-focus inline-flex items-center gap-1 rounded text-xs font-medium text-kumo-link hover:underline"
                >
                  查看全部
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <LinkTable
              links={links.slice(0, 5)}
              loading={recentLinks.isPending}
              onViewLogs={setLogsLink}
              emptyAction={
                <Button variant="primary" onClick={openCreateLink}>
                  创建短链接
                </Button>
              }
            />
          </Panel>
        </div>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Panel>
            <PanelHeader
              title="最近动态"
              action={
                <Link
                  to="/dashboard/inbox"
                  className="app-focus rounded text-xs font-medium text-kumo-link hover:underline"
                >
                  全部
                </Link>
              }
            />
            <div className="px-4 pt-1 pb-3">
              <ActivityFeed items={activityItems} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="临时邮箱"
              action={
                <Link
                  to="/dashboard/inbox"
                  className="app-focus rounded text-xs font-medium text-kumo-link hover:underline"
                >
                  收件箱
                </Link>
              }
            />
            <div className="p-4">
              {latestMailbox ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="app-mono min-w-0 truncate text-sm text-kumo-default">
                      {latestMailbox.emailAddress}
                    </span>
                    <CopyButton
                      value={latestMailbox.emailAddress}
                      successMessage="邮箱地址已复制"
                      variant="secondary"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kumo-subtle">
                    {latestMailbox.expiresAt ? (
                      <MailboxExpiryBadge expiresAt={latestMailbox.expiresAt} />
                    ) : null}
                    <span className="numeric">
                      {latestMailbox.messageCount} 封 ·{' '}
                      {latestMailbox.unreadCount} 未读
                    </span>
                  </div>
                  {latestMailbox.messageCount > 0 ? (
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-kumo-fill">
                      <div
                        className="h-full rounded-full bg-kumo-brand"
                        style={{
                          width: `${Math.max(
                            8,
                            (latestMailbox.unreadCount /
                              latestMailbox.messageCount) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={<EnvelopeSimple />}
                  title="还没有临时邮箱"
                  description="生成一个地址，用于接收验证码或测试邮件。"
                  className="py-4"
                />
              )}
              <Button
                variant="secondary"
                className="mt-3 w-full"
                onClick={openCreateMailbox}
                icon={<Plus className="size-4" />}
              >
                生成新邮箱
              </Button>
              <p className="mt-3 text-xs leading-5 text-kumo-placeholder">
                1 小时内未收件会自动失效；请勿用于重要账户或敏感信息。
              </p>
            </div>
          </Panel>

          <Panel className="sm:col-span-2 xl:col-span-1">
            <PanelHeader title="快捷入口" />
            <div className="grid grid-cols-2 gap-px bg-kumo-hairline">
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
        </aside>
      </div>

      <p className="mt-4 text-xs text-kumo-placeholder">
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
      className="app-focus group flex items-center gap-2.5 bg-kumo-base px-4 py-3 text-sm text-kumo-default transition-colors hover:bg-kumo-tint"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-kumo-tint text-kumo-subtle group-hover:bg-kumo-base group-hover:text-kumo-strong">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  )
}
