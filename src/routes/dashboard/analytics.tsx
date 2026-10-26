import { useEffect, useMemo, useState } from 'react'
import { useNavigate, createFileRoute } from '@tanstack/react-router'
import { Button, Select, Table } from '@cloudflare/kumo'
import { ChartLineUp, ClockCounterClockwise } from '@phosphor-icons/react'
import { useLinkLogs, useRecentLinks } from '@/hooks/links'
import { formatDateTime, formatNumber } from '@/lib/format'
import { getLogEventLabel } from '@/lib/log-events'
import { getLinkHealth, getLogEventTone, getSourceLabel } from '@/lib/link-ui'
import { BarChart } from '@/components/dashboard/bar-chart'
import { StatusDonut } from '@/components/dashboard/status-donut'
import { LinkLogsDialog } from '@/components/dashboard/link-logs-dialog'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'

const LOG_SAMPLE_SIZE = 200

export const Route = createFileRoute('/dashboard/analytics')({
  validateSearch: (search: Record<string, unknown>): { linkId?: string } => ({
    linkId: typeof search.linkId === 'string' ? search.linkId : undefined,
  }),
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const recent = useRecentLinks()
  const links = recent.data?.links ?? []
  const [logsOpen, setLogsOpen] = useState(false)

  const selectedLink = useMemo(() => {
    if (search.linkId) {
      const match = links.find((link) => link.id === search.linkId)
      if (match) return match
    }
    return links[0] ?? null
  }, [links, search.linkId])

  useEffect(() => {
    if (selectedLink && selectedLink.id !== search.linkId) {
      void navigate({
        to: '/dashboard/analytics',
        search: { linkId: selectedLink.id },
        replace: true,
      })
    }
  }, [navigate, search.linkId, selectedLink])

  const logs = useLinkLogs(
    selectedLink?.id ?? null,
    1,
    LOG_SAMPLE_SIZE,
    Boolean(selectedLink),
  )

  const linkItems = useMemo(
    () =>
      Object.fromEntries(
        links.map((link) => [
          link.id,
          `${link.shortUrl.replace(/^https?:\/\//, '')} · ${link.clicks} 次`,
        ]),
      ),
    [links],
  )

  const eventBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const log of logs.data?.data ?? []) {
      counts.set(log.eventType, (counts.get(log.eventType) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([eventType, value]) => ({
        id: eventType,
        label: getLogEventLabel(eventType),
        value,
      }))
  }, [logs.data?.data])

  const sourceBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const log of logs.data?.data ?? []) {
      const source = getSourceLabel(log.referrer)
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([source, value]) => ({
        id: source,
        label: source,
        value,
      }))
  }, [logs.data?.data])

  const health = selectedLink ? getLinkHealth(selectedLink) : null
  const successCount =
    logs.data?.data.filter((log) => log.eventType === 'redirect_success')
      .length ?? 0
  const blockedCount =
    logs.data?.data.filter(
      (log) =>
        log.eventType.includes('blocked') ||
        log.eventType.includes('expired') ||
        log.eventType.includes('max_clicks'),
    ).length ?? 0

  return (
    <>
      <PageHeader
        title="访问分析"
        description="按链接查看真实访问事件、来源与状态分布。"
        actions={
          selectedLink ? (
            <Button
              variant="secondary"
              onClick={() => setLogsOpen(true)}
              icon={<ClockCounterClockwise className="size-3.5" />}
            >
              查看完整日志
            </Button>
          ) : undefined
        }
      />

      {recent.isPending ? (
        <Panel>
          <TableLoading rows={6} />
        </Panel>
      ) : !links.length ? (
        <Panel>
          <EmptyState
            icon={<ChartLineUp className="size-5" />}
            title="暂无可分析的链接"
            description="创建短链接并产生访问后，这里会显示真实事件与来源。"
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-kumo-strong">
                  选择短链接
                </h2>
                <p className="mt-0.5 text-xs text-kumo-placeholder">
                  数据来自现有 /api/logs/:linkId，不进行跨链接聚合
                </p>
              </div>
              <Select
                aria-label="选择短链接"
                className="w-full sm:w-80"
                value={selectedLink?.id ?? ''}
                onValueChange={(value) => {
                  if (!value) return
                  void navigate({
                    to: '/dashboard/analytics',
                    search: { linkId: value },
                  })
                }}
                items={linkItems}
              />
            </div>
          </Panel>

          {selectedLink ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="总点击"
                  value={formatNumber(selectedLink.clicks)}
                  meta="精确值"
                />
                <Metric
                  label="事件总数"
                  value={formatNumber(logs.data?.total ?? 0)}
                  meta="全部日志"
                />
                <Metric
                  label="成功跳转"
                  value={formatNumber(successCount)}
                  meta={`最近 ${LOG_SAMPLE_SIZE} 条`}
                />
                <Metric
                  label="拦截 / 异常"
                  value={formatNumber(blockedCount)}
                  meta={`最近 ${LOG_SAMPLE_SIZE} 条`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <Panel className="overflow-hidden">
                  <PanelHeader
                    title="最近事件"
                    description={`展示最近最多 ${LOG_SAMPLE_SIZE} 条事件，按时间倒序`}
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogsOpen(true)}
                      >
                        全部日志 →
                      </Button>
                    }
                  />
                  {logs.isPending ? (
                    <TableLoading rows={4} />
                  ) : !logs.data?.data.length ? (
                    <EmptyState
                      title="暂无事件"
                      description="链接被访问后，成功跳转、拦截和自动删除事件会显示在这里。"
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[620px]">
                        <Table.Header>
                          <Table.Row>
                            <Table.Head>事件</Table.Head>
                            <Table.Head>时间</Table.Head>
                            <Table.Head>来源</Table.Head>
                            <Table.Head>状态码</Table.Head>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {logs.data.data.slice(0, 20).map((log) => (
                            <Table.Row key={log.id}>
                              <Table.Cell>
                                <StatusBadge
                                  label={getLogEventLabel(log.eventType)}
                                  tone={getLogEventTone(log.eventType)}
                                />
                              </Table.Cell>
                              <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                                {formatDateTime(log.createdAt)}
                              </Table.Cell>
                              <Table.Cell className="text-kumo-subtle">
                                {getSourceLabel(log.referrer)}
                              </Table.Cell>
                              <Table.Cell className="numeric text-kumo-subtle">
                                {log.statusCode ?? '—'}
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table>
                    </div>
                  )}
                </Panel>

                <aside className="space-y-4">
                  <Panel className="p-4">
                    <h2 className="text-base font-semibold text-kumo-strong">
                      链接概况
                    </h2>
                    <div className="mt-3 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-kumo-subtle">短链接</span>
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="truncate font-medium text-kumo-default">
                            {selectedLink.shortUrl.replace(/^https?:\/\//, '')}
                          </span>
                          <CopyButton
                            value={selectedLink.shortUrl}
                            successMessage="短链接已复制"
                          />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-kumo-subtle">状态</span>
                        {health ? (
                          <StatusBadge
                            label={health.label}
                            tone={health.tone}
                          />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-kumo-subtle">点击上限</span>
                        <span className="text-kumo-default">
                          {selectedLink.maxClicks
                            ? formatNumber(selectedLink.maxClicks)
                            : '不限'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-kumo-subtle">有效期至</span>
                        <span className="text-right text-kumo-default">
                          {selectedLink.expiresAt
                            ? formatDateTime(selectedLink.expiresAt)
                            : '永久有效'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-kumo-subtle">创建时间</span>
                        <span className="text-right text-kumo-default">
                          {formatDateTime(selectedLink.createdAt)}
                        </span>
                      </div>
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <h2 className="text-base font-semibold text-kumo-strong">
                      事件构成
                    </h2>
                    <div className="mt-4">
                      {eventBreakdown.length ? (
                        <StatusDonut
                          segments={eventBreakdown.map((item, index) => ({
                            label: item.label,
                            value: item.value,
                            color: [
                              'var(--color-kumo-badge-blue)',
                              'var(--color-kumo-badge-teal)',
                              'var(--color-kumo-badge-orange)',
                              'var(--color-kumo-badge-purple)',
                            ][index % 4],
                          }))}
                          totalLabel="事件样本"
                        />
                      ) : (
                        <p className="py-6 text-center text-xs text-kumo-placeholder">
                          暂无事件
                        </p>
                      )}
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <h2 className="text-base font-semibold text-kumo-strong">
                      访问来源
                    </h2>
                    <div className="mt-4">
                      <BarChart
                        items={sourceBreakdown}
                        emptyLabel="暂无来源数据"
                      />
                    </div>
                  </Panel>
                </aside>
              </div>

              {logs.data && logs.data.total > LOG_SAMPLE_SIZE ? (
                <p className="text-xs text-kumo-placeholder">
                  聚合数据仅基于最近 {LOG_SAMPLE_SIZE}{' '}
                  条事件；完整日志请点击「查看完整日志」。
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      <LinkLogsDialog
        link={logsOpen ? selectedLink : null}
        open={logsOpen}
        onOpenChange={setLogsOpen}
      />
    </>
  )
}

function Metric({
  label,
  value,
  meta,
}: {
  label: string
  value: string
  meta: string
}) {
  return (
    <div className="rounded-lg bg-kumo-base p-4 shadow-xs ring ring-kumo-line">
      <p className="text-base text-kumo-subtle">{label}</p>
      <p className="numeric mt-1 text-2xl font-semibold text-kumo-strong">
        {value}
      </p>
      <p className="mt-1 text-xs text-kumo-placeholder">{meta}</p>
    </div>
  )
}
