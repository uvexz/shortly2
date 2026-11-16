import {
  buildTelegramEmailWidgetPayload,
  extractEmailText,
  extractVerificationCodes,
} from '@/lib/telegram-widget'

const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000
const TELEGRAM_MAX_ATTEMPTS = 3
const TELEGRAM_TOTAL_BUDGET_MS = 20_000
const TELEGRAM_MAX_RETRY_AFTER_MS = 8_000

function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || ''
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value
}

/** Telegram rejects NUL bytes; strip them before handing text to the API. */
function sanitize(value: string) {
  return value.replaceAll('\u0000', '')
}

type TelegramInboundNotification = {
  chatId: string
  messageId?: string
  emailAddress: string
  from: string
  fromName?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  attachmentsCount?: number
  date?: string | null
}

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<Record<string, string>>>
}

export function buildInboundEmailTelegramMessage(
  notification: TelegramInboundNotification,
) {
  // `fromName` comes straight from the sender's header: it must be escaped, or a
  // display name like "H&M" / "A <B>" makes Telegram reject the whole message
  // with "can't parse entities".
  const senderName = sanitize(notification.fromName?.trim() ?? '')
  const senderAddress = escapeHtml(sanitize(notification.from))
  const sender = senderName
    ? `${escapeHtml(senderName)} &lt;${senderAddress}&gt;`
    : senderAddress
  const subject = escapeHtml(
    sanitize(notification.subject?.trim() || '(无主题)'),
  )
  const bodySource = extractEmailText(notification.text, notification.html)
  const bodyPreview = bodySource
    ? escapeHtml(truncate(bodySource.replace(/\s+/g, ' '), 280))
    : '(无正文预览)'
  const attachmentLine =
    notification.attachmentsCount && notification.attachmentsCount > 0
      ? `\n附件：${notification.attachmentsCount} 个`
      : ''
  const verificationCodes = extractVerificationCodes(
    notification.subject ?? '',
    bodySource,
  )
  const codeLine = verificationCodes.length
    ? `疑似验证码：${verificationCodes.join(' / ')}`
    : ''

  return [
    '<b>收到新邮件</b>',
    '',
    `邮箱：<code>${escapeHtml(sanitize(notification.emailAddress))}</code>`,
    `发件人：${sender}`,
    `主题：${subject}`,
    `${attachmentLine}`.trim(),
    codeLine,
    '',
    `正文预览：\n${bodyPreview}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildInboundEmailReplyMarkup(
  messageId?: string,
): TelegramReplyMarkup | undefined {
  if (!messageId?.trim()) {
    return undefined
  }

  return {
    inline_keyboard: [
      [
        { text: '已读', callback_data: `email:read:${messageId}` },
        { text: '删除', callback_data: `email:delete:${messageId}` },
      ],
      [{ text: '查看邮件详情', callback_data: `email:detail:${messageId}` }],
    ],
  }
}

/** Telegram private chat ids are positive; groups/supergroups are negative. */
function isPrivateTelegramChat(chatId: string): boolean {
  const id = Number(chatId)
  return Number.isFinite(id) && id > 0
}

/**
 * A non-transient Bot API rejection. `retryable` marks throttling and upstream
 * 5xx responses, which the caller retries with `parameters.retry_after`.
 */
class TelegramApiError extends Error {
  readonly status: number
  readonly description: string
  readonly retryAfterMs: number | null

  constructor(
    method: string,
    status: number,
    description: string,
    retryAfterMs: number | null,
  ) {
    super(
      `Telegram ${method} failed: ${status} ${truncate(description, 300)}`.trim(),
    )
    this.name = 'TelegramApiError'
    this.status = status
    this.description = description
    this.retryAfterMs = retryAfterMs
  }

  get retryable() {
    return this.status === 429 || this.status >= 500
  }

  /** `parse_mode: 'HTML'` choke: the same text is still deliverable without it. */
  get isParseError() {
    return (
      this.status === 400 &&
      /can't parse entities|can't find end tag|unclosed|unsupported start tag/i.test(
        this.description,
      )
    )
  }

  /**
   * The chat/bot cannot render widgets at all (Bot API signals this with
   * `INPUT_MEDIA_WIDGET_NOT_ALLOWED`). Not worth retrying — a text notice is.
   */
  get isWidgetNotAllowed() {
    return /WIDGET_NOT_ALLOWED|WIDGETS?_(NOT|DISABLED)/i.test(this.description)
  }
}

function readRetryAfterMs(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null
  const parameters = (body as { parameters?: { retry_after?: unknown } })
    .parameters
  const seconds = parameters?.retry_after
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return null
  }
  return Math.min(seconds * 1000, TELEGRAM_MAX_RETRY_AFTER_MS)
}

function parseJsonBody(raw: string): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * POSTs to the Bot API and retries throttling / network failures.
 *
 * Telegram allows roughly one message per second per chat and answers `429` with
 * `parameters.retry_after`; a temp mailbox regularly receives two mails in the
 * same second, so without this the second notification was simply dropped.
 */
async function callTelegramApi(
  method: string,
  payload: Record<string, unknown>,
) {
  const token = getTelegramBotToken()
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  }

  const maxAttempts = TELEGRAM_MAX_ATTEMPTS
  const deadline = Date.now() + TELEGRAM_TOTAL_BUDGET_MS
  let lastError: unknown = new Error(`Telegram ${method} failed`)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break

    let failure: TelegramApiError | null = null
    let waitMs = Math.min(TELEGRAM_MAX_RETRY_AFTER_MS, 400 * 2 ** (attempt - 1))

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Bound every attempt: Telegram being slow must never hang an
          // inbound-email delivery or a bind request.
          signal: AbortSignal.timeout(
            Math.min(TELEGRAM_REQUEST_TIMEOUT_MS, remaining),
          ),
          body: JSON.stringify(payload),
        },
      )

      const raw = await response.text().catch(() => '')
      const body = parseJsonBody(raw)
      const ok =
        typeof body === 'object' && body !== null
          ? (body as { ok?: unknown }).ok !== false
          : response.ok

      if (response.ok && ok) {
        return
      }

      const description =
        typeof (body as { description?: unknown } | null)?.description ===
        'string'
          ? (body as { description: string }).description
          : truncate(raw, 300)
      const retryAfterMs = readRetryAfterMs(body)
      failure = new TelegramApiError(
        method,
        response.status,
        description,
        retryAfterMs,
      )
      if (retryAfterMs !== null) waitMs = retryAfterMs
    } catch (error) {
      // Network error / timeout: worth another attempt.
      lastError = error
    }

    if (failure) {
      if (!failure.retryable) throw failure
      lastError = failure
    }

    if (attempt === maxAttempts) break
    if (Date.now() + waitMs >= deadline) break
    await sleep(waitMs)
  }

  if (lastError instanceof TelegramApiError) throw lastError
  throw new Error(
    `Telegram ${method} request failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

/** Last-resort plain-text rendering of the HTML notification we built. */
function toPlainText(html: string) {
  return html
    .replace(
      /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|blockquote|tg-spoiler)\b[^>]*>/gi,
      '',
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  if (!getTelegramBotToken() || !chatId.trim()) {
    return false
  }

  const base = {
    chat_id: chatId,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }

  try {
    await callTelegramApi('sendMessage', {
      ...base,
      text,
      parse_mode: 'HTML',
    })
    return true
  } catch (error) {
    // Escaping slipped through somewhere: send the same content without
    // parse_mode rather than losing the notification entirely.
    if (error instanceof TelegramApiError && error.isParseError) {
      console.warn('Telegram HTML parse rejected, retrying as plain text')
      await callTelegramApi('sendMessage', {
        ...base,
        text: toPlainText(text),
      })
      return true
    }
    throw error
  }
}

/**
 * Sends the email card as a Bot API 10.4 widget. Widgets only work in private
 * chats in production; returns false so the caller can fall back to text.
 */
async function sendTelegramWidget(
  chatId: string,
  html: string,
  caption: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  if (!getTelegramBotToken() || !chatId.trim()) {
    return false
  }

  try {
    await callTelegramApi('sendWidget', {
      chat_id: chatId,
      html,
      caption,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    })
    return true
  } catch (error) {
    // The chat/bot cannot render widgets: retrying the widget is pointless, but
    // the plain-text card is still deliverable, so fall back right away.
    if (error instanceof TelegramApiError && error.isWidgetNotAllowed) {
      console.warn(
        `Telegram sendWidget not allowed here (${error.status}), sending text instead: ${truncate(error.description, 200)}`,
      )
      return false
    }
    // 429 is per-chat: the plain-text notice would hit the same window we just
    // waited out, so let it fail loudly. Anything else (content rejection, a
    // widget-only 403, an exhausted 5xx) still has a chance as text.
    if (error instanceof TelegramApiError && error.status === 429) {
      throw error
    }
    console.warn(
      `Telegram sendWidget failed, falling back to text: ${
        error instanceof Error ? truncate(error.message, 200) : error
      }`,
    )
    return false
  }
}

export async function sendInboundEmailTelegramNotification(
  notification: TelegramInboundNotification,
) {
  const replyMarkup = buildInboundEmailReplyMarkup(notification.messageId)
  const privateChat = isPrivateTelegramChat(notification.chatId)

  if (privateChat) {
    // Only the widget *build* may fall back to text; once a request has been
    // made, transient failures propagate so the caller logs a real failure
    // instead of paying for a second, equally throttled call.
    let payload: ReturnType<typeof buildTelegramEmailWidgetPayload> | null =
      null
    try {
      payload = buildTelegramEmailWidgetPayload(notification)
    } catch (error) {
      console.warn('Telegram widget build failed, using text', error)
    }

    if (
      payload?.html &&
      (await sendTelegramWidget(
        notification.chatId,
        payload.html,
        payload.caption,
        replyMarkup,
      ))
    ) {
      logNotification(notification, 'widget')
      return true
    }
  }

  const text = buildInboundEmailTelegramMessage(notification)
  const sent = await sendTelegramMessage(notification.chatId, text, replyMarkup)
  if (sent) {
    logNotification(notification, privateChat ? 'text_fallback' : 'text')
  }
  return sent
}

/**
 * One line per delivery attempt so a missing push can be traced back to a mail:
 * grep `inbound_notification_sent` for successes and `telegram_notification` for
 * failures.
 */
function logNotification(
  notification: TelegramInboundNotification,
  mode: 'widget' | 'text' | 'text_fallback',
) {
  console.info('[telegram] inbound_notification_sent', {
    mode,
    messageId: notification.messageId ?? null,
    emailAddress: notification.emailAddress,
  })
}
