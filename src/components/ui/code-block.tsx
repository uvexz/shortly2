import { CopyButton } from '@/components/ui/copy-button'

export function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-neutral-950">
      {title ? (
        <div className="border-b border-white/10 px-4 py-2.5 text-[10px] font-medium text-neutral-400">
          {title}
        </div>
      ) : null}
      <div className="absolute right-2 top-2 z-10">
        <CopyButton
          value={code}
          successMessage="代码已复制"
          className="text-neutral-300 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 pr-12 font-mono text-[11px] leading-5 text-neutral-200 scrollbar-thin">
        {code}
      </pre>
    </div>
  )
}
