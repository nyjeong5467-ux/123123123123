// 세금계산서 관리 — 이카운트 없이 독립 운영(경리박사 스타일).
// 담당 직원/수동 상태/품목/공급자정보는 범용 doc store(/ops/docs/billing-extras)에 저장(백엔드 무변경).
// 인보이스 자체는 /invoices(발행·조회·CSV·수정발행). 세액(10%)·합계는 자동 계산.
// 본사(hq_admin·executive) 전용: 경영자 장부(요약·ecount 장부)·국세청 자료 가져오기·이카운트 연동 설정.
//
// 2026-10-21 화면 구조를 이카운트(ERP) 방식으로 재편:
//   좌측 = 기능 카테고리, 상단 = 연 기능이 탭으로 누적(편집기 탭처럼 × 로 닫음, 새로고침 후 복원),
//   입력 화면 = 판매입력형(헤더 필드 그리드 · 필수 미입력 빨간 박스 · 기능 버튼 줄 · 품목 그리드 · 하단 저장(F8) 바).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, BookOpen, Download, FileText, HelpCircle, List, Pencil, Plug, Plus, Printer, RotateCcw,
  Save, Search, Send, Star, Trash2, Upload, Users, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { InfoTip } from '../components/InfoTip'
import '../styles/billingws.css'

type School = { id: string; name: string }
type Account = { name: string; role: string; login_id: string }
type Invoice = {
  id: string; school_id: string; business_reg_no: string
  issue_date: string; amount: number; status: string; ecount_ref: string | null
}
// 품목 행(이카운트 판매입력 그리드) — 공급가액은 수량×단가 또는 직접 입력
type Line = { name: string; spec: string; qty: string; unit: string; amount: string }
type Extra = { staff?: string; pstatus?: string; item?: string; memo?: string; issuer?: string; lines?: Line[] }
type Supplier = {
  name?: string; bizNo?: string; ceo?: string; addr?: string
  bizType?: string; bizItem?: string; tel?: string
}
// 인보이스id -> Extra, '_supplier' -> 기본 공급자, '_supplierPresets' -> 자주 쓰는 발행자 목록
type ExtrasDoc = Record<string, Extra | Supplier | Supplier[]>
type EcountSettings = {
  com_code: string; user_id: string; api_cert_key: string; zone: string
  test_mode: boolean; default_issue_day: number; memo: string
}
type Me = { role: string; modules: string[] }
type NtsRow = Record<string, unknown>

// 수동 상태(이카운트 비의존)
const PSTATUS: Record<string, { label: string; cls: string }> = {
  unissued: { label: '미발행', cls: 'todo' },
  issued: { label: '발행완료', cls: 'ok' },
  paid: { label: '입금완료', cls: 'doing' },
}
const PSTATUS_ORDER = ['unissued', 'issued', 'paid']
const HQ_ROLES = ['hq_admin', 'executive']
// 수정세금계산서 수정사유(이카운트 화면 동일 순서)
const CORRECT_REASONS = ['기재사항착오정정', '계약의 해제', '착오로 인한 이중발급', '환입', '공급가액변동', '내국신용장 사후개설']
// 진행단계(이카운트 전자세금계산서 흐름)
const STAGES = ['첨부전', '전송대기', '전송완료', 'Email발송완료'] as const
const DEFAULT_ECOUNT: EcountSettings = {
  com_code: '', user_id: '', api_cert_key: '', zone: 'KR', test_mode: true, default_issue_day: 25, memo: '',
}
const won = (n: number) => n.toLocaleString('ko-KR')
const vat = (amount: number) => Math.round(amount * 0.1)
const num = (s: string) => { const n = Number(String(s).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0 }
const today = () => new Date().toISOString().slice(0, 10)
const blankLine = (): Line => ({ name: '', spec: '', qty: '', unit: '', amount: '' })
const lineAmount = (l: Line) => (num(l.qty) > 0 && num(l.unit) > 0 ? num(l.qty) * num(l.unit) : num(l.amount))
// 품목 빠른 선택(My품목) 기본값 — 실제 사용한 품목명이 extras 에 쌓이면 함께 보여준다.
const MY_ITEMS = ['안전관리 용역', '안전점검 용역', '위험성평가 용역', '근골격계 유해요인조사', '안전보건교육']

// ── 워크스페이스 탭(이카운트처럼 기능마다 탭이 쌓인다) ──
type TabKey = 'issue' | 'list' | 'bulk' | 'staff' | 'exec' | 'nts' | 'supplier' | 'ecount'
const TAB_DEFS: Record<TabKey, { label: string; hq?: boolean }> = {
  issue: { label: '세금계산서 입력' },
  list: { label: '세금계산서 목록' },
  bulk: { label: 'CSV 일괄 발행' },
  staff: { label: '담당 직원별 집계' },
  exec: { label: '경영자 장부', hq: true },
  nts: { label: '국세청 자료', hq: true },
  supplier: { label: '공급자·발행자' },
  ecount: { label: '이카운트 연동' },
}
const MENU: { title: string; keys: TabKey[] }[] = [
  { title: '세금계산서', keys: ['issue', 'list', 'bulk'] },
  { title: '장부·현황', keys: ['staff', 'exec', 'nts'] },
  { title: '설정', keys: ['supplier', 'ecount'] },
]
const WS_STORE = 'billing.ws.v1'
const DEFAULT_TABS: TabKey[] = ['issue', 'list']

function loadWs(): { tabs: TabKey[]; active: TabKey | null } {
  try {
    const raw = localStorage.getItem(WS_STORE)
    if (raw) {
      const d = JSON.parse(raw) as { tabs?: string[]; active?: string }
      const tabs = (d.tabs || []).filter((k): k is TabKey => k in TAB_DEFS)
      if (tabs.length) return { tabs, active: tabs.includes(d.active as TabKey) ? (d.active as TabKey) : tabs[0] }
    }
  } catch { /* 저장소 미지원 — 기본 탭 */ }
  return { tabs: [...DEFAULT_TABS], active: 'issue' }
}

// 인보이스 상태(draft|issued|failed) + 수동 상태(unissued|issued|paid) → 진행단계 인덱스.
function stageOf(status: string, pstatus: string): { idx: number; error: boolean } {
  if (status === 'failed') return { idx: -1, error: true }        // 전송오류
  if (pstatus === 'paid') return { idx: 3, error: false }          // Email발송완료(입금까지 완료)
  if (status === 'issued' || pstatus === 'issued') return { idx: 2, error: false }  // 전송완료
  if (status === 'draft') return { idx: 1, error: false }          // 전송대기
  return { idx: 0, error: false }                                  // 첨부전(미발행)
}

// 진행단계 pill 스테퍼(경과=ok, 현재=doing, 이후=todo, 오류=late).
function Stepper({ status, pstatus, corrected }: { status: string; pstatus: string; corrected?: boolean }) {
  const st = stageOf(status, pstatus)
  if (st.error) return <span className="pillx late">전송오류</span>
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
      {STAGES.map((s, i) => (
        <span key={s} className={'pillx ' + (i < st.idx ? 'ok' : i === st.idx ? 'doing' : 'todo')}
          style={{ fontSize: 10, padding: '3px 7px' }}>{s}</span>
      ))}
      {corrected && <span className="pillx warn" style={{ fontSize: 10, padding: '3px 7px' }}>수정발행</span>}
    </div>
  )
}

type Row = Invoice & { schoolName: string; ex: Extra; tax: number; total: number; ym: string }

function parseBulkCsv(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [school = '', bizNo = '', amount = '', date = ''] = l.split(',')
    return { school: school.trim(), bizNo: bizNo.trim(), amount: Number(amount.trim()), date: date.trim() }
  }).filter((r) => r.school && !/^(학교|school)/i.test(r.school) && !Number.isNaN(r.amount))
}

export function Billing({ embedded = false }: { embedded?: boolean } = {}) {
  // ── 워크스페이스(좌측 카테고리 · 상단 누적 탭) ──
  const [ws, setWs] = useState(loadWs)
  const [addOpen, setAddOpen] = useState(false)
  const active = ws.active
  const openTab = useCallback((k: TabKey) => {
    setWs((w) => ({ tabs: w.tabs.includes(k) ? w.tabs : [...w.tabs, k], active: k }))
    setAddOpen(false)
  }, [])
  function closeTab(k: TabKey) {
    setWs((w) => {
      const tabs = w.tabs.filter((t) => t !== k)
      if (w.active !== k) return { tabs, active: w.active }
      const i = w.tabs.indexOf(k)
      return { tabs, active: tabs[Math.max(0, i - 1)] ?? null }
    })
  }
  useEffect(() => {
    try { localStorage.setItem(WS_STORE, JSON.stringify(ws)) } catch { /* 무시 */ }
  }, [ws])

  const [schools, setSchools] = useState<School[]>([])
  const [staffNames, setStaffNames] = useState<string[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [extras, setExtras] = useState<ExtrasDoc>({})
  const [loading, setLoading] = useState(false)
  const [listErr, setListErr] = useState('')
  const [reload, setReload] = useState(0)
  const [saveMsg, setSaveMsg] = useState('')
  const [me, setMe] = useState<Me | null>(null)

  // ── 발행 입력(판매입력형) ──
  const [issueDate, setIssueDate] = useState(today())
  const [sid, setSid] = useState('')
  const [schoolQ, setSchoolQ] = useState('')          // 거래처(학교) 검색어
  const [schoolOpen, setSchoolOpen] = useState(false)
  const [schoolHl, setSchoolHl] = useState(0)
  const [bizNo, setBizNo] = useState('')
  const [fStaffIn, setFStaffIn] = useState('')        // 담당자(발행 담당 직원)
  const [issuerIn, setIssuerIn] = useState('')        // 부서/발행자 프리셋('' = 기본 공급자)
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine(), blankLine()])
  const [curLine, setCurLine] = useState(0)
  const [tried, setTried] = useState(false)           // 저장 시도 후 필수 미입력 강조
  const [submitting, setSubmitting] = useState(false)
  const [issueMsg, setIssueMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [myItemsOpen, setMyItemsOpen] = useState(false)
  const schoolRef = useRef<HTMLInputElement>(null)

  // 필터(목록)
  const [fStaff, setFStaff] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [search, setSearch] = useState('')

  // 이카운트 설정 + 공급자(발행자)
  const [settings, setSettings] = useState<EcountSettings | null>(null)
  const [supplier, setSupplier] = useState<Supplier>({})   // 기본 발행자(공급자)
  const [presets, setPresets] = useState<Supplier[]>([])    // 자주 쓰는 발행자 프리셋
  const [setBusy, setSetBusy] = useState(false)
  const [setMsg, setSetMsg] = useState('')
  const [pvIssuer, setPvIssuer] = useState('')             // 미리보기/인쇄 시 선택된 발행자(프리셋 상호, ''=기본)

  // 이카운트 연동 설정 편집(본사 전용)
  const [ecSaveBusy, setEcSaveBusy] = useState(false)
  const [ecSaveMsg, setEcSaveMsg] = useState('')
  const [ecTestBusy, setEcTestBusy] = useState(false)
  const [ecTestMsg, setEcTestMsg] = useState('')

  // 수정세금계산서 발행
  const [correctRow, setCorrectRow] = useState<Row | null>(null)
  const [correctReason, setCorrectReason] = useState(CORRECT_REASONS[0])
  const [correctBusy, setCorrectBusy] = useState(false)
  const [correctErr, setCorrectErr] = useState('')

  // 국세청 자료 가져오기(본사 전용)
  const [ntsFrom, setNtsFrom] = useState('')
  const [ntsTo, setNtsTo] = useState('')
  const [ntsKind, setNtsKind] = useState<'sale' | 'purchase'>('sale')
  const [ntsBusy, setNtsBusy] = useState(false)
  const [ntsErr, setNtsErr] = useState('')
  const [ntsRows, setNtsRows] = useState<NtsRow[] | null>(null)

  const csvRef = useRef<HTMLInputElement>(null)
  const [bulkLog, setBulkLog] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [preview, setPreview] = useState<Row | null>(null)

  const isHq = !!me && HQ_ROLES.includes(me.role)

  const schoolName = useMemo(() => {
    const m = new Map(schools.map((s) => [s.id, s.name]))
    return (id: string) => m.get(id) || id.slice(0, 8)
  }, [schools])

  useEffect(() => {
    let alive = true
    api<School[]>('/schools').then((d) => { if (alive) setSchools(d) }).catch(() => {})
    api<Account[]>('/users').then((d) => { if (alive) setStaffNames(d.filter((u) => u.name).map((u) => u.name)) }).catch(() => {})
    // 역할 조회 — 실패 시 비본사로 간주(경영자 장부·연동설정·국세청 숨김)
    api<Me>('/auth/me').then((d) => { if (alive) setMe({ role: d.role, modules: Array.isArray(d.modules) ? d.modules : [] }) }).catch(() => { if (alive) setMe(null) })
    api<{ settings: EcountSettings }>('/billing/settings').then((d) => { if (alive) setSettings(d.settings) }).catch(() => { if (alive) setSettings(null) })
    api<{ doc: ExtrasDoc | null }>('/ops/docs/billing-extras').then((d) => {
      if (alive) {
        const doc = d.doc || {}
        setExtras(doc)
        setSupplier((doc._supplier as Supplier) || {})
        setPresets((doc._supplierPresets as Supplier[]) || [])
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true); setListErr('')
    api<Invoice[]>('/invoices').then((d) => { if (alive) { setInvoices(d); setLoading(false) } })
      .catch((e) => { if (alive) { setListErr(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [reload])

  // 인보이스 + extras 병합
  const rows: Row[] = useMemo(() => invoices.map((iv) => {
    const ex = (extras[iv.id] as Extra) || {}
    return { ...iv, schoolName: schoolName(iv.school_id), ex, tax: vat(iv.amount), total: iv.amount + vat(iv.amount), ym: (iv.issue_date || '').slice(0, 7) }
  }), [invoices, extras, schoolName])

  const months = useMemo(() => Array.from(new Set(rows.map((r) => r.ym).filter(Boolean))).sort().reverse(), [rows])

  const view = useMemo(() => rows.filter((r) => {
    const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
    if (fStaff && (r.ex.staff || '') !== fStaff) return false
    if (fStatus && ps !== fStatus) return false
    if (fMonth && r.ym !== fMonth) return false
    const q = search.trim().toLowerCase()
    if (q && !(`${r.schoolName} ${r.business_reg_no} ${r.ex.item || ''}`.toLowerCase().includes(q))) return false
    return true
  }).sort((a, b) => b.issue_date.localeCompare(a.issue_date)), [rows, fStaff, fStatus, fMonth, search])

  const kpi = useMemo(() => {
    const supply = view.reduce((s, r) => s + r.amount, 0)
    const tax = view.reduce((s, r) => s + r.tax, 0)
    return { count: view.length, supply, tax, total: supply + tax }
  }, [view])

  // 진행단계별 집계(전체/전송완료/전송대기/전송오류) — 현재 목록 기준
  const stageKpi = useMemo(() => {
    let done = 0, wait = 0, err = 0
    for (const r of view) {
      const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
      const st = stageOf(r.status, ps)
      if (st.error) err++
      else if (st.idx >= 2) done++
      else wait++
    }
    return { total: view.length, done, wait, err }
  }, [view])

  // 담당 직원별 집계
  const byStaff = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const r of view) {
      const k = r.ex.staff || '(미지정)'
      const cur = m.get(k) || { count: 0, total: 0 }
      cur.count++; cur.total += r.total; m.set(k, cur)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [view])

  // 경영자 요약(우리 데이터) — 전체 인보이스 기준(목록 필터 무시)
  const execSummary = useMemo(() => {
    const supply = rows.reduce((s, r) => s + r.amount, 0)
    const tax = rows.reduce((s, r) => s + r.tax, 0)
    const byMonth = new Map<string, { supply: number; tax: number; count: number }>()
    const byStatus = { issued: 0, unissued: 0, paid: 0 }
    for (const r of rows) {
      const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
      if (ps === 'paid') byStatus.paid++
      else if (ps === 'issued') byStatus.issued++
      else byStatus.unissued++
      const m = byMonth.get(r.ym) || { supply: 0, tax: 0, count: 0 }
      m.supply += r.amount; m.tax += r.tax; m.count++
      byMonth.set(r.ym, m)
    }
    const monthly = Array.from(byMonth.entries()).filter(([k]) => k).sort((a, b) => b[0].localeCompare(a[0]))
    return { supply, tax, total: supply + tax, monthly, byStatus, count: rows.length }
  }, [rows])

  // My품목 — 기본 품목 + 실제 발행에 쓴 품목명(최근 순)
  const myItems = useMemo(() => {
    const used = rows.map((r) => r.ex.item || '').filter(Boolean)
    return Array.from(new Set([...used, ...MY_ITEMS])).slice(0, 12)
  }, [rows])

  async function saveExtras(next: ExtrasDoc) {
    setExtras(next)
    try {
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setSaveMsg('저장됨'); setTimeout(() => setSaveMsg(''), 1500)
    } catch (e) { setSaveMsg(e instanceof Error ? e.message : '저장 실패') }
  }
  function patchExtra(id: string, patch: Partial<Extra>) {
    const next: ExtrasDoc = { ...extras, [id]: { ...((extras[id] as Extra) || {}), ...patch } }
    void saveExtras(next)
  }

  // ── 거래처(학교) 검색 콤보 ──
  const schoolMatches = useMemo(() => {
    const q = schoolQ.trim().toLowerCase()
    if (!q) return schools.slice(0, 8)
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [schools, schoolQ])
  function pickSchool(s: School) {
    setSid(s.id); setSchoolQ(s.name); setSchoolOpen(false)
    // 최근 발행분의 사업자번호 자동 채움
    const last = invoices.filter((v) => v.school_id === s.id).sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0]
    if (last) setBizNo(last.business_reg_no)
  }

  // ── 품목 그리드 ──
  const supply = useMemo(() => lines.reduce((s, l) => s + lineAmount(l), 0), [lines])
  const itemNames = lines.map((l) => l.name.trim()).filter(Boolean)
  function patchLine(i: number, p: Partial<Line>) {
    setLines((ls) => {
      const next = ls.map((l, k) => (k === i ? { ...l, ...p } : l))
      // 마지막 행에 입력이 생기면 빈 행 하나 추가(이카운트처럼 계속 이어 쓰기)
      const last = next[next.length - 1]
      if (last && (last.name || last.qty || last.unit || last.amount)) next.push(blankLine())
      return next
    })
  }
  function removeLine(i: number) {
    setLines((ls) => { const n = ls.filter((_, k) => k !== i); return n.length ? n : [blankLine()] })
  }
  function useMyItem(name: string) {
    setLines((ls) => {
      const i = ls.findIndex((l) => !l.name.trim())
      if (i < 0) return [...ls, { ...blankLine(), name }]
      return ls.map((l, k) => (k === i ? { ...l, name } : l))
    })
    setMyItemsOpen(false)
  }
  function resetIssue() {
    setSid(''); setSchoolQ(''); setBizNo(''); setFStaffIn(''); setIssuerIn('')
    setLines([blankLine(), blankLine(), blankLine()]); setIssueDate(today())
    setTried(false); setIssueMsg(null); setCurLine(0)
    setTimeout(() => schoolRef.current?.focus(), 0)
  }
  const missing = {
    school: !sid, biz: !bizNo.trim(), date: !issueDate, amount: supply <= 0,
  }
  const hasMissing = Object.values(missing).some(Boolean)

  async function issue() {
    setTried(true); setIssueMsg(null)
    if (hasMissing) {
      setIssueMsg({ ok: false, text: '필수입력항목이 비어 있습니다 — 빨간 박스를 확인하세요.' })
      if (missing.school) schoolRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const inv = await api<Invoice>('/invoices', {
        method: 'POST',
        body: JSON.stringify({ school_id: sid, business_reg_no: bizNo.trim(), amount: supply, issue_date: issueDate }),
      })
      // 담당자·발행자·품목(그리드)은 부가 정보(extras)에 보관
      const usedLines = lines.filter((l) => l.name.trim() || lineAmount(l) > 0)
      const next: ExtrasDoc = {
        ...extras,
        [inv.id]: {
          ...((extras[inv.id] as Extra) || {}),
          staff: fStaffIn || undefined, issuer: issuerIn || undefined,
          item: itemNames.join(', ') || undefined, lines: usedLines,
        },
      }
      await saveExtras(next)
      setIssueMsg({ ok: true, text: `저장 완료 — ${schoolName(sid)} · 공급가액 ${won(supply)}원 · 세액 ${won(vat(supply))}원 · 합계 ${won(supply + vat(supply))}원` })
      setLines([blankLine(), blankLine(), blankLine()]); setTried(false)
      setReload((n) => n + 1)
    } catch (e) { setIssueMsg({ ok: false, text: e instanceof Error ? e.message : '발행 실패' }) }
    finally { setSubmitting(false) }
  }

  // 단축키(이카운트: F8 저장 · F3 찾기) — 입력 탭이 활성일 때만
  useEffect(() => {
    if (active !== 'issue') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F8') { e.preventDefault(); void issue() }
      if (e.key === 'F3') { e.preventDefault(); schoolRef.current?.focus(); setSchoolOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function bulkIssue(files: FileList | null) {
    const f = files?.[0]; if (!f) return
    setBulkBusy(true); setBulkLog([])
    try {
      const csv = parseBulkCsv(await f.text())
      if (!csv.length) { setBulkLog(['CSV 행 없음. 형식: 학교명,사업자번호,공급가액,발행일(YYYY-MM-DD)']); return }
      const byName = new Map(schools.map((s) => [s.name, s.id]))
      const log: string[] = []
      for (const r of csv) {
        const schoolId = byName.get(r.school)
        if (!schoolId) { log.push(`✕ ${r.school} — 미등록 학교`); continue }
        try {
          await api('/invoices', { method: 'POST', body: JSON.stringify({ school_id: schoolId, business_reg_no: r.bizNo, amount: r.amount, issue_date: r.date }) })
          log.push(`✓ ${r.school} · 공급가액 ${won(r.amount)}원 (세액 ${won(vat(r.amount))}, 합계 ${won(r.amount + vat(r.amount))})`)
        } catch (e) { log.push(`✕ ${r.school} — ${e instanceof Error ? e.message : '실패'}`) }
      }
      setBulkLog(log); setReload((n) => n + 1)
    } finally { setBulkBusy(false) }
  }

  // 수정세금계산서 발행 — 수정사유 선택 후 POST /invoices/{id}/correct
  async function submitCorrection() {
    if (!correctRow) return
    setCorrectBusy(true); setCorrectErr('')
    try {
      await api(`/invoices/${correctRow.id}/correct`, { method: 'POST', body: JSON.stringify({ reason: correctReason }) })
      setCorrectRow(null); setReload((n) => n + 1)
    } catch (e) { setCorrectErr(e instanceof Error ? e.message : '수정발행 실패') }
    finally { setCorrectBusy(false) }
  }

  async function delInvoice(r: Row) {
    if (!window.confirm(`세금계산서를 삭제할까요?\n${r.schoolName} · ${won(r.amount)}원 · ${r.issue_date}`)) return
    try {
      await api(`/invoices/${r.id}`, { method: 'DELETE' })
      setReload((n) => n + 1)
    } catch (e) { window.alert(e instanceof Error ? e.message : '삭제 실패') }
  }

  // 국세청 신고 자료 가져오기 — 실연동 미설정(test_mode)이면 400 detail을 그대로 안내
  async function importNts() {
    if (!ntsFrom || !ntsTo) { setNtsErr('기간(시작일·종료일)을 선택하세요.'); return }
    setNtsBusy(true); setNtsErr(''); setNtsRows(null)
    try {
      const d = await api<{ count: number; rows: NtsRow[] }>('/billing/nts-import', {
        method: 'POST', body: JSON.stringify({ from_date: ntsFrom, to_date: ntsTo, kind: ntsKind }),
      })
      setNtsRows(Array.isArray(d.rows) ? d.rows : [])
    } catch (e) { setNtsErr(e instanceof Error ? e.message : '국세청 자료 가져오기 실패') }
    finally { setNtsBusy(false) }
  }

  async function saveSupplier() {
    setSetBusy(true); setSetMsg('')
    try {
      const next = { ...extras, _supplier: supplier }
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setExtras(next); setSetMsg('기본 발행자(공급자) 정보를 저장했습니다.')
    } catch (e) { setSetMsg(e instanceof Error ? e.message : '저장 실패') }
    finally { setSetBusy(false) }
  }

  // 자주 쓰는 발행자(프리셋) 저장/적용
  async function savePresets(next: Supplier[]) {
    setPresets(next)
    try {
      const doc = { ...extras, _supplierPresets: next }
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc }) })
      setExtras(doc); setSetMsg('발행자 프리셋을 저장했습니다.'); setTimeout(() => setSetMsg(''), 1500)
    } catch (e) { setSetMsg(e instanceof Error ? e.message : '저장 실패') }
  }
  function addPreset() {
    const name = (supplier.name || '').trim()
    if (!name) { setSetMsg('상호를 입력한 뒤 프리셋으로 추가하세요.'); return }
    const others = presets.filter((p) => (p.name || '') !== name)
    void savePresets([...others, { ...supplier }])
  }
  function removePreset(name: string) { void savePresets(presets.filter((p) => (p.name || '') !== name)) }
  // 발행자 이름(상호) → Supplier. 빈값이면 기본 공급자.
  const resolveIssuer = (name?: string): Supplier =>
    (name ? (presets.find((p) => (p.name || '') === name) || supplier) : supplier)

  // 이카운트 연동 설정 편집(본사 전용)
  function patchSetting(patch: Partial<EcountSettings>) {
    setSettings((s) => ({ ...(s ?? DEFAULT_ECOUNT), ...patch }))
  }
  async function saveEcount() {
    if (!settings) return
    setEcSaveBusy(true); setEcSaveMsg('')
    try {
      const d = await api<{ settings: EcountSettings }>('/billing/settings', { method: 'PUT', body: JSON.stringify({ settings }) })
      setSettings(d.settings); setEcSaveMsg('연동 설정을 저장했습니다.'); setTimeout(() => setEcSaveMsg(''), 2000)
    } catch (e) { setEcSaveMsg(e instanceof Error ? e.message : '저장 실패') }
    finally { setEcSaveBusy(false) }
  }
  async function testEcount() {
    setEcTestBusy(true); setEcTestMsg('')
    try {
      const d = await api<{ ok: boolean; message: string }>('/billing/settings/test', { method: 'POST' })
      setEcTestMsg((d.ok ? '✓ ' : '✕ ') + d.message)
    } catch (e) { setEcTestMsg(e instanceof Error ? e.message : '테스트 실패') }
    finally { setEcTestBusy(false) }
  }

  function printInvoice(r: Row, iss: Supplier) {
    const sup = iss || {}
    const lineRows = (r.ex.lines && r.ex.lines.length
      ? r.ex.lines.map((l) => `<tr><td>${l.name || ''}</td><td class="c">${l.spec || ''}</td><td class="r">${l.qty || ''}</td><td class="r">${l.unit ? won(num(l.unit)) : ''}</td><td class="r">${won(lineAmount(l))}</td></tr>`).join('')
      : `<tr><td>${r.ex.item || '안전관리 용역'}</td><td class="c"></td><td class="r"></td><td class="r"></td><td class="r">${won(r.amount)}</td></tr>`)
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>세금계산서 ${r.schoolName}</title>
<style>
 body{font-family:'Malgun Gothic',sans-serif;padding:24px;color:#111}
 h1{text-align:center;font-size:22px;letter-spacing:8px;margin:0 0 6px;border:3px solid #c0392b;color:#c0392b;padding:8px}
 .sub{text-align:center;color:#888;font-size:12px;margin-bottom:14px}
 table{border-collapse:collapse;width:100%;font-size:12.5px;margin-bottom:10px}
 td,th{border:1px solid #333;padding:6px 8px;vertical-align:middle}
 th{background:#eaf0fb}
 .lbl{background:#eaf0fb;font-weight:700;text-align:center;width:60px}
 .r{text-align:right}.c{text-align:center}
 .party{width:50%}
 .amt{font-size:15px;font-weight:800;text-align:right}
</style></head><body>
<h1>세 금 계 산 서</h1><div class="sub">(공급받는자 보관용)</div>
<table>
 <tr>
  <td class="lbl">공급자</td>
  <td class="party">
   등록번호 : <b>${sup.bizNo || ''}</b><br>상호 : <b>${sup.name || '한국산업안전협회'}</b> &nbsp; 성명 : ${sup.ceo || ''}<br>
   사업장 : ${sup.addr || ''}<br>업태 : ${sup.bizType || ''} &nbsp; 종목 : ${sup.bizItem || ''} &nbsp; 연락처 : ${sup.tel || ''}
  </td>
  <td class="lbl">공급받는자</td>
  <td class="party">
   등록번호 : <b>${r.business_reg_no || ''}</b><br>상호 : <b>${r.schoolName}</b><br>담당 직원 : ${r.ex.staff || '-'}
  </td>
 </tr>
 <tr><td class="lbl">작성일자</td><td class="c" colspan="3">${r.issue_date}</td></tr>
</table>
<table>
 <tr><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th></tr>
 ${lineRows}
</table>
<table>
 <tr>
  <td class="lbl">공급가액</td><td class="r">${won(r.amount)} 원</td>
  <td class="lbl">세액</td><td class="r">${won(r.tax)} 원</td>
 </tr>
 <tr><td class="lbl">합계금액</td><td class="amt" colspan="3">${won(r.total)} 원</td></tr>
</table>
<p style="margin-top:10px;font-size:11px;color:#888">상태: ${(PSTATUS[r.ex.pstatus || (r.status==='issued'?'issued':'unissued')]||{}).label} · 발행 시스템: 학교안전 플랫폼</p>
</body></html>`
    const w = window.open('', '_blank', 'width=780,height=680')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 300)
  }

  const configured = !!settings?.com_code && !!settings?.api_cert_key
  const ecountConnected = !!settings?.com_code && !settings?.test_mode   // 실연동(장부 조회 가능) 여부
  const tabVisible = (k: TabKey) => !TAB_DEFS[k].hq || isHq
  const visibleTabs = ws.tabs.filter(tabVisible)

  // ── 패널: 세금계산서 입력(판매입력형) ──
  function panelIssue() {
    const [y, m, d] = issueDate ? issueDate.split('-') : ['', '', '']
    function setDatePart(part: 'y' | 'm' | 'd', v: string) {
      const yy = part === 'y' ? v : y, mm = part === 'm' ? v : m, dd = part === 'd' ? v : d
      if (yy.length === 4 && mm && dd) setIssueDate(`${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`)
    }
    return (
      <>
        <div className="bws-head">
          <span className="star" title="즐겨찾기"><Star size={16} /></span>
          <InfoTip><b>이카운트 판매입력과 같은 흐름</b>: 일자·거래처(학교)·사업자번호·품목(공급가액)을 넣고 <b>저장(F8)</b>. 필수 항목이 비면 빨간 박스로 표시됩니다. F3 = 거래처 찾기.</InfoTip>
          <h3>세금계산서 입력</h3>
          <div className="sp" />
          <span className="pillx doing opt">부가세 10% 자동</span>
          <button className="btn btn-ghost opt" style={{ height: 30 }} onClick={() => openTab('supplier')}>Option</button>
        </div>

        <div className="bws-form">
          <label>일자</label>
          <div className="fld">
            <div className={'req date' + (tried && missing.date ? ' miss' : '')}>
              <input className="input y" value={y} maxLength={4} onChange={(e) => setDatePart('y', e.target.value.replace(/\D/g, ''))} placeholder="YYYY" />
              <span className="sep">/</span>
              <input className="input" value={m} maxLength={2} onChange={(e) => setDatePart('m', e.target.value.replace(/\D/g, ''))} placeholder="MM" />
              <span className="sep">/</span>
              <input className="input" value={d} maxLength={2} onChange={(e) => setDatePart('d', e.target.value.replace(/\D/g, ''))} placeholder="DD" />
              <input type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} title="달력" />
            </div>
          </div>
          <label>거래처</label>
          <div className="fld">
            <div className={'req' + (tried && missing.school ? ' miss' : '')} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <div className="bws-combo">
                <input
                  ref={schoolRef} className="input" placeholder="거래처(학교) 검색" value={schoolQ}
                  onChange={(e) => { setSchoolQ(e.target.value); setSid(''); setSchoolOpen(true); setSchoolHl(0) }}
                  onFocus={() => setSchoolOpen(true)}
                  onBlur={() => setTimeout(() => setSchoolOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (!schoolOpen) return
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSchoolHl((h) => Math.min(h + 1, schoolMatches.length - 1)) }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setSchoolHl((h) => Math.max(h - 1, 0)) }
                    if (e.key === 'Enter' && schoolMatches[schoolHl]) { e.preventDefault(); pickSchool(schoolMatches[schoolHl]) }
                    if (e.key === 'Escape') setSchoolOpen(false)
                  }}
                />
                <Search size={15} className="ico" />
                {schoolOpen && schoolMatches.length > 0 && (
                  <div className="bws-combo-list">
                    {schoolMatches.map((s, i) => (
                      <button key={s.id} type="button" className={i === schoolHl ? 'hl' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pickSchool(s)}>
                        {s.name}
                        {invoices.some((v) => v.school_id === s.id) && <span className="sub">발행 이력</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="fn">Fn</span>
            </div>
          </div>

          <label>담당자</label>
          <div className="fld">
            <select className="select" value={fStaffIn} onChange={(e) => setFStaffIn(e.target.value)} style={{ flex: 1 }}>
              <option value="">담당자 선택</option>
              {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <label>사업자번호</label>
          <div className="fld">
            <div className={'req' + (tried && missing.biz ? ' miss' : '')} style={{ flex: 1 }}>
              <input className="input" value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="000-00-00000" />
            </div>
          </div>

          <label>발행자</label>
          <div className="fld">
            <select className="select" value={issuerIn} onChange={(e) => setIssuerIn(e.target.value)} style={{ flex: 1 }}>
              <option value="">기본 발행자 — {supplier?.name || '한국산업안전협회'}</option>
              {presets.map((p) => <option key={p.name} value={p.name}>{p.name}{p.bizNo ? ` (${p.bizNo})` : ''}</option>)}
            </select>
          </div>
          <label>거래유형</label>
          <div className="fld">
            <select className="select" value="vat10" onChange={() => { /* 10% 고정 */ }} style={{ flex: 1 }}>
              <option value="vat10">부가세율 적용 (10%)</option>
            </select>
          </div>

          <label>첨부</label>
          <div className="fld wide">
            <button type="button" className="btn btn-ghost" style={{ height: 32 }} onClick={() => openTab('bulk')}><Upload size={14} /> CSV 일괄 발행</button>
            <span className="muted" style={{ fontSize: 12 }}>여러 학교를 한 번에 발행하려면 CSV(학교명,사업자번호,공급가액,발행일)</span>
          </div>
        </div>
        {tried && hasMissing && <div className="bws-reqnote">필수입력항목 미입력 — 빨간색 박스를 채우세요 (거래처 · 사업자번호 · 일자 · 공급가액)</div>}

        <div className="bws-tools">
          <button type="button" className="tb" onClick={() => { schoolRef.current?.focus(); setSchoolOpen(true) }}><Search size={13} /> 찾기 <kbd>(F3)</kbd></button>
          <button type="button" className="tb" onClick={() => setLines((ls) => [...ls].sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1)))}>정렬</button>
          <button type="button" className="tb" disabled={!sid} onClick={() => { setSearch(schoolName(sid)); openTab('list') }}><List size={13} /> 거래내역보기(발행) ▾</button>
          <button type="button" className="tb" onClick={() => setMyItemsOpen((o) => !o)}>My품목 ▾</button>
          {myItemsOpen && (
            <div className="bws-addmenu bws-items-menu" onMouseLeave={() => setMyItemsOpen(false)}>
              <div className="t">품목 빠른 입력</div>
              {myItems.map((n) => <button key={n} type="button" onClick={() => useMyItem(n)}>{n}</button>)}
            </div>
          )}
          <button type="button" className="tb" disabled={!sid} onClick={() => {
            const last = rows.filter((r) => r.school_id === sid)[0]
            if (last?.ex.lines?.length) setLines([...last.ex.lines.map((l) => ({ ...l })), blankLine()])
            else if (last) setLines([{ ...blankLine(), name: last.ex.item || '안전관리 용역', amount: String(last.amount) }, blankLine()])
          }}>이전 발행 불러오기</button>
          <button type="button" className="tb" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus size={13} /> 행 추가</button>
        </div>

        <div className="bws-grid">
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th style={{ width: 30 }}>↓</th>
                <th>품목명</th>
                <th style={{ width: 120 }}>규격</th>
                <th style={{ width: 90 }}>수량</th>
                <th style={{ width: 130 }}>단가</th>
                <th style={{ width: 140 }}>공급가액</th>
                <th style={{ width: 120 }}>부가세</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const a = lineAmount(l)
                const auto = num(l.qty) > 0 && num(l.unit) > 0
                return (
                  <tr key={i} className={i === curLine ? 'cur' : ''} onFocus={() => setCurLine(i)}>
                    <td className="no"><span>{i + 1}</span></td>
                    <td className="no" style={{ color: 'var(--bws-blue)' }}>●</td>
                    <td><input className="input" value={l.name} onChange={(e) => patchLine(i, { name: e.target.value })} placeholder={i === 0 ? '예: 안전관리 용역' : ''} /></td>
                    <td><input className="input" value={l.spec} onChange={(e) => patchLine(i, { spec: e.target.value })} placeholder="1식" /></td>
                    <td><input className="input r" value={l.qty} onChange={(e) => patchLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} /></td>
                    <td><input className="input r" value={l.unit} onChange={(e) => patchLine(i, { unit: e.target.value.replace(/[^\d]/g, '') })} /></td>
                    <td>
                      <input className={'input r' + (tried && missing.amount && i === 0 ? ' miss' : '')}
                        style={tried && missing.amount && i === 0 ? { borderColor: 'var(--bws-req)', background: 'var(--bws-req-soft)' } : undefined}
                        value={auto ? won(a) : l.amount} readOnly={auto} title={auto ? '수량×단가 자동' : '직접 입력'}
                        onChange={(e) => patchLine(i, { amount: e.target.value.replace(/[^\d]/g, '') })} />
                    </td>
                    <td className="r muted">{a ? won(vat(a)) : ''}</td>
                    <td className="no"><button type="button" className="rm" title="행 삭제" onClick={() => removeLine(i)}><X size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} />
                <td className="r">{lines.reduce((s, l) => s + num(l.qty), 0) || ''}</td>
                <td />
                <td className="r">{won(supply)}</td>
                <td className="r">{won(vat(supply))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="bws-sum">
          <span>공급가액 {won(supply)}원</span>
          <span>부가세 {won(vat(supply))}원</span>
          <span>합계 <b>{won(supply + vat(supply))}원</b></span>
        </div>

        <div className="bws-actions">
          <span className="send" title="전송"><Send size={15} /></span>
          <button type="button" className="primary" onClick={() => void issue()} disabled={submitting}><Save size={15} /> {submitting ? '저장 중…' : '저장(F8)'}</button>
          <button type="button" className="ab" onClick={resetIssue}><RotateCcw size={14} /> 다시 작성</button>
          <button type="button" className="ab" onClick={() => openTab('list')}><List size={14} /> 리스트</button>
          <button type="button" className="ab" onClick={() => openTab('bulk')}><Upload size={14} /> 웹자료올리기(CSV)</button>
          {issueMsg && <span className={'msg ' + (issueMsg.ok ? 'ok' : 'err')}>{issueMsg.text}</span>}
        </div>
      </>
    )
  }

  // ── 패널: 세금계산서 목록 ──
  function panelList() {
    return (
      <>
        <div className="kpis">
          <div className="kpi"><div className="l">건수</div><div className="v">{kpi.count}<small> 건</small></div><div className="d">현재 조건</div></div>
          <div className="kpi"><div className="l">공급가액</div><div className="v">{won(kpi.supply)}<small> 원</small></div></div>
          <div className="kpi"><div className="l">세액(10%)</div><div className="v">{won(kpi.tax)}<small> 원</small></div></div>
          <div className="kpi"><div className="l">합계금액</div><div className="v" style={{ color: 'var(--violet)' }}>{won(kpi.total)}<small> 원</small></div></div>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="l">전체</div><div className="v">{stageKpi.total}<small> 건</small></div><div className="d">진행단계 기준</div></div>
          <div className="kpi"><div className="l">전송완료</div><div className="v" style={{ color: 'var(--ok-ink)' }}>{stageKpi.done}<small> 건</small></div></div>
          <div className="kpi"><div className="l">전송대기</div><div className="v" style={{ color: 'var(--violet)' }}>{stageKpi.wait}<small> 건</small></div></div>
          <div className="kpi"><div className="l">전송오류</div><div className="v" style={{ color: 'var(--red-ink)' }}>{stageKpi.err}<small> 건</small></div></div>
        </div>

        <div className="ledger">
          <div className="lh">
            <h2>세금계산서 목록</h2>
            {saveMsg && <span className="pillx ok">{saveMsg}</span>}
            <div className="sp" />
            <div className="lbar" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input className="input" style={{ height: 34, width: 150 }} placeholder="학교·사번·품목" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="lselect" value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">월 전체</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              <select className="lselect" value={fStaff} onChange={(e) => setFStaff(e.target.value)}><option value="">담당 전체</option>{staffNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <select className="lselect" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">상태 전체</option>{PSTATUS_ORDER.map((s) => <option key={s} value={s}>{PSTATUS[s].label}</option>)}</select>
              <button className="btn btn-primary" style={{ height: 34 }} onClick={() => openTab('issue')}><Plus size={14} /> 입력</button>
            </div>
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead><tr>
                <th>작성일자</th><th>공급받는자</th><th>사업자번호</th><th>품목</th>
                <th className="c">공급가액</th><th className="c">세액</th><th className="c">합계</th>
                <th style={{ width: 120 }}>담당 직원</th><th style={{ width: 110 }}>상태</th>
                <th style={{ minWidth: 220 }}>진행단계</th><th style={{ width: 110 }}></th>
              </tr></thead>
              <tbody>
                {!listErr && view.map((r) => {
                  const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
                  const corrected = (r.ecount_ref || '').includes('COR')
                  return (
                    <tr key={r.id}>
                      <td><b>{r.issue_date}</b></td>
                      <td>{r.schoolName}</td>
                      <td>{r.business_reg_no}</td>
                      <td>
                        <input className="input" style={{ height: 30, fontSize: 12, minWidth: 90 }} value={r.ex.item || ''} placeholder="안전관리 용역"
                          onChange={(e) => patchExtra(r.id, { item: e.target.value })} />
                      </td>
                      <td className="c">{won(r.amount)}</td>
                      <td className="c">{won(r.tax)}</td>
                      <td className="c"><b style={{ color: 'var(--violet)' }}>{won(r.total)}</b></td>
                      <td>
                        <select className="select" style={{ height: 30, padding: '2px 6px', fontSize: 12 }} value={r.ex.staff || ''} onChange={(e) => patchExtra(r.id, { staff: e.target.value })}>
                          <option value="">(미지정)</option>
                          {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="select" style={{ height: 30, padding: '2px 6px', fontSize: 12 }} value={ps} onChange={(e) => patchExtra(r.id, { pstatus: e.target.value })}>
                          {PSTATUS_ORDER.map((s) => <option key={s} value={s}>{PSTATUS[s].label}</option>)}
                        </select>
                      </td>
                      <td><Stepper status={r.status} pstatus={ps} corrected={corrected} /></td>
                      <td className="c" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ height: 30, padding: '0 8px' }} onClick={() => { setCorrectRow(r); setCorrectReason(CORRECT_REASONS[0]); setCorrectErr('') }} title="수정세금계산서 발행"><Pencil size={13} /></button>
                        <button className="btn btn-ghost" style={{ height: 30, padding: '0 8px', marginLeft: 4 }} onClick={() => { setPreview(r); setPvIssuer(r.ex.issuer || '') }} title="미리보기/인쇄"><Printer size={13} /></button>
                        <button className="btn btn-ghost" style={{ height: 30, padding: '0 8px', marginLeft: 4, color: '#e5484d' }} onClick={() => void delInvoice(r)} title="세금계산서 삭제"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
                {loading && <tr><td colSpan={11}><div className="tstate">불러오는 중…</div></td></tr>}
                {!loading && listErr && <tr><td colSpan={11}><div className="tstate">오류: {listErr}</div></td></tr>}
                {!loading && !listErr && view.length === 0 && <tr><td colSpan={11}><div className="tstate">{invoices.length === 0 ? '발행된 세금계산서가 없습니다. [세금계산서 입력] 탭에서 발행하세요.' : '조건에 맞는 항목이 없습니다.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  function panelBulk() {
    return (
      <div className="ledger">
        <div className="lh">
          <h2><Upload size={18} /> CSV 일괄 발행<InfoTip>형식: <b>학교명,사업자번호,공급가액,발행일(YYYY-MM-DD)</b> — 헤더 행은 자동 제외. 학교명은 등록 학교명과 정확히 같아야 합니다.</InfoTip></h2>
          <div className="sp" />
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { void bulkIssue(e.target.files); e.target.value = '' }} />
          <button className="btn btn-primary" onClick={() => csvRef.current?.click()} disabled={bulkBusy}><Upload size={14} /> {bulkBusy ? '일괄 발행 중…' : 'CSV 선택 → 발행'}</button>
        </div>
        <div className="card-body" style={{ padding: '18px 24px' }}>
          {bulkLog.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>CSV 파일을 선택하면 한 줄씩 발행하고 결과를 여기에 표시합니다.</div>}
          {bulkLog.length > 0 && <div className="codebox">{bulkLog.map((l, i) => <div key={i}>{l}</div>)}</div>}
        </div>
      </div>
    )
  }

  function panelStaff() {
    return (
      <div className="ledger">
        <div className="lh"><h2><Users size={16} /> 담당 직원별 집계</h2><div className="sp" /><span className="pillx na">현재 목록 조건</span></div>
        <div className="twrap"><table className="tbl">
          <thead><tr><th>담당 직원</th><th className="c">건수</th><th className="c">합계금액</th></tr></thead>
          <tbody>
            {byStaff.map(([n, v]) => (
              <tr key={n} style={{ cursor: 'pointer' }} onClick={() => { setFStaff(n === '(미지정)' ? '' : n); openTab('list') }}>
                <td><b>{n}</b></td><td className="c">{v.count}건</td><td className="c">{won(v.total)}원</td>
              </tr>
            ))}
            {byStaff.length === 0 && <tr><td colSpan={3}><div className="tstate">집계할 세금계산서가 없습니다.</div></td></tr>}
          </tbody>
        </table></div>
      </div>
    )
  }

  function panelExec() {
    return (
      <>
        <div className="kpis">
          <div className="kpi"><div className="l">총 매출(공급가액)</div><div className="v">{won(execSummary.supply)}<small> 원</small></div><div className="d">전체 세금계산서</div></div>
          <div className="kpi"><div className="l">세액 합</div><div className="v">{won(execSummary.tax)}<small> 원</small></div></div>
          <div className="kpi"><div className="l">합계</div><div className="v" style={{ color: 'var(--violet)' }}>{won(execSummary.total)}<small> 원</small></div></div>
          <div className="kpi"><div className="l">발행 건수</div><div className="v">{execSummary.count}<small> 건</small></div></div>
        </div>
        <div className="ledger">
          <div className="lh"><h2><BarChart3 size={18} /> 경영자 요약 — 상태별 건수</h2></div>
          <div className="card-body" style={{ padding: '16px 26px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span className="pillx ok">발행완료 {execSummary.byStatus.issued}건</span>
            <span className="pillx todo">미발행 {execSummary.byStatus.unissued}건</span>
            <span className="pillx doing">입금완료 {execSummary.byStatus.paid}건</span>
          </div>
        </div>
        <div className="ledger">
          <div className="lh"><h2><BarChart3 size={18} /> 월별 매출 집계</h2></div>
          <div className="twrap"><table className="tbl">
            <thead><tr><th>월</th><th className="c">건수</th><th className="c">공급가액</th><th className="c">세액</th><th className="c">합계</th></tr></thead>
            <tbody>
              {execSummary.monthly.map(([m, v]) => (
                <tr key={m}>
                  <td><b>{m}</b></td>
                  <td className="c">{v.count}건</td>
                  <td className="c">{won(v.supply)}</td>
                  <td className="c">{won(v.tax)}</td>
                  <td className="c"><b style={{ color: 'var(--violet)' }}>{won(v.supply + v.tax)}</b></td>
                </tr>
              ))}
              {execSummary.monthly.length === 0 && <tr><td colSpan={5}><div className="tstate">발행 내역이 없습니다.</div></td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="ledger">
          <div className="lh"><h2><BookOpen size={18} /> 경영자 장부 (ecount 장부)
            <InfoTip>
              재무제표·손익계산서·원장·자금일보 등 회계 장부는 <b>ecount(ERP)</b>에서 제공됩니다.
              <b> 이카운트 연동</b> 탭에서 회사코드·인증키를 입력하고 <b>test_mode를 해제</b>하면 조회할 수 있습니다.
            </InfoTip></h2><div className="sp" />
            <span className={'pillx ' + (ecountConnected ? 'ok' : 'todo')}>{ecountConnected ? '연결됨' : '미연결'}</span>
          </div>
          <div className="card-body" style={{ padding: '18px 26px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['재무제표', '손익계산서', '원장', '자금일보'].map((name) => (
                <button key={name} className="btn btn-ghost" disabled={!ecountConnected}
                  title={ecountConnected ? `${name} 조회(ecount)` : 'ecount 실연동 시 이용 가능'}
                  onClick={() => { if (ecountConnected) openTab('ecount') }}>
                  <BookOpen size={14} /> {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  function panelNts() {
    return (
      <div className="ledger">
        <div className="lh"><h2><Download size={18} /> 국세청 자료 가져오기
          <InfoTip>
            국세청 신고 전자(세금)계산서 자료는 ecount를 경유해 가져옵니다. <b>ecount 실연동(test_mode 해제 + 인증키)</b>이 필요하며,
            미설정 시 안내 메시지가 표시됩니다.
          </InfoTip></h2></div>
        <div className="card-body" style={{ padding: '18px 26px' }}>
          <div className="formrow" style={{ alignItems: 'flex-end' }}>
            <label className="field"><span>시작일</span><input className="input" type="date" value={ntsFrom} onChange={(e) => setNtsFrom(e.target.value)} /></label>
            <label className="field"><span>종료일</span><input className="input" type="date" value={ntsTo} onChange={(e) => setNtsTo(e.target.value)} /></label>
            <label className="field"><span>구분</span>
              <select className="select" value={ntsKind} onChange={(e) => setNtsKind(e.target.value as 'sale' | 'purchase')}>
                <option value="sale">매출</option>
                <option value="purchase">매입</option>
              </select>
            </label>
            <button className="btn btn-primary" onClick={importNts} disabled={ntsBusy}><Download size={15} /> {ntsBusy ? '가져오는 중…' : '가져오기'}</button>
          </div>
          {ntsErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>{ntsErr}</div>}
          {ntsRows !== null && !ntsErr && (
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>가져온 자료 <b>{ntsRows.length}</b>건</div>
              {ntsRows.length > 0 && (
                <div className="twrap"><table className="tbl">
                  <thead><tr>{Object.keys(ntsRows[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
                  <tbody>
                    {ntsRows.map((row, i) => (
                      <tr key={i}>{Object.keys(ntsRows[0]).map((k) => <td key={k}>{String(row[k] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function panelSupplier() {
    return (
      <>
        <div className="ledger" style={{ maxWidth: 760 }}>
          <div className="lh"><h2><FileText size={18} /> 공급자 정보 (세금계산서 발행처)
            <InfoTip>이 정보가 세금계산서 미리보기/인쇄의 '공급자(발행자)' 칸 기본값으로 표시됩니다. 아래 프리셋으로 여러 발행자를 등록해 발행 시 한 번에 바꿀 수 있습니다.</InfoTip></h2>
            <div className="sp" />{setMsg && <span className="pillx ok">{setMsg}</span>}
          </div>
          <div className="card-body" style={{ padding: '20px 26px' }}>
            <div className="formrow">
              <label className="field"><span>등록번호(사업자)</span><input className="input" value={supplier.bizNo || ''} onChange={(e) => setSupplier({ ...supplier, bizNo: e.target.value })} placeholder="000-00-00000" /></label>
              <label className="field"><span>상호</span><input className="input" value={supplier.name || ''} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} placeholder="한국산업안전협회" /></label>
              <label className="field"><span>대표자(성명)</span><input className="input" value={supplier.ceo || ''} onChange={(e) => setSupplier({ ...supplier, ceo: e.target.value })} /></label>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <label className="field" style={{ flex: 1 }}><span>사업장 주소</span><input className="input" value={supplier.addr || ''} onChange={(e) => setSupplier({ ...supplier, addr: e.target.value })} /></label>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <label className="field"><span>업태</span><input className="input" value={supplier.bizType || ''} onChange={(e) => setSupplier({ ...supplier, bizType: e.target.value })} placeholder="서비스" /></label>
              <label className="field"><span>종목</span><input className="input" value={supplier.bizItem || ''} onChange={(e) => setSupplier({ ...supplier, bizItem: e.target.value })} placeholder="안전관리" /></label>
              <label className="field"><span>연락처</span><input className="input" value={supplier.tel || ''} onChange={(e) => setSupplier({ ...supplier, tel: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={saveSupplier} disabled={setBusy}>{setBusy ? '저장 중…' : '기본 발행자로 저장'}</button>
              <button className="btn btn-ghost" onClick={addPreset} disabled={setBusy}><Users size={14} /> 자주 쓰는 발행자로 추가</button>
            </div>
          </div>
        </div>
        <div className="ledger" style={{ maxWidth: 760 }}>
          <div className="lh"><h2><Users size={18} /> 자주 쓰는 발행자 (프리셋)</h2></div>
          <div className="card-body" style={{ padding: '16px 26px' }}>
            {presets.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>등록된 발행자 프리셋이 없습니다. 위 공급자 정보를 입력하고 <b>‘자주 쓰는 발행자로 추가’</b>를 누르세요. 소속(발행처)이 여러 곳일 때(예: 한국산업안전협회 / 타 소속) 각각 등록해 두면 발행 시 한 번에 선택됩니다.</div>}
            {presets.length > 0 && (
              <div className="twrap"><table className="tbl">
                <thead><tr><th>상호</th><th>등록번호</th><th>대표자</th><th style={{ width: 150 }}></th></tr></thead>
                <tbody>{presets.map((p) => (
                  <tr key={p.name}>
                    <td><b>{p.name}</b></td>
                    <td>{p.bizNo || '—'}</td>
                    <td>{p.ceo || '—'}</td>
                    <td className="c" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} onClick={() => { setSupplier({ ...p }); setSetMsg(`‘${p.name}’ 불러옴 — 수정 후 저장하세요.`) }} title="이 발행자를 편집기로 불러오기">불러오기</button>
                      <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px', marginLeft: 6 }} onClick={() => removePreset(p.name || '')} title="프리셋 삭제">삭제</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      </>
    )
  }

  function panelEcount() {
    return (
      <div className="ledger" style={{ maxWidth: 760 }}>
        <div className="lh"><h2><Plug size={18} /> 이카운트(ecount) 연동 설정</h2><div className="sp" />
          {settings && <span className={'pillx ' + (configured ? 'ok' : 'todo')}>{configured ? '설정됨' : '미사용'}</span>}
        </div>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {!isHq && (
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              이카운트(ERP) 없이도 이 화면에서 세금계산서를 발행·관리·인쇄할 수 있습니다.
              이카운트 연동 설정(회사코드·인증키)은 <b>본사 관리자 권한</b>에서만 편집할 수 있습니다.
            </div>
          )}
          {isHq && (
            <>
              <div className="formrow">
                <label className="field"><span>회사코드(com_code)</span><input className="input" value={settings?.com_code ?? ''} onChange={(e) => patchSetting({ com_code: e.target.value })} placeholder="이카운트 회사코드" /></label>
                <label className="field"><span>사용자 ID(user_id)</span><input className="input" value={settings?.user_id ?? ''} onChange={(e) => patchSetting({ user_id: e.target.value })} placeholder="이카운트 사용자 ID" /></label>
                <label className="field"><span>ZONE</span><input className="input" value={settings?.zone ?? ''} onChange={(e) => patchSetting({ zone: e.target.value })} placeholder="KR" /></label>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <label className="field" style={{ flex: 1 }}><span>API 인증키(api_cert_key)</span><input className="input" type="password" value={settings?.api_cert_key ?? ''} onChange={(e) => patchSetting({ api_cert_key: e.target.value })} placeholder="오픈 API 인증키" autoComplete="off" /></label>
                <label className="field"><span>기본 발행일</span><input className="input" type="number" min={1} max={31} value={settings?.default_issue_day ?? 25} onChange={(e) => patchSetting({ default_issue_day: Number(e.target.value) })} /></label>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <label className="field" style={{ flex: 1 }}><span>운영 메모(memo)</span><input className="input" value={settings?.memo ?? ''} onChange={(e) => patchSetting({ memo: e.target.value })} placeholder="섬지역 분기 발행 등" /></label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings?.test_mode ?? true} onChange={(e) => patchSetting({ test_mode: e.target.checked })} />
                <span>테스트 모드(test_mode)</span>
              </label>
              <div className="muted" style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.7 }}>
                <b>test_mode ON</b> = 스텁(발행 흉내 — 네트워크 호출 없이 참조번호만 생성). <b>test_mode OFF</b> = 실제 ecount 전자세금계산서 발행 및 국세청 자료·장부 조회.
                운영 전환 시 반드시 <b>연동 테스트 → 발행</b>으로 실계정을 1회 검증하세요.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={saveEcount} disabled={ecSaveBusy || !settings}>{ecSaveBusy ? '저장 중…' : '연동 설정 저장'}</button>
                <button className="btn btn-ghost" onClick={testEcount} disabled={ecTestBusy}><Plug size={14} /> {ecTestBusy ? '테스트 중…' : '연동 테스트'}</button>
                {ecSaveMsg && <span className="pillx ok">{ecSaveMsg}</span>}
              </div>
              {ecTestMsg && <div className="codebox" style={{ marginTop: 12 }}>{ecTestMsg}</div>}
              {settings === null && <div className="muted" style={{ marginTop: 10, fontSize: 11.5, color: 'var(--red-ink)' }}>설정을 불러오지 못했습니다 — 본사 관리자 권한이 필요합니다.</div>}
            </>
          )}
        </div>
      </div>
    )
  }

  const PANELS: Record<TabKey, () => JSX.Element> = {
    issue: panelIssue, list: panelList, bulk: panelBulk, staff: panelStaff,
    exec: panelExec, nts: panelNts, supplier: panelSupplier, ecount: panelEcount,
  }

  return (
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>세금계산서</b></div>}
      {!embedded && (
        <div className="bar">
          <h2>세금계산서</h2>
          <div className="sp" />
          <span className="muted" style={{ fontSize: 12 }}>왼쪽 기능을 열면 위에 탭으로 쌓이고, × 로 닫습니다 · F8 저장 · F3 찾기</span>
        </div>
      )}

      <div className="bws">
        {/* ── 좌측 카테고리 ── */}
        <aside className="bws-side">
          <div className="bws-side-h"><FileText size={14} /> 세금계산서 · 정산</div>
          {MENU.map((g) => (
            <div key={g.title} className="bws-group">
              <div className="bws-group-t">{g.title}</div>
              {g.keys.filter(tabVisible).map((k) => (
                <button key={k} type="button"
                  className={'bws-item' + (ws.tabs.includes(k) ? ' open' : '') + (active === k ? ' active' : '')}
                  onClick={() => openTab(k)}>
                  {TAB_DEFS[k].label}
                  {k === 'list' && <span className="n">{invoices.length}</span>}
                  {k !== 'list' && ws.tabs.includes(k) && active !== k && <span className="dot" />}
                </button>
              ))}
            </div>
          ))}
          <div className="bws-group">
            <div className="bws-group-t">도움말</div>
            <div className="muted" style={{ padding: '4px 14px', fontSize: 11.5, lineHeight: 1.7 }}>
              <HelpCircle size={12} style={{ verticalAlign: '-2px' }} /> 입력 화면에서 <b>F8</b>=저장, <b>F3</b>=거래처 찾기. 열어 둔 탭은 다음 접속 때 그대로 복원됩니다.
            </div>
          </div>
        </aside>

        {/* ── 우측: 누적 탭 + 화면 ── */}
        <div className="bws-main">
          <div className="bws-tabs">
            {visibleTabs.map((k) => (
              <button key={k} type="button" className={'bws-tab' + (active === k ? ' active' : '')} onClick={() => setWs((w) => ({ ...w, active: k }))} title={TAB_DEFS[k].label}>
                {k === 'issue' && tried && hasMissing && <span className="dirty" title="필수 미입력" />}
                {TAB_DEFS[k].label}
                <span role="button" className="x" title="탭 닫기" onClick={(e) => { e.stopPropagation(); closeTab(k) }}><X size={12} /></span>
              </button>
            ))}
            <div style={{ position: 'relative' }}>
              <button type="button" className="bws-tab-add" title="기능 열기" onClick={() => setAddOpen((o) => !o)}><Plus size={15} /></button>
              {addOpen && (
                <div className="bws-addmenu" onMouseLeave={() => setAddOpen(false)}>
                  {MENU.map((g) => (
                    <div key={g.title}>
                      <div className="t">{g.title}</div>
                      {g.keys.filter(tabVisible).map((k) => <button key={k} type="button" onClick={() => openTab(k)}>{TAB_DEFS[k].label}</button>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="bws-body">
            {active && tabVisible(active) ? PANELS[active]() : (
              <div className="bws-empty">
                열린 기능이 없습니다.<br />왼쪽 카테고리나 위의 <b>+</b> 로 기능을 열면 탭으로 쌓입니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 수정세금계산서 발행 모달 */}
      {correctRow && (
        <Modal
          title={`수정세금계산서 발행 · ${correctRow.schoolName}`}
          onClose={() => { if (!correctBusy) setCorrectRow(null) }}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setCorrectRow(null)} disabled={correctBusy}>취소</button>
            <button className="btn btn-primary" onClick={submitCorrection} disabled={correctBusy}><Pencil size={15} /> {correctBusy ? '발행 중…' : '수정발행'}</button>
          </>}
        >
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.7 }}>
            <b>{correctRow.schoolName}</b> · {correctRow.issue_date} · 공급가액 {won(correctRow.amount)}원 (세액 {won(correctRow.tax)}, 합계 {won(correctRow.total)})<br />
            아래 수정사유로 수정세금계산서를 발행합니다.
          </div>
          <label className="field" style={{ display: 'block' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)' }}>수정사유</span>
            <select className="select" value={correctReason} onChange={(e) => setCorrectReason(e.target.value)}>
              {CORRECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {correctErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>{correctErr}</div>}
        </Modal>
      )}

      {preview && (
        <Modal
          title={`세금계산서 미리보기 · ${preview.schoolName}`}
          onClose={() => setPreview(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>닫기</button>
            <button className="btn btn-primary" onClick={() => printInvoice(preview, resolveIssuer(pvIssuer))}><Printer size={15} /> 인쇄</button>
          </>}
        >
          {/* 발행자(공급자) 선택 — 발행 시 임의 변경 + 자주 쓰는 발행자 한 번에 */}
          <label className="field" style={{ marginBottom: 12, display: 'block' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)' }}>발행자(공급자)</span>
            <select className="select" value={pvIssuer}
              onChange={(e) => { setPvIssuer(e.target.value); patchExtra(preview.id, { issuer: e.target.value }) }}>
              <option value="">기본 발행자 — {supplier?.name || '한국산업안전협회'}</option>
              {presets.map((p) => <option key={p.name} value={p.name}>{p.name}{p.bizNo ? ` (${p.bizNo})` : ''}</option>)}
            </select>
          </label>
          <div style={{ border: '2px solid var(--red-ink,#c0392b)', borderRadius: 8, padding: 14 }}>
            <div style={{ textAlign: 'center', fontWeight: 800, letterSpacing: 6, color: 'var(--red-ink,#c0392b)', fontSize: 17 }}>세 금 계 산 서</div>
            <div className="formrow" style={{ marginTop: 12, gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: 'var(--violet)' }}>공급자</div>
                등록번호 {resolveIssuer(pvIssuer)?.bizNo || '—'}<br />
                상호 {resolveIssuer(pvIssuer)?.name || '한국산업안전협회'} / {resolveIssuer(pvIssuer)?.ceo || '—'}<br />
                {resolveIssuer(pvIssuer)?.addr || ''}
              </div>
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: 'var(--violet)' }}>공급받는자</div>
                등록번호 {preview.business_reg_no}<br />상호 {preview.schoolName}<br />담당 {preview.ex.staff || '-'}
              </div>
            </div>
            <table className="tbl" style={{ marginTop: 12 }}>
              <tbody>
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>작성일자</td><td>{preview.issue_date}</td><td className="c" style={{ background: 'var(--violet-soft)' }}>품목</td><td>{preview.ex.item || '안전관리 용역'}</td></tr>
                {(preview.ex.lines || []).filter((l) => l.name.trim() || lineAmount(l) > 0).map((l, i) => (
                  <tr key={i}><td className="c" style={{ background: 'var(--violet-soft)' }}>{i + 1}</td><td>{l.name}{l.spec ? ` (${l.spec})` : ''}</td><td className="c">{l.qty ? `${l.qty} × ${won(num(l.unit))}` : ''}</td><td className="c">{won(lineAmount(l))}원</td></tr>
                ))}
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>공급가액</td><td className="c">{won(preview.amount)}원</td><td className="c" style={{ background: 'var(--violet-soft)' }}>세액</td><td className="c">{won(preview.tax)}원</td></tr>
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>합계금액</td><td className="c" colSpan={3}><b style={{ color: 'var(--violet)', fontSize: 15 }}>{won(preview.total)}원</b></td></tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
