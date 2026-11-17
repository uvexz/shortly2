import { cn } from '@/lib/utils'

export function LoadingBlock({
  className,
  rows = 3,
}: {
  className?: string
  rows?: number
}) {
  return (
    <div className={cn('px-4 py-3', className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-9 animate-pulse rounded bg-kumo-tint"
          style={{
            width: `${100 - index * 8}%`,
            marginTop: index === 0 ? 0 : 12,
          }}
        />
      ))}
    </div>
  )
}

/** 表格骨架：与真实行同高、同节奏，避免加载完成后页面跳动。 */
export function TableLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-kumo-hairline" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="size-7 shrink-0 animate-pulse rounded-full bg-kumo-tint" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-kumo-tint"
              style={{ width: `${30 + ((index * 7) % 20)}%` }}
            />
            <div
              className="h-3 animate-pulse rounded bg-kumo-tint"
              style={{ width: `${55 + ((index * 11) % 25)}%` }}
            />
          </div>
          <div className="hidden h-3 w-16 animate-pulse rounded bg-kumo-tint sm:block" />
        </div>
      ))}
    </div>
  )
}
