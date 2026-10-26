import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { parseBoundedInt } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'
import { getSiteSettings } from '@/lib/site-settings'
import {
  createTempMailboxForUser,
  listTempMailboxesForUser,
} from '@/lib/temp-email'

export const Route = createFileRoute('/api/emails')({
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
        const limit = parseBoundedInt(
          searchParams.get('limit') ?? searchParams.get('size'),
          10,
          1,
          100,
        )

        const result = await listTempMailboxesForUser(
          session.user.id,
          page,
          limit,
        )
        return jsonResponse(result)
      },
      POST: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const body = (await request.json().catch(() => null)) as {
          emailAddress?: unknown
        } | null
        const emailAddress =
          typeof body?.emailAddress === 'string' ? body.emailAddress.trim() : ''
        if (!emailAddress) {
          return errorResponse('emailAddress is required', 400)
        }

        const settings = await getSiteSettings()
        const result = await createTempMailboxForUser(
          session.user.id,
          emailAddress,
          { hourlyCreateLimit: settings?.userMaxLinksPerHour ?? 50 },
        )

        if ('error' in result) {
          return errorResponse(
            result.error ?? 'Failed to create mailbox',
            result.status ?? 500,
          )
        }

        return jsonResponse({ data: result.data }, { status: 201 })
      },
    },
  },
})
