import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Camera,
  EnvelopeSimple,
  Fingerprint,
  IdentificationCard,
  LinkSimple,
  PaperPlaneTilt,
  Terminal,
} from '@phosphor-icons/react'
import { LandingFaq, FAQ_ITEMS } from '@/components/landing/landing-faq'
import { LandingNav } from '@/components/landing/landing-nav'
import { LandingPreview } from '@/components/landing/landing-preview'
import { Reveal } from '@/components/landing/reveal'
import { TaglineReveal } from '@/components/landing/tagline-reveal'
import { ButtonLink } from '@/components/ui/button-link'
import { CodeBlock } from '@/components/ui/code-block'
import { Logo } from '@/components/ui/logo'
import { useBootstrap } from '@/lib/bootstrap'
import type { BootstrapData } from '@/lib/server-fns'

const FEATURES = [
  {
    icon: LinkSimple,
    title: '一条链接，全程可查',
    description:
      '自定义后缀、有效期和点击上限。每次访问都会留下记录，链接也可以随时收回。',
    detail: '自定义后缀 / 有效期 / 点击上限',
  },
  {
    icon: EnvelopeSimple,
    title: '收验证码，不交出主邮箱',
    description:
      '创建一次性收件地址，接收验证码、测试邮件和附件；HTML 邮件在沙箱中渲染。',
    detail: 'HTML / 附件元数据 / 多邮箱',
  },
  {
    icon: Terminal,
    title: '脚本和客户端直接接',
    description:
      '创建 API Key 后调用 /v1 接口；ShareX 上传器和兼容别名端点都能复用。',
    detail: 'Bearer / REST / API Key',
  },
  {
    icon: Fingerprint,
    title: '登录方式由你决定',
    description:
      'GitHub、Passkey 或邮箱验证码。不启用邮箱密码，少一个泄露入口。',
    detail: 'GitHub / Passkey / OTP',
  },
] as const

const STEPS = [
  {
    title: '创建账户',
    description: <>用 GitHub、Passkey 或邮箱验证码登录。</>,
  },
  {
    title: '粘贴或新建',
    description: (
      <>
        粘贴网址，设置后缀、有效期和点击上限；
        <br />
        或新建临时邮箱。
      </>
    ),
  },
  {
    title: '分享并追踪',
    description: (
      <>
        复制短链，或把地址交给表单。
        <br />
        访问记录和邮件都在工作台。
      </>
    ),
  },
] as const

const INTEGRATIONS = [
  {
    icon: Camera,
    title: 'ShareX',
    description: '把上传器指向 /v1/shorten，截图完成时直接拿到短链。',
  },
  {
    icon: IdentificationCard,
    title: 'Bitwarden 与 Addy.io',
    description: '通过兼容别名端点，在浏览器的生成器里创建收件地址。',
  },
  {
    icon: PaperPlaneTilt,
    title: 'Telegram',
    description: '绑定机器人，新邮件到达时推送到对话。',
  },
] as const

const API_EXAMPLE = `curl -X POST "$API/v1/shorten" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "customSlug": "pricing"
  }'`

export const Route = createFileRoute('/')({
  head: ({ matches }) => {
    const rootMatch = matches.find(
      (match) => (match.routeId as string) === '__root__',
    )
    const rootData = rootMatch?.loaderData as BootstrapData | undefined
    const siteName = rootData?.siteName ?? 'Shortly'
    const title = `${siteName} — 短链接与一次性收件箱`
    const description =
      '给独立开发者的短链接与临时邮箱：自定义后缀、访问记录与 API 接入，收件不暴露主邮箱。'
    const origin = rootData?.siteUrl?.replace(/\/$/, '')
    const ogImage = origin ? `${origin}/og.png` : '/og.png'

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        {
          property: 'og:image:alt',
          content: 'Shortly 的短链接与临时邮箱工作台预览',
        },
        { property: 'og:site_name', content: siteName },
        { property: 'og:locale', content: 'zh_CN' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
        {
          name: 'twitter:image:alt',
          content: 'Shortly 的短链接与临时邮箱工作台预览',
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        },
      ],
    }
  },
  component: LandingPage,
})

function LandingPage() {
  const { siteName, user } = useBootstrap()
  const primaryHref = user ? '/dashboard' : '/register'
  const primaryLabel = user ? '进入工作台' : '免费创建账户'
  const footerAccountHref = user ? '/dashboard' : '/login'
  const footerAccountLabel = user ? '工作台' : '登录'
  const currentYear = new Date().getFullYear()

  return (
    <>
      <a
        href="#main-content"
        className="focus-ring sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-kumo-contrast focus:px-3 focus:py-2 focus:text-sm focus:text-kumo-inverse"
      >
        跳到主要内容
      </a>

      <LandingNav />

      <main id="main-content" className="bg-kumo-canvas text-kumo-default">
        <section className="mx-auto md:my-20 my-10 max-w-6xl px-4 pb-16 pt-24 sm:px-6 md:pb-24 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-kumo-base px-3 py-2 text-xs font-medium text-kumo-subtle ring-1 ring-kumo-line">
                <span className="size-1.5 rounded-full bg-[var(--text-color-kumo-brand)]" />
                短链接 · 临时邮箱 · 开放 API
              </div>

              <h1 className="mt-6 max-w-[680px] bg-gradient-to-r from-black to-[#666666] bg-clip-text text-4xl font-semibold text-balance text-transparent sm:text-5xl lg:text-6xl">
                更短的分享链接，
                <br />
                一次性的收件地址。
              </h1>

              <p className="mt-4 max-w-[680px] text-base text-kumo-subtle text-pretty sm:text-lg">
                给独立开发者的短链接与临时邮箱：
                <br className="xl:hidden" />
                自定义后缀、访问记录和 API 接入。
              </p>

              <div className="mt-8">
                <ButtonLink to={primaryHref} className="group">
                  {primaryLabel}
                  <ArrowRight className="size-4 transition-transform duration-300 ease-base group-hover:translate-x-0.5" />
                </ButtonLink>
                <p className="mt-3 text-sm text-kumo-placeholder">
                  免费使用，无需绑定信用卡。
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kumo-subtle">
                <span className="font-medium text-kumo-strong">兼容</span>
                <span>ShareX、Bitwarden、Addy.io 与 Telegram</span>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:justify-self-end">
              <LandingPreview />
            </div>
          </div>
        </section>

        <section id="problem" className="border-t border-kumo-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <Reveal>
              <p className="text-xs font-medium text-kumo-subtle">问题</p>
              <h2 className="mt-3 max-w-[680px] text-3xl font-semibold text-balance text-kumo-strong md:text-4xl">
                分享和收件，
                <br className="lg:hidden" />
                本来不该互相暴露。
              </h2>
            </Reveal>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Reveal delay={80}>
                <div className="h-full rounded-2xl bg-kumo-base p-6 ring-1 ring-kumo-line">
                  <p className="text-sm font-medium text-kumo-placeholder">
                    公开分享时
                  </p>
                  <p className="mt-3 break-all font-mono text-sm text-kumo-strong">
                    {
                      'https://shop.example.com/collections/summer-2026?utm_source=newsletter&utm_campaign=launch'
                    }
                  </p>
                  <p className="mt-4 text-base text-kumo-subtle text-pretty">
                    跟踪参数、内部路径和临时域名一起出现在对话里。
                  </p>
                </div>
              </Reveal>

              <Reveal delay={160}>
                <div className="h-full rounded-2xl bg-kumo-base p-6 ring-1 ring-kumo-line">
                  <p className="text-sm font-medium text-kumo-placeholder">
                    接收验证码时
                  </p>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-kumo-strong">
                    <li>Your verification code</li>
                    <li>Confirm your new device</li>
                    <li>Reset your password</li>
                  </ul>
                  <p className="mt-4 text-base text-kumo-subtle text-pretty">
                    主邮箱开始堆满一次性验证码和测试邮件。
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal delay={200}>
              <p className="mt-8 max-w-[680px] text-lg font-medium text-kumo-strong text-pretty">
                {siteName}{' '}
                把这两件事收进同一个工作台：链接归你管理，收件归你隔离。
              </p>
            </Reveal>
          </div>
        </section>

        <section
          id="capabilities"
          className="scroll-mt-24 border-t border-kumo-line"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <Reveal>
              <p className="text-xs font-medium text-kumo-subtle">能力</p>
              <h2 className="mt-3 max-w-[680px] text-3xl font-semibold text-balance text-kumo-strong md:text-4xl">
                分享和收件，
                <br className="lg:hidden" />
                都在一个工作台里完成。
              </h2>
              <p className="mt-3 max-w-[680px] text-base text-kumo-subtle text-pretty">
                不追求花哨的仪表盘，只把创建、复制、检查和回收做得直接可靠。
              </p>
            </Reveal>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <Reveal key={feature.title} delay={index * 80}>
                    <div className="h-full rounded-2xl bg-kumo-base p-6 shadow-xs ring-1 ring-kumo-line">
                      <Icon className="size-5 text-kumo-strong" />
                      <h3 className="mt-4 text-lg font-semibold text-kumo-strong">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-base text-kumo-subtle text-pretty">
                        {feature.description}
                      </p>
                      <p className="mt-4 font-mono text-xs text-kumo-placeholder">
                        {feature.detail}
                      </p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>

        <TaglineReveal />

        <section
          id="workflow"
          className="scroll-mt-24 border-t border-kumo-line"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <Reveal>
              <p className="text-xs font-medium text-kumo-subtle">工作流</p>
              <h2 className="mt-3 max-w-[680px] text-3xl font-semibold text-balance text-kumo-strong md:text-4xl">
                从创建到分享，
                <br className="lg:hidden" />
                只需三步。
              </h2>
            </Reveal>

            <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:gap-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 80}>
                  <div className="border-t border-kumo-line pt-4">
                    <p className="font-mono text-sm text-kumo-placeholder">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-kumo-strong">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-base text-kumo-subtle text-pretty">
                      {step.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section
          id="integrations"
          className="scroll-mt-24 border-t border-kumo-line"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-16">
              <Reveal>
                <p className="text-xs font-medium text-kumo-subtle">
                  集成与 API
                </p>
                <h2 className="mt-3 max-w-[680px] text-3xl font-semibold text-balance text-kumo-strong md:text-4xl">
                  接进你已经在用的工具。
                </h2>
                <p className="mt-3 max-w-[680px] text-base text-kumo-subtle text-pretty">
                  用现有账户配置，不需要额外部署服务。
                </p>

                <ul className="mt-6 flex flex-col gap-4">
                  {INTEGRATIONS.map((integration) => {
                    const Icon = integration.icon
                    return (
                      <li key={integration.title} className="flex gap-3">
                        <Icon className="mt-0.5 size-5 shrink-0 text-kumo-strong" />
                        <div>
                          <h3 className="text-base font-semibold text-kumo-strong">
                            {integration.title}
                          </h3>
                          <p className="mt-1 text-sm text-kumo-subtle text-pretty">
                            {integration.description}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Reveal>

              <Reveal delay={100} className="min-w-0">
                <CodeBlock title="POST /v1/shorten" code={API_EXAMPLE} />
                <p className="mt-3 text-xs text-kumo-placeholder text-pretty">
                  在 API 管理页创建 Key 后即可调用。示例使用 Bearer 认证。
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-t border-kumo-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-16">
              <Reveal>
                <p className="text-xs font-medium text-kumo-subtle">常见问题</p>
                <h2 className="mt-3 max-w-[680px] text-3xl font-semibold text-balance text-kumo-strong md:text-4xl">
                  先把顾虑说清楚。
                </h2>
                <p className="mt-3 max-w-[680px] text-base text-kumo-subtle text-pretty">
                  价格、数据保留、API 接入和登录方式，都在这里。
                </p>
              </Reveal>

              <Reveal delay={80}>
                <LandingFaq />
              </Reveal>
            </div>
          </div>
        </section>

        <section className="pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="rounded-3xl bg-kumo-contrast p-8 md:p-12">
                <p className="text-xs font-medium text-kumo-inverse/60">
                  免费开始
                </p>
                <h2 className="mt-4 max-w-[680px] text-3xl font-semibold text-balance text-kumo-inverse md:text-4xl">
                  把下一条长链接，
                  <br className="lg:hidden" />
                  交给 {siteName}。
                </h2>
                <p className="mt-3 max-w-[680px] text-base text-kumo-inverse/70 text-pretty">
                  免费使用，无需绑定信用卡。链接和邮箱都可以随时删除。
                </p>
                <div className="mt-8">
                  <ButtonLink
                    to={primaryHref}
                    variant="inverse"
                    className="group"
                  >
                    {primaryLabel}
                    <ArrowRight className="size-4 transition-transform duration-300 ease-base group-hover:translate-x-0.5" />
                  </ButtonLink>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-kumo-line">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Logo siteName={siteName} showTools={false} />
              <p className="text-sm text-kumo-subtle text-pretty">
                短链接与临时邮箱，一个账户管理。
              </p>
            </div>

            <nav
              aria-label="页脚"
              className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-kumo-subtle"
            >
              <a
                href="#capabilities"
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                能力
              </a>
              <a
                href="#integrations"
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                集成
              </a>
              <a
                href="#faq"
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                常见问题
              </a>
              <Link
                to="/legal"
                hash="privacy"
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                隐私政策
              </Link>
              <Link
                to="/legal"
                hash="terms"
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                服务条款
              </Link>
              <Link
                to={footerAccountHref}
                className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
              >
                {footerAccountLabel}
              </Link>
            </nav>
          </div>

          <p className="mt-6 text-xs text-kumo-placeholder">
            © {currentYear} {siteName}。短链接与临时邮箱服务。
          </p>
        </div>
      </footer>
    </>
  )
}
