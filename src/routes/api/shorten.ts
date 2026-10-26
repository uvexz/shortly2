import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { getClientIpFromHeaders } from '@/lib/ip'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { SHORT_LINK_EXPIRES_IN_VALUES } from '@/lib/short-link-expiration'
import { getSiteSettings } from '@/lib/site-settings'
import { createShortLink } from '@/lib/shorten'

const shortenRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  customSlug: z.string().trim().min(1).max(50).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  expiresIn: z.enum(SHORT_LINK_EXPIRES_IN_VALUES).optional(),
  maxClicks: z.number().int().positive().optional(),
})

export const Route = createFileRoute('/api/shorten')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await initDb()
        const headers = request.headers
        const settings = await getSiteSettings()

        if (!isRequestOriginAllowed(headers, settings?.siteUrl)) {
          return errorResponse('Forbidden origin', 403)
        }

        const session = await requireActiveUser(headers)
        if (!session) {
          return errorResponse('Authentication required', 401)
        }

        const rawBody = await request.json().catch(() => null)
        if (!rawBody || typeof rawBody !== 'object') {
          return errorResponse('无效的 JSON 主体', 400)
        }
        const parsedBody = shortenRequestSchema.safeParse(rawBody)
        if (!parsedBody.success) {
          return errorResponse('无效的请求主体', 400)
        }
        const { url, customSlug, domain, expiresIn, maxClicks } =
          parsedBody.data

        const result = await createShortLink({
          url,
          customSlug,
          domain,
          expiresIn,
          maxClicks,
          actorUserId: session.user.id,
          creatorIp: getClientIpFromHeaders(headers),
          userLimit: settings?.userMaxLinksPerHour ?? 50,
          requestHeaders: headers,
          logEventType: 'link_created',
          messages: {
            invalidUrlPrefix: '链接无效：',
            noDomainError: '未找到可用的短链域名',
            selfShortenError:
              '链接无效：该链接包含本站域名，为避免循环跳转不允许缩短。',
            invalidCustomSlugError:
              '自定义后缀无效。仅允许使用字母、数字、连字符和下划线（最多 50 个字符）。',
            duplicateSlugError: '自定义后缀已被占用',
          },
        })

        if ('error' in result) {
          return errorResponse(result.error, result.status)
        }

        return jsonResponse(result.data)
      },
    },
  },
})
