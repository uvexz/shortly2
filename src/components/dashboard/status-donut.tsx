import { formatNumber } from '@/lib/format'

type Segment = {
  label: string
  value: number
  color: string
}

export function StatusDonut({
  segments,
  totalLabel = '合计',
}: {
  segments: Segment[]
  totalLabel?: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  let cursor = 0
  const gradient = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor
      const size = (segment.value / Math.max(1, total)) * 100
      cursor += size
      return `${segment.color} ${start}% ${cursor}%`
    })
    .join(', ')

  return (
    <div>
      <div className="flex items-center justify-center">
        <div
          className="relative flex size-32 items-center justify-center rounded-full"
          style={{
            background:
              total > 0
                ? `conic-gradient(${gradient})`
                : 'conic-gradient(#e5e5e5 0 100%)',
          }}
        >
          <div className="flex size-[76px] flex-col items-center justify-center rounded-full bg-white">
            <strong className="numeric text-base font-semibold text-neutral-900">
              {formatNumber(total)}
            </strong>
            <span className="text-[10px] text-neutral-400">{totalLabel}</span>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-xs">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-neutral-500">
              <i
                className="size-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              {segment.label}
            </span>
            <span className="numeric text-neutral-700">
              {formatNumber(segment.value)}
              <span className="ml-1 text-[10px] text-neutral-400">
                {total > 0
                  ? `${Math.round((segment.value / total) * 100)}%`
                  : '0%'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
