import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { apiKey } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { generateApiKey, hashApiKey } from '@/lib/api-keys'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveUser } from '@/lib/session'

export const Route = createFileRoute('/v1/keys')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }

        const keys = await db
          .select({
            id: apiKey.id,
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            lastUsedAt: apiKey.lastUsedAt,
            createdAt: apiKey.createdAt,
          })
          .from(apiKey)
          .where(eq(apiKey.userId, session.user.id))
          .orderBy(desc(apiKey.createdAt))

        return jsonResponse({ data: keys })
      },
      POST: async ({ request }) => {
        await initDb()
        const session = await requireActiveUser(request.headers)
        if (!session) {
          return errorResponse('Unauthorized', 401)
        }
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const body = (await request.json().catch(() => ({}))) as {
          name?: unknown
        }
        const name = typeof body?.name === 'string' ? body.name.trim() : ''
        const finalName = (
          name || `API Key ${new Date().toISOString().slice(0, 10)}`
        ).slice(0, 60)

        let created: {
          plainKey: string
          keyRecord: {
            id: string
            name: string
            keyPrefix: string
            lastUsedAt: Date | null
            createdAt: Date
          }
        } | null = null

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const { key, keyPrefix } = generateApiKey()
          const keyHash = await hashApiKey(key)
          const id = crypto.randomUUID()
          try {
            const keyRecord = await db
              .insert(apiKey)
              .values({
                id,
                userId: session.user.id,
                name: finalName,
                keyPrefix,
                keyHash,
              })
              .returning({
                id: apiKey.id,
                name: apiKey.name,
                keyPrefix: apiKey.keyPrefix,
                lastUsedAt: apiKey.lastUsedAt,
                createdAt: apiKey.createdAt,
              })
              .get()
            created = { plainKey: key, keyRecord }
            break
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            if (!message.includes('UNIQUE')) {
              throw error
            }
          }
        }

        if (!created) {
          return errorResponse('Failed to create API key, please retry.', 500)
        }

        return jsonResponse(
          {
            data: created.keyRecord,
            plainKey: created.plainKey,
          },
          { status: 201 },
        )
      },
    },
  },
})
