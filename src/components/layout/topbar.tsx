import { useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '@cloudflare/kumo'
import { Bell, MagnifyingGlass } from '@phosphor-icons/react'
import { useBootstrap } from '@/lib/bootstrap'
import { useUnreadCount } from '@/hooks/mail'
import { AccountMenu } from '@/components/layout/account-menu'

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/dashboard/links': '链接管理',
  '/dashboard/analytics': '访问分析',
  '/dashboard/mailboxes': '邮箱管理',
  '/dashboard/inbox': '收件箱',
  '/dashboard/api': 'API 管理',
  '/dashboard/security': '账户安全',
  '/dashboard/settings': '个人设置',
  '/admin/links': '全站链接',
  '/admin/users': '用户管理',
  '/admin/emails': '邮件管理',
  '/admin/domains': '域名管理',
  '/admin/settings': '站点设置',
}

export function Topbar({ admin = false }: { admin?: boolean }) {
  const { siteName } = useBootstrap()
  const location = useLocation()
  const navigate = useNavigate()
  const unreadQuery = useUnreadCount()
  const [search, setSearch] = useState('')
  const unread = unreadQuery.data ?? 0
  const title = pageTitles[location.pathname] ?? (admin ? '管理后台' : '工作台')

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    const value = search.trim()
    if (!value) return
    setSearch('')
    if (location.pathname.startsWith('/admin')) {
      navigate({ to: '/admin/links', search: { q: value } as never })
      return
    }
    if (location.pathname === '/dashboard/inbox') {
      navigate({ to: '/dashboard/inbox', search: { search: value } as never })
      return
    }
    navigate({ to: '/dashboard/links', search: { q: value } as never })
  }

  return (
    <header className="sticky top-0 z-30 flex h-[58px] items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/90 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-xs text-neutral-400">
        <Sidebar.Trigger />
        <span className="hidden font-semibold text-neutral-800 sm:inline">
          {siteName}
        </span>
        <span className="hidden sm:inline">/</span>
        <span className="truncate font-medium text-neutral-600">
          {admin ? `管理 · ${title}` : title}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!admin ? (
          <form
            onSubmit={handleSearch}
            className="hidden items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 sm:flex"
          >
            <MagnifyingGlass className="size-4 text-neutral-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-40 bg-transparent text-xs outline-none placeholder:text-neutral-400 lg:w-48"
              placeholder={
                location.pathname === '/dashboard/inbox'
                  ? '搜索邮件...'
                  : '搜索短链接...'
              }
              aria-label={
                location.pathname === '/dashboard/inbox'
                  ? '搜索邮件'
                  : '搜索短链接'
              }
            />
          </form>
        ) : null}

        {!admin ? (
          <Link
            to="/dashboard/inbox"
            className="app-focus relative flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
            aria-label={unread > 0 ? `收件箱，${unread} 封未读` : '收件箱'}
          >
            <Bell className="size-[18px]" />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex min-w-3 items-center justify-center rounded-full bg-neutral-900 px-1 text-[8px] font-semibold leading-3 text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
        ) : null}

        <AccountMenu />
      </div>
    </header>
  )
}
