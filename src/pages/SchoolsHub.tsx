// 학교 허브(/schools) — IA 개편으로 신설된 학교 목록 허브.
// GET /schools + 담당 학교별 GET /schools/{id}/ledger 요약(종사자수·인원대조 — [060] 담당 한정)을 합쳐
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
import { CycleBanner, type WorkStats } from '../components/CycleBanner'
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
  total: number | null // null = 대장 조회 실패 또는 미조회(담당 외 학교 [060])
  mismatch: boolean
}

/* [060] 세션 캐시 — 탭 재진입 시 학교별 대장·배지 재조회 방지 (모듈 스코프, 새로고침 시 소멸).
   rows 캐시는 계정 기준, 배지 캐시는 rows 스냅샷(객체 동일성) 기준 — 학교 등록 등으로
   rows가 새로 조회되면 배지도 자동 재계산된다. */
let hubRowsCache: { login: string; rows: Row[] } | null = null
let hubBadgeCache: { forRows: Row[]; badges: Record<string, WorkBadges> } | null = null

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

// 배지 색은 2색 이진 표시 — 완료(초록) / 미완료(회색). 세부 상태는 txt(툴팁)로만 제공
function deriveBadges(insp: InspLite[], risk: StatusLite[], mus: MusLite[], compSheet: CompSheetLite | undefined, ym: string): WorkBadges {
  const inspDone = insp.some((r) => ((r.submitted_at || r.signed_at || '') + '').slice(0, 7) === ym)
  const riskDoing = risk.filter((r) => r.status !== 'completed').length
  const review = mus.reduce((a, m) => a + (m.needs_review || 0), 0)
  return {
    insp: inspDone ? { txt: '이번 달 완료', cls: 'ok' } : { txt: '이번 달 미실시', cls: 'muted' },
    risk: riskDoing > 0 ? { txt: `진행 ${riskDoing}건`, cls: 'muted' } : risk.length > 0 ? { txt: '완료', cls: 'ok' } : { txt: '미작성', cls: 'muted' },
    mus: mus.length === 0 ? { txt: '미작성', cls: 'muted' } : review > 0 ? { txt: `검수 ${review}건 대기`, cls: 'muted' } : { txt: '완료 · 검수 대기 없음', cls: 'ok' },
    comp: compSheet?.status === 'submitted' ? { txt: '제출 완료', cls: 'ok' } : { txt: compSheet ? '작성 중' : '미작성', cls: 'muted' },
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
  const [mgrQ, setMgrQ] = useState('') // 담당자 입력값 (전체 학교에서만 노출) [043]
  const [applied, setApplied] = useState({ name: '', region: '', manager: '' }) // [조회]로 확정된 검색 조건
  const [levelQ, setLevelQ] = useState('') // 학교급 선택값 (조회 전 — [조회] 클릭 시 반영)

  useEffect(() => {
    let alive = true
    const login = user?.login ?? ''
    // [060] 세션 캐시 적중 시 재조회 생략 — [reload]로 강제 갱신(학교 등록·일괄 업로드 후)
    if (reload === 0 && hubRowsCache && hubRowsCache.login === login) {
      setRows(hubRowsCache.rows)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const schools = await api<School[]>('/schools')
        const list = Array.isArray(schools) ? schools : []
        // [060] 대장 요약 조회를 담당 학교로 한정 — 전체 783교 학교별 조회 과부하 방지
        // (배지 집계 [038]과 동일 규칙: 담당 배정이 없는 계정은 기존대로 전체 조회)
        const mine = list.filter((s) => s.assigned_inspector_id === login)
        const targets = new Set((mine.length > 0 ? mine : list).map((s) => s.id))
        const details = await Promise.all(
          list.map(async (s): Promise<Row> => {
            if (!targets.has(s.id)) return { school: s, total: null, mismatch: false }
            const led = await api<Ledger>(`/schools/${s.id}/ledger`).catch(() => null)
            return {
              school: s,
              total: led ? led.worker_total : null,
              mismatch: !!led?.headcount_mismatch,
            }
          }),
        )
        // 기본 정렬: 학교명 가나다순
        details.sort((a, b) => a.school.name.localeCompare(b.school.name, 'ko'))
        if (alive) {
          hubRowsCache = { login, rows: details }
          setRows(details)
          setLoading(false)
        }
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : '불러오기 실패'); setLoading(false) }
      }
    })()
    return () => { alive = false }
    // user?.login은 세션 중 변하지 않음(로그아웃 시 페이지 이탈)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // 집계 대상은 담당 학교로 한정 (업무 바로가기 컬럼·배너 도넛 모두 담당 기준 — 전체 783교 조회는 과부하)
  useEffect(() => {
    if (rows.length === 0) { setBadges({}); return }
    // [060] 같은 rows 스냅샷이면 캐시 재사용 — 탭 재진입 시 담당 학교 3개 API 재조회 생략
    if (hubBadgeCache && hubBadgeCache.forRows === rows) { setBadges(hubBadgeCache.badges); return }
    const mine = rows.filter((r) => r.school.assigned_inspector_id === (user?.login ?? ''))
    const target = mine.length > 0 ? mine : rows
    let alive = true
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const halfKey = `${now.getFullYear()}_${now.getMonth() + 1 <= 6 ? 'h1' : 'h2'}`
    ;(async () => {
      const compDoc = await api<{ doc: CompDoc }>('/ops/docs/compliance-sheets').catch(() => ({ doc: {} as CompDoc }))
      const pairs = await Promise.all(
        target.map(async (r) => {
          const id = r.school.id
          const [insp, risk, mus] = await Promise.all([
            api<InspLite[]>(`/inspections?school_id=${id}`).catch(() => [] as InspLite[]),
            api<StatusLite[]>(`/risk?school_id=${id}`).catch(() => [] as StatusLite[]),
            api<MusLite[]>(`/musculo?school_id=${id}`).catch(() => [] as MusLite[]),
          ])
          return [id, deriveBadges(insp, risk, mus, compDoc.doc?.[id]?.[halfKey], ym)] as const
        }),
      )
      if (alive) {
        const map = Object.fromEntries(pairs)
        hubBadgeCache = { forRows: rows, badges: map }
        setBadges(map)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, user?.login])

  // 학교명·지역명·담당자 검색 — [조회] 버튼(또는 Enter)으로 확정된 조건 기준, 복수 입력 시 AND
  const searchedRows = useMemo(() => {
    const scoped = scope === 'mine' ? rows.filter((r) => r.school.assigned_inspector_id === myLogin) : rows
    const nq = applied.name.toLowerCase()
    const rq = applied.region.toLowerCase()
    const mq = applied.manager.toLowerCase()
    if (!nq && !rq && !mq) return scoped
    return scoped.filter(
      (r) =>
        (!nq || r.school.name.toLowerCase().includes(nq)) &&
        (!rq || (r.school.address ?? '').toLowerCase().includes(rq)) &&
        (!mq || (r.school.manager ?? '').toLowerCase().includes(mq)),
    )
  }, [rows, applied, scope, myLogin])

  const q = useTableQuery(searchedRows, {
    filters: HUB_FILTERS,
    sortAccessors: HUB_SORTS,
  })

  // 조회 실행 — 입력값·학교급 선택을 검색 조건으로 확정하고 1페이지로
  const doSearch = () => {
    setApplied({ name: nameQ.trim(), region: regionQ.trim(), manager: scope === 'all' ? mgrQ.trim() : '' })
    q.setFilter('level', levelQ)
    q.setPage(1)
  }

  const colSpan = scope === 'mine' ? 8 : 7 // 업무 바로가기 컬럼은 담당 학교에서만

  // 축약 배너용 — 현재 스코프의 안전점검 미방문(이번 달 미실시) 수. 배지 로드 전엔 null
  const inspUnvisited = useMemo(() => {
    if (Object.keys(badges).length === 0) return null
    const scoped = scope === 'mine' ? rows.filter((r) => r.school.assigned_inspector_id === myLogin) : rows
    return scoped.filter((r) => badges[r.school.id] && badges[r.school.id].insp.cls !== 'ok').length
  }, [rows, badges, scope, myLogin])

  // 배너 도넛용 — 담당 학교 기준 업무별 완료 수 (담당 배정 없으면 전체 학교 기준)
  const workStats = useMemo<WorkStats | null>(() => {
    if (Object.keys(badges).length === 0) return null
    const mineRows = rows.filter((r) => r.school.assigned_inspector_id === myLogin)
    const base = mineRows.length > 0 ? mineRows : rows
    const count = (f: (id: string) => boolean) => base.filter((r) => f(r.school.id)).length
    return {
      total: base.length,
      scopeLabel: mineRows.length > 0 ? '담당 학교' : '전체 학교',
      insp: count((id) => badges[id]?.insp.cls === 'ok'),
      risk: count((id) => badges[id]?.risk.cls === 'ok'),
      mus: count((id) => badges[id]?.mus.cls === 'ok'),
      comp: count((id) => badges[id]?.comp.cls === 'ok'),
    }
  }, [rows, badges, myLogin])

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>학교</b></div>
      <div className="bar">
        <h2><Building2 size={20} /> 학교</h2>
        <div className="sp" />
        <button className="btn btn-ghost" onClick={() => setModal('bulk')}>엑셀 일괄 업로드</button>
        <button className="btn btn-primary" onClick={() => setModal('create')}>＋ 학교 등록</button>
      </div>

      {/* ===== 이번 달 법정업무 축약 배너 (홈 연간 사이클 요약 — 읽기 전용) ===== */}
      <CycleBanner inspUnvisited={inspUnvisited} workStats={workStats} />

      {/* ===== 검색 · 학교급 필터 ===== */}
      <div className="shub-search">
        <div className="shub-field">
          <span className="lab">학교명</span>
          <div className="in">
            <input
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
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
        {scope === 'all' && (
          <div className="shub-field">
            <span className="lab">담당자</span>
            <div className="in">
              <input
                value={mgrQ}
                onChange={(e) => setMgrQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              />
              {mgrQ && (
                <button
                  className="shub-search-clear"
                  onClick={() => { setMgrQ(''); setApplied((a) => ({ ...a, manager: '' })) }}
                  aria-label="담당자 지우기"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="shub-seg" role="group" aria-label="학교급 선택">
          <button className={levelQ === '' ? 'on' : ''} onClick={() => setLevelQ('')}>전체</button>
          {LEVELS.map((l) => (
            <button key={l} className={levelQ === l ? 'on' : ''} onClick={() => setLevelQ(l)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-primary shub-go" onClick={doSearch}>조회</button>
      </div>

      <div className="ledger">
        <div className="lh">
          <h2><Building2 size={18} /> 학교 목록</h2>
          <span className="pillx doing">{q.total}교</span>
          <div className="sp" />
          {scope === 'mine' && (
            <span className="shub-legend" title="세부 상태(진행 건수·검수 대기 등)는 배지에 마우스를 올리면 표시됩니다">
              업무 바로가기: <i className="d-ok" /> 완료 <i className="d-mut" /> 미완료
            </span>
          )}
          <div className="shub-toggle" role="group" aria-label="담당/전체 전환">
            <button className={scope === 'mine' ? 'on' : ''} onClick={() => { setScope('mine'); setMgrQ(''); setApplied((a) => ({ ...a, manager: '' })) }} title="내가 담당하는 학교만 보기">담당 학교</button>
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
                {scope === 'mine' && <th>업무 바로가기</th>}
                <th className="c">대장</th>
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
                    {scope === 'mine' && (
                      <td>
                        <div className="shub-works-cell">
                          {WORKS.map((w) => {
                            const badge: Badge | undefined =
                              w.key === 'edu'
                                ? (!r.total ? { txt: '대장 미입력', cls: 'muted' } : r.mismatch ? { txt: '인원 불일치', cls: 'muted' } : { txt: '인원 일치', cls: 'ok' })
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
                    <td className="c"><span className="shub-golink" title={`${r.school.name} 대장으로 이동`}>대장 →</span></td>
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
