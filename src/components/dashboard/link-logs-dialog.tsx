import { useEffect, useState } from 'react'
import { Button, Dialog, Table } from '@cloudflare/kumo'
import { Clock, CursorClick, Globe, WarningCircle } from '@phosphor-icons/react'
import type { ShortLinkDto } from '@/lib/api-types'
import { useLinkLogs } from '@/hooks/links'
import { formatDateTime, formatNumber } from '@/lib/format'
import { getLogEventLabel } from '@/lib/log-events'
import { getLinkHealth, getLogEventTone, getSourceLabel } from '@/lib/link-ui'
import { StatusBadge } from '@/components/ui/status-badge'
import { CopyButton } from '@/components/ui/copy-button'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { TableLoading } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'

export function LinkLogsDialog({
  link,
  open,
  onOpenChange,
}: {
  link: ShortLinkDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [page, setPage] = useState(1)
  const query = useLinkLogs(link?.id ?? null, page, 20, open)

  useEffect(() => {
    if (open) setPage(1)
  }, [link?.id, open])

  const health = link ? getLinkHealth(link) : null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-kumo-hairline p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-kumo-strong">
                访问日志
              </Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-sm text-kumo-subtle">
                {link ? link.shortUrl.replace(/^https?:\/\//, '') : '链接详情'}
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              {health ? (
                <StatusBadge label={health.label} tone={health.tone} />
              ) : null}
              {link ? (
                <CopyButton
                  value={link.shortUrl}
                  successMessage="短链接已复制"
                  variant="secondary"
                />
              ) : null}
            </div>
          </div>

          {link ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
                <p className="text-xs text-kumo-placeholder">总点击</p>
                <p className="numeric mt-1 text-base font-semibold text-kumo-strong">
                  {formatNumber(link.clicks)}
                </p>
              </div>
              <div className="rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
                <p className="text-xs text-kumo-placeholder">点击上限</p>
                <p className="numeric mt-1 text-base font-semibold text-kumo-strong">
                  {link.maxClicks ? formatNumber(link.maxClicks) : '不限'}
                </p>
              </div>
              <div className="rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
                <p className="text-xs text-kumo-placeholder">有效期至</p>
                <p className="mt-1 truncate text-sm font-medium text-kumo-default">
                  {link.expiresAt ? formatDateTime(link.expiresAt) : '永久有效'}
                </p>
              </div>
              <div className="rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
                <p className="text-xs text-kumo-placeholder">创建时间</p>
                <p className="mt-1 truncate text-sm font-medium text-kumo-default">
                  {formatDateTime(link.createdAt)}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="max-h-[55vh] overflow-y-auto scrollbar-thin">
          {query.isPending ? (
            <TableLoading rows={4} />
          ) : query.isError ? (
            <div className="p-6">
              <EmptyState
                icon={<WarningCircle className="size-5" />}
                title="日志加载失败"
                description="请关闭后重试，或稍后再打开。"
              />
            </div>
          ) : !query.data?.data.length ? (
            <div className="p-6">
              <EmptyState
                icon={<Clock className="size-5" />}
                title="暂无访问记录"
                description="链接被点击或触发规则后，事件会显示在这里。"
              />
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head className="px-4 py-2">事件</Table.Head>
                      <Table.Head className="px-4 py-2">时间</Table.Head>
                      <Table.Head className="px-4 py-2">来源</Table.Head>
                      <Table.Head className="px-4 py-2">状态码</Table.Head>
                      <Table.Head className="px-4 py-2">IP / UA</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {query.data.data.map((log) => (
                      <Table.Row key={log.id}>
                        <Table.Cell className="px-4 py-2.5">
                          <StatusBadge
                            label={getLogEventLabel(log.eventType)}
                            tone={getLogEventTone(log.eventType)}
                          />
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap px-4 py-2.5 text-kumo-subtle">
                          {formatDateTime(log.createdAt)}
                        </Table.Cell>
                        <Table.Cell className="max-w-32 truncate px-4 py-2.5 text-kumo-subtle">
                          {getSourceLabel(log.referrer)}
                        </Table.Cell>
                        <Table.Cell className="numeric px-4 py-2.5 text-kumo-subtle">
                          {log.statusCode ?? '—'}
                        </Table.Cell>
                        <Table.Cell className="max-w-40 truncate px-4 py-2.5 text-kumo-placeholder">
                          {log.ipAddress ?? '—'}
                          {log.userAgent ? ' · ' : ''}
                          {log.userAgent ?? ''}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>

              <div className="divide-y divide-kumo-hairline sm:hidden">
                {query.data.data.map((log) => (
                  <div key={log.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <StatusBadge
                        label={getLogEventLabel(log.eventType)}
                        tone={getLogEventTone(log.eventType)}
                      />
                      <span className="text-xs text-kumo-placeholder">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kumo-subtle">
                      <span className="inline-flex items-center gap-1">
                        <Globe className="size-3" />
                        {getSourceLabel(log.referrer)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CursorClick className="size-3" />
                        {log.statusCode ?? '—'}
                      </span>
                      {log.ipAddress ? <span>{log.ipAddress}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {query.data ? (
          <PaginationBar
            page={query.data.page}
            totalPages={query.data.totalPages}
            totalCount={query.data.total}
            perPage={query.data.pageSize}
            onPageChange={setPage}
            itemLabel="条事件"
          />
        ) : null}

        <div className="flex justify-end border-t border-kumo-hairline p-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
