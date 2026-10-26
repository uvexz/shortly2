import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireActiveUser } from '@/lib/session'
import { markTempMessageRead } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/messages/$messageId/read')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const success = await markTempMessageRead(
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
