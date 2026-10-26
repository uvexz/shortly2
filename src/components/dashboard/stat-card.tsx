import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export function StatCard({
  icon: IconComponent,
  label,
  value,
  hint,
  meta,
  className,
}: {
  icon: Icon
  label: string
  value: string
  hint?: string
  meta?: string
  className?: string
}) {
  return (
    <article
      className={cn(
        'rounded-lg bg-kumo-base p-4 shadow-xs ring ring-kumo-line',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
          <IconComponent className="size-[18px]" />
        </span>
        {meta ? (
          <span className="text-xs text-kumo-placeholder">{meta}</span>
        ) : null}
      </div>
      <p className="mt-4 text-base text-kumo-subtle">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <strong className="numeric text-2xl font-semibold text-kumo-strong">
          {value}
        </strong>
        {hint ? (
          <span className="pb-0.5 text-right text-xs leading-4 text-kumo-subtle">
            {hint}
          </span>
        ) : null}
      </div>
    </article>
  )
}
