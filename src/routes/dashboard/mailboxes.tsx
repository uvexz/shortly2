import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Table } from '@cloudflare/kumo'
import {
  ArrowRight,
  EnvelopeSimple,
  Plus,
  Trash,
  Tray,
} from '@phosphor-icons/react'
import type { TempMailboxDto } from '@/lib/api-types'
import { useDeleteMailbox, useMailboxesPage } from '@/hooks/mail'
import { getErrorMessage } from '@/lib/api-client'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { toastError, toastSuccess } from '@/lib/toast'

const PAGE_SIZE = 10

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
            className="h-10 gap-2 px-4 text-xs"
            onClick={openCreateMailbox}
            icon={<Plus className="size-3.5" weight="bold" />}
          >
            生成临时邮箱
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 app-shadow">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
          <Tray className="size-4" />
        </span>
        <div>
          <p className="text-xs font-medium text-neutral-800">
            临时邮箱不设有效期
          </p>
          <p className="mt-1 text-[11px] leading-5 text-neutral-500">
            地址会一直保留，直到你手动删除。请勿用于重要账户、安全验证或个人敏感信息。
          </p>
        </div>
      </div>

      <Panel className="overflow-hidden">
        {query.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(query.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => void query.refetch()}
              >
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
            description="生成一个地址，用于接收验证码或测试邮件。"
            action={
              <Button
                variant="primary"
                className="h-9 px-3 text-xs"
                onClick={openCreateMailbox}
              >
                生成临时邮箱
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[620px]">
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="px-4 py-3 text-[10px]">
                      邮箱地址
                    </Table.Head>
                    <Table.Head className="px-4 py-3 text-[10px]">
                      邮件
                    </Table.Head>
                    <Table.Head className="px-4 py-3 text-[10px]">
                      未读
                    </Table.Head>
                    <Table.Head className="px-4 py-3 text-[10px]">
                      创建时间
                    </Table.Head>
                    <Table.Head className="px-4 py-3 text-right text-[10px]">
                      操作
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {mailboxes.map((mailbox) => (
                    <Table.Row key={mailbox.id} className="text-xs">
                      <Table.Cell className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-neutral-900">
                            {mailbox.emailAddress}
                          </span>
                          <CopyButton
                            value={mailbox.emailAddress}
                            successMessage="邮箱地址已复制"
                          />
                        </div>
                      </Table.Cell>
                      <Table.Cell className="numeric px-4 py-3 text-neutral-700">
                        {formatNumber(mailbox.messageCount)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3">
                        {mailbox.unreadCount > 0 ? (
                          <span className="numeric rounded-md bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {mailbox.unreadCount}
                          </span>
                        ) : (
                          <span className="text-neutral-400">0</span>
                        )}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap px-4 py-3 text-neutral-500">
                        {formatDateTime(mailbox.createdAt)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to="/dashboard/inbox"
                            search={{ mailboxId: mailbox.id }}
                            className="app-focus inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100"
                          >
                            收件箱
                            <ArrowRight className="size-3" />
                          </Link>
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

            <div className="divide-y divide-neutral-100 md:hidden">
              {mailboxes.map((mailbox) => (
                <div key={mailbox.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-neutral-900">
                        {mailbox.emailAddress}
                      </p>
                      <p className="mt-1 text-[10px] text-neutral-500">
                        {formatNumber(mailbox.messageCount)} 封邮件 ·{' '}
                        {mailbox.unreadCount} 封未读
                      </p>
                    </div>
                    <CopyButton
                      value={mailbox.emailAddress}
                      successMessage="邮箱地址已复制"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">
                      {formatDateTime(mailbox.createdAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        to="/dashboard/inbox"
                        search={{ mailboxId: mailbox.id }}
                        className="inline-flex h-8 items-center rounded-lg border border-neutral-200 px-2.5 text-[10px]"
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
