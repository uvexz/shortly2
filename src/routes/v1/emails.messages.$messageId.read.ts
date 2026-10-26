import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { markTempMessageRead } from '@/lib/temp-email'

export const Route = createFileRoute('/v1/emails/messages/$messageId/read')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const success = await markTempMessageRead(
          authResult.data.userId,
          params.messageId,
        )
        scheduleApiKeyUsageTouch(authResult.data)

        if (!success) {
          return errorResponse('Email message not found', 404)
        }

        return jsonResponse({ success: true })
      },
    },
  },
})
