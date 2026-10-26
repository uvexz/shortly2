import { useEffect, useState } from 'react'
import { Button, Dialog, Tabs } from '@cloudflare/kumo'
import {
  ArrowSquareOut,
  EnvelopeSimple,
  Paperclip,
  Trash,
} from '@phosphor-icons/react'
import { useDeleteMessage, useMessageDetail } from '@/hooks/mail'
import { getErrorMessage } from '@/lib/api-client'
import {
  buildEmailIframeSrcDoc,
  buildEmailSource,
  getSenderLabel,
} from '@/lib/email-html'
import { formatBytes, formatDateTime } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading'
import { StatusBadge } from '@/components/ui/status-badge'
import { toastError, toastSuccess } from '@/lib/toast'

type DetailTab = 'text' | 'html' | 'source' | 'headers'

const tabItems = [
  { value: 'text', label: '纯文本' },
  { value: 'html', label: 'HTML' },
  { value: 'source', label: '源码' },
  { value: 'headers', label: '头部' },
]

export function MessageDetailDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const query = useMessageDetail(open ? messageId : null)
  const deleteMessage = useDeleteMessage()
  const [tab, setTab] = useState<DetailTab>('text')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) setTab('text')
  }, [messageId, open])

  const detail = query.data?.data

  async function handleDelete() {
    if (!messageId) return
    try {
      await deleteMessage.mutateAsync(messageId)
      toastSuccess({ title: '邮件已删除' })
      setConfirmDelete(false)
      onOpenChange(false)
    } catch (deleteError) {
      toastError({ title: getErrorMessage(deleteError, '删除邮件失败') })
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog size="xl" className="w-[calc(100vw-2rem)] p-0">
          <div className="border-b border-neutral-100 p-5">
            {query.isPending ? (
              <div className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ) : query.isError ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Dialog.Title className="text-base font-semibold text-neutral-900">
                    邮件加载失败
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-xs text-neutral-500">
                    {getErrorMessage(query.error, '请稍后重试')}
                  </Dialog.Description>
                </div>
                <Button
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => void query.refetch()}
                >
                  重试
                </Button>
              </div>
            ) : detail ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="break-words text-base font-semibold text-neutral-900">
                      {detail.subject || '（无主题）'}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 break-all text-xs text-neutral-500">
                      {getSenderLabel(detail.from, detail.fromName)} ·{' '}
                      {detail.from}
                    </Dialog.Description>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={detail.isRead ? '已读' : '未读'}
                      tone={detail.isRead ? 'neutral' : 'info'}
                    />
                    <CopyButton
                      value={detail.mailboxEmailAddress}
                      successMessage="收件地址已复制"
                      variant="secondary"
                    />
                    <Button
                      variant="secondary-destructive"
                      shape="square"
                      className="size-8"
                      icon={<Trash className="size-4" />}
                      aria-label="删除邮件"
                      title="删除邮件"
                      onClick={() => setConfirmDelete(true)}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-neutral-500 sm:grid-cols-2">
                  <p className="truncate">
                    <span className="text-neutral-400">收件地址：</span>
                    {detail.mailboxEmailAddress}
                  </p>
                  <p className="truncate">
                    <span className="text-neutral-400">接收时间：</span>
                    {formatDateTime(detail.receivedAt)}
                  </p>
                  {detail.replyTo.length ? (
                    <p className="truncate">
                      <span className="text-neutral-400">回复地址：</span>
                      {detail.replyTo
                        .map((item) => item.address ?? item.name ?? '—')
                        .join(', ')}
                    </p>
                  ) : null}
                  {detail.cc.length ? (
                    <p className="truncate">
                      <span className="text-neutral-400">抄送：</span>
                      {detail.cc
                        .map((item) => item.address ?? item.name ?? '—')
                        .join(', ')}
                    </p>
                  ) : null}
                </div>

                {detail.hasAttachments ? (
                  <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-700">
                      <Paperclip className="size-3.5" />
                      附件 {detail.attachments.length} 个
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {detail.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between gap-3 text-[10px] text-neutral-500"
                        >
                          <span className="truncate">
                            {attachment.filename}
                          </span>
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
            ) : (
              <EmptyState
                icon={<EnvelopeSimple className="size-5" />}
                title="邮件不存在"
                description="它可能已被删除。"
                className="py-4"
              />
            )}
          </div>

          {detail ? (
            <>
              <div className="border-b border-neutral-100 px-5 pt-3">
                <Tabs
                  tabs={tabItems}
                  value={tab}
                  onValueChange={(value) => setTab(value as DetailTab)}
                  variant="underline"
                  size="sm"
                />
              </div>
              <div className="max-h-[55vh] overflow-y-auto scrollbar-thin p-5">
                {tab === 'text' ? (
                  detail.hasText ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-neutral-800">
                      {detail.text}
                    </pre>
                  ) : (
                    <EmptyText label="这封邮件没有纯文本内容" />
                  )
                ) : null}

                {tab === 'html' ? (
                  detail.hasHtml ? (
                    <iframe
                      title="邮件 HTML 内容"
                      sandbox=""
                      srcDoc={buildEmailIframeSrcDoc(detail.html)}
                      className="h-[420px] w-full rounded-lg border border-neutral-200 bg-white"
                    />
                  ) : (
                    <EmptyText label="这封邮件没有 HTML 内容" />
                  )
                ) : null}

                {tab === 'source' ? (
                  <div className="relative">
                    <div className="absolute right-2 top-2">
                      <CopyButton
                        value={buildEmailSource(detail)}
                        successMessage="邮件源码已复制"
                        variant="secondary"
                      />
                    </div>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-950 p-4 pr-12 font-mono text-[11px] leading-5 text-neutral-200 scrollbar-thin">
                      {buildEmailSource(detail)}
                    </pre>
                  </div>
                ) : null}

                {tab === 'headers' ? (
                  detail.headers.length ? (
                    <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                      {detail.headers.map((header, index) => (
                        <div
                          key={`${header.name}-${index}`}
                          className="grid grid-cols-1 gap-1 p-3 text-[11px] sm:grid-cols-[160px_minmax(0,1fr)]"
                        >
                          <span className="font-medium text-neutral-500">
                            {header.name}
                          </span>
                          <span className="break-all text-neutral-700">
                            {header.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText label="没有记录邮件头部" />
                  )
                ) : null}
              </div>
            </>
          ) : query.isPending ? (
            <LoadingBlock rows={5} className="max-h-80" />
          ) : null}

          <div className="flex justify-end border-t border-neutral-100 p-4">
            <Button
              variant="secondary"
              className="h-9 px-3 text-xs"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="删除邮件"
        description="删除后无法恢复，也不会保留副本。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        loading={deleteMessage.isPending}
        destructive
      />
    </>
  )
}

function EmptyText({ label }: { label: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs text-neutral-400">
      <ArrowSquareOut className="size-5" />
      {label}
    </div>
  )
}
