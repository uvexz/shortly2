import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * 行内搜索：默认浅底、聚焦后白底加一圈细环；
 * 传 `shortcut` 后可用 `/` 直接聚焦（openwren 的键盘优先）。
 */
export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  shortcut = false,
  className,
  children,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder: string
  label: string
  shortcut?: boolean
  className?: string
  children?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!shortcut) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      ) {
        return
      }
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  return (
    <form
      role="search"
      className={cn('flex items-center gap-2', className)}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
    >
      <label
        className={cn(
          'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-kumo-tint px-2.5',
          'transition-colors focus-within:bg-kumo-base focus-within:ring-1 focus-within:ring-kumo-brand/40',
          value ? 'bg-kumo-base ring-1 ring-kumo-hairline' : null,
        )}
      >
        <MagnifyingGlass className="size-4 shrink-0 text-kumo-placeholder" />
        <input
          ref={input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onChange('')
              event.currentTarget.blur()
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-sm text-kumo-default outline-none placeholder:text-kumo-placeholder"
        />
        {value ? (
          <button
            type="button"
            aria-label="清除搜索"
            className="shrink-0 rounded p-0.5 text-kumo-placeholder hover:text-kumo-strong"
            onClick={() => {
              onChange('')
              input.current?.focus()
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : shortcut ? (
          <kbd className="app-kbd hidden shrink-0 items-center justify-center sm:inline-flex">
            /
          </kbd>
        ) : null}
      </label>
      {children}
    </form>
  )
}
