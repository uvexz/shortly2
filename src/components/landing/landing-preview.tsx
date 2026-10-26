import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Input } from '@cloudflare/kumo'
import { ArrowRight, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { usePublicDomains } from '@/hooks/settings'
import { copyText } from '@/lib/clipboard'

const SAMPLE_URL =
  'https://example.com/products/2026-summer-collection?utm_source=newsletter'

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

export function LandingPreview() {
  const domains = usePublicDomains()
  const [url, setUrl] = useState(SAMPLE_URL)
  const [slug, setSlug] = useState(() => toPreviewSlug(SAMPLE_URL))
  const [host, setHost] = useState('your-domain.com')

  useEffect(() => {
    setHost(
      domains.data?.shortDomains[0]?.host ??
        (typeof window !== 'undefined'
          ? window.location.host
          : 'your-domain.com'),
    )
  }, [domains.data?.shortDomains])

  const shortUrl = useMemo(() => `https://${host}/${slug}`, [host, slug])

  function handleGenerate() {
    const trimmed = url.trim() || SAMPLE_URL
    setUrl(trimmed)
    setSlug(toPreviewSlug(trimmed))
  }

  return (
    <div className="rounded-xl bg-kumo-base p-4 shadow-xs ring ring-kumo-line sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
            <Sparkle className="size-4" />
          </span>
          <div>
            <p className="text-base font-semibold text-kumo-strong">效果预览</p>
            <p className="mt-0.5 text-xs text-kumo-placeholder">
              示例数据 · 登录后生效
            </p>
          </div>
        </div>
        <Badge variant="secondary">示例</Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-kumo-subtle">
            长网址
          </label>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleGenerate()
            }}
            aria-label="示例长网址"
            className="w-full"
          />
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={handleGenerate}
          icon={<ArrowRight className="size-4" />}
        >
          生成示例短链
        </Button>
        <div className="flex items-center gap-2 rounded-lg bg-kumo-elevated p-2.5 ring ring-kumo-hairline">
          <CheckCircle className="size-4 shrink-0 text-kumo-success" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-kumo-default">
            {shortUrl}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void copyText(shortUrl, '示例链接已复制 · 登录后可创建真实短链接')
            }
          >
            复制
          </Button>
        </div>
        <p className="text-xs leading-4 text-kumo-placeholder">
          示例链接只用于展示效果，不会写入数据库。注册后可创建可管理、带访问记录的短链接。
        </p>
      </div>

      <div className="mt-5 border-t border-kumo-hairline pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-kumo-subtle">工作台预览</p>
          <span className="text-xs text-kumo-placeholder">示例数据</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['短链接', '128'],
            ['访问量', '12,438'],
            ['临时邮箱', '48'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg p-2.5 ring ring-kumo-hairline"
            >
              <p className="text-xs text-kumo-placeholder">{label}</p>
              <p className="numeric mt-1 text-base font-semibold text-kumo-strong">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2 rounded-lg p-3 ring ring-kumo-hairline">
          {[
            ['short.local/3f9k', '1,234'],
            ['short.local/a7d2', '856'],
            ['short.local/9kLm', '642'],
          ].map(([label, value], index) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate font-medium text-kumo-default">
                {label}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-kumo-fill">
                <span
                  className="block h-full rounded-full bg-kumo-brand"
                  style={{ width: `${100 - index * 22}%` }}
                />
              </span>
              <span className="numeric w-9 text-right text-kumo-placeholder">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
