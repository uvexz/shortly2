import { CopyButton } from '@/components/ui/copy-button'

export function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-kumo-contrast">
      {title ? (
        <div className="border-b border-kumo-inverse/10 px-4 py-2.5 text-xs font-medium text-kumo-inverse/70">
          {title}
        </div>
      ) : null}
      <div className="absolute right-2 top-2 z-10">
        <CopyButton
          value={code}
          successMessage="代码已复制"
          className="text-kumo-inverse/80 hover:bg-kumo-inverse/10 hover:text-kumo-inverse"
        />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 pr-12 font-mono text-xs leading-5 text-kumo-inverse/85 scrollbar-thin">
        {code}
      </pre>
    </div>
  )
}
