import { LinkSimple } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function Logo({
  siteName,
  compact = false,
  showTools = true,
  currentPage = false,
  className,
}: {
  siteName: string
  compact?: boolean
  showTools?: boolean
  currentPage?: boolean
  className?: string
}) {
  return (
    <Link
      to="/"
      className={cn(
        'app-focus flex min-w-0 items-center gap-2 rounded-lg',
        className,
      )}
      aria-label={`${siteName} 首页`}
      aria-current={currentPage ? 'page' : undefined}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--text-color-kumo-brand)] text-white">
        <LinkSimple className="size-[18px]" weight="bold" />
      </span>
      {compact ? null : (
        <>
          <span className="truncate text-xl font-semibold text-kumo-strong">
            {siteName}
          </span>
          {showTools ? (
            <span className="rounded-md bg-kumo-tint px-2 py-0.5 text-xs font-medium text-kumo-subtle">
              工具
            </span>
          ) : null}
        </>
      )}
    </Link>
  )
}
