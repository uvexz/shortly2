import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, initDb } from '@/db'
import { siteDomain } from '@/db/schema'
import { errorResponse, jsonResponse } from '@/lib/api-response'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { isRequestOriginAllowed } from '@/lib/http'
import { requireActiveAdmin } from '@/lib/session'
import {
  parseDomainHost,
  writeDeletedSiteDomain,
  writeUpdatedSiteDomain,
} from '@/lib/site-domains'

const updateDomainSchema = z.object({
  host: z.string().trim().min(1).max(255).optional(),
  supportsShortLinks: z.boolean().optional(),
  shortLinkMinSlugLength: z.number().int().min(1).max(50).optional(),
  supportsTempEmail: z.boolean().optional(),
  tempEmailMinLocalPartLength: z.number().int().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
  isDefaultShortDomain: z.boolean().optional(),
  isDefaultEmailDomain: z.boolean().optional(),
})

export const Route = createFileRoute('/api/admin/domains/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
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

        const parsed = updateDomainSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('Invalid domain payload', 400)
        }

        const existing = await db
          .select()
          .from(siteDomain)
          .where(eq(siteDomain.id, params.id))
          .get()
        if (!existing) {
          return errorResponse('Domain not found', 404)
        }

        const changes: Parameters<typeof writeUpdatedSiteDomain>[1] = {}
        if (parsed.data.host !== undefined) {
          const normalizedHost = parseDomainHost(parsed.data.host)
          if (!normalizedHost) {
            return errorResponse('Invalid domain host', 400)
          }
          changes.host = normalizedHost
        }
        if (parsed.data.supportsShortLinks !== undefined) {
          changes.supportsShortLinks = parsed.data.supportsShortLinks
        }
        if (parsed.data.supportsTempEmail !== undefined) {
          changes.supportsTempEmail = parsed.data.supportsTempEmail
        }
        if (parsed.data.shortLinkMinSlugLength !== undefined) {
          changes.shortLinkMinSlugLength = parsed.data.shortLinkMinSlugLength
        }
        if (parsed.data.tempEmailMinLocalPartLength !== undefined) {
          changes.tempEmailMinLocalPartLength =
            parsed.data.tempEmailMinLocalPartLength
        }
        if (parsed.data.isActive !== undefined) {
          changes.isActive = parsed.data.isActive
        }
        if (parsed.data.isDefaultShortDomain !== undefined) {
          changes.isDefaultShortDomain = parsed.data.isDefaultShortDomain
        }
        if (parsed.data.isDefaultEmailDomain !== undefined) {
          changes.isDefaultEmailDomain = parsed.data.isDefaultEmailDomain
        }

        if (Object.keys(changes).length === 0) {
          return errorResponse('No fields to update', 400)
        }

        const nextSupportsShortLinks =
          changes.supportsShortLinks ?? existing.supportsShortLinks
        const nextSupportsTempEmail =
          changes.supportsTempEmail ?? existing.supportsTempEmail
        const nextIsActive = changes.isActive ?? existing.isActive

        if (
          changes.isDefaultShortDomain &&
          (!nextSupportsShortLinks || !nextIsActive)
        ) {
          return errorResponse(
            'Default short-link domain must be active and support short links',
            400,
          )
        }

        if (
          changes.isDefaultEmailDomain &&
          (!nextSupportsTempEmail || !nextIsActive)
        ) {
          return errorResponse(
            'Default email domain must be active and support temp email',
            400,
          )
        }

        if (changes.host) {
          const duplicate = await db
            .select({ id: siteDomain.id })
            .from(siteDomain)
            .where(eq(siteDomain.host, changes.host))
            .get()
          if (duplicate && duplicate.id !== params.id) {
            return errorResponse('Domain already exists', 409)
          }
        }

        try {
          const updated = await writeUpdatedSiteDomain(params.id, changes)
          return jsonResponse({ data: updated })
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
      DELETE: async ({ request, params }) => {
        await initDb()
        const session = await requireActiveAdmin(request.headers)
        if (!session) return errorResponse('Forbidden', 403)
        if (!isRequestOriginAllowed(request.headers)) {
          return errorResponse('Forbidden origin', 403)
        }

        const existing = await db
          .select()
          .from(siteDomain)
          .where(eq(siteDomain.id, params.id))
          .get()
        if (!existing) {
          return errorResponse('Domain not found', 404)
        }
        if (existing.isDefaultShortDomain || existing.isDefaultEmailDomain) {
          return errorResponse('Default domains cannot be deleted', 400)
        }

        await writeDeletedSiteDomain(params.id)
        return jsonResponse({ success: true })
      },
    },
  },
})
