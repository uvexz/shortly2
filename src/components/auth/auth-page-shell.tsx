import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckCircle, LinkSimple, ShieldCheck } from '@phosphor-icons/react'
import { Logo } from '@/components/ui/logo'

export function AuthPageShell({
  siteName,
  mode,
  children,
}: {
  siteName: string
  mode: 'login' | 'register'
  children: ReactNode
}) {
  const isLogin = mode === 'login'
  const benefits = isLogin
    ? [
        '邮箱验证码 / GitHub / Passkey 登录',
        '登录后管理短链接与临时邮箱',
        '现有 API 与数据完全保留',
      ]
    : [
        '注册后可保存 Passkey，下次一键登录',
        '创建可管理的短链接与访问日志',
        '生成临时邮箱，隔离主邮箱',
      ]

  return (
    <main className="min-h-screen bg-kumo-canvas">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <section className="relative hidden overflow-hidden bg-kumo-contrast p-10 text-kumo-inverse lg:flex lg:flex-col lg:justify-between">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="relative">
            <Link
              to="/"
              className="app-focus inline-flex items-center gap-2 rounded-lg"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--text-color-kumo-brand)] text-white">
                <LinkSimple className="size-[18px]" weight="bold" />
              </span>
              <span className="text-xl font-semibold text-kumo-inverse">
                {siteName}
              </span>
              <span className="rounded-md bg-kumo-inverse/10 px-1.5 py-0.5 text-xs text-kumo-inverse/70">
                工具
              </span>
            </Link>
          </div>

          <div className="relative max-w-md">
            <p className="text-xs font-medium text-kumo-inverse/60">
              {isLogin ? '账户访问' : '新账户设置'}
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-kumo-inverse">
              {isLogin ? '欢迎回来。' : '开始管理你的网络工具。'}
            </h2>
            <p className="mt-4 text-base leading-7 text-kumo-inverse/70">
              {isLogin
                ? '继续进入你的工作台，查看短链接、临时邮箱与 API 使用情况。'
                : '创建账户后，你可以生成短链接、接收临时邮件，并使用 API 自动化日常操作。'}
            </p>
            <ul className="mt-8 space-y-3">
              {benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-sm leading-5 text-kumo-inverse/70"
                >
                  <CheckCircle className="mt-0.5 size-4 shrink-0 text-kumo-inverse/50" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative flex items-center gap-2 text-xs text-kumo-inverse/50">
            <ShieldCheck className="size-3.5" />
            会话由 Better Auth 保护；临时邮箱请勿用于敏感信息。
          </p>
        </section>

        <section className="flex min-h-screen flex-col px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Logo siteName={siteName} />
            <Link to="/" className="text-sm text-kumo-subtle">
              返回首页
            </Link>
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-7 space-y-2">
                <p className="text-sm font-medium text-kumo-subtle">
                  {isLogin ? '账户访问' : '创建账户'}
                </p>
                <h1 className="text-2xl font-semibold text-kumo-strong">
                  {isLogin ? '登录 Shortly' : '注册 Shortly'}
                </h1>
                <p className="text-base leading-6 text-kumo-subtle">
                  {isLogin
                    ? '选择一种可用的登录方式继续。'
                    : '使用邮箱验证码创建账户，可选择保存 Passkey。'}
                </p>
              </div>

              {children}

              <div className="mt-8 flex items-center justify-center gap-3 text-sm text-kumo-subtle">
                <Link to="/" className="hover:text-kumo-strong">
                  返回首页
                </Link>
                <span className="size-1 rounded-full bg-kumo-inactive" />
                <Link
                  to={isLogin ? '/register' : '/login'}
                  className="hover:text-kumo-strong"
                >
                  {isLogin ? '创建账户' : '已有账户'}
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs leading-4 text-kumo-placeholder">
            登录即表示你同意合理使用本服务。临时邮箱不适合接收重要账户或敏感信息。
          </p>
        </section>
      </div>
    </main>
  )
}
