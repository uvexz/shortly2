import type { ReactNode } from 'react'
import { Button, DropdownMenu, Table } from '@cloudflare/kumo'
import {
  ArrowSquareOut,
  ChartLineUp,
  ClockCounterClockwise,
  DotsThree,
  LinkSimple,
  Trash,
} from '@phosphor-icons/react'
import type { ShortLinkDto } from '@/lib/api-types'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { getLinkHealth } from '@/lib/link-ui'
import { StatusBadge } from '@/components/ui/status-badge'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'

export function LinkTable({
  links,
  loading = false,
  onViewLogs,
  onDelete,
  onViewAnalytics,
  emptyAction,
}: {
  links: ShortLinkDto[]
  loading?: boolean
  onViewLogs: (link: ShortLinkDto) => void
  onDelete?: (link: ShortLinkDto) => void
  onViewAnalytics?: (link: ShortLinkDto) => void
  emptyAction?: ReactNode
}) {
  if (loading) {
    return <TableLoading rows={5} />
  }

  if (!links.length) {
    return (
      <EmptyState
        icon={<LinkSimple />}
        title="还没有短链接"
        description="创建你的第一条短链接，开始记录访问数据。"
        action={emptyAction}
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table className="app-table min-w-[620px]">
          <Table.Header>
            <Table.Row>
              <Table.Head>短链接</Table.Head>
              <Table.Head>原始链接</Table.Head>
              <Table.Head className="w-20 text-right">访问量</Table.Head>
              <Table.Head className="w-28">创建时间</Table.Head>
              <Table.Head className="w-24">状态</Table.Head>
              <Table.Head className="w-20 text-right">操作</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {links.map((link) => {
              const health = getLinkHealth(link)
              const short = link.shortUrl.replace(/^https?:\/\//, '')
              return (
                <Table.Row
                  key={link.id}
                  tabIndex={0}
                  onClick={() => onViewLogs(link)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== 'Enter' ||
                      event.target !== event.currentTarget
                    )
                      return
                    event.preventDefault()
                    onViewLogs(link)
                  }}
                  className="group cursor-pointer border-b border-kumo-hairline align-middle outline-none last:border-0 hover:bg-kumo-tint/60 focus-visible:bg-kumo-tint/60"
                >
                  <Table.Cell>
                    <div className="flex min-w-0 items-center gap-1">
                      <a
                        href={link.shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="app-focus app-mono truncate rounded text-sm font-medium text-kumo-default hover:text-kumo-link hover:underline"
                      >
                        {short}
                      </a>
                      <span className="row-actions shrink-0">
                        <CopyButton
                          value={link.shortUrl}
                          successMessage="短链接已复制"
                        />
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="max-w-[240px] truncate text-xs text-kumo-subtle">
                    {link.originalUrl}
                  </Table.Cell>
                  <Table.Cell className="numeric text-right text-sm text-kumo-default">
                    {formatNumber(link.clicks)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-xs text-kumo-subtle">
                    {formatRelativeTime(link.createdAt)}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge
                      variant="dot"
                      label={health.label}
                      tone={health.tone}
                    />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div
                      className="flex items-center justify-end gap-0.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="row-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          shape="square"
                          size="sm"
                          icon={<ChartLineUp className="size-4" />}
                          aria-label="查看访问日志"
                          title="查看访问日志"
                          onClick={() => onViewLogs(link)}
                        />
                      </span>
                      <DropdownMenu>
                        <DropdownMenu.Trigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              shape="square"
                              size="sm"
                              icon={<DotsThree className="size-4" />}
                              aria-label="更多操作"
                            />
                          }
                        />
                        <DropdownMenu.Content align="end" className="w-44">
                          <DropdownMenu.Item
                            icon={<ClockCounterClockwise />}
                            onClick={() => onViewLogs(link)}
                          >
                            查看日志
                          </DropdownMenu.Item>
                          {onViewAnalytics ? (
                            <DropdownMenu.Item
                              icon={<ChartLineUp />}
                              onClick={() => onViewAnalytics(link)}
                            >
                              访问分析
                            </DropdownMenu.Item>
                          ) : null}
                          <DropdownMenu.Item
                            icon={<ArrowSquareOut />}
                            onClick={() =>
                              window.open(
                                link.originalUrl,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                          >
                            打开原链接
                          </DropdownMenu.Item>
                          {onDelete ? (
                            <>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                variant="danger"
                                icon={<Trash />}
                                onClick={() => onDelete(link)}
                              >
                                删除链接
                              </DropdownMenu.Item>
                            </>
                          ) : null}
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      </div>

      <div className="divide-y divide-kumo-hairline md:hidden">
        {links.map((link) => {
          const health = getLinkHealth(link)
          return (
            <div key={link.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="app-mono truncate text-sm font-medium text-kumo-default">
                    {link.shortUrl.replace(/^https?:\/\//, '')}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-kumo-subtle">
                    {link.originalUrl}
                  </p>
                </div>
                <StatusBadge
                  variant="dot"
                  label={health.label}
                  tone={health.tone}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-kumo-placeholder">
                  <span className="numeric">
                    {formatNumber(link.clicks)} 次
                  </span>
                  <span>{formatRelativeTime(link.createdAt)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <CopyButton
                    value={link.shortUrl}
                    successMessage="短链接已复制"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    size="sm"
                    icon={<ChartLineUp className="size-4" />}
                    aria-label="查看访问日志"
                    onClick={() => onViewLogs(link)}
                  />
                  {onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      shape="square"
                      size="sm"
                      icon={<Trash className="size-4" />}
                      aria-label="删除链接"
                      onClick={() => onDelete(link)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
