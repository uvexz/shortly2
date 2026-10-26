import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { listTempMessagesForMailbox } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/$id/messages')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
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
          session.user.id,
          params.id,
          page,
          limit,
        )
        if (!result) {
          return errorResponse('Mailbox not found', 404)
        }

        return jsonResponse(result)
      },
    },
  },
})
