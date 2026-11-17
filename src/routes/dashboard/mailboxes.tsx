import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Table } from '@cloudflare/kumo'
import {
  ArrowRight,
  EnvelopeSimple,
  Plus,
  Trash,
  Info,
} from '@phosphor-icons/react'
import type { TempMailboxDto } from '@/lib/api-types'
import { useDeleteMailbox, useMailboxesPage } from '@/hooks/mail'
import { getErrorMessage } from '@/lib/api-client'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { PageHeader, Panel, QuietNote } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { MailboxExpiryBadge } from '@/components/ui/mailbox-expiry-badge'
import { toastError, toastSuccess } from '@/lib/toast'

const PAGE_SIZE = 10

const PENDING_WINDOW_HINT =
  '新地址有 1 小时待收窗口：期间收到任意一封邮件后长期保留；超时未收件则自动失效、地址释放，可重新生成。此前的邮箱不受影响。'

export const Route = createFileRoute('/dashboard/mailboxes')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: Number(search.page) > 0 ? Number(search.page) : undefined,
  }),
  component: MailboxesPage,
})

function MailboxesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { openCreateMailbox } = useQuickActions()
  const page = search.page ?? 1
  const query = useMailboxesPage(page, PAGE_SIZE)
  const deleteMailbox = useDeleteMailbox()
  const [pendingDelete, setPendingDelete] = useState<TempMailboxDto | null>(
    null,
  )

  function setPage(nextPage: number) {
    void navigate({
      to: '/dashboard/mailboxes',
      search: { page: nextPage > 1 ? nextPage : undefined },
    })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    try {
      await deleteMailbox.mutateAsync(pendingDelete.id)
      toastSuccess({ title: '临时邮箱已删除' })
      setPendingDelete(null)
      if ((query.data?.data.length ?? 0) === 1 && page > 1) {
        setPage(page - 1)
      }
    } catch (deleteError) {
      toastError({
        title: getErrorMessage(deleteError, '删除临时邮箱失败'),
      })
    }
  }

  const mailboxes = query.data?.data ?? []

  return (
    <>
      <PageHeader
        title="邮箱管理"
        description="管理已生成的临时邮箱与收件入口。"
        actions={
          <Button
            variant="primary"
            onClick={openCreateMailbox}
            icon={<Plus className="size-3.5" weight="bold" />}
          >
            生成临时邮箱
          </Button>
        }
      />

      <QuietNote
        icon={<Info className="size-3.5" />}
        className="mb-4 max-w-3xl"
      >
        <span className="font-medium text-kumo-default">
          1 小时内未收件会自动失效。
        </span>{' '}
        {PENDING_WINDOW_HINT}
      </QuietNote>

      <Panel className="overflow-hidden">
        {query.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(query.error, '请稍后重试')}
            action={
              <Button variant="secondary" onClick={() => void query.refetch()}>
                重试
              </Button>
            }
          />
        ) : query.isPending ? (
          <TableLoading rows={5} />
        ) : !mailboxes.length ? (
          <EmptyState
            icon={<EnvelopeSimple className="size-5" />}
            title="还没有临时邮箱"
            description="生成一个地址，用于接收验证码或测试邮件；1 小时内未收件会自动失效。"
            action={
              <Button variant="primary" onClick={openCreateMailbox}>
                生成临时邮箱
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[620px] app-table">
                <Table.Header>
                  <Table.Row>
                    <Table.Head>邮箱地址</Table.Head>
                    <Table.Head className="w-16 text-right">邮件</Table.Head>
                    <Table.Head className="w-16 text-right">未读</Table.Head>
                    <Table.Head className="w-28">创建时间</Table.Head>
                    <Table.Head className="w-32 text-right">操作</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {mailboxes.map((mailbox) => (
                    <Table.Row
                      key={mailbox.id}
                      className="group border-b border-kumo-hairline last:border-0 hover:bg-kumo-tint/60"
                    >
                      <Table.Cell>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="app-mono truncate text-sm text-kumo-default">
                            {mailbox.emailAddress}
                          </span>
                          {mailbox.expiresAt ? (
                            <MailboxExpiryBadge expiresAt={mailbox.expiresAt} />
                          ) : null}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="numeric text-right text-sm text-kumo-subtle">
                        {formatNumber(mailbox.messageCount)}
                      </Table.Cell>
                      <Table.Cell className="numeric text-right text-sm">
                        {mailbox.unreadCount > 0 ? (
                          <span className="font-medium text-kumo-brand">
                            {mailbox.unreadCount}
                          </span>
                        ) : (
                          <span className="text-kumo-placeholder">0</span>
                        )}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-xs text-kumo-subtle">
                        {formatDateTime(mailbox.createdAt)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="row-actions flex items-center gap-0.5">
                            <CopyButton
                              value={mailbox.emailAddress}
                              successMessage="邮箱地址已复制"
                            />
                            <Link
                              to="/dashboard/inbox"
                              search={{ mailboxId: mailbox.id }}
                              className="app-focus inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-kumo-link hover:bg-kumo-tint"
                            >
                              收件箱
                              <ArrowRight className="size-3" />
                            </Link>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={<Trash className="size-4" />}
                            aria-label="删除邮箱"
                            title="删除邮箱"
                            onClick={() => setPendingDelete(mailbox)}
                          />
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>

            <div className="divide-y divide-kumo-hairline md:hidden">
              {mailboxes.map((mailbox) => (
                <div key={mailbox.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="app-mono truncate text-sm font-medium text-kumo-default">
                        {mailbox.emailAddress}
                      </p>
                      <p className="mt-1 text-xs text-kumo-subtle">
                        {formatNumber(mailbox.messageCount)} 封邮件 ·{' '}
                        {mailbox.unreadCount} 封未读
                      </p>
                      {mailbox.expiresAt ? (
                        <div className="mt-1.5">
                          <MailboxExpiryBadge expiresAt={mailbox.expiresAt} />
                        </div>
                      ) : null}
                    </div>
                    <CopyButton
                      value={mailbox.emailAddress}
                      successMessage="邮箱地址已复制"
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs text-kumo-placeholder">
                      {formatDateTime(mailbox.createdAt)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Link
                        to="/dashboard/inbox"
                        search={{ mailboxId: mailbox.id }}
                        className="app-focus inline-flex h-7 items-center rounded-lg px-2 text-xs font-medium text-kumo-link hover:bg-kumo-tint"
                      >
                        查看收件箱
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        shape="square"
                        size="sm"
                        icon={<Trash className="size-4" />}
                        aria-label="删除邮箱"
                        onClick={() => setPendingDelete(mailbox)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <PaginationBar
              page={page}
              totalPages={query.data?.totalPages ?? 1}
              totalCount={query.data?.total ?? 0}
              perPage={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="个邮箱"
            />
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除临时邮箱"
        description={
          pendingDelete
            ? `将删除 ${pendingDelete.emailAddress} 及其全部邮件，操作不可撤销。`
            : undefined
        }
        confirmLabel="删除"
        onConfirm={handleDelete}
        loading={deleteMailbox.isPending}
        destructive
      />
    </>
  )
}
