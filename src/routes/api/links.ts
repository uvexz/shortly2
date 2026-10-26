import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { listLinksForUser } from '@/lib/links'
import { requireActiveUser } from '@/lib/session'

export const Route = createFileRoute('/api/links')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(searchParams.get('limit'), 10, 1, 100)
        const result = await listLinksForUser(session.user.id, page, limit)

        return jsonResponse(result)
      },
    },
  },
})
