const CHARS = "abcdefghijklmnopqrstuvwxyz"

export function generateSlug(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("")
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(slug)
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}
