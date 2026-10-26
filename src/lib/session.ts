import { auth } from '@/lib/auth'

export type ActiveSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>

function isBanExpired(banExpires: Date | string | null | undefined): boolean {
  if (!banExpires) return false
  const time =
    banExpires instanceof Date
      ? banExpires.getTime()
      : new Date(banExpires).getTime()
  return Number.isFinite(time) && time <= Date.now()
}

/**
 * Resolve the current session while bypassing the session cookie cache and
 * re-checking the ban flag against the database, matching v1 behavior.
 */
export async function requireActiveUser(
  headers: Headers,
): Promise<ActiveSession | null> {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  })
  if (!session) {
    return null
  }

  const user = session.user as {
    banned?: boolean
    banExpires?: Date | string | null
  }
  if (user.banned && !isBanExpired(user.banExpires)) {
    return null
  }

  return session
}

export async function requireActiveAdmin(
  headers: Headers,
): Promise<ActiveSession | null> {
  const session = await requireActiveUser(headers)
  if (!session) {
    return null
  }
  if ((session.user as { role?: string }).role !== 'admin') {
    return null
  }
  return session
}
