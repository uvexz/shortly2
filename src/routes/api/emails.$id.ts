import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { deleteTempMailbox } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/$id')({
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

        const success = await deleteTempMailbox(session.user.id, params.id)
        if (!success) {
          return errorResponse('Mailbox not found', 404)
        }

        return jsonResponse({ success: true })
      },
    },
  },
})
