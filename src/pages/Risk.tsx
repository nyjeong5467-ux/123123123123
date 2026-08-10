import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type TableQueryConfig } from '../lib/useTableQuery'
import { Pagination, SortableTh, type ExportColumn } from '../components/table'
import { WorkSearchPanel, type WorkSearch } from '../components/table/WorkSearchPanel'
import { MyWorkStrip } from '../components/table/MyWorkStrip'
import { useAuth } from '../lib/auth'
import { DeptHazardInfo, type DeptInfoDoc } from '../features/risk/DeptHazardInfo'
import { HearingSurvey, type HearingDoc } from '../features/risk/HearingSurvey'
import { AssessmentTable, type AssessDoc, type BehaviorDoc, type StateDoc } from '../features/risk/AssessmentTable'
import { ReportInfo, type ReportInfoData } from '../features/risk/ReportInfo'
import { Participants, type ParticipantRow } from '../features/risk/Participants'
import { RiskReport } from '../features/risk/RiskReport'
import { AdhocSection, type AdhocCase } from '../features/risk/AdhocAssessment'
import '../styles/hier.css'
import '../styles/riskhier.css'

const PROCESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'catering', label: '급식' },
  { value: 'facility', label: '시설' },
  { value: 'cleaning', label: '미화' },
  { value: 'commute', label: '통학' },
  { value: 'night_duty', label: '당직' },
]

type School = {
  id: string
  name: string
  manager?: string
  school_level?: string
  address?: string
  assigned_inspector_id?: string
}
// category('regular'|'adhoc')·산재 연동 필드는 백엔드가 병렬 추가 중 — 없으면 정기로 간주
type RiskItem = {
  id: string
  school_id: string
  process: string
  status: string
  count: number
  unsafe_count: number
  created_at?: string | null
  category?: string | null
  accident_id?: string | null
  source?: string | null
  origin?: string | null
}

const PROCESS_LABEL: Record<string, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}
const STATUS_LABEL: Record<string, string> = {
  draft: '작성중', completed: '완료',
}
const STATUS_PILL: Record<string, string> = {
  draft: 'todo', completed: 'ok',
}
const HAZARD_LABEL: Record<string, string> = {
  work_nature: '작업특성', mechanical: '기계적', environment: '작업환경', chemical: '화학', electrical: '전기',
}
const UNSAFE_LABEL: Record<string, string> = { condition: '불완전한 상태', act: '불완전한 행동' }

type RiskCategory = 'regular' | 'adhoc'
const CATEGORY_LABEL: Record<RiskCategory, string> = { regular: '정기', adhoc: '수시' }

function catOf(r: { category?: string | null }): RiskCategory {
  return r.category === 'adhoc' ? 'adhoc' : 'regular'
}
// 산업재해(accidents.links)에서 생성된 건 — 백엔드 필드명 후보를 방어적으로 수용
function isAccidentLinked(r: { accident_id?: string | null; source?: string | null; origin?: string | null }): boolean {
  return !!(r.accident_id || r.source === 'accident' || r.origin === 'accident')
}

type RiskDetailItem = {
  id: string
  task_name: string
  hazard_factor: string
  legal_basis: string
  situation: string
  likelihood: number
  severity: number
  risk_score: number
  is_unsafe: boolean
  unsafe_type: string | null
  measure: string
}
type RiskDetail = {
  id: string
  process: string
  status: string
  count: number
  unsafe_count: number
  created_at: string | null
  category?: string | null
  accident_id?: string | null
  source?: string | null
  origin?: string | null
  items: RiskDetailItem[]
}

// ===== 1단계: 학교 목록 (담당자 · 평가 요약) =====
type SchoolRow = School & { count: number; adhocCount: number; latest: string }

const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  sortAccessors: {
    name: (r) => r.name,
    manager: (r) => r.manager ?? '',
    count: (r) => r.count,
    latest: (r) => r.latest,
  },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '학교', value: (r) => r.name },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '평가 건수', value: (r) => r.count },
  { header: '수시 건수', value: (r) => r.adhocCount },
  { header: '최근 평가일', value: (r) => r.latest },
]

// ===== 2단계: 연도별(정기/수시) 그룹 =====
type YearGroup = { year: string; regular: RiskItem[]; adhoc: RiskItem[] }

function groupByYear(items: RiskItem[]): YearGroup[] {
  const map = new Map<string, { regular: RiskItem[]; adhoc: RiskItem[] }>()
  for (const it of items) {
    const y = (it.created_at ?? '').slice(0, 4) || '연도 미상'
    if (!map.has(y)) map.set(y, { regular: [], adhoc: [] })
    map.get(y)![catOf(it)].push(it)
  }
  const byDateDesc = (a: RiskItem, b: RiskItem) => (b.created_at ?? '').localeCompare(a.created_at ?? '')
  return [...map.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((year) => {
      const g = map.get(year)!
      return { year, regular: [...g.regular].sort(byDateDesc), adhoc: [...g.adhoc].sort(byDateDesc) }
    })
}

// 2단계 내보내기(연도·구분 포함 플랫 목록)
const FLAT_QUERY: TableQueryConfig<RiskItem> = {}
const FLAT_EXPORT: ExportColumn<RiskItem>[] = [
  { header: '연도', value: (r) => (r.created_at ?? '').slice(0, 4) },
  { header: '구분', value: (r) => CATEGORY_LABEL[catOf(r)] },
  { header: '공정', value: (r) => PROCESS_LABEL[r.process] || r.process },
  { header: '항목수', value: (r) => r.count },
  { header: '불완전', value: (r) => r.unsafe_count },
  { header: '상태', value: (r) => STATUS_LABEL[r.status] || r.status },
  { header: '작성일', value: (r) => (r.created_at ?? '').slice(0, 10) },
  { header: '산재 연동', value: (r) => (isAccidentLinked(r) ? 'Y' : '') },
]

// ===== 유해·위험요인 조사표 (gap D-1) — 백엔드 연동 (GET/PUT /risk/survey) =====
type MachineRow = { id: string; name: string; cycle: string; last_date: string }
type SurveyData = {
  policy: string
  policy_checks: Record<string, boolean>
  hear_date: string
  hear_method: string
  hear_opinion: string
  material_checks: Record<string, boolean>
  material_note: string
  hazard_checks: Record<string, boolean>
  patrol_date: string
  patrol_area: string
  patrol_finding: string
  machines: MachineRow[]
  // 부서별 유해위험정보 (1단계 검토 — DeptHazardInfo). prev는 작년 작성분(프리필·변경 비교 기준)
  dept_info?: DeptInfoDoc
  dept_info_prev?: DeptInfoDoc
  // 청취조사 개인별 조사표 (2단계 — HearingSurvey). prev는 작년 작성분(프리필)
  hearing?: HearingDoc
  hearing_prev?: HearingDoc
  // [정기평가] 위험성평가표 + 감소대책 (3단계 — AssessmentTable)
  assess?: AssessDoc
  reduce_behavior?: BehaviorDoc
  reduce_state?: StateDoc
  // 보고서 PART 1 학교 현황 (ReportInfo) · 3-5 참여자 명단 (Participants)
  report_info?: ReportInfoData
  participants?: ParticipantRow[]
  // 수시 위험성평가 케이스 (사고성 산재 연동 — AdhocAssessment)
  adhoc_cases?: AdhocCase[]
}
// 구 6탭(안전·보건/의견청취/자료/위험요인/순회/기계·기구)은 보고서 체계 개편으로 제거 — 0806
type SurveyTabKey = 'info' | 'dept' | 'hearing' | 'assess' | 'participants'
type CheckField = 'policy_checks' | 'material_checks' | 'hazard_checks'
// 백엔드 응답: sections 는 폼이 그대로 왕복(round-trip)하는 딕셔너리. 미저장 시 {} / updated_at ''
type SurveyGetResp = { school_id: string; sections: Partial<SurveyData>; updated_at: string }
type SurveyPutResp = { ok: boolean; updated_at: string }

// 보고서(정기 위험성평가 결과보고서) 목차 순서 그대로 — 탭을 채우면 보고서가 채워진다
const SURVEY_TABS: { key: SurveyTabKey; label: string }[] = [
  { key: 'info', label: '① 학교 현황' },
  { key: 'dept', label: '② 유해위험정보' },
  { key: 'hearing', label: '③ 청취조사' },
  { key: 'assess', label: '④ 평가표·감소대책' },
  { key: 'participants', label: '⑤ 참여자 명단' },
]
const SAFETY_CHECKS = ['안전보건 방침 게시', '안전보건 목표 수립', '안전보건관리책임자 지정', '안전보건 예산 편성']
const MATERIAL_CHECKS = ['물질안전보건자료(MSDS) 비치', '작업환경측정 결과', '건강검진 결과 기록', '안전보건교육 일지']
const HAZARD_CHECKS = ['미끄러짐·넘어짐', '끼임·절단', '화상·화재', '유해화학물질 노출', '근골격계 부담작업', '전기 감전']
const HEAR_METHODS = ['면담', '설문조사', '건의함', '안전보건협의체']

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}
function emptySurvey(): SurveyData {
  return {
    policy: '', policy_checks: {}, hear_date: '', hear_method: '면담', hear_opinion: '',
    material_checks: {}, material_note: '', hazard_checks: {},
    patrol_date: '', patrol_area: '', patrol_finding: '',
    machines: [{ id: rid(), name: '식기세척기', cycle: '2년', last_date: '2026-03-10' }],
  }
}
// 백엔드 sections(부분/빈 객체)을 빈 폼 위에 병합 → 폼 상태로 사용
function mergeSurvey(sections: Partial<SurveyData>): SurveyData {
  return { ...emptySurvey(), ...sections }
}

// ===== 1단계(개편 0807): 작성된 보고서 리스트 — 정기 보고서(문서) + 수시 케이스 =====
type RiskReportRow = {
  school: School
  kind: '정기' | '수시'
  title: string
  statusLabel: string
  statusCls: string
  progress: string
  date: string
}
// 정기 보고서 요약 — 학교 컨텍스트 카드와 동일한 섹션 완성 판정
function regularSummary(d: SurveyData) {
  const deptDone = d.dept_info ? Object.values(d.dept_info).filter((x) => x.etc.reviewed).length : 0
  const hearAll = d.hearing ? Object.values(d.hearing) : []
  const hearDone = hearAll.filter((h) => h.done).length
  const assessRows = d.assess ? Object.values(d.assess).flat() : []
  const high = assessRows.filter((r) => r.likelihood * r.severity >= 8).length
  const partCnt = d.participants?.length ?? 0
  const started = !!(d.report_info || d.dept_info || hearAll.length || assessRows.length || partCnt)
  const okCnt = [
    !!d.report_info,
    deptDone >= 5,
    hearAll.length > 0 && hearDone === hearAll.length,
    assessRows.length > 0,
    partCnt > 0,
  ].filter(Boolean).length
  const year = d.report_info?.report_ym?.slice(0, 4) || String(new Date().getFullYear())
  return { started, okCnt, high, year }
}
const RISK_REPORT_QUERY: TableQueryConfig<RiskReportRow> = {
  searchFields: [(r) => r.school.name, (r) => r.title],
  searchPlaceholder: '학교명·보고서 검색',
  filters: [{
    key: 'kind',
    label: '구분',
    options: [
      { value: '정기', label: '정기' },
      { value: '수시', label: '수시' },
    ],
    accessor: (r) => r.kind,
  }, {
    // [063] 검색 패널의 학교급 세그먼트가 사용
    key: 'level',
    label: '학교급',
    options: ['유', '초', '중', '고', '기타'].map((v) => ({ value: v, label: v })),
    accessor: (r) => r.school.school_level ?? '',
  }],
  sortAccessors: { date: (r) => r.date, name: (r) => r.school.name },
  initialSort: { key: 'date', dir: 'desc' },
}
const RISK_REPORT_EXPORT: ExportColumn<RiskReportRow>[] = [
  { header: '구분', value: (r) => r.kind },
  { header: '보고서', value: (r) => r.title },
  { header: '학교', value: (r) => r.school.name },
  { header: '진행', value: (r) => r.progress },
  { header: '상태', value: (r) => r.statusLabel },
  { header: '최근 저장', value: (r) => r.date },
]

// 신규 UI(서브탭 바 · 폼) 전용 인라인 스타일
const SUBTAB_BAR: CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap', background: 'var(--bg)', padding: 4, borderRadius: 13, marginBottom: 18 }
const TEXTAREA_STYLE: CSSProperties = { height: 'auto', minHeight: 92, padding: '10px 13px', resize: 'vertical', lineHeight: 1.6, width: '100%', fontFamily: 'inherit' }
const CHECK_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', fontSize: 13, cursor: 'pointer' }
const SECTION_LABEL: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', margin: '2px 0 8px' }
const CELL_INPUT: CSSProperties = { height: 36, width: '100%', borderRadius: 9, padding: '0 10px', fontSize: 13 }
function subTabStyle(active: boolean): CSSProperties {
  return {
    border: 0, borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    background: active ? 'var(--card)' : 'transparent',
    color: active ? 'var(--violet)' : 'var(--ink-2)',
    boxShadow: active ? 'var(--sh-soft)' : 'none',
  }
}

export function Risk() {
  const { user } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [sid, setSid] = useState('') // 조사표 탭 학교 선택 (기존 UX 유지)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 학교별 평가 목록 캐시 — 1단계 요약·2단계 연도별 그룹 공용
  const [riskMap, setRiskMap] = useState<Record<string, RiskItem[]>>({})
  const [sumLoading, setSumLoading] = useState(false)

  // 작성물 리스트(0807 개편) — 전 학교 보고서 문서 병렬 조회
  const [docMap, setDocMap] = useState<Record<string, { d: SurveyData; updated: string }>>({})
  const [docLoading, setDocLoading] = useState(false)
  useEffect(() => {
    if (!schools.length) return
    let alive = true
    setDocLoading(true)
    void Promise.all(
      schools.map(async (s) => {
        const r = await api<SurveyGetResp>(`/risk/survey?school_id=${s.id}`).catch(() => null)
        return { id: s.id, doc: r ? { d: mergeSurvey(r.sections ?? {}), updated: r.updated_at || '' } : null }
      }),
    ).then((list) => {
      if (!alive) return
      const m: Record<string, { d: SurveyData; updated: string }> = {}
      for (const it of list) if (it.doc) m[it.id] = it.doc
      setDocMap(m)
      setDocLoading(false)
    })
    return () => { alive = false }
  }, [schools])

  const reportRows: RiskReportRow[] = useMemo(() => {
    const out: RiskReportRow[] = []
    for (const s of schools) {
      const doc = docMap[s.id]
      if (!doc) continue
      const sm = regularSummary(doc.d)
      if (sm.started) {
        out.push({
          school: s, kind: '정기',
          title: `${sm.year}년 정기 위험성평가 결과보고서`,
          statusLabel: sm.okCnt === 5 ? '작성 완료' : '작성 중',
          statusCls: sm.okCnt === 5 ? 'ok' : 'doing',
          progress: `섹션 ${sm.okCnt}/5` + (sm.high > 0 ? ` · 8점 이상 ${sm.high}건` : ''),
          date: (doc.updated || '').slice(0, 10),
        })
      }
      for (const c of doc.d.adhoc_cases ?? []) {
        const doneCnt = [c.invest.done, c.prevent.done, c.assess.done, c.edu.done].filter(Boolean).length
        out.push({
          school: s, kind: '수시',
          title: `수시 위험성평가 — ${c.title || '사고성 산재'}`,
          statusLabel: doneCnt === 4 ? '완료' : '진행 중',
          statusCls: doneCnt === 4 ? 'ok' : 'doing',
          progress: `단계 ${doneCnt}/4`,
          date: (c.created || '').slice(0, 10),
        })
      }
    }
    return out
  }, [schools, docMap])
  // [066] 내 평가 작업 스트립 — 작성중(정기 작성 중·수시 진행 중), 담당 배정 있으면 담당 학교 기준 [059]와 동일 규칙
  const myIds = useMemo(() => {
    const mine = schools.filter((s) => s.assigned_inspector_id === (user?.login ?? ''))
    return mine.length > 0 ? new Set(mine.map((s) => s.id)) : null
  }, [schools, user])
  const myWorkItems = useMemo(
    () => reportRows
      .filter((r) => r.statusCls === 'doing' && (!myIds || myIds.has(r.school.id)))
      .map((r) => ({
        key: r.school.id + r.kind + r.title,
        school: r.school.name,
        detail: `${r.kind} · ${r.progress}`,
        onResume: () => { openSchool(r.school); if (r.kind === '수시') setCtxTab('adhoc') },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportRows, myIds],
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
  const rq = useTableQuery(searchedReportRows, RISK_REPORT_QUERY)
  const doPanelSearch = (s: WorkSearch) => {
    setApplied({ name: s.name, region: s.region })
    rq.setFilter('level', s.level)
    rq.setPage(1)
  }

  // 위계 상태: 선택 학교(2단계) · 접힌 그룹
  const [sel, setSel] = useState<School | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 학교 컨텍스트: 정기 위험성평가 보고서 작성 현황 (조사표 문서 요약 — GET /risk/survey)
  const [ctxReport, setCtxReport] = useState<{ d: SurveyData; updated: string } | null>(null)
  const [ctxBusy, setCtxBusy] = useState(false)
  // 정기/수시 전환 탭 + 미착수 사고 배지용 산재 목록
  const [ctxTab, setCtxTab] = useState<'regular' | 'adhoc'>('regular')
  const [ctxAccidents, setCtxAccidents] = useState<{ id: string }[]>([])
  useEffect(() => {
    setRegularEdit(false)
    if (!sel) { setCtxTab('regular'); setCtxAccidents([]); return }
    let alive = true
    api<{ id: string; school_id: string; kind: string }[]>('/accidents')
      .then((l) => { if (alive) setCtxAccidents((Array.isArray(l) ? l : []).filter((a) => a.school_id === sel.id && a.kind === 'accident')) })
      .catch(() => { if (alive) setCtxAccidents([]) })
    return () => { alive = false }
  }, [sel])
  const ctxPending = ctxAccidents.filter((a) => !(ctxReport?.d.adhoc_cases ?? []).some((c) => c.accident_id === a.id)).length
  // 수시 케이스 변경(학교 컨텍스트에서 편집) → 문서 상태 반영 + 저장
  function setCtxCases(cases: AdhocCase[]) {
    setCtxReport((c) => (c ? { ...c, d: { ...c.d, adhoc_cases: cases } } : c))
  }
  async function saveCtxDoc() {
    if (!sel || !ctxReport || ctxBusy) return
    setCtxBusy(true)
    try {
      await api('/risk/survey', { method: 'PUT', body: JSON.stringify({ school_id: sel.id, sections: ctxReport.d }) })
      // 조사표 탭이 같은 학교를 이미 로드해 뒀다면 최신 문서로 동기화
      if (surveyLoadedSid.current === sel.id) setSurvey(ctxReport.d)
    } catch { /* 저장 실패 — 화면 상태 유지 */ } finally {
      setCtxBusy(false)
    }
  }
  useEffect(() => {
    if (!sel) { setCtxReport(null); return }
    let alive = true
    api<SurveyGetResp>(`/risk/survey?school_id=${sel.id}`)
      .then((r) => { if (alive) setCtxReport({ d: mergeSurvey(r.sections ?? {}), updated: r.updated_at || '' }) })
      .catch(() => { if (alive) setCtxReport(null) })
    return () => { alive = false }
  }, [sel])

  // 생성 / 시드 상태
  const [open, setOpen] = useState(false)
  const [process, setProcess] = useState('catering')
  const [genCategory, setGenCategory] = useState<RiskCategory>('regular')
  const [busy, setBusy] = useState(false)
  const [actionErr, setActionErr] = useState('')

  // 페이지 탭 + 조사표 상태
  // 보고서 작성(①~⑤ 탭) 편집 모드 — 정기 카드의 '이어서 작성'으로 진입 (구 pageTab 'survey' 대체, 0806)
  const [regularEdit, setRegularEdit] = useState(false)
  const [surveyTab, setSurveyTab] = useState<SurveyTabKey>('info')
  const [assessPart, setAssessPart] = useState('catering') // ③ 평가표 공정(부서) 탭
  const [reportOpen, setReportOpen] = useState(false) // 보고서 인쇄 미리보기
  const [survey, setSurvey] = useState<SurveyData>(emptySurvey())
  const [surveyMsg, setSurveyMsg] = useState('')
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [surveyErr, setSurveyErr] = useState('')
  const [surveyBusy, setSurveyBusy] = useState(false)
  const surveyLoadedSid = useRef('') // GET 이 반영된 학교 id (재진입 시 편집 내용 보존)

  // 학교 목록 로드
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((s) => {
        if (!alive) return
        const list = Array.isArray(s) ? s : []
        setSchools(list)
        if (list.length) setSid(list[0].id)
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // 전 학교 평가 목록 로드 → 학교 행 요약(건수/최근일)과 2단계 그룹에 사용
  useEffect(() => {
    if (!schools.length) return
    let alive = true
    setSumLoading(true)
    Promise.all(
      schools.map((s) =>
        api<RiskItem[]>(`/risk?school_id=${s.id}`)
          .then((d) => [s.id, Array.isArray(d) ? d : []] as const)
          .catch(() => [s.id, []] as const),
      ),
    ).then((entries) => {
      if (!alive) return
      setRiskMap(Object.fromEntries(entries))
      setSumLoading(false)
    })
    return () => { alive = false }
  }, [schools])

  // 특정 학교만 재조회 (생성 후 / 학교 진입 시 최신화)
  const refetchSchool = useCallback((schoolId: string) => {
    api<RiskItem[]>(`/risk?school_id=${schoolId}`)
      .then((d) => setRiskMap((m) => ({ ...m, [schoolId]: Array.isArray(d) ? d : [] })))
      .catch(() => { /* 캐시 유지 */ })
  }, [])

  // 조사표 탭 활성 + 학교 변경 시 백엔드에서 조사표 로드 (GET /risk/survey)
  useEffect(() => {
    if (!regularEdit || !sid) return
    if (surveyLoadedSid.current === sid) return // 같은 학교면 재조회하지 않아 편집 내용 보존
    let alive = true
    setSurveyLoading(true)
    setSurveyErr('')
    setSurveyMsg('')
    api<SurveyGetResp>(`/risk/survey?school_id=${sid}`)
      .then((r) => {
        if (!alive) return
        setSurvey(mergeSurvey(r.sections ?? {}))
        surveyLoadedSid.current = sid
        setSurveyLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setSurveyErr(e instanceof Error ? e.message : '오류')
        setSurveyLoading(false)
      })
    return () => { alive = false }
  }, [sid, regularEdit])

  async function seedMaster() {
    if (busy) return
    setBusy(true)
    setActionErr('')
    try {
      await api('/risk/master', {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            process: process || 'catering',
            task_name: '조리작업',
            hazard_factor: 'chemical',
            legal_basis: '산안기준규칙',
            situation: '화상 위험',
            likelihood: 3,
            severity: 3,
            measure: '보호구 착용',
          }],
        }),
      })
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '시드 실패')
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    if (!sel || busy) return
    setBusy(true)
    setActionErr('')
    try {
      // category 는 백엔드가 optional 수용 예정 — 미지원이어도 무해(Pydantic 이 무시)
      await api('/risk/generate', {
        method: 'POST',
        body: JSON.stringify({ school_id: sel.id, process, category: genCategory }),
      })
      setOpen(false)
      refetchSchool(sel.id)
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  // ── 1단계: 학교 목록 데이터 ──
  const schoolRows: SchoolRow[] = useMemo(
    () => schools.map((s) => {
      const list = riskMap[s.id] ?? []
      const latest = list.reduce((m, it) => {
        const d = (it.created_at ?? '').slice(0, 10)
        return d > m ? d : m
      }, '')
      return {
        ...s,
        count: list.length,
        adhocCount: list.filter((it) => catOf(it) === 'adhoc').length,
        latest,
      }
    }),
    [schools, riskMap],
  )
  const totalCount = useMemo(() => schoolRows.reduce((a, r) => a + r.count, 0), [schoolRows])
  const totalAdhoc = useMemo(() => schoolRows.reduce((a, r) => a + r.adhocCount, 0), [schoolRows])
  const q = useTableQuery(schoolRows, SCHOOL_QUERY)

  function openSchool(s: School) {
    setSel(s)
    setSid(s.id) // 조사표 탭도 같은 학교로 동기화
    setCtxTab('regular') // 기본 정기 탭 (리스트에서 수시 행 클릭 시 호출측에서 'adhoc'으로 재지정)
    setCollapsed({})
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

  // ── 2단계: 선택 학교 연도별 그룹 ──
  const selItems = sel ? riskMap[sel.id] ?? [] : []
  const yearGroups = useMemo(() => groupByYear(selItems), [selItems])
  const selUnsafe = selItems.reduce((acc, it) => acc + (it.unsafe_count || 0), 0)
  const flatQ = useTableQuery(selItems, FLAT_QUERY) // 내보내기용

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  // ── 3단계: 상세 드릴다운 모달 (기존 재사용) ──
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<RiskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openDetail(id: string) {
    setDetailOpen(true)
    setDetail(null)
    setDetailLoading(true)
    setEditErr('')
    try {
      setDetail(await api<RiskDetail>(`/risk/${id}`))
    } catch {
      /* null 유지 → 실패 표시 */
    } finally {
      setDetailLoading(false)
    }
  }

  // ── 항목 점수/불완전 편집 + 평가 완료 (PUT scores·unsafe / POST complete) ──
  const [editBusy, setEditBusy] = useState('')
  const [editErr, setEditErr] = useState('')

  async function refreshDetail(aid: string) {
    try { setDetail(await api<RiskDetail>(`/risk/${aid}`)) } catch { /* 기존 표시 유지 */ }
    if (sel) refetchSchool(sel.id)
  }

  async function updateScores(it: RiskDetailItem, likelihood: number, severity: number) {
    if (!detail) return
    setEditBusy(it.id)
    setEditErr('')
    try {
      await api(`/risk/${detail.id}/items/${it.id}/scores`, {
        method: 'PUT', body: JSON.stringify({ likelihood, severity }),
      })
      await refreshDetail(detail.id)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : '점수 저장 실패')
    } finally {
      setEditBusy('')
    }
  }

  async function classifyUnsafe(it: RiskDetailItem, unsafeType: string) {
    if (!detail || !unsafeType) return
    setEditBusy(it.id)
    setEditErr('')
    try {
      await api(`/risk/${detail.id}/items/${it.id}/unsafe`, {
        method: 'PUT', body: JSON.stringify({ unsafe_type: unsafeType }),
      })
      await refreshDetail(detail.id)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : '분류 저장 실패')
    } finally {
      setEditBusy('')
    }
  }

  async function completeAssessment() {
    if (!detail) return
    setEditBusy('complete')
    setEditErr('')
    try {
      await api(`/risk/${detail.id}/complete`, { method: 'POST' })
      await refreshDetail(detail.id)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : '완료 처리 실패')
    } finally {
      setEditBusy('')
    }
  }

  // ── 조사표(백엔드) 핸들러 — PUT /risk/survey ──
  async function saveSurvey() {
    if (!sid || surveyBusy) return
    setSurveyBusy(true)
    setSurveyErr('')
    setSurveyMsg('')
    try {
      const r = await api<SurveyPutResp>('/risk/survey', {
        method: 'PUT',
        body: JSON.stringify({ school_id: sid, sections: survey }),
      })
      surveyLoadedSid.current = sid
      const when = r.updated_at ? r.updated_at.replace('T', ' ').slice(0, 16) : ''
      setSurveyMsg(when ? `저장되었습니다. · ${when}` : '저장되었습니다.')
    } catch (e) {
      setSurveyErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSurveyBusy(false)
    }
  }
  function toggleCheck(field: CheckField, item: string) {
    setSurvey((d) => {
      const cur = d[field]
      const next: Record<string, boolean> = { ...cur, [item]: !cur[item] }
      return { ...d, [field]: next }
    })
    setSurveyMsg('')
  }
  function addMachine() {
    setSurvey((d) => ({ ...d, machines: [...d.machines, { id: rid(), name: '', cycle: '', last_date: '' }] }))
    setSurveyMsg('')
  }
  function updateMachine(id: string, key: keyof Omit<MachineRow, 'id'>, value: string) {
    setSurvey((d) => ({ ...d, machines: d.machines.map((m) => (m.id === id ? { ...m, [key]: value } : m)) }))
    setSurveyMsg('')
  }
  function removeMachine(id: string) {
    setSurvey((d) => ({ ...d, machines: d.machines.filter((m) => m.id !== id) }))
    setSurveyMsg('')
  }

  // 그룹 테이블 (연도 × 정기/수시) — 행 클릭 시 상세 모달
  function renderGroup(year: string, cat: RiskCategory, rows: RiskItem[]) {
    if (rows.length === 0) return null
    const key = `${year}:${cat}`
    const isOpen = !collapsed[key]
    return (
      <div className="rkh-group" key={key}>
        <button className="rkh-grouphead" onClick={() => toggleGroup(key)}>
          <span className={'rkh-chev' + (isOpen ? ' open' : '')}><ChevronRight size={15} /></span>
          {year !== '연도 미상' ? `${year}년 ` : `${year} `}{CATEGORY_LABEL[cat]} 평가
          <span className={'pillx ' + (cat === 'regular' ? 'doing' : 'warn')}>{CATEGORY_LABEL[cat]}</span>
          <span className="rkh-count">{rows.length}건</span>
        </button>
        {isOpen && (
          <div className="rkh-groupbody">
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>공정</th>
                    <th className="c">항목수</th>
                    <th className="c">불완전</th>
                    <th className="c">상태</th>
                    <th>작성일</th>
                    <th>구분</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.id} onClick={() => openDetail(it.id)}>
                      <td><b>{PROCESS_LABEL[it.process] || it.process}</b></td>
                      <td className="c">{it.count}</td>
                      <td className="c">
                        <span className={'pillx ' + (it.unsafe_count > 0 ? 'late' : 'ok')}>{it.unsafe_count}</span>
                      </td>
                      <td className="c">
                        <span className={'pillx ' + (STATUS_PILL[it.status] || 'todo')}>{STATUS_LABEL[it.status] || it.status}</span>
                      </td>
                      <td>{(it.created_at ?? '').slice(0, 10) || '—'}</td>
                      <td>
                        <span className="rkh-badges">
                          <span className={'pillx ' + (cat === 'regular' ? 'doing' : 'warn')}>{CATEGORY_LABEL[cat]}</span>
                          {cat === 'adhoc' && isAccidentLinked(it) && <span className="pillx late">산재 연동</span>}
                        </span>
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
          ? <><a onClick={() => setSel(null)} style={{ cursor: 'pointer' }}>위험성평가</a> / <b>{sel.name}</b></>
          : <b>위험성평가</b>}
      </div>
      <div className="bar">
        <h2><ClipboardCheck size={20} /> 위험성평가</h2>
        <div className="sp" />
        {/* 상단 탭 정리(0806): '학교별 평가'·'정기 위험성평가(보고서 작성)' 탭 제거 —
            학교 선택 후 [정기]/[수시] 버튼으로 전환, 보고서 작성은 정기 카드의 '이어서 작성'으로 진입 */}
      </div>

      {!sel && (
        <>
          {actionErr && <div className="login-err" style={{ marginBottom: 12 }}>{actionErr}</div>}

          {/* [066] 내 평가 작업 스트립 */}
          <MyWorkStrip title="내 평가 작업" items={myWorkItems} mineOnly={!!myIds} />

          {/* [063] 학교 탭과 동일한 검색 패널 */}
          <WorkSearchPanel onSearch={doPanelSearch} onClear={(f) => setApplied((a) => ({ ...a, [f]: '' }))} />

          <div className="ledger">
            <div className="lh">
              <h2><ClipboardCheck size={18} /> 작성된 보고서</h2>
              <span className="pillx doing">{rq.total}건</span>
              <div className="sp" />
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortableTh q={rq} col="date">최근 저장</SortableTh>
                    <th className="c">구분</th>
                    <th>보고서</th>
                    <SortableTh q={rq} col="name">학교</SortableTh>
                    <th>진행</th>
                    <th className="c">상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(loading || docLoading) && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && error && <tr><td colSpan={7}><div className="tstate">오류: {error}</div></td></tr>}
                  {!loading && !docLoading && !error && rq.view.map((r, i) => (
                    <tr key={r.school.id + r.kind + i} onClick={() => { openSchool(r.school); if (r.kind === '수시') setCtxTab('adhoc') }}>
                      <td>{r.date || '—'}</td>
                      <td className="c"><span className={'pillx ' + (r.kind === '수시' ? 'warn' : 'doing')}>{r.kind}</span></td>
                      <td><b>{r.title}</b></td>
                      <td>{r.school.name}</td>
                      <td>{r.progress}</td>
                      <td className="c"><span className={'pillx ' + r.statusCls}>{r.statusLabel}</span></td>
                      <td className="c"><span className="chev"><ChevronRight size={15} /></span></td>
                    </tr>
                  ))}
                  {!loading && !docLoading && !error && rq.view.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">{reportRows.length === 0 ? '작성된 보고서가 없습니다. 학교 탭의 [위험성평가] 바로가기에서 작성하세요.' : '조건에 맞는 보고서가 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={rq} />
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            학교를 선택하면 연도별 정기·수시 위험성평가 목록이 표시됩니다. 산업재해 발생 시 생성된 수시 평가도 함께 관리됩니다.
          </div>
        </>
      )}

      {sel && (
        <>
          {actionErr && <div className="login-err" style={{ marginBottom: 12 }}>{actionErr}</div>}

          <div className="rkh-schoolhead">
            <button className="rkh-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="rkh-schoolname">{sel.name}</span>
            <span className="rkh-schoolmgr">담당자 {sel.manager || '—'}</span>
            {/* 정기/수시 전환 버튼 — 사용자 구상안(0806): 상단 우측 버튼 + 아래 전체 폭 리스트 */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className={'btn ' + (ctxTab === 'regular' ? 'btn-primary' : 'btn-ghost')}
                onClick={() => { setCtxTab('regular'); setRegularEdit(false) }}
              >
                정기 위험성평가
              </button>
              <button
                className={'btn ' + (ctxTab === 'adhoc' ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setCtxTab('adhoc')}
                style={{ position: 'relative' }}
              >
                수시 위험성평가
                {ctxPending > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, background: 'var(--red-soft)', color: 'var(--red-ink)', borderRadius: 999, padding: '2px 8px' }}>
                    미착수 {ctxPending}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── 선택된 유형의 리스트를 전체 폭으로 표시 (편집 모드 시 카드 대신 아래 편집기 렌더) ── */}
          {ctxTab === 'regular' && !regularEdit && (() => {
            const d = ctxReport?.d
            const deptDone = d?.dept_info ? Object.values(d.dept_info).filter((x) => x.etc.reviewed).length : 0
            const hearAll = d?.hearing ? Object.values(d.hearing) : []
            const hearDone = hearAll.filter((h) => h.done).length
            const assessRows = d?.assess ? Object.values(d.assess).flat() : []
            const highRows = assessRows.filter((r) => r.likelihood * r.severity >= 8).length
            const partCnt = d?.participants?.length ?? 0
            const started = !!(d && (d.report_info || d.dept_info || (d.hearing && hearAll.length) || assessRows.length || partCnt))
            const year = d?.report_info?.report_ym?.slice(0, 4) || String(new Date().getFullYear())
            const chip = (ok: boolean, label: string) => (
              <span className={'pillx ' + (ok ? 'ok' : 'todo')} key={label}>{label}</span>
            )
            // 섹션 완성 여부 → 보고서 상태 (미작성 / 작성 중 / 작성 완료)
            const secOk = [
              !!d?.report_info,
              deptDone >= 5,
              hearAll.length > 0 && hearDone === hearAll.length,
              assessRows.length > 0,
              partCnt > 0,
            ]
            const okCnt = secOk.filter(Boolean).length
            const status: [string, string] = !started ? ['미작성', 'todo'] : okCnt === 5 ? ['작성 완료', 'ok'] : ['작성 중', 'doing']
            return (
              <div className="ledger" style={{ marginBottom: 0 }}>
                <div className="lh">
                  <h2><ClipboardCheck size={18} /> 위험성평가 보고서 리스트</h2>
                  <div className="sp" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>연 1회 정기 실시 · 연도별 1부</span>
                </div>
                <div className="twrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>보고서</th>
                        <th>진행 상황</th>
                        <th className="c">상태</th>
                        <th>최근 저장</th>
                        <th className="c">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr onClick={() => { setSid(sel.id); setRegularEdit(true) }} style={{ cursor: 'pointer' }}>
                        <td><b>{year}년 정기 위험성평가 결과보고서</b></td>
                        <td>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {chip(secOk[0], '① 학교 현황')}
                            {chip(secOk[1], `② 유해위험정보 ${deptDone}/5`)}
                            {chip(secOk[2], `③ 청취조사 ${hearDone}/${hearAll.length}`)}
                            {chip(secOk[3], `④ 평가표 ${assessRows.length}건`)}
                            {chip(secOk[4], `⑤ 참여자 ${partCnt}명`)}
                            {highRows > 0 && <span className="pillx warn">8점 이상 {highRows}건</span>}
                          </div>
                        </td>
                        <td className="c"><span className={'pillx ' + status[1]}>{status[0]}</span></td>
                        <td>{started && ctxReport?.updated ? ctxReport.updated.slice(0, 10) : '—'}</td>
                        <td className="c" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setSid(sel.id); setRegularEdit(true) }}>
                              {started ? '이어서 작성' : '작성'}
                            </button>
                            {started && (
                              <button
                                className="btn btn-primary"
                                style={{ fontSize: 12 }}
                                onClick={() => {
                                  setSid(sel.id)
                                  if (d) { setSurvey(d); surveyLoadedSid.current = sel.id }
                                  setReportOpen(true)
                                }}
                              >
                                보고서 출력
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '0 24px 14px', fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                  해가 바뀌면 새 연도의 보고서 행이 추가되고, 지난 연도 보고서는 이 리스트에 쌓입니다 (작년 작성분은 새 보고서에 자동 프리필).
                </div>
              </div>
            )
          })()}

          {/* ── 수시 위험성평가 (사고성 산재 연동 프로세스) ── */}
          {ctxTab === 'adhoc' && (
            <AdhocSection
              sid={sel.id}
              schoolName={sel.name}
              cases={ctxReport?.d.adhoc_cases}
              onChange={setCtxCases}
              onSave={() => { void saveCtxDoc() }}
              busy={ctxBusy}
            />
          )}
        </>
      )}

      {sel && ctxTab === 'regular' && regularEdit && (
        <div className="ledger">
          <div className="lh">
            <button className="rkh-back" onClick={() => setRegularEdit(false)}><ArrowLeft size={14} /> 보고서 개요</button>
            <h2 style={{ marginLeft: 8 }}><ClipboardCheck size={18} /> 정기 위험성평가 결과보고서 작성</h2>
            <button className="btn btn-primary" style={{ marginLeft: 14 }} onClick={() => setReportOpen(true)} disabled={!sid}>
              보고서 출력
            </button>
            <div className="sp" />
            <span className="pillx doing" style={{ whiteSpace: 'normal', lineHeight: 1.5 }}>
              법령근거 「산업안전보건법」제36조 · 「중대재해처벌법 시행령」제4조3항
            </span>
          </div>
          <div style={{ padding: '18px 24px' }}>
            <div style={SUBTAB_BAR}>
              {SURVEY_TABS.map((t) => (
                <button key={t.key} style={subTabStyle(surveyTab === t.key)} onClick={() => { setSurveyTab(t.key); setSurveyMsg('') }}>
                  {t.label}
                </button>
              ))}
            </div>

            {surveyTab === 'info' && (
              <ReportInfo
                sid={sid}
                school={schools.find((s) => s.id === sid)}
                value={survey.report_info}
                onChange={(v) => { setSurvey((d) => ({ ...d, report_info: v })); setSurveyMsg('') }}
                onSave={saveSurvey}
                busy={surveyBusy}
                msg={surveyMsg}
                onNext={() => { setSurveyTab('dept'); setSurveyMsg('') }}
              />
            )}

            {surveyTab === 'participants' && (
              <Participants
                sid={sid}
                value={survey.participants}
                hearing={survey.hearing}
                hearingPrev={survey.hearing_prev}
                onChange={(rows) => { setSurvey((d) => ({ ...d, participants: rows })); setSurveyMsg('') }}
                onSave={saveSurvey}
                busy={surveyBusy}
                msg={surveyMsg}
              />
            )}

            {surveyTab === 'dept' && (
              <DeptHazardInfo
                sid={sid}
                value={survey.dept_info}
                prev={survey.dept_info_prev}
                onChange={(docNext) => { setSurvey((d) => ({ ...d, dept_info: docNext })); setSurveyMsg('') }}
                onSave={saveSurvey}
                busy={surveyBusy}
                msg={surveyMsg}
                onNext={() => { setSurveyTab('hearing'); setSurveyMsg('') }}
              />
            )}

            {surveyTab === 'hearing' && (
              <HearingSurvey
                sid={sid}
                value={survey.hearing}
                prev={survey.hearing_prev}
                onChange={(docNext) => { setSurvey((d) => ({ ...d, hearing: docNext })); setSurveyMsg('') }}
                onSave={saveSurvey}
                busy={surveyBusy}
                msg={surveyMsg}
                onNext={() => { setSurveyTab('assess'); setSurveyMsg('') }}
              />
            )}

            {surveyTab === 'assess' && (
              <AssessmentTable
                sid={sid}
                part={assessPart}
                onPart={setAssessPart}
                assess={survey.assess}
                behavior={survey.reduce_behavior}
                state={survey.reduce_state}
                deptInfo={survey.dept_info}
                hearing={survey.hearing}
                onChange={(next) => {
                  setSurvey((d) => ({
                    ...d,
                    ...(next.assess ? { assess: next.assess } : {}),
                    ...(next.behavior ? { reduce_behavior: next.behavior } : {}),
                    ...(next.state ? { reduce_state: next.state } : {}),
                  }))
                  setSurveyMsg('')
                }}
                onSave={saveSurvey}
                busy={surveyBusy}
                msg={surveyMsg}
                onNext={() => { setSurveyTab('participants'); setSurveyMsg('') }}
              />
            )}

            {surveyLoading && <div className="tstate" style={{ marginTop: 16 }}>불러오는 중…</div>}
            {surveyErr && <div className="login-err" style={{ marginTop: 16 }}>{surveyErr}</div>}
            {surveyMsg && <div className="pillx ok" style={{ marginTop: 16 }}>{surveyMsg}</div>}
          </div>
        </div>
      )}

      {reportOpen && (
        <RiskReport
          schoolName={schools.find((s) => s.id === sid)?.name ?? '학교'}
          data={{
            report_info: survey.report_info,
            dept_info: survey.dept_info,
            assess: survey.assess,
            reduce_behavior: survey.reduce_behavior,
            reduce_state: survey.reduce_state,
            participants: survey.participants,
          }}
          onClose={() => setReportOpen(false)}
        />
      )}

      {open && sel && (
        <Modal
          title={`위험성평가 생성 · ${sel.name}`}
          onClose={() => { if (!busy) setOpen(false) }}
          footer={(
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={generate}>
                {busy ? '생성 중…' : '생성'}
              </button>
            </>
          )}
        >
          {actionErr && <div className="login-err">{actionErr}</div>}
          <label className="field">
            <span>공정</span>
            <select className="select" value={process} onChange={(e) => setProcess(e.target.value)}>
              {PROCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>구분</span>
            <select className="select" value={genCategory} onChange={(e) => setGenCategory(e.target.value as RiskCategory)}>
              <option value="regular">정기 — 연 1회 이상 정기 실시</option>
              <option value="adhoc">수시 — 산재·공정 변경 등 사유 발생 시</option>
            </select>
          </label>
        </Modal>
      )}

      {detailOpen && (
        <Modal
          title="위험성평가 상세"
          onClose={() => { setDetailOpen(false); setDetail(null) }}
          footer={
            <>
              {detail && detail.status !== 'completed' && (
                <button className="btn btn-ghost" disabled={editBusy !== ''} onClick={() => void completeAssessment()}>
                  {editBusy === 'complete' ? '완료 처리 중…' : '평가 완료'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => { setDetailOpen(false); setDetail(null) }}>닫기</button>
            </>
          }
        >
          {detailLoading && <div className="tstate">불러오는 중…</div>}
          {!detailLoading && !detail && <div className="tstate">불러오기 실패</div>}
          {!detailLoading && detail && (
            <>
              <div className="kv"><b>공정</b><span>{PROCESS_LABEL[detail.process] || detail.process}</span></div>
              <div className="kv">
                <b>구분</b>
                <span className="rkh-badges">
                  <span className={'pillx ' + (catOf(detail) === 'regular' ? 'doing' : 'warn')}>{CATEGORY_LABEL[catOf(detail)]}</span>
                  {catOf(detail) === 'adhoc' && isAccidentLinked(detail) && <span className="pillx late">산재 연동</span>}
                </span>
              </div>
              <div className="kv"><b>작성일</b><span>{(detail.created_at ?? '').slice(0, 10) || '—'}</span></div>
              <div className="kv"><b>상태</b><span>{STATUS_LABEL[detail.status] || detail.status}</span></div>
              <div className="kv"><b>불완전</b><span>{detail.unsafe_count} / {detail.count} 건</span></div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>
                위험요인 항목 ({detail.items.length})
                {detail.status !== 'completed' && (
                  <span className="muted" style={{ fontWeight: 500, marginLeft: 8, fontSize: 11.5 }}>
                    가능성×중대성 = 위험성, 8점 이상 자동 불완전 분류
                  </span>
                )}
              </div>
              {editErr && <div className="muted" style={{ color: 'var(--red-ink)', fontSize: 12, fontWeight: 600 }}>{editErr}</div>}
              <div className="twrap">
                <table className="tbl">
                  <thead><tr><th>작업</th><th>분류</th><th className="c">가능성</th><th className="c">중대성</th><th className="c">위험성</th><th className="c">판정</th></tr></thead>
                  <tbody>
                    {detail.items.map((it) => {
                      const editable = detail.status !== 'completed'
                      return (
                        <tr key={it.id}>
                          <td>{it.task_name}</td>
                          <td>{HAZARD_LABEL[it.hazard_factor] || it.hazard_factor}</td>
                          <td className="c">
                            {editable ? (
                              <select className="select" style={{ width: 56, padding: '2px 4px' }} value={it.likelihood}
                                disabled={editBusy !== ''}
                                onChange={(e) => void updateScores(it, Number(e.target.value), it.severity)}>
                                {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            ) : it.likelihood}
                          </td>
                          <td className="c">
                            {editable ? (
                              <select className="select" style={{ width: 56, padding: '2px 4px' }} value={it.severity}
                                disabled={editBusy !== ''}
                                onChange={(e) => void updateScores(it, it.likelihood, Number(e.target.value))}>
                                {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            ) : it.severity}
                          </td>
                          <td className="c"><b>{it.risk_score}</b></td>
                          <td className="c">
                            {it.is_unsafe ? (
                              editable ? (
                                <select className="select" style={{ width: 130, padding: '2px 4px' }}
                                  value={it.unsafe_type || ''} disabled={editBusy !== ''}
                                  onChange={(e) => void classifyUnsafe(it, e.target.value)}>
                                  <option value="">불완전(미분류)</option>
                                  <option value="condition">불완전한 상태</option>
                                  <option value="act">불완전한 행동</option>
                                </select>
                              ) : (
                                <span className="pillx late">불완전{it.unsafe_type ? ` · ${UNSAFE_LABEL[it.unsafe_type] || it.unsafe_type}` : ''}</span>
                              )
                            ) : <span className="pillx ok">양호</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {detail.items.length === 0 && <tr><td colSpan={6}><div className="tstate">항목 없음</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
