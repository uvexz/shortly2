import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Input, Table, Tabs } from '@cloudflare/kumo'
import {
  Archive,
  EnvelopeSimple,
  MagnifyingGlass,
  Tray,
} from '@phosphor-icons/react'
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
import { PaginationBar } from '@/components/ui/pagination-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
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
          <form
            className="flex items-center gap-2 pb-3"
            onSubmit={(event) => {
              event.preventDefault()
              updateSearch({
                tab,
                search: searchInput.trim(),
                page: 1,
              })
            }}
          >
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-kumo-placeholder" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索邮箱、主题、用户..."
                className="w-64 pl-9"
                aria-label="搜索邮件"
              />
            </div>
            <Button type="submit" variant="secondary">
              搜索
            </Button>
            {searchTerm ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput('')
                  updateSearch({ tab, search: '', page: 1 })
                }}
              >
                清除
              </Button>
            ) : null}
          </form>
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
    <div className="overflow-x-auto">
      <Table className="min-w-[820px]">
        <Table.Header>
          <Table.Row>
            <Table.Head className="px-4 py-3">邮箱地址</Table.Head>
            <Table.Head className="px-4 py-3">所属用户</Table.Head>
            <Table.Head className="px-4 py-3">邮件 / 未读</Table.Head>
            <Table.Head className="px-4 py-3">状态</Table.Head>
            <Table.Head className="px-4 py-3">创建时间</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((mailbox) => (
            <Table.Row key={mailbox.id}>
              <Table.Cell className="px-4 py-3 font-medium text-kumo-default">
                {mailbox.emailAddress}
              </Table.Cell>
              <Table.Cell className="px-4 py-3">
                <p className="max-w-44 truncate text-kumo-default">
                  {mailbox.userName || '—'}
                </p>
                <p className="max-w-44 truncate text-xs text-kumo-placeholder">
                  {mailbox.userEmail || '—'}
                </p>
              </Table.Cell>
              <Table.Cell className="numeric px-4 py-3 text-kumo-subtle">
                {formatNumber(mailbox.messageCount)} /{' '}
                <span className="text-kumo-default">
                  {formatNumber(mailbox.unreadCount)}
                </span>
              </Table.Cell>
              <Table.Cell className="px-4 py-3">
                <StatusBadge
                  label={mailbox.isActive ? '启用' : '停用'}
                  tone={mailbox.isActive ? 'success' : 'neutral'}
                />
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap px-4 py-3 text-kumo-subtle">
                {formatDateTime(mailbox.createdAt)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
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
    <div className="overflow-x-auto">
      <Table className="min-w-[900px]">
        <Table.Header>
          <Table.Row>
            <Table.Head className="px-4 py-3">主题 / 发件人</Table.Head>
            <Table.Head className="px-4 py-3">收件邮箱</Table.Head>
            <Table.Head className="px-4 py-3">所属用户</Table.Head>
            <Table.Head className="px-4 py-3">接收时间</Table.Head>
            <Table.Head className="px-4 py-3">状态</Table.Head>
            <Table.Head className="px-4 py-3 text-right">操作</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((message) => (
            <Table.Row
              key={message.id}
              className="cursor-pointer hover:bg-kumo-tint"
              onClick={() => onOpen(message)}
            >
              <Table.Cell className="max-w-72 px-4 py-3">
                <p className="truncate font-medium text-kumo-default">
                  {message.subject || '（无主题）'}
                </p>
                <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                  {getSenderLabel(message.from, message.fromName)} ·{' '}
                  {message.from}
                </p>
              </Table.Cell>
              <Table.Cell className="max-w-52 truncate px-4 py-3 text-kumo-subtle">
                {message.mailboxEmailAddress}
              </Table.Cell>
              <Table.Cell className="px-4 py-3">
                <p className="max-w-40 truncate text-kumo-default">
                  {message.userName || '—'}
                </p>
                <p className="max-w-40 truncate text-xs text-kumo-placeholder">
                  {message.userEmail || '—'}
                </p>
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap px-4 py-3 text-kumo-subtle">
                <span title={formatDateTime(message.receivedAt)}>
                  {formatRelativeTime(message.receivedAt)}
                </span>
              </Table.Cell>
              <Table.Cell className="px-4 py-3">
                <StatusBadge
                  label={message.isRead ? '已读' : '未读'}
                  tone={message.isRead ? 'neutral' : 'info'}
                />
              </Table.Cell>
              <Table.Cell className="px-4 py-3 text-right">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(message)
                  }}
                >
                  查看
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
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
    <div className="overflow-x-auto">
      <Table className="min-w-[860px]">
        <Table.Header>
          <Table.Row>
            <Table.Head className="px-4 py-3">主题 / 发件人</Table.Head>
            <Table.Head className="px-4 py-3">目标地址</Table.Head>
            <Table.Head className="px-4 py-3">失败原因</Table.Head>
            <Table.Head className="px-4 py-3">接收时间</Table.Head>
            <Table.Head className="px-4 py-3 text-right">操作</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((archive) => (
            <Table.Row
              key={archive.id}
              className="cursor-pointer hover:bg-kumo-tint"
              onClick={() => onOpen(archive)}
            >
              <Table.Cell className="max-w-80 px-4 py-3">
                <p className="truncate font-medium text-kumo-default">
                  {archive.subject || '（无主题）'}
                </p>
                <p className="mt-0.5 truncate text-xs text-kumo-placeholder">
                  {getSenderLabel(archive.from, archive.fromName)} ·{' '}
                  {archive.from}
                </p>
              </Table.Cell>
              <Table.Cell className="max-w-56 truncate px-4 py-3 text-kumo-subtle">
                {archive.toEmail}
              </Table.Cell>
              <Table.Cell className="px-4 py-3">
                <StatusBadge label={archive.failureReason} tone="warning" />
              </Table.Cell>
              <Table.Cell className="whitespace-nowrap px-4 py-3 text-kumo-subtle">
                {formatRelativeTime(archive.receivedAt)}
              </Table.Cell>
              <Table.Cell className="px-4 py-3 text-right">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(archive)
                  }}
                >
                  查看
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  )
}
