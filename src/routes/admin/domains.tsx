import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@cloudflare/kumo'
import {
  ArrowsClockwise,
  EnvelopeSimple,
  GlobeHemisphereWest,
  LinkSimple,
  PencilSimple,
  Plus,
  Star,
  Trash,
} from '@phosphor-icons/react'
import type { AdminDomainDto } from '@/lib/api-types'
import { useAdminDomains, useDeleteAdminDomain } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { DomainFormDialog } from '@/components/admin/domain-form-dialog'
import {
  PageHeader,
  Panel,
  PanelHeader,
  QuietNote,
} from '@/components/ui/page-header'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { StatusBadge } from '@/components/ui/status-badge'
import { toastError, toastSuccess } from '@/lib/toast'

export const Route = createFileRoute('/admin/domains')({
  component: AdminDomainsPage,
})

function AdminDomainsPage() {
  const domainsQuery = useAdminDomains()
  const deleteDomain = useDeleteAdminDomain()
  const [formOpen, setFormOpen] = useState(false)
  const [editingDomain, setEditingDomain] = useState<AdminDomainDto | null>(
    null,
  )
  const [pendingDelete, setPendingDelete] = useState<AdminDomainDto | null>(
    null,
  )

  const domains = domainsQuery.data?.data ?? []

  function openCreate() {
    setEditingDomain(null)
    setFormOpen(true)
  }

  function openEdit(domain: AdminDomainDto) {
    setEditingDomain(domain)
    setFormOpen(true)
  }

  async function handleDelete() {
    if (!pendingDelete) return
    try {
      await deleteDomain.mutateAsync(pendingDelete.id)
      toastSuccess({ title: '域名已删除', description: pendingDelete.host })
      setPendingDelete(null)
    } catch (error) {
      toastError({ title: getErrorMessage(error, '删除域名失败') })
    }
  }

  return (
    <>
      <PageHeader
        title="域名管理"
        description="管理短链接域名与临时邮箱域名。"
        actions={
          <Button
            variant="primary"
            onClick={openCreate}
            icon={<Plus className="size-3.5" weight="bold" />}
          >
            添加域名
          </Button>
        }
      />

      <QuietNote
        icon={<GlobeHemisphereWest className="size-3.5" />}
        className="mb-4 max-w-3xl"
      >
        <span className="font-medium text-kumo-default">
          域名配置会即时影响创建表单和 API 发现结果。
        </span>{' '}
        默认短链域名和默认邮箱域名各只能有一个；默认域名不能删除。DNS
        解析和邮件路由需在域名服务商侧配置。
      </QuietNote>

      <Panel>
        <PanelHeader
          title="全部域名"
          description="查看启用状态、默认用途和地址格式要求"
          action={
            <Button
              variant="ghost"
              onClick={() => void domainsQuery.refetch()}
              icon={<ArrowsClockwise className="size-3.5" />}
            >
              刷新
            </Button>
          }
        />

        {domainsQuery.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(domainsQuery.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() => void domainsQuery.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : domainsQuery.isPending ? (
          <TableLoading rows={3} />
        ) : !domains.length ? (
          <EmptyState
            icon={<GlobeHemisphereWest className="size-5" />}
            title="还没有域名"
            description="添加一个域名后，用户才能创建短链接或临时邮箱。"
            action={
              <Button variant="primary" onClick={openCreate}>
                添加域名
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-kumo-hairline">
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="group flex flex-col gap-4 px-4 py-4 hover:bg-kumo-tint/40 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <GlobeHemisphereWest className="size-4 shrink-0 text-kumo-placeholder" />
                    <p
                      className="truncate text-[15px] font-semibold text-kumo-strong"
                      title={domain.host}
                    >
                      {domain.host}
                    </p>
                  </div>
                  <p className="ml-6 mt-0.5 text-xs text-kumo-placeholder">
                    创建于 {formatDate(domain.createdAt)}
                  </p>
                  <div className="ml-6 mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge
                      label={domain.isActive ? '启用中' : '已停用'}
                      tone={domain.isActive ? 'success' : 'neutral'}
                    />
                    {domain.isDefaultShortDomain ? (
                      <StatusBadge
                        label="默认短链"
                        tone="info"
                        className="[&>i]:hidden"
                      >
                        <Star className="size-2.5" weight="fill" />
                      </StatusBadge>
                    ) : null}
                    {domain.isDefaultEmailDomain ? (
                      <StatusBadge
                        label="默认邮箱"
                        tone="info"
                        className="[&>i]:hidden"
                      >
                        <Star className="size-2.5" weight="fill" />
                      </StatusBadge>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-kumo-placeholder">
                      <LinkSimple className="size-3" />
                      短链接
                    </p>
                    <p className="mt-1 truncate font-medium text-kumo-default">
                      {domain.supportsShortLinks
                        ? `支持 · 最短 ${domain.shortLinkMinSlugLength} 字符`
                        : '未启用'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-kumo-placeholder">
                      <EnvelopeSimple className="size-3" />
                      临时邮箱
                    </p>
                    <p className="mt-1 truncate font-medium text-kumo-default">
                      {domain.supportsTempEmail
                        ? `支持 · 最短 ${domain.tempEmailMinLocalPartLength} 字符`
                        : '未启用'}
                    </p>
                  </div>
                </div>

                <div className="row-actions flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    shape="square"
                    size="sm"
                    icon={<PencilSimple className="size-4" />}
                    aria-label={`编辑域名 ${domain.host}`}
                    onClick={() => openEdit(domain)}
                  />
                  <Button
                    variant="ghost"
                    shape="square"
                    size="sm"
                    icon={<Trash className="size-4" />}
                    aria-label={`删除域名 ${domain.host}`}
                    disabled={
                      domain.isDefaultShortDomain || domain.isDefaultEmailDomain
                    }
                    title={
                      domain.isDefaultShortDomain || domain.isDefaultEmailDomain
                        ? '默认域名不能删除'
                        : '删除域名'
                    }
                    onClick={() => setPendingDelete(domain)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <DomainFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        domain={editingDomain}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除域名"
        description={
          pendingDelete
            ? `删除 ${pendingDelete.host} 后，该域名下的新短链和邮箱创建将不可用；已有数据不会被删除。`
            : undefined
        }
        confirmLabel="删除"
        onConfirm={handleDelete}
        loading={deleteDomain.isPending}
        destructive
      />
    </>
  )
}
