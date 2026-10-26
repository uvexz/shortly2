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
  emptyAction?: React.ReactNode
}) {
  if (loading) {
    return <TableLoading rows={5} />
  }

  if (!links.length) {
    return (
      <EmptyState
        icon={<LinkSimple className="size-5" />}
        title="还没有短链接"
        description="创建你的第一条短链接，开始记录访问数据。"
        action={emptyAction}
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table className="min-w-[680px]">
          <Table.Header>
            <Table.Row>
              <Table.Head className="px-4 py-3 text-[10px]">短链接</Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">
                原始链接
              </Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">访问量</Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">
                创建时间
              </Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">状态</Table.Head>
              <Table.Head className="px-4 py-3 text-right text-[10px]">
                操作
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {links.map((link) => {
              const health = getLinkHealth(link)
              return (
                <Table.Row key={link.id} className="text-xs">
                  <Table.Cell className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={link.shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {link.shortUrl.replace(/^https?:\/\//, '')}
                      </a>
                      <CopyButton
                        value={link.shortUrl}
                        successMessage="短链接已复制"
                      />
                    </div>
                  </Table.Cell>
                  <Table.Cell className="max-w-[220px] truncate px-4 py-3 text-neutral-500">
                    {link.originalUrl}
                  </Table.Cell>
                  <Table.Cell className="numeric px-4 py-3 text-neutral-700">
                    {formatNumber(link.clicks)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap px-4 py-3 text-neutral-500">
                    {formatRelativeTime(link.createdAt)}
                  </Table.Cell>
                  <Table.Cell className="px-4 py-3">
                    <StatusBadge label={health.label} tone={health.tone} />
                  </Table.Cell>
                  <Table.Cell className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
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

      <div className="divide-y divide-neutral-100 md:hidden">
        {links.map((link) => {
          const health = getLinkHealth(link)
          return (
            <div key={link.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-neutral-900">
                    {link.shortUrl.replace(/^https?:\/\//, '')}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-neutral-500">
                    {link.originalUrl}
                  </p>
                </div>
                <StatusBadge label={health.label} tone={health.tone} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[10px] text-neutral-500">
                  <span>{formatNumber(link.clicks)} 次访问</span>
                  <span>{formatRelativeTime(link.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1">
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
