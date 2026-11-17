import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 空态：不安图标底座、不加大块留白，一句标题 + 一句说明 + 一个主操作。
 * 与 openwren 的 “This folder is empty.” 同一语气。
 */
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
      {icon ? (
        <span className="text-kumo-placeholder [&>svg]:size-7">{icon}</span>
      ) : null}
      <p
        className={cn(
          'text-sm font-medium text-kumo-strong',
          icon ? 'mt-2.5' : null,
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm leading-5 text-kumo-subtle">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
