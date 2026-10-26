import { createFileRoute } from '@tanstack/react-router'
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { shortLink } from '@/db/schema'
import { errorResponse } from '@/lib/api-response'
import { runInBackground } from '@/lib/background'
import { getClientIpFromHeaders } from '@/lib/ip'
import { autoDeleteExpiredLink } from '@/lib/link-cleanup'
import { createLinkLog } from '@/lib/link-logs'
import { getLinkStatus } from '@/lib/link-status'
import { getAllowedShortDomain } from '@/lib/site-domains'

export const Route = createFileRoute('/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await initDb()
        const slug = params.slug
        const requestHost =
          request.headers.get('x-forwarded-host') ?? request.headers.get('host')
        const shortDomain = await getAllowedShortDomain(requestHost)

        if (!shortDomain) {
          return Response.redirect(new URL('/', request.url), 307)
        }

        const link = await db
          .select({
            id: shortLink.id,
            userId: shortLink.userId,
            originalUrl: shortLink.originalUrl,
            slug: shortLink.slug,
            domain: shortLink.domain,
            expiresAt: shortLink.expiresAt,
            maxClicks: shortLink.maxClicks,
          })
          .from(shortLink)
          .where(
            and(
              eq(shortLink.domain, shortDomain.host),
              eq(shortLink.slug, slug),
            ),
          )
          .get()

        if (!link) {
          return Response.redirect(new URL('/', request.url), 307)
        }

        const ip = getClientIpFromHeaders(request.headers)
        const referrer = request.headers.get('referer')
        const userAgent = request.headers.get('user-agent')
        const logBase = {
          linkId: link.id,
          linkSlug: link.slug,
          ownerUserId: link.userId,
          referrer,
          userAgent,
          ipAddress: ip,
        }

        const expiresAtMs = link.expiresAt
          ? new Date(link.expiresAt).getTime()
          : null
        const expiredByDate =
          expiresAtMs !== null &&
          !Number.isNaN(expiresAtMs) &&
          Date.now() > expiresAtMs

        if (expiredByDate) {
          runInBackground(() =>
            createLinkLog({
              ...logBase,
              eventType: 'redirect_blocked_expired',
              statusCode: 410,
            }),
          )
          runInBackground(() =>
            autoDeleteExpiredLink({
              linkId: link.id,
              domain: link.domain,
              slug: link.slug,
              ownerUserId: link.userId,
              eventType: 'link_auto_deleted_expired',
            }),
          )

          return errorResponse('This link has expired.', 410)
        }

        const now = new Date()
        const updateResult = await db
          .update(shortLink)
          .set({ clicks: sql`${shortLink.clicks} + 1` })
          .where(
            and(
              eq(shortLink.id, link.id),
              or(isNull(shortLink.expiresAt), gt(shortLink.expiresAt, now)),
              or(
                isNull(shortLink.maxClicks),
                lt(shortLink.clicks, shortLink.maxClicks),
              ),
            ),
          )
          .run()

        if ((updateResult.rowsAffected ?? 0) < 1) {
          const latest = await db
            .select()
            .from(shortLink)
            .where(eq(shortLink.id, link.id))
            .get()

          if (!latest) {
            return errorResponse('This link is no longer available.', 410)
          }

          const latestStatus = getLinkStatus(latest)
          if (latestStatus.expiredByDate) {
            runInBackground(() =>
              createLinkLog({
                ...logBase,
                eventType: 'redirect_blocked_expired',
                statusCode: 410,
              }),
            )
            runInBackground(() =>
              autoDeleteExpiredLink({
                linkId: latest.id,
                domain: latest.domain,
                slug: latest.slug,
                ownerUserId: latest.userId,
                eventType: 'link_auto_deleted_expired',
              }),
            )
            return errorResponse('This link has expired.', 410)
          }

          if (latestStatus.expiredByClicks) {
            runInBackground(() =>
              createLinkLog({
                ...logBase,
                eventType: 'redirect_blocked_max_clicks',
                statusCode: 410,
              }),
            )
            runInBackground(() =>
              autoDeleteExpiredLink({
                linkId: latest.id,
                domain: latest.domain,
                slug: latest.slug,
                ownerUserId: latest.userId,
                eventType: 'link_auto_deleted_max_clicks',
              }),
            )
            return errorResponse('This link reached the click limit.', 410)
          }
        }

        runInBackground(() =>
          createLinkLog({
            ...logBase,
            eventType: 'redirect_success',
            statusCode: 302,
          }),
        )

        return Response.redirect(link.originalUrl, 302)
      },
    },
  },
})
