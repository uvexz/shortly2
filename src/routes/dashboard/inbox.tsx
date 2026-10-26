import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Input, Select, Table } from '@cloudflare/kumo'
import { MagnifyingGlass, Paperclip, Plus, Tray } from '@phosphor-icons/react'
import type { TempMessageSummary } from '@/lib/api-types'
import {
  useMailboxOptions,
  useMarkMessageRead,
  useMessages,
} from '@/hooks/mail'
import { getErrorMessage } from '@/lib/api-client'
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format'
import { getSenderLabel } from '@/lib/email-html'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { MessageDetailDialog } from '@/components/dashboard/message-detail-dialog'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

export const Route = createFileRoute('/dashboard/inbox')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { search?: string; mailboxId?: string; page?: number } => ({
    search: typeof search.search === 'string' ? search.search : undefined,
    mailboxId:
      typeof search.mailboxId === 'string' ? search.mailboxId : undefined,
    page: Number(search.page) > 0 ? Number(search.page) : undefined,
  }),
  component: InboxPage,
})

function InboxPage() {
  const routeSearch = Route.useSearch()
  const navigate = useNavigate()
  const { openCreateMailbox } = useQuickActions()
  const page = routeSearch.page ?? 1
  const searchTerm = routeSearch.search ?? ''
  const mailboxId = routeSearch.mailboxId ?? ''
  const [searchInput, setSearchInput] = useState(searchTerm)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  )

  const mailboxOptions = useMailboxOptions()
  const messages = useMessages({
    page,
    limit: PAGE_SIZE,
    search: searchTerm,
    mailboxId,
  })
  const markRead = useMarkMessageRead()

  useEffect(() => {
    setSearchInput(searchTerm)
  }, [searchTerm])

  const mailboxItems = useMemo(
    () => ({
      all: '全部邮箱',
      ...Object.fromEntries(
        (mailboxOptions.data?.data ?? []).map((mailbox) => [
          mailbox.id,
          `${mailbox.emailAddress}${mailbox.unreadCount > 0 ? ` · ${mailbox.unreadCount} 未读` : ''}`,
        ]),
      ),
    }),
    [mailboxOptions.data?.data],
  )

  function navigateInbox(next: {
    search?: string
    mailboxId?: string
    page?: number
  }) {
    void navigate({
      to: '/dashboard/inbox',
      search: {
        search: next.search || undefined,
        mailboxId: next.mailboxId || undefined,
        page: next.page && next.page > 1 ? next.page : undefined,
      },
    })
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    navigateInbox({
      search: searchInput.trim(),
      mailboxId,
      page: 1,
    })
  }

  function openMessage(message: TempMessageSummary) {
    setSelectedMessageId(message.id)
    if (!message.isRead) {
      markRead.mutate(message.id)
    }
  }

  const items = messages.data?.data ?? []
  const hasFilters = Boolean(searchTerm || mailboxId)

  return (
    <>
      <PageHeader
        title="收件箱"
        description="查看临时邮箱收到的邮件与验证码。"
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

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-kumo-hairline p-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={handleSearch}
            className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1 lg:max-w-sm">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-kumo-placeholder" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索发件人、主题或邮箱..."
                className="w-full pl-9"
                aria-label="搜索邮件"
              />
            </div>
            <Select
              aria-label="筛选邮箱"
              className="w-full sm:w-64"
              value={mailboxId || 'all'}
              onValueChange={(value) => {
                navigateInbox({
                  search: searchTerm,
                  mailboxId: value === 'all' ? '' : (value ?? ''),
                  page: 1,
                })
              }}
              items={mailboxItems}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                搜索
              </Button>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSearchInput('')
                    navigateInbox({})
                  }}
                >
                  清除
                </Button>
              ) : null}
            </div>
          </form>
          <div className="shrink-0 text-xs text-kumo-placeholder">
            共 {formatNumber(messages.data?.total ?? 0)} 封 · 未读{' '}
            {formatNumber(messages.data?.unread ?? 0)} 封
          </div>
        </div>

        {messages.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(messages.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() => void messages.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : messages.isPending ? (
          <TableLoading rows={6} />
        ) : !items.length ? (
          <EmptyState
            icon={<Tray className="size-5" />}
            title={hasFilters ? '没有匹配的邮件' : '收件箱是空的'}
            description={
              hasFilters
                ? '尝试更换关键词或邮箱筛选。'
                : '生成临时邮箱后，收到的邮件会出现在这里。'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('')
                    navigateInbox({})
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <Button variant="primary" onClick={openCreateMailbox}>
                  生成临时邮箱
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[760px]">
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="px-4 py-3">发件人</Table.Head>
                    <Table.Head className="px-4 py-3">主题</Table.Head>
                    <Table.Head className="px-4 py-3">收件邮箱</Table.Head>
                    <Table.Head className="px-4 py-3">接收时间</Table.Head>
                    <Table.Head className="px-4 py-3">状态</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((message) => (
                    <Table.Row
                      key={message.id}
                      className="cursor-pointer hover:bg-kumo-tint"
                      onClick={() => openMessage(message)}
                    >
                      <Table.Cell className="max-w-44 px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!message.isRead ? (
                            <i className="size-1.5 shrink-0 rounded-full bg-kumo-brand" />
                          ) : null}
                          <span
                            className={cn(
                              'truncate',
                              message.isRead
                                ? 'text-kumo-subtle'
                                : 'font-semibold text-kumo-strong',
                            )}
                          >
                            {getSenderLabel(message.from, message.fromName)}
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="max-w-72 px-4 py-3">
                        <p
                          className={cn(
                            'truncate',
                            message.isRead
                              ? 'text-kumo-subtle'
                              : 'font-medium text-kumo-default',
                          )}
                        >
                          {message.subject || '（无主题）'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                          {message.preview || '—'}
                        </p>
                      </Table.Cell>
                      <Table.Cell className="max-w-52 truncate px-4 py-3 text-kumo-subtle">
                        {message.mailboxEmailAddress}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap px-4 py-3 text-kumo-subtle">
                        <span title={formatDateTime(message.receivedAt)}>
                          {formatRelativeTime(message.receivedAt)}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3">
                        <div className="flex items-center gap-2 text-kumo-placeholder">
                          {message.hasAttachments ? (
                            <Paperclip className="size-3.5" />
                          ) : null}
                          <span className="text-sm">
                            {message.isRead ? '已读' : '未读'}
                          </span>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>

            <div className="divide-y divide-kumo-hairline md:hidden">
              {items.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => openMessage(message)}
                  className="block w-full p-4 text-left hover:bg-kumo-tint"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {!message.isRead ? (
                        <i className="size-1.5 shrink-0 rounded-full bg-kumo-brand" />
                      ) : null}
                      <span
                        className={cn(
                          'truncate text-sm',
                          message.isRead
                            ? 'text-kumo-subtle'
                            : 'font-semibold text-kumo-strong',
                        )}
                      >
                        {getSenderLabel(message.from, message.fromName)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-kumo-placeholder">
                      {formatRelativeTime(message.receivedAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'mt-1.5 truncate text-sm',
                      message.isRead
                        ? 'text-kumo-subtle'
                        : 'font-medium text-kumo-default',
                    )}
                  >
                    {message.subject || '（无主题）'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-4 text-kumo-placeholder">
                    {message.preview || '—'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-kumo-placeholder">
                    <span className="truncate">
                      {message.mailboxEmailAddress}
                    </span>
                    {message.hasAttachments ? (
                      <Paperclip className="size-3 shrink-0" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>

            <PaginationBar
              page={page}
              totalPages={messages.data?.totalPages ?? 1}
              totalCount={messages.data?.total ?? 0}
              perPage={PAGE_SIZE}
              onPageChange={(nextPage) =>
                navigateInbox({
                  search: searchTerm,
                  mailboxId,
                  page: nextPage,
                })
              }
              itemLabel="封邮件"
            />
          </>
        )}
      </Panel>

      <MessageDetailDialog
        messageId={selectedMessageId}
        open={Boolean(selectedMessageId)}
        onOpenChange={(open) => {
          if (!open) setSelectedMessageId(null)
        }}
      />
    </>
  )
}
