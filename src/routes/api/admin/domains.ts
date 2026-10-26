import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, initDb } from '@/db'
import { siteDomain } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'
import { parseDomainHost, writeCreatedSiteDomain } from '@/lib/site-domains'

const createDomainSchema = z.object({
  host: z.string().trim().min(1).max(255),
  supportsShortLinks: z.boolean().optional().default(false),
  shortLinkMinSlugLength: z.number().int().min(1).max(50).optional().default(1),
  supportsTempEmail: z.boolean().optional().default(false),
  tempEmailMinLocalPartLength: z
    .number()
    .int()
    .min(1)
    .max(64)
    .optional()
    .default(1),
  isActive: z.boolean().optional().default(true),
  isDefaultShortDomain: z.boolean().optional().default(false),
  isDefaultEmailDomain: z.boolean().optional().default(false),
})

export const Route = createFileRoute('/api/admin/domains')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)

        const domains = await db
          .select()
          .from(siteDomain)
          .orderBy(asc(siteDomain.host))
        return jsonResponse({ data: domains })
      },
      POST: async ({ request }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const body = await request.json().catch(() => null)
        if (!body || typeof body !== 'object') {
          return errorResponse('Invalid JSON body', 400)
        }

        const parsed = createDomainSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('Invalid domain payload', 400)
        }

        const normalizedHost = parseDomainHost(parsed.data.host)
        if (!normalizedHost) {
          return errorResponse('Invalid domain host', 400)
        }

        const {
          supportsShortLinks,
          shortLinkMinSlugLength,
          supportsTempEmail,
          tempEmailMinLocalPartLength,
          isActive,
          isDefaultShortDomain,
          isDefaultEmailDomain,
        } = parsed.data

        const normalizedShortLinkMinSlugLength = supportsShortLinks
          ? shortLinkMinSlugLength
          : 1
        const normalizedTempEmailMinLocalPartLength = supportsTempEmail
          ? tempEmailMinLocalPartLength
          : 1

        if (isDefaultShortDomain && (!supportsShortLinks || !isActive)) {
          return errorResponse(
            'Default short-link domain must be active and support short links',
            400,
          )
        }

        if (isDefaultEmailDomain && (!supportsTempEmail || !isActive)) {
          return errorResponse(
            'Default email domain must be active and support temp email',
            400,
          )
        }

        const existing = await db
          .select({ id: siteDomain.id })
          .from(siteDomain)
          .where(eq(siteDomain.host, normalizedHost))
          .get()
        if (existing) {
          return errorResponse('Domain already exists', 409)
        }

        const id = crypto.randomUUID()
        try {
          const created = await writeCreatedSiteDomain({
            id,
            host: normalizedHost,
            supportsShortLinks,
            shortLinkMinSlugLength: normalizedShortLinkMinSlugLength,
            supportsTempEmail,
            tempEmailMinLocalPartLength: normalizedTempEmailMinLocalPartLength,
            isActive,
            isDefaultShortDomain,
            isDefaultEmailDomain,
            createdAt: new Date(),
          })
          return jsonResponse({ data: created }, { status: 201 })
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            return errorResponse(
              'Another domain is already the default for this type',
              409,
            )
          }
          throw error
        }
      },
    },
  },
})
