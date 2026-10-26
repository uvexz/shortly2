import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireActiveAdmin } from '@/lib/session'
import { getAdminArchivedTempMessageDetail } from '@/lib/temp-email'

export const Route = createFileRoute('/api/admin/emails/archives/$archiveId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)

        const detail = await getAdminArchivedTempMessageDetail(params.archiveId)
        if (!detail) {
          return errorResponse('Archived email not found', 404)
        }

        return jsonResponse({ data: detail })
      },
    },
  },
})
