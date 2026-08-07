// 학교 허브(/schools) — IA 개편으로 신설된 학교 목록 허브.
// GET /schools + 학교별 GET /schools/{id}/ledger 요약(종사자수·인원대조)을 합쳐
// 검색/학교급 필터/정렬/CSV/페이지네이션(useTableQuery) + 표·카드 토글을 제공.
// 행 클릭 → /schools/{id} 상세. 라우팅 배선은 리드 담당.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, LayoutGrid, List, X } from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, Pagination, SortableTh, type ExportColumn } from '../components/table'
import { SchoolFormModal } from '../components/SchoolFormModal'
import { BulkUploadModal } from '../components/BulkUploadModal'
import '../styles/schoolhub.css'

type School = {
  id: string
  name: string
  email?: string
  address?: string
  is_private?: boolean
  education_count?: number | null
  school_level?: string
  principal?: string
  supervisor?: string
  manager?: string
  inspection_agency?: string
}
type Ledger = {
  worker_total: number
  headcount_mismatch: boolean
  workers: { part: string; count: number }[]
}
type Row = {
  school: School
  total: number | null // null = 대장 조회 실패
  mismatch: boolean
}

const LEVELS = ['유', '초', '중', '고', '기타']
const LEVEL_ORDER: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }

const HUB_FILTERS: FilterDef<Row>[] = [
  {
    key: 'level',
    label: '학교급',
    options: LEVELS.map((l) => ({ value: l, label: l })),
    accessor: (r) => r.school.school_level ?? '',
  },
  {
    key: 'mismatch',
    label: '인원대조',
    options: [
      { value: 'y', label: '불일치' },
      { value: 'n', label: '일치' },
    ],
    accessor: (r) => (r.mismatch ? 'y' : 'n'),
  },
]
const HUB_SORTS = {
  level: (r: Row) => LEVEL_ORDER[r.school.school_level ?? ''] ?? 99,
  name: (r: Row) => r.school.name,
  principal: (r: Row) => r.school.principal ?? '',
  manager: (r: Row) => r.school.manager ?? '',
  workers: (r: Row) => r.total ?? -1,
}
const HUB_EXPORT: ExportColumn<Row>[] = [
  { header: '구분', value: (r) => r.school.school_level ?? '' },
  { header: '학교(기관)명', value: (r) => r.school.name },
  { header: '학교(기관)장', value: (r) => r.school.principal ?? '' },
  { header: '관리감독자', value: (r) => r.school.supervisor ?? '' },
  { header: '담당자', value: (r) => r.school.manager ?? '' },
  { header: '안전점검기관', value: (r) => r.school.inspection_agency ?? '' },
  { header: '종사자수', value: (r) => r.total ?? '' },
  { header: '인원대조', value: (r) => (r.mismatch ? '불일치' : '일치') },
]

export function SchoolsHub() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [modal, setModal] = useState<'create' | 'bulk' | null>(null)
  const [mode, setMode] = useState<'table' | 'cards'>('table')
  const [nameQ, setNameQ] = useState('') // 학교명 검색어
  const [regionQ, setRegionQ] = useState('') // 지역명 검색어(주소 부분일치)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const schools = await api<School[]>('/schools')
        const details = await Promise.all(
          (Array.isArray(schools) ? schools : []).map(async (s): Promise<Row> => {
            const led = await api<Ledger>(`/schools/${s.id}/ledger`).catch(() => null)
            return {
              school: s,
              total: led ? led.worker_total : null,
              mismatch: !!led?.headcount_mismatch,
            }
          }),
        )
        if (alive) { setRows(details); setLoading(false) }
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : '불러오기 실패'); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [reload])

  // 학교명·지역명 검색 (각각 독립된 입력창 — 둘 다 입력 시 AND 조건)
  const searchedRows = useMemo(() => {
    const nq = nameQ.trim().toLowerCase()
    const rq = regionQ.trim().toLowerCase()
    if (!nq && !rq) return rows
    return rows.filter(
      (r) =>
        (!nq || r.school.name.toLowerCase().includes(nq)) &&
        (!rq || (r.school.address ?? '').toLowerCase().includes(rq)),
    )
  }, [rows, nameQ, regionQ])

  const q = useTableQuery(searchedRows, {
    filters: HUB_FILTERS,
    sortAccessors: HUB_SORTS,
  })

  // 검색어가 바뀌면 1페이지로
  useEffect(() => { q.setPage(1) }, [nameQ, regionQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const colSpan = 9
  const activeLevel = q.filterValues.level ?? ''
  const filtering = !!(nameQ.trim() || regionQ.trim() || activeLevel || q.filterValues.mismatch)

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>학교</b></div>
      <div className="bar">
        <h2><Building2 size={20} /> 학교</h2>
        <div className="sp" />
        <button className="btn btn-ghost" onClick={() => setModal('bulk')}>엑셀 일괄 업로드</button>
        <button className="btn btn-primary" onClick={() => setModal('create')}>＋ 학교 등록</button>
      </div>

      {/* ===== 검색 · 학교급 필터 ===== */}
      <div className="shub-search">
        <div className="shub-field">
          <span className="lab">학교명</span>
          <div className="in">
            <input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="예: 한빛초등학교" />
            {nameQ && (
              <button className="shub-search-clear" onClick={() => setNameQ('')} aria-label="학교명 지우기">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="shub-field">
          <span className="lab">지역명</span>
          <div className="in">
            <input value={regionQ} onChange={(e) => setRegionQ(e.target.value)} placeholder="예: 순천시, 강남구" />
            {regionQ && (
              <button className="shub-search-clear" onClick={() => setRegionQ('')} aria-label="지역명 지우기">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="shub-seg" role="group" aria-label="학교급 선택">
          <button className={activeLevel === '' ? 'on' : ''} onClick={() => q.setFilter('level', '')}>전체</button>
          {LEVELS.map((l) => (
            <button key={l} className={activeLevel === l ? 'on' : ''} onClick={() => q.setFilter('level', l)}>{l}</button>
          ))}
        </div>
        <select
          className="lselect"
          value={q.filterValues.mismatch ?? ''}
          onChange={(e) => q.setFilter('mismatch', e.target.value)}
          aria-label="인원대조 필터"
        >
          <option value="">인원대조 전체</option>
          <option value="y">불일치</option>
          <option value="n">일치</option>
        </select>
        <div className="shub-search-hint">
          {filtering ? <>검색 결과 <b>{q.total}</b>교</> : <>등록 <b>{rows.length}</b>교</>}
        </div>
      </div>

      <div className="ledger">
        <div className="lh">
          <h2><Building2 size={18} /> 학교 목록</h2>
          <span className="pillx doing">{q.total}교</span>
          <div className="sp" />
          <div className="shub-toggle" role="group" aria-label="보기 전환">
            <button className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')} title="표형 보기"><List size={13} style={{ verticalAlign: -2 }} /> 표</button>
            <button className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')} title="카드형 보기"><LayoutGrid size={13} style={{ verticalAlign: -2 }} /> 카드</button>
          </div>
          <ExportButton q={q} columns={HUB_EXPORT} filename="학교목록" />
        </div>

        {mode === 'table' && (
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>No</th>
                  <SortableTh q={q} col="level">구분</SortableTh>
                  <SortableTh q={q} col="name">학교(기관)명</SortableTh>
                  <SortableTh q={q} col="principal">학교(기관)장</SortableTh>
                  <th>관리감독자</th>
                  <SortableTh q={q} col="manager">담당자</SortableTh>
                  <th>안전점검기관</th>
                  <SortableTh q={q} col="workers" className="c">종사자수</SortableTh>
                  <th className="c">인원대조</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={colSpan}><div className="tstate">불러오는 중…</div></td></tr>}
                {error && !loading && <tr><td colSpan={colSpan}><div className="tstate">오류: {error}</div></td></tr>}
                {!loading && !error && q.view.length === 0 && (
                  <tr><td colSpan={colSpan}><div className="tstate">{rows.length === 0 ? "등록된 학교(기관)가 없습니다. '학교 등록'으로 추가하세요." : '조건에 맞는 학교가 없습니다.'}</div></td></tr>
                )}
                {!loading && q.view.map((r, i) => (
                  <tr key={r.school.id} onClick={() => nav(`/schools/${r.school.id}`)}>
                    <td>{(q.page - 1) * q.pageSize + i + 1}</td>
                    <td>{r.school.school_level ? <span className="pillx doing">{r.school.school_level}</span> : '—'}</td>
                    <td><b>{r.school.name}</b></td>
                    <td>{r.school.principal || '—'}</td>
                    <td>{r.school.supervisor || '—'}</td>
                    <td>{r.school.manager || '—'}</td>
                    <td>{r.school.inspection_agency || '—'}</td>
                    <td className="c">{r.total != null ? <b>{r.total}명</b> : <span className="muted">—</span>}</td>
                    <td className="c">{r.mismatch ? <span className="pillx warn">불일치</span> : <span className="pillx ok">일치</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'cards' && (
          <div className="shub-cards">
            {loading && <div className="tstate">불러오는 중…</div>}
            {error && !loading && <div className="tstate">오류: {error}</div>}
            {!loading && !error && q.view.length === 0 && (
              <div className="tstate">{rows.length === 0 ? '등록된 학교(기관)가 없습니다.' : '조건에 맞는 학교가 없습니다.'}</div>
            )}
            {!loading && q.view.map((r) => (
              <div className="shub-scard" key={r.school.id} onClick={() => nav(`/schools/${r.school.id}`)}>
                <div className="top">
                  <div className="ava">{r.school.name.slice(0, 1)}</div>
                  <div>
                    <div className="nm">{r.school.name}</div>
                    {r.school.school_level && <span className="pillx doing">{r.school.school_level}</span>}
                  </div>
                </div>
                <div className="meta"><span>학교장</span><b>{r.school.principal || '—'}</b></div>
                <div className="meta"><span>담당자</span><b>{r.school.manager || '—'}</b></div>
                <div className="meta"><span>안전점검기관</span><b>{r.school.inspection_agency || '—'}</b></div>
                <div className="meta"><span>현업종사자</span><b>{r.total != null ? `${r.total}명` : '—'}</b></div>
                <div className="foot">
                  {r.mismatch ? <span className="pillx warn">인원 불일치</span> : <span className="pillx ok">인원 일치</span>}
                  {r.school.is_private ? <span className="pillx doing">사립</span> : <span className="pillx na">국공립</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination q={q} />
      </div>

      {modal === 'create' && (
        <SchoolFormModal onClose={() => setModal(null)} onSaved={() => setReload((r) => r + 1)} />
      )}
      {modal === 'bulk' && (
        <BulkUploadModal onClose={() => setModal(null)} onSaved={() => setReload((r) => r + 1)} />
      )}
    </div>
  )
}
