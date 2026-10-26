import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isRequestOriginAllowed, normalizeBaseUrl } from '@/lib/http'
import { reportDiagnostic } from '@/lib/observability'
import { requireActiveAdmin } from '@/lib/session'
import { getSiteSettings, writeSiteSettings } from '@/lib/site-settings'

const optionalPositiveInt = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.number().int().min(1).max(100000).optional(),
)

const settingsUpdateSchema = z.object({
  siteName: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().min(1).max(80).optional(),
  ),
  siteUrl: z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .max(2000)
      .refine(
        (url) => url === '' || normalizeBaseUrl(url) !== null,
        'siteUrl must be a valid http(s) URL',
      )
      .optional(),
  ),
  telegramBotUsername: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().max(64).optional(),
  ),
  userMaxLinksPerHour: optionalPositiveInt,
})

function normalizeTelegramBotUsername(
  input: string | undefined,
): string | undefined {
  if (input === undefined) return undefined
  const trimmed = input.trim()
  if (!trimmed) return ''
  return trimmed.replace(/^@+/, '')
}

export const Route = createFileRoute('/api/admin/settings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)

        const settings = await getSiteSettings()
        return jsonResponse(settings)
      },
      POST: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== 'object') {
          return errorResponse('Invalid JSON body', 400)
        }

        const parsed = settingsUpdateSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('Invalid settings payload', 400)
        }

        const { siteName, siteUrl, telegramBotUsername, userMaxLinksPerHour } =
          parsed.data
        const normalizedTelegramBotUsername =
          normalizeTelegramBotUsername(telegramBotUsername)

        if (
          normalizedTelegramBotUsername &&
          !/^[a-zA-Z0-9_]{5,32}$/.test(normalizedTelegramBotUsername)
        ) {
          return errorResponse(
            'TG Bot 用户名格式无效，仅允许 5-32 位字母、数字或下划线',
            400,
          )
        }

        try {
          const updated = await writeSiteSettings({
            siteName,
            siteUrl,
            telegramBotUsername: normalizedTelegramBotUsername,
            userMaxLinksPerHour,
          })

          return jsonResponse(updated)
        } catch (error) {
          reportDiagnostic({
            scope: 'admin_settings',
            event: 'write_failed',
            details: { actorUserId: session.user.id },
            error,
          })
          return errorResponse('保存设置失败，请稍后重试', 500)
        }
      },
    },
  },
})
