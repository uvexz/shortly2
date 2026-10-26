import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { Sidebar, useSidebar } from '@cloudflare/kumo'
import {
  ArrowLeft,
  ChartLineUp,
  EnvelopeSimple,
  GearSix,
  GlobeHemisphereWest,
  Key,
  LinkSimple,
  Plus,
  ShieldCheck,
  SquaresFour,
  Tray,
  UsersThree,
} from '@phosphor-icons/react'
import { useLocation } from '@tanstack/react-router'
import { useBootstrap } from '@/lib/bootstrap'
import { useUnreadCount } from '@/hooks/mail'
import { cn } from '@/lib/utils'
import { useQuickActions } from '@/components/dashboard/quick-actions'
import { AccountMenu } from '@/components/layout/account-menu'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Topbar } from '@/components/layout/topbar'
import { Logo } from '@/components/ui/logo'

type NavItem = {
  label: string
  to?: string
  icon: Icon
  exact?: boolean
  action?: 'create-link'
  badge?: number
}

type NavGroup = {
  label: string
  items: NavItem[]
}

function SidebarBrand({
  siteName,
  admin,
}: {
  siteName: string
  admin: boolean
}) {
  const { state } = useSidebar()
  const expanded = state === 'expanded'

  return (
    <div
      className={cn(
        'flex h-full items-center gap-2',
        expanded ? 'justify-between' : 'justify-center',
      )}
    >
      <Logo siteName={siteName} compact={!expanded} showTools={!admin} />
      {admin && expanded ? (
        <span className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white">
          ADMIN
        </span>
      ) : null}
    </div>
  )
}

export function AppShell({
  children,
  admin = false,
}: {
  children: ReactNode
  admin?: boolean
}) {
  const { siteName, user } = useBootstrap()
  const location = useLocation()
  const { openCreateLink } = useQuickActions()
  const unreadQuery = useUnreadCount()
  const unread = unreadQuery.data ?? 0

  const isAdmin = user?.role === 'admin'

  const userGroups: NavGroup[] = [
    {
      label: '工作台',
      items: [
        {
          label: '仪表盘',
          to: '/dashboard',
          icon: SquaresFour,
          exact: true,
        },
      ],
    },
    {
      label: '短链接',
      items: [
        { label: '链接管理', to: '/dashboard/links', icon: LinkSimple },
        { label: '创建短链接', icon: Plus, action: 'create-link' },
        { label: '访问分析', to: '/dashboard/analytics', icon: ChartLineUp },
      ],
    },
    {
      label: '临时邮箱',
      items: [
        { label: '邮箱管理', to: '/dashboard/mailboxes', icon: EnvelopeSimple },
        {
          label: '收件箱',
          to: '/dashboard/inbox',
          icon: Tray,
          badge: unread,
        },
      ],
    },
    {
      label: '账户',
      items: [
        { label: 'API 管理', to: '/dashboard/api', icon: Key },
        { label: '账户安全', to: '/dashboard/security', icon: ShieldCheck },
        { label: '个人设置', to: '/dashboard/settings', icon: GearSix },
      ],
    },
  ]

  if (isAdmin) {
    userGroups.push({
      label: '管理',
      items: [{ label: '管理后台', to: '/admin/links', icon: ShieldCheck }],
    })
  }

  const adminGroups: NavGroup[] = [
    {
      label: '管理',
      items: [
        { label: '全站链接', to: '/admin/links', icon: LinkSimple },
        { label: '用户管理', to: '/admin/users', icon: UsersThree },
        { label: '邮件管理', to: '/admin/emails', icon: EnvelopeSimple },
        { label: '域名管理', to: '/admin/domains', icon: GlobeHemisphereWest },
        { label: '站点设置', to: '/admin/settings', icon: GearSix },
      ],
    },
    {
      label: '导航',
      items: [{ label: '返回工作台', to: '/dashboard', icon: ArrowLeft }],
    },
  ]

  const groups = admin ? adminGroups : userGroups

  function isActive(item: NavItem) {
    if (!item.to) return false
    if (item.exact) return location.pathname === item.to
    return (
      location.pathname === item.to ||
      location.pathname.startsWith(`${item.to}/`)
    )
  }

  return (
    <Sidebar.Provider
      defaultOpen
      mobileBreakpoint={768}
      className="min-h-screen bg-[#f7f7f6]"
      style={{ '--sidebar-width': '208px' } as React.CSSProperties}
    >
      <Sidebar className="border-neutral-200/80 max-md:w-[280px]">
        <Sidebar.Header className="h-[72px] px-3">
          <SidebarBrand siteName={siteName} admin={admin} />
        </Sidebar.Header>

        <Sidebar.Content className="scrollbar-thin px-2">
          {groups.map((group) => (
            <Sidebar.Group key={group.label}>
              <Sidebar.GroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {group.label}
              </Sidebar.GroupLabel>
              <Sidebar.Menu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item)
                  const className = cn(
                    'h-9 rounded-lg px-2.5 text-[13px]',
                    active
                      ? 'bg-[#e9e9e7] font-semibold text-neutral-900'
                      : 'text-neutral-600',
                  )

                  if (item.action === 'create-link') {
                    return (
                      <Sidebar.MenuButton
                        key={item.label}
                        icon={<Icon className="size-[17px] shrink-0" />}
                        tooltip={item.label}
                        className={className}
                        onClick={openCreateLink}
                      >
                        {item.label}
                      </Sidebar.MenuButton>
                    )
                  }

                  return (
                    <Sidebar.MenuButton
                      key={item.label}
                      href={item.to}
                      icon={<Icon className="size-[17px] shrink-0" />}
                      active={active}
                      tooltip={item.label}
                      className={className}
                    >
                      {item.label}
                      {item.badge && item.badge > 0 ? (
                        <Sidebar.MenuBadge>
                          {item.badge > 99 ? '99+' : item.badge}
                        </Sidebar.MenuBadge>
                      ) : null}
                    </Sidebar.MenuButton>
                  )
                })}
              </Sidebar.Menu>
            </Sidebar.Group>
          ))}
        </Sidebar.Content>

        <Sidebar.Footer className="h-auto flex-col items-stretch whitespace-normal border-neutral-100 p-2">
          <div className="group-data-[state=collapsed]/sidebar-wrapper:hidden">
            <div className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
                {admin ? (
                  <ShieldCheck className="size-4" weight="bold" />
                ) : (
                  <LinkSimple className="size-4" weight="bold" />
                )}
              </div>
              <p className="mt-3 text-xs font-semibold text-neutral-800">
                {admin ? '管理员控制台' : '简单、快速、可靠'}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-neutral-500">
                {admin
                  ? '管理全站链接、用户、域名与站点设置。'
                  : '短链接与临时邮箱，一站式管理你的网络工具。'}
              </p>
            </div>
          </div>
          <AccountMenu variant="panel" />
        </Sidebar.Footer>
      </Sidebar>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Topbar admin={admin} />
        <div className="flex-1 px-4 py-6 md:px-8 md:py-7">{children}</div>
      </div>

      <MobileNav admin={admin} />
    </Sidebar.Provider>
  )
}
