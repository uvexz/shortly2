import { createHash } from "crypto"

const BASE = "https://use.sevencdn.com/avatar"

export function getAvatarUrl(email: string, image?: string | null, size = 80): string {
  if (image) return image
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex")
  return `${BASE}/${hash}?s=${size * 2}&d=identicon`
}
