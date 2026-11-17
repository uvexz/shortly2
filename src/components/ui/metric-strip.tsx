import type { CSSProperties, ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * 指标条：一块平面装 2–4 个指标，细线分格。
 * 对应 openwren 里“信息靠排布与细线分层，而不是一张张卡片”。
 */
export function MetricStrip({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4
  className?: string
}) {
  return (
    <div
      className={cn('metric-strip', className)}
      style={{ '--metric-cols': cols } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function Metric({
  icon: IconComponent,
  label,
  value,
  meta,
  hint,
}: {
  icon?: Icon
  label: string
  value: string
  meta?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col justify-between gap-1 px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {IconComponent ? (
          <IconComponent className="size-3.5 shrink-0 text-kumo-placeholder" />
        ) : null}
        <span className="truncate text-xs leading-4 text-kumo-subtle">
          {label}
        </span>
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <strong className="numeric text-[22px] font-semibold leading-7 tracking-[-0.01em] text-kumo-strong">
          {value}
        </strong>
        {meta ? (
          <span className="truncate text-xs text-kumo-placeholder">{meta}</span>
        ) : null}
      </div>
      {hint ? (
        <p className="truncate text-xs leading-4 text-kumo-placeholder">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
