import { sql, type SQL } from 'drizzle-orm'
import { tempMailbox } from '@/db/schema'

/**
 * 临时邮箱「1 小时内未收件自动失效」规则。
 *
 * 语义：
 * - 新建地址有 1 小时待收窗口（`TEMP_MAILBOX_PENDING_TTL_MS`）。
 * - 窗口内收到任意一封邮件 → 地址被激活，之后不再自动失效（直到手动删除）。
 * - 窗口结束仍一封未收 → 地址自动失效：不再投递、从用户邮箱列表消失，
 *   同一地址可以重新生成（旧记录在发现时惰性回收）。
 *
 * 历史数据不追溯：只有创建时间晚于「规则生效时间」(enforcedSince) 的邮箱才
 * 受约束，早于该时间创建的邮箱永远保留到手动删除。
 *
 * 为什么不加 `expires_at` 列：v1 契约与共用 Turso 库不允许改表，所以规则完全
 * 由 `created_at` + 「是否收过邮件」推导，读时过滤 + 发现时清理，不写额外状态。
 */
export const TEMP_MAILBOX_PENDING_TTL_MS = 60 * 60 * 1000

/**
 * 规则生效时间（UTC）。默认值即本功能上线时刻；如果实际部署更晚，部署时用
 * `TEMP_MAILBOX_EXPIRY_SINCE`（ISO 8601）覆盖，避免把上线前创建的邮箱一起追溯。
 */
const DEFAULT_ENFORCED_SINCE = '2026-11-16T12:30:00.000Z'

let cachedEnforcedSince: Date | null = null

export function getTempMailboxExpiryEnforcedSince(): Date {
  if (cachedEnforcedSince) return cachedEnforcedSince

  const raw = process.env.TEMP_MAILBOX_EXPIRY_SINCE?.trim()
  const parsed = raw ? new Date(raw) : null
  cachedEnforcedSince =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : new Date(DEFAULT_ENFORCED_SINCE)
  return cachedEnforcedSince
}

export function isTempMailboxExpiryEnforced(createdAt: Date): boolean {
  return createdAt.getTime() >= getTempMailboxExpiryEnforcedSince().getTime()
}

/**
 * 返回地址的过期时刻；`null` 表示不受 1 小时规则约束（历史邮箱或已收过邮件），
 * 即一直保留到手动删除。返回值可能已经过去，表示此刻已失效。
 */
export function getTempMailboxExpiresAt(input: {
  createdAt: Date
  hasMessages: boolean
}): Date | null {
  if (input.hasMessages) return null
  if (!isTempMailboxExpiryEnforced(input.createdAt)) return null
  return new Date(input.createdAt.getTime() + TEMP_MAILBOX_PENDING_TTL_MS)
}

export function isTempMailboxExpired(input: {
  createdAt: Date
  hasMessages: boolean
  now?: Date
}): boolean {
  const expiresAt = getTempMailboxExpiresAt(input)
  if (!expiresAt) return false
  const now = input.now ?? new Date()
  return now.getTime() >= expiresAt.getTime()
}

/**
 * 列表查询用的「未失效」条件，等价于 `isTempMailboxExpired` 取反，但把判断
 * 下推到 SQLite——否则分页要在内存里过滤，`total` 会和服务端不一致。
 */
export function notExpiredTempMailboxSql(now = new Date()): SQL {
  const enforcedSinceSeconds = Math.floor(
    getTempMailboxExpiryEnforcedSince().getTime() / 1000,
  )
  const deadlineSeconds = Math.floor(
    (now.getTime() - TEMP_MAILBOX_PENDING_TTL_MS) / 1000,
  )

  // 时间戳列以 unix 秒存储，此处显式传整数，避免 sql`` 绑定 Date 对象。
  return sql`not (${tempMailbox.createdAt} >= ${enforcedSinceSeconds} and ${tempMailbox.createdAt} <= ${deadlineSeconds} and not exists (select 1 from temp_email_message m where m.mailbox_id = ${tempMailbox.id}))`
}

/** 邮箱记录上「是否收过邮件」的计数子查询，供失效判断使用。 */
export function mailboxMessageCountSql(): SQL<number> {
  return sql<number>`(select count(*) from temp_email_message m where m.mailbox_id = ${tempMailbox.id})`
}
