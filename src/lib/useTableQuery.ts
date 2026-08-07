// 리스트 공통 UX — 헤드리스 훅. 검색·구분필터·정렬·페이지네이션을 클라이언트에서 처리.
// 데이터는 이미 페이지가 전량 로드하므로 서버 왕복 없이 즉시(라이브) 필터링.
// 접근자(searchFields/filters/sortAccessors)는 렌더 간 안정적이어야 함(모듈 상수 권장).
import { useEffect, useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

export interface FilterDef<T> {
  key: string
  label: string // 드롭다운 라벨 ("구분", "상태"). '전체' 옵션은 자동 추가.
  options: { value: string; label: string }[]
  accessor: (row: T) => string
}

export interface TableQueryConfig<T> {
  searchFields?: ((row: T) => unknown)[] // string 변환 후 부분일치(대소문자 무시)
  filters?: FilterDef<T>[]
  dateField?: (row: T) => string | null | undefined // 행 날짜(ISO/YYYY-MM-DD) — 앞 10자로 range 비교
  dateLabel?: string // 날짜 필터 라벨 (기본 "작성일")
  sortAccessors?: Record<string, (row: T) => string | number>
  initialSort?: { key: string; dir: SortDir } | null
  pageSize?: number // 기본 10
  searchPlaceholder?: string
  debounceMs?: number // 기본 200
}

export interface TableQuery<T> {
  view: T[] // 현재 페이지(필터+정렬+페이지 적용)
  all: T[] // 필터+정렬된 전체(페이지네이션 전) — 내보내기용
  total: number // 필터 후 총 건수(페이지네이션 전)
  searchable: boolean
  search: string
  setSearch: (s: string) => void
  filters: FilterDef<T>[]
  filterValues: Record<string, string> // '' = 전체
  setFilter: (key: string, value: string) => void
  hasDate: boolean
  dateLabel: string
  dateFrom: string
  dateTo: string
  setDateFrom: (s: string) => void
  setDateTo: (s: string) => void
  sort: { key: string; dir: SortDir } | null
  toggleSort: (key: string) => void
  sortableKeys: string[]
  page: number
  pageCount: number
  pageSize: number
  setPage: (p: number) => void
  searchPlaceholder?: string
}

function haystack<T>(row: T, fields: ((row: T) => unknown)[]): string {
  return fields.map((f) => String(f(row) ?? '')).join(' ').toLowerCase()
}

export function useTableQuery<T>(rows: T[], config: TableQueryConfig<T>): TableQuery<T> {
  const {
    searchFields = [],
    filters = [],
    sortAccessors = {},
    initialSort = null,
    pageSize = 10,
    searchPlaceholder,
    debounceMs = 200,
    dateField,
    dateLabel = '작성일',
  } = config

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // 검색어 디바운스
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim().toLowerCase()), debounceMs)
    return () => clearTimeout(id)
  }, [search, debounceMs])

  // 결과가 좁아지면 1페이지로
  useEffect(() => {
    setPage(1)
  }, [debounced, filterValues, dateFrom, dateTo])

  const filtered = useMemo(() => {
    let out = rows
    if (debounced && searchFields.length) {
      out = out.filter((r) => haystack(r, searchFields).includes(debounced))
    }
    for (const f of filters) {
      const val = filterValues[f.key]
      if (val) out = out.filter((r) => f.accessor(r) === val)
    }
    if (dateField && (dateFrom || dateTo)) {
      out = out.filter((r) => {
        const d = String(dateField(r) ?? '').slice(0, 10)
        if (!d) return false
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
        return true
      })
    }
    if (sort && sortAccessors[sort.key]) {
      const acc = sortAccessors[sort.key]
      const dir = sort.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const va = acc(a)
        const vb = acc(b)
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
        return String(va).localeCompare(String(vb), 'ko') * dir
      })
    }
    return out
    // 접근자는 안정적이라고 가정 → 데이터/입력 상태에만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, debounced, filterValues, dateFrom, dateTo, sort])

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const view = useMemo(
    () => filtered.slice((current - 1) * pageSize, current * pageSize),
    [filtered, current, pageSize],
  )

  function setFilter(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }))
  }

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  return {
    view,
    all: filtered,
    total,
    searchable: searchFields.length > 0,
    search,
    setSearch,
    filters,
    filterValues,
    setFilter,
    hasDate: !!dateField,
    dateLabel,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    sort,
    toggleSort,
    sortableKeys: Object.keys(sortAccessors),
    page: current,
    pageCount,
    pageSize,
    setPage,
    searchPlaceholder,
  }
}
