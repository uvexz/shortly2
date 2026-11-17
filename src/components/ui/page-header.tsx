import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 页面标题：左侧标题 + 说明，右侧操作。
 * 与 openwren 的面板标题一致，标题紧、说明轻，不使用卡片包裹。
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium text-kumo-subtle">{eyebrow}</p>
        ) : null}
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-kumo-strong sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-kumo-subtle">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** 一块平面：1px 细线 + 白底，不再叠阴影。 */
export function Panel({
  children,
  className,
  as: Component = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'aside'
}) {
  return (
    <Component className={cn('app-surface min-w-0 overflow-hidden', className)}>
      {children}
    </Component>
  )
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-kumo-hairline px-4 py-2.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold leading-5 text-kumo-strong">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-4 text-kumo-subtle">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** 分组小标题：用于一块平面内部的分段（对应 openwren 的 xs 灰标签）。 */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 pt-3 pb-2 text-xs text-kumo-subtle',
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {action}
    </div>
  )
}

/** 安静提示：左侧 2px 细线，替代大色块横幅。 */
export function QuietNote({
  icon,
  children,
  className,
}: {
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('app-note flex items-start gap-2', className)}>
      {icon ? (
        <span className="mt-0.5 shrink-0 text-kumo-placeholder">{icon}</span>
      ) : null}
      <p className="min-w-0">{children}</p>
    </div>
  )
}
