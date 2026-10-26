import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { deleteTempMailbox } from '@/lib/temp-email'

export const Route = createFileRoute('/v1/emails/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const success = await deleteTempMailbox(
          authResult.data.userId,
          params.id,
        )
        scheduleApiKeyUsageTouch(authResult.data)

        if (!success) {
          return errorResponse('Mailbox not found', 404)
        }

        return jsonResponse({ success: true })
      },
    },
  },
})
