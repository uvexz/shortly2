import { useEffect, useMemo, useState } from 'react'
import { useNavigate, createFileRoute } from '@tanstack/react-router'
import { Button, Input } from '@cloudflare/kumo'
import { ArrowClockwise, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import type { ShortLinkDto } from '@/lib/api-types'
import { useDeleteLink, useLinksPage, useRecentLinks } from '@/hooks/links'
import { getErrorMessage } from '@/lib/api-client'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { LinkTable } from '@/components/dashboard/link-table'
import { LinkLogsDialog } from '@/components/dashboard/link-logs-dialog'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { toastError, toastSuccess } from '@/lib/toast'

const PAGE_SIZE = 10

export const Route = createFileRoute('/dashboard/links')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  component: LinksPage,
})

function LinksPage() {
  const routeSearch = Route.useSearch()
  const navigate = useNavigate()
  const { openCreateLink } = useQuickActions()
  const [query, setQuery] = useState(routeSearch.q ?? '')
  const [page, setPage] = useState(1)
  const [logsLink, setLogsLink] = useState<ShortLinkDto | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ShortLinkDto | null>(null)
  const deleteLink = useDeleteLink()

  const q = routeSearch.q?.trim() ?? ''
  const isSearching = Boolean(q)

  const linksPage = useLinksPage(page, PAGE_SIZE)
  const recent = useRecentLinks(isSearching)

  useEffect(() => {
    setPage(1)
  }, [q])

  useEffect(() => {
    setQuery(routeSearch.q ?? '')
  }, [routeSearch.q])

  const filtered = useMemo(() => {
    if (!isSearching) return []
    const needle = q.toLowerCase()
    return (recent.data?.links ?? []).filter((link) =>
      [link.shortUrl, link.originalUrl, link.slug, link.domain]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [isSearching, q, recent.data?.links])

  const filteredPageLinks = isSearching
    ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : []
  const links = isSearching ? filteredPageLinks : (linksPage.data?.data ?? [])
  const total = isSearching ? filtered.length : (linksPage.data?.total ?? 0)
  const totalPages = isSearching
    ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    : (linksPage.data?.totalPages ?? 1)
  const loading = isSearching ? recent.isPending : linksPage.isPending
  const error = isSearching ? recent.error : linksPage.error

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    const value = query.trim()
    void navigate({
      to: '/dashboard/links',
      search: value ? { q: value } : {},
    })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    try {
      await deleteLink.mutateAsync(pendingDelete.id)
      toastSuccess({ title: '短链接已删除' })
      setPendingDelete(null)
      if (links.length === 1 && page > 1) {
        setPage((current) => current - 1)
      }
    } catch (deleteError) {
      toastError({
        title: getErrorMessage(deleteError, '删除短链接失败'),
      })
    }
  }

  return (
    <>
      <PageHeader
        title="链接管理"
        description="管理、搜索和维护你创建的所有短链接。"
        actions={
          <Button
            variant="primary"
            onClick={openCreateLink}
            icon={<Plus className="size-3.5" weight="bold" />}
          >
            创建短链接
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-kumo-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
          <form
            onSubmit={handleSearch}
            className="flex flex-1 items-center gap-2"
          >
            <div className="relative flex-1 sm:max-w-sm">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-kumo-placeholder" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索短链接、目标地址..."
                className="w-full pl-9"
                aria-label="搜索短链接"
              />
            </div>
            <Button type="submit" variant="secondary">
              搜索
            </Button>
            {isSearching ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setQuery('')
                  void navigate({ to: '/dashboard/links', search: {} })
                }}
              >
                清除
              </Button>
            ) : null}
          </form>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (isSearching) void recent.refetch()
              else void linksPage.refetch()
            }}
            icon={<ArrowClockwise className="size-3.5" />}
          >
            刷新
          </Button>
        </div>

        {isSearching ? (
          <div className="border-b border-kumo-hairline bg-kumo-elevated px-4 py-2 text-xs text-kumo-subtle">
            当前搜索最近最多 500 条链接，找到 {filtered.length} 条结果
            {recent.data?.sampled ? '（更早的记录未包含）' : ''}。
          </div>
        ) : null}

        {error ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  isSearching ? void recent.refetch() : void linksPage.refetch()
                }
              >
                重试
              </Button>
            }
          />
        ) : (
          <>
            <LinkTable
              links={links}
              loading={loading}
              onViewLogs={setLogsLink}
              onDelete={setPendingDelete}
              onViewAnalytics={(link) =>
                navigate({
                  to: '/dashboard/analytics',
                  search: { linkId: link.id },
                })
              }
              emptyAction={
                <Button variant="primary" onClick={openCreateLink}>
                  创建短链接
                </Button>
              }
            />
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalCount={total}
              perPage={PAGE_SIZE}
              onPageChange={setPage}
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
        title="删除短链接"
        description={
          pendingDelete
            ? `将永久删除 ${pendingDelete.shortUrl.replace(/^https?:\/\//, '')}，已记录的操作日志不会被删除。`
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
