import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckCircle, ShieldCheck } from '@phosphor-icons/react'
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
    <main className="min-h-dvh bg-kumo-canvas">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <section className="hidden border-r border-kumo-hairline bg-kumo-base p-10 lg:flex lg:flex-col lg:justify-between">
          <Logo siteName={siteName} />

          <div className="max-w-md">
            <p className="text-xs font-medium text-kumo-subtle">
              {isLogin ? '账户访问' : '新账户设置'}
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.02em] text-kumo-strong">
              {isLogin ? '欢迎回来。' : '开始管理你的网络工具。'}
            </h2>
            <p className="mt-4 text-base leading-7 text-kumo-subtle">
              {isLogin
                ? '继续进入你的工作台，查看短链接、临时邮箱与 API 使用情况。'
                : '创建账户后，你可以生成短链接、接收临时邮件，并使用 API 自动化日常操作。'}
            </p>
            <ul className="mt-8 space-y-3 border-t border-kumo-hairline pt-6">
              {benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-sm leading-5 text-kumo-subtle"
                >
                  <CheckCircle className="mt-0.5 size-4 shrink-0 text-kumo-placeholder" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-center gap-2 text-xs text-kumo-placeholder">
            <ShieldCheck className="size-3.5" />
            会话由 Better Auth 保护；临时邮箱请勿用于敏感信息。
          </p>
        </section>

        <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          <div className="mb-8 flex items-center justify-between lg:hidden">
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
                <h1 className="text-2xl font-semibold tracking-[-0.01em] text-kumo-strong">
                  {isLogin ? `登录 ${siteName}` : `注册 ${siteName}`}
                </h1>
                <p className="text-base leading-6 text-kumo-subtle">
                  {isLogin
                    ? '选择一种可用的登录方式继续。'
                    : '使用邮箱验证码创建账户，可选择保存 Passkey。'}
                </p>
              </div>

              <div className="app-surface p-4 sm:p-5">{children}</div>

              <div className="mt-6 flex items-center justify-center gap-3 text-sm text-kumo-subtle">
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
