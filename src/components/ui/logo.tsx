import { LinkSimple } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function Logo({
  siteName,
  compact = false,
  showTools = true,
  className,
}: {
  siteName: string
  compact?: boolean
  showTools?: boolean
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
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
        <LinkSimple className="size-[18px]" weight="bold" />
      </span>
      {compact ? null : (
        <>
          <span className="truncate text-xl font-bold tracking-tight text-neutral-900">
            {siteName}
          </span>
          {showTools ? (
            <span className="text-[10px] font-medium tracking-[0.12em] text-neutral-400">
              TOOLS
            </span>
          ) : null}
        </>
      )}
    </Link>
  )
}
