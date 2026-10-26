import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Input } from '@cloudflare/kumo'
import { MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react'
import type { AdminLinkDto } from '@/lib/api-types'
import { useAdminLinks, useDeleteAdminLink } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { AdminLinkTable } from '@/components/admin/admin-link-table'
import { LinkLogsDialog } from '@/components/dashboard/link-logs-dialog'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { toastError, toastSuccess } from '@/lib/toast'

const PAGE_SIZE = 20

export const Route = createFileRoute('/admin/links')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { page?: number; q?: string } => ({
    page: Number(search.page) > 0 ? Number(search.page) : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  component: AdminLinksPage,
})

function AdminLinksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const page = search.page ?? 1
  const q = search.q ?? ''
  const [query, setQuery] = useState(q)
  const [logsLink, setLogsLink] = useState<AdminLinkDto | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminLinkDto | null>(null)
  const linksQuery = useAdminLinks(page, PAGE_SIZE)
  const deleteLink = useDeleteAdminLink()

  const links = useMemo(() => {
    const data = linksQuery.data?.data ?? []
    if (!q.trim()) return data
    const needle = q.trim().toLowerCase()
    return data.filter((link) =>
      [link.shortUrl, link.originalUrl, link.userName, link.userEmail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [linksQuery.data?.data, q])

  async function handleDelete() {
    if (!pendingDelete) return
    try {
      await deleteLink.mutateAsync(pendingDelete.id)
      toastSuccess({ title: '短链接已删除' })
      setPendingDelete(null)
      if ((linksQuery.data?.data.length ?? 0) === 1 && page > 1) {
        void navigate({
          to: '/admin/links',
          search: { page: page - 1, q: q || undefined },
        })
      }
    } catch (error) {
      toastError({ title: getErrorMessage(error, '删除链接失败') })
    }
  }

  return (
    <>
      <PageHeader
        title="全站链接"
        description="查看并管理所有用户创建的短链接。"
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-kumo-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void navigate({
                to: '/admin/links',
                search: { page: 1, q: query.trim() || undefined },
              })
            }}
          >
            <div className="relative flex-1 sm:max-w-sm">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-kumo-placeholder" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="在当前页筛选..."
                className="w-full pl-9"
                aria-label="筛选当前页链接"
              />
            </div>
            <Button type="submit" variant="secondary">
              筛选
            </Button>
            {q ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setQuery('')
                  void navigate({
                    to: '/admin/links',
                    search: { page: 1 },
                  })
                }}
              >
                清除
              </Button>
            ) : null}
          </form>
          <Button
            variant="ghost"
            onClick={() => void linksQuery.refetch()}
            icon={<ArrowsClockwise className="size-3.5" />}
          >
            刷新
          </Button>
        </div>

        {q ? (
          <div className="border-b border-kumo-hairline bg-kumo-elevated px-4 py-2 text-xs text-kumo-subtle">
            管理端接口不支持搜索参数，当前仅在本页{' '}
            {linksQuery.data?.data.length ?? 0} 条记录中筛选。
          </div>
        ) : null}

        {linksQuery.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(linksQuery.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() => void linksQuery.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : !links.length && !linksQuery.isPending ? (
          <EmptyState
            title={q ? '当前页没有匹配的链接' : '还没有短链接'}
            description={
              q ? '尝试清除筛选或切换分页。' : '用户创建短链接后会显示在这里。'
            }
          />
        ) : (
          <>
            <AdminLinkTable
              links={links}
              loading={linksQuery.isPending}
              onViewLogs={setLogsLink}
              onDelete={setPendingDelete}
            />
            <PaginationBar
              page={page}
              totalPages={linksQuery.data?.totalPages ?? 1}
              totalCount={linksQuery.data?.total ?? 0}
              perPage={PAGE_SIZE}
              onPageChange={(nextPage) =>
                void navigate({
                  to: '/admin/links',
                  search: { page: nextPage, q: q || undefined },
                })
              }
            />
          </>
        )}
      </Panel>

      <LinkLogsDialog
        link={logsLink}
        open={Boolean(logsLink)}
        onOpenChange={(open) => {
          if (!open) setLogsLink(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除全站短链接"
        description={
          pendingDelete
            ? `将永久删除 ${pendingDelete.shortUrl.replace(/^https?:\/\//, '')}（所属用户：${pendingDelete.userName || '匿名'}）。审计日志会保留。`
            : undefined
        }
        confirmLabel="删除"
        onConfirm={handleDelete}
        loading={deleteLink.isPending}
        destructive
      />
    </>
  )
}
