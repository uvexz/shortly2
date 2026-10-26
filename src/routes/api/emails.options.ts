import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireActiveUser } from '@/lib/session'
import { listTempMailboxOptionsForUser } from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails/options')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const data = await listTempMailboxOptionsForUser(session.user.id)
        return jsonResponse({ data })
      },
    },
  },
})
