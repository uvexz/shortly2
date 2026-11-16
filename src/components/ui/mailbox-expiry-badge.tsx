import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'

const TICK_MS = 30 * 1000
const SOON_MS = 10 * 60 * 1000

/**
 * 临时邮箱待收窗口徽章：未收到邮件时显示「待收件 · 剩 N 分钟」，超时显示
 * 「已失效」。`expiresAt` 为 null 表示长期有效（已收过邮件或上线前创建），
 * 此时不渲染任何内容。
 *
 * 时间在组件内自走（30s 一跳），首次渲染先留空再挂钟，避免 SSR 与客户端
 * 时间不一致导致的 hydration 差异。
 */
export function MailboxExpiryBadge({
  expiresAt,
}: {
  expiresAt: string | null
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  if (!expiresAt || now === null) return null

  const deadline = new Date(expiresAt).getTime()
  if (Number.isNaN(deadline)) return null

  const remaining = deadline - now
  if (remaining <= 0) {
    return <StatusBadge label="已失效" tone="danger" />
  }

  const minutes = Math.max(1, Math.ceil(remaining / 60_000))
  return (
    <StatusBadge
      label={`待收件 · 剩 ${minutes} 分钟`}
      tone={remaining <= SOON_MS ? 'warning' : 'info'}
    />
  )
}
