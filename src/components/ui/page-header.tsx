import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-medium text-kumo-subtle">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold text-kumo-strong">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-base text-kumo-subtle">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

export function Panel({
  children,
  className,
  as: Component = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'aside'
}) {
  return (
    <Component
      className={cn(
        'rounded-lg bg-kumo-base shadow-xs ring ring-kumo-line',
        className,
      )}
    >
      {children}
    </Component>
  )
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-kumo-hairline px-4 py-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-kumo-strong">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-kumo-subtle">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
