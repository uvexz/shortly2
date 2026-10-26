import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { initDb } from '@/db'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { storeInboundEmail } from '@/lib/temp-email'

const inboundAttachmentSchema = z.object({
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  r2Path: z.string().max(1024).optional(),
  size: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024 * 1024)
    .optional(),
})

const inboundEmailSchema = z.object({
  to: z.string().min(1).max(320),
  from: z.string().min(1).max(320),
  fromName: z.string().max(255).optional(),
  subject: z.string().max(1000).optional(),
  text: z.string().max(2_000_000).optional(),
  html: z.string().max(2_000_000).optional(),
  date: z.string().max(100).optional(),
  messageId: z.string().max(1000).optional(),
  cc: z.string().max(100_000).optional(),
  replyTo: z.string().max(100_000).optional(),
  headers: z.string().max(1_000_000).optional(),
  attachments: z.array(inboundAttachmentSchema).max(50).optional(),
})

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(providedBuffer, providedBuffer)
    return false
  }
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

export const Route = createFileRoute('/v1/emails/inbound')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await initDb()

        const expectedSecret = process.env.INBOUND_EMAIL_SECRET?.trim()
        if (!expectedSecret) {
          return errorResponse('Inbound email secret is not configured', 500)
        }

        const providedSecret = request.headers
          .get('x-inbound-email-secret')
          ?.trim()
        if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
          return errorResponse('Unauthorized', 401)
        }

        const body = await request.json().catch(() => null)
        const parsed = inboundEmailSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('Invalid inbound email payload', 400)
        }

        const result = await storeInboundEmail(parsed.data)
        return jsonResponse({ success: true, ...result.data })
      },
    },
  },
})
