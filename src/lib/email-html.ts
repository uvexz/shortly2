import type { TempMessageDetail } from '@/lib/api-types'

/**
 * HTML email is rendered in a sandboxed iframe without allow-scripts, so this
 * sanitizer is defense-in-depth rather than the only safety boundary.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}

export function buildEmailIframeSrcDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><base target="_blank"/><style>
    html,body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#171717;font-size:14px;line-height:1.65;word-break:break-word;}
    img{max-width:100%;height:auto;} a{color:#171717;} pre{white-space:pre-wrap;} table{max-width:100%;}
  </style></head><body>${sanitizeEmailHtml(html)}</body></html>`
}

export function buildEmailSource(detail: TempMessageDetail): string {
  const headerLines = detail.headers.length
    ? detail.headers.map((header) => `${header.name}: ${header.value}`)
    : [
        `From: ${detail.fromName ? `${detail.fromName} <${detail.from}>` : detail.from}`,
        `To: ${detail.mailboxEmailAddress}`,
        `Subject: ${detail.subject || '(no subject)'}`,
        `Date: ${detail.receivedAt}`,
        detail.messageId ? `Message-ID: ${detail.messageId}` : '',
      ].filter(Boolean)

  const body = detail.text || detail.html || '(empty message)'
  return `${headerLines.join('\n')}\n\n${body}`
}

export function getSenderLabel(from: string, fromName: string | null): string {
  return fromName?.trim() || from
}
