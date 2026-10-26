import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { getClientIpFromHeaders } from '@/lib/ip'
import { SHORT_LINK_EXPIRES_IN_VALUES } from '@/lib/short-link-expiration'
import { getSiteSettings } from '@/lib/site-settings'
import { createShortLink } from '@/lib/shorten'

const openApiShortenSchema = z.object({
  url: z.string().min(1).max(2048),
  customSlug: z.string().trim().min(1).max(50).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  expiresIn: z.enum(SHORT_LINK_EXPIRES_IN_VALUES).optional(),
  maxClicks: z.number().int().positive().optional(),
})

export const Route = createFileRoute('/v1/shorten')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const settings = await getSiteSettings()
        const rawBody = await request.json().catch(() => null)
        if (!rawBody || typeof rawBody !== 'object') {
          return errorResponse('Invalid JSON body', 400)
        }
        const parsedBody = openApiShortenSchema.safeParse(rawBody)
        if (!parsedBody.success) {
          return errorResponse('Invalid request body', 400)
        }

        const { url, customSlug, domain, expiresIn, maxClicks } =
          parsedBody.data

        const result = await createShortLink({
          url,
          customSlug,
          domain,
          expiresIn,
          maxClicks,
          actorUserId: authResult.data.userId,
          creatorIp: getClientIpFromHeaders(request.headers),
          userLimit: settings?.userMaxLinksPerHour ?? 50,
          requestHeaders: request.headers,
          logEventType: 'link_created_api',
          messages: {
            invalidUrlPrefix: '链接无效：',
            noDomainError: 'No enabled short-link domain is available',
            selfShortenError:
              '链接无效：该链接包含本站域名（APP_URL 或当前 Host），为避免循环跳转不允许缩短。',
            invalidCustomSlugError:
              'Invalid custom slug. Use only letters, numbers, hyphens, and underscores (max 50 chars).',
            duplicateSlugError: 'This custom slug is already taken',
          },
        })

        if ('error' in result) {
          return errorResponse(result.error, result.status)
        }

        scheduleApiKeyUsageTouch(authResult.data)

        return jsonResponse(result.data, { status: 201 })
      },
    },
  },
})
