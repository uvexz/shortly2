import { cn } from '@/lib/utils'

export function LoadingBlock({
  className,
  rows = 3,
}: {
  className?: string
  rows?: number
}) {
  return (
    <div className={cn('space-y-3 p-4', className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-10 animate-pulse rounded-lg bg-neutral-100"
          style={{ width: `${100 - index * 8}%` }}
        />
      ))}
    </div>
  )
}

export function TableLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-lg bg-neutral-100"
        />
      ))}
    </div>
  )
}
