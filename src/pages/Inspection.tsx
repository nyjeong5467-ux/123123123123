// 안전점검 — 학교 목록(1단계) → 학교별 월별 이력(2단계) → 상세 모달 위계.
// Risk.tsx("학교별 평가")와 동일 패턴: 학교 테이블 → 백버튼 있는 학교 컨텍스트 → 드릴다운 모달.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ClipboardCheck, Trash2 } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Modal } from '../components/Modal'
import { useTableQuery, type TableQueryConfig } from '../lib/useTableQuery'
import { ExportButton, Pagination, SortableTh, type ExportColumn } from '../components/table'
import { WorkSearchPanel, type WorkSearch } from '../components/table/WorkSearchPanel'
import { InspectionSheetView, SignImage, type SheetData } from '../components/InspectionSheetView'
import { resolveExtra, type InspExtra, type PhotoSlot } from '../lib/inspExtra'
import '../styles/hier.css'
import '../styles/inspecthier.css'

const PART_LABEL: Record<string, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}
const PART_OPTIONS: { value: string; label: string }[] = [
  { value: 'catering', label: '급식' },
  { value: 'facility', label: '시설' },
  { value: 'cleaning', label: '미화' },
  { value: 'commute', label: '통학' },
  { value: 'night_duty', label: '당직' },
]
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: '작성중', cls: 'todo' },
  signed: { label: '서명완료', cls: 'doing' },
  submitted: { label: '제출 완료', cls: 'ok' },
}
const EDUOFFICE: Record<string, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'todo' },
  success: { label: '전송완료', cls: 'ok' },
  failed: { label: '실패', cls: 'late' },
  not_required: { label: '해당없음', cls: 'na' },
}
const RESULT_LABEL: Record<string, string> = { good: '양호', poor: '미흡', na: '해당없음' }

const LEVELS = ['유', '초', '중', '고', '기타']
const LEVEL_ORDER: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }

type InsItem = { code: string; label: string; result: string | null; remark: string; photos: string[] }
type InsSig = { signer: string; signed_at: string | null; image_ref: string }
type InsFollowUp = { id: string; item_code: string; description: string; status: string }
type Inspection = {
  id: string
  part: string
  status: string
  eduoffice_submit_status: string
  items: InsItem[]
  signatures: InsSig[]
  followups: InsFollowUp[]
  signed_at?: string | null
  submitted_at?: string | null
  created_at?: string | null // 백엔드 엔티티에 아직 없음 — 생기면 자동 수용
}
type School = { id: string; name: string; manager?: string; school_level?: string; address?: string; assigned_inspector_id?: string }

// [perf-0828] 목록 요약은 GET /inspections/summary 1콜의 경량 항목(items/followups 없음).
// 상세·실물양식 등 전체 데이터가 필요한 경로는 해당 학교 1곳만 GET /inspections?school_id= 로 지연 조회.
type InsSummary = Omit<Inspection, 'items' | 'followups'> & { school_id?: string; inspector_id?: string }
const liteToInspection = (e: InsSummary): Inspection => ({ ...e, items: [], followups: [] })

// [073] 모듈 스코프 세션 캐시 — 탭 재진입 때마다 요약 API가 재발사되지 않게 유지. 브라우저 새로고침 시 소멸.
// full: 학교별 전체 목록(items 포함)을 이미 받아둔 학교 표시 — 지연 조회 중복 방지 [perf-0828]
// [088] fetchedAt 추가 — 오래된 캐시는 재진입 시 백그라운드 재검증(현장 앱 제출분 반영).
let insSession: {
  account: string
  schools: School[]
  map: Record<string, Inspection[]>
  full: Record<string, true>
  fetchedAt: number
} | null = null
const INS_CACHE_TTL = 60_000

// [076] 담당 학교 한정 조회 — 담당 배정이 있는 계정은 담당 학교만 학교별 API를 조회(N+1 축소, [060] 규칙).
// 배정이 없는 계정은 기존대로 전체 조회. 리스트에는 조회된 학교의 작성물만 표시됨.
function scopeToAssigned(schools: School[], login?: string): School[] {
  const mine = login ? schools.filter((s) => s.assigned_inspector_id === login) : []
  return mine.length ? mine : schools
}

// 점검 일자 — 엔티티에 created_at 이 없어 제출일 → 서명일 → 서명기록 순으로 방어적으로 산출
function dateOf(r: Inspection): string {
  const d = r.submitted_at || r.signed_at || r.signatures?.[0]?.signed_at || r.created_at || ''
  return String(d).slice(0, 10)
}

// [사진대지 매칭 폴백] resolveExtra — src/lib/inspExtra.ts 로 이동(작성/수정 화면과 공용).

// ===== 1단계: 학교 목록 (점검 요약) =====
type SchoolRow = School & {
  count: number
  draft: number
  signed: number
  submitted: number
  latest: string
}

const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [
    {
      key: 'level',
      label: '구분',
      options: LEVELS.map((l) => ({ value: l, label: l })),
      accessor: (r) => r.school_level ?? '',
    },
  ],
  sortAccessors: {
    level: (r) => LEVEL_ORDER[r.school_level ?? ''] ?? 99,
    name: (r) => r.name,
    manager: (r) => r.manager ?? '',
    count: (r) => r.count,
    latest: (r) => r.latest,
  },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '구분', value: (r) => r.school_level || '' },
  { header: '학교', value: (r) => r.name },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '점검 건수', value: (r) => r.count },
  { header: '작성중', value: (r) => r.draft },
  { header: '서명완료', value: (r) => r.signed },
  { header: '제출 완료', value: (r) => r.submitted },
  { header: '최근 점검일', value: (r) => r.latest },
]

// ===== 1단계(개편 0807 · 0809): 작성된 점검표 리스트 =====
// 점검표는 "종사자 안전·보건 점검표" 1장 단위(한 번 작성 시 여러 공정 점검이 함께 생성됨) —
// 공정별 개별 행이 아니라 학교×점검일 단위로 묶어 표시 [051]
type InsReportRow = {
  school: School
  date: string // '' = 작성중(일자 미상)
  parts: Inspection[]
  status: 'draft' | 'signed' | 'submitted'
  eduoffice: string
}
const REPORT_QUERY: TableQueryConfig<InsReportRow> = {
  searchFields: [(r) => r.school.name, (r) => r.school.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [
    {
      key: 'status',
      label: '작성현황',
      options: [
        { value: 'draft', label: '작성중' },
        { value: 'signed', label: '서명완료' },
        { value: 'submitted', label: '제출 완료' },
      ],
      accessor: (r) => r.status,
    },
    {
      key: 'level',
      label: '구분',
      options: LEVELS.map((l) => ({ value: l, label: l })),
      accessor: (r) => r.school.school_level ?? '',
    },
  ],
  sortAccessors: {
    date: (r) => r.date,
    name: (r) => r.school.name,
    level: (r) => LEVEL_ORDER[r.school.school_level ?? ''] ?? 99, // 구분(학교급) 정렬 [070]
  },
  initialSort: { key: 'date', dir: 'desc' },
}
const REPORT_EXPORT: ExportColumn<InsReportRow>[] = [
  { header: '점검일', value: (r) => r.date },
  { header: '학교', value: (r) => r.school.name },
  { header: '담당자', value: (r) => r.school.manager || '' },
  { header: '포함 공정', value: (r) => r.parts.map((p) => PART_LABEL[p.part] || p.part).join(' · ') },
  { header: '작성현황', value: (r) => STATUS[r.status]?.label || r.status },
  { header: '교육청전송', value: (r) => EDUOFFICE[r.eduoffice]?.label || r.eduoffice },
]
// 공정별 점검들을 점검표 1장으로 묶기 — 상태·교육청 전송은 보수적으로 집계
function groupToSheets(school: School, list: Inspection[]): InsReportRow[] {
  const map = new Map<string, Inspection[]>()
  for (const ins of list) {
    const key = ins.status === 'draft' ? '' : dateOf(ins)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ins)
  }
  return [...map.entries()].map(([date, parts]) => {
    const anyDraft = parts.some((p) => p.status === 'draft')
    const allSubmitted = parts.every((p) => p.status === 'submitted')
    // 목서버는 'submitted'로 응답 — 라벨 맵 키(success)와 불일치 보정
    const eduoffice = parts.some((p) => p.eduoffice_submit_status === 'submitted' || p.eduoffice_submit_status === 'success')
      ? 'success'
      : parts.some((p) => p.eduoffice_submit_status === 'pending')
        ? 'pending'
        : parts.some((p) => p.eduoffice_submit_status === 'failed') ? 'failed' : 'none'
    return {
      school, date, parts,
      status: anyDraft ? 'draft' : allSubmitted ? 'submitted' : 'signed',
      eduoffice,
    }
  })
}

// ===== 2단계: 월별 그룹 (안전점검은 매월 반복 업무) =====
const UNKNOWN_MONTH = '일자 미상'
type MonthGroup = { month: string; rows: Inspection[] }

function groupByMonth(items: Inspection[]): MonthGroup[] {
  const map = new Map<string, Inspection[]>()
  for (const it of items) {
    const m = dateOf(it).slice(0, 7) || UNKNOWN_MONTH
    if (!map.has(m)) map.set(m, [])
    map.get(m)!.push(it)
  }
  const byDateDesc = (a: Inspection, b: Inspection) => dateOf(b).localeCompare(dateOf(a))
  return [...map.keys()]
    .sort((a, b) => {
      if (a === UNKNOWN_MONTH) return 1 // 일자 미상(작성중 등)은 항상 마지막
      if (b === UNKNOWN_MONTH) return -1
      return b.localeCompare(a) // 최신 월 우선
    })
    .map((month) => ({ month, rows: [...map.get(month)!].sort(byDateDesc) }))
}

function monthLabel(m: string): string {
  if (m === UNKNOWN_MONTH) return m
  const [y, mm] = m.split('-')
  return `${y}년 ${Number(mm)}월`
}

// 2단계 내보내기(월 포함 플랫 목록)
const FLAT_QUERY: TableQueryConfig<Inspection> = {}
const FLAT_EXPORT: ExportColumn<Inspection>[] = [
  { header: '월', value: (r) => dateOf(r).slice(0, 7) },
  { header: '공정', value: (r) => PART_LABEL[r.part] || r.part },
  { header: '항목수', value: (r) => r.items.length },
  { header: '서명', value: (r) => (r.signatures.length > 0 ? '서명완료' : '미서명') },
  { header: '상태', value: (r) => STATUS[r.status]?.label || r.status },
  { header: '교육청전송', value: (r) => EDUOFFICE[r.eduoffice_submit_status]?.label || r.eduoffice_submit_status },
  { header: '점검일', value: (r) => dateOf(r) },
]

export function Inspection() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 학교별 점검 목록 캐시 — 1단계 요약·2단계 월별 그룹 공용
  const [insMap, setInsMap] = useState<Record<string, Inspection[]>>({})
  const [sumLoading, setSumLoading] = useState(false)

  // 위계 상태: 선택 학교(2단계) · 접힌 월 그룹
  const [sel, setSel] = useState<School | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 생성 모달 상태 (기존 기능 보존 — 학교 컨텍스트 안으로 이동)
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState('catering')
  const [busy, setBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')

  // 드릴다운 상세 모달 (기존 재사용)
  const [detail, setDetail] = useState<Inspection | null>(null)
  // 상세 모달 사진대지 썸네일 — 앱이 올린 사진을 '보기' 양식까지 안 가도 바로 확인 [사진표시 수정]
  const [detailPhotos, setDetailPhotos] = useState<{ label: string; slots: PhotoSlot[] }[]>([])
  // 상세 모달 결재선 — 현장앱 다중 결재란(서명 이미지 포함)도 상세에서 바로 확인 [서명·사진 출력 수정]
  const [detailLines, setDetailLines] = useState<NonNullable<InspExtra['approval_lines']>>([])
  // 점검 삭제 — 삭제 중 잠금(id) + 결과 토스트
  const [delBusy, setDelBusy] = useState('')
  const [delMsg, setDelMsg] = useState('')
  // 교육청 재전송(수정) — 전송완료 건을 수정 후 다시 대기열에 등재(봇이 기존 건 수정)
  const [resendBusy, setResendBusy] = useState(false)
  const [sheetView, setSheetView] = useState<SheetData | null>(null) // 실물 양식 보기 [054]
  // 부가정보(기타의견·사진대지·확인자 등)를 함께 불러와 양식에 표시 [057]
  async function openSheet(school: School, date: string, parts: Inspection[]) {
    // [perf-0828] 요약 캐시의 parts에는 items(점검 항목·사진 참조)가 없다 —
    // 이 학교 1곳만 전체 목록을 지연 조회해 실물양식용 완전판으로 교체(1클릭=1콜).
    let fullParts = parts
    try {
      const full = await ensureFull(school.id)
      const wanted = new Set(parts.map((p) => p.id))
      const found = full.filter((f) => wanted.has(f.id))
      if (found.length) fullParts = found
    } catch { /* 조회 실패 시 보유분으로 표시 */ }
    let extra: InspExtra | undefined
    try {
      const r = await api<{ doc: Record<string, InspExtra[]> }>('/ops/docs/inspection-extras')
      const ids = new Set(fullParts.map((p) => p.id))
      // id 직매칭 → 같은 점검일 → 학교 항목 사진 병합 폴백 (앱 파트별 제출로 ids가 어긋나도 사진 표시)
      extra = resolveExtra(r.doc?.[school.id], ids, date)
    } catch { /* 부가정보 없으면 기본 표시 */ }
    // [104] 대장 결재선 → 양식 결재란 칸 구성
    let approval: { title: string; name: string }[] | undefined
    try {
      const a = await api<{ steps: { title: string; name: string }[] }>(`/schools/${school.id}/approval-line`)
      if (a?.steps?.length) approval = a.steps
    } catch { /* 결재선 없으면 담당자 1칸 */ }
    setSheetView({ schoolName: school.name, manager: school.manager, date, parts: fullParts, extra, approval })
  }

  // 상세 모달 열릴 때 해당 점검의 사진대지 로드 — resolveExtra 폴백으로 앱 파트별 제출도 커버
  useEffect(() => {
    if (!detail || !sel) { setDetailPhotos([]); setDetailLines([]); return }
    let alive = true
    api<{ doc: Record<string, InspExtra[]> }>('/ops/docs/inspection-extras')
      .then((r) => {
        if (!alive) return
        const extra = resolveExtra(r.doc?.[sel.id], new Set([detail.id]), dateOf(detail))
        const photos = extra?.photos ?? {}
        const own = PART_LABEL[detail.part]
        // 이 공정 사진이 있으면 그것만, 없으면(첫 파트에만 묶여 온 경우 등) 학교 점검표 전체 사진을 라벨별 표시
        const groups = photos[own]?.length
          ? [{ label: own, slots: photos[own] }]
          : Object.entries(photos).map(([label, slots]) => ({ label, slots }))
        setDetailPhotos(groups.filter((g) => (g.slots ?? []).some((s) => s.dataUrl)))
        setDetailLines(extra?.approval_lines ?? [])
      })
      .catch(() => { if (alive) { setDetailPhotos([]); setDetailLines([]) } })
    return () => { alive = false }
  }, [detail, sel])

  // 학교 목록 로드 — 세션 캐시 적중 시 재조회 없이 복원 [073]
  useEffect(() => {
    const acct = user?.login ?? ''
    if (insSession && insSession.account === acct) {
      setSchools(insSession.schools)
      setInsMap(insSession.map)
      setLoading(false)
      return
    }
    let alive = true
    api<School[]>('/schools')
      .then((d) => {
        if (!alive) return
        setSchools(Array.isArray(d) ? d : [])
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // [perf-0828] 전 학교 점검 요약 로드 — 학교별 GET /inspections를 학교 수(700+)만큼 병렬 발사해
  // 운영 백엔드를 프리즈시키던 N+1 폭주를 집계 1콜(GET /inspections/summary)로 대체.
  // 응답은 경량 항목({id, part, status, eduoffice, signed/submitted_at, signatures})이라
  // 요약(건수/상태 분포/최근일)·점검표 그룹핑(dateOf)에는 충분하고, items가 필요한 경로는 지연 조회.
  useEffect(() => {
    if (!schools.length) return
    // 캐시 적중 + 신선(TTL 이내) — 재조회 0건 [073]. 오래되면 표시는 유지한 채
    // 요약 1콜만 재발사(stale-while-revalidate) [088] — 현장 앱 제출분이 재진입 시 반영.
    const fresh = insSession && insSession.schools === schools
      && Date.now() - insSession.fetchedAt < INS_CACHE_TTL
    if (fresh) return
    let alive = true
    if (!Object.keys(insMap).length) setSumLoading(true) // 데이터 있으면 표 유지(백그라운드 갱신)
    api<Record<string, InsSummary[]>>('/inspections/summary')
      .then((d) => {
        if (!alive) return
        // HQ는 전체가 오므로 기존 scopeToAssigned와 동일하게 클라이언트에서 담당 학교로 한정 [076]
        const scoped = scopeToAssigned(schools, user?.login)
        const allowed = new Set(scoped.map((s) => s.id))
        const map: Record<string, Inspection[]> = {}
        for (const s of scoped) map[s.id] = []
        for (const [sid, list] of Object.entries(d ?? {})) {
          if (!allowed.has(sid)) continue
          map[sid] = (Array.isArray(list) ? list : []).map(liteToInspection)
        }
        insSession = { account: user?.login ?? '', schools, map, full: {}, fetchedAt: Date.now() } // [073]
        setInsMap(map)
        setSumLoading(false)
      })
      .catch(() => { if (alive) setSumLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools])

  // 특정 학교만 전체(items 포함) 재조회 (생성 후 / 학교 진입 시 최신화) — 세션 캐시도 함께 갱신 [073]
  const refetchSchool = useCallback((schoolId: string) => {
    api<Inspection[]>(`/inspections?school_id=${schoolId}`)
      .then((d) => {
        const arr = Array.isArray(d) ? d : []
        if (insSession) {
          insSession.map = { ...insSession.map, [schoolId]: arr }
          insSession.full = { ...insSession.full, [schoolId]: true }
        }
        setInsMap((m) => ({ ...m, [schoolId]: arr }))
      })
      .catch(() => { /* 캐시 유지 */ })
  }, [])

  // [perf-0828] 전체 데이터 보장 — 요약 캐시(items 없음)인 학교만 1곳 지연 조회(1클릭=1콜).
  const ensureFull = useCallback(async (schoolId: string): Promise<Inspection[]> => {
    if (insSession?.full[schoolId] && insSession.map[schoolId]) return insSession.map[schoolId]
    const d = await api<Inspection[]>(`/inspections?school_id=${schoolId}`)
    const arr = Array.isArray(d) ? d : []
    if (insSession) {
      insSession.map = { ...insSession.map, [schoolId]: arr }
      insSession.full = { ...insSession.full, [schoolId]: true }
    }
    setInsMap((m) => ({ ...m, [schoolId]: arr }))
    return arr
  }, [])

  // 점검 삭제 — 서명·사진 파일과 부가정보까지 백엔드에서 함께 정리(DELETE /inspections/{id}).
  // 점검표 1장(sheet)은 공정별 여러 레코드로 구성되므로 각 레코드를 순차 삭제하고 정리된 파일 수를 합산.
  async function deleteInspections(ids: string[], schoolId: string) {
    if (!ids.length || delBusy) return
    if (!window.confirm('이 점검을 삭제하면 서명·사진·부가정보까지 영구 삭제되며 되돌릴 수 없습니다. 삭제할까요?')) return
    setDelBusy(ids[0])
    try {
      let removed = 0
      for (const id of ids) {
        const r = await api<{ ok: boolean; id: string; removed_files: number }>(`/inspections/${id}`, { method: 'DELETE' })
        removed += r?.removed_files ?? 0
      }
      setDetail(null)
      if (schoolId) refetchSchool(schoolId)
      setDelMsg(`삭제되었습니다 (파일 ${removed}개 정리)`)
      setTimeout(() => setDelMsg(''), 3000)
    } catch (e) {
      setDelMsg(e instanceof Error ? `삭제 실패: ${e.message}` : '삭제 실패')
      setTimeout(() => setDelMsg(''), 4000)
    } finally {
      setDelBusy('')
    }
  }

  // 완성 점검표 PDF 다운로드 — 백엔드 아카이브(GET /inspections/{id}/report.pdf, Bearer 필요라 blob 경유)
  const [pdfBusy, setPdfBusy] = useState(false)
  async function downloadReportPdf(iid: string) {
    setPdfBusy(true)
    try {
      const res = await fetch(`/api/v1/inspections/${iid}/report.pdf`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `안전점검표_${dateOf(detail!) || iid.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDelMsg(e instanceof Error ? `PDF 생성 실패: ${e.message}` : 'PDF 생성 실패')
    } finally {
      setPdfBusy(false)
    }
  }

  // 전송완료(success) 건의 교육청 재전송(수정) — POST /inspections/{id}/request-eduoffice.
  // SUCCESS→PENDING 재대기열: 봇이 교육청 사이트의 기존 건을 수정 업로드한다(F-2).
  async function resendEduoffice(id: string, schoolId: string) {
    if (!id || resendBusy) return
    if (!window.confirm('이미 교육청에 전송된 점검입니다. 수정 내용을 교육청에 재전송(기존 건 수정)할까요?')) return
    setResendBusy(true)
    try {
      await api<{ eduoffice: string }>(`/inspections/${id}/request-eduoffice`, { method: 'POST' })
      setDelMsg('재전송 대기 등록 — 봇이 기존 교육청 건을 수정합니다')
      setTimeout(() => setDelMsg(''), 4000)
      setDetail(null)
      if (schoolId) refetchSchool(schoolId)
    } catch (e) {
      setDelMsg(e instanceof Error ? `재전송 등록 실패: ${e.message}` : '재전송 등록 실패')
      setTimeout(() => setDelMsg(''), 4000)
    } finally {
      setResendBusy(false)
    }
  }

  async function create() {
    if (!sel || busy) return
    setBusy(true)
    setCreateErr('')
    try {
      await api('/inspections', {
        method: 'POST',
        body: JSON.stringify({ school_id: sel.id, part, is_private_school: false, items: [] }),
      })
      setOpen(false)
      refetchSchool(sel.id)
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  // ── 1단계: 학교 목록 데이터 ──
  const schoolRows: SchoolRow[] = useMemo(
    () => schools.map((s) => {
      const list = insMap[s.id] ?? []
      const latest = list.reduce((m, it) => {
        const d = dateOf(it)
        return d > m ? d : m
      }, '')
      return {
        ...s,
        count: list.length,
        draft: list.filter((it) => it.status === 'draft').length,
        signed: list.filter((it) => it.status === 'signed').length,
        submitted: list.filter((it) => it.status === 'submitted').length,
        latest,
      }
    }),
    [schools, insMap],
  )
  const totalCount = useMemo(() => schoolRows.reduce((a, r) => a + r.count, 0), [schoolRows])
  const totalSubmitted = useMemo(() => schoolRows.reduce((a, r) => a + r.submitted, 0), [schoolRows])
  const q = useTableQuery(schoolRows, SCHOOL_QUERY)

  // 작성물 리스트(0807 개편 · 0809 점검표 단위 그룹) — 학교×점검일 1장 단위, 최신순
  const reportRows: InsReportRow[] = useMemo(
    () => schools.flatMap((s) => groupToSheets(s, insMap[s.id] ?? [])),
    [schools, insMap],
  )
  // [063] 학교명·지역명 확정형 검색 (학교 탭과 동일 UX) — 학교급은 rq의 level 필터로 반영
  const [applied, setApplied] = useState({ name: '', region: '' })
  const searchedRows = useMemo(() => {
    const nq = applied.name.toLowerCase()
    const gq = applied.region.toLowerCase()
    if (!nq && !gq) return reportRows
    return reportRows.filter(
      (r) =>
        (!nq || r.school.name.toLowerCase().includes(nq)) &&
        (!gq || (r.school.address ?? '').toLowerCase().includes(gq)),
    )
  }, [reportRows, applied])
  const rq = useTableQuery(searchedRows, REPORT_QUERY)
  const doPanelSearch = (s: WorkSearch) => {
    setApplied({ name: s.name, region: s.region })
    rq.setFilter('level', s.level)
    rq.setPage(1)
  }

  /* [059] 내 작업 스트립 — 작성중(임시저장) 점검표 + 오늘 제출 요약.
     담당 배정이 있으면 담당 학교로 한정(홈 오늘의 할 일 [044]과 동일 규칙 — 배정 없으면 전체) */
  const TODAY_YMD = useMemo(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }, [])
  const myIds = useMemo(() => {
    const mine = schools.filter((s) => s.assigned_inspector_id === (user?.login ?? ''))
    return mine.length > 0 ? new Set(mine.map((s) => s.id)) : null // null = 담당 배정 없음 → 전체
  }, [schools, user])
  const draftSheets = useMemo(
    () => reportRows.filter((r) => r.status === 'draft' && (!myIds || myIds.has(r.school.id))),
    [reportRows, myIds],
  )
  const todaySubmitted = useMemo(
    () => reportRows.filter((r) => r.status !== 'draft' && r.date === TODAY_YMD && (!myIds || myIds.has(r.school.id))),
    [reportRows, TODAY_YMD, myIds],
  )

  function openSchool(s: School) {
    setSel(s)
    setCollapsed({})
    refetchSchool(s.id)
  }

  // [perf-0828] 상세 모달 — 요약(경량) 행이 클릭될 수 있으므로 즉시 표시 후 전체 데이터로 승격.
  // openSchool이 진입 시 전체를 재조회하므로 보통은 캐시 적중(추가 호출 0건).
  function openDetail(r: Inspection) {
    setDetail(r)
    if (!sel) return
    ensureFull(sel.id)
      .then((full) => {
        const f = full.find((x) => x.id === r.id)
        if (f) setDetail((cur) => (cur && cur.id === r.id ? f : cur))
      })
      .catch(() => { /* 보유분 유지 */ })
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

  // ── 2단계: 선택 학교 월별 그룹 ──
  const selItems = sel ? insMap[sel.id] ?? [] : []
  const monthGroups = useMemo(() => groupByMonth(selItems), [selItems])
  const selSubmitted = selItems.filter((r) => r.status === 'submitted').length
  const flatQ = useTableQuery(selItems, FLAT_QUERY) // 내보내기용

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  // 월 그룹 테이블 — 행 클릭 시 상세 모달
  function renderGroup(g: MonthGroup) {
    const isOpen = !collapsed[g.month]
    return (
      <div className="inh-group" key={g.month}>
        <button className="inh-grouphead" onClick={() => toggleGroup(g.month)}>
          <span className={'inh-chev' + (isOpen ? ' open' : '')}><ChevronRight size={15} /></span>
          {monthLabel(g.month)} 점검
          <span className="inh-count">{g.rows.length}건</span>
        </button>
        {isOpen && (
          <div className="inh-groupbody">
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>공정</th>
                    <th className="c">항목수</th>
                    <th className="c">서명</th>
                    <th className="c">상태</th>
                    <th className="c">교육청 전송</th>
                    <th>점검일</th>
                    <th className="c">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const st = STATUS[r.status] || { label: r.status, cls: 'todo' }
                    const eo = EDUOFFICE[r.eduoffice_submit_status] || { label: r.eduoffice_submit_status, cls: 'todo' }
                    const signed = r.signatures.length > 0
                    return (
                      <tr key={r.id} onClick={() => openDetail(r)}>
                        <td><b>{PART_LABEL[r.part] || r.part}</b></td>
                        <td className="c">{r.items.length}</td>
                        <td className="c"><span className={'pillx ' + (signed ? 'ok' : 'todo')}>{signed ? '서명완료' : '미서명'}</span></td>
                        <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                        <td className="c"><span className={'pillx ' + eo.cls}>{eo.label}</span></td>
                        <td>{dateOf(r) || '—'}</td>
                        <td className="c">
                          {r.status === 'draft' ? (
                            <button
                              className="btn btn-primary"
                              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                              onClick={(e) => { e.stopPropagation(); nav(`/inspection/new?school=${sel!.id}&part=${r.part}&resume=${r.id}`) }}
                            >
                              이어서 작성
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost"
                              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                              onClick={(e) => { e.stopPropagation(); openDetail(r) }}
                            >
                              보기
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
        )}
      </div>
    )
  }

  return (
    <div className="page rv">
      {delMsg && (
        <div
          role="status"
          style={{
            position: 'fixed', top: 74, right: 24, zIndex: 60,
            background: 'var(--card)', border: '1px solid var(--line)',
            borderLeft: '3px solid var(--ok)', borderRadius: 12,
            padding: '10px 16px', fontSize: 13, fontWeight: 700,
            color: 'var(--ink)', boxShadow: 'var(--sh-soft)',
          }}
        >
          {delMsg}
        </div>
      )}
      <div className="breadcrumb">
        <Link to="/">홈</Link> / {sel
          ? <><a onClick={() => setSel(null)} style={{ cursor: 'pointer' }}>안전점검</a> / <b>{sel.name}</b></>
          : <b>안전점검</b>}
      </div>
      <div className="bar">
        <h2><ClipboardCheck size={20} /> 안전점검</h2>
        <div className="sp" />
        {sel && (
          <Link className="btn btn-primary" to={`/inspection/new?school=${sel.id}`}>
            점검표 작성
          </Link>
        )}
      </div>

      {!sel && (
        <>
          {/* [059] 내 작업 스트립 — 작성중 점검표 이어서 작성 + 오늘 제출 요약 (없으면 미표시) */}
          {(draftSheets.length > 0 || todaySubmitted.length > 0) && (
            <div className="inh-mywork">
              <div className="inh-mywork-head">
                <b>내 점검 작업</b>
                {draftSheets.length > 0 && <span className="pillx doing">작성중 {draftSheets.length}건</span>}
                {todaySubmitted.length > 0 && (
                  <span className="pillx ok" title={todaySubmitted.map((r) => r.school.name).join(' · ')}>
                    오늘 제출 {todaySubmitted.length}건
                  </span>
                )}
                {myIds && <span className="inh-mywork-note">담당 학교 기준</span>}
              </div>
              {draftSheets.length > 0 && (
                <div className="inh-mywork-cards">
                  {draftSheets.map((r) => (
                    <div key={r.school.id} className="inh-mywork-card">
                      <div className="inh-mywork-info">
                        <div className="t">{r.school.name}</div>
                        <div className="p">{r.parts.map((p) => PART_LABEL[p.part] || p.part).join(' · ')}</div>
                      </div>
                      <button
                        className="btn btn-primary inh-mywork-btn"
                        onClick={() => nav(`/inspection/new?school=${r.school.id}&resumeall=1`)}
                      >
                        이어서 작성
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* [063] 학교 탭과 동일한 검색 패널 — 학교명·지역명·학교급 확정형 조회 */}
          <WorkSearchPanel onSearch={doPanelSearch} onClear={(f) => setApplied((a) => ({ ...a, [f]: '' }))} />

          <div className="ledger">
            <div className="lh">
              <h2><ClipboardCheck size={18} /> 작성된 점검표</h2>
              <span className="pillx doing">{rq.total}건</span>
              <div className="sp" />
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortableTh q={rq} col="date">점검일</SortableTh>
                    <SortableTh q={rq} col="level" className="c">구분</SortableTh>
                    <SortableTh q={rq} col="name">학교</SortableTh>
                    <th>담당자</th>
                    <th className="c">작성현황</th>
                    <th className="c">교육청 전송</th>
                    <th className="c">작업</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(loading || sumLoading) && <tr><td colSpan={8}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && error && <tr><td colSpan={8}><div className="tstate">오류: {error}</div></td></tr>}
                  {!loading && !sumLoading && !error && rq.view.map((r) => {
                    const st = STATUS[r.status] ?? { label: r.status, cls: 'na' }
                    const eo = EDUOFFICE[r.eduoffice] ?? { label: '—', cls: 'na' }
                    const partNames = r.parts.map((p) => PART_LABEL[p.part] || p.part).join(' · ')
                    return (
                      <tr
                        key={r.school.id + '|' + r.date}
                        // [080] 행 클릭 = 해당 점검표 작성 화면 바로 열기 (작성중=이어서, 완료=수정 모드 — 학교 컨텍스트 [068][069]와 동일 규칙)
                        onClick={() => {
                          if (r.status === 'draft') nav(`/inspection/new?school=${r.school.id}&resumeall=1`)
                          else nav(`/inspection/new?school=${r.school.id}&edit=${r.parts.map((p) => p.id).join(',')}`)
                        }}
                        title={`포함 공정: ${partNames}`}
                      >
                        <td>{r.date || '—'}</td>
                        <td className="c">{r.school.school_level ? <span className="pillx doing">{r.school.school_level}</span> : '—'}</td>
                        <td><b>{r.school.name}</b></td>
                        <td className="inh-mgr">{r.school.manager || '—'}</td>
                        <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                        <td className="c"><span className={'pillx ' + eo.cls}>{eo.label}</span></td>
                        <td className="c">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                              onClick={(e) => { e.stopPropagation(); void openSheet(r.school, r.date, r.parts) }}
                            >
                              보기
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                              disabled={delBusy === r.parts[0]?.id}
                              onClick={(e) => { e.stopPropagation(); void deleteInspections(r.parts.map((p) => p.id), r.school.id) }}
                              title="이 점검표를 삭제(서명·사진·부가정보 포함)"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="c"><span className="chev"><ChevronRight size={15} /></span></td>
                      </tr>
                    )
                  })}
                  {!loading && !sumLoading && !error && rq.view.length === 0 && (
                    <tr><td colSpan={8}><div className="tstate">{reportRows.length === 0 ? '작성된 점검표가 없습니다. 학교 탭의 [안전점검] 바로가기에서 작성하세요.' : '조건에 맞는 점검표가 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={rq} />
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            행을 클릭하면 해당 점검표의 작성 화면이 바로 열립니다(작성중은 이어서 작성, 완료 건은 수정). [보기]는 실물 양식으로 표시합니다. 새 점검표 작성은 학교 탭의 [안전점검] 바로가기에서 시작하세요.
          </div>
        </>
      )}

      {sel && (
        <>
          <div className="inh-schoolhead">
            <button className="inh-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="inh-schoolname">{sel.name}</span>
            <span className="inh-schoolmgr">담당자 {sel.manager || '—'}</span>
          </div>

          <div className="ledger" style={{ background: 'transparent', border: 0, boxShadow: 'none' }}>
            <div className="lh" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <h2><ClipboardCheck size={18} /> 점검 현황</h2>
              <div className="sp" />
              <ExportButton q={flatQ} columns={FLAT_EXPORT} filename={`안전점검_${sel.name}`} />
            </div>
            <div className="twrap" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg, 14px)' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>점검일</th>
                    <th>학교</th>
                    <th>담당자</th>
                    <th className="c">작성현황</th>
                    <th className="c">교육청 전송</th>
                    <th className="c">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {sumLoading && selItems.length === 0 && (
                    <tr><td colSpan={6}><div className="tstate">불러오는 중…</div></td></tr>
                  )}
                  {!sumLoading && selItems.length === 0 && (
                    <tr><td colSpan={6}><div className="tstate">등록된 안전점검이 없습니다. 우측 상단 '점검표 작성'으로 추가하세요.</div></td></tr>
                  )}
                  {groupToSheets(sel, selItems)
                    .sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'))
                    .map((sheet) => {
                      const st = STATUS[sheet.status] || { label: sheet.status, cls: 'todo' }
                      const eo = EDUOFFICE[sheet.eduoffice] || { label: '—', cls: 'na' }
                      return (
                        <tr
                          key={sel.id + '|' + sheet.date}
                          title={`포함 공정: ${[...new Set(sheet.parts.map((p) => PART_LABEL[p.part] || p.part))].join(' · ')} — 클릭하면 작성 화면으로 이동`}
                          onClick={() => {
                            // 행 클릭 → 작성 화면(입력 폼) 진입: 작성중은 이어서 작성, 제출·서명완료는 수정 모드 [069]
                            if (sheet.status === 'draft') nav(`/inspection/new?school=${sel.id}&resumeall=1`)
                            else nav(`/inspection/new?school=${sel.id}&edit=${sheet.parts.map((p) => p.id).join(',')}`)
                          }}
                        >
                          <td>{sheet.date || '—'}</td>
                          <td><b>{sel.name}</b></td>
                          <td>{sel.manager || '—'}</td>
                          <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                          <td className="c"><span className={'pillx ' + eo.cls}>{eo.label}</span></td>
                          <td className="c">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                              {sheet.status === 'draft' ? (
                                <button
                                  className="btn btn-primary"
                                  style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                                  onClick={(e) => { e.stopPropagation(); nav(`/inspection/new?school=${sel.id}&resumeall=1`) }}
                                >
                                  이어서 작성
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost"
                                  style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                                  onClick={(e) => { e.stopPropagation(); void openSheet(sel, sheet.date, sheet.parts) }}
                                >
                                  보기
                                </button>
                              )}
                              <button
                                className="btn btn-danger"
                                style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                                disabled={delBusy === sheet.parts[0]?.id}
                                onClick={(e) => { e.stopPropagation(); void deleteInspections(sheet.parts.map((p) => p.id), sel.id) }}
                                title="이 점검표를 삭제(서명·사진·부가정보 포함)"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            안전점검은 매월 반복 업무입니다. 점검표는 서명 완료 후 교육청에 제출되며, 미흡 항목은 추후보완으로 관리됩니다.
          </div>
        </>
      )}

      {open && sel && (
        <Modal
          title={`안전점검 생성 · ${sel.name}`}
          onClose={() => { if (!busy) setOpen(false) }}
          footer={(
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={create}>
                {busy ? '생성 중…' : '생성'}
              </button>
            </>
          )}
        >
          {createErr && <div className="login-err">{createErr}</div>}
          <label className="field">
            <span>공정</span>
            <select className="select" value={part} onChange={(e) => setPart(e.target.value)}>
              {PART_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`안전점검 상세 · ${PART_LABEL[detail.part] || detail.part}`}
          onClose={() => setDetail(null)}
          footer={(
            <>
              <button
                className="btn btn-danger"
                disabled={delBusy === detail.id}
                onClick={() => void deleteInspections([detail.id], sel?.id ?? '')}
              >
                <Trash2 size={15} /> {delBusy === detail.id ? '삭제 중…' : '삭제'}
              </button>
              {detail.eduoffice_submit_status === 'success' && (
                <button
                  className="btn btn-ghost"
                  disabled={resendBusy}
                  onClick={() => void resendEduoffice(detail.id, sel?.id ?? '')}
                >
                  {resendBusy ? '등록 중…' : '교육청 재전송(수정)'}
                </button>
              )}
              {detail.status === 'submitted' && (
                <button
                  className="btn"
                  disabled={pdfBusy}
                  title="완성된 안전점검표 PDF(결재란·항목·사진대지·서명 포함) 다운로드"
                  onClick={() => void downloadReportPdf(detail.id)}
                >
                  {pdfBusy ? 'PDF 생성 중…' : '▤ 점검표 PDF'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setDetail(null)}>닫기</button>
            </>
          )}
        >
          <div className="kv"><b>상태</b><span>{STATUS[detail.status]?.label || detail.status}</span></div>
          <div className="kv"><b>점검일</b><span>{dateOf(detail) || '—'}</span></div>
          <div className="kv"><b>서명</b><span>{detail.signatures.length > 0 ? `서명완료 · ${detail.signatures.map((s) => s.signer).join(', ')}` : '미서명'}</span></div>
          {detail.signatures.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '2px 0 8px' }}>
              {detail.signatures.map((s, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {typeof s.image_ref === 'string' && s.image_ref !== '' && (
                    <SignImage refPath={s.image_ref} />
                  )}
                  <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>{s.signer}</span>
                </div>
              ))}
            </div>
          )}
          {/* 현장앱 결재선 서명 이미지 — 부가정보(approval_lines)에서 로드 [서명·사진 출력 수정] */}
          {detailLines.length > 0 && (
            <>
              <div className="kv"><b>결재선</b><span>{detailLines.map((l) => l.title || '확인자').join(' → ')}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '2px 0 8px' }}>
                {detailLines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {l.image_ref
                      ? <SignImage refPath={l.image_ref} />
                      : <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>{l.signer ? '(서명)' : '(미서명)'}</span>}
                    <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>{l.title || l.signer}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="kv"><b>교육청 전송</b><span>{EDUOFFICE[detail.eduoffice_submit_status]?.label || detail.eduoffice_submit_status}</span></div>
          {detailPhotos.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>사진대지</div>
              {detailPhotos.map((g) => (
                <div key={g.label} style={{ margin: '4px 0 8px' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginBottom: 4 }}>{g.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {g.slots.filter((s) => s.dataUrl).map((s, i) => (
                      <figure key={i} style={{ margin: 0, width: 104 }}>
                        <img
                          src={s.dataUrl}
                          alt={s.caption || s.name || '사진'}
                          title={(s.caption || s.name || '사진') + ' — 클릭하면 다운로드'}
                          style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line, #ddd)', display: 'block', cursor: 'pointer' }}
                          onClick={() => {
                            const a = document.createElement('a')
                            a.href = s.dataUrl
                            a.download = s.name || `${g.label}_사진${String(i + 1).padStart(2, '0')}.jpg`
                            a.click()
                          }}
                        />
                        {(s.caption || s.name) && (
                          <figcaption style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.caption || s.name}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>점검 항목 ({detail.items.length})</div>
          <div className="twrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>항목</th><th className="c">결과</th><th>비고</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.code}>
                    <td>{it.code}</td>
                    <td>{it.label}</td>
                    <td className="c">{it.result ? (RESULT_LABEL[it.result] || it.result) : '—'}</td>
                    <td>{it.remark || '—'}</td>
                  </tr>
                ))}
                {detail.items.length === 0 && <tr><td colSpan={4}><div className="tstate">항목 없음</div></td></tr>}
              </tbody>
            </table>
          </div>
          {detail.followups.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13 }}>추후보완 ({detail.followups.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                {detail.followups.map((f) => <li key={f.id}>[{f.item_code}] {f.description} — {f.status}</li>)}
              </ul>
            </>
          )}
        </Modal>
      )}

      {sheetView && <InspectionSheetView sheet={sheetView} onClose={() => setSheetView(null)} />}
    </div>
  )
}
