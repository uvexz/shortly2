import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'
import { listAllTempMessages } from '@/lib/temp-email'

export const Route = createFileRoute('/api/admin/emails/messages')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(searchParams.get('limit'), 20, 1, 100)
        const search = searchParams.get('search')

        const result = await listAllTempMessages(page, limit, search)
        return jsonResponse(result)
      },
    },
  },
})
