import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from '@/lib/api-auth'
import { generateRandomEmailPrefix } from '@/lib/random-email-prefix'
import { getAllowedEmailDomain } from '@/lib/site-domains'
import { getSiteSettings } from '@/lib/site-settings'
import { createTempMailboxForUser } from '@/lib/temp-email'

const MAX_ALIAS_CREATE_ATTEMPTS = 5
const ADDY_COMPAT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-Requested-With',
}

function addyJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  for (const [key, value] of Object.entries(ADDY_COMPAT_HEADERS)) {
    headers.set(key, value)
  }
  return Response.json(body, { ...init, headers })
}

function buildAddyError(message: string, field?: string) {
  if (!field) return { message }
  return { message, errors: { [field]: [message] } }
}

function generateAliasLocalPart(minLength: number) {
  const normalizedMinLength = Math.max(1, Math.floor(minLength))
  if (normalizedMinLength > 64) return null

  const prefix = generateRandomEmailPrefix()
  if (prefix.length >= normalizedMinLength) {
    return prefix.slice(0, 64)
  }

  return null
}

export const Route = createFileRoute('/api/v1/aliases')({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, { status: 204, headers: ADDY_COMPAT_HEADERS }),
      POST: async ({ request }) => {
        await initDb()

        const authResult = await requireApiKeyUser(request.headers)
        if ('error' in authResult) {
          return addyJson(
            { message: authResult.error ?? 'Unauthorized' },
            { status: 401 },
          )
        }

        const body = (await request.json().catch(() => null)) as {
          domain?: unknown
        } | null
        const domain =
          typeof body?.domain === 'string' ? body.domain.trim() : ''
        if (!domain) {
          return addyJson(
            buildAddyError('The domain field is required.', 'domain'),
            { status: 422 },
          )
        }

        const allowedDomain = await getAllowedEmailDomain(domain)
        if (!allowedDomain) {
          return addyJson(
            buildAddyError('This email domain is not enabled.', 'domain'),
            { status: 403 },
          )
        }

        const localPart = generateAliasLocalPart(
          allowedDomain.minLocalPartLength,
        )
        if (!localPart) {
          return addyJson(
            buildAddyError(
              'This email domain cannot generate compatible aliases.',
              'domain',
            ),
            { status: 400 },
          )
        }

        const settings = await getSiteSettings()
        let lastError: { error: string; status: number } | null = null

        for (
          let attempt = 0;
          attempt < MAX_ALIAS_CREATE_ATTEMPTS;
          attempt += 1
        ) {
          const candidateLocalPart =
            attempt === 0
              ? localPart
              : generateAliasLocalPart(allowedDomain.minLocalPartLength)
          if (!candidateLocalPart) break

          const result = await createTempMailboxForUser(
            authResult.data.userId,
            `${candidateLocalPart}@${allowedDomain.host}`,
            { hourlyCreateLimit: settings?.userMaxLinksPerHour ?? 50 },
          )

          if (!result.data) {
            lastError = {
              error: result.error || 'Failed to create alias, please retry.',
              status: result.status || 500,
            }
            if (lastError.status !== 409) break
            continue
          }

          scheduleApiKeyUsageTouch(authResult.data)
          return addyJson(
            {
              data: {
                id: result.data.id,
                user_id: authResult.data.userId,
                local_part: result.data.localPart,
                domain: result.data.domain,
                email: result.data.emailAddress,
                active: true,
              },
            },
            { status: 201 },
          )
        }

        if (lastError?.status === 429) {
          return addyJson(buildAddyError(lastError.error), { status: 429 })
        }

        if (lastError?.status === 400 && lastError.error.includes('domain')) {
          return addyJson(buildAddyError(lastError.error, 'domain'), {
            status: 403,
          })
        }

        return addyJson(
          buildAddyError(
            lastError?.error || 'Failed to create alias, please retry.',
          ),
          {
            status:
              lastError?.status && lastError.status !== 409
                ? lastError.status
                : 500,
          },
        )
      },
    },
  },
})
