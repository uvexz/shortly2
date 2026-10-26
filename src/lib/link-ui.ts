import type { LinkStatusFields } from '@/lib/api-types'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export type LinkHealth = {
  label: string
  tone: StatusTone
}

const EXPIRING_SOON_MS = 1000 * 60 * 60 * 24 * 7

export function getLinkHealth(
  link: LinkStatusFields & { expiresAt: string | null },
): LinkHealth {
  if (link.isExpired) {
    if (link.expiredByClicks) return { label: '点击封顶', tone: 'danger' }
    if (link.expiredByDate) return { label: '已过期', tone: 'danger' }
    return { label: '已失效', tone: 'danger' }
  }

  if (link.expiresAt) {
    const expiresAt = new Date(link.expiresAt).getTime()
    if (
      Number.isFinite(expiresAt) &&
      expiresAt - Date.now() <= EXPIRING_SOON_MS
    ) {
      return { label: '即将到期', tone: 'warning' }
    }
  }

  if (link.hasClickLimit || link.hasExpiration) {
    return { label: '有规则', tone: 'info' }
  }

  return { label: '有效', tone: 'success' }
}

export function getLogEventTone(eventType: string): StatusTone {
  if (eventType === 'redirect_success') return 'success'
  if (eventType.includes('blocked')) return 'danger'
  if (eventType.includes('expired') || eventType.includes('max_clicks')) {
    return 'warning'
  }
  return 'neutral'
}

export function getSourceLabel(referrer: string | null | undefined): string {
  if (!referrer) return '直接访问'
  try {
    return new URL(referrer).hostname.replace(/^www\./, '')
  } catch {
    return '未知来源'
  }
}
