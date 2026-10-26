import type { ReactNode } from 'react'
import { Badge } from '@cloudflare/kumo'
import type { BadgeVariant } from '@cloudflare/kumo'
import type { StatusTone } from '@/lib/link-ui'

const toneVariants: Record<StatusTone, BadgeVariant> = {
  neutral: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
}

export function StatusBadge({
  label,
  tone = 'neutral',
  className,
  children,
}: {
  label: ReactNode
  tone?: StatusTone
  className?: string
  children?: ReactNode
}) {
  return (
    <Badge variant={toneVariants[tone]} className={className}>
      {label}
      {children}
    </Badge>
  )
}
