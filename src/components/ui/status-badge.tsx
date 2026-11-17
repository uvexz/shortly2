import type { ReactNode } from 'react'
import { Badge } from '@cloudflare/kumo'
import type { BadgeVariant } from '@cloudflare/kumo'
import type { StatusTone } from '@/lib/link-ui'
import { cn } from '@/lib/utils'

const toneVariants: Record<StatusTone, BadgeVariant> = {
  neutral: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
}

const dotColors: Record<StatusTone, string> = {
  neutral: 'bg-kumo-placeholder',
  success: 'bg-kumo-success',
  warning: 'bg-kumo-warning',
  danger: 'bg-kumo-danger',
  info: 'bg-kumo-info',
}

/**
 * 状态展示。`badge` 用于需要强调的场合（管理端、详情侧栏）；
 * `dot` 是列表里更安静的一版：一个小圆点 + 灰字，不抢视线。
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  variant = 'badge',
  className,
  children,
}: {
  label: ReactNode
  tone?: StatusTone
  variant?: 'badge' | 'dot'
  className?: string
  children?: ReactNode
}) {
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-kumo-subtle',
          className,
        )}
      >
        <i
          aria-hidden
          className={cn('size-1.5 shrink-0 rounded-full', dotColors[tone])}
        />
        {label}
        {children}
      </span>
    )
  }

  return (
    <Badge variant={toneVariants[tone]} className={className}>
      {label}
      {children}
    </Badge>
  )
}
