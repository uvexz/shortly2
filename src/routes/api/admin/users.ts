import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, sql } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { shortLink, user } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'

export const Route = createFileRoute('/api/admin/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) {
          return errorResponse('Forbidden', 403)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(
          searchParams.get('limit') ?? searchParams.get('pageSize'),
          50,
          1,
          200,
        )
        const offset = (page - 1) * limit

        const [totalRes, users] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .get(),
          db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              emailVerified: user.emailVerified,
              image: user.image,
              banned: user.banned,
              banReason: user.banReason,
              banExpires: user.banExpires,
              createdAt: user.createdAt,
              linkCount: sql<number>`count(${shortLink.id})`,
            })
            .from(user)
            .leftJoin(shortLink, eq(shortLink.userId, user.id))
            .groupBy(user.id)
            .orderBy(desc(user.createdAt))
            .limit(limit)
            .offset(offset),
        ])

        const total = totalRes?.count ?? 0
        return jsonResponse({
          data: users,
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        })
      },
    },
  },
})
