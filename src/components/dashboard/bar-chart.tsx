import { Link } from '@tanstack/react-router'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

type BarItem = {
  id: string
  label: string
  sublabel?: string
  value: number
  href?: string
}

export function BarChart({
  items,
  emptyLabel = '暂无数据',
  className,
}: {
  items: BarItem[]
  emptyLabel?: string
  className?: string
}) {
  const max = Math.max(1, ...items.map((item) => item.value))

  if (!items.length) {
    return (
      <div
        className={cn(
          'flex h-52 items-center justify-center rounded-lg border border-dashed border-kumo-line text-sm text-kumo-placeholder',
          className,
        )}
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const width = Math.max(4, Math.round((item.value / max) * 100))
        const content = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-kumo-default">
                {item.label}
              </span>
              <span className="numeric shrink-0 text-kumo-subtle">
                {formatNumber(item.value)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-kumo-fill">
              <div
                className="h-full rounded-full bg-kumo-brand"
                style={{ width: `${width}%` }}
              />
            </div>
            {item.sublabel ? (
              <p className="mt-1 truncate text-xs text-kumo-placeholder">
                {item.sublabel}
              </p>
            ) : null}
          </>
        )

        if (item.href) {
          return (
            <Link
              key={item.id}
              to={item.href as never}
              className="block rounded-lg px-1 py-0.5 hover:bg-kumo-tint"
            >
              {content}
            </Link>
          )
        }

        return <div key={item.id}>{content}</div>
      })}
    </div>
  )
}
