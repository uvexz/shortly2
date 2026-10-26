import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, sql } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { linkLog, shortLink } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { getClientIpFromHeaders } from '@/lib/ip'
import { isRequestOriginAllowed, parseBoundedInt } from '@/lib/http'
import { createLinkLog } from '@/lib/link-logs'
import { requireActiveAdmin } from '@/lib/session'

export const Route = createFileRoute('/api/admin/links/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) {
          return errorResponse('Forbidden', 403)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const pageSize = parseBoundedInt(
          searchParams.get('pageSize'),
          50,
          1,
          200,
        )
        const offset = (page - 1) * pageSize

        const totalCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(linkLog)
          .where(eq(linkLog.linkId, params.id))
          .get()

        const logs = await db
          .select()
          .from(linkLog)
          .where(eq(linkLog.linkId, params.id))
          .orderBy(desc(linkLog.createdAt))
          .limit(pageSize)
          .offset(offset)

        const total = totalCount?.count ?? 0

        return jsonResponse({
          data: logs,
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        })
      },
      DELETE: async ({ request, params }) => {
        await initDb()
        const headers = request.headers
        const session = await requireActiveAdmin(headers)
        if (!session) {
          return errorResponse('Forbidden', 403)
        }
        if (!isRequestOriginAllowed(headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const link = await db
          .select()
          .from(shortLink)
          .where(eq(shortLink.id, params.id))
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
              eventType: 'link_manual_deleted_by_admin',
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
