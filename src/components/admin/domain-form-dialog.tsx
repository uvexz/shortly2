import { useEffect, useState } from 'react'
import { Button, Dialog, Input, Switch } from '@cloudflare/kumo'
import { GlobeHemisphereWest } from '@phosphor-icons/react'
import type { AdminDomainDto } from '@/lib/api-types'
import { useCreateAdminDomain, useUpdateAdminDomain } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { toastError, toastSuccess } from '@/lib/toast'

type DomainFormState = {
  host: string
  supportsShortLinks: boolean
  shortLinkMinSlugLength: string
  supportsTempEmail: boolean
  tempEmailMinLocalPartLength: string
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
}

const emptyForm: DomainFormState = {
  host: '',
  supportsShortLinks: true,
  shortLinkMinSlugLength: '1',
  supportsTempEmail: false,
  tempEmailMinLocalPartLength: '1',
  isActive: true,
  isDefaultShortDomain: false,
  isDefaultEmailDomain: false,
}

function toForm(domain: AdminDomainDto): DomainFormState {
  return {
    host: domain.host,
    supportsShortLinks: domain.supportsShortLinks,
    shortLinkMinSlugLength: String(domain.shortLinkMinSlugLength),
    supportsTempEmail: domain.supportsTempEmail,
    tempEmailMinLocalPartLength: String(domain.tempEmailMinLocalPartLength),
    isActive: domain.isActive,
    isDefaultShortDomain: domain.isDefaultShortDomain,
    isDefaultEmailDomain: domain.isDefaultEmailDomain,
  }
}

export function DomainFormDialog({
  open,
  onOpenChange,
  domain,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: AdminDomainDto | null
}) {
  const createDomain = useCreateAdminDomain()
  const updateDomain = useUpdateAdminDomain()
  const [form, setForm] = useState<DomainFormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(domain ? toForm(domain) : emptyForm)
    setError(null)
  }, [domain, open])

  function update<TKey extends keyof DomainFormState>(
    key: TKey,
    value: DomainFormState[TKey],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'supportsShortLinks' && value === false) {
        next.isDefaultShortDomain = false
      }
      if (key === 'supportsTempEmail' && value === false) {
        next.isDefaultEmailDomain = false
      }
      if (key === 'isActive' && value === false) {
        next.isDefaultShortDomain = false
        next.isDefaultEmailDomain = false
      }
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const host = form.host.trim()
    if (!host) {
      setError('请输入域名')
      return
    }
    if (
      form.isDefaultShortDomain &&
      (!form.supportsShortLinks || !form.isActive)
    ) {
      setError('默认短链域名必须启用且支持短链接')
      return
    }
    if (
      form.isDefaultEmailDomain &&
      (!form.supportsTempEmail || !form.isActive)
    ) {
      setError('默认邮箱域名必须启用且支持临时邮箱')
      return
    }

    const shortLinkMinSlugLength = Number(form.shortLinkMinSlugLength)
    const tempEmailMinLocalPartLength = Number(form.tempEmailMinLocalPartLength)
    if (
      !Number.isInteger(shortLinkMinSlugLength) ||
      shortLinkMinSlugLength < 1 ||
      shortLinkMinSlugLength > 50
    ) {
      setError('短链后缀最小长度必须是 1-50 的整数')
      return
    }
    if (
      !Number.isInteger(tempEmailMinLocalPartLength) ||
      tempEmailMinLocalPartLength < 1 ||
      tempEmailMinLocalPartLength > 64
    ) {
      setError('邮箱前缀最小长度必须是 1-64 的整数')
      return
    }

    const payload = {
      host,
      supportsShortLinks: form.supportsShortLinks,
      shortLinkMinSlugLength,
      supportsTempEmail: form.supportsTempEmail,
      tempEmailMinLocalPartLength,
      isActive: form.isActive,
      isDefaultShortDomain: form.isDefaultShortDomain,
      isDefaultEmailDomain: form.isDefaultEmailDomain,
    }

    try {
      if (domain) {
        await updateDomain.mutateAsync({ id: domain.id, changes: payload })
        toastSuccess({ title: '域名已更新', description: host })
      } else {
        await createDomain.mutateAsync(payload)
        toastSuccess({ title: '域名已添加', description: host })
      }
      onOpenChange(false)
    } catch (submitError) {
      const message = getErrorMessage(submitError, '保存域名失败')
      setError(message)
      toastError({ title: message })
    }
  }

  const pending = createDomain.isPending || updateDomain.isPending

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="w-[calc(100vw-2rem)] p-0">
        <form onSubmit={handleSubmit}>
          <div className="border-b border-neutral-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold tracking-tight text-neutral-900">
                  {domain ? '编辑域名' : '添加域名'}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-neutral-500">
                  配置域名可用于短链接、临时邮箱，或两者同时启用。
                </Dialog.Description>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                <GlobeHemisphereWest className="size-4" />
              </span>
            </div>
          </div>

          <div className="max-h-[65vh] space-y-5 overflow-y-auto scrollbar-thin p-5">
            <Input
              label="域名"
              required
              placeholder="link.example.com"
              value={form.host}
              onChange={(event) => update('host', event.target.value)}
              description="只填写主机名，不要包含协议、路径或端口。"
              disabled={pending}
              autoFocus
            />

            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <Switch
                label="启用短链接"
                variant="neutral"
                checked={form.supportsShortLinks}
                onCheckedChange={(checked) =>
                  update('supportsShortLinks', checked)
                }
                disabled={pending}
              />
              {form.supportsShortLinks ? (
                <Input
                  label="短链后缀最小长度"
                  type="number"
                  min={1}
                  max={50}
                  value={form.shortLinkMinSlugLength}
                  onChange={(event) =>
                    update('shortLinkMinSlugLength', event.target.value)
                  }
                  disabled={pending}
                />
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <Switch
                label="启用临时邮箱"
                variant="neutral"
                checked={form.supportsTempEmail}
                onCheckedChange={(checked) =>
                  update('supportsTempEmail', checked)
                }
                disabled={pending}
              />
              {form.supportsTempEmail ? (
                <Input
                  label="邮箱前缀最小长度"
                  type="number"
                  min={1}
                  max={64}
                  value={form.tempEmailMinLocalPartLength}
                  onChange={(event) =>
                    update('tempEmailMinLocalPartLength', event.target.value)
                  }
                  disabled={pending}
                />
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <Switch
                label="域名启用中"
                variant="neutral"
                checked={form.isActive}
                onCheckedChange={(checked) => update('isActive', checked)}
                disabled={pending}
              />
              <Switch
                label="设为默认短链域名"
                variant="neutral"
                checked={form.isDefaultShortDomain}
                onCheckedChange={(checked) =>
                  update('isDefaultShortDomain', checked)
                }
                disabled={pending || !form.supportsShortLinks || !form.isActive}
              />
              <Switch
                label="设为默认邮箱域名"
                variant="neutral"
                checked={form.isDefaultEmailDomain}
                onCheckedChange={(checked) =>
                  update('isDefaultEmailDomain', checked)
                }
                disabled={pending || !form.supportsTempEmail || !form.isActive}
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            ) : null}

            <p className="text-[10px] leading-4 text-neutral-400">
              v2 不包含 DNS
              验证流程；请先在域名服务商完成解析并配置入站邮件路由，再将域名添加到此处。
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-100 p-4">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-xs"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="h-9 px-3 text-xs"
              loading={pending}
              disabled={pending}
            >
              {domain ? '保存修改' : '添加域名'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  )
}
