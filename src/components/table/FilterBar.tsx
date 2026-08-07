// 리스트 헤더용 필터바 — 검색 인풋(있을 때) + 구분 드롭다운(들). q 하나만 소비.
import { Search } from 'lucide-react'
import type { TableQuery } from '../../lib/useTableQuery'

export function FilterBar<T>({ q }: { q: TableQuery<T> }) {
  if (!q.searchable && q.filters.length === 0 && !q.hasDate) return null
  return (
    <div className="lbar">
      {q.searchable && (
        <div className="lsearch">
          <Search size={15} />
          <input
            value={q.search}
            onChange={(e) => q.setSearch(e.target.value)}
            placeholder={q.searchPlaceholder ?? '검색'}
          />
        </div>
      )}
      {q.filters.map((f) => (
        <select
          key={f.key}
          className="lselect"
          value={q.filterValues[f.key] ?? ''}
          onChange={(e) => q.setFilter(f.key, e.target.value)}
        >
          <option value="">{f.label} 전체</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {q.hasDate && (
        <div className="ldrange">
          <span className="ldrange-lab">{q.dateLabel}</span>
          <input type="date" className="ldate" value={q.dateFrom} onChange={(e) => q.setDateFrom(e.target.value)} />
          <span className="ldrange-sep">~</span>
          <input type="date" className="ldate" value={q.dateTo} onChange={(e) => q.setDateTo(e.target.value)} />
        </div>
      )}
    </div>
  )
}
