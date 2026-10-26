import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Input, Select } from '@cloudflare/kumo'
import { ArrowRight, CheckCircle, LinkSimple } from '@phosphor-icons/react'
import { getErrorMessage } from '@/lib/api-client'
import { CopyButton } from '@/components/ui/copy-button'
import { useCreateLink } from '@/hooks/links'
import { usePublicDomains } from '@/hooks/settings'
import { toastError, toastSuccess } from '@/lib/toast'

const EXPIRY_OPTIONS: Record<string, string> = {
  '': '永久有效',
  '1h': '1 小时',
  '1d': '1 天',
  '1w': '1 周',
  '1m': '1 个月',
  '3m': '3 个月',
  '6m': '6 个月',
  '1y': '1 年',
}

export function CreateLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const domainsQuery = usePublicDomains()
  const createLink = useCreateLink()
  const [url, setUrl] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [domain, setDomain] = useState('')
  const [expiresIn, setExpiresIn] = useState('')
  const [maxClicks, setMaxClicks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  const domains = domainsQuery.data?.shortDomains ?? []
  const domainItems = useMemo(
    () => Object.fromEntries(domains.map((item) => [item.host, item.host])),
    [domains],
  )

  useEffect(() => {
    if (!open) return
    const defaultDomain =
      domains.find((item) => item.isDefault)?.host ?? domains[0]?.host ?? ''
    setDomain((current) => current || defaultDomain)
  }, [domains, open])

  useEffect(() => {
    if (!open) {
      setUrl('')
      setCustomSlug('')
      setExpiresIn('')
      setMaxClicks('')
      setError(null)
      setCreatedUrl(null)
    }
  }, [open])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError('请输入目标网址')
      return
    }
    try {
      const parsed = new URL(trimmedUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol')
      }
    } catch {
      setError('请输入完整的 http:// 或 https:// 链接')
      return
    }

    const clicks = maxClicks.trim() ? Number(maxClicks) : undefined
    if (clicks !== undefined && (!Number.isInteger(clicks) || clicks <= 0)) {
      setError('点击上限必须是大于 0 的整数')
      return
    }

    try {
      const result = await createLink.mutateAsync({
        url: trimmedUrl,
        customSlug: customSlug.trim() || undefined,
        domain: domain || undefined,
        expiresIn: expiresIn || undefined,
        maxClicks: clicks,
      })
      setCreatedUrl(result.shortUrl)
      toastSuccess({ title: '短链接已创建', description: result.shortUrl })
    } catch (submitError) {
      const message = getErrorMessage(submitError, '创建短链接失败')
      setError(message)
      toastError({ title: message })
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setCreatedUrl(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog size="lg" className="w-[calc(100vw-2rem)] p-0">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-kumo-strong">
                {createdUrl ? '短链接已生成' : '创建短链接'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-5 text-kumo-subtle">
                {createdUrl
                  ? '复制链接即可开始分享。'
                  : '将长网址转换为简洁、易分享的链接。'}
              </Dialog.Description>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
              <LinkSimple className="size-4" weight="bold" />
            </span>
          </div>

          {createdUrl ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-kumo-success-tint p-3 ring ring-kumo-hairline">
                <CheckCircle className="size-5 shrink-0 text-kumo-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-kumo-default">
                    {createdUrl}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-kumo-subtle">
                    {url}
                  </p>
                </div>
                <CopyButton
                  value={createdUrl}
                  successMessage="短链接已复制"
                  variant="secondary"
                  showLabel
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-kumo-hairline pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCreatedUrl(null)
                    setUrl('')
                    setCustomSlug('')
                    setMaxClicks('')
                  }}
                >
                  再建一个
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleClose(false)}
                >
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <Input
                label="目标网址"
                required
                type="url"
                inputMode="url"
                placeholder="https://example.com/your/long/url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={createLink.isPending}
                autoFocus
                className="w-full"
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-kumo-default">
                  短链接域名与后缀
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    aria-label="短链接域名"
                    className="w-full sm:w-44"
                    value={domain}
                    onValueChange={(value) => setDomain(value ?? '')}
                    items={domainItems}
                    placeholder={domains.length ? '选择域名' : '暂无可用域名'}
                    disabled={!domains.length || createLink.isPending}
                  />
                  <div className="flex min-w-0 flex-1 items-center rounded-lg bg-kumo-base ring ring-kumo-line px-3">
                    <span className="truncate text-sm text-kumo-placeholder">
                      {domain || 'domain'}
                    </span>
                    <span className="px-1 text-sm text-kumo-inactive">/</span>
                    <input
                      className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-kumo-placeholder"
                      placeholder="随机生成"
                      value={customSlug}
                      onChange={(event) =>
                        setCustomSlug(
                          event.target.value
                            .replace(/[^a-zA-Z0-9_-]/g, '')
                            .slice(0, 50),
                        )
                      }
                      disabled={createLink.isPending}
                    />
                  </div>
                </div>
                {domains.length ? (
                  <p className="mt-1.5 text-xs text-kumo-placeholder">
                    留空将自动生成 5 位后缀；可用字符：字母、数字、-、_
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-kumo-warning">
                    管理员尚未启用短链域名，暂时无法创建。
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="有效期"
                  className="w-full"
                  value={expiresIn}
                  onValueChange={(value) => setExpiresIn(value ?? '')}
                  items={EXPIRY_OPTIONS}
                  disabled={createLink.isPending}
                />
                <Input
                  label="点击上限（可选）"
                  type="number"
                  min={1}
                  placeholder="不限"
                  value={maxClicks}
                  onChange={(event) => setMaxClicks(event.target.value)}
                  disabled={createLink.isPending}
                  className="w-full"
                />
              </div>

              {error ? (
                <p className="rounded-lg bg-kumo-danger-tint px-3 py-2 text-sm text-kumo-danger">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-kumo-hairline pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleClose(false)}
                  disabled={createLink.isPending}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={createLink.isPending}
                  disabled={!domains.length || createLink.isPending}
                  icon={<ArrowRight className="size-3.5" />}
                >
                  生成短链接
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
