import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { deleteTempMessage, getTempMessageDetail } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/messages/$messageId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const detail = await getTempMessageDetail(
          session.user.id,
          params.messageId,
        )
        if (!detail) {
          return errorResponse('Email message not found', 404)
        }

        return jsonResponse({ data: detail })
      },
      DELETE: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const success = await deleteTempMessage(
          session.user.id,
          params.messageId,
        )
        if (!success) {
          return errorResponse('Email message not found', 404)
        }

        return jsonResponse({ success: true })
      },
    },
  },
})
