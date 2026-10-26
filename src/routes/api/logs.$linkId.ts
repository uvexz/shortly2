import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { linkLog, shortLink } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'

function maskIpAddress(ipAddress: string | null) {
  if (!ipAddress) return null

  if (ipAddress.includes('.')) {
    const parts = ipAddress.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`
    }
  }

  if (ipAddress.includes(':')) {
    const parts = ipAddress.split(':').filter(Boolean)
    if (parts.length > 0) {
      return `${parts.slice(0, 2).join(':')}:***`
    }
  }

  return '***'
}

function sanitizeReferrer(referrer: string | null) {
  if (!referrer) return null

  try {
    return new URL(referrer).origin
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/logs/$linkId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const linkId = params.linkId
        const isAdmin = (session.user as { role?: string }).role === 'admin'

        if (!isAdmin) {
          const ownedLink = await db
            .select({ id: shortLink.id })
            .from(shortLink)
            .where(
              and(
                eq(shortLink.id, linkId),
                eq(shortLink.userId, session.user.id),
              ),
            )
            .get()

          if (!ownedLink) {
            const ownedLog = await db
              .select({ id: linkLog.id })
              .from(linkLog)
              .where(
                and(
                  eq(linkLog.linkId, linkId),
                  eq(linkLog.ownerUserId, session.user.id),
                ),
              )
              .get()

            if (!ownedLog) {
              return errorResponse('Link not found', 404)
            }
          }
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
          .where(eq(linkLog.linkId, linkId))
          .get()

        const logs = await db
          .select()
          .from(linkLog)
          .where(eq(linkLog.linkId, linkId))
          .orderBy(desc(linkLog.createdAt))
          .limit(pageSize)
          .offset(offset)

        const total = totalCount?.count ?? 0
        const data = isAdmin
          ? logs
          : logs.map((log) => ({
              ...log,
              referrer: sanitizeReferrer(log.referrer),
              userAgent: null,
              ipAddress: maskIpAddress(log.ipAddress),
            }))

        return jsonResponse({
          data,
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        })
      },
    },
  },
})
