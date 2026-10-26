import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-neutral-900 text-white shadow-sm hover:bg-neutral-700',
  secondary:
    'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
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
        'app-focus inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        size === 'sm' && 'h-9 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-xs',
        size === 'lg' && 'h-11 px-5 text-sm',
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
