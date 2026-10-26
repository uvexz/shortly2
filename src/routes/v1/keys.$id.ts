import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { apiKey } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'

export const Route = createFileRoute('/v1/keys/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const existing = await db
          .select({ id: apiKey.id })
          .from(apiKey)
          .where(
            and(eq(apiKey.id, params.id), eq(apiKey.userId, session.user.id)),
          )
          .get()

        if (!existing) {
          return errorResponse('API key not found', 404)
        }

        await db.delete(apiKey).where(eq(apiKey.id, params.id))
        return jsonResponse({ success: true })
      },
    },
  },
})
