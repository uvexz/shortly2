import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-kumo-brand text-white hover:bg-kumo-brand-hover',
  secondary:
    'bg-kumo-base text-kumo-default ring ring-kumo-line hover:bg-kumo-tint',
  ghost: 'text-kumo-default hover:bg-kumo-tint',
}

export function ButtonLink({
  to,
  children,
  variant = 'primary',
  className,
  size = 'md',
}: {
  to: string
  children: ReactNode
  variant?: keyof typeof variants
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Link
      to={to as never}
      className={cn(
        'app-focus inline-flex items-center justify-center gap-1.5 rounded-lg font-medium',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-9 px-3 text-base',
        size === 'lg' && 'h-10 px-4 text-base',
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
