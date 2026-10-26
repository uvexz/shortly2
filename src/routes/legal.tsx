import { Link, createFileRoute } from '@tanstack/react-router'
import { Logo } from '@/components/ui/logo'
import { useBootstrap } from '@/lib/bootstrap'

export const Route = createFileRoute('/legal')({
  head: () => ({
    meta: [
      { title: '隐私政策与服务条款 — Shortly' },
      {
        name: 'description',
        content:
          'Shortly 保存哪些数据、如何使用，以及使用服务时需要遵守的约定。',
      },
    ],
  }),
  component: LegalPage,
})

function LegalPage() {
  const { siteName } = useBootstrap()
  const currentYear = new Date().getFullYear()

  return (
    <>
      <a
        href="#main-content"
        className="focus-ring sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-kumo-contrast focus:px-3 focus:py-2 focus:text-sm focus:text-kumo-inverse"
      >
        跳到主要内容
      </a>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Logo siteName={siteName} showTools={false} />
        <Link
          to="/"
          className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-kumo-subtle transition-colors duration-300 ease-base hover:text-kumo-strong"
        >
          返回首页
        </Link>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"
      >
        <div className="max-w-[680px] py-16 md:py-24">
          <p className="text-xs font-medium text-kumo-subtle">法律信息</p>
          <h1 className="mt-3 text-4xl font-semibold text-balance text-kumo-strong sm:text-5xl">
            隐私与服务条款
          </h1>
          <p className="mt-4 text-base text-kumo-subtle text-pretty">
            最后更新：2026 年 10 月 26 日
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <nav
            aria-label="本页目录"
            className="hidden h-fit flex-col gap-2 text-sm text-kumo-subtle lg:sticky lg:top-8 lg:flex"
          >
            <a
              href="#privacy"
              className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
            >
              隐私政策
            </a>
            <a
              href="#terms"
              className="focus-ring rounded-lg transition-colors duration-300 ease-base hover:text-kumo-strong"
            >
              服务条款
            </a>
          </nav>

          <div className="flex max-w-[680px] flex-col gap-16">
            <section id="privacy" className="scroll-mt-24">
              <h2 className="text-3xl font-semibold text-balance text-kumo-strong">
                隐私政策
              </h2>
              <p className="mt-3 text-base text-kumo-subtle text-pretty">
                {siteName}{' '}
                只保存提供服务所需的数据。本页说明会保存什么、为什么保存，以及你如何删除。
              </p>

              <div className="mt-8 flex flex-col gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    保存的数据
                  </h3>
                  <ul className="mt-2 list-disc space-y-2 pl-6 text-base text-kumo-subtle text-pretty marker:text-kumo-placeholder">
                    <li>
                      账户信息：登录邮箱、显示名称、头像地址，以及 GitHub 或
                      Passkey 关联的认证信息。
                    </li>
                    <li>
                      短链接：目标网址、后缀、有效期、点击上限与访问记录。
                    </li>
                    <li>临时邮箱：地址、收到的邮件内容与附件元数据。</li>
                    <li>
                      安全数据：会话记录、API Key 前缀与加盐哈希。明文 Key
                      只在创建时显示一次。
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    使用方式
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    这些数据用于登录、短链跳转、收件、访问统计与安全审计，不用于广告，也不出售给第三方。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    保留与删除
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    短链接、临时邮箱和邮件都可以在工作台删除。临时邮箱地址会保留到手动删除。设置了有效期或点击上限的链接会按规则停止跳转。需要清理账户数据时，请联系站点管理员。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    第三方服务
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    部署可能使用 GitHub OAuth、Resend 发送验证码邮件、Turso
                    存储数据，以及反向代理转发请求。这些服务只接收完成对应功能所需的数据。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    安全
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    OAuth Token 加密存储，API Key 使用加盐哈希，临时邮件的 HTML
                    内容在沙箱 iframe 中打开。
                  </p>
                </div>
              </div>
            </section>

            <section id="terms" className="scroll-mt-24">
              <h2 className="text-3xl font-semibold text-balance text-kumo-strong">
                服务条款
              </h2>
              <p className="mt-3 text-base text-kumo-subtle text-pretty">
                使用 {siteName} 即表示你同意以下约定。
              </p>

              <div className="mt-8 flex flex-col gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    账户与访问
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    请妥善保管登录方式。{siteName} 同一时间只保留一个活跃会话。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    合理使用
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    不要用短链接分发恶意软件、钓鱼页面或垃圾信息，也不要用 API
                    绕过平台限制。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    内容责任
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    你创建的链接、临时邮箱和邮件内容由你负责。请只缩短你有权分享的地址。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    服务可用性
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    服务按现状提供，可能因维护或上游依赖中断。请不要把{' '}
                    {siteName} 作为唯一的数据备份。
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-kumo-strong">
                    终止与变更
                  </h3>
                  <p className="mt-2 text-base text-kumo-subtle text-pretty">
                    违反规则时，管理员可以停用账户或删除内容。你也可以随时删除自己的链接和邮箱。条款更新时，本页会同步修改日期。
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t border-kumo-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-kumo-placeholder sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {currentYear} {siteName}。短链接与临时邮箱服务。
          </p>
          <Link
            to="/"
            className="focus-ring rounded-lg text-kumo-subtle transition-colors duration-300 ease-base hover:text-kumo-strong"
          >
            返回首页
          </Link>
        </div>
      </footer>
    </>
  )
}
