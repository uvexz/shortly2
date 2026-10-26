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
        'rounded-xl border border-neutral-200/80 bg-white p-4 app-shadow',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
          <IconComponent className="size-[18px]" />
        </span>
        {meta ? (
          <span className="text-[10px] text-neutral-400">{meta}</span>
        ) : null}
      </div>
      <p className="mt-4 text-xs text-neutral-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <strong className="numeric text-2xl font-semibold tracking-tight text-neutral-900">
          {value}
        </strong>
        {hint ? (
          <span className="pb-0.5 text-right text-[10px] leading-4 text-neutral-500">
            {hint}
          </span>
        ) : null}
      </div>
    </article>
  )
}
