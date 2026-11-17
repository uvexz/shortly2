import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Table, Tabs } from '@cloudflare/kumo'
import { Archive, EnvelopeSimple, Tray } from '@phosphor-icons/react'
import type {
  AdminArchiveSummary,
  AdminMailboxDto,
  AdminMessageSummary,
} from '@/lib/api-types'
import {
  useAdminArchives,
  useAdminMailboxes,
  useAdminMessages,
} from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format'
import { getSenderLabel } from '@/lib/email-html'
import { AdminEmailViewerDialog } from '@/components/admin/admin-email-viewer-dialog'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { SearchField } from '@/components/ui/search-field'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { MailboxExpiryBadge } from '@/components/ui/mailbox-expiry-badge'
import { StatusBadge } from '@/components/ui/status-badge'

const PAGE_SIZE = 20
type EmailTab = 'mailboxes' | 'messages' | 'archives'

export const Route = createFileRoute('/admin/emails')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: EmailTab; search?: string; page?: number } => ({
    tab:
      search.tab === 'messages' || search.tab === 'archives'
        ? search.tab
        : 'mailboxes',
    search: typeof search.search === 'string' ? search.search : undefined,
    page: Number(search.page) > 0 ? Number(search.page) : undefined,
  }),
  component: AdminEmailsPage,
})

function AdminEmailsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const tab: EmailTab = search.tab ?? 'mailboxes'
  const page = search.page ?? 1
  const searchTerm = search.search ?? ''
  const [searchInput, setSearchInput] = useState(searchTerm)
  const [viewer, setViewer] = useState<{
    mode: 'message' | 'archive'
    id: string
  } | null>(null)

  const mailboxes = useAdminMailboxes(
    page,
    PAGE_SIZE,
    tab === 'mailboxes' ? searchTerm : '',
  )
  const messages = useAdminMessages(
    page,
    PAGE_SIZE,
    tab === 'messages' ? searchTerm : '',
  )
  const archives = useAdminArchives(
    page,
    PAGE_SIZE,
    tab === 'archives' ? searchTerm : '',
  )

  useEffect(() => {
    setSearchInput(searchTerm)
  }, [searchTerm])

  const activeQuery =
    tab === 'mailboxes' ? mailboxes : tab === 'messages' ? messages : archives

  function updateSearch(next: {
    tab?: EmailTab
    search?: string
    page?: number
  }) {
    void navigate({
      to: '/admin/emails',
      search: {
        tab: next.tab ?? tab,
        search: next.search || undefined,
        page: next.page && next.page > 1 ? next.page : undefined,
      },
    })
  }

  return (
    <>
      <PageHeader
        title="邮件管理"
        description="查看全站临时邮箱、邮件和归档投递。"
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-kumo-hairline px-4 pt-3 lg:flex-row lg:items-end lg:justify-between">
          <Tabs
            tabs={[
              { value: 'mailboxes', label: '邮箱' },
              { value: 'messages', label: '邮件' },
              { value: 'archives', label: '归档' },
            ]}
            value={tab}
            onValueChange={(value) => {
              setSearchInput('')
              updateSearch({ tab: value as EmailTab, search: '', page: 1 })
            }}
            variant="underline"
            size="sm"
          />
          <SearchField
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value)
              if (!value.trim() && searchTerm) {
                updateSearch({ tab, search: '', page: 1 })
              }
            }}
            onSubmit={() =>
              updateSearch({ tab, search: searchInput.trim(), page: 1 })
            }
            placeholder="搜索邮箱、主题、用户…"
            label="搜索邮件"
            shortcut
            className="max-w-sm pb-3"
          />
        </div>

        {activeQuery.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(activeQuery.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() => void activeQuery.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : activeQuery.isPending ? (
          <TableLoading rows={6} />
        ) : tab === 'mailboxes' ? (
          <MailboxesTable data={mailboxes.data?.data ?? []} />
        ) : tab === 'messages' ? (
          <MessagesTable
            data={messages.data?.data ?? []}
            onOpen={(message) => setViewer({ mode: 'message', id: message.id })}
          />
        ) : (
          <ArchivesTable
            data={archives.data?.data ?? []}
            onOpen={(archive) => setViewer({ mode: 'archive', id: archive.id })}
          />
        )}

        {!activeQuery.isError ? (
          <PaginationBar
            page={page}
            totalPages={activeQuery.data?.totalPages ?? 1}
            totalCount={activeQuery.data?.total ?? 0}
            perPage={PAGE_SIZE}
            onPageChange={(nextPage) =>
              updateSearch({ tab, search: searchTerm, page: nextPage })
            }
            itemLabel={tab === 'mailboxes' ? '个邮箱' : '封邮件'}
          />
        ) : null}
      </Panel>

      <AdminEmailViewerDialog
        mode={viewer?.mode ?? 'message'}
        id={viewer?.id ?? null}
        open={Boolean(viewer)}
        onOpenChange={(open) => {
          if (!open) setViewer(null)
        }}
      />
    </>
  )
}

function MailboxesTable({ data }: { data: AdminMailboxDto[] }) {
  if (!data.length) {
    return (
      <EmptyState
        icon={<EnvelopeSimple className="size-5" />}
        title="没有邮箱"
        description="用户创建临时邮箱后会显示在这里。"
      />
    )
  }

  return (
    <>
      <div
        className="app-table-region hidden lg:block"
        tabIndex={0}
        role="region"
        aria-label="全站邮箱列表，可横向滚动"
      >
        <Table className="min-w-[820px] app-table">
          <Table.Header>
            <Table.Row>
              <Table.Head>邮箱地址</Table.Head>
              <Table.Head>所属用户</Table.Head>
              <Table.Head>邮件 / 未读</Table.Head>
              <Table.Head>状态</Table.Head>
              <Table.Head>创建时间</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.map((mailbox) => (
              <Table.Row key={mailbox.id}>
                <Table.Cell className="font-medium text-kumo-default">
                  {mailbox.emailAddress}
                </Table.Cell>
                <Table.Cell>
                  <p className="max-w-44 truncate text-kumo-default">
                    {mailbox.userName || '—'}
                  </p>
                  <p className="max-w-44 truncate text-xs text-kumo-placeholder">
                    {mailbox.userEmail || '—'}
                  </p>
                </Table.Cell>
                <Table.Cell className="numeric text-kumo-subtle">
                  {formatNumber(mailbox.messageCount)} /{' '}
                  <span className="text-kumo-default">
                    {formatNumber(mailbox.unreadCount)}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      label={
                        mailbox.expired
                          ? '已失效'
                          : mailbox.isActive
                            ? '启用'
                            : '停用'
                      }
                      tone={
                        mailbox.expired
                          ? 'danger'
                          : mailbox.isActive
                            ? 'success'
                            : 'neutral'
                      }
                    />
                    {mailbox.expired ? null : (
                      <MailboxExpiryBadge expiresAt={mailbox.expiresAt} />
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                  {formatDateTime(mailbox.createdAt)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="divide-y divide-kumo-hairline lg:hidden">
        {data.map((mailbox) => (
          <article key={mailbox.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="app-mono truncate text-sm font-medium text-kumo-default"
                  title={mailbox.emailAddress}
                >
                  {mailbox.emailAddress}
                </p>
                <p className="mt-1 truncate text-xs text-kumo-subtle">
                  {mailbox.userName || '—'} · {mailbox.userEmail || '—'}
                </p>
              </div>
              <div className="flex max-w-36 flex-wrap justify-end gap-1.5">
                <StatusBadge
                  label={
                    mailbox.expired
                      ? '已失效'
                      : mailbox.isActive
                        ? '启用'
                        : '停用'
                  }
                  tone={
                    mailbox.expired
                      ? 'danger'
                      : mailbox.isActive
                        ? 'success'
                        : 'neutral'
                  }
                />
                {mailbox.expired ? null : (
                  <MailboxExpiryBadge expiresAt={mailbox.expiresAt} />
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="numeric text-kumo-subtle">
                {formatNumber(mailbox.messageCount)} 封邮件 ·{' '}
                {formatNumber(mailbox.unreadCount)} 封未读
              </span>
              <span className="text-kumo-placeholder">
                {formatDateTime(mailbox.createdAt)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function MessagesTable({
  data,
  onOpen,
}: {
  data: AdminMessageSummary[]
  onOpen: (message: AdminMessageSummary) => void
}) {
  if (!data.length) {
    return (
      <EmptyState
        icon={<Tray className="size-5" />}
        title="没有邮件"
        description="临时邮箱收到的邮件会显示在这里。"
      />
    )
  }

  return (
    <>
      <div
        className="app-table-region hidden lg:block"
        tabIndex={0}
        role="region"
        aria-label="全站邮件列表，可横向滚动"
      >
        <Table className="min-w-[900px] app-table">
          <Table.Header>
            <Table.Row>
              <Table.Head>主题 / 发件人</Table.Head>
              <Table.Head>收件邮箱</Table.Head>
              <Table.Head>所属用户</Table.Head>
              <Table.Head>接收时间</Table.Head>
              <Table.Head>状态</Table.Head>
              <Table.Head className="text-right">操作</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.map((message) => (
              <Table.Row
                key={message.id}
                tabIndex={0}
                aria-label={`${message.isRead ? '已读' : '未读'}邮件：${message.subject || '（无主题）'}`}
                className="group cursor-pointer outline-none hover:bg-kumo-tint/60 focus-visible:bg-kumo-tint/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kumo-focus"
                onClick={() => onOpen(message)}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.target !== event.currentTarget
                  )
                    return
                  event.preventDefault()
                  onOpen(message)
                }}
              >
                <Table.Cell className="max-w-72">
                  <p className="truncate font-medium text-kumo-default">
                    {message.subject || '（无主题）'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                    {getSenderLabel(message.from, message.fromName)} ·{' '}
                    {message.from}
                  </p>
                </Table.Cell>
                <Table.Cell className="max-w-52 truncate text-kumo-subtle">
                  {message.mailboxEmailAddress}
                </Table.Cell>
                <Table.Cell>
                  <p className="max-w-40 truncate text-kumo-default">
                    {message.userName || '—'}
                  </p>
                  <p className="max-w-40 truncate text-xs text-kumo-placeholder">
                    {message.userEmail || '—'}
                  </p>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                  <span title={formatDateTime(message.receivedAt)}>
                    {formatRelativeTime(message.receivedAt)}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge
                    label={message.isRead ? '已读' : '未读'}
                    tone={message.isRead ? 'neutral' : 'info'}
                  />
                </Table.Cell>
                <Table.Cell className="text-right">
                  <span className="row-actions inline-flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(message)
                      }}
                    >
                      查看
                    </Button>
                  </span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="divide-y divide-kumo-hairline lg:hidden">
        {data.map((message) => (
          <button
            key={message.id}
            type="button"
            className="app-focus block w-full px-4 py-3 text-left hover:bg-kumo-tint/60"
            onClick={() => onOpen(message)}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-kumo-strong">
                {getSenderLabel(message.from, message.fromName)}
              </p>
              <span
                className="shrink-0 text-xs text-kumo-placeholder"
                title={formatDateTime(message.receivedAt)}
              >
                {formatRelativeTime(message.receivedAt)}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-kumo-default">
              {message.subject || '（无主题）'}
            </p>
            <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
              {message.from}
            </p>
            <p className="app-mono mt-2 truncate text-xs text-kumo-subtle">
              {message.mailboxEmailAddress}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="truncate text-xs text-kumo-placeholder">
                {message.userName || '—'} · {message.userEmail || '—'}
              </span>
              <StatusBadge
                label={message.isRead ? '已读' : '未读'}
                tone={message.isRead ? 'neutral' : 'info'}
              />
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function ArchivesTable({
  data,
  onOpen,
}: {
  data: AdminArchiveSummary[]
  onOpen: (archive: AdminArchiveSummary) => void
}) {
  if (!data.length) {
    return (
      <EmptyState
        icon={<Archive className="size-5" />}
        title="没有归档邮件"
        description="投递失败或邮箱不存在的邮件会进入归档。"
      />
    )
  }

  return (
    <>
      <div
        className="app-table-region hidden lg:block"
        tabIndex={0}
        role="region"
        aria-label="归档邮件列表，可横向滚动"
      >
        <Table className="min-w-[860px] app-table">
          <Table.Header>
            <Table.Row>
              <Table.Head>主题 / 发件人</Table.Head>
              <Table.Head>目标地址</Table.Head>
              <Table.Head>失败原因</Table.Head>
              <Table.Head>接收时间</Table.Head>
              <Table.Head className="text-right">操作</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.map((archive) => (
              <Table.Row
                key={archive.id}
                tabIndex={0}
                aria-label={`归档邮件：${archive.subject || '（无主题）'}`}
                className="group cursor-pointer outline-none hover:bg-kumo-tint/60 focus-visible:bg-kumo-tint/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kumo-focus"
                onClick={() => onOpen(archive)}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.target !== event.currentTarget
                  )
                    return
                  event.preventDefault()
                  onOpen(archive)
                }}
              >
                <Table.Cell className="max-w-80">
                  <p className="truncate font-medium text-kumo-default">
                    {archive.subject || '（无主题）'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                    {getSenderLabel(archive.from, archive.fromName)} ·{' '}
                    {archive.from}
                  </p>
                </Table.Cell>
                <Table.Cell className="max-w-56 truncate text-kumo-subtle">
                  {archive.toEmail}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge label={archive.failureReason} tone="warning" />
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                  <span title={formatDateTime(archive.receivedAt)}>
                    {formatRelativeTime(archive.receivedAt)}
                  </span>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <span className="row-actions inline-flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(archive)
                      }}
                    >
                      查看
                    </Button>
                  </span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>

      <div className="divide-y divide-kumo-hairline lg:hidden">
        {data.map((archive) => (
          <button
            key={archive.id}
            type="button"
            className="app-focus block w-full px-4 py-3 text-left hover:bg-kumo-tint/60"
            onClick={() => onOpen(archive)}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-kumo-strong">
                {getSenderLabel(archive.from, archive.fromName)}
              </p>
              <span
                className="shrink-0 text-xs text-kumo-placeholder"
                title={formatDateTime(archive.receivedAt)}
              >
                {formatRelativeTime(archive.receivedAt)}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-kumo-default">
              {archive.subject || '（无主题）'}
            </p>
            <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
              {archive.from}
            </p>
            <p className="app-mono mt-2 truncate text-xs text-kumo-subtle">
              {archive.toEmail}
            </p>
            <div className="mt-2">
              <StatusBadge label={archive.failureReason} tone="warning" />
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
