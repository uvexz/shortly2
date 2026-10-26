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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-kumo-line text-sm text-kumo-placeholder">
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
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-tint text-kumo-brand">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-kumo-default">
                {item.title}
              </span>
              <span className="mt-1 block truncate text-xs text-kumo-subtle">
                {item.subtitle}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs text-kumo-placeholder">
              {formatRelativeTime(item.time)}
            </span>
          </>
        )

        if (item.href) {
          return (
            <Link
              key={item.id}
              to={item.href as never}
              className="flex gap-3 rounded-lg hover:bg-kumo-tint"
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
