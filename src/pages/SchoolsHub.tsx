// 학교 허브(/schools) — IA 개편으로 신설된 학교 목록 허브.
// GET /schools + 학교별 GET /schools/{id}/ledger 요약(종사자수·인원대조)을 합쳐
// 검색/학교급 필터/정렬/CSV/페이지네이션(useTableQuery) + 표·카드 토글을 제공.
// 행 클릭 → /schools/{id} 상세. 라우팅 배선은 리드 담당.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
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
  assigned_inspector_id?: string // 담당 점검자(로그인 ID 기준)
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

// ── 5대 업무 바로가기 상태 배지 ──
type Badge = { txt: string; cls: 'ok' | 'warn' | 'doing' | 'bad' | 'muted' }
type WorkBadges = { insp: Badge; risk: Badge; mus: Badge; comp: Badge }
type InspLite = { submitted_at?: string | null; signed_at?: string | null }
type StatusLite = { status: string }
type MusLite = { needs_review: number }
type CompSheetLite = { status?: string }
type CompDoc = Record<string, Record<string, CompSheetLite>>

const WORKS: { key: keyof WorkBadges | 'edu'; label: string; path: string }[] = [
  { key: 'insp', label: '안전점검', path: '/inspection' },
  { key: 'risk', label: '위험성평가', path: '/risk' },
  { key: 'mus', label: '근골격계', path: '/musculo' },
  { key: 'edu', label: '교육', path: '/education' },
  { key: 'comp', label: '이행점검', path: '/compliance' },
]

function deriveBadges(insp: InspLite[], risk: StatusLite[], mus: MusLite[], compSheet: CompSheetLite | undefined, ym: string): WorkBadges {
  const inspDone = insp.some((r) => ((r.submitted_at || r.signed_at || '') + '').slice(0, 7) === ym)
  const riskDoing = risk.filter((r) => r.status !== 'completed').length
  const review = mus.reduce((a, m) => a + (m.needs_review || 0), 0)
  return {
    insp: inspDone ? { txt: '이번 달 완료', cls: 'ok' } : { txt: '이번 달 미실시', cls: 'warn' },
    risk: riskDoing > 0 ? { txt: `진행 ${riskDoing}건`, cls: 'doing' } : risk.length > 0 ? { txt: '완료', cls: 'ok' } : { txt: '미작성', cls: 'muted' },
    mus: review > 0 ? { txt: `검수 ${review}건`, cls: 'bad' } : { txt: '특이사항 없음', cls: 'ok' },
    comp: compSheet ? (compSheet.status === 'submitted' ? { txt: '제출 완료', cls: 'ok' } : { txt: '작성 중', cls: 'doing' }) : { txt: '미작성', cls: 'muted' },
  }
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
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [modal, setModal] = useState<'create' | 'bulk' | null>(null)
  const [scope, setScope] = useState<'mine' | 'all'>('all') // 담당 학교 / 전체 학교
  const [scopeInit, setScopeInit] = useState(false)
  const [badges, setBadges] = useState<Record<string, WorkBadges>>({})
  const [nameQ, setNameQ] = useState('') // 학교명 입력값 (조회 전)
  const [regionQ, setRegionQ] = useState('') // 지역명 입력값 (조회 전)
  const [applied, setApplied] = useState({ name: '', region: '' }) // [조회]로 확정된 검색 조건

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

  // 담당 학교 여부 — 점검자(담당 배정 있음)는 '담당'이 기본, 관리자는 '전체'가 기본
  const myLogin = user?.login ?? ''
  const mineCount = useMemo(
    () => rows.filter((r) => r.school.assigned_inspector_id === myLogin).length,
    [rows, myLogin],
  )
  useEffect(() => {
    if (scopeInit || loading) return
    setScope(mineCount > 0 ? 'mine' : 'all')
    setScopeInit(true)
  }, [loading, mineCount, scopeInit])

  // 5대 업무 상태 배지 — 학교별 3개 API + 이행점검 조사지 문서 1회 병렬 조회 (실패 시 해당 배지만 생략)
  useEffect(() => {
    if (rows.length === 0) { setBadges({}); return }
    let alive = true
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const halfKey = `${now.getFullYear()}_${now.getMonth() + 1 <= 6 ? 'h1' : 'h2'}`
    ;(async () => {
      const compDoc = await api<{ doc: CompDoc }>('/ops/docs/compliance-sheets').catch(() => ({ doc: {} as CompDoc }))
      const pairs = await Promise.all(
        rows.map(async (r) => {
          const id = r.school.id
          const [insp, risk, mus] = await Promise.all([
            api<InspLite[]>(`/inspections?school_id=${id}`).catch(() => [] as InspLite[]),
            api<StatusLite[]>(`/risk?school_id=${id}`).catch(() => [] as StatusLite[]),
            api<MusLite[]>(`/musculo?school_id=${id}`).catch(() => [] as MusLite[]),
          ])
          return [id, deriveBadges(insp, risk, mus, compDoc.doc?.[id]?.[halfKey], ym)] as const
        }),
      )
      if (alive) setBadges(Object.fromEntries(pairs))
    })()
    return () => { alive = false }
  }, [rows])

  // 학교명·지역명 검색 — [조회] 버튼(또는 Enter)으로 확정된 조건 기준, 둘 다 입력 시 AND
  const searchedRows = useMemo(() => {
    const scoped = scope === 'mine' ? rows.filter((r) => r.school.assigned_inspector_id === myLogin) : rows
    const nq = applied.name.toLowerCase()
    const rq = applied.region.toLowerCase()
    if (!nq && !rq) return scoped
    return scoped.filter(
      (r) =>
        (!nq || r.school.name.toLowerCase().includes(nq)) &&
        (!rq || (r.school.address ?? '').toLowerCase().includes(rq)),
    )
  }, [rows, applied, scope, myLogin])

  const q = useTableQuery(searchedRows, {
    filters: HUB_FILTERS,
    sortAccessors: HUB_SORTS,
  })

  // 조회 실행 — 입력값을 검색 조건으로 확정하고 1페이지로
  const doSearch = () => {
    setApplied({ name: nameQ.trim(), region: regionQ.trim() })
    q.setPage(1)
  }

  const colSpan = scope === 'mine' ? 8 : 7 // 업무 바로가기 컬럼은 담당 학교에서만
  const activeLevel = q.filterValues.level ?? ''

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
            <input
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              placeholder="예: 한빛초등학교"
            />
            {nameQ && (
              <button
                className="shub-search-clear"
                onClick={() => { setNameQ(''); setApplied((a) => ({ ...a, name: '' })) }}
                aria-label="학교명 지우기"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="shub-field">
          <span className="lab">지역명</span>
          <div className="in">
            <input
              value={regionQ}
              onChange={(e) => setRegionQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              placeholder="예: 순천시, 강남구"
            />
            {regionQ && (
              <button
                className="shub-search-clear"
                onClick={() => { setRegionQ(''); setApplied((a) => ({ ...a, region: '' })) }}
                aria-label="지역명 지우기"
              >
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
        <button className="btn btn-primary shub-go" onClick={doSearch}>조회</button>
      </div>

      <div className="ledger">
        <div className="lh">
          <h2><Building2 size={18} /> 학교 목록</h2>
          <span className="pillx doing">{q.total}교</span>
          <div className="sp" />
          <div className="shub-toggle" role="group" aria-label="담당/전체 전환">
            <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')} title="내가 담당하는 학교만 보기">담당 학교{mineCount > 0 && ` ${mineCount}`}</button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} title="등록된 전체 학교 보기">전체 학교</button>
          </div>
          <ExportButton q={q} columns={HUB_EXPORT} filename="학교목록" />
        </div>

        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>No</th>
                <SortableTh q={q} col="level">구분</SortableTh>
                <SortableTh q={q} col="name">학교(기관)명</SortableTh>
                <SortableTh q={q} col="principal">학교(기관)장</SortableTh>
                <SortableTh q={q} col="manager">담당자</SortableTh>
                <SortableTh q={q} col="workers" className="c">종사자수</SortableTh>
                <th className="c">인원대조</th>
                {scope === 'mine' && <th>업무 바로가기</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={colSpan}><div className="tstate">불러오는 중…</div></td></tr>}
              {error && !loading && <tr><td colSpan={colSpan}><div className="tstate">오류: {error}</div></td></tr>}
              {!loading && !error && q.view.length === 0 && (
                <tr><td colSpan={colSpan}><div className="tstate">
                  {rows.length === 0
                    ? "등록된 학교(기관)가 없습니다. '학교 등록'으로 추가하세요."
                    : scope === 'mine' && mineCount === 0
                      ? '담당으로 배정된 학교가 없습니다. [전체 학교]로 전환해 보세요.'
                      : '조건에 맞는 학교가 없습니다.'}
                </div></td></tr>
              )}
              {!loading && q.view.map((r, i) => {
                const b = badges[r.school.id]
                return (
                  <tr key={r.school.id} onClick={() => nav(`/schools/${r.school.id}`)}>
                    <td>{(q.page - 1) * q.pageSize + i + 1}</td>
                    <td>{r.school.school_level ? <span className="pillx doing">{r.school.school_level}</span> : '—'}</td>
                    <td><b>{r.school.name}</b></td>
                    <td>{r.school.principal || '—'}</td>
                    <td>{r.school.manager || '—'}</td>
                    <td className="c">{r.total != null ? <b>{r.total}명</b> : <span className="muted">—</span>}</td>
                    <td className="c">{r.mismatch ? <span className="pillx warn">불일치</span> : <span className="pillx ok">일치</span>}</td>
                    {scope === 'mine' && (
                      <td>
                        <div className="shub-works-cell">
                          {WORKS.map((w) => {
                            const badge: Badge | undefined =
                              w.key === 'edu'
                                ? (r.mismatch ? { txt: '인원 불일치', cls: 'warn' } : { txt: '인원 일치', cls: 'ok' })
                                : b?.[w.key]
                            return (
                              <button
                                key={w.key}
                                className={'shub-w ' + (badge?.cls ?? 'muted')}
                                title={`${w.label} — ${badge?.txt ?? '상태 확인 중'}`}
                                onClick={(e) => { e.stopPropagation(); nav(`${w.path}?school=${r.school.id}`) }}
                              >
                                <i />{w.label}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

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
