import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Input, Table } from '@cloudflare/kumo'
import {
  ArrowsClockwise,
  ShieldWarning,
  UsersThree,
} from '@phosphor-icons/react'
import type { AdminUserDto } from '@/lib/api-types'
import { useAdminUsers, useSetUserBan } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { useBootstrap } from '@/lib/bootstrap'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { PaginationBar } from '@/components/ui/pagination-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { toastError, toastSuccess } from '@/lib/toast'

const PAGE_SIZE = 20

export const Route = createFileRoute('/admin/users')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: Number(search.page) > 0 ? Number(search.page) : undefined,
  }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const page = search.page ?? 1
  const { user: currentUser } = useBootstrap()
  const usersQuery = useAdminUsers(page, PAGE_SIZE)
  const setUserBan = useSetUserBan()
  const [pendingUser, setPendingUser] = useState<AdminUserDto | null>(null)
  const [banReason, setBanReason] = useState('')

  const users = usersQuery.data?.data ?? []

  function openBanDialog(user: AdminUserDto) {
    setBanReason(user.banReason ?? '')
    setPendingUser(user)
  }

  async function handleBanToggle() {
    if (!pendingUser) return
    const nextBanned = !pendingUser.banned
    try {
      await setUserBan.mutateAsync({
        id: pendingUser.id,
        banned: nextBanned,
        banReason: nextBanned ? banReason.trim() || '管理员封禁' : undefined,
      })
      toastSuccess({
        title: nextBanned ? '用户已封禁' : '用户已解封',
        description: pendingUser.email,
      })
      setPendingUser(null)
      setBanReason('')
    } catch (error) {
      toastError({ title: getErrorMessage(error, '更新用户状态失败') })
    }
  }

  return (
    <>
      <PageHeader
        title="用户管理"
        description="查看用户状态，处理封禁与解封。"
      />

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-kumo-hairline px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-kumo-strong">
              全部用户
            </h2>
            <p className="mt-0.5 text-xs text-kumo-placeholder">
              封禁会立即删除该用户现有会话
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => void usersQuery.refetch()}
            icon={<ArrowsClockwise className="size-3.5" />}
          >
            刷新
          </Button>
        </div>

        {usersQuery.isError ? (
          <EmptyState
            title="加载失败"
            description={getErrorMessage(usersQuery.error, '请稍后重试')}
            action={
              <Button
                variant="secondary"
                onClick={() => void usersQuery.refetch()}
              >
                重试
              </Button>
            }
          />
        ) : usersQuery.isPending ? (
          <TableLoading rows={5} />
        ) : !users.length ? (
          <EmptyState
            icon={<UsersThree className="size-5" />}
            title="还没有用户"
            description="用户首次登录后会出现在这里。"
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[820px]">
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="px-4 py-3">用户</Table.Head>
                    <Table.Head className="px-4 py-3">角色</Table.Head>
                    <Table.Head className="px-4 py-3">短链接</Table.Head>
                    <Table.Head className="px-4 py-3">状态</Table.Head>
                    <Table.Head className="px-4 py-3">注册时间</Table.Head>
                    <Table.Head className="px-4 py-3 text-right">
                      操作
                    </Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {users.map((user) => {
                    const isSelf = user.id === currentUser?.id
                    return (
                      <Table.Row key={user.id}>
                        <Table.Cell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={user.name}
                              image={user.image}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="max-w-48 truncate font-medium text-kumo-default">
                                {user.name}
                                {isSelf ? (
                                  <span className="ml-1 text-xs text-kumo-placeholder">
                                    （你）
                                  </span>
                                ) : null}
                              </p>
                              <p className="max-w-48 truncate text-xs text-kumo-placeholder">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3">
                          <StatusBadge
                            label={user.role === 'admin' ? '管理员' : '用户'}
                            tone={user.role === 'admin' ? 'info' : 'neutral'}
                          />
                        </Table.Cell>
                        <Table.Cell className="numeric px-4 py-3 text-kumo-default">
                          {formatNumber(user.linkCount)}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge
                              label={user.banned ? '已封禁' : '正常'}
                              tone={user.banned ? 'danger' : 'success'}
                            />
                            {user.banned && user.banReason ? (
                              <span
                                className="max-w-40 truncate text-xs text-kumo-placeholder"
                                title={user.banReason}
                              >
                                {user.banReason}
                              </span>
                            ) : null}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-kumo-subtle">
                          {formatDate(user.createdAt)}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant={
                              user.banned
                                ? 'secondary'
                                : 'secondary-destructive'
                            }
                            disabled={isSelf}
                            onClick={() => openBanDialog(user)}
                          >
                            {user.banned ? '解封' : '封禁'}
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
            </div>

            <div className="divide-y divide-kumo-hairline md:hidden">
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id
                return (
                  <div key={user.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        name={user.name}
                        image={user.image}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-kumo-strong">
                          {user.name}
                          {isSelf ? '（你）' : ''}
                        </p>
                        <p className="truncate text-xs text-kumo-placeholder">
                          {user.email}
                        </p>
                      </div>
                      <StatusBadge
                        label={user.banned ? '已封禁' : '正常'}
                        tone={user.banned ? 'danger' : 'success'}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-kumo-subtle">
                      <span>
                        {user.role === 'admin' ? '管理员' : '用户'} ·{' '}
                        {formatNumber(user.linkCount)} 条链接 · 注册于{' '}
                        {formatDate(user.createdAt)}
                      </span>
                      <Button
                        type="button"
                        variant={
                          user.banned ? 'secondary' : 'secondary-destructive'
                        }
                        disabled={isSelf}
                        onClick={() => openBanDialog(user)}
                      >
                        {user.banned ? '解封' : '封禁'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <PaginationBar
              page={page}
              totalPages={usersQuery.data?.totalPages ?? 1}
              totalCount={usersQuery.data?.total ?? 0}
              perPage={PAGE_SIZE}
              onPageChange={(nextPage) =>
                void navigate({
                  to: '/admin/users',
                  search: { page: nextPage },
                })
              }
              itemLabel="个用户"
            />
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingUser(null)
            setBanReason('')
          }
        }}
        title={pendingUser?.banned ? '解封用户' : '封禁用户'}
        description={
          pendingUser
            ? pendingUser.banned
              ? `解封后 ${pendingUser.email} 可以重新登录。`
              : `封禁 ${pendingUser.email} 后会立即删除其现有会话，并阻止再次登录。`
            : undefined
        }
        confirmLabel={pendingUser?.banned ? '解封' : '封禁'}
        onConfirm={handleBanToggle}
        loading={setUserBan.isPending}
        destructive={!pendingUser?.banned}
      >
        {pendingUser && !pendingUser.banned ? (
          <Input
            label="封禁原因（可选）"
            value={banReason}
            onChange={(event) => setBanReason(event.target.value)}
            placeholder="管理员封禁"
            maxLength={500}
            className="w-full"
          />
        ) : pendingUser?.banned ? (
          <div className="flex items-start gap-2 rounded-lg bg-kumo-elevated p-3 text-sm leading-5 text-kumo-subtle">
            <ShieldWarning className="mt-0.5 size-4 shrink-0" />
            <span>
              当前封禁原因：{pendingUser.banReason || '—'}
              <br />
              解封时间：{formatDateTime(pendingUser.banExpires) || '—'}
            </span>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
