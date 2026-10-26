import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { initDb } from '@/db'
import { requireActiveUser } from '@/lib/session'
import { getSiteSettings } from '@/lib/site-settings'

export type BootstrapUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: string
}

export type BootstrapData = {
  user: BootstrapUser | null
  siteName: string
  siteUrl: string
  telegramBotUsername: string
  enableEmail: boolean
  enableGithub: boolean
}

export const getBootstrap = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BootstrapData> => {
    await initDb()
    const headers = getRequestHeaders()
    const [session, settings] = await Promise.all([
      requireActiveUser(headers),
      getSiteSettings(),
    ])

    const user = session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
          role: (session.user as { role?: string }).role ?? 'user',
        }
      : null

    return {
      user,
      siteName: settings?.siteName?.trim() || 'Shortly',
      siteUrl: settings?.siteUrl ?? '',
      telegramBotUsername: settings?.telegramBotUsername ?? '',
      enableEmail:
        Boolean(process.env.RESEND_API_KEY) ||
        (process.env.NODE_ENV !== 'production' &&
          process.env.AUTH_OTP_DEV_LOG === 'true'),
      enableGithub: Boolean(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
      ),
    }
  },
)

export const getSessionUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BootstrapUser | null> => {
    await initDb()
    const session = await requireActiveUser(getRequestHeaders())
    if (!session) return null

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      role: (session.user as { role?: string }).role ?? 'user',
    }
  },
)
