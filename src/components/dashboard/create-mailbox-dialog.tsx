import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Select } from '@cloudflare/kumo'
import { CheckCircle, EnvelopeSimple } from '@phosphor-icons/react'
import { getErrorMessage } from '@/lib/api-client'
import { CopyButton } from '@/components/ui/copy-button'
import { useCreateMailbox } from '@/hooks/mail'
import { usePublicDomains } from '@/hooks/settings'
import { toastError, toastSuccess } from '@/lib/toast'

function randomLocalPart() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')
}

export function CreateMailboxDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const domainsQuery = usePublicDomains()
  const createMailbox = useCreateMailbox()
  const [localPart, setLocalPart] = useState('')
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdAddress, setCreatedAddress] = useState<string | null>(null)

  const domains = domainsQuery.data?.emailDomains ?? []
  const domainItems = useMemo(
    () => Object.fromEntries(domains.map((item) => [item.host, item.host])),
    [domains],
  )
  const selectedDomain = domains.find((item) => item.host === domain)

  useEffect(() => {
    if (!open) return
    const defaultDomain =
      domains.find((item) => item.isDefault)?.host ?? domains[0]?.host ?? ''
    setDomain((current) => current || defaultDomain)
  }, [domains, open])

  useEffect(() => {
    if (!open) {
      setLocalPart('')
      setError(null)
      setCreatedAddress(null)
    }
  }, [open])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!domain) {
      setError('暂无可用邮箱域名')
      return
    }

    const prefix = localPart.trim() || randomLocalPart()
    const minLength = selectedDomain?.minLocalPartLength ?? 1
    if (prefix.length < minLength) {
      setError(`邮箱前缀至少需要 ${minLength} 个字符`)
      return
    }

    try {
      const result = await createMailbox.mutateAsync(`${prefix}@${domain}`)
      setCreatedAddress(result.data.emailAddress)
      toastSuccess({
        title: '临时邮箱已创建',
        description: result.data.emailAddress,
      })
    } catch (submitError) {
      const message = getErrorMessage(submitError, '创建临时邮箱失败')
      setError(message)
      toastError({ title: message })
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) setCreatedAddress(null)
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog size="lg" className="w-[calc(100vw-2rem)] p-0">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-tight text-neutral-900">
                {createdAddress ? '临时邮箱已生成' : '生成临时邮箱'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-neutral-500">
                {createdAddress
                  ? '现在可以开始接收邮件了。'
                  : '创建一个临时地址，用于接收非敏感邮件。'}
              </Dialog.Description>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
              <EnvelopeSimple className="size-4" weight="bold" />
            </span>
          </div>

          {createdAddress ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <CheckCircle className="size-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {createdAddress}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    地址会保持可用，直到你手动删除。
                  </p>
                </div>
                <CopyButton
                  value={createdAddress}
                  successMessage="邮箱地址已复制"
                  variant="secondary"
                  showLabel
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => {
                    setCreatedAddress(null)
                    setLocalPart('')
                  }}
                >
                  再建一个
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="h-9 px-3 text-xs"
                  onClick={() => handleClose(false)}
                >
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-700">
                  邮箱前缀（可选）
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                    placeholder="留空则随机生成"
                    value={localPart}
                    onChange={(event) =>
                      setLocalPart(
                        event.target.value
                          .replace(/[^a-zA-Z0-9._-]/g, '')
                          .slice(0, 64),
                      )
                    }
                    disabled={createMailbox.isPending}
                  />
                  <Select
                    aria-label="邮箱域名"
                    className="w-full sm:w-48"
                    value={domain}
                    onValueChange={(value) => setDomain(value ?? '')}
                    items={domainItems}
                    placeholder={domains.length ? '选择域名' : '暂无可用域名'}
                    disabled={!domains.length || createMailbox.isPending}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-neutral-400">
                  可用字符：字母、数字、点、连字符、下划线
                  {selectedDomain
                    ? ` · 该域名最少 ${selectedDomain.minLocalPartLength} 个字符`
                    : ''}
                </p>
              </div>

              <div className="rounded-lg bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500">
                提示：临时邮箱不适合接收重要账户、安全验证或个人敏感信息。本站不提供邮箱有效期设置，地址会一直保留到手动删除。
              </div>

              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => handleClose(false)}
                  disabled={createMailbox.isPending}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="h-9 px-3 text-xs"
                  loading={createMailbox.isPending}
                  disabled={!domains.length || createMailbox.isPending}
                >
                  生成邮箱
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
