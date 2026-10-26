import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '@cloudflare/kumo'
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
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 app-shadow sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
            <Sparkle className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">效果预览</p>
            <p className="mt-0.5 text-[10px] text-neutral-400">
              示例数据 · 登录后生效
            </p>
          </div>
        </div>
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-500">
          示例
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-medium text-neutral-500">
            长网址
          </label>
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleGenerate()
            }}
            aria-label="示例长网址"
          />
        </div>
        <Button
          variant="primary"
          className="h-10 w-full gap-2 text-xs"
          onClick={handleGenerate}
          icon={<ArrowRight className="size-3.5" />}
        >
          生成示例短链
        </Button>
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
          <CheckCircle className="size-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-700">
            {shortUrl}
          </span>
          <Button
            variant="secondary"
            className="h-7 px-2 text-[10px]"
            onClick={() =>
              void copyText(shortUrl, '示例链接已复制 · 登录后可创建真实短链接')
            }
          >
            复制
          </Button>
        </div>
        <p className="text-[10px] leading-4 text-neutral-400">
          示例链接只用于展示效果，不会写入数据库。注册后可创建可管理、带访问记录的短链接。
        </p>
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-medium text-neutral-500">工作台预览</p>
          <span className="text-[9px] text-neutral-400">示例数据</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['短链接', '128'],
            ['访问量', '12,438'],
            ['临时邮箱', '48'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-neutral-200 p-2.5"
            >
              <p className="text-[9px] text-neutral-400">{label}</p>
              <p className="numeric mt-1 text-sm font-semibold text-neutral-900">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
          {[
            ['short.local/3f9k', '1,234'],
            ['short.local/a7d2', '856'],
            ['short.local/9kLm', '642'],
          ].map(([label, value], index) => (
            <div key={label} className="flex items-center gap-2 text-[10px]">
              <span className="w-24 truncate font-medium text-neutral-700">
                {label}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <span
                  className="block h-full rounded-full bg-neutral-800"
                  style={{ width: `${100 - index * 22}%` }}
                />
              </span>
              <span className="numeric w-9 text-right text-neutral-400">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
