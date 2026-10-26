import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { parseBoundedInt } from '@/lib/http'
import { listTempMessagesForMailbox } from '@/lib/temp-email'

export const Route = createFileRoute('/v1/emails/$id/messages')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(
          searchParams.get('limit') ?? searchParams.get('size'),
          20,
          1,
          100,
        )

        const result = await listTempMessagesForMailbox(
          authResult.data.userId,
          params.id,
          page,
          limit,
        )
        scheduleApiKeyUsageTouch(authResult.data)

        if (!result) {
          return errorResponse('Mailbox not found', 404)
        }

        return jsonResponse(result)
      },
    },
  },
})
