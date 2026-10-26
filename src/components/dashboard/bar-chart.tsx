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
          'flex h-52 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-400',
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
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="min-w-0 truncate font-medium text-neutral-700">
                {item.label}
              </span>
              <span className="numeric shrink-0 text-neutral-500">
                {formatNumber(item.value)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-800 transition-[width] duration-500"
                style={{ width: `${width}%` }}
              />
            </div>
            {item.sublabel ? (
              <p className="mt-1 truncate text-[9px] text-neutral-400">
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
              className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-neutral-50"
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
