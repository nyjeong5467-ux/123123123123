// 근골격계 — 학교 목록 → 학교별 조사 이력(연도별) 위계 뷰. Risk.tsx(rkh-) 패턴 준용.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef, type TableQueryConfig } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import { WorkSearchPanel, type WorkSearch } from '../components/table/WorkSearchPanel'
import { MyWorkStrip } from '../components/table/MyWorkStrip'
import { Modal } from '../components/Modal'
import { useAuth } from '../lib/auth'
import { hasMusDraft } from '../lib/musDraft'
import '../styles/hier.css'
import '../styles/musculohier.css'

// 증상조사표 검수(GET /musculo/{surveyId}/sheets → confirm)
type Sheet = {
  id: string
  person_name: string
  image_ref: string
  confidence: number
  review_status: string   // auto | needs_review | confirmed
}
const SHEET_ST: Record<string, { label: string; cls: string }> = {
  auto: { label: '자동 인식', cls: 'ok' },
  needs_review: { label: '검수 대기', cls: 'warn' },
  confirmed: { label: '확정', cls: 'doing' },
}

type School = {
  id: string
  name: string
  manager?: string
  school_level?: string
  address?: string
  assigned_inspector_id?: string
}
// created_at 은 백엔드 목록 응답에 아직 없을 수 있음 — 없으면 '연도 미상' 그룹으로 방어적 처리
type Survey = {
  id: string
  school_id: string
  has_burden: boolean
  basic_surveys: number
  sheets: number
  needs_review: number
  created_at?: string | null
  category?: 'regular' | 'adhoc' | null // [079] 정기/수시 구분 (산재 연동 생성 = adhoc, 없으면 정기로 간주)
}
type Part = 'catering' | 'facility' | 'cleaning' | 'commute' | 'night_duty'

// [073] 모듈 스코프 세션 캐시 — 탭 재진입 시 전 학교 GET /musculo(N+1) 재발사 방지 ([060] 패턴)
let musSession: { account: string; schools: School[]; map: Record<string, Survey[]> } | null = null

// [076] 담당 학교 한정 조회 — 담당 배정이 있는 계정은 담당 학교만 학교별 API를 조회(N+1 축소, [060] 규칙).
// 배정이 없는 계정은 기존대로 전체 조회. 리스트에는 조회된 학교의 작성물만 표시됨.
function scopeToAssigned(schools: School[], login?: string): School[] {
  const mine = login ? schools.filter((s) => s.assigned_inspector_id === login) : []
  return mine.length ? mine : schools
}
type BurdenResult = { has_burden: boolean; burden_clauses: number[] }

// ===== 1단계(개편 0807): 작성된 조사 리스트 — 점검자들이 작성한 조사가 곧 첫 화면 =====
type MusReportRow = { school: School; sv: Survey }
const MUS_REPORT_QUERY: TableQueryConfig<MusReportRow> = {
  searchFields: [(r) => r.school.name, (r) => r.school.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [
    {
      key: 'burden',
      label: '부담작업',
      options: [
        { value: 'y', label: '있음' },
        { value: 'n', label: '없음' },
      ],
      accessor: (r) => (r.sv.has_burden ? 'y' : 'n'),
    },
    {
      key: 'review',
      label: '검수',
      options: [
        { value: 'y', label: '검수 대기' },
        { value: 'n', label: '없음' },
      ],
      accessor: (r) => (r.sv.needs_review > 0 ? 'y' : 'n'),
    },
    {
      // [063] 검색 패널의 학교급 세그먼트가 사용
      key: 'level',
      label: '구분',
      options: ['유', '초', '중', '고', '기타'].map((v) => ({ value: v, label: v })),
      accessor: (r) => r.school.school_level ?? '',
    },
  ],
  sortAccessors: {
    date: (r) => (r.sv.created_at ?? '').slice(0, 10),
    name: (r) => r.school.name,
    needs: (r) => r.sv.needs_review,
    level: (r) => LEVEL_ORDER_MU[r.school.school_level ?? ''] ?? 99, // 구분(학교급) 정렬 [070]
  },
  initialSort: { key: 'date', dir: 'desc' },
}
const LEVEL_ORDER_MU: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }
const MUS_REPORT_EXPORT: ExportColumn<MusReportRow>[] = [
  { header: '조사일', value: (r) => (r.sv.created_at ?? '').slice(0, 10) },
  { header: '학교', value: (r) => r.school.name },
  { header: '담당자', value: (r) => r.school.manager || '' },
  { header: '기본조사', value: (r) => r.sv.basic_surveys },
  { header: '증상조사표', value: (r) => r.sv.sheets },
  { header: '부담작업', value: (r) => (r.sv.has_burden ? '있음' : '없음') },
  { header: '검수대기', value: (r) => r.sv.needs_review },
]

// ===== 2단계: 조사 목록 필터·정렬·내보내기 (기존 기능 보존) =====
const MUS_FILTERS: FilterDef<Survey>[] = [
  {
    key: 'burden',
    label: '부담작업',
    options: [
      { value: 'y', label: '있음' },
      { value: 'n', label: '없음' },
    ],
    accessor: (r) => (r.has_burden ? 'y' : 'n'),
  },
]
const MUS_SORTS = {
  basic: (r: Survey) => r.basic_surveys,
  sheets: (r: Survey) => r.sheets,
  needs: (r: Survey) => r.needs_review,
}
const MUS_EXPORT: ExportColumn<Survey>[] = [
  { header: '조사ID', value: (r) => r.id },
  { header: '부담작업', value: (r) => (r.has_burden ? '있음' : '없음') },
  { header: '기본조사', value: (r) => r.basic_surveys },
  { header: '증상조사표', value: (r) => r.sheets },
  { header: '검수대기', value: (r) => r.needs_review },
]

// ===== 1단계: 학교 목록 (조사 요약) =====
type SchoolRow = School & { count: number; burdenCount: number; needsReview: number; latest: string }

const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  sortAccessors: {
    name: (r) => r.name,
    manager: (r) => r.manager ?? '',
    count: (r) => r.count,
    needs: (r) => r.needsReview,
    latest: (r) => r.latest,
  },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '학교', value: (r) => r.name },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '조사 건수', value: (r) => r.count },
  { header: '부담작업 있음', value: (r) => r.burdenCount },
  { header: '검수 대기', value: (r) => r.needsReview },
  { header: '최근 조사일', value: (r) => r.latest },
]

// ===== 2단계: 연도별 그룹 =====
type YearGroup = { year: string; rows: Survey[] }

function groupByYear(items: Survey[]): YearGroup[] {
  const map = new Map<string, Survey[]>()
  for (const it of items) {
    const y = (it.created_at ?? '').slice(0, 4) || '연도 미상'
    if (!map.has(y)) map.set(y, [])
    map.get(y)!.push(it)
  }
  return [...map.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((year) => ({ year, rows: map.get(year)! }))
}

// ===== 부담작업 판정 (기존 기능 보존) =====
// 근골격계부담작업 11개 호 (고용노동부 고시)
const CLAUSE_NUMS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const CLAUSE_LABELS: Record<number, string> = {
  1: '하루 4시간↑ 키보드/마우스 반복',
  2: '하루 2시간↑ 목·어깨·팔·손목 반복',
  3: '하루 2시간↑ 팔꿈치 어깨위/머리위',
  4: '하루 2시간↑ 목·허리 구부림·비틀기',
  5: '하루 2시간↑ 쪼그림·무릎굽힘',
  6: '하루 2시간↑ 1kg↑ 집기 / 4.5kg↑ 쥐기',
  7: '하루 2시간↑ 지지없이 4.5kg↑ 팔로 듦',
  8: '하루 10회↑ 25kg↑ 들기',
  9: '하루 25회↑ 10kg↑ 무릎아래/어깨위',
  10: '하루 2시간↑ 4.5kg↑ 한손 반복',
  11: '하루 2시간↑ 진동공구',
}
const PROCESS_OPTS: { value: Part; label: string }[] = [
  { value: 'catering', label: '급식' },
  { value: 'facility', label: '시설' },
  { value: 'cleaning', label: '미화' },
  { value: 'commute', label: '통학' },
  { value: 'night_duty', label: '당직' },
]
const PROCESS_LABEL: Record<Part, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}

function emptyClauses(): Record<number, boolean> {
  const o: Record<number, boolean> = {}
  for (const n of CLAUSE_NUMS) o[n] = false
  return o
}

// 통계 KPI 라벨 (기존 STAT_LABEL 보존)
const STAT_LABEL: Record<string, string> = {
  sheets: '증상조사표', needs_review: '검수 대기', confirmed: '확정',
}

export function Musculo() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 학교별 조사 목록 캐시 — 1단계 요약·2단계 연도별 그룹 공용
  const [surveyMap, setSurveyMap] = useState<Record<string, Survey[]>>({})
  const [sumLoading, setSumLoading] = useState(false)

  // 위계 상태: 선택 학교(2단계) · 접힌 연도 그룹 · 학교 컨텍스트 탭
  const [sel, setSel] = useState<School | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'list' | 'burden'>('list')

  // 조사 생성 / 통계 상태 (기존 보존)
  const [creating, setCreating] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [surveyId, setSurveyId] = useState('')
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsErr, setStatsErr] = useState('')

  // 부담작업 판정 탭 상태 (기존 보존)
  const [bSurveyId, setBSurveyId] = useState('')
  const [bProcess, setBProcess] = useState<Part>('catering')
  const [clauses, setClauses] = useState<Record<number, boolean>>(emptyClauses)
  const [bLoading, setBLoading] = useState(false)
  const [bErr, setBErr] = useState('')
  const [bResult, setBResult] = useState<BurdenResult | null>(null)

  // 학교 목록 로드 — 세션 캐시 적중 시 재조회 없이 복원 [073]
  useEffect(() => {
    const acct = user?.login ?? ''
    if (musSession && musSession.account === acct) {
      setSchools(musSession.schools)
      setSurveyMap(musSession.map)
      setLoading(false)
      return
    }
    let alive = true
    api<School[]>('/schools')
      .then((s) => {
        if (!alive) return
        setSchools(Array.isArray(s) ? s : [])
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 전 학교 조사 목록 로드 → 학교 행 요약(건수/검수대기)과 2단계 그룹에 사용
  useEffect(() => {
    if (!schools.length) return
    if (musSession && musSession.schools === schools) return // 캐시 적중 — 재조회 0건 [073]
    let alive = true
    setSumLoading(true)
    Promise.all(
      scopeToAssigned(schools, user?.login).map((s) => // [076] 담당 학교 한정
        api<Survey[]>(`/musculo?school_id=${s.id}`)
          .then((d) => [s.id, Array.isArray(d) ? d : []] as const)
          .catch(() => [s.id, []] as const),
      ),
    ).then((entries) => {
      if (!alive) return
      const map = Object.fromEntries(entries)
      musSession = { account: user?.login ?? '', schools, map } // [073]
      setSurveyMap(map)
      setSumLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools])

  // 특정 학교만 재조회 (조사 생성 후 / 학교 진입 시 최신화) — 세션 캐시도 함께 갱신 [073]
  const refetchSchool = useCallback((schoolId: string) => {
    api<Survey[]>(`/musculo?school_id=${schoolId}`)
      .then((d) => {
        const arr = Array.isArray(d) ? d : []
        if (musSession) musSession.map = { ...musSession.map, [schoolId]: arr }
        setSurveyMap((m) => ({ ...m, [schoolId]: arr }))
      })
      .catch(() => { /* 캐시 유지 */ })
  }, [])

  // ── 증상조사표 검수 모달 ──
  const [reviewFor, setReviewFor] = useState<string | null>(null)   // survey id
  const [sheetsList, setSheetsList] = useState<Sheet[]>([])
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState('')
  const [reviewErr, setReviewErr] = useState('')

  const loadSheets = useCallback((sid2: string) => {
    setSheetsLoading(true)
    setReviewErr('')
    api<Sheet[]>(`/musculo/${sid2}/sheets`)
      .then((d) => setSheetsList(Array.isArray(d) ? d : []))
      .catch((e) => setReviewErr(e instanceof Error ? e.message : '조회 실패'))
      .then(() => setSheetsLoading(false))
  }, [])

  function openReview(surveyIdToReview: string) {
    setReviewFor(surveyIdToReview)
    setSheetsList([])
    loadSheets(surveyIdToReview)
  }

  async function confirmSheet(sheetId: string) {
    if (!reviewFor) return
    setConfirmBusy(sheetId)
    setReviewErr('')
    try {
      await api(`/musculo/${reviewFor}/sheets/${sheetId}/confirm`, { method: 'POST' })
      loadSheets(reviewFor)
      if (sel) refetchSchool(sel.id)
    } catch (e) {
      setReviewErr(e instanceof Error ? e.message : '확정 실패')
    } finally {
      setConfirmBusy('')
    }
  }

  // 선택된 조사 통계 로드 (기존 보존)
  useEffect(() => {
    if (!surveyId) return
    let alive = true
    setStatsLoading(true)
    setStatsErr('')
    api<Record<string, unknown>>(`/musculo/${surveyId}/stats`)
      .then((d) => { if (alive) { setStats(d && typeof d === 'object' ? d : {}); setStatsLoading(false) } })
      .catch((e) => { if (alive) { setStatsErr(e instanceof Error ? e.message : '오류'); setStatsLoading(false) } })
    return () => { alive = false }
  }, [surveyId])

  // ── 1단계: 학교 목록 데이터 ──
  const schoolRows: SchoolRow[] = useMemo(
    () => schools.map((s) => {
      const list = surveyMap[s.id] ?? []
      const latest = list.reduce((m, it) => {
        const d = (it.created_at ?? '').slice(0, 10)
        return d > m ? d : m
      }, '')
      return {
        ...s,
        count: list.length,
        burdenCount: list.filter((it) => it.has_burden).length,
        needsReview: list.reduce((a, it) => a + (it.needs_review || 0), 0),
        latest,
      }
    }),
    [schools, surveyMap],
  )
  const totalCount = useMemo(() => schoolRows.reduce((a, r) => a + r.count, 0), [schoolRows])
  const totalNeeds = useMemo(() => schoolRows.reduce((a, r) => a + r.needsReview, 0), [schoolRows])
  const q = useTableQuery(schoolRows, SCHOOL_QUERY)

  // 작성물 리스트(0807 개편) — 전 학교 조사를 평탄화해 최신순 표시
  const reportRows: MusReportRow[] = useMemo(
    () => schools.flatMap((s) => (surveyMap[s.id] ?? []).map((sv) => ({ school: s, sv }))),
    [schools, surveyMap],
  )
  // [066] 내 보고서 작업 스트립 — localStorage 보고서 초안(작성중) 기준, 담당 배정 있으면 담당 학교 한정
  const myIds = useMemo(() => {
    const mine = schools.filter((s) => s.assigned_inspector_id === (user?.login ?? ''))
    return mine.length > 0 ? new Set(mine.map((s) => s.id)) : null
  }, [schools, user])
  const myWorkItems = useMemo(
    () => schools
      .filter((s) => (!myIds || myIds.has(s.id)) && hasMusDraft(s.id))
      .map((s) => ({
        key: s.id,
        school: s.name,
        detail: '보고서 초안 작성중',
        onResume: () => nav(`/musculo/report?school=${s.id}`),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schools, myIds],
  )

  // [063] 학교명·지역명 확정형 검색 (학교 탭과 동일 UX)
  const [applied, setApplied] = useState({ name: '', region: '' })
  const searchedReportRows = useMemo(() => {
    const nq = applied.name.toLowerCase()
    const gq = applied.region.toLowerCase()
    if (!nq && !gq) return reportRows
    return reportRows.filter(
      (r) =>
        (!nq || r.school.name.toLowerCase().includes(nq)) &&
        (!gq || (r.school.address ?? '').toLowerCase().includes(gq)),
    )
  }, [reportRows, applied])
  const rq = useTableQuery(searchedReportRows, MUS_REPORT_QUERY)
  const doPanelSearch = (s: WorkSearch) => {
    setApplied({ name: s.name, region: s.region })
    rq.setFilter('level', s.level)
    rq.setPage(1)
  }

  function openSchool(s: School) {
    setSel(s)
    setTab('list')
    setCollapsed({})
    setSurveyId('')
    setStats(null)
    setStatsErr('')
    setBSurveyId('')
    setBResult(null)
    setBErr('')
    setActionErr('')
    refetchSchool(s.id)
  }

  // 학교 탭 바로가기(?school=id) — 학교 목록 로드 후 해당 학교 컨텍스트 자동 진입
  const [linkParams] = useSearchParams()
  useEffect(() => {
    const sid = linkParams.get('school')
    if (!sid || sel || !schools.length) return
    const s = schools.find((x) => x.id === sid)
    if (s) openSchool(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools])
  function backToList() {
    setSel(null)
    setSurveyId('')
    setStats(null)
  }

  // ── 2단계: 선택 학교 조사 목록 (필터·정렬 유지 + 연도별 그룹) ──
  const selItems = sel ? surveyMap[sel.id] ?? [] : []
  const flatQ = useTableQuery(selItems, { filters: MUS_FILTERS, sortAccessors: MUS_SORTS })
  const yearGroups = useMemo(() => groupByYear(flatQ.all), [flatQ.all])
  const selNeeds = selItems.reduce((a, it) => a + (it.needs_review || 0), 0)
  const selBurden = selItems.filter((it) => it.has_burden).length

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  // 조사 생성 (기존 보존 — 학교 컨텍스트 내부로 이동)
  async function createSurvey() {
    if (!sel || creating) return
    setCreating(true)
    setActionErr('')
    try {
      const res = await api<{ id: string }>('/musculo', {
        method: 'POST',
        body: JSON.stringify({ school_id: sel.id }),
      })
      setStats(null)
      setSurveyId(res?.id || '')
      refetchSchool(sel.id)
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setCreating(false)
    }
  }

  function toggleClause(n: number) {
    setClauses((c) => ({ ...c, [n]: !c[n] }))
    setBResult(null)
  }

  const checkedCount = CLAUSE_NUMS.filter((n) => clauses[n]).length

  // 부담작업 판정 → 실제 백엔드 POST /musculo/{sid}/burden (기존 보존)
  async function judge() {
    if (!bSurveyId) return
    setBLoading(true)
    setBErr('')
    setBResult(null)
    try {
      const body: Record<string, boolean> = {}
      for (const n of CLAUSE_NUMS) body[String(n)] = !!clauses[n]
      const res = await api<BurdenResult>('/musculo/' + bSurveyId + '/burden', {
        method: 'POST',
        body: JSON.stringify({ process: bProcess, clauses: body }),
      })
      setBResult(res)
    } catch (e) {
      setBErr(e instanceof Error ? e.message : '판정 실패')
    } finally {
      setBLoading(false)
    }
  }

  // 통계: 숫자 항목만 KPI 카드로 방어적 렌더 (기존 보존)
  const numericEntries = Object.entries(stats || {}).filter(
    ([, v]) => typeof v === 'number',
  )

  // 연도 그룹 테이블 — 행 클릭 시 통계 로드
  function renderGroup(g: YearGroup) {
    const key = g.year
    const isOpen = !collapsed[key]
    return (
      <div className="muh-group" key={key}>
        <button className="muh-grouphead" onClick={() => toggleGroup(key)}>
          <span className={'muh-chev' + (isOpen ? ' open' : '')}><ChevronRight size={15} /></span>
          {g.year !== '연도 미상' ? `${g.year}년 조사` : g.year}
          <span className="muh-count">{g.rows.length}건</span>
        </button>
        {isOpen && (
          <div className="muh-groupbody">
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>조사 ID</th>
                    <th className="c">부담작업</th>
                    <SortableTh q={flatQ} col="basic" className="c">기본조사</SortableTh>
                    <SortableTh q={flatQ} col="sheets" className="c">증상조사표</SortableTh>
                    <SortableTh q={flatQ} col="needs" className="c">검수대기</SortableTh>
                    <th style={{ width: 110 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => { setStats(null); setSurveyId(s.id) }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><b>{s.id.slice(0, 8)}</b></td>
                      <td className="c">
                        <span className={'pillx ' + (s.has_burden ? 'doing' : 'na')}>
                          {s.has_burden ? '있음' : '없음'}
                        </span>
                      </td>
                      <td className="c">{s.basic_surveys}</td>
                      <td className="c">{s.sheets}</td>
                      <td className="c">
                        {s.needs_review > 0
                          ? <span className="pillx warn">{s.needs_review}건</span>
                          : '—'}
                      </td>
                      <td className="c">
                        {s.sheets > 0 && (
                          <button className="btn btn-ghost"
                            onClick={(e) => { e.stopPropagation(); openReview(s.id) }}>
                            {s.needs_review > 0 ? '검수' : '조사표 보기'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / {sel
          ? <><a onClick={backToList} style={{ cursor: 'pointer' }}>근골격계 부담작업</a> / <b>{sel.name}</b></>
          : <b>근골격계 부담작업</b>}
      </div>
      <div className="bar">
        <h2><Activity size={20} /> 근골격계 부담작업</h2>
        <div className="sp" />
        {/* [083] 상단 탭(조사 목록/부담작업 판정)·[근골격계 조사 생성] 버튼 제거 — 화면은 조사 현황 표 단일 흐름,
            조사 생성은 보고서 작성 플로우에서 수행 (구 JSX는 이 주석 아래 코드로 복원 가능 — createSurvey·tab state 잔존) */}
        {/* [084] 보고서 작성 버튼 — 안전점검의 [점검표 작성]과 동일한 위치(상단 바 우측)·색(btn-primary) */}
        {sel && (
          <Link className="btn btn-primary" to={'/musculo/report?school=' + sel.id}>
            보고서 작성
          </Link>
        )}
      </div>

      {error && (
        <div className="ledger">
          <div className="tstate">오류: {error}</div>
        </div>
      )}

      {/* ── 1단계: 학교 목록 ── */}
      {!sel && !error && (
        <>
          {/* [066] 내 보고서 작업 스트립 */}
          <MyWorkStrip title="내 보고서 작업" items={myWorkItems} mineOnly={!!myIds} />

          {/* [063] 학교 탭과 동일한 검색 패널 */}
          <WorkSearchPanel onSearch={doPanelSearch} onClear={(f) => setApplied((a) => ({ ...a, [f]: '' }))} />

          <div className="ledger">
            <div className="lh">
              <h2><Activity size={18} /> 작성된 조사</h2>
              <span className="pillx doing">{rq.total}건</span>
              <div className="sp" />
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortableTh q={rq} col="date">조사일</SortableTh>
                    <SortableTh q={rq} col="level" className="c">구분</SortableTh>
                    <SortableTh q={rq} col="name">학교</SortableTh>
                    <th>담당자</th>
                    <th className="c">평가 구분</th>
                    <th className="c">작성현황</th>
                    <th className="c">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading || sumLoading) && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && !sumLoading && rq.view.map((r) => {
                    // [079] 작성현황 요약 — 세부 수치(기본조사·증상조사표·부담작업)는 툴팁으로
                    const st: [string, string] = r.sv.needs_review > 0
                      ? [`검수 대기 ${r.sv.needs_review}건`, 'warn']
                      : (r.sv.basic_surveys > 0 || r.sv.sheets > 0) ? ['작성 완료', 'ok'] : ['작성중', 'doing']
                    const tip = `기본조사 ${r.sv.basic_surveys} · 증상조사표 ${r.sv.sheets} · 부담작업 ${r.sv.has_burden ? '있음' : '없음'}`
                    return (
                    <tr key={r.sv.id} onClick={() => { /* [087] 행 클릭 = 보고서 작성 화면 직행 (안전점검 [080]과 동일 원칙 — 초안 자동 복원) */ nav(`/musculo/report?school=${r.school.id}`) }} style={{ cursor: 'pointer' }}>
                      <td>{(r.sv.created_at ?? '').slice(0, 10) || '—'}</td>
                      <td className="c">{r.school.school_level ? <span className="pillx doing">{r.school.school_level}</span> : '—'}</td>
                      <td><b>{r.school.name}</b></td>
                      <td className="muh-mgr">{r.school.manager || '—'}</td>
                      <td className="c"><span className={'pillx ' + (r.sv.category === 'adhoc' ? 'warn' : 'doing')}>{r.sv.category === 'adhoc' ? '수시' : '정기'}</span></td>
                      <td className="c"><span className={'pillx ' + st[1]} title={tip}>{st[0]}</span></td>
                      <td className="c">
                        <button className="btn" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={(e) => { e.stopPropagation(); nav(`/musculo/report?school=${r.school.id}`) }}>
                          보기
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                  {!loading && !sumLoading && rq.view.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">{reportRows.length === 0 ? '작성된 조사가 없습니다. 학교 탭의 [근골격계] 바로가기에서 시작하세요.' : '조건에 맞는 조사가 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={rq} />
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            행을 클릭하면 해당 학교의 조사 이력(연도별)·부담작업 판정·보고서 작성으로 이동합니다.
          </div>
        </>
      )}

      {/* ── 2단계: 학교 컨텍스트 ── */}
      {sel && (
        <>
          <div className="muh-schoolhead">
            <button className="muh-back" onClick={backToList}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="muh-schoolname">{sel.name}</span>
            <span className="muh-schoolmgr">담당자 {sel.manager || '—'}</span>
            <div className="muh-sp" />
            {/* [084] 구 보고서 작성 ghost 링크 제거 — 상단 바의 btn-primary 버튼으로 이동 */}
          </div>

          {actionErr && <div className="login-err" style={{ marginBottom: 12 }}>{actionErr}</div>}

          {tab === 'list' && (
            <>
              {/* [082] 조사 현황 — 안전점검 학교 컨텍스트([055])와 동일한 통합 표 (구 KPI 카드·연도별 그룹 대체) */}
              <div className="ledger">
                <div className="lh">
                  <h2><Activity size={18} /> 조사 현황</h2>
                  <span className="pillx doing">{flatQ.total}건</span>
                  <div className="sp" />
                  <FilterBar q={flatQ} />
                  <ExportButton q={flatQ} columns={MUS_EXPORT} filename={`근골격계_${sel.name}`} />
                </div>
                <div className="twrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>조사일</th>
                        <th>학교</th>
                        <th>담당자</th>
                        <th className="c">평가 구분</th>
                        <th className="c">작성현황</th>
                        <th className="c">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sumLoading && selItems.length === 0 && <tr><td colSpan={6}><div className="tstate">불러오는 중…</div></td></tr>}
                      {!sumLoading && selItems.length === 0 && (
                        <tr><td colSpan={6}><div className="tstate">생성된 근골격계 조사가 없습니다. '근골격계 조사 생성'으로 추가하세요.</div></td></tr>
                      )}
                      {selItems.length > 0 && flatQ.view.length === 0 && (
                        <tr><td colSpan={6}><div className="tstate">조건에 맞는 조사가 없습니다.</div></td></tr>
                      )}
                      {flatQ.view.map((s) => {
                        const st: [string, string] = s.needs_review > 0
                          ? [`검수 대기 ${s.needs_review}건`, 'warn']
                          : (s.basic_surveys > 0 || s.sheets > 0) ? ['작성 완료', 'ok'] : ['작성중', 'doing']
                        const tip = `기본조사 ${s.basic_surveys} · 증상조사표 ${s.sheets} · 부담작업 ${s.has_burden ? '있음' : '없음'}`
                        return (
                          <tr key={s.id} onClick={() => { setStats(null); setSurveyId(s.id) }} style={{ cursor: 'pointer' }}>
                            <td>{(s.created_at ?? '').slice(0, 10) || '—'}</td>
                            <td><b>{sel.name}</b></td>
                            <td>{sel.manager || '—'}</td>
                            <td className="c"><span className={'pillx ' + (s.category === 'adhoc' ? 'warn' : 'doing')}>{s.category === 'adhoc' ? '수시' : '정기'}</span></td>
                            <td className="c"><span className={'pillx ' + st[1]} title={tip}>{st[0]}</span></td>
                            <td className="c">
                              {s.sheets > 0 ? (
                                <button className="btn btn-ghost" style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                                  onClick={(e) => { e.stopPropagation(); openReview(s.id) }}>
                                  {s.needs_review > 0 ? '검수' : '조사표 보기'}
                                </button>
                              ) : (
                                <button className="btn btn-ghost" style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                                  onClick={(e) => { e.stopPropagation(); setStats(null); setSurveyId(s.id) }}>
                                  상세
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* [085] 조사 통계 카드(TOTAL~NORMAL)·하단 안내 문구 제거 — 통계 로드 로직(surveyId·stats)은 잔존(미노출) */}
            </>
          )}

          {tab === 'burden' && (
            <>
              {selItems.length === 0 ? (
                <div className="ledger">
                  <div className="tstate">판정할 조사가 없습니다. '조사 목록' 탭에서 근골격계 조사를 먼저 생성하세요.</div>
                </div>
              ) : (
                <div className="ledger">
                  <div className="lh">
                    <h2><ClipboardCheck size={19} /> 근골격계부담작업 판정</h2>
                  </div>
                  <div className="card-body" style={{ padding: '20px 24px' }}>
                    <div className="formrow">
                      <label className="field" style={{ minWidth: 240 }}>
                        <span>대상 조사</span>
                        <select
                          className="select"
                          value={bSurveyId}
                          onChange={(e) => { setBSurveyId(e.target.value); setBResult(null) }}
                        >
                          <option value="">조사 선택</option>
                          {selItems.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id.slice(0, 8)}{s.has_burden ? ' · 부담있음' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field" style={{ minWidth: 160 }}>
                        <span>공정</span>
                        <select
                          className="select"
                          value={bProcess}
                          onChange={(e) => { setBProcess(e.target.value as Part); setBResult(null) }}
                        >
                          {PROCESS_OPTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </label>
                    </div>

                    <div style={{ marginTop: 18, marginBottom: 9, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                      근골격계부담작업 11개 호 — 해당 항목 체크
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
                      {CLAUSE_NUMS.map((n) => (
                        <label
                          key={n}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 9,
                            padding: '10px 12px',
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            cursor: 'pointer',
                            background: clauses[n] ? 'var(--violet-soft)' : 'var(--card)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!clauses[n]}
                            onChange={() => toggleClause(n)}
                            style={{ marginTop: 3, accentColor: 'var(--violet)' }}
                          />
                          <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                            <b style={{ color: 'var(--violet)' }}>{n}호</b> {CLAUSE_LABELS[n]}
                          </span>
                        </label>
                      ))}
                    </div>

                    <div style={{ marginTop: 16, display: 'flex', gap: 22, flexWrap: 'wrap', padding: '12px 14px', background: 'var(--bg)', borderRadius: 12 }}>
                      <span className="muted" style={{ fontSize: 12.5 }}>선택 조사 <b style={{ color: 'var(--ink)' }}>{bSurveyId ? bSurveyId.slice(0, 8) : '—'}</b></span>
                      <span className="muted" style={{ fontSize: 12.5 }}>공정 <b style={{ color: 'var(--ink)' }}>{PROCESS_LABEL[bProcess]}</b></span>
                      <span className="muted" style={{ fontSize: 12.5 }}>체크한 호 <b style={{ color: 'var(--ink)' }}>{checkedCount}개</b></span>
                    </div>

                    <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button className="btn btn-primary" onClick={judge} disabled={bLoading || !bSurveyId}>
                        {bLoading ? '판정 중…' : '판정'}
                      </button>
                      {bErr && <span style={{ color: 'var(--red-ink)', fontSize: 12.5 }}>오류: {bErr}</span>}
                    </div>

                    {bResult && (
                      <div style={{ marginTop: 18 }}>
                        <div className="kv">
                          <b>판정 결과</b>
                          <span>
                            {bResult.has_burden
                              ? <span className="pillx doing">부담작업 있음</span>
                              : <span className="pillx ok">부담작업 없음</span>}
                          </span>
                        </div>
                        {bResult.has_burden && (
                          <div className="kv">
                            <b>해당 호</b>
                            <span>
                              {bResult.burden_clauses.length
                                ? bResult.burden_clauses.map((c) => c + '호').join(', ')
                                : '—'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="muted" style={{ marginTop: 16, fontSize: 12, lineHeight: 1.7 }}>
                      법령근거: 「산업안전보건법」 제39조 및 고용노동부 고시 「근골격계부담작업의 범위」(제1호~제11호).
                      2개월간 하루 기준 시간·빈도·중량 요건 충족 시 해당 호의 부담작업으로 판정됩니다.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── 증상조사표 검수 모달 ── */}
      {reviewFor && (
        <Modal
          title="증상조사표 검수"
          onClose={() => setReviewFor(null)}
          footer={<button className="btn btn-primary" onClick={() => setReviewFor(null)}>닫기</button>}
        >
          {reviewErr && <div className="muted" style={{ color: 'var(--red-ink)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{reviewErr}</div>}
          <div className="twrap">
            <table className="tbl">
              <thead><tr><th>성명</th><th>스캔 파일</th><th className="c">인식 신뢰도</th><th className="c">상태</th><th className="c">처리</th></tr></thead>
              <tbody>
                {sheetsLoading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
                {!sheetsLoading && sheetsList.map((sh) => {
                  const st = SHEET_ST[sh.review_status] || { label: sh.review_status, cls: 'todo' }
                  return (
                    <tr key={sh.id}>
                      <td><b>{sh.person_name}</b></td>
                      <td>{sh.image_ref || '—'}</td>
                      <td className="c">{Math.round((sh.confidence || 0) * 100)}%</td>
                      <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                      <td className="c">
                        {sh.review_status === 'needs_review' && (
                          <button className="btn btn-ghost" disabled={confirmBusy === sh.id}
                            onClick={() => void confirmSheet(sh.id)}>
                            {confirmBusy === sh.id ? '확정 중…' : '검수 확정'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!sheetsLoading && sheetsList.length === 0 && (
                  <tr><td colSpan={5}><div className="tstate">증상조사표가 없습니다.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
            OMR 인식 신뢰도가 낮거나 미마킹 문항이 있는 조사표가 검수 대기로 들어옵니다. 원본 스캔과 대조 후 「검수 확정」하세요.
          </div>
        </Modal>
      )}
    </div>
  )
}
