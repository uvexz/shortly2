import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { Badge, Sidebar, useSidebar } from '@cloudflare/kumo'
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
      {admin && expanded ? <Badge variant="orange">管理员</Badge> : null}
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
      className="min-h-screen bg-kumo-canvas"
      style={{ '--sidebar-width': '208px' } as React.CSSProperties}
    >
      <Sidebar className="border-kumo-line max-md:w-[280px] md:sticky md:top-0 md:h-svh md:self-start">
        <Sidebar.Header className="h-16 px-3">
          <SidebarBrand siteName={siteName} admin={admin} />
        </Sidebar.Header>

        <Sidebar.Content className="scrollbar-thin px-2">
          {groups.map((group) => (
            <Sidebar.Group key={group.label}>
              <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
              <Sidebar.Menu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item)

                  if (item.action === 'create-link') {
                    return (
                      <Sidebar.MenuButton
                        key={item.label}
                        icon={<Icon className="size-4 text-kumo-subtle" />}
                        tooltip={item.label}
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
                      icon={
                        <Icon
                          className={cn(
                            'size-4',
                            active ? 'text-kumo-strong' : 'text-kumo-subtle',
                          )}
                        />
                      }
                      active={active}
                      tooltip={item.label}
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

        <Sidebar.Footer className="h-auto flex-col items-stretch whitespace-normal border-kumo-hairline p-2">
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
