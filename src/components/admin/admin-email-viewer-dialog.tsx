import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Tabs } from '@cloudflare/kumo'
import { Paperclip } from '@phosphor-icons/react'
import { useAdminArchiveDetail, useAdminMessageDetail } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { buildEmailIframeSrcDoc, getSenderLabel } from '@/lib/email-html'
import { formatBytes, formatDateTime } from '@/lib/format'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading'
import type {
  AdminArchiveDetail,
  AdminMessageDetail,
  MessageAttachment,
  MessageContact,
  MessageHeader,
} from '@/lib/api-types'

type ViewerMode = 'message' | 'archive'

const tabs = [
  { value: 'text', label: '纯文本' },
  { value: 'html', label: 'HTML' },
  { value: 'source', label: '源码' },
  { value: 'headers', label: '头部' },
]

type NormalizedEmail = {
  subject: string
  from: string
  fromName: string | null
  recipient: string
  receivedAt: string
  text: string
  html: string
  hasText: boolean
  hasHtml: boolean
  cc: MessageContact[]
  replyTo: MessageContact[]
  headers: MessageHeader[]
  attachments: MessageAttachment[]
  meta: string[]
  failureReason?: string
}

function normalizeMessage(detail: AdminMessageDetail): NormalizedEmail {
  return {
    subject: detail.subject,
    from: detail.from,
    fromName: detail.fromName,
    recipient: detail.mailboxEmailAddress,
    receivedAt: detail.receivedAt,
    text: detail.text,
    html: detail.html,
    hasText: detail.hasText,
    hasHtml: detail.hasHtml,
    cc: detail.cc,
    replyTo: detail.replyTo,
    headers: detail.headers,
    attachments: detail.attachments,
    meta: [
      `所属用户：${detail.userName || '—'} <${detail.userEmail || '—'}>`,
      `读取状态：${detail.isRead ? '已读' : '未读'}`,
    ],
  }
}

function normalizeArchive(detail: AdminArchiveDetail): NormalizedEmail {
  return {
    subject: detail.subject,
    from: detail.from,
    fromName: detail.fromName,
    recipient: detail.toEmail,
    receivedAt: detail.receivedAt,
    text: detail.text,
    html: detail.html,
    hasText: detail.hasText,
    hasHtml: detail.hasHtml,
    cc: detail.cc,
    replyTo: detail.replyTo,
    headers: detail.headers,
    attachments: detail.attachments,
    meta: [],
    failureReason: detail.failureReason,
  }
}

function buildSource(email: NormalizedEmail): string {
  const headerLines = email.headers.length
    ? email.headers.map((header) => `${header.name}: ${header.value}`)
    : [
        `From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`,
        `To: ${email.recipient}`,
        `Subject: ${email.subject || '(no subject)'}`,
        `Date: ${email.receivedAt}`,
      ]
  const body = email.text || email.html || '(empty message)'
  return `${headerLines.join('\n')}\n\n${body}`
}

export function AdminEmailViewerDialog({
  mode,
  id,
  open,
  onOpenChange,
}: {
  mode: ViewerMode
  id: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const messageQuery = useAdminMessageDetail(
    open && mode === 'message' ? id : null,
  )
  const archiveQuery = useAdminArchiveDetail(
    open && mode === 'archive' ? id : null,
  )
  const [tab, setTab] = useState('text')

  useEffect(() => {
    if (open) setTab('text')
  }, [id, mode, open])

  const email = useMemo<NormalizedEmail | null>(() => {
    if (mode === 'message' && messageQuery.data?.data) {
      return normalizeMessage(messageQuery.data.data)
    }
    if (mode === 'archive' && archiveQuery.data?.data) {
      return normalizeArchive(archiveQuery.data.data)
    }
    return null
  }, [archiveQuery.data?.data, messageQuery.data?.data, mode])

  const activeQuery = mode === 'message' ? messageQuery : archiveQuery

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-kumo-hairline p-5">
          {activeQuery.isPending ? (
            <div className="h-12 animate-pulse rounded-lg bg-kumo-tint" />
          ) : activeQuery.isError ? (
            <div>
              <Dialog.Title className="text-lg font-semibold text-kumo-strong">
                邮件加载失败
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-kumo-subtle">
                {getErrorMessage(activeQuery.error, '请稍后重试')}
              </Dialog.Description>
            </div>
          ) : !email ? (
            <EmptyState
              title="邮件不存在"
              description="它可能已被删除。"
              className="py-4"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Dialog.Title className="break-words text-lg font-semibold text-kumo-strong">
                    {email.subject || '（无主题）'}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 break-all text-sm text-kumo-subtle">
                    {getSenderLabel(email.from, email.fromName)} · {email.from}
                  </Dialog.Description>
                </div>
                <div className="flex items-center gap-2">
                  {email.failureReason ? (
                    <span className="rounded-md bg-kumo-danger-tint px-2 py-1 text-xs font-medium text-kumo-danger">
                      {email.failureReason}
                    </span>
                  ) : null}
                  <CopyButton
                    value={email.recipient}
                    successMessage="收件地址已复制"
                    variant="secondary"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-kumo-subtle sm:grid-cols-2">
                <p className="truncate">
                  <span className="text-kumo-placeholder">收件地址：</span>
                  {email.recipient}
                </p>
                <p className="truncate">
                  <span className="text-kumo-placeholder">接收时间：</span>
                  {formatDateTime(email.receivedAt)}
                </p>
                {email.meta.map((item) => (
                  <p key={item} className="truncate">
                    {item}
                  </p>
                ))}
                {email.replyTo.length ? (
                  <p className="truncate">
                    <span className="text-kumo-placeholder">回复地址：</span>
                    {email.replyTo
                      .map((contact) => contact.address ?? contact.name ?? '—')
                      .join(', ')}
                  </p>
                ) : null}
                {email.cc.length ? (
                  <p className="truncate">
                    <span className="text-kumo-placeholder">抄送：</span>
                    {email.cc
                      .map((contact) => contact.address ?? contact.name ?? '—')
                      .join(', ')}
                  </p>
                ) : null}
              </div>

              {email.attachments.length ? (
                <div className="mt-4 rounded-lg bg-kumo-elevated p-3 ring ring-kumo-hairline">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-kumo-default">
                    <Paperclip className="size-3.5" />
                    附件 {email.attachments.length} 个
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {email.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 text-xs text-kumo-subtle"
                      >
                        <span className="truncate">{attachment.filename}</span>
                        <span className="shrink-0">
                          {formatBytes(attachment.size)} ·{' '}
                          {attachment.mimeType || 'unknown'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {email ? (
          <>
            <div className="border-b border-kumo-hairline px-5 pt-3">
              <Tabs
                tabs={tabs}
                value={tab}
                onValueChange={setTab}
                variant="underline"
                size="sm"
              />
            </div>
            <div className="max-h-[55vh] overflow-y-auto scrollbar-thin p-5">
              {tab === 'text' ? (
                email.hasText ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-base leading-6 text-kumo-default">
                    {email.text}
                  </pre>
                ) : (
                  <p className="py-10 text-center text-sm text-kumo-placeholder">
                    没有纯文本内容
                  </p>
                )
              ) : null}

              {tab === 'html' ? (
                email.hasHtml ? (
                  <iframe
                    title="邮件 HTML 内容"
                    sandbox=""
                    srcDoc={buildEmailIframeSrcDoc(email.html)}
                    className="h-[420px] w-full rounded-lg bg-kumo-base ring ring-kumo-line"
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-kumo-placeholder">
                    没有 HTML 内容
                  </p>
                )
              ) : null}

              {tab === 'source' ? (
                <div className="relative">
                  <div className="absolute right-2 top-2">
                    <CopyButton
                      value={buildSource(email)}
                      successMessage="邮件源码已复制"
                      variant="secondary"
                    />
                  </div>
                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-kumo-contrast p-4 pr-12 font-mono text-sm leading-5 text-kumo-inverse/85 scrollbar-thin">
                    {buildSource(email)}
                  </pre>
                </div>
              ) : null}

              {tab === 'headers' ? (
                email.headers.length ? (
                  <div className="divide-y divide-kumo-hairline rounded-lg ring ring-kumo-line">
                    {email.headers.map((header, index) => (
                      <div
                        key={`${header.name}-${index}`}
                        className="grid grid-cols-1 gap-1 p-3 text-sm sm:grid-cols-[160px_minmax(0,1fr)]"
                      >
                        <span className="font-medium text-kumo-subtle">
                          {header.name}
                        </span>
                        <span className="break-all text-kumo-default">
                          {header.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-kumo-placeholder">
                    没有记录邮件头部
                  </p>
                )
              ) : null}

              {tab === 'html' && email.hasHtml ? (
                <p className="mt-2 text-xs text-kumo-placeholder">
                  HTML 在 sandbox iframe 中渲染，脚本已禁用。
                </p>
              ) : null}
            </div>
          </>
        ) : activeQuery.isPending ? (
          <LoadingBlock rows={5} className="max-h-80" />
        ) : null}

        <div className="flex justify-end border-t border-kumo-hairline p-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
