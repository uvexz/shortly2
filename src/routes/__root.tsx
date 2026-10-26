import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { LinkProvider, Toasty, TooltipProvider } from '@cloudflare/kumo'
import type { QueryClient } from '@tanstack/react-query'

import appCss from '../styles.css?url'
import { AppLink } from '@/components/layout/app-link'
import { BootstrapProvider } from '@/lib/bootstrap'
import { getBootstrap } from '@/lib/server-fns'
import { appToastManager } from '@/lib/toast'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  staleTime: 15_000,
  loader: () => getBootstrap(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#fbfbfb' },
      {
        title: loaderData?.siteName
          ? `${loaderData.siteName} — 短链接与临时邮箱`
          : 'Shortly — 短链接与临时邮箱',
      },
      {
        name: 'description',
        content: '安静、可控的短链接与临时邮箱工具。',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
  errorComponent: RootError,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const bootstrap = Route.useLoaderData()

  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        <BootstrapProvider value={bootstrap}>
          <LinkProvider component={AppLink}>
            <TooltipProvider>
              <Toasty toastManager={appToastManager}>{children}</Toasty>
            </TooltipProvider>
          </LinkProvider>
        </BootstrapProvider>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-kumo-canvas px-6">
      <div className="w-full max-w-md rounded-xl bg-kumo-base p-8 text-center shadow-xs ring ring-kumo-line">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-kumo-tint text-lg font-semibold text-kumo-subtle">
          404
        </div>
        <h1 className="mt-5 text-xl font-semibold text-kumo-strong">
          页面不存在
        </h1>
        <p className="mt-2 text-base leading-6 text-kumo-subtle">
          这个地址可能已被移除，或者短链接不存在。
        </p>
        <Link
          to="/"
          className="app-focus mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-kumo-brand px-4 text-base font-medium text-white hover:bg-kumo-brand-hover"
        >
          返回首页
        </Link>
      </div>
    </main>
  )
}

function RootError({ error, reset }: { error: unknown; reset: () => void }) {
  const message =
    error instanceof Error ? error.message : '发生了未知错误，请稍后重试。'
  return (
    <main className="flex min-h-screen items-center justify-center bg-kumo-canvas px-6">
      <div className="w-full max-w-md rounded-xl bg-kumo-base p-8 text-center shadow-xs ring ring-kumo-line">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-kumo-danger-tint text-lg font-semibold text-kumo-danger">
          !
        </div>
        <h1 className="mt-5 text-xl font-semibold text-kumo-strong">
          页面加载失败
        </h1>
        <p className="mt-2 break-words text-base leading-6 text-kumo-subtle">
          {message}
        </p>
        <button
          type="button"
          onClick={reset}
          className="app-focus mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-kumo-brand px-4 text-base font-medium text-white hover:bg-kumo-brand-hover"
        >
          重试
        </button>
      </div>
    </main>
  )
}
