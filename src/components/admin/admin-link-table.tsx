import { Button, DropdownMenu, Table } from '@cloudflare/kumo'
import { ChartLineUp, DotsThree, Trash, User } from '@phosphor-icons/react'
import type { AdminLinkDto } from '@/lib/api-types'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { getLinkHealth } from '@/lib/link-ui'
import { StatusBadge } from '@/components/ui/status-badge'
import { CopyButton } from '@/components/ui/copy-button'
import { TableLoading } from '@/components/ui/loading'

export function AdminLinkTable({
  links,
  loading,
  onViewLogs,
  onDelete,
}: {
  links: AdminLinkDto[]
  loading: boolean
  onViewLogs: (link: AdminLinkDto) => void
  onDelete: (link: AdminLinkDto) => void
}) {
  if (loading) {
    return <TableLoading rows={6} />
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <Table className="min-w-[900px]">
          <Table.Header>
            <Table.Row>
              <Table.Head className="px-4 py-3 text-[10px]">短链接</Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">
                目标链接
              </Table.Head>
              <Table.Head className="px-4 py-3 text-[10px]">
                所属用户
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
                  <Table.Cell className="max-w-56 truncate px-4 py-3 text-neutral-500">
                    {link.originalUrl}
                  </Table.Cell>
                  <Table.Cell className="px-4 py-3">
                    <p className="max-w-40 truncate font-medium text-neutral-700">
                      {link.userName || '匿名'}
                    </p>
                    <p className="max-w-40 truncate text-[10px] text-neutral-400">
                      {link.userEmail || '—'}
                    </p>
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
                        aria-label="查看日志"
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
                        <DropdownMenu.Content align="end" className="w-40">
                          <DropdownMenu.Item
                            icon={<ChartLineUp />}
                            onClick={() => onViewLogs(link)}
                          >
                            查看日志
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item
                            variant="danger"
                            icon={<Trash />}
                            onClick={() => onDelete(link)}
                          >
                            删除链接
                          </DropdownMenu.Item>
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

      <div className="divide-y divide-neutral-100 lg:hidden">
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
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-neutral-400">
                    <User className="size-3" />
                    {link.userName || '匿名'} · {link.userEmail || '—'}
                  </p>
                </div>
                <StatusBadge label={health.label} tone={health.tone} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-neutral-500">
                  {formatNumber(link.clicks)} 次访问 ·{' '}
                  {formatRelativeTime(link.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    className="h-8 px-2.5 text-[10px]"
                    onClick={() => onViewLogs(link)}
                  >
                    日志
                  </Button>
                  <Button
                    variant="secondary-destructive"
                    className="h-8 px-2.5 text-[10px]"
                    onClick={() => onDelete(link)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
