import { Link, useLocation } from '@tanstack/react-router'
import {
  EnvelopeSimple,
  GearSix,
  GlobeHemisphereWest,
  House,
  LinkSimple,
  UsersThree,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const userItems = [
  { label: '首页', to: '/dashboard', icon: House, exact: true },
  { label: '短链接', to: '/dashboard/links', icon: LinkSimple },
  { label: '邮箱', to: '/dashboard/inbox', icon: EnvelopeSimple },
  { label: '设置', to: '/dashboard/settings', icon: GearSix },
]

const adminItems = [
  { label: '链接', to: '/admin/links', icon: LinkSimple },
  { label: '用户', to: '/admin/users', icon: UsersThree },
  { label: '邮件', to: '/admin/emails', icon: EnvelopeSimple },
  { label: '域名', to: '/admin/domains', icon: GlobeHemisphereWest },
]

export function MobileNav({ admin = false }: { admin?: boolean }) {
  const location = useLocation()
  const items = admin ? adminItems : userItems

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-kumo-line bg-kumo-base/95 px-1 py-1.5 backdrop-blur md:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const active =
          'exact' in item && item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'flex min-w-16 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs',
              active
                ? 'font-medium text-kumo-brand'
                : 'text-kumo-subtle hover:text-kumo-strong',
            )}
          >
            <Icon className="size-5" weight={active ? 'fill' : 'regular'} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
