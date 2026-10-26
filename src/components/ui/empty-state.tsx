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
      <div className="flex size-12 items-center justify-center rounded-lg bg-kumo-tint text-kumo-subtle">
        {icon ?? <span className="text-lg">⌘</span>}
      </div>
      <p className="mt-3 text-base font-medium text-kumo-default">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-kumo-subtle">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
