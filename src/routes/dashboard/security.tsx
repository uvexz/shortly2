import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, Table } from '@cloudflare/kumo'
import {
  Fingerprint,
  Key,
  Laptop,
  Plus,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react'
import { authClient } from '@/lib/auth-client'
import { useBootstrap } from '@/lib/bootstrap'
import { formatDate } from '@/lib/format'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toastError, toastSuccess } from '@/lib/toast'

type PasskeyRecord = {
  id: string
  name?: string | null
  createdAt?: string | Date
  credentialID?: string
  deviceType?: string
  backedUp?: boolean
}

export const Route = createFileRoute('/dashboard/security')({
  component: SecurityPage,
})

function getPasskeyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  const normalized = message.toLowerCase()
  if (!normalized) return '暂时无法完成通行密钥操作，请稍后重试。'
  if (
    normalized.includes('notallowederror') ||
    normalized.includes('timed out') ||
    normalized.includes('cancel')
  ) {
    return '你已取消本次通行密钥操作，未做任何更改。'
  }
  if (
    normalized.includes('notsupportederror') ||
    normalized.includes('not supported')
  ) {
    return '当前浏览器或设备暂不支持通行密钥。'
  }
  if (normalized.includes('security') || normalized.includes('https')) {
    return '当前环境不满足通行密钥安全要求，请使用 HTTPS 或 localhost。'
  }
  if (
    normalized.includes('invalidstateerror') ||
    normalized.includes('already registered') ||
    normalized.includes('duplicate')
  ) {
    return '这个设备上的通行密钥已经添加过了。'
  }
  return '暂时无法完成通行密钥操作，请稍后重试。'
}

function SecurityPage() {
  const { user } = useBootstrap()
  const { data, isPending, refetch } = authClient.useListPasskeys()
  const [adding, setAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PasskeyRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const passkeys = (data ?? []) as PasskeyRecord[]
  const supportsPasskey =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  const backedUpCount = passkeys.filter((passkey) => passkey.backedUp).length

  async function handleAddPasskey() {
    setAdding(true)
    try {
      const result = await authClient.passkey.addPasskey({
        name: `${navigator.platform || '设备'} · ${new Date().toLocaleDateString()}`,
      })
      if (result?.error) {
        toastError({ title: getPasskeyError(result.error) })
        return
      }
      toastSuccess({ title: '通行密钥已添加' })
      await refetch()
    } catch (error) {
      toastError({ title: getPasskeyError(error) })
    } finally {
      setAdding(false)
    }
  }

  async function handleDeletePasskey() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const result = await authClient.passkey.deletePasskey({
        id: pendingDelete.id,
      })
      if (result?.error) {
        toastError({ title: '删除通行密钥失败，请稍后重试。' })
        return
      }
      toastSuccess({ title: '通行密钥已删除' })
      setPendingDelete(null)
      await refetch()
    } catch {
      toastError({ title: '删除通行密钥失败，请稍后重试。' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="账户安全"
        description="使用指纹、面容或设备密码登录，减少对验证码的依赖。"
        actions={
          supportsPasskey ? (
            <Button
              variant="primary"
              loading={adding}
              onClick={() => void handleAddPasskey()}
              icon={<Plus className="size-3.5" weight="bold" />}
            >
              添加通行密钥
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          icon={supportsPasskey ? ShieldCheck : Fingerprint}
          label="安全状态"
          value={
            !supportsPasskey
              ? '当前设备不支持'
              : passkeys.length
                ? '已启用'
                : '建议启用'
          }
          description={user?.email ?? ''}
        />
        <Metric
          icon={Key}
          label="已注册密钥"
          value={isPending ? '同步中' : `${passkeys.length}`}
          description="至少保留一枚常用设备密钥"
        />
        <Metric
          icon={Laptop}
          label="备份覆盖"
          value={isPending ? '同步中' : `${backedUpCount}`}
          description="已由平台标记备份的凭证"
        />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="通行密钥"
          description="凭证保存在你的设备或平台账户中，本站只存储公钥。"
          action={
            supportsPasskey ? (
              <Button
                variant="secondary"
                loading={adding}
                onClick={() => void handleAddPasskey()}
                icon={<Plus className="size-3.5" />}
              >
                添加
              </Button>
            ) : null
          }
        />

        {isPending ? (
          <TableLoading rows={3} />
        ) : !passkeys.length ? (
          <EmptyState
            icon={<Fingerprint className="size-5" />}
            title="还没有通行密钥"
            description={
              supportsPasskey
                ? '添加一枚通行密钥，下次登录时无需等待验证码。'
                : '当前浏览器或设备不支持通行密钥，请使用 HTTPS 或 localhost 环境。'
            }
            action={
              supportsPasskey ? (
                <Button
                  variant="primary"
                  onClick={() => void handleAddPasskey()}
                >
                  添加通行密钥
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[640px]">
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="px-4 py-3">名称</Table.Head>
                    <Table.Head className="px-4 py-3">设备类型</Table.Head>
                    <Table.Head className="px-4 py-3">备份</Table.Head>
                    <Table.Head className="px-4 py-3">创建时间</Table.Head>
                    <Table.Head className="px-4 py-3 text-right">
                      操作
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {passkeys.map((passkey) => (
                    <Table.Row key={passkey.id}>
                      <Table.Cell className="px-4 py-3">
                        <p className="font-medium text-kumo-default">
                          {passkey.name || '未命名通行密钥'}
                        </p>
                        {passkey.credentialID ? (
                          <p className="mt-0.5 max-w-56 truncate font-mono text-xs text-kumo-placeholder">
                            {passkey.credentialID}
                          </p>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-kumo-subtle">
                        {passkey.deviceType || '—'}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3">
                        <StatusBadge
                          label={passkey.backedUp ? '已备份' : '仅本设备'}
                          tone={passkey.backedUp ? 'success' : 'neutral'}
                        />
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-kumo-subtle">
                        {formatDate(passkey.createdAt)}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {passkey.credentialID ? (
                            <CopyButton
                              value={passkey.credentialID}
                              successMessage="通行密钥 ID 已复制"
                            />
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={<Trash className="size-4" />}
                            aria-label="删除通行密钥"
                            onClick={() => setPendingDelete(passkey)}
                          />
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>

            <div className="divide-y divide-kumo-hairline md:hidden">
              {passkeys.map((passkey) => (
                <div key={passkey.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-kumo-strong">
                        {passkey.name || '未命名通行密钥'}
                      </p>
                      <p className="mt-1 text-xs text-kumo-subtle">
                        {passkey.deviceType || '—'} ·{' '}
                        {formatDate(passkey.createdAt)}
                      </p>
                    </div>
                    <StatusBadge
                      label={passkey.backedUp ? '已备份' : '仅本设备'}
                      tone={passkey.backedUp ? 'success' : 'neutral'}
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    {passkey.credentialID ? (
                      <CopyButton
                        value={passkey.credentialID}
                        successMessage="通行密钥 ID 已复制"
                        variant="secondary"
                        showLabel
                        label="复制 ID"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary-destructive"
                      onClick={() => setPendingDelete(passkey)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <div className="mt-4 rounded-lg bg-kumo-info-tint p-4">
        <h2 className="text-base font-semibold text-kumo-strong">
          登录保护说明
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-5 text-kumo-default/80">
          <li>
            · 通行密钥使用指纹、面容或设备密码完成验证，不依赖短信或邮箱验证码。
          </li>
          <li>· 完整凭证保存在你的设备或平台账户中，站点只保存公钥。</li>
          <li>
            · 通行密钥需要 HTTPS 或 localhost 环境；当前站点如果使用 http
            域名，浏览器会拒绝注册。
          </li>
        </ul>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除通行密钥"
        description={
          pendingDelete
            ? `删除「${pendingDelete.name || '未命名通行密钥'}」后，该设备将无法再使用它登录。`
            : undefined
        }
        confirmLabel="删除"
        onConfirm={handleDeletePasskey}
        loading={deleting}
        destructive
      />
    </>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-lg bg-kumo-base p-4 shadow-xs ring ring-kumo-line">
      <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-sm text-kumo-subtle">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-kumo-strong">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-kumo-placeholder">
        {description}
      </p>
    </div>
  )
}
