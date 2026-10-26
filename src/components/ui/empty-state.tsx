import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
        {icon ?? <span className="text-lg">⌘</span>}
      </div>
      <p className="mt-3 text-sm font-medium text-neutral-800">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-5 text-neutral-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
