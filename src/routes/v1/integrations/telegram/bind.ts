import { createFileRoute } from '@tanstack/react-router'
import { db, initDb } from '@/db'
import { telegramBinding } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { isUniqueConstraintError } from '@/lib/db-errors'

const CHAT_ID_PATTERN = /^[-A-Za-z0-9_@]{1,64}$/

export const Route = createFileRoute('/v1/integrations/telegram/bind')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return errorResponse(authResult.error ?? 'Unauthorized', 401)
        }

        const body = (await request.json().catch(() => null)) as {
          chatId?: unknown
          username?: unknown
        } | null
        const chatId =
          typeof body?.chatId === 'string' ? body.chatId.trim() : ''
        const username =
          typeof body?.username === 'string'
            ? body.username.trim().slice(0, 64) || null
            : null

        if (!chatId || !CHAT_ID_PATTERN.test(chatId)) {
          return errorResponse(
            'chatId 格式无效，仅允许 1-64 位字母、数字、下划线、@ 或负号',
            400,
          )
        }

        try {
          await db
            .insert(telegramBinding)
            .values({
              id: crypto.randomUUID(),
              userId: authResult.data.userId,
              chatId,
              username,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: telegramBinding.userId,
              set: { chatId, username, updatedAt: new Date() },
            })
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            return errorResponse(
              '该 chatId 已被其他账号绑定，请更换后重试',
              409,
            )
          }
          throw error
        }

        scheduleApiKeyUsageTouch(authResult.data)

        return jsonResponse({
          success: true,
          data: { chatId, username },
        })
      },
    },
  },
})
