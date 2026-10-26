import { Pagination } from '@cloudflare/kumo'
import { formatNumber } from '@/lib/format'

export function PaginationBar({
  page,
  totalPages,
  totalCount,
  onPageChange,
  perPage,
  itemLabel = '条记录',
}: {
  page: number
  totalPages: number
  totalCount: number
  onPageChange: (page: number) => void
  perPage?: number
  itemLabel?: string
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-kumo-hairline px-4 py-3 text-kumo-placeholder sm:flex-row sm:items-center sm:justify-between">
      <span>
        共 {formatNumber(totalCount)} {itemLabel}
        {totalPages > 1 ? ` · 第 ${page} / ${totalPages} 页` : ''}
      </span>
      {totalPages > 1 ? (
        <Pagination
          page={page}
          setPage={(nextPage) => onPageChange(Math.max(1, nextPage))}
          totalCount={totalCount}
          perPage={perPage}
          controls="simple"
        />
      ) : null}
    </div>
  )
}
