import { useState } from 'react'
import { Button } from '@cloudflare/kumo'
import { Check, Copy } from '@phosphor-icons/react'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

export function CopyButton({
  value,
  label,
  successMessage = '已复制',
  variant = 'ghost',
  className,
  showLabel = false,
}: {
  value: string
  label?: string
  successMessage?: string
  variant?: 'ghost' | 'secondary' | 'outline'
  className?: string
  showLabel?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const ok = await copyText(value, successMessage)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleCopy}
      aria-label={label ?? '复制'}
      title={label ?? '复制'}
      className={cn(showLabel ? 'gap-1.5' : 'size-8 p-0', className)}
      icon={
        copied ? (
          <Check className="size-3.5" weight="bold" />
        ) : (
          <Copy className="size-3.5" />
        )
      }
    >
      {showLabel ? (copied ? '已复制' : (label ?? '复制')) : null}
    </Button>
  )
}
