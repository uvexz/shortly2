import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * 筛选胶囊：对应 openwren 列表顶部的 All / Unread / Flagged。
 * 只用于对已加载数据做本地筛选，选中态用品牌淡底而不是描边加粗。
 */
export function Chip({
  active = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'app-focus inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors',
        active
          ? 'border-kumo-brand/25 bg-kumo-brand/10 font-medium text-kumo-brand-hover'
          : 'border-kumo-hairline bg-kumo-base text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ChipRow({
  children,
  label,
  className,
}: {
  children: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {children}
    </div>
  )
}
