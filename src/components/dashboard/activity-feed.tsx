import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { formatRelativeTime } from '@/lib/format'

export type ActivityItem = {
  id: string
  icon: Icon
  title: string
  subtitle: string
  time: string | Date
  href?: string
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-400">
        暂无动态
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const Icon = item.icon
        const content = (
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-neutral-800">
                {item.title}
              </span>
              <span className="mt-1 block truncate text-[11px] text-neutral-500">
                {item.subtitle}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[10px] text-neutral-400">
              {formatRelativeTime(item.time)}
            </span>
          </>
        )

        if (item.href) {
          return (
            <Link
              key={item.id}
              to={item.href as never}
              className="flex gap-3 rounded-lg transition-colors hover:bg-neutral-50"
            >
              {content}
            </Link>
          )
        }

        return (
          <div key={item.id} className="flex gap-3">
            {content}
          </div>
        )
      })}
    </div>
  )
}
