import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Select, Table } from '@cloudflare/kumo'
import { Paperclip, Plus, Tray } from '@phosphor-icons/react'
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
import { SearchField } from '@/components/ui/search-field'
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

  function handleSearch() {
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

      <Panel>
        <div className="flex flex-col gap-2 border-b border-kumo-hairline px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={searchInput}
              onChange={(value) => {
                setSearchInput(value)
                if (!value.trim() && searchTerm) {
                  navigateInbox({ mailboxId, page: 1 })
                }
              }}
              onSubmit={handleSearch}
              placeholder="搜索发件人、主题或邮箱…"
              label="搜索邮件"
              shortcut
              className="w-full sm:max-w-sm"
            />
            <Select
              aria-label="筛选邮箱"
              className="w-full sm:w-56"
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
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-kumo-placeholder">
            <span className="numeric">
              共 {formatNumber(messages.data?.total ?? 0)} 封 · 未读{' '}
              {formatNumber(messages.data?.unread ?? 0)} 封
            </span>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput('')
                  navigateInbox({})
                }}
              >
                清除
              </Button>
            ) : null}
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
            icon={<Tray />}
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
              <Table className="min-w-[720px] app-table">
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="w-52">发件人</Table.Head>
                    <Table.Head>主题</Table.Head>
                    <Table.Head className="w-52">收件邮箱</Table.Head>
                    <Table.Head className="w-24">接收时间</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((message) => (
                    <Table.Row
                      key={message.id}
                      tabIndex={0}
                      aria-label={`${message.isRead ? '已读' : '未读'}邮件：${message.subject || '（无主题）'}`}
                      onClick={() => openMessage(message)}
                      onKeyDown={(event) => {
                        if (
                          event.key !== 'Enter' ||
                          event.target !== event.currentTarget
                        )
                          return
                        event.preventDefault()
                        openMessage(message)
                      }}
                      className="group cursor-pointer border-b border-kumo-hairline outline-none last:border-0 hover:bg-kumo-tint/60 focus-visible:bg-kumo-tint/60"
                    >
                      <Table.Cell>
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
                      </Table.Cell>
                      <Table.Cell className="max-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'truncate text-sm',
                              message.isRead
                                ? 'text-kumo-subtle'
                                : 'font-medium text-kumo-default',
                            )}
                          >
                            {message.subject || '（无主题）'}
                          </p>
                          {message.hasAttachments ? (
                            <Paperclip className="size-3 shrink-0 text-kumo-placeholder" />
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                          {message.preview || ' '}
                        </p>
                      </Table.Cell>
                      <Table.Cell className="app-mono truncate text-xs text-kumo-subtle">
                        {message.mailboxEmailAddress}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap text-xs text-kumo-subtle">
                        <span title={formatDateTime(message.receivedAt)}>
                          {formatRelativeTime(message.receivedAt)}
                        </span>
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
                  className="app-focus block w-full px-4 py-3 text-left hover:bg-kumo-tint/60"
                >
                  <div className="flex items-center justify-between gap-3">
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
                      'mt-1 truncate text-sm',
                      message.isRead
                        ? 'text-kumo-subtle'
                        : 'font-medium text-kumo-default',
                    )}
                  >
                    {message.subject || '（无主题）'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-kumo-placeholder">
                    {message.preview || ' '}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-kumo-placeholder">
                    <span className="app-mono truncate">
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
