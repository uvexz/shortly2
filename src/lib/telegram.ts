import {
  buildTelegramEmailWidgetPayload,
  extractEmailText,
  extractVerificationCodes,
} from '@/lib/telegram-widget'

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
  const sender = notification.fromName?.trim()
    ? `${notification.fromName.trim()} &lt;${escapeHtml(notification.from)}&gt;`
    : escapeHtml(notification.from)
  const subject = escapeHtml(notification.subject?.trim() || '(无主题)')
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
    `邮箱：<code>${escapeHtml(notification.emailAddress)}</code>`,
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

const TELEGRAM_REQUEST_TIMEOUT_MS = 5000

/** Telegram private chat ids are positive; groups/supergroups are negative. */
function isPrivateTelegramChat(chatId: string): boolean {
  const id = Number(chatId)
  return Number.isFinite(id) && id > 0
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
  const token = getTelegramBotToken()
  if (!token || !chatId.trim()) {
    return false
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendWidget`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: chatId,
        html,
        caption,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    },
  )

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    console.warn(
      `Telegram sendWidget failed: ${response.status} ${truncate(message, 300)}`,
    )
    return false
  }

  return true
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const token = getTelegramBotToken()
  if (!token || !chatId.trim()) {
    return false
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Bound the call: Telegram being slow must never hang an inbound-email
      // delivery or a bind request.
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    },
  )

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${message}`.trim(),
    )
  }

  return true
}

export async function sendInboundEmailTelegramNotification(
  notification: TelegramInboundNotification,
) {
  const replyMarkup = buildInboundEmailReplyMarkup(notification.messageId)

  if (isPrivateTelegramChat(notification.chatId)) {
    try {
      const payload = buildTelegramEmailWidgetPayload(notification)
      if (
        payload.html &&
        (await sendTelegramWidget(
          notification.chatId,
          payload.html,
          payload.caption,
          replyMarkup,
        ))
      ) {
        return true
      }
    } catch (error) {
      console.warn('Telegram widget build/send failed, using text', error)
    }
  }

  const text = buildInboundEmailTelegramMessage(notification)
  return sendTelegramMessage(notification.chatId, text, replyMarkup)
}
