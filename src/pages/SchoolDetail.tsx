import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { MsdsFormModal } from '../components/MsdsFormModal'
import { AccidentFormModal } from '../components/AccidentFormModal'
import { HistoryFormModal } from '../components/HistoryFormModal'
import '../styles/schoolhub.css'

const PART_LABEL: Record<string, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}
const WPART_ORDER = ['catering', 'facility', 'cleaning', 'commute', 'night_duty']
const SCHOOL_LEVELS = ['유', '초', '중', '고', '기타']
// 학교 기본 정보 (전체 필드 — GET /schools 목록에서 조회, 인라인 편집용) [037]
type FullSchool = {
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
type WRow = { part: string; count: number; contact: string; is_nutrition_teacher: boolean }

type ApprovalStep = { title: string; name: string }
const PRESET_DEFAULT: ApprovalStep[] = [{ title: '담당자', name: '' }, { title: '행정실장', name: '' }, { title: '교장', name: '' }]
const PRESET_ORG: ApprovalStep[] = [{ title: '부서장', name: '' }, { title: '팀장', name: '' }, { title: '과장', name: '' }]

type Worker = { id: string; part: string; count: number; contact: string; is_nutrition_teacher: boolean }
type Msds = { id: string; area: string; substances: string[] }
type Accident = { id: string; date: string; description: string; part: string | null }
type History = { id: string; month: string; content: string; memo: string }
type Ledger = {
  school: { id: string; name: string; is_private: boolean; education_count: number | null; special_notes: string; address: string }
  workers: Worker[]
  worker_total: number
  education_count: number | null
  headcount_mismatch: boolean
  msds: Msds[]
  accidents: Accident[]
  histories: History[]
}

// ---- 학교 특징 (프로토타입 FEAT_GROUPS 포팅 — 백엔드 필드 없음, localStorage 파사드) ----
const FEAT_GROUPS: Record<string, string[]> = {
  '급식 설비': ['대형 곰솥', 'LPG 사용', '가스 튀김기', '스팀 오븐', '덤웨이터'],
  '건물 시설': ['엘리베이터', '계단 (2층 이상)', '지하 기계실', '옥상 출입', '별도 당직실'],
}
const FEAT_KEYS = Object.values(FEAT_GROUPS).flat()

// ---- 담당자 이력 (0709 회의: GET/PUT /schools/{sid}/manager-history) ----
type ManagerRow = { start: string; end: string; name: string; note?: string }

// ---- 특이사항 (localStorage 파사드) ----
type FreeNote = { date: string; text: string }

// ---- 5대 업무 진행이력 요약 ----
type InspRow = { id: string; part: string; status: string }
type RiskRow = { id: string; process: string; status: string; created_at?: string | null }
type CompRow = { id: string; period: string; status: string; created_at?: string | null }
type MusRow = { id: string; has_burden: boolean; basic_surveys: number; sheets: number; needs_review: number }
type EduProgress = { total: number; completed_count: number; avg_progress: number }
type WorkSummary = { key: string; name: string; summary: string; date: string; cls: string; label: string }

// ---- 월별 방문 기록 ----
type Visit = { id: string; school_id: string; date: string; visitor: string; purpose: string }

function latestDate(dates: (string | null | undefined)[]): string {
  const ds = dates.filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort()
  return ds.length ? ds[ds.length - 1] : '—'
}

// 담당자 이력 CSV 파싱 — 각 행: 시작일,종료일,이름[,비고]. 헤더 행은 자동 제외.
function parseManagerCsv(text: string): ManagerRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [start = '', end = '', name = '', ...rest] = l.split(',')
      return { start: start.trim(), end: end.trim(), name: name.trim(), note: rest.join(',').trim() }
    })
    .filter((r) => r.name && !/^(start|시작|시작일)$/i.test(r.start))
}

export function SchoolDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<Ledger | null>(null)
  const [reveal, setReveal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [pageEdit, setPageEdit] = useState(false) // [036] 페이지 전체 편집 모드 — 편집 ↔ 수정 완료
  // [037] 인라인 편집 — 학교 정보·종사자 드래프트 (수정 완료 시 일괄 저장)
  const [info, setInfo] = useState<FullSchool | null>(null)
  const [infoDraft, setInfoDraft] = useState<FullSchool | null>(null)
  const [wDraft, setWDraft] = useState<WRow[]>([])
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [msdsModal, setMsdsModal] = useState(false)
  const [accidentModal, setAccidentModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [steps, setSteps] = useState<ApprovalStep[]>([])
  const [apBusy, setApBusy] = useState(false)
  const [apMsg, setApMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 학교 특징 / 특이사항 — 백엔드 School.features/notes (GET·PUT /schools/{sid}/features·/notes)
  const [feat, setFeat] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<FreeNote[]>([])
  const [noteDate, setNoteDate] = useState('')
  const [noteText, setNoteText] = useState('')

  // 담당자 이력
  const [mgrRows, setMgrRows] = useState<ManagerRow[]>([])
  const [mgrModal, setMgrModal] = useState(false)
  const [mgrEdit, setMgrEdit] = useState<ManagerRow[]>([])
  const [mgrBusy, setMgrBusy] = useState(false)
  const [mgrErr, setMgrErr] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)

  // 5대 업무 진행이력 / 월별 방문 기록
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [worksLoaded, setWorksLoaded] = useState(false)
  const [visits, setVisits] = useState<Visit[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<Ledger>(`/schools/${id}/ledger${reveal ? '?reveal_nutrition=true' : ''}`)
      .then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [id, reveal, reload])

  // 학교 기본 정보 전체 필드 — 목록 API에서 조회 (대장에는 일부 필드만 있음)
  useEffect(() => {
    let alive = true
    api<FullSchool[]>('/schools')
      .then((list) => { if (alive) setInfo(Array.isArray(list) ? list.find((x) => x.id === id) ?? null : null) })
      .catch(() => { if (alive) setInfo(null) })
    return () => { alive = false }
  }, [id, reload])

  useEffect(() => {
    let alive = true
    setApMsg(null)
    api<{ steps: ApprovalStep[] }>(`/schools/${id}/approval-line`)
      .then((d) => { if (alive) setSteps(d.steps) })
      .catch(() => { if (alive) setSteps([]) })
    return () => { alive = false }
  }, [id])

  // 학교 특징·특이사항 로드 — 백엔드 필드(구 localStorage 파사드 승격)
  useEffect(() => {
    let alive = true
    api<{ features: Record<string, boolean> }>(`/schools/${id}/features`)
      .then((d) => { if (alive) setFeat(d.features || {}) })
      .catch(() => { if (alive) setFeat({}) })
    api<{ items: FreeNote[] }>(`/schools/${id}/notes`)
      .then((d) => { if (alive) setNotes(Array.isArray(d.items) ? d.items : []) })
      .catch(() => { if (alive) setNotes([]) })
    return () => { alive = false }
  }, [id])

  // 담당자 이력 로드 — API 병렬 구현 중이므로 실패 시 빈 상태
  useEffect(() => {
    let alive = true
    api<unknown>(`/schools/${id}/manager-history`)
      .then((d) => {
        if (!alive) return
        const arr = Array.isArray(d)
          ? d
          : d && typeof d === 'object' && Array.isArray((d as { items?: unknown }).items)
            ? (d as { items: unknown[] }).items
            : []
        setMgrRows(arr as ManagerRow[])
      })
      .catch(() => { if (alive) setMgrRows([]) })
    return () => { alive = false }
  }, [id])

  // 5대 업무 진행이력 — 있는 API만 취합, 실패 항목은 생략
  useEffect(() => {
    let alive = true
    setWorksLoaded(false)
    ;(async () => {
      const [insp, risk, comp, mus, edu] = await Promise.all([
        api<InspRow[]>(`/inspections?school_id=${id}`).catch(() => null),
        api<RiskRow[]>(`/risk?school_id=${id}`).catch(() => null),
        api<CompRow[]>(`/compliance?school_id=${id}`).catch(() => null),
        api<MusRow[]>(`/musculo?school_id=${id}`).catch(() => null),
        api<EduProgress>(`/education/${id}/progress`).catch(() => null),
      ])
      if (!alive) return
      const out: WorkSummary[] = []
      if (Array.isArray(insp)) {
        const done = insp.filter((r) => r.status === 'submitted').length
        out.push({
          key: 'insp', name: '안전점검', summary: `총 ${insp.length}건 · 제출 ${done}건`, date: '—',
          cls: done ? 'ok' : insp.length ? 'doing' : 'todo', label: done ? '제출' : insp.length ? '진행중' : '기록 없음',
        })
      }
      if (Array.isArray(risk)) {
        const done = risk.filter((r) => r.status === 'completed').length
        out.push({
          key: 'risk', name: '위험성평가', summary: `총 ${risk.length}건 · 완료 ${done}건`, date: latestDate(risk.map((r) => r.created_at)),
          cls: done ? 'ok' : risk.length ? 'doing' : 'todo', label: done ? '완료' : risk.length ? '작성중' : '기록 없음',
        })
      }
      if (Array.isArray(mus)) {
        const burden = mus.some((r) => r.has_burden)
        const sheets = mus.reduce((a, r) => a + (r.sheets || 0), 0)
        out.push({
          key: 'mus', name: '근골격계 유해요인조사', summary: `조사 ${mus.length}건 · 증상조사표 ${sheets}매`, date: '—',
          cls: burden ? 'warn' : mus.length ? 'ok' : 'todo', label: burden ? '부담작업 있음' : mus.length ? '해당 없음' : '기록 없음',
        })
      }
      if (edu && typeof edu === 'object') {
        const pct = edu.total > 0 ? Math.round(edu.avg_progress * 100) : null
        out.push({
          key: 'edu', name: '안전보건교육', summary: pct != null ? `이수 완료 ${edu.completed_count}/${edu.total}명` : '진도 데이터 없음', date: '—',
          cls: pct == null ? 'todo' : pct >= 100 ? 'ok' : 'doing', label: pct != null ? `진도율 ${pct}%` : '기록 없음',
        })
      }
      if (Array.isArray(comp)) {
        const done = comp.filter((r) => r.status === 'submitted').length
        out.push({
          key: 'comp', name: '이행점검', summary: `총 ${comp.length}건 · 제출 ${done}건`, date: latestDate(comp.map((r) => r.created_at)),
          cls: done ? 'ok' : comp.length ? 'doing' : 'todo', label: done ? '제출' : comp.length ? '작성중' : '기록 없음',
        })
      }
      setWorks(out)
      setWorksLoaded(true)
    })()
    return () => { alive = false }
  }, [id])

  // 월별 방문 기록 — GET /visits에서 school_id 필터
  useEffect(() => {
    let alive = true
    api<Visit[]>('/visits')
      .then((d) => { if (alive) setVisits((Array.isArray(d) ? d : []).filter((v) => v.school_id === id)) })
      .catch(() => { if (alive) setVisits([]) })
    return () => { alive = false }
  }, [id])

  function toggleFeat(k: string) {
    setFeat((prev) => {
      const next = { ...prev, [k]: !prev[k] }
      // 낙관적 갱신 — 실패해도 화면 상태 유지(재로드 시 서버값으로 수렴)
      void api(`/schools/${id}/features`, {
        method: 'PUT', body: JSON.stringify({ features: next }),
      }).catch(() => {})
      return next
    })
  }

  function saveNotes(next: FreeNote[]) {
    setNotes(next)
    void api(`/schools/${id}/notes`, {
      method: 'PUT', body: JSON.stringify({ items: next }),
    }).catch(() => {})
  }
  function addNote() {
    if (!noteText.trim()) return
    saveNotes([...notes, { date: noteDate || new Date().toISOString().slice(0, 10), text: noteText.trim() }])
    setNoteDate('')
    setNoteText('')
  }

  async function putManagerHistory(rows: ManagerRow[]): Promise<boolean> {
    setMgrBusy(true)
    setMgrErr('')
    try {
      // PUT 전체교체({items} 래핑). 성공 시 재조회 대신 로컬 상태 반영.
      await api(`/schools/${id}/manager-history`, { method: 'PUT', body: JSON.stringify({ items: rows }) })
      setMgrRows(rows)
      return true
    } catch (e) {
      setMgrErr(e instanceof Error ? e.message : '저장 실패')
      return false
    } finally {
      setMgrBusy(false)
    }
  }
  async function saveMgrModal() {
    const rows = mgrEdit.filter((r) => r.name.trim())
    if (await putManagerHistory(rows)) setMgrModal(false)
  }
  function onCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseManagerCsv(String(reader.result || ''))
      if (!rows.length) {
        alert('CSV에서 유효한 행을 찾지 못했습니다. 형식: 시작일,종료일,이름[,비고]')
        return
      }
      if (window.confirm(`CSV ${rows.length}건으로 담당자 이력 전체를 교체할까요?`)) {
        void putManagerHistory(rows).then((ok) => { if (!ok) alert('담당자 이력 저장에 실패했습니다.') })
      }
    }
    reader.readAsText(f)
  }

  function setStep(i: number, patch: Partial<ApprovalStep>) {
    setSteps((prev) => prev.map((st, idx) => (idx === i ? { ...st, ...patch } : st)))
  }
  function addStep() {
    setSteps((prev) => [...prev, { title: '', name: '' }])
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i))
  }
  async function saveApproval() {
    setApBusy(true)
    setApMsg(null)
    try {
      const r = await api<{ ok: boolean; steps: ApprovalStep[] }>(`/schools/${id}/approval-line`, {
        method: 'PUT',
        body: JSON.stringify({ steps }),
      })
      setSteps(r.steps)
      setApMsg({ ok: true, text: '결재선을 저장했습니다.' })
    } catch (e) {
      setApMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setApBusy(false)
    }
  }

  // [037] 편집 진입 — 학교 정보·종사자를 드래프트로 복사해 인라인 편집 시작
  function enterEdit() {
    if (!data) return
    const base: FullSchool = info ?? {
      id: data.school.id, name: data.school.name, address: data.school.address,
      is_private: data.school.is_private, education_count: data.school.education_count,
    }
    setInfoDraft({ ...base })
    setWDraft(WPART_ORDER.map((p) => {
      const f = data.workers.find((w) => w.part === p)
      return { part: p, count: f?.count ?? 0, contact: f?.contact ?? '', is_nutrition_teacher: f?.is_nutrition_teacher ?? false }
    }))
    setSaveErr('')
    setPageEdit(true)
  }
  const patchW = (part: string, p: Partial<WRow>) =>
    setWDraft((rs) => rs.map((r) => (r.part === part ? { ...r, ...p } : r)))

  // [037] 수정 완료 — 학교 정보 + 종사자 일괄 저장 후 보기 모드 복귀
  async function finishEdit() {
    if (!infoDraft) { setPageEdit(false); return }
    if (!infoDraft.name?.trim()) { setSaveErr('학교명을 입력하세요.'); return }
    setSaveBusy(true)
    setSaveErr('')
    try {
      await api(`/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: infoDraft.name.trim(),
          email: infoDraft.email ?? '',
          address: infoDraft.address ?? '',
          is_private: !!infoDraft.is_private,
          education_count: infoDraft.education_count ?? null,
          school_level: infoDraft.school_level ?? '',
          principal: infoDraft.principal ?? '',
          supervisor: infoDraft.supervisor ?? '',
          manager: infoDraft.manager ?? '',
          inspection_agency: infoDraft.inspection_agency ?? '',
        }),
      })
      await api(`/schools/${id}/workers`, {
        method: 'PUT',
        body: JSON.stringify({
          workers: wDraft
            .filter((r) => Number(r.count) > 0)
            .map((r) => ({ part: r.part, count: Number(r.count), contact: r.contact, is_nutrition_teacher: r.is_nutrition_teacher })),
        }),
      })
      setReload((r) => r + 1)
      setPageEdit(false)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : '저장에 실패했습니다.')
    }
    setSaveBusy(false)
  }

  async function handleDelete() {
    const name = data?.school.name ?? '이 학교'
    if (!window.confirm(`'${name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await api(`/schools/${id}`, { method: 'DELETE' })
      nav('/')
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  if (loading) return <div className="page"><div className="tstate">불러오는 중…</div></div>
  if (error || !data) return <div className="page"><div className="tstate">오류: {error}</div></div>

  const s = data.school
  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">이력관리 대장</Link> / <b>{s.name}</b></div>
      <div className="bar">
        <h2>{s.name}</h2>
        <span className={'pillx ' + (s.is_private ? 'doing' : 'ok')}>{s.is_private ? '사립' : '국공립'}</span>
        <div className="sp" />
        {pageEdit ? (
          <>
            {saveErr && <span style={{ color: 'var(--red, #e5484d)', fontSize: 12.5, fontWeight: 700 }}>{saveErr}</span>}
            <button className="btn btn-ghost" onClick={handleDelete} disabled={saveBusy}>학교 삭제</button>
            <button className="btn btn-primary" onClick={() => { void finishEdit() }} disabled={saveBusy}>{saveBusy ? '저장 중…' : '수정 완료'}</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={enterEdit}>편집</button>
        )}
        <Link to="/schools" className="pill"><ChevronLeft size={15} /> 학교 목록으로</Link>
      </div>

      {/* ===== 학교 정보 — 보기: 요약 그리드 · 편집: 인라인 입력 [037] ===== */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2>학교 정보</h2>
          <div className="sp" />
          {pageEdit && <span className="muted" style={{ fontSize: 12 }}>입력 후 우측 상단 [수정 완료]를 누르면 저장됩니다</span>}
        </div>
        <div className="card-body">
          {pageEdit && infoDraft ? (
            <div className="shub-infogrid">
              <label className="field"><span>학교(기관)명 *</span><input className="input" value={infoDraft.name} onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })} /></label>
              <label className="field"><span>학교급</span>
                <select className="input" value={infoDraft.school_level ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, school_level: e.target.value })}>
                  <option value="">선택 안 함</option>
                  {SCHOOL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>설립 구분</span>
                <select className="input" value={infoDraft.is_private ? 'y' : 'n'} onChange={(e) => setInfoDraft({ ...infoDraft, is_private: e.target.value === 'y' })}>
                  <option value="n">국공립</option>
                  <option value="y">사립</option>
                </select>
              </label>
              <label className="field"><span>학교(기관)장</span><input className="input" value={infoDraft.principal ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, principal: e.target.value })} /></label>
              <label className="field"><span>관리감독자</span><input className="input" value={infoDraft.supervisor ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, supervisor: e.target.value })} /></label>
              <label className="field"><span>담당자</span><input className="input" value={infoDraft.manager ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, manager: e.target.value })} /></label>
              <label className="field"><span>안전점검기관</span><input className="input" value={infoDraft.inspection_agency ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, inspection_agency: e.target.value })} /></label>
              <label className="field"><span>교육생 수</span><input className="input" type="number" min={0} value={infoDraft.education_count ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, education_count: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label className="field"><span>이메일</span><input className="input" value={infoDraft.email ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, email: e.target.value })} /></label>
              <label className="field shub-info-wide"><span>주소</span><input className="input" value={infoDraft.address ?? ''} onChange={(e) => setInfoDraft({ ...infoDraft, address: e.target.value })} /></label>
            </div>
          ) : (
            <div className="shub-infogrid view">
              <div className="kv"><b>학교급</b><span>{info?.school_level || '—'}</span></div>
              <div className="kv"><b>설립 구분</b><span>{(info?.is_private ?? s.is_private) ? '사립' : '국공립'}</span></div>
              <div className="kv"><b>학교(기관)장</b><span>{info?.principal || '—'}</span></div>
              <div className="kv"><b>관리감독자</b><span>{info?.supervisor || '—'}</span></div>
              <div className="kv"><b>담당자</b><span>{info?.manager || '—'}</span></div>
              <div className="kv"><b>안전점검기관</b><span>{info?.inspection_agency || '—'}</span></div>
              <div className="kv"><b>교육생 수</b><span>{(info?.education_count ?? s.education_count) != null ? `${info?.education_count ?? s.education_count}명` : '—'}</span></div>
              <div className="kv"><b>이메일</b><span>{info?.email || '—'}</span></div>
              <div className="kv"><b>주소</b><span>{info?.address || s.address || '—'}</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2>현업종사자</h2>
          <div className="sp" />
          <label className="row" style={{ gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> 영양교사 정보 표시
          </label>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th>파트</th><th className="c">인원</th><th>연락처</th><th className="c">{pageEdit ? '영양교사' : '구분'}</th></tr></thead>
            <tbody>
              {pageEdit
                ? wDraft.map((r) => (
                  <tr key={r.part}>
                    <td><b>{PART_LABEL[r.part] || r.part}</b></td>
                    <td className="c">
                      <input className="input" type="number" min={0} value={r.count} style={{ width: 80 }} disabled={saveBusy}
                        onChange={(e) => patchW(r.part, { count: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input className="input" type="text" value={r.contact} placeholder="연락처" disabled={saveBusy}
                        onChange={(e) => patchW(r.part, { contact: e.target.value })} style={{ maxWidth: 260 }} />
                    </td>
                    <td className="c">
                      <input type="checkbox" checked={r.is_nutrition_teacher} disabled={saveBusy}
                        onChange={(e) => patchW(r.part, { is_nutrition_teacher: e.target.checked })} />
                    </td>
                  </tr>
                ))
                : (
                  <>
                    {data.workers.map((w) => (
                      <tr key={w.id}>
                        <td><b>{PART_LABEL[w.part] || w.part}</b></td>
                        <td className="c">{w.count}</td>
                        <td>{w.contact || '—'}</td>
                        <td className="c">{w.is_nutrition_teacher ? <span className="pillx warn">영양교사</span> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                    {data.workers.length === 0 && <tr><td colSpan={4}><div className="tstate">등록된 종사자가 없습니다. 우측 상단 [편집]에서 바로 입력하세요.</div></td></tr>}
                  </>
                )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 24 }}>
        <div className="ledger">
          <div className="lh">
            <h2>학교 특징</h2>
            <div className="sp" />
            <span className="pillx doing">해당 {FEAT_KEYS.filter((k) => feat[k]).length} / {FEAT_KEYS.length}항목</span>
          </div>
          <div className="card-body">
            {Object.entries(FEAT_GROUPS).map(([g, keys]) => (
              <div className="shub-fg" key={g}>
                <div className="t">{g} {pageEdit && <span className="auto">클릭하여 있음/없음 전환</span>}</div>
                <div className="shub-feat">
                  {keys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={'shub-f ' + (feat[k] ? 'yes' : 'no')}
                      onClick={pageEdit ? () => toggleFeat(k) : undefined}
                      title={pageEdit ? '클릭하여 있음/없음 전환' : undefined}
                      style={pageEdit ? undefined : { cursor: 'default' }}
                    >
                      <i /><span className="fk">{k}</span><b className="fv">{feat[k] ? '있음' : '없음'}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="shub-fnote">
              <b>없음 {FEAT_KEYS.filter((k) => !feat[k]).length}항목</b>은 위험성평가·안전점검 체크리스트에서 자동 제외 대상입니다.
            </div>
          </div>
        </div>

        <div className="ledger">
          <div className="lh"><h2>특이사항</h2><div className="sp" /><span className="pillx na">{notes.length}건</span></div>
          <div className="card-body">
            {notes.length
              ? (
                <ul className="shub-notes">
                  {notes.map((n, i) => (
                    <li key={i}>
                      <span className="dt">{n.date}</span>
                      <span className="tx">{n.text}</span>
                      {pageEdit && <button className="shub-del" title="삭제" onClick={() => saveNotes(notes.filter((_, idx) => idx !== i))}>✕</button>}
                    </li>
                  ))}
                </ul>
              )
              : <div className="tstate">기록된 특이사항이 없습니다.</div>}
            {pageEdit && (
            <div className="shub-noteform">
              <input className="input dt" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
              <input
                className="input"
                placeholder="특이사항 메모 (예: 급식 덤웨이터 신규 설치 — 협착 위험 등록)"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
              />
              <button className="btn btn-ghost" onClick={addNote}>추가</button>
            </div>
            )}
          </div>
        </div>
      </div>

      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2>결재선</h2>
          <div className="sp" />
          {pageEdit && (
            <>
              <button className="btn btn-ghost" onClick={() => setSteps(PRESET_DEFAULT)}>기본(담당자·행정실장·교장)</button>
              <button className="btn btn-ghost" onClick={() => setSteps(PRESET_ORG)}>기관(부서장·팀장·과장)</button>
            </>
          )}
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            {steps.length
              ? steps.map((st, i) => (
                <span key={i} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  {i > 0 && <span style={{ color: 'var(--ink-2)', fontWeight: 700 }}>→</span>}
                  <span className="pillx">{st.title || '직책'}{st.name ? ` ${st.name}` : ''}</span>
                </span>
              ))
              : <span className="muted">등록된 결재선이 없습니다.</span>}
          </div>
          {/* 편집 영역은 적정 폭으로 제한 — 와이드 화면에서 입력칸이 무한정 늘어나지 않게 */}
          {pageEdit && (
          <div style={{ maxWidth: 640 }}>
            {steps.map((st, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 180px 1fr 42px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <span className="pillx">{i + 1}</span>
                <input className="input" placeholder="직책 (예: 교장)" value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} />
                <input className="input" placeholder="결재자 이름" value={st.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                <button className="btn btn-ghost" title="삭제" onClick={() => removeStep(i)} style={{ padding: 0, width: 42 }}><Trash2 size={15} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={addStep}>＋ 단계 추가</button>
              <div style={{ flex: 1 }} />
              {apMsg && <span style={{ fontSize: 12.5, fontWeight: 600, color: apMsg.ok ? 'var(--ok)' : 'var(--red)' }}>{apMsg.text}</span>}
              <button className="btn btn-primary" onClick={saveApproval} disabled={apBusy}>{apBusy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="ledger">
          <div className="lh"><h2>MSDS</h2><div className="sp" />{pageEdit && <button className="btn btn-ghost" onClick={() => setMsdsModal(true)}>추가</button>}</div>
          <div className="card-body">
            {data.msds.length
              ? data.msds.map((m) => <div className="kv" key={m.id}><b>{m.area}</b><span>{m.substances.join(', ') || '—'}</span></div>)
              : <div className="tstate">등록된 MSDS가 없습니다.</div>}
          </div>
        </div>
        <div className="ledger">
          <div className="lh"><h2>산재 현황</h2><div className="sp" />{pageEdit && <button className="btn btn-ghost" onClick={() => setAccidentModal(true)}>추가</button>}</div>
          <div className="card-body">
            {data.accidents.length
              ? data.accidents.map((a) => <div className="kv" key={a.id}><b>{a.date}</b><span>{a.description}{a.part ? ` · ${PART_LABEL[a.part] || a.part}` : ''}</span></div>)
              : <div className="tstate">산재 이력이 없습니다.</div>}
          </div>
        </div>
      </div>

      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh">
          <h2>담당자 이력</h2>
          <span className="pillx na">{mgrRows.length}건</span>
          <div className="sp" />
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onCsvFile} />
          {pageEdit && (
            <>
              <button className="btn btn-ghost" onClick={() => csvRef.current?.click()} disabled={mgrBusy}>CSV 업로드</button>
              <button className="btn btn-ghost" onClick={() => { setMgrEdit(mgrRows.length ? mgrRows.map((r) => ({ ...r })) : [{ start: '', end: '', name: '', note: '' }]); setMgrErr(''); setMgrModal(true) }}>편집</button>
            </>
          )}
        </div>
        <div className="card-body">
          {mgrErr && <div className="login-err" style={{ marginBottom: 12 }}>{mgrErr}</div>}
          {mgrRows.length
            ? (
              <div className="shub-mh">
                {[...mgrRows]
                  .sort((a, b) => (b.start || '').localeCompare(a.start || ''))
                  .map((r, i) => (
                    <div className={'shub-mh-row' + (!r.end ? ' now' : '')} key={i}>
                      <span className="term">{r.start || '—'} ~ {r.end || '현재'}</span>
                      <span className="nm">{r.name}</span>
                      {!r.end && <span className="pillx ok">현재 담당</span>}
                      {r.note && <span className="note">{r.note}</span>}
                    </div>
                  ))}
              </div>
            )
            : <div className="tstate">담당자 이력이 없습니다. 편집 또는 CSV 업로드로 등록하세요. (CSV 형식: 시작일,종료일,이름,비고)</div>}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 24 }}>
        <div className="ledger">
          <div className="lh"><h2>5대 업무 진행이력</h2><div className="sp" /><span className="pillx doing">실데이터 연동</span></div>
          <div className="card-body shub-works">
            {!worksLoaded && <div className="tstate">불러오는 중…</div>}
            {worksLoaded && works.length === 0 && <div className="tstate">조회 가능한 업무 데이터가 없습니다.</div>}
            {worksLoaded && works.length > 0 && (
              <>
                <div className="hrow head"><span>업무</span><span>진행 요약</span><span>최근 일자</span><span className="st">상태</span></div>
                {works.map((w) => (
                  <div className="hrow" key={w.key}>
                    <span className="task">{w.name}</span>
                    <span className="sum">{w.summary}</span>
                    <span className={'dt' + (w.date === '—' ? ' none' : '')}>{w.date}</span>
                    <span className="st"><span className={'pillx ' + w.cls}>{w.label}</span></span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="ledger">
          <div className="lh"><h2>월별 방문 기록</h2><div className="sp" /><span className="pillx na">{visits.length}회</span></div>
          <div className="card-body">
            {visits.length
              ? (
                <div className="shub-visits">
                  {[...visits]
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .map((v) => (
                      <div className="shub-vrow" key={v.id}>
                        <span className="mo">{(v.date || '').slice(0, 7).replace('-', '.')}</span>
                        <span className="tx">{(v.date || '').slice(8, 10)}일 · {v.visitor || '방문'} <small>{v.purpose}</small></span>
                      </div>
                    ))}
                </div>
              )
              : <div className="tstate">등록된 방문 기록이 없습니다.</div>}
          </div>
        </div>
      </div>

      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh"><h2>월별 진행 이력</h2><div className="sp" />{pageEdit && <button className="btn btn-ghost" onClick={() => setHistoryModal(true)}>추가</button>}</div>
        <div className="card-body">
          {data.histories.length
            ? (
              <div className="tl">
                {data.histories.map((h) => (
                  <div className="row" key={h.id}>
                    <div className="mo">{h.month}</div>
                    <div><b>{h.content || '—'}</b>{h.memo && <span className="muted"> · {h.memo}</span>}</div>
                  </div>
                ))}
              </div>
            )
            : <div className="tstate">진행 이력이 없습니다.</div>}
        </div>
      </div>

      {msdsModal && (
        <MsdsFormModal
          schoolId={id || ''}
          onClose={() => setMsdsModal(false)}
          onSaved={() => setReload((r) => r + 1)}
        />
      )}
      {accidentModal && (
        <AccidentFormModal
          schoolId={id || ''}
          onClose={() => setAccidentModal(false)}
          onSaved={() => setReload((r) => r + 1)}
        />
      )}
      {historyModal && (
        <HistoryFormModal
          schoolId={id || ''}
          onClose={() => setHistoryModal(false)}
          onSaved={() => setReload((r) => r + 1)}
        />
      )}
      {mgrModal && (
        <Modal
          title="담당자 이력 편집"
          wide
          onClose={() => setMgrModal(false)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setMgrModal(false)} disabled={mgrBusy}>취소</button>
              <button className="btn btn-primary" onClick={saveMgrModal} disabled={mgrBusy}>{mgrBusy ? '저장 중…' : '전체 저장'}</button>
            </>
          )}
        >
          {mgrErr && <div className="login-err" style={{ marginBottom: 12 }}>{mgrErr}</div>}
          <p className="muted" style={{ marginTop: 0 }}>저장 시 전체 이력이 교체됩니다. 종료일이 비어 있으면 현재 담당자로 표시됩니다.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 150px 1fr 1fr 42px', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
            <span>시작일</span><span>종료일</span><span>이름</span><span>비고</span><span />
          </div>
          {mgrEdit.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 150px 1fr 1fr 42px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input className="input" type="date" value={r.start} onChange={(e) => setMgrEdit((prev) => prev.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x))} />
              <input className="input" type="date" value={r.end} onChange={(e) => setMgrEdit((prev) => prev.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x))} />
              <input className="input" placeholder="담당자 이름" value={r.name} onChange={(e) => setMgrEdit((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
              <input className="input" placeholder="비고 (선택)" value={r.note ?? ''} onChange={(e) => setMgrEdit((prev) => prev.map((x, idx) => idx === i ? { ...x, note: e.target.value } : x))} />
              <button className="btn btn-ghost" title="행 삭제" style={{ padding: 0, width: 42 }} onClick={() => setMgrEdit((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => setMgrEdit((prev) => [...prev, { start: '', end: '', name: '', note: '' }])}>＋ 행 추가</button>
        </Modal>
      )}
    </div>
  )
}
