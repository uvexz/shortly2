import { deflateSync } from 'node:zlib'

/** Bot API 10.4 widget limits. Keep a margin below 4096 (Node zlib is a few bytes off). */
const MAX_HTML_BYTES = 32 * 1024
const MAX_COMPRESSED_BYTES = 3800
const MAX_CAPTION_LENGTH = 1000
const MAX_LINK_LENGTH = 256
const MAX_SOURCE_LENGTH = 200_000

const BODY_BUDGETS_WITH_CODES = [380, 320, 260, 200, 140, 80, 0]
const BODY_BUDGETS_WITHOUT_CODES = [620, 540, 460, 380, 300, 220, 140, 0]

const CODE_TOKEN_PATTERN = /(?<![A-Za-z0-9])([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g
const URL_OR_EMAIL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g
const CODE_KEYWORD_PATTERN =
  /(?:验证码|校验码|动态码|确认码|激活码|登录码|安全码|认证码|一次性密码|临时密码|\bverification\b|\bpasscode\b|\bsecurity\s+code\b|\bone[\s-]*time\b|\botp\b|\bcode\b|\bpin\b)/i
const TRAILING_URL_PUNCTUATION = /[.,;:!?)\]}'"。，；：！？）】》]+$/

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  cent: '¢',
  copy: '©',
  deg: '°',
  divide: '÷',
  euro: '€',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  pound: '£',
  quot: '"',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  sect: '§',
  times: '×',
  trade: '™',
  yen: '¥',
}

export type TelegramEmailWidgetInput = {
  emailAddress: string
  from: string
  fromName?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  attachmentsCount?: number
  date?: string | null
}

export type TelegramEmailWidgetPayload = {
  /** Widget HTML, or null when it cannot fit the Bot API limits (caller falls back to text). */
  html: string | null
  /** Plain-text caption used under the widget (also the fallback summary in old clients). */
  caption: string
}

type WidgetBody = {
  html: string
  hasBody: boolean
  truncated: boolean
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1))}…`
    : value
}

function singleLine(value: string | null | undefined, fallback = ''): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function decodeEntity(entity: string): string {
  if (entity.startsWith('#')) {
    const hex = entity[1]?.toLowerCase() === 'x'
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
      return String.fromCodePoint(codePoint)
    }
    return ''
  }
  return NAMED_ENTITIES[entity.toLowerCase()] ?? `&${entity};`
}

const HREF_PATTERN = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'section',
  'article',
  'header',
  'footer',
  'table',
  'ul',
  'ol',
  'pre',
])

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) =>
    decodeEntity(entity),
  )
}

function extractHref(tag: string): string {
  const match = HREF_PATTERN.exec(tag)
  if (!match) return ''
  return decodeEntities(match[1] ?? match[2] ?? '').trim()
}

/**
 * Linear HTML-to-text pass: no regex spans the whole document, so malformed
 * mail (unclosed anchors, thousands of `<a href="`) cannot backtrack.
 * Anchor URLs are kept in the text so the widget can linkify them.
 */
function htmlToText(html: string): string {
  const lower = html.toLowerCase()
  let text = ''
  let index = 0

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)
    if (tagStart < 0) {
      text += html.slice(index)
      break
    }
    text += html.slice(index, tagStart)

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4)
      if (commentEnd < 0) break
      index = commentEnd + 3
      continue
    }

    const next = html[tagStart + 1]
    if (!next || !/[A-Za-z!/?]/.test(next)) {
      text += '<'
      index = tagStart + 1
      continue
    }

    const tagEnd = html.indexOf('>', tagStart + 1)
    if (tagEnd < 0) break
    const rawTag = html.slice(tagStart + 1, tagEnd).trim()
    const name = /^\/?\s*([A-Za-z0-9-]+)/.exec(rawTag)?.[1]?.toLowerCase() ?? ''
    const closing = rawTag.startsWith('/')

    if (
      !closing &&
      (name === 'script' || name === 'style' || name === 'head')
    ) {
      const close = lower.indexOf(`</${name}`, tagEnd + 1)
      if (close < 0) break
      const closeEnd = html.indexOf('>', close)
      index = closeEnd < 0 ? html.length : closeEnd + 1
      continue
    }

    if (name === 'br') text += '\n'
    else if (closing && BLOCK_TAGS.has(name)) text += '\n'
    else if (name === 'a' && !closing) {
      const href = extractHref(rawTag)
      if (/^https?:\/\//i.test(href)) text += ` ${href} `
    }

    index = tagEnd + 1
  }

  return decodeEntities(text)
}

function normalizeText(value: string): string {
  return value
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\v\f\u2028\u2029]/g, ' ')
    .replace(/[ \u00a0]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Plain-text body: `text` when present, otherwise a readable HTML-to-text pass. */
export function extractEmailText(
  text: string | null | undefined,
  html: string | null | undefined,
): string {
  const plain = normalizeText((text ?? '').slice(0, MAX_SOURCE_LENGTH))
  if (plain) return plain
  return normalizeText(htmlToText((html ?? '').slice(0, MAX_SOURCE_LENGTH)))
}

/**
 * Suspicious one-time codes: a standalone 4-8 character token that contains at
 * least one digit (all digits, or digits mixed with letters). Tokens near words
 * like "code" / "验证码" rank higher; years, currency-like values and hashes are
 * penalised. Returns at most three unique candidates.
 */
export function extractVerificationCodes(
  subject: string,
  body: string,
): string[] {
  if (!subject && !body) return []

  const subjectText = subject.slice(0, 500)
  const combined = `${subjectText}\n${body.slice(0, MAX_SOURCE_LENGTH)}`
  const scrubbed = combined.replace(URL_OR_EMAIL_PATTERN, ' ')
  const subjectScrubbed = subjectText.replace(URL_OR_EMAIL_PATTERN, ' ')
  const candidates = new Map<
    string,
    { code: string; score: number; index: number }
  >()

  const tokenPattern = new RegExp(CODE_TOKEN_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(scrubbed))) {
    const code = match[1]
    if (!/\d/.test(code)) continue

    const index = match.index
    const before = scrubbed.slice(Math.max(0, index - 90), index)
    const after = scrubbed.slice(index + code.length, index + code.length + 90)
    const keywordBefore = CODE_KEYWORD_PATTERN.test(before)
    const keywordAfter = CODE_KEYWORD_PATTERN.test(after)
    const pureDigits = /^\d+$/.test(code)
    const hasLetter = /[A-Za-z]/.test(code)

    // Base score favours 5-8 characters; 4-character tokens need context.
    let score = code.length >= 5 ? 1 : 0.5
    if (hasLetter) score += 0.5
    if (keywordBefore) score += 4
    else if (keywordAfter) score += 2
    if (subjectScrubbed.includes(code)) score += 2

    if (pureDigits && code.length === 4) {
      const year = Number(code)
      if (year >= 1900 && year <= 2099) {
        // Years are everywhere; keep one only when the keyword is right next
        // to it or it is in the subject, not merely somewhere in the window.
        const tightBefore = scrubbed.slice(Math.max(0, index - 24), index)
        const tightAfter = scrubbed.slice(index + 4, index + 28)
        const tightKeyword =
          CODE_KEYWORD_PATTERN.test(tightBefore) ||
          CODE_KEYWORD_PATTERN.test(tightAfter)
        if (!tightKeyword && !subjectScrubbed.includes(code)) score -= 6
      }
    }
    if (!keywordBefore && !keywordAfter && /^\d0+$/.test(code)) score -= 3
    if (scrubbed[index - 1] === '#') score -= 4
    if (/[¥$€£%]/.test(scrubbed[index - 1] ?? '')) score -= 3
    if (/[¥$€£%]/.test(scrubbed[index + code.length] ?? '')) score -= 3

    if (score < 1) continue

    const key = code.toLowerCase()
    const existing = candidates.get(key)
    if (!existing || score > existing.score) {
      candidates.set(key, { code, score, index })
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((candidate) => candidate.code)
}

function trimUrl(value: string): string {
  return value.replace(TRAILING_URL_PUNCTUATION, '')
}

function renderUrl(rawUrl: string): string {
  const url = trimUrl(rawUrl)
  if (!url) return ''

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return escapeHtml(url)
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.href.length > MAX_LINK_LENGTH
  ) {
    return escapeHtml(url)
  }

  const label = url.length > 64 ? `${url.slice(0, 46)}…${url.slice(-14)}` : url
  const trailing = rawUrl.slice(url.length)
  return `<a href="${escapeHtml(parsed.href)}">${escapeHtml(label)}</a>${escapeHtml(trailing)}`
}

function bodyToHtml(text: string): string {
  let result = ''
  let lastIndex = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0
    result += escapeHtml(text.slice(lastIndex, index)).replace(/\n/g, '<br>')
    result += renderUrl(match[0])
    lastIndex = index + match[0].length
  }
  result += escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br>')
  return result
}

function cutBody(text: string, limit: number): WidgetBody {
  if (!text) return { html: '', hasBody: false, truncated: false }
  if (text.length <= limit) {
    return { html: bodyToHtml(text), hasBody: true, truncated: false }
  }

  const slice = text.slice(0, limit)
  const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
  let cut = (breakAt >= limit * 0.6 ? slice.slice(0, breakAt) : slice).trimEnd()
  // Never linkify a URL whose tail was cut off.
  cut = cut.replace(/https?:\/\/\S*$/, '').trimEnd()
  return { html: bodyToHtml(cut), hasBody: Boolean(cut), truncated: true }
}

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatReceivedAt(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return DATE_FORMATTER.format(date)
}

function senderText(input: TelegramEmailWidgetInput): string {
  const name = singleLine(input.fromName)
  const address = singleLine(input.from)
  if (name && address) return `${name} <${address}>`
  return address || name || '(未知发件人)'
}

function renderWidgetHtml(params: {
  mailbox: string
  subject: string
  sender: string
  time: string
  attachmentLabel: string
  codes: string[]
  body: WidgetBody
}): string {
  const codePanel = params.codes.length
    ? `<div class="c"><div class="cl">疑似验证码 · 点按复制</div><div class="cr">${params.codes
        .map(
          (code) =>
            `<button class="b" data-v="${escapeHtml(code)}">${escapeHtml(code)}</button>`,
        )
        .join('')}</div><div class="h" id="cp"></div></div>`
    : ''

  const truncatedHint =
    params.body.truncated && params.body.hasBody
      ? '<div class="n">正文较长，仅显示部分；点下方「查看邮件详情」看全文。</div>'
      : ''

  const bodyBlock = params.body.hasBody
    ? `<div class="hr"></div><div class="x">${params.body.html}</div>`
    : params.body.truncated
      ? '<div class="hr"></div><div class="n">（正文已省略，请查看邮件详情）</div>'
      : '<div class="hr"></div><div class="n">（无正文）</div>'

  const script = params.codes.length
    ? `<script>(function(){var T=window.TelegramWidget||null,E=document.getElementById('cp'),bs=document.querySelectorAll('.b');function done(v){try{if(T&&T.copyText){T.copyText(v);if(T.HapticFeedback)T.HapticFeedback.notificationOccurred('success')}else if(navigator.clipboard){navigator.clipboard.writeText(v)}if(E){E.textContent='已复制 '+v;setTimeout(function(){E.textContent=''},1600)}}catch(e){if(E)E.textContent='复制失败，请长按选择文本'}}for(var i=0;i<bs.length;i++){bs[i].onclick=function(){done(this.dataset.v||'')}}})()</script>`
    : ''

  return `<style>.w{padding:0 0 4px;display:flex;flex-direction:column;gap:9px;color:var(--tg-theme-text-color);font-size:var(--tg-text-font-size,15px);line-height:var(--tg-text-line-height,1.35);word-break:break-word;user-select:text;-webkit-user-select:text}.t{display:flex;align-items:center;gap:7px;color:var(--tg-theme-hint-color);font-size:12px;user-select:none;-webkit-user-select:none}.d{width:7px;height:7px;border-radius:50%;background:var(--tg-theme-button-color);flex:none}.to{margin-left:auto;max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.s{font-size:16px;font-weight:600;line-height:1.32}.m{color:var(--tg-theme-hint-color);font-size:13px}.c{padding:9px 10px;border-radius:10px;background:var(--tg-theme-secondary-bg-color);user-select:none;-webkit-user-select:none}.cl{color:var(--tg-theme-hint-color);font-size:12px;margin-bottom:6px}.cr{display:flex;flex-wrap:wrap;gap:6px}.b{padding:6px 9px;border:1px solid var(--tg-theme-button-color);border-radius:8px;background:transparent;color:var(--tg-theme-button-color);font-family:ui-monospace,monospace;font-size:18px;font-weight:600;letter-spacing:.08em;line-height:1.1}.b:active{background:var(--tg-theme-bg-color)}.h{color:var(--tg-theme-hint-color);font-size:12px}.hr{height:1px;background:var(--tg-theme-section-separator-color)}.x{font-size:13px;line-height:1.5;white-space:pre-wrap}.x a{color:var(--tg-theme-link-color);text-decoration:underline}.n{color:var(--tg-theme-hint-color);font-size:12px}.f{display:flex;justify-content:space-between;gap:8px;color:var(--tg-theme-hint-color);font-size:12px;padding-bottom:max(6px,env(safe-area-inset-bottom));user-select:none;-webkit-user-select:none}</style><div class="w"><div class="t"><span class="d"></span><span>新邮件</span><span class="to">${escapeHtml(params.mailbox)}</span></div><div class="s">${escapeHtml(params.subject)}</div><div class="m">${escapeHtml(params.sender)}</div>${codePanel}${truncatedHint}${bodyBlock}<div class="f"><span>${escapeHtml(params.time)}</span><span>${escapeHtml(params.attachmentLabel)}</span></div></div>${script}`
}

function fitsWidgetLimits(html: string): boolean {
  const bytes = new TextEncoder().encode(html)
  if (bytes.byteLength > MAX_HTML_BYTES) return false
  return deflateSync(bytes, { level: 9 }).byteLength <= MAX_COMPRESSED_BYTES
}

function buildCaption(
  input: TelegramEmailWidgetInput,
  codes: string[],
): string {
  const lines = [
    '📩 新邮件',
    `发件人：${truncate(senderText(input), 120)}`,
    `主题：${truncate(singleLine(input.subject, '(无主题)'), 120)}`,
    `邮箱：${truncate(singleLine(input.emailAddress, '—'), 80)}`,
  ]
  if (codes.length) lines.push(`疑似验证码：${codes.join(' / ')}`)
  if ((input.attachmentsCount ?? 0) > 0) {
    lines.push(`附件：${input.attachmentsCount} 个`)
  }
  return truncate(lines.join('\n'), MAX_CAPTION_LENGTH)
}

function buildWidget(
  input: TelegramEmailWidgetInput,
  bodyText: string,
  codes: string[],
): string | null {
  const mailbox = truncate(singleLine(input.emailAddress, '—'), 80)
  const subject = truncate(singleLine(input.subject, '(无主题)'), 160)
  const sender = truncate(senderText(input), 160)
  const time = formatReceivedAt(input.date)
  const attachments = input.attachmentsCount ?? 0
  const budgets = codes.length
    ? BODY_BUDGETS_WITH_CODES
    : BODY_BUDGETS_WITHOUT_CODES

  for (const budget of budgets) {
    const body = cutBody(bodyText, budget)
    const html = renderWidgetHtml({
      mailbox,
      subject,
      sender,
      time,
      attachmentLabel: attachments > 0 ? `📎 ${attachments} 个附件` : '',
      codes,
      body,
    })
    if (fitsWidgetLimits(html)) return html
  }

  return null
}

/**
 * Builds the private-chat notification widget and its caption.
 * Returns `html: null` when even the minimal widget exceeds the Bot API size
 * limits, so the caller can fall back to the plain-text notification.
 */
export function buildTelegramEmailWidgetPayload(
  input: TelegramEmailWidgetInput,
): TelegramEmailWidgetPayload {
  const bodyText = extractEmailText(input.text, input.html)
  const codes = extractVerificationCodes(input.subject ?? '', bodyText)
  return {
    html: buildWidget(input, bodyText, codes),
    caption: buildCaption(input, codes),
  }
}
