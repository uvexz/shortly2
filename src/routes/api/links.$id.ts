import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { shortLink } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { getClientIpFromHeaders } from '@/lib/ip'
import { isRequestOriginAllowed } from '@/lib/http'
import { createLinkLog } from '@/lib/link-logs'
import { requireActiveUser } from '@/lib/session'

export const Route = createFileRoute('/api/links/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        await initDb()
        const headers = request.headers
        const session = await requireActiveUser(headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }
        if (!isRequestOriginAllowed(headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const link = await db
          .select()
          .from(shortLink)
          .where(
            and(
              eq(shortLink.id, params.id),
              eq(shortLink.userId, session.user.id),
            ),
          )
          .get()

        if (!link) {
          return errorResponse('Link not found', 404)
        }

        const ip = getClientIpFromHeaders(headers)

        await db.transaction(async (tx) => {
          await createLinkLog(
            {
              linkId: link.id,
              linkSlug: link.slug,
              ownerUserId: link.userId,
              eventType: 'link_manual_deleted_by_user',
              referrer: headers.get('referer'),
              userAgent: headers.get('user-agent'),
              ipAddress: ip,
              statusCode: 200,
            },
            tx,
          )

          await tx.delete(shortLink).where(eq(shortLink.id, params.id))
        })

        return jsonResponse({ success: true })
      },
    },
  },
})
