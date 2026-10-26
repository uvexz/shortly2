export const PUBLIC_CONFIG_CACHE_CONTROL =
  'public, s-maxage=60, stale-while-revalidate=300'

export function createTtlCache<T>(ttlMs: number) {
  let entry: { value: T; expiresAt: number } | null = null
  let inflight: Promise<T> | null = null

  return {
    async get(loader: () => Promise<T>): Promise<T> {
      if (entry && entry.expiresAt > Date.now()) {
        return entry.value
      }

      if (!inflight) {
        inflight = loader()
          .then((value) => {
            entry = { value, expiresAt: Date.now() + ttlMs }
            return value
          })
          .finally(() => {
            inflight = null
          })
      }

      return inflight
    },
    invalidate() {
      entry = null
    },
  }
}
