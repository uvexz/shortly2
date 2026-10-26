import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { AccountMenu } from '@/components/layout/account-menu'
import { ButtonLink } from '@/components/ui/button-link'
import { Logo } from '@/components/ui/logo'
import { useBootstrap } from '@/lib/bootstrap'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#capabilities', label: '能力' },
  { href: '#workflow', label: '工作流' },
  { href: '#integrations', label: '集成' },
  { href: '#faq', label: '常见问题' },
] as const

export function LandingNav() {
  const { siteName, user } = useBootstrap()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const backgroundNodes = [
      document.querySelector('#main-content'),
      document.querySelector('body > footer'),
    ].filter((node): node is HTMLElement => node !== null)
    backgroundNodes.forEach((node) => node.setAttribute('inert', ''))

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      backgroundNodes.forEach((node) => node.removeAttribute('inert'))
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const handleChange = () => {
      if (media.matches) setOpen(false)
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 rounded-2xl bg-kumo-base/80 p-2 shadow-sm ring-1 ring-kumo-line backdrop-blur-xl">
          <Logo siteName={siteName} showTools={false} currentPage />

          <nav
            aria-label="主导航"
            className="hidden items-center gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="focus-ring rounded-lg px-2 py-2 text-sm text-kumo-subtle transition-colors duration-300 ease-base hover:bg-kumo-tint hover:text-kumo-strong"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-1 md:flex">
            {user ? (
              <>
                <ButtonLink to="/dashboard" size="sm">
                  工作台
                </ButtonLink>
                <AccountMenu />
              </>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm">
                  登录
                </ButtonLink>
                <ButtonLink to="/register" size="sm">
                  免费开始
                </ButtonLink>
              </>
            )}
          </div>

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? '关闭菜单' : '打开菜单'}
            className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-lg text-kumo-strong transition-colors duration-300 ease-base hover:bg-kumo-tint active:scale-[0.98] md:hidden"
          >
            <span
              aria-hidden="true"
              className="flex h-3 w-4 flex-col justify-between"
            >
              <span
                className={cn(
                  'h-0.5 w-full rounded-full bg-current transition-transform duration-500 ease-base',
                  open && 'translate-y-[5px] rotate-45',
                )}
              />
              <span
                className={cn(
                  'h-0.5 w-full rounded-full bg-current transition-transform duration-500 ease-base',
                  open && '-translate-y-[5px] -rotate-45',
                )}
              />
            </span>
          </button>
        </div>
      </header>

      <div
        id="landing-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="站点导航"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'fixed inset-0 z-40 bg-kumo-canvas/95 backdrop-blur-2xl transition-opacity duration-500 ease-base md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="flex min-h-full flex-col px-4 pb-8 pt-24">
          <nav aria-label="移动端导航" className="flex flex-col">
            {NAV_LINKS.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                style={{
                  transitionDelay: open
                    ? `${Math.min(index * 60, 360)}ms`
                    : '0ms',
                }}
                className={cn(
                  'focus-ring flex items-center justify-between rounded-lg py-4 text-2xl font-semibold text-kumo-strong transition duration-500 ease-base',
                  open
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-6 opacity-0',
                )}
              >
                {link.label}
                <ArrowUpRight className="size-5 text-kumo-placeholder" />
              </a>
            ))}
          </nav>

          <div
            style={{ transitionDelay: open ? '300ms' : '0ms' }}
            className={cn(
              'mt-8 flex flex-col gap-2 transition duration-500 ease-base',
              open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
            )}
          >
            {user ? (
              <ButtonLink to="/dashboard" className="w-full">
                进入工作台
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/register" className="w-full">
                  免费创建账户
                </ButtonLink>
                <Link
                  to="/login"
                  className="focus-ring flex h-10 items-center justify-center rounded-lg text-sm font-medium text-kumo-subtle transition-colors duration-300 ease-base hover:text-kumo-strong"
                >
                  已有账户，登录
                </Link>
              </>
            )}
          </div>

          <p
            style={{ transitionDelay: open ? '360ms' : '0ms' }}
            className={cn(
              'mt-auto pt-8 text-xs text-kumo-placeholder transition duration-500 ease-base',
              open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
            )}
          >
            短链接 · 临时邮箱 · 开放 API
          </p>
        </div>
      </div>
    </>
  )
}
