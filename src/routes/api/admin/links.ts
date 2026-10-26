import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { listAdminLinks } from '@/lib/admin-links'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'

export const Route = createFileRoute('/api/admin/links')({
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
        const limitParam =
          searchParams.get('limit') ?? searchParams.get('pageSize')
        const limit = parseBoundedInt(limitParam, 50, 1, 200)
        const result = await listAdminLinks(page, limit)

        return jsonResponse(result)
      },
    },
  },
})
