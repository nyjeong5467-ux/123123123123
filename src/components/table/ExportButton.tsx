// CSV 내보내기 버튼 — 현재 필터·정렬된 전체 집합(q.all, 현재 페이지 아님)을 내보냄.
import { Download } from 'lucide-react'
import { downloadCsv } from '../../lib/csv'
import type { TableQuery } from '../../lib/useTableQuery'

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number
}

export function ExportButton<T>({
  q,
  columns,
  filename,
}: {
  q: TableQuery<T>
  columns: ExportColumn<T>[]
  filename: string
}) {
  function onExport() {
    const headers = columns.map((c) => c.header)
    const rows = q.all.map((r) => columns.map((c) => c.value(r)))
    downloadCsv(filename, headers, rows)
  }
  return (
    <button
      className="btn btn-ghost"
      onClick={onExport}
      disabled={q.total === 0}
      title="현재 필터 결과를 CSV로 내보내기"
    >
      <Download size={15} /> 내보내기
    </button>
  )
}
