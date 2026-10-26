import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { auth } from '@/lib/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        return auth.handler(request)
      },
      POST: async ({ request }) => {
        await initDb()
        return auth.handler(request)
      },
    },
  },
})
