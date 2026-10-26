import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const variants = {
  primary:
    'focus-ring bg-kumo-contrast text-kumo-inverse hover:bg-kumo-contrast/90',
  secondary:
    'focus-ring bg-kumo-base text-kumo-strong ring-1 ring-kumo-line hover:bg-kumo-tint',
  ghost:
    'focus-ring text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-strong',
  inverse: 'focus-ring-inverse bg-white text-kumo-contrast hover:bg-white/90',
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
  size?: 'sm' | 'md'
}) {
  return (
    <Link
      to={to as never}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition duration-300 ease-base active:scale-[0.98]',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-10 px-3 text-base',
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
