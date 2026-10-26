import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  CheckCircle,
  Code,
  EnvelopeSimple,
  Key,
  LinkSimple,
  ShieldCheck,
} from '@phosphor-icons/react'
import { useBootstrap } from '@/lib/bootstrap'
import { AccountMenu } from '@/components/layout/account-menu'
import { LandingPreview } from '@/components/landing/landing-preview'
import { ButtonLink } from '@/components/ui/button-link'
import { Logo } from '@/components/ui/logo'
import { CodeBlock } from '@/components/ui/code-block'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const { siteName, user } = useBootstrap()
  const primaryHref = user ? '/dashboard' : '/register'
  const secondaryHref = user ? '/dashboard/inbox' : '/login'
  const primaryLabel = user ? '进入工作台' : '创建账户'
  const secondaryLabel = user ? '临时邮箱' : '登录'

  const features = [
    {
      icon: LinkSimple,
      title: '短链接管理',
      description:
        '自定义后缀、有效期和点击上限；复制、查看访问日志，随时回收链接。',
      href: user ? '/dashboard/links' : '/register',
      action: '管理短链接',
    },
    {
      icon: EnvelopeSimple,
      title: '临时邮箱',
      description:
        '创建一次性收件地址，隔离主邮箱；支持 HTML 邮件、附件元数据与多邮箱筛选。',
      href: user ? '/dashboard/inbox' : '/register',
      action: '查看收件箱',
    },
    {
      icon: Code,
      title: 'API 与自动化',
      description:
        '使用 API Key 接入 /v1 接口，支持 ShareX、Bitwarden/Addy.io 别名和 Telegram 通知。',
      href: user ? '/dashboard/api' : '/register',
      action: '查看 API',
    },
  ]

  return (
    <main className="min-h-screen bg-[#f7f7f6] text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#f7f7f6]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo siteName={siteName} />
          <nav className="hidden items-center gap-6 text-xs text-neutral-500 md:flex">
            <a
              href="#features"
              className="transition-colors hover:text-neutral-900"
            >
              功能
            </a>
            <a href="#api" className="transition-colors hover:text-neutral-900">
              API
            </a>
            <a
              href="#security"
              className="transition-colors hover:text-neutral-900"
            >
              安全
            </a>
          </nav>
          <div className="flex items-center gap-2">
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
                  注册
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #d4d4d4 1px, transparent 0)',
            backgroundSize: '24px 24px',
            maskImage: 'linear-gradient(to bottom, black, transparent 75%)',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:gap-16 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-medium text-neutral-500">
              <span className="size-1.5 rounded-full bg-neutral-900" />
              短链接 / 临时邮箱 / API
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              更短的分享链接，
              <br />
              一次性的收件地址。
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-500 sm:text-base">
              需要公开分享时，生成可管理、带访问记录的短链接；需要接收验证码或测试邮件时，用临时邮箱隔离你的主邮箱。所有能力集中在一个安静、可控的工作台里。
            </p>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <ButtonLink to={primaryHref} size="lg">
                {primaryLabel}
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink to={secondaryHref} variant="secondary" size="lg">
                {secondaryLabel}
              </ButtonLink>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="size-3.5" />
                GitHub OAuth · Passkey · 邮箱验证码
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="size-3.5" />
                API Key 自动化
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="size-3.5" />
                现有数据与接口保持兼容
              </span>
            </div>
          </div>

          <LandingPreview />
        </div>
      </section>

      <section
        id="features"
        className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
              核心能力
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              一个工作台，覆盖日常分享与收件。
            </h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-neutral-500">
            不追求花哨的仪表盘，只把创建、复制、检查、回收这些动作做得直接可靠。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Link
                key={feature.title}
                to={feature.href as never}
                className="group rounded-xl border border-neutral-200 bg-white p-5 app-shadow transition-colors hover:border-neutral-400"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-neutral-500">
                  {feature.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-700">
                  {feature.action}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section
        id="api"
        className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-neutral-200 bg-white p-5 app-shadow sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
              <Key className="size-5" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              用 API 把短链接接进你的工作流。
            </h2>
            <p className="mt-3 text-xs leading-6 text-neutral-500">
              创建 API Key 后，可调用 /v1/shorten、/v1/emails 等接口。支持
              Bearer 头、ShareX 自定义上传器和 Addy.io 兼容别名。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink
                to={user ? '/dashboard/api' : '/register'}
                variant="primary"
                size="md"
              >
                管理 API Key
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="md">
                已有账户
              </ButtonLink>
            </div>
          </div>
          <CodeBlock
            title="POST /v1/shorten"
            code={`curl -X POST 'https://your-domain.com/v1/shorten' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page",
    "customSlug": "my-link"
  }'`}
          />
        </div>
      </section>

      <section
        id="security"
        className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: '会话安全',
              description:
                'Better Auth 会话、OAuth Token 加密存储，管理端可即时封禁账户。',
            },
            {
              icon: Key,
              title: '密钥只存哈希',
              description:
                'API Key 只在创建时展示一次，数据库仅保存前缀与加盐哈希。',
            },
            {
              icon: EnvelopeSimple,
              title: '隔离收件',
              description:
                '临时邮箱与主邮箱分离；HTML 邮件在沙箱 iframe 中渲染。',
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="rounded-xl border border-neutral-200 bg-white p-5 app-shadow"
              >
                <Icon className="size-5 text-neutral-700" />
                <h3 className="mt-3 text-sm font-semibold text-neutral-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-neutral-900 p-6 text-white sm:p-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                {siteName}
              </p>
              <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                从一条短链接开始，整理你的网络工具。
              </h2>
              <p className="mt-2 max-w-lg text-xs leading-6 text-neutral-400">
                登录后即可创建、管理和追踪短链接与临时邮箱。现有 API
                与数据保持不变。
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <ButtonLink
                to={primaryHref}
                size="lg"
                className="bg-white text-neutral-900 hover:bg-neutral-100"
              >
                {primaryLabel}
              </ButtonLink>
              <ButtonLink
                to={secondaryHref}
                size="lg"
                variant="ghost"
                className="border border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                {secondaryLabel}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{siteName} 提供短链接与临时邮箱服务。</p>
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="transition-colors hover:text-neutral-900"
            >
              功能
            </a>
            <a href="#api" className="transition-colors hover:text-neutral-900">
              API
            </a>
            <Link
              to={user ? '/dashboard' : '/login'}
              className="transition-colors hover:text-neutral-900"
            >
              {user ? '工作台' : '登录'}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
