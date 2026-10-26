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
                : 'conic-gradient(var(--color-kumo-fill) 0 100%)',
          }}
        >
          <div className="flex size-[76px] flex-col items-center justify-center rounded-full bg-kumo-base">
            <strong className="numeric text-lg font-semibold text-kumo-strong">
              {formatNumber(total)}
            </strong>
            <span className="text-xs text-kumo-placeholder">{totalLabel}</span>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-kumo-subtle">
              <i
                className="size-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              {segment.label}
            </span>
            <span className="numeric text-kumo-default">
              {formatNumber(segment.value)}
              <span className="ml-1 text-xs text-kumo-placeholder">
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
