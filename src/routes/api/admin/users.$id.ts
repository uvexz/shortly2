import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, initDb } from '@/db'
import { session as authSession, user } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'

const updateUserStatusSchema = z.object({
  banned: z.boolean(),
  banReason: z.string().trim().max(500).optional(),
})

export const Route = createFileRoute('/api/admin/users/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        await initDb()
        const headers = request.headers
        const session = await requireActiveAdmin(headers)
        if (!session) {
          return errorResponse('Forbidden', 403)
        }
        if (!isRequestOriginAllowed(headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        if (params.id === session.user.id) {
          return errorResponse('Cannot ban yourself', 400)
        }

        const rawBody = await request.json().catch(() => null)
        const parsedBody = updateUserStatusSchema.safeParse(rawBody)
        if (!parsedBody.success) {
          return errorResponse('Invalid request body', 400)
        }

        const existingUser = await db
          .select()
          .from(user)
          .where(eq(user.id, params.id))
          .get()
        if (!existingUser) {
          return errorResponse('User not found', 404)
        }

        const banReason = parsedBody.data.banned
          ? parsedBody.data.banReason?.trim() || '管理员封禁'
          : null

        const updatedUser = await db.transaction(async (tx) => {
          const updated = await tx
            .update(user)
            .set({
              banned: parsedBody.data.banned,
              banReason,
              banExpires: null,
              updatedAt: new Date(),
            })
            .where(eq(user.id, params.id))
            .returning({
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
            })
            .get()

          if (parsedBody.data.banned) {
            await tx
              .delete(authSession)
              .where(eq(authSession.userId, params.id))
          }

          return updated
        })

        return jsonResponse({ user: updatedUser })
      },
    },
  },
})
