import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  EnvelopeSimple,
} from '@phosphor-icons/react'
import { usePublicDomains } from '@/hooks/settings'
import { copyText } from '@/lib/clipboard'

const SAMPLE_URL =
  'https://example.com/products/summer-preview?utm_source=newsletter&utm_campaign=launch'

function toPreviewSlug(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let value = hash >>> 0
  let slug = ''
  for (let index = 0; index < 6; index += 1) {
    slug = alphabet[value % alphabet.length] + slug
    value = Math.floor(value / alphabet.length)
  }
  return slug
}

type NormalizedUrl = { ok: true; value: string } | { ok: false; error: string }

function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: '请先粘贴一个网址。' }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    if (!parsed.hostname.includes('.')) {
      return {
        ok: false,
        error: '请输入完整的网址，例如 https://example.com/page。',
      }
    }
    return { ok: true, value: parsed.toString() }
  } catch {
    return { ok: false, error: '这个网址格式不对，请检查后再试。' }
  }
}

export function LandingPreview() {
  const domains = usePublicDomains()
  const [url, setUrl] = useState(SAMPLE_URL)
  const [slug, setSlug] = useState(() => toPreviewSlug(SAMPLE_URL))
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [hosts, setHosts] = useState({
    short: 'your-domain.com',
    mail: 'example.com',
  })
  const copyTimer = useRef<number | null>(null)

  useEffect(() => {
    const shortHost =
      domains.data?.shortDomains[0]?.host ||
      window.location.host ||
      'your-domain.com'
    const mailHost =
      domains.data?.emailDomains[0]?.host || shortHost || 'example.com'

    setHosts({ short: shortHost, mail: mailHost })
  }, [domains.data])

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const shortUrl = useMemo(
    () => `https://${hosts.short}/${slug}`,
    [hosts.short, slug],
  )
  const mailbox = `hello-k7qm@${hosts.mail}`

  function handleGenerate() {
    const result = normalizeUrl(url)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setError('')
    setCopied(false)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    setUrl(result.value)
    setSlug(toPreviewSlug(result.value))
  }

  async function handleCopy() {
    const success = await copyText(shortUrl, '示例链接已复制')
    if (!success) return

    setCopied(true)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="rounded-3xl bg-kumo-base p-4 shadow-sm ring-1 ring-kumo-line">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--text-color-kumo-brand)]" />
          <p className="text-sm font-medium text-kumo-strong">工作台预览</p>
        </div>
        <p className="text-xs text-kumo-placeholder">示例数据</p>
      </div>

      <div className="mt-4">
        <label
          htmlFor="landing-url"
          className="text-xs font-medium text-kumo-subtle"
        >
          长网址
        </label>
        <input
          id="landing-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            if (error) setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleGenerate()
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? 'preview-url-error preview-note' : 'preview-note'
          }
          className="focus-ring mt-2 h-10 w-full rounded-lg bg-kumo-elevated px-3 text-base text-kumo-default ring-1 ring-kumo-line transition-colors duration-300 ease-base placeholder:text-kumo-placeholder"
          placeholder="https://example.com/a-long-page"
        />
        {error ? (
          <p
            id="preview-url-error"
            role="alert"
            className="mt-2 text-sm text-kumo-danger text-pretty"
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleGenerate}
          className="focus-ring mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-kumo-contrast px-3 text-base font-semibold text-kumo-inverse transition duration-300 ease-base hover:bg-kumo-contrast/90 active:scale-[0.98]"
        >
          生成示例短链
          <ArrowRight className="size-4" />
        </button>
      </div>

      <div
        aria-live="polite"
        className="mt-3 flex items-center gap-2 rounded-lg bg-kumo-elevated p-2 ring-1 ring-kumo-line"
      >
        <CheckCircle className="size-4 shrink-0 text-kumo-success" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-kumo-default">
          {shortUrl}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="focus-ring flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-kumo-subtle transition duration-300 ease-base hover:text-kumo-strong active:scale-[0.98]"
          aria-label="复制示例短链接"
        >
          {copied ? (
            <Check className="size-3.5 text-kumo-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p
        id="preview-note"
        className="mt-2 text-xs text-kumo-placeholder text-pretty"
      >
        示例链接只用于展示效果，不会写入数据库。
      </p>

      <div className="mt-4 h-px bg-kumo-hairline" />

      <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm font-medium text-kumo-strong">临时邮箱</p>
        <p className="truncate font-mono text-xs text-kumo-subtle">{mailbox}</p>
      </div>

      <div className="mt-2 flex items-start gap-3 rounded-lg bg-kumo-elevated p-3 ring-1 ring-kumo-line">
        <EnvelopeSimple className="mt-0.5 size-4 shrink-0 text-kumo-subtle" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-kumo-strong">Resend</p>
            <p className="text-xs text-kumo-placeholder">刚刚</p>
          </div>
          <p className="mt-1 truncate text-sm text-kumo-default">
            Your verification code
          </p>
          <p className="mt-1 font-mono text-xs text-kumo-subtle">482 916</p>
        </div>
      </div>
    </div>
  )
}
