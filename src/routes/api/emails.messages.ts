import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { listTempMessagesForUser } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/messages')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const { searchParams } = new URL(request.url)
        const page = parseBoundedInt(searchParams.get('page'), 1, 1, 100000)
        const limit = parseBoundedInt(searchParams.get('limit'), 20, 1, 100)
        const search = searchParams.get('search')
        const mailboxId = searchParams.get('mailboxId')

        const result = await listTempMessagesForUser(
          session.user.id,
          page,
          limit,
          { search, mailboxId },
        )
        return jsonResponse(result)
      },
    },
  },
})
