import { DropdownMenu } from '@cloudflare/kumo'
import {
  DotsThree,
  Key,
  ShieldCheck,
  SignOut,
  SquaresFour,
  UserGear,
} from '@phosphor-icons/react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { useBootstrap } from '@/lib/bootstrap'
import { toastSuccess } from '@/lib/toast'
import { UserAvatar } from '@/components/ui/user-avatar'
import { cn } from '@/lib/utils'

export function AccountMenu({
  variant = 'icon',
  className,
}: {
  variant?: 'icon' | 'panel'
  className?: string
}) {
  const { user } = useBootstrap()
  const navigate = useNavigate()
  const router = useRouter()

  if (!user) return null

  async function handleSignOut() {
    await authClient.signOut()
    await router.invalidate()
    toastSuccess({ title: '已退出登录' })
    await navigate({ to: '/' })
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          variant === 'icon' ? (
            <button
              type="button"
              className={cn(
                'app-focus flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-neutral-100',
                className,
              )}
              aria-label="打开用户菜单"
            >
              <UserAvatar name={user.name} image={user.image} size="sm" />
              <span className="hidden max-w-28 truncate text-xs font-medium text-neutral-700 sm:block">
                {user.name}
              </span>
              <span className="hidden text-neutral-400 sm:block">···</span>
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                'app-focus flex w-full items-center gap-2 rounded-xl p-2 text-left transition-colors hover:bg-neutral-50',
                className,
              )}
              aria-label="打开用户菜单"
            >
              <UserAvatar name={user.name} image={user.image} size="md" />
              <span className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar-wrapper:hidden">
                <span className="block truncate text-xs font-semibold text-neutral-800">
                  {user.name}
                </span>
                <span className="block truncate text-[10px] text-neutral-400">
                  {user.email}
                </span>
              </span>
              <DotsThree className="size-4 shrink-0 text-neutral-400 group-data-[state=collapsed]/sidebar-wrapper:hidden" />
            </button>
          )
        }
      />
      <DropdownMenu.Content
        align={variant === 'icon' ? 'end' : 'start'}
        className="w-60"
      >
        <div className="px-2 py-2">
          <p className="truncate text-xs font-semibold text-neutral-900">
            {user.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-neutral-500">
            {user.email}
          </p>
          <span className="mt-2 inline-flex rounded-md bg-neutral-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">
            {user.role === 'admin' ? '管理员' : '用户'}
          </span>
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.LinkItem href="/dashboard" icon={<SquaresFour />}>
          工作台
        </DropdownMenu.LinkItem>
        <DropdownMenu.LinkItem href="/dashboard/api" icon={<Key />}>
          API 管理
        </DropdownMenu.LinkItem>
        <DropdownMenu.LinkItem
          href="/dashboard/security"
          icon={<ShieldCheck />}
        >
          账户安全
        </DropdownMenu.LinkItem>
        <DropdownMenu.LinkItem href="/dashboard/settings" icon={<UserGear />}>
          个人设置
        </DropdownMenu.LinkItem>
        {user.role === 'admin' ? (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.LinkItem href="/admin/links" icon={<ShieldCheck />}>
              管理后台
            </DropdownMenu.LinkItem>
          </>
        ) : null}
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          variant="danger"
          icon={<SignOut />}
          onClick={handleSignOut}
        >
          退出登录
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
