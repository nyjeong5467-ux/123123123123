// 안전·보건 교육 — 교육 이수 현황 워크스페이스(2026-10-22 개편).
//   좌측 카테고리 + 상단 누적 탭(연 학교마다 탭, × 로 닫음, 재접속 시 복원) + 검색.
//   1단계 '교육 이수 현황': 필터 바 · KPI 4장 · 학교별 이수 현황 표(검색) · 선택 학교 패널(도넛·안내).
//   2단계 학교 탭: 요약 띠 · 근무자별 진도(진도 게이지 클릭 입력·교육메모·상태) · 교육 회차 대장 ·
//   관리감독자 교육 · 선택 근무자 패널(안내 메모).
// 열람 범위는 서버가 강제(GET /education/overview, /{sid}/records): 관리자(admin)만 전체,
// 그 외는 담당자(명단 H열)=내 이름인 수강생만. 화면은 scope 안내만 표시.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download,
  GraduationCap, Info, ListChecks, Mail, MinusCircle, Plus, Search, Send, Upload, Users, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import '../styles/hier.css'
import '../styles/eduws.css'

// ── 타입 ──
type Me = { login_id?: string; name?: string; role?: string }
type SchoolStat = {
  school_id: string; school_name: string; school_level: string; region: string
  manager: string; managers: string[]
  total: number; completed: number; in_progress: number; not_started: number
  avg_progress: number; memo_count: number; unnamed: number
}
type Overview = { scope: 'all' | 'mine'; names: string[]; schools: SchoolStat[] }
type EduRecord = {
  id: string; school_id: string; person_name: string; job: string; progress: number; completed: boolean
  seq: number; note: string; memo: string; manager: string; updated_at: string
}
type EduSession = {
  id: string; school_id: string; date: string; kind: string; accident_type: string
  headcount: number; topic: string; target: number; note: string; created_at: string
}
type Supervisor = { id: string; date: string; name: string; completed: boolean }
type CellField = 'person_name' | 'progress' | 'memo' | 'note'
type TabId = 'overview' | 'admin' | `school:${string}`

// ── 상수 ──
const PLACEHOLDER_NAME = /^수강생 \d+$/
const COURSE_LABEL = '2026년 하반기 정기안전보건교육'
const COURSE_DUE = '2026.12.31'
const SESSION_KINDS = ['정기안전교육', '채용시 안전교육', '수시교육']
const ACCIDENT_TYPES = ['넘어짐', '끼임', '부딪힘', '떨어짐', '화상', '근골격계', '기타']
const HQ_ROLES = ['hq_admin', 'executive']
const WS_STORE = 'edu.ws.v1'
const STATUS_OPTS = [
  { value: 'done', label: '이수 완료' },
  { value: 'prog', label: '진행 중' },
  { value: 'wait', label: '수료 대기(100%)' },
  { value: 'none', label: '미시작' },
]

const todayStr = () => new Date().toISOString().slice(0, 10)
const pct = (v: number) => Math.round(v * 100)
// 수강생 상태: 수료 / 진도 100% 미수료(수료 대기) / 진행 중 / 미시작
function statusOf(r: EduRecord): 'done' | 'wait' | 'prog' | 'none' {
  if (r.completed) return 'done'
  if (r.progress >= 1) return 'wait'
  if (r.progress > 0) return 'prog'
  return 'none'
}
const STATUS_LABEL = { done: '이수 완료', wait: '수료 대기', prog: '진행 중', none: '미시작' } as const
const displayName = (r: EduRecord) => (PLACEHOLDER_NAME.test(r.person_name) ? `${r.person_name}(성명 미기입)` : r.person_name)

function loadWs(): { tabs: TabId[]; active: TabId } {
  try {
    const raw = localStorage.getItem(WS_STORE)
    if (raw) {
      const d = JSON.parse(raw) as { tabs?: string[]; active?: string }
      const tabs = (d.tabs || []).filter((t): t is TabId => t === 'overview' || t === 'admin' || t.startsWith('school:'))
      if (tabs.length) return { tabs, active: tabs.includes(d.active as TabId) ? (d.active as TabId) : tabs[0] }
    }
  } catch { /* 저장소 미지원 */ }
  return { tabs: ['overview'], active: 'overview' }
}

// 테이블 쿼리 설정(모듈 상수 — 렌더 간 안정)
const RECORD_FILTERS: FilterDef<EduRecord>[] = [
  { key: 'st', label: '이수 상태', options: STATUS_OPTS, accessor: (r) => statusOf(r) },
]
const RECORD_SORTS = {
  seq: (r: EduRecord) => r.seq || 0,
  name: (r: EduRecord) => r.person_name,
  progress: (r: EduRecord) => r.progress,
}
const SCHOOL_SORTS = {
  name: (s: SchoolStat) => s.school_name,
  total: (s: SchoolStat) => s.total,
  rate: (s: SchoolStat) => (s.total ? s.completed / s.total : 0),
}

function csvDownload(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function Education() {
  // ── 워크스페이스 ──
  const [ws, setWs] = useState(loadWs)
  const active = ws.active
  const openTab = useCallback((t: TabId) => {
    setWs((w) => ({ tabs: w.tabs.includes(t) ? w.tabs : [...w.tabs, t], active: t }))
  }, [])
  function closeTab(t: TabId) {
    setWs((w) => {
      const tabs = w.tabs.filter((x) => x !== t)
      if (!tabs.length) return { tabs: ['overview'], active: 'overview' }
      if (w.active !== t) return { tabs, active: w.active }
      const i = w.tabs.indexOf(t)
      return { tabs, active: tabs[Math.max(0, i - 1)] }
    })
  }
  useEffect(() => { try { localStorage.setItem(WS_STORE, JSON.stringify(ws)) } catch { /* 무시 */ } }, [ws])

  // ── 공통 데이터 ──
  const [me, setMe] = useState<Me | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const [ovErr, setOvErr] = useState('')
  const [ovReload, setOvReload] = useState(0)
  const isHq = !!me && HQ_ROLES.includes(me.role || '')
  const isSuper = ov?.scope === 'all'

  useEffect(() => {
    let alive = true
    api<Me>('/auth/me').then((d) => { if (alive) setMe(d) }).catch(() => { if (alive) setMe(null) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let alive = true
    api<Overview>('/education/overview')
      .then((d) => { if (alive) { setOv(d); setOvErr('') } })
      .catch((e) => { if (alive) setOvErr(e instanceof Error ? e.message : '오류') })
    return () => { alive = false }
  }, [ovReload])
  const refreshOverview = useCallback(() => setOvReload((n) => n + 1), [])

  const schoolById = useMemo(() => new Map((ov?.schools || []).map((s) => [s.school_id, s])), [ov])
  const schoolName = (id: string) => schoolById.get(id)?.school_name || id.slice(0, 8)

  // 딥링크 ?school=id → 학교 탭
  const [linkParams] = useSearchParams()
  useEffect(() => {
    const sid = linkParams.get('school')
    if (sid) openTab(`school:${sid}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 1단계 필터 ──
  const [fSchool, setFSchool] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fManager, setFManager] = useState('')
  const [selId, setSelId] = useState('')   // 표에서 선택한 학교(우측 패널)

  const managers = useMemo(() => {
    const set = new Set<string>()
    for (const s of ov?.schools || []) { if (s.manager) set.add(s.manager); s.managers.forEach((m) => set.add(m)) }
    return Array.from(set).sort()
  }, [ov])
  const filtered = useMemo(() => (ov?.schools || []).filter((s) => {
    if (fSchool && s.school_id !== fSchool) return false
    if (fManager && !(s.manager === fManager || s.managers.includes(fManager))) return false
    if (fStatus === 'done' && s.completed === 0) return false
    if (fStatus === 'prog' && s.in_progress === 0) return false
    if (fStatus === 'none' && s.not_started === 0) return false
    return true
  }), [ov, fSchool, fManager, fStatus])
  const schoolQ = useTableQuery(filtered, {
    searchFields: [(s) => s.school_name, (s) => s.region, (s) => s.manager],
    sortAccessors: SCHOOL_SORTS,
    initialSort: { key: 'name', dir: 'asc' },
    pageSize: 12,
    searchPlaceholder: '학교명 검색',
  })
  const kpi = useMemo(() => filtered.reduce((a, s) => ({
    total: a.total + s.total, completed: a.completed + s.completed,
    prog: a.prog + s.in_progress, none: a.none + s.not_started, schools: a.schools + 1,
  }), { total: 0, completed: 0, prog: 0, none: 0, schools: 0 }), [filtered])
  const sel = selId ? schoolById.get(selId) : undefined
  useEffect(() => { if (!selId && schoolQ.view[0]) setSelId(schoolQ.view[0].school_id) }, [schoolQ.view, selId])

  // ── 2단계: 학교 탭 데이터(열린 학교별 캐시) ──
  const activeSid = active.startsWith('school:') ? active.slice(7) : ''
  const [records, setRecords] = useState<Record<string, EduRecord[]>>({})
  const [sessions, setSessions] = useState<Record<string, EduSession[]>>({})
  const [supers, setSupers] = useState<Record<string, Supervisor[]>>({})
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [schoolErr, setSchoolErr] = useState('')
  const [subtab, setSubtab] = useState<'people' | 'sessions' | 'supervisor'>('people')
  const loadSchool = useCallback(async (sid: string) => {
    setSchoolLoading(true); setSchoolErr('')
    try {
      const [rr, ss, sp] = await Promise.all([
        api<EduRecord[]>(`/education/${sid}/records`),
        api<EduSession[]>(`/education/${sid}/sessions`).catch(() => [] as EduSession[]),
        api<Supervisor[]>(`/education/${sid}/supervisors`).catch(() => [] as Supervisor[]),
      ])
      setRecords((m) => ({ ...m, [sid]: Array.isArray(rr) ? rr : [] }))
      setSessions((m) => ({ ...m, [sid]: Array.isArray(ss) ? ss : [] }))
      setSupers((m) => ({ ...m, [sid]: Array.isArray(sp) ? sp : [] }))
    } catch (e) { setSchoolErr(e instanceof Error ? e.message : '오류') }
    finally { setSchoolLoading(false) }
  }, [])
  useEffect(() => { if (activeSid && !records[activeSid]) void loadSchool(activeSid) }, [activeSid, records, loadSchool])

  const recs = useMemo(() => records[activeSid] || [], [records, activeSid])
  const recQ = useTableQuery(recs, {
    searchFields: [(r) => r.person_name, (r) => r.job, (r) => r.memo, (r) => r.note],
    filters: RECORD_FILTERS,
    sortAccessors: RECORD_SORTS,
    initialSort: { key: 'seq', dir: 'asc' },
    pageSize: 10,
    searchPlaceholder: '이름·업무·메모 검색',
  })
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState('')
  useEffect(() => { setChecked(new Set()); setFocusId(''); setSubtab('people') }, [activeSid])
  const focusRec = recs.find((r) => r.id === focusId) || recs.find((r) => checked.has(r.id))

  // ── 셀 편집(진도 게이지 · 메모 · 특이사항 · 성명) ──
  const [cell, setCell] = useState<{ id: string; field: CellField } | null>(null)
  const [cellVal, setCellVal] = useState('')
  const [cellBusy, setCellBusy] = useState(false)
  const [cellErr, setCellErr] = useState('')
  function openCell(r: EduRecord, field: CellField) {
    setCell({ id: r.id, field }); setCellErr('')
    setCellVal(field === 'progress' ? String(pct(r.progress))
      : field === 'person_name' ? (PLACEHOLDER_NAME.test(r.person_name) ? '' : r.person_name)
        : (r[field] || ''))
  }
  async function patchRecord(id: string, body: Partial<Pick<EduRecord, CellField | 'completed'>>) {
    const sid = activeSid
    const prev = records[sid] || []
    setRecords((m) => ({ ...m, [sid]: prev.map((r) => (r.id === id ? { ...r, ...body } : r)) }))
    try {
      const saved = await api<EduRecord>(`/education/records/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setRecords((m) => ({ ...m, [sid]: (m[sid] || []).map((r) => (r.id === id ? { ...r, ...saved } : r)) }))
      if ('progress' in body || 'completed' in body) refreshOverview()
      return true
    } catch (e) {
      setRecords((m) => ({ ...m, [sid]: prev }))
      setCellErr(e instanceof Error ? e.message : '저장 실패')
      return false
    }
  }
  async function saveCell() {
    if (!cell || cellBusy) return
    const { id, field } = cell
    const body: Partial<Pick<EduRecord, CellField>> = {}
    if (field === 'progress') {
      const n = Number(cellVal.trim())
      if (cellVal.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) { setCellErr('0~100 사이 숫자를 입력하세요.'); return }
      body.progress = n / 100
    } else if (field === 'person_name') {
      if (!cellVal.trim()) { setCellErr('성명을 입력하세요.'); return }
      body.person_name = cellVal.trim()
    } else body[field] = cellVal.trim()
    setCellBusy(true)
    const ok = await patchRecord(id, body)
    setCellBusy(false)
    if (ok) setCell(null)
  }
  function cellPopover(r: EduRecord, field: CellField) {
    if (!cell || cell.id !== r.id || cell.field !== field) return null
    const isText = field === 'memo' || field === 'note'
    const label = field === 'progress' ? '진도율(%)' : field === 'memo' ? '교육메모' : field === 'note' ? '특이사항' : '성명'
    return (
      <div className="edw-pop" onClick={(e) => e.stopPropagation()}>
        <div className="edw-pop-h"><b>{label}</b><span className="muted">{isText ? 'Ctrl+Enter 저장' : 'Enter 저장 · Esc 취소'}</span></div>
        {isText ? (
          <textarea className="input" autoFocus rows={3} value={cellVal} onChange={(e) => setCellVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setCell(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void saveCell() } }}
            placeholder={field === 'memo' ? '예) 26년 상반기 집합교육 참석 예정' : '예) 26.9.1자 신규채용'} />
        ) : (
          <input className="input" autoFocus value={cellVal} type={field === 'progress' ? 'number' : 'text'} min={0} max={100}
            onChange={(e) => setCellVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setCell(null); if (e.key === 'Enter') { e.preventDefault(); void saveCell() } }}
            placeholder={field === 'progress' ? '0~100' : '성명'} />
        )}
        {field === 'progress' && (
          <div className="edw-pop-quick">{[0, 25, 50, 75, 100].map((v) => <button key={v} type="button" className="btn btn-ghost" onClick={() => setCellVal(String(v))}>{v}%</button>)}</div>
        )}
        {cellErr && <div className="edw-pop-err">{cellErr}</div>}
        <div className="edw-pop-f">
          <button type="button" className="btn btn-ghost" disabled={cellBusy} onClick={() => setCell(null)}>취소</button>
          <button type="button" className="btn btn-primary" disabled={cellBusy} onClick={() => void saveCell()}>{cellBusy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    )
  }

  // ── 안내(미이수자) — 메모에 '안내' 기록 + 안내 문구 클립보드 복사 ──
  const [notice, setNotice] = useState('')
  async function notify(ids: string[]) {
    if (!ids.length) { setNotice('안내할 근무자를 선택하세요.'); return }
    const stamp = `${new Date().getMonth() + 1}.${new Date().getDate()} 교육 안내`
    let n = 0
    for (const id of ids) {
      const r = recs.find((x) => x.id === id)
      if (!r) continue
      const memo = r.memo ? `${r.memo} / ${stamp}` : stamp
      if (await patchRecord(id, { memo })) n++
    }
    const text = `[${COURSE_LABEL}] ${schoolName(activeSid)} 미이수 안내 — 교육 마감 ${COURSE_DUE}\n` +
      ids.map((id) => recs.find((x) => x.id === id)).filter(Boolean)
        .map((r) => `- ${r!.person_name}${r!.job ? `(${r!.job})` : ''} · 진도 ${pct(r!.progress)}%`).join('\n')
    try { await navigator.clipboard?.writeText(text) } catch { /* 클립보드 미지원 */ }
    setNotice(`${n}명 메모에 '${stamp}' 기록 · 안내 문구를 클립보드에 복사했습니다(카톡·문자에 붙여넣기).`)
    setTimeout(() => setNotice(''), 4000)
  }

  // ── 회차 등록 · 관리감독자 · 진도 일괄/CSV/메일 (기존 기능) ──
  const [sOpen, setSOpen] = useState(false)
  const [sDate, setSDate] = useState(todayStr())
  const [sKind, setSKind] = useState(SESSION_KINDS[0])
  const [sAcc, setSAcc] = useState(ACCIDENT_TYPES[0])
  const [sHead, setSHead] = useState('')
  const [sTopic, setSTopic] = useState('')
  const [sTarget, setSTarget] = useState('')
  const [sNote, setSNote] = useState('')
  const [sBusy, setSBusy] = useState(false)
  const [sErr, setSErr] = useState('')
  async function addSession() {
    if (!activeSid || sBusy) return
    if (!sDate) { setSErr('교육일을 입력하세요.'); return }
    const n = Number(sHead)
    if (!sHead || Number.isNaN(n) || n <= 0) { setSErr('교육 실시 인원을 입력하세요.'); return }
    setSBusy(true); setSErr('')
    try {
      await api(`/education/${activeSid}/sessions`, { method: 'POST', body: JSON.stringify({ date: sDate, kind: sKind, accident_type: sAcc, headcount: n, topic: sTopic.trim(), target: Number(sTarget) || 0, note: sNote.trim() }) })
      setSOpen(false)
      const ss = await api<EduSession[]>(`/education/${activeSid}/sessions`).catch(() => [] as EduSession[])
      setSessions((m) => ({ ...m, [activeSid]: ss }))
    } catch (e) { setSErr(e instanceof Error ? e.message : '저장에 실패했습니다.') }
    finally { setSBusy(false) }
  }
  const [spDate, setSpDate] = useState('')
  const [spName, setSpName] = useState('')
  const [spErr, setSpErr] = useState('')
  async function reloadSupers(sid: string) {
    const d = await api<Supervisor[]>(`/education/${sid}/supervisors`).catch(() => [] as Supervisor[])
    setSupers((m) => ({ ...m, [sid]: d }))
  }
  async function addSuper() {
    if (!activeSid || !spName.trim()) { setSpErr('성명을 입력하세요.'); return }
    setSpErr('')
    try {
      await api(`/education/${activeSid}/supervisors`, { method: 'POST', body: JSON.stringify({ date: spDate || todayStr(), name: spName.trim() }) })
      setSpName(''); void reloadSupers(activeSid)
    } catch (e) { setSpErr(e instanceof Error ? e.message : '등록에 실패했습니다.') }
  }
  function toggleSuper(r: Supervisor) {
    const sid = activeSid
    setSupers((m) => ({ ...m, [sid]: (m[sid] || []).map((x) => (x.id === r.id ? { ...x, completed: !x.completed } : x)) }))
    api(`/education/supervisors/${r.id}`, { method: 'PUT', body: JSON.stringify({ completed: !r.completed }) }).catch(() => reloadSupers(sid))
  }
  function removeSuper(id: string) {
    if (!window.confirm('이 교육 기록을 삭제할까요?')) return
    const sid = activeSid
    api(`/education/supervisors/${id}`, { method: 'DELETE' }).finally(() => reloadSupers(sid))
  }

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkErr, setBulkErr] = useState('')
  async function ingestBulk() {
    if (!activeSid) return
    setBulkBusy(true); setBulkErr('')
    try {
      const rows = bulkText.split('\n').map((line) => {
        const [name, prog, done] = line.split(',').map((c) => c.trim())
        if (!name) return null
        return { school_id: activeSid, person_name: name, progress: Number(prog) / 100, completed: (done || '').toLowerCase() === 'y' }
      }).filter((r): r is NonNullable<typeof r> => r !== null)
      await api('/education/ingest', { method: 'POST', body: JSON.stringify({ rows }) })
      setBulkOpen(false); setBulkText('')
      await loadSchool(activeSid); refreshOverview()
    } catch (e) { setBulkErr(e instanceof Error ? e.message : '입력에 실패했습니다.') }
    finally { setBulkBusy(false) }
  }
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  async function importCsv(files: FileList | null) {
    const f = files?.[0]; if (!f) return
    setImportBusy(true); setImportMsg(null)
    try {
      const rows = (await f.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const [school = '', name = '', job = '', prog = '', done = ''] = l.split(',')
        return { school: school.trim(), person_name: name.trim(), job: job.trim(), progress: Number(prog.trim()) || 0, completed: /^(y|yes|수료|true|1)$/i.test(done.trim()) }
      }).filter((r) => r.school && r.person_name && !/^(학교|school)/i.test(r.school))
      if (!rows.length) { setImportMsg({ ok: false, text: 'CSV에서 행을 찾지 못했습니다. 형식: 학교명,성명,직무,진도(0~100),수료(y/n)' }); return }
      const r = await api<{ ingested: number; unmatched: string[] }>('/education/import', { method: 'POST', body: JSON.stringify({ rows }) })
      const um = r.unmatched.length ? ` · 학교 미매칭 ${r.unmatched.length}건(${r.unmatched.slice(0, 3).join(', ')}${r.unmatched.length > 3 ? '…' : ''})` : ''
      setImportMsg({ ok: true, text: `${r.ingested}건 인입 완료${um}` })
      setRecords({}); refreshOverview()
    } catch (e) { setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'CSV 인입 실패' }) }
    finally { setImportBusy(false) }
  }
  const [mailMsg, setMailMsg] = useState('')
  async function sendMail() {
    if (!activeSid) return
    try {
      const d = await api<{ total: number; completed_count: number; avg_progress: number }>(`/education/${activeSid}/mail`, { method: 'POST' })
      setMailMsg(`진도 메일 발송 요청 완료 — 평균진도 ${pct(d.avg_progress || 0)}% · 수료 ${d.completed_count}/${d.total}`)
    } catch (e) { setMailMsg(e instanceof Error ? `메일 발송 실패: ${e.message}` : '메일 발송 실패') }
    setTimeout(() => setMailMsg(''), 4000)
  }

  // ── 내보내기 ──
  function exportOverview() {
    csvDownload(`교육이수현황_${todayStr()}.csv`, ['학교', '구분', '지역', '담당 조사원', '대상', '이수', '진행 중', '미시작', '이수율(%)', '평균 진도(%)'],
      schoolQ.all.map((s) => [s.school_name, s.school_level, s.region, s.manager, s.total, s.completed, s.in_progress, s.not_started, s.total ? Math.round(s.completed / s.total * 100) : 0, pct(s.avg_progress)]))
  }
  function exportSchool() {
    csvDownload(`교육진도표_${schoolName(activeSid)}_${todayStr()}.csv`, ['순번', '성명', '현업업무', '특이사항', '진도율(%)', '상태', '교육메모', '담당자'],
      recQ.all.map((r) => [r.seq || '', PLACEHOLDER_NAME.test(r.person_name) ? '' : r.person_name, r.job, r.note || '', pct(r.progress), STATUS_LABEL[statusOf(r)], r.memo || '', r.manager || '']))
  }

  const tabLabel = (t: TabId) => (t === 'overview' ? '교육 이수 현황' : t === 'admin' ? '명단 인입·관리' : schoolName(t.slice(7)))
  const recentSchools = ws.tabs.filter((t) => t.startsWith('school:')).map((t) => t.slice(7))

  // ════════ 패널: 교육 이수 현황 ════════
  function panelOverview() {
    const rate = kpi.total ? Math.round(kpi.completed / kpi.total * 100) : 0
    const selRate = sel && sel.total ? Math.round(sel.completed / sel.total * 100) : 0
    return (
      <>
        <div className="edw-head">
          <div>
            <h3>교육 이수 현황</h3>
            <div className="sub">학교별 이수 현황을 확인하고 필요한 교육을 안내하세요. {ov?.scope === 'mine' && <b>· 내 담당 수강생({ov.names.join(', ')})만 표시</b>}</div>
          </div>
          <div className="sp" />
          <button className="edw-btn" onClick={exportOverview}><Download size={15} /> 현황 다운로드</button>
          {isHq && <button className="edw-btn" onClick={() => openTab('admin')}><Upload size={15} /> 명단 인입·관리</button>}
        </div>

        <div className="edw-filters">
          <label>교육연도 <select className="select" value="2026" onChange={() => {}}><option value="2026">2026년</option></select></label>
          <label>학교
            <select className="select" value={fSchool} onChange={(e) => setFSchool(e.target.value)}>
              <option value="">전체 학교</option>
              {(ov?.schools || []).map((s) => <option key={s.school_id} value={s.school_id}>{s.school_name}</option>)}
            </select>
          </label>
          <label>교육 묶음 <select className="select" value="h2" onChange={() => {}}><option value="h2">{COURSE_LABEL}</option></select></label>
          <label>이수 상태
            <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">전체</option>
              <option value="done">이수자 있는 학교</option>
              <option value="prog">진행 중 있는 학교</option>
              <option value="none">미시작 있는 학교</option>
            </select>
          </label>
          {isSuper && (
            <label>담당 조사원
              <select className="select" value={fManager} onChange={(e) => setFManager(e.target.value)}>
                <option value="">전체</option>
                {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          <div className="hint">선택한 조건 기준 · {kpi.schools}개 학교 · 교육 마감 {COURSE_DUE}{ovErr && <span style={{ color: 'var(--red-ink)' }}> · 오류: {ovErr}</span>}</div>
        </div>

        <div className="edw-kpis">
          <div className="edw-kpi"><span className="ic b"><Users size={17} /></span><div><div className="l">대상 근무자</div><div className="v">{kpi.total}명</div><div className="d">{kpi.schools}개 학교</div></div></div>
          <div className="edw-kpi"><span className="ic g"><CheckCircle2 size={17} /></span><div><div className="l">전체 교육 이수</div><div className="v">{kpi.completed}명 <span className="pct">{rate}%</span></div><div className="d">배정된 필수교육 수료 완료</div></div></div>
          <div className="edw-kpi"><span className="ic a"><Clock3 size={17} /></span><div><div className="l">진행 중</div><div className="v">{kpi.prog}명</div><div className="d">일부 교육 수강 중</div></div></div>
          <div className="edw-kpi"><span className="ic r"><AlertCircle size={17} /></span><div><div className="l">미시작</div><div className="v">{kpi.none}명</div><div className="d">배정 교육 수강 전</div></div></div>
        </div>

        <div className="edw-cols">
          <div className="edw-card">
            <div className="edw-card-h">
              <h4>학교별 이수 현황</h4>
              <div className="sp" />
              <div className="edw-search"><Search size={14} /><input className="input" placeholder="학교명 검색" value={schoolQ.search} onChange={(e) => schoolQ.setSearch(e.target.value)} /></div>
            </div>
            <table className="edw-tbl">
              <thead><tr>
                <th onClick={() => schoolQ.toggleSort('name')} style={{ cursor: 'pointer' }}>학교</th>
                <th className="c" onClick={() => schoolQ.toggleSort('total')} style={{ cursor: 'pointer' }}>대상</th>
                <th className="c">전체 이수</th><th className="c">진행 중</th><th className="c">미시작</th>
                <th onClick={() => schoolQ.toggleSort('rate')} style={{ cursor: 'pointer' }}>이수율</th>
                {isSuper && <th>담당</th>}
                <th />
              </tr></thead>
              <tbody>
                {!ov && !ovErr && <tr><td colSpan={8}><div className="tstate">불러오는 중…</div></td></tr>}
                {schoolQ.view.map((s) => {
                  const r = s.total ? Math.round(s.completed / s.total * 100) : 0
                  return (
                    <tr key={s.school_id} className={'row' + (selId === s.school_id ? ' sel' : '')} onClick={() => setSelId(s.school_id)} onDoubleClick={() => openTab(`school:${s.school_id}`)}>
                      <td><b>{s.school_name}</b>{s.unnamed > 0 && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>성명 미기입 {s.unnamed}</span>}</td>
                      <td className="c">{s.total}명</td>
                      <td className="c">{s.completed}명</td>
                      <td className="c">{s.in_progress}명</td>
                      <td className="c">{s.not_started}명</td>
                      <td><span className="edw-bar"><span className="trk"><span className={'fil' + (r >= 100 ? ' done' : r < 30 ? ' amb' : '')} style={{ width: `${r}%` }} /></span><span className="pct">{r}%</span></span></td>
                      {isSuper && <td className="muted">{s.managers.join(', ') || s.manager || '—'}</td>}
                      <td className="c"><button className="btn btn-ghost" style={{ height: 28, padding: '0 6px' }} onClick={(e) => { e.stopPropagation(); openTab(`school:${s.school_id}`) }} title="근무자별 진도 보기"><ChevronRight size={15} /></button></td>
                    </tr>
                  )
                })}
                {ov && schoolQ.view.length === 0 && <tr><td colSpan={8}><div className="tstate">{(ov.schools.length === 0) ? (ov.scope === 'mine' ? '내 담당으로 등록된 수강생이 없습니다. 명단의 담당자 이름과 계정 이름이 같은지 확인하세요.' : '수강생 명단이 없습니다. [명단 인입·관리]에서 인입하세요.') : '조건에 맞는 학교가 없습니다.'}</div></td></tr>}
              </tbody>
            </table>
            <div className="edw-card-f">
              <span>총 {schoolQ.total}개 학교</span>
              <div className="sp" />
              <span>이수율 = 수료 처리된 근무자 ÷ 대상 근무자</span>
              <span className="edw-pager">
                <button disabled={schoolQ.page <= 1} onClick={() => schoolQ.setPage(schoolQ.page - 1)}><ChevronLeft size={14} /></button>
                {schoolQ.page}/{Math.max(1, schoolQ.pageCount)}
                <button disabled={schoolQ.page >= schoolQ.pageCount} onClick={() => schoolQ.setPage(schoolQ.page + 1)}><ChevronRight size={14} /></button>
              </span>
            </div>
          </div>

          <div className="edw-card edw-panel">
            {!sel && <div className="muted" style={{ fontSize: 13 }}>표에서 학교를 선택하면 요약이 표시됩니다.</div>}
            {sel && (
              <>
                <div className="cap">선택한 학교</div>
                <div className="nm">{sel.school_name}</div>
                <div className="meta">대상 근무자 {sel.total}명{sel.manager ? ` · 담당 ${sel.manager}` : ''}</div>
                <div className="edw-donut">
                  <div className="ring" style={{ ['--p' as string]: `${selRate}%` }}><span>{selRate}%</span></div>
                  <div className="lb">전체 교육 이수율<br /><span className="muted" style={{ fontWeight: 600 }}>평균 진도 {pct(sel.avg_progress)}%</span></div>
                </div>
                <div className="edw-three">
                  <div><div className="k">이수</div><div className="v g">{sel.completed}명</div></div>
                  <div><div className="k">진행</div><div className="v b">{sel.in_progress}명</div></div>
                  <div><div className="k">미시작</div><div className="v a">{sel.not_started}명</div></div>
                </div>
                {sel.total - sel.completed > 0 && (
                  <div className="edw-note"><b>⚠ 안내가 필요한 근무자</b><br /><span className="big">미이수 {sel.total - sel.completed}명</span><br />교육 마감 {COURSE_DUE}</div>
                )}
                <button className="edw-btn fill" onClick={() => openTab(`school:${sel.school_id}`)}>근무자별 진도 보기</button>
                <button className="edw-btn" onClick={() => { openTab(`school:${sel.school_id}`); setSubtab('people') }}>미이수자 안내</button>
              </>
            )}
          </div>
        </div>
        <div className="edw-info"><Info size={16} /> 학교를 선택하면 근무자별 교육 진도를 확인할 수 있어요. 더블클릭하거나 › 를 누르면 학교 탭이 위에 쌓입니다.</div>
      </>
    )
  }

  // ════════ 패널: 학교 탭 ════════
  function panelSchool(sid: string) {
    const st = schoolById.get(sid)
    const total = recs.length
    const done = recs.filter((r) => r.completed).length
    const prog = recs.filter((r) => statusOf(r) === 'prog' || statusOf(r) === 'wait').length
    const none = recs.filter((r) => statusOf(r) === 'none').length
    const rate = total ? Math.round(done / total * 100) : 0
    const ss = sessions[sid] || []
    const sp = supers[sid] || []
    const allChecked = recQ.view.length > 0 && recQ.view.every((r) => checked.has(r.id))
    return (
      <>
        <button className="edw-back" onClick={() => setWs((w) => ({ ...w, active: 'overview' }))}><ArrowLeft size={14} /> 학교 목록</button>
        <div className="edw-head">
          <div><h3>{st?.school_name || schoolName(sid)}</h3><div className="sub">근무자별 교육 진도{st?.manager ? ` · 담당 조사원 ${st.manager}` : ''}</div></div>
          <div className="sp" />
          <button className="edw-btn" onClick={exportSchool}><Download size={15} /> 현황 다운로드</button>
          {isHq && <button className="edw-btn" onClick={() => void sendMail()}><Mail size={15} /> 진도 메일</button>}
          <button className="edw-btn fill" onClick={() => void notify(recs.filter((r) => !r.completed).map((r) => r.id))}><Send size={15} /> 교육 안내(미이수 전원)</button>
        </div>
        {(mailMsg || notice) && <div className="pillx ok" style={{ marginBottom: 10 }}>{mailMsg || notice}</div>}

        <div className="edw-strip">
          <div className="t">{COURSE_LABEL}<span className="sep">|</span><span className="muted">교육 마감 {COURSE_DUE}</span>{st?.unnamed ? <><span className="sep">|</span><span className="muted">성명 미기입 {st.unnamed}명 — 이름 칸을 클릭해 기입</span></> : null}</div>
          <div className="edw-kpis" style={{ marginBottom: 0 }}>
            <div className="edw-kpi"><span className="ic b"><Users size={17} /></span><div><div className="l">대상 근무자</div><div className="v">{total}명</div></div></div>
            <div className="edw-kpi"><span className="ic g"><CheckCircle2 size={17} /></span><div><div className="l">전체 이수</div><div className="v">{done}명 <span className="pct">{rate}%</span></div></div></div>
            <div className="edw-kpi"><span className="ic a"><Clock3 size={17} /></span><div><div className="l">진행 중</div><div className="v">{prog}명</div></div></div>
            <div className="edw-kpi"><span className="ic r"><AlertCircle size={17} /></span><div><div className="l">미시작</div><div className="v">{none}명</div></div></div>
          </div>
        </div>

        <div className="edw-card" onClick={() => { if (cell && !cellBusy) setCell(null) }}>
          <div className="edw-subtabs">
            <button className={'edw-subtab' + (subtab === 'people' ? ' active' : '')} onClick={() => setSubtab('people')}><ListChecks size={14} /> 근무자별 진도<span className="n">{total}</span></button>
            <button className={'edw-subtab' + (subtab === 'sessions' ? ' active' : '')} onClick={() => setSubtab('sessions')}><BookOpen size={14} /> 교육 회차 대장<span className="n">{ss.length}</span></button>
            <button className={'edw-subtab' + (subtab === 'supervisor' ? ' active' : '')} onClick={() => setSubtab('supervisor')}><GraduationCap size={14} /> 관리감독자 교육<span className="n">{sp.length}</span></button>
          </div>

          {subtab === 'people' && (
            <>
              <div className="edw-toolbar">
                <div className="edw-search"><Search size={14} /><input className="input" placeholder="이름·업무·메모 검색" value={recQ.search} onChange={(e) => recQ.setSearch(e.target.value)} /></div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>이수 상태
                  <select className="select" style={{ height: 34 }} value={recQ.filterValues.st || ''} onChange={(e) => recQ.setFilter('st', e.target.value)}>
                    <option value="">전체</option>
                    {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <div className="sp" />
                <span className="cnt">필수교육 1개 · {recQ.total}명</span>
                {isHq && <button className="btn btn-ghost" style={{ height: 34 }} onClick={() => { setBulkText(''); setBulkErr(''); setBulkOpen(true) }}>진도 일괄 입력</button>}
                <button className="edw-btn" style={{ height: 34 }} disabled={checked.size === 0} onClick={() => void notify(Array.from(checked))}><Send size={14} /> 선택한 근무자 안내{checked.size ? ` (${checked.size})` : ''}</button>
              </div>
              <table className="edw-tbl">
                <thead><tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={(e) => setChecked((s) => { const n = new Set(s); recQ.view.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n })} /></th>
                  <th style={{ width: 30 }} className="c">No</th>
                  <th onClick={() => recQ.toggleSort('name')} style={{ cursor: 'pointer' }}>근무자</th>
                  <th>특이사항</th>
                  <th onClick={() => recQ.toggleSort('progress')} style={{ cursor: 'pointer', minWidth: 190 }}>{COURSE_LABEL.replace('2026년 ', '')}</th>
                  <th>교육메모</th>
                  <th className="c">상태</th>
                  {isSuper && <th>담당자</th>}
                </tr></thead>
                <tbody>
                  {schoolLoading && <tr><td colSpan={8}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!schoolLoading && schoolErr && <tr><td colSpan={8}><div className="tstate">오류: {schoolErr}</div></td></tr>}
                  {!schoolLoading && !schoolErr && recQ.view.map((r) => {
                    const s = statusOf(r); const p = pct(r.progress); const unnamed = PLACEHOLDER_NAME.test(r.person_name)
                    return (
                      <tr key={r.id} className={focusId === r.id || checked.has(r.id) ? 'sel' : ''} onClick={() => setFocusId(r.id)}>
                        <td><input type="checkbox" checked={checked.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setChecked((set) => { const n = new Set(set); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} /></td>
                        <td className="c muted">{r.seq || ''}</td>
                        <td className="edw-cell" onClick={(e) => { e.stopPropagation(); setFocusId(r.id); openCell(r, 'person_name') }}>
                          <div className="who">{unnamed ? <span className="unnamed">{r.person_name} · 성명 기입</span> : <b>{r.person_name}</b>}<span className="job">{r.job || '—'}</span></div>
                          {cellPopover(r, 'person_name')}
                        </td>
                        <td className="edw-cell" onClick={(e) => { e.stopPropagation(); openCell(r, 'note') }}>
                          <div className={'edw-memo' + (r.note ? '' : ' empty')}>{r.note || '—'}</div>
                          {cellPopover(r, 'note')}
                        </td>
                        <td className="edw-cell" onClick={(e) => { e.stopPropagation(); openCell(r, 'progress') }} title="클릭해서 진도율 입력">
                          {s === 'done' ? <span className="edw-st done"><CheckCircle2 size={13} /> 이수</span>
                            : s === 'none' ? <span className="edw-bar click"><span className="trk"><span className="fil" style={{ width: '0%' }} /></span><span className="pct">0%</span></span>
                              : <span className="edw-bar click"><span className="trk"><span className={'fil' + (s === 'wait' ? ' amb' : '')} style={{ width: `${p}%` }} /></span><span className="pct">{p}%{s === 'wait' ? ' · 수료 대기' : ''}</span></span>}
                          {cellPopover(r, 'progress')}
                        </td>
                        <td className="edw-cell" onClick={(e) => { e.stopPropagation(); openCell(r, 'memo') }}>
                          <div className={'edw-memo' + (r.memo ? '' : ' empty')}>{r.memo || '메모 입력…'}</div>
                          {cellPopover(r, 'memo')}
                        </td>
                        <td className="c">
                          <button type="button" className={'edw-st btn ' + s} title="클릭해서 수료/미수료 전환" onClick={(e) => { e.stopPropagation(); void patchRecord(r.id, { completed: !r.completed }) }}>
                            {s === 'done' ? <CheckCircle2 size={12} /> : s === 'none' ? <MinusCircle size={12} /> : <Clock3 size={12} />} {STATUS_LABEL[s]}
                          </button>
                        </td>
                        {isSuper && <td className="muted">{r.manager || '—'}</td>}
                      </tr>
                    )
                  })}
                  {!schoolLoading && !schoolErr && recQ.view.length === 0 && <tr><td colSpan={8}><div className="tstate">{recs.length === 0 ? '이 학교에 내가 볼 수 있는 수강생이 없습니다.' : '조건에 맞는 근무자가 없습니다.'}</div></td></tr>}
                </tbody>
              </table>
              <div className="edw-card-f">
                <div className="edw-legend">
                  <span><CheckCircle2 size={13} color="var(--edw-green)" /> 이수</span>
                  <span><span style={{ width: 18, height: 7, borderRadius: 99, background: 'var(--edw-blue)', display: 'inline-block' }} /> 수강 중</span>
                  <span><MinusCircle size={13} /> 미시작</span>
                </div>
                <div className="sp" />
                <span><Info size={13} style={{ verticalAlign: '-2px' }} /> 진도 100%여도 수료 처리 전에는 미이수입니다 · 게이지/메모/이름은 클릭해서 바로 입력</span>
                <span className="edw-pager">
                  {(recQ.page - 1) * recQ.pageSize + 1}–{Math.min(recQ.page * recQ.pageSize, recQ.total)} / {recQ.total}명
                  <button disabled={recQ.page <= 1} onClick={() => recQ.setPage(recQ.page - 1)}><ChevronLeft size={14} /></button>
                  <button disabled={recQ.page >= recQ.pageCount} onClick={() => recQ.setPage(recQ.page + 1)}><ChevronRight size={14} /></button>
                </span>
              </div>
            </>
          )}

          {subtab === 'sessions' && (
            <>
              <div className="edw-toolbar"><span className="cnt">교육 실시 기록 {ss.length}건</span><div className="sp" />{isHq && <button className="edw-btn fill" style={{ height: 34 }} onClick={() => { setSDate(todayStr()); setSKind(SESSION_KINDS[0]); setSAcc(ACCIDENT_TYPES[0]); setSHead(''); setSTopic(''); setSTarget(''); setSNote(''); setSErr(''); setSOpen(true) }}><Plus size={14} /> 회차 등록</button>}</div>
              <table className="edw-tbl">
                <thead><tr><th>No</th><th>교육일</th><th>구분</th><th>교육 주제</th><th>재해형태</th><th className="c">대상</th><th className="c">실시 인원</th><th>특이사항</th><th>작성일</th></tr></thead>
                <tbody>
                  {[...ss].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r, i) => (
                    <tr key={r.id}><td>{i + 1}</td><td><b>{r.date}</b></td><td><span className="pillx doing">{r.kind}</span></td><td>{r.topic || '—'}</td><td>{r.accident_type || '—'}</td><td className="c">{r.target ? `${r.target}명` : '—'}</td><td className="c">{r.headcount}명</td><td className="muted">{r.note || '—'}</td><td className="muted">{r.created_at}</td></tr>
                  ))}
                  {ss.length === 0 && <tr><td colSpan={9}><div className="tstate">등록된 교육 회차가 없습니다.{isHq ? " '회차 등록'으로 추가하세요." : ''}</div></td></tr>}
                </tbody>
              </table>
            </>
          )}

          {subtab === 'supervisor' && (
            <>
              {isHq && (
                <div className="edw-toolbar">
                  <label className="field"><span>교육일</span><input className="input" type="date" value={spDate} onChange={(e) => setSpDate(e.target.value)} /></label>
                  <label className="field"><span>대상(관리감독자)</span><input className="input" value={spName} onChange={(e) => setSpName(e.target.value)} placeholder="성명" /></label>
                  <button className="edw-btn fill" style={{ height: 34, alignSelf: 'flex-end' }} onClick={() => void addSuper()}>등록</button>
                  {spErr && <span style={{ color: 'var(--red-ink)', fontSize: 12, fontWeight: 700 }}>{spErr}</span>}
                </div>
              )}
              <table className="edw-tbl">
                <thead><tr><th>교육일</th><th>대상(관리감독자)</th><th>이수여부</th>{isHq && <th>처리</th>}</tr></thead>
                <tbody>
                  {sp.map((r) => (
                    <tr key={r.id}><td><b>{r.date}</b></td><td>{r.name}</td><td>{r.completed ? <span className="edw-st done">이수</span> : <span className="edw-st none">미이수</span>}</td>
                      {isHq && <td><button className="btn btn-ghost" onClick={() => toggleSuper(r)}>{r.completed ? '미이수 처리' : '이수 처리'}</button><button className="btn btn-ghost" onClick={() => removeSuper(r.id)}>삭제</button></td>}
                    </tr>
                  ))}
                  {sp.length === 0 && <tr><td colSpan={4}><div className="tstate">관리감독자 교육 기록이 없습니다.</div></td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>

        {subtab === 'people' && focusRec && (
          <div className="edw-bottom">
            <div>
              <h5>{displayName(focusRec)}의 교육 현황</h5>
              <div className="meta">{focusRec.job || '업무 미기재'} · {COURSE_LABEL} {STATUS_LABEL[statusOf(focusRec)]}{focusRec.note ? ` · ${focusRec.note}` : ''}</div>
              {focusRec.memo && <div className="meta" style={{ marginTop: 6 }}>메모: {focusRec.memo}</div>}
              <button className="link" onClick={() => openCell(focusRec, 'memo')}>메모 쓰기 →</button>
            </div>
            <div>
              <h5>이어서 수강할 교육</h5>
              <div className="meta">{COURSE_LABEL}</div>
              <span className="edw-bar" style={{ width: '100%', marginTop: 8 }}><span className="trk"><span className={'fil' + (focusRec.completed ? ' done' : '')} style={{ width: `${pct(focusRec.progress)}%` }} /></span><span className="pct">{pct(focusRec.progress)}%</span></span>
              <div className="meta" style={{ marginTop: 4 }}>{focusRec.completed ? '수료 완료' : focusRec.progress >= 1 ? '진도 완료 · 수료 처리 대기' : '진행 중'}</div>
            </div>
            <div>
              <div className="warnh"><AlertCircle size={15} /> 남은 교육 안내<div className="sp" />{!focusRec.completed && <button className="edw-btn" style={{ height: 32, margin: 0, width: 'auto' }} onClick={() => void notify([focusRec.id])}><Send size={13} /> 교육 안내 보내기</button>}</div>
              <div className="meta" style={{ marginTop: 6 }}>{focusRec.completed ? '남은 교육이 없습니다.' : `${COURSE_LABEL} · ${STATUS_LABEL[statusOf(focusRec)]} · 마감 ${COURSE_DUE}`}</div>
              <div className="meta" style={{ marginTop: 4, fontSize: 11.5 }}>안내를 누르면 메모에 기록되고 안내 문구가 클립보드에 복사됩니다.</div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ════════ 패널: 명단 인입·관리(본사) ════════
  function panelAdmin() {
    return (
      <>
        <div className="edw-head"><div><h3>명단 인입·관리</h3><div className="sub">CMS 진도 CSV 일괄 인입(전 학교, 학교명 매칭). 하반기 수강생명단은 운영 스크립트(import_trainee_roster)로 반영됩니다.</div></div></div>
        <div className="edw-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="edw-btn fill" htmlFor="edu-import-csv" style={{ cursor: 'pointer' }}><Upload size={15} /> {importBusy ? '인입 중…' : 'CMS 진도 CSV 일괄 인입'}</label>
            <input id="edu-import-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { void importCsv(e.target.files); e.target.value = '' }} />
            <span className="muted" style={{ fontSize: 12.5 }}>형식: 학교명,성명,직무,진도(0~100),수료(y/n) — 같은 학교·성명이면 진도만 갱신(메모 보존)</span>
          </div>
          {importMsg && <div className="tstate" style={{ color: importMsg.ok ? 'var(--ink-2)' : 'var(--red-ink)', textAlign: 'left', paddingLeft: 0 }}>{importMsg.ok ? '✓ ' : '✕ '}{importMsg.text}</div>}
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.8, marginTop: 12 }}>
            · 열람 범위: <b>admin</b>(관리자) 계정만 전체 수강생. 그 외 계정은 명단의 '담당자' 열이 본인 이름인 수강생(담당자 빈 행은 학교 담당 조사원 기준)만 보입니다.<br />
            · 현재 범위: {ov ? (ov.scope === 'all' ? '전체' : `내 담당(${ov.names.join(', ')})`) : '…'} · 학교 {ov?.schools.length ?? 0}곳 · 수강생 {kpi.total}명
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>교육 관리</b>{activeSid && <> / {schoolName(activeSid)}</>}</div>
      <div className="bar">
        <h2><GraduationCap size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />안전·보건 교육</h2>
        <div className="sp" />
        <span className="muted" style={{ fontSize: 12 }}>학교를 열면 위에 탭으로 쌓이고 × 로 닫습니다 · 열어 둔 탭은 다음 접속 때 복원</span>
      </div>

      <div className="edw">
        <aside className="edw-side">
          <div className="edw-side-h"><GraduationCap size={16} /> 교육센터</div>
          <div className="edw-group-t">교육 관리</div>
          <button className={'edw-item' + (active === 'overview' ? ' active' : '')} onClick={() => openTab('overview')}><ListChecks size={15} /> 교육 이수 현황<span className="n">{ov?.schools.length ?? ''}</span></button>
          <button className={'edw-item' + (activeSid ? ' active' : '')} onClick={() => { if (sel) openTab(`school:${sel.school_id}`); else if (recentSchools[0]) openTab(`school:${recentSchools[0]}`) }}><Users size={15} /> 근무자별 진도</button>
          {isHq && <button className={'edw-item' + (active === 'admin' ? ' active' : '')} onClick={() => openTab('admin')}><Upload size={15} /> 명단 인입·관리</button>}
          {recentSchools.length > 0 && (
            <>
              <div className="edw-group-t">열어 둔 학교</div>
              <div className="edw-side-recent">
                {recentSchools.map((id) => <button key={id} onClick={() => openTab(`school:${id}`)} style={activeSid === id ? { color: 'var(--edw-blue)', fontWeight: 800 } : undefined}><ChevronRight size={12} /> {schoolName(id)}</button>)}
              </div>
            </>
          )}
          {ov && (
            <div className="edw-scope">{ov.scope === 'all' ? <><b>관리자</b> · 전체 수강생 열람</> : <>내 담당 수강생만 표시<br /><b>{ov.names.join(', ') || me?.name || ''}</b></>}</div>
          )}
        </aside>

        <div className="edw-main">
          <div className="edw-tabs">
            {ws.tabs.map((t) => (
              <button key={t} type="button" className={'edw-tab' + (active === t ? ' active' : '')} onClick={() => setWs((w) => ({ ...w, active: t }))} title={tabLabel(t)}>
                <span className="lbl">{tabLabel(t)}</span>
                {t !== 'overview' && <span role="button" className="x" title="탭 닫기" onClick={(e) => { e.stopPropagation(); closeTab(t) }}><X size={12} /></span>}
              </button>
            ))}
          </div>
          <div className="edw-body">
            {active === 'overview' && panelOverview()}
            {active === 'admin' && (isHq ? panelAdmin() : panelOverview())}
            {activeSid && panelSchool(activeSid)}
          </div>
        </div>
      </div>

      {/* 회차 등록 모달 */}
      {sOpen && (
        <Modal title={`교육 회차 등록 · ${schoolName(activeSid)}`} onClose={() => { if (!sBusy) setSOpen(false) }}
          footer={<><button className="btn btn-ghost" disabled={sBusy} onClick={() => setSOpen(false)}>취소</button><button className="btn btn-primary" disabled={sBusy} onClick={() => void addSession()}>{sBusy ? '저장 중…' : '저장'}</button></>}>
          {sErr && <div className="login-err" style={{ marginBottom: 12 }}>{sErr}</div>}
          <div className="formrow">
            <label className="field"><span>교육일 *</span><input className="input" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} /></label>
            <label className="field"><span>구분</span><select className="select" value={sKind} onChange={(e) => setSKind(e.target.value)}>{SESSION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <label className="field"><span>재해형태</span><select className="select" value={sAcc} onChange={(e) => setSAcc(e.target.value)}>{ACCIDENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
            <label className="field"><span>교육 실시 인원 *</span><input className="input" type="number" value={sHead} onChange={(e) => setSHead(e.target.value)} placeholder="0" /></label>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <label className="field" style={{ flex: 2 }}><span>교육 주제</span><input className="input" value={sTopic} onChange={(e) => setSTopic(e.target.value)} placeholder="예: 급식실 화상·미끄러짐 예방 교육" /></label>
            <label className="field"><span>대상 인원</span><input className="input" type="number" value={sTarget} onChange={(e) => setSTarget(e.target.value)} placeholder="0" /></label>
          </div>
          <label className="field" style={{ marginTop: 12, display: 'block' }}><span>특이사항</span><input className="input" value={sNote} onChange={(e) => setSNote(e.target.value)} placeholder="결석자·보충교육 등" /></label>
        </Modal>
      )}

      {/* 진도 일괄 입력 모달 */}
      {bulkOpen && (
        <Modal title={`교육 진도 일괄 입력 · ${schoolName(activeSid)}`} onClose={() => { if (!bulkBusy) setBulkOpen(false) }}
          footer={<><button className="btn btn-ghost" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>취소</button><button className="btn btn-primary" disabled={bulkBusy} onClick={() => void ingestBulk()}>{bulkBusy ? '입력 중…' : '입력'}</button></>}>
          {bulkErr && <div className="login-err">{bulkErr}</div>}
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>한 줄에 한 명 — 성명,진도(0~100),수료(y/n). 같은 성명이면 진도만 갱신(메모 보존).</div>
          <textarea className="input" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'홍길동,80,n\n김철수,100,y'} />
        </Modal>
      )}
    </div>
  )
}
