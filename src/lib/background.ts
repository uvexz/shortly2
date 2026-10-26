/**
 * Best-effort work that must not affect the response. TanStack Start has no
 * direct equivalent of Next's `after()`, so failures are swallowed after being
 * reported by the caller.
 */
export function runInBackground(run: () => Promise<unknown>) {
  void Promise.resolve()
    .then(run)
    .catch(() => undefined)
}
