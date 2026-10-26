import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/lib/link-ui'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-neutral-100 text-neutral-700',
}

const dotClasses: Record<StatusTone, string> = {
  neutral: 'bg-neutral-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-neutral-500',
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
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      <i className={cn('size-1.5 rounded-full', dotClasses[tone])} />
      {label}
      {children}
    </span>
  )
}
