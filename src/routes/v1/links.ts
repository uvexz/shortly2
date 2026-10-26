import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { parseBoundedInt } from '@/lib/http'
import { listLinksForUser } from '@/lib/links'

export const Route = createFileRoute('/v1/links')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(searchParams.get('limit'), 10, 1, 100)
        const result = await listLinksForUser(
          authResult.data.userId,
          page,
          limit,
        )

        scheduleApiKeyUsageTouch(authResult.data)

        return jsonResponse(result)
      },
    },
  },
})
