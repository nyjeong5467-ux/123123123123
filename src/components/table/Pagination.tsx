// 리스트 하단 푸터 — "총 N건 · 범위" + 페이지 이동(2페이지 이상일 때만). q 하나만 소비.
import type { TableQuery } from '../../lib/useTableQuery'

function windowPages(current: number, count: number): number[] {
  const span = 2
  const start = Math.max(1, current - span)
  const end = Math.min(count, current + span)
  const out: number[] = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

export function Pagination<T>({ q }: { q: TableQuery<T> }) {
  const { page, pageCount, total, pageSize } = q
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="lfoot">
      <span className="lcount">
        총 <b>{total}</b>건{total > 0 && ` · ${from}–${to}`}
      </span>
      {pageCount > 1 && (
        <div className="pager">
          <button className="pgbtn" disabled={page <= 1} onClick={() => q.setPage(page - 1)} aria-label="이전">
            ‹
          </button>
          {windowPages(page, pageCount).map((p) => (
            <button
              key={p}
              className={'pgbtn' + (p === page ? ' active' : '')}
              onClick={() => q.setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="pgbtn"
            disabled={page >= pageCount}
            onClick={() => q.setPage(page + 1)}
            aria-label="다음"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
