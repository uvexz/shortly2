import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '@cloudflare/kumo'
import { Bell, MagnifyingGlass, X } from '@phosphor-icons/react'
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
  const searchInput = useRef<HTMLInputElement>(null)
  const unread = unreadQuery.data ?? 0
  const title = pageTitles[location.pathname] ?? (admin ? '管理后台' : '工作台')

  // ⌘K / Ctrl+K 随时回到搜索框，对应 openwren 的键盘优先。
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return
      }
      if (admin) return
      event.preventDefault()
      searchInput.current?.focus()
      searchInput.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [admin])

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-kumo-hairline bg-kumo-base/85 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <Sidebar.Trigger />
        <span className="hidden text-kumo-placeholder sm:inline">
          {siteName}
        </span>
        <span className="hidden text-kumo-placeholder sm:inline">/</span>
        <span className="truncate text-sm font-medium text-kumo-default">
          {admin ? `管理 · ${title}` : title}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {!admin ? (
          <form
            onSubmit={handleSearch}
            className="hidden h-8 items-center gap-1.5 rounded-lg bg-kumo-tint px-2.5 transition-colors focus-within:bg-kumo-base focus-within:ring-1 focus-within:ring-kumo-brand/40 sm:flex"
          >
            <MagnifyingGlass className="size-3.5 text-kumo-placeholder" />
            <input
              ref={searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-full w-36 bg-transparent text-sm text-kumo-default outline-none placeholder:text-kumo-placeholder lg:w-52"
              placeholder={
                location.pathname === '/dashboard/inbox'
                  ? '搜索邮件…'
                  : '搜索短链接…'
              }
              aria-label={
                location.pathname === '/dashboard/inbox'
                  ? '搜索邮件'
                  : '搜索短链接'
              }
            />
            {search ? (
              <button
                type="button"
                aria-label="清除搜索"
                className="text-kumo-placeholder hover:text-kumo-strong"
                onClick={() => {
                  setSearch('')
                  searchInput.current?.focus()
                }}
              >
                <X className="size-3" />
              </button>
            ) : (
              <kbd className="app-kbd inline-flex items-center justify-center">
                ⌘K
              </kbd>
            )}
          </form>
        ) : null}

        {!admin ? (
          <Link
            to="/dashboard/inbox"
            className="app-focus relative flex size-8 items-center justify-center rounded-lg text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
            aria-label={unread > 0 ? `收件箱，${unread} 封未读` : '收件箱'}
          >
            <Bell className="size-[17px]" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 flex min-w-3 items-center justify-center rounded-full bg-kumo-brand px-1 text-[10px] font-medium leading-3 text-white">
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
