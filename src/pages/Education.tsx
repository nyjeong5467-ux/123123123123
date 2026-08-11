// 안전·보건 교육 — 학교 목록(진도 요약) → 학교별 교육 상세(진도율·회차대장·이수현황·관리감독자) 위계 뷰.
// Risk.tsx의 "학교별 평가" 위계 패턴을 따름.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, GraduationCap, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type FilterDef, type TableQueryConfig } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import '../styles/hier.css'
import '../styles/eduhier.css'

type School = {
  id: string
  name: string
  education_count: number | null
  school_level?: string
  manager?: string
}
type Progress = { total: number; completed_count: number; avg_progress: number }
type Tab = 'progress' | 'sessions' | 'people' | 'supervisor'

// 교육 회차 대장(C-1) — 개별 교육 기록 (GET /education/{sid}/sessions)
type EduSession = {
  id: string
  school_id: string
  date: string
  kind: string
  accident_type: string
  headcount: number
  created_at: string
}
// 종사자별 이수현황(C-4) — GET /education/{sid}/records (progress: 0.0~1.0)
type EduRecord = {
  id: string
  person_name: string
  job: string
  progress: number
  completed: boolean
}
// 관리감독자 교육(C-2) — 백엔드 /education/{sid}/supervisors CRUD
type Supervisor = {
  id: string
  date: string
  name: string
  completed: boolean
}

const SESSION_KINDS = ['정기안전교육', '채용시 안전교육']
const ACCIDENT_TYPES = ['넘어짐', '끼임', '부딪힘', '떨어짐', '화상', '근골격계', '기타']

// ===== 1단계: 학교 목록 (학교별 진도 요약) =====
type EduSummary = { prog: Progress | null; latest: string }
type SchoolRow = School & { total: number; completed: number; pct: number; latest: string }

const SCHOOL_LEVELS = ['유', '초', '중', '고', '기타']
const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [
    {
      key: 'level',
      label: '구분',
      options: SCHOOL_LEVELS.map((v) => ({ value: v, label: v })),
      accessor: (r) => r.school_level || '기타',
    },
  ],
  sortAccessors: {
    name: (r) => r.name,
    total: (r) => r.total,
    pct: (r) => r.pct,
    latest: (r) => r.latest,
  },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '학교', value: (r) => r.name },
  { header: '구분', value: (r) => r.school_level || '' },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '교육 대상 인원', value: (r) => r.total },
  { header: '수료 인원', value: (r) => r.completed },
  { header: '평균 진도율(%)', value: (r) => r.pct },
  { header: '최근 회차일', value: (r) => r.latest },
]

// ===== 2단계: 회차 대장 — 구분 필터 · 교육일/인원 정렬 · CSV 내보내기 =====
const SESSION_FILTERS: FilterDef<EduSession>[] = [
  {
    key: 'kind',
    label: '구분',
    options: SESSION_KINDS.map((k) => ({ value: k, label: k })),
    accessor: (r) => r.kind,
  },
]
const SESSION_SORTS = {
  date: (r: EduSession) => r.date,
  headcount: (r: EduSession) => r.headcount,
}
const SESSION_EXPORT: ExportColumn<EduSession>[] = [
  { header: '교육일', value: (r) => r.date },
  { header: '구분', value: (r) => r.kind },
  { header: '재해형태', value: (r) => r.accident_type },
  { header: '교육 실시 인원', value: (r) => r.headcount },
  { header: '작성일', value: (r) => r.created_at },
]

// 종사자별 이수현황 — 성명·소속 검색 · 수료여부 필터 · 성명/진도율 정렬
const RECORD_FILTERS: FilterDef<EduRecord>[] = [
  {
    key: 'done',
    label: '수료여부',
    options: [
      { value: '수료', label: '수료' },
      { value: '미수료', label: '미수료' },
    ],
    accessor: (r) => (r.completed ? '수료' : '미수료'),
  },
]
const RECORD_SORTS = {
  name: (r: EduRecord) => r.person_name,
  progress: (r: EduRecord) => r.progress,
}
const RECORD_EXPORT: ExportColumn<EduRecord>[] = [
  { header: '성명', value: (r) => r.person_name },
  { header: '소속', value: (r) => r.job },
  { header: '진도율(%)', value: (r) => Math.round(r.progress * 100) },
  { header: '수료여부', value: (r) => (r.completed ? '수료' : '미수료') },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}


// 학교 1곳 요약 조회 — 진도 집계 + 최근 회차일 (실패 시 빈 요약)
async function fetchSummary(schoolId: string): Promise<EduSummary> {
  const [prog, ss] = await Promise.all([
    api<Progress>(`/education/${schoolId}/progress`).catch(() => null),
    api<EduSession[]>(`/education/${schoolId}/sessions`).catch(() => [] as EduSession[]),
  ])
  const latest = (Array.isArray(ss) ? ss : []).reduce(
    (m, it) => ((it.date || '') > m ? it.date : m), '',
  )
  return { prog, latest }
}

export function Education() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 학교별 진도 요약 캐시 — 1단계 목록용
  const [sumMap, setSumMap] = useState<Record<string, EduSummary>>({})
  const [sumLoading, setSumLoading] = useState(false)

  // 위계 상태: 선택 학교(2단계) + 탭
  const [sel, setSel] = useState<School | null>(null)
  const [tab, setTab] = useState<Tab>('progress')
  const sid = sel?.id ?? ''

  // 진도율(집계) 상태
  const [data, setData] = useState<Progress | null>(null)
  const [progLoading, setProgLoading] = useState(false)
  const [progError, setProgError] = useState('')
  const [reload, setReload] = useState(0)

  // 진도 일괄 입력 모달 상태
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [result, setResult] = useState('')

  // 회차 대장 · 이수현황 (API)
  const [sessions, setSessions] = useState<EduSession[]>([])
  const [records, setRecords] = useState<EduRecord[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [ledgerReload, setLedgerReload] = useState(0)

  // 관리감독자 교육 (백엔드 CRUD)
  const [supers, setSupers] = useState<Supervisor[]>([])
  const [superReload, setSuperReload] = useState(0)
  const [spDate, setSpDate] = useState('')
  const [spName, setSpName] = useState('')
  const [spErr, setSpErr] = useState('')

  // 진도 메일 발송
  const [mailBusy, setMailBusy] = useState(false)

  // CMS 진도 CSV 일괄 인입(전 학교, 학교명 매칭) — POST /education/import
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function importCsv(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setImportBusy(true)
    setImportMsg(null)
    try {
      // 형식: 학교명,성명,직무,진도(0~100),수료(y/n) — 헤더 행 자동 제외
      const rows = (await f.text())
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [school = '', name = '', job = '', prog = '', done = ''] = l.split(',')
          return {
            school: school.trim(), person_name: name.trim(), job: job.trim(),
            progress: Number(prog.trim()) || 0,
            completed: /^(y|yes|수료|true|1)$/i.test(done.trim()),
          }
        })
        .filter((r) => r.school && r.person_name && !/^(학교|school)/i.test(r.school))
      if (!rows.length) {
        setImportMsg({ ok: false, text: 'CSV에서 행을 찾지 못했습니다. 형식: 학교명,성명,직무,진도(0~100),수료(y/n)' })
        return
      }
      const r = await api<{ ingested: number; unmatched: string[] }>('/education/import', {
        method: 'POST', body: JSON.stringify({ rows }),
      })
      const um = r.unmatched.length ? ` · 학교 미매칭 ${r.unmatched.length}건(${r.unmatched.slice(0, 3).join(', ')}${r.unmatched.length > 3 ? '…' : ''})` : ''
      setImportMsg({ ok: true, text: `${r.ingested}건 인입 완료${um}` })
      if (r.ingested > 0) {
        // 1단계 요약 캐시 갱신
        setSumMap({})
        setSumLoading(true)
        Promise.all(schools.map((s) => fetchSummary(s.id).then((sum) => [s.id, sum] as const)))
          .then((entries) => { setSumMap(Object.fromEntries(entries)); setSumLoading(false) })
      }
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'CSV 인입 실패' })
    } finally {
      setImportBusy(false)
    }
  }

  // 회차 등록 모달 상태
  const [sOpen, setSOpen] = useState(false)
  const [sDate, setSDate] = useState(today())
  const [sKind, setSKind] = useState(SESSION_KINDS[0])
  const [sAcc, setSAcc] = useState(ACCIDENT_TYPES[0])
  const [sHead, setSHead] = useState('')
  const [sBusy, setSBusy] = useState(false)
  const [sErr, setSErr] = useState('')

  const sessionQ = useTableQuery(sessions, {
    filters: SESSION_FILTERS,
    sortAccessors: SESSION_SORTS,
    initialSort: { key: 'date', dir: 'desc' },
  })
  const recordQ = useTableQuery(records, {
    searchFields: [(r) => r.person_name, (r) => r.job],
    filters: RECORD_FILTERS,
    sortAccessors: RECORD_SORTS,
    searchPlaceholder: '성명·소속',
  })

  // 학교 목록 1회 로드
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((s) => {
        if (!alive) return
        setSchools(Array.isArray(s) ? s : [])
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // 전 학교 진도 요약 로드 → 1단계 목록(게이지·대상 인원·최근 회차일)에 사용
  useEffect(() => {
    if (!schools.length) return
    let alive = true
    setSumLoading(true)
    Promise.all(schools.map((s) => fetchSummary(s.id).then((sum) => [s.id, sum] as const)))
      .then((entries) => {
        if (!alive) return
        setSumMap(Object.fromEntries(entries))
        setSumLoading(false)
      })
    return () => { alive = false }
  }, [schools])

  // 특정 학교 요약만 재조회 (진도 입력·회차 등록 후 목록 최신화)
  const refetchSummary = useCallback((schoolId: string) => {
    fetchSummary(schoolId)
      .then((sum) => setSumMap((m) => ({ ...m, [schoolId]: sum })))
      .catch(() => { /* 캐시 유지 */ })
  }, [])

  // 선택 학교 진도율 로드 (2단계)
  useEffect(() => {
    if (!sid) return
    let alive = true
    setProgLoading(true)
    setProgError('')
    api<Progress>(`/education/${sid}/progress`)
      .then((d) => { if (alive) { setData(d); setProgLoading(false) } })
      .catch((e) => { if (alive) { setProgError(e instanceof Error ? e.message : '오류'); setProgLoading(false) } })
    return () => { alive = false }
  }, [sid, reload])

  // 회차 대장 + 이수현황 로드(학교 진입 · 회차 등록 후)
  useEffect(() => {
    if (!sid) return
    let alive = true
    setLedgerLoading(true)
    setLedgerError('')
    Promise.all([
      api<EduSession[]>(`/education/${sid}/sessions`),
      api<EduRecord[]>(`/education/${sid}/records`),
    ])
      .then(([ss, rr]) => {
        if (!alive) return
        setSessions(Array.isArray(ss) ? ss : [])
        setRecords(Array.isArray(rr) ? rr : [])
        setLedgerLoading(false)
      })
      .catch((e) => { if (alive) { setLedgerError(e instanceof Error ? e.message : '오류'); setLedgerLoading(false) } })
    return () => { alive = false }
  }, [sid, ledgerReload])

  // 관리감독자 교육 로드(백엔드)
  useEffect(() => {
    if (!sid) { setSupers([]); return }
    let alive = true
    api<Supervisor[]>(`/education/${sid}/supervisors`)
      .then((d) => { if (alive) setSupers(Array.isArray(d) ? d : []) })
      .catch(() => { if (alive) setSupers([]) })
    return () => { alive = false }
  }, [sid, superReload])

  // ── 1단계: 학교 목록 데이터 ──
  const schoolRows: SchoolRow[] = useMemo(
    () => schools.map((s) => {
      const sum = sumMap[s.id]
      const prog = sum?.prog ?? null
      return {
        ...s,
        total: prog?.total ?? 0,
        completed: prog?.completed_count ?? 0,
        pct: Math.round((prog?.avg_progress ?? 0) * 100),
        latest: sum?.latest ?? '',
      }
    }),
    [schools, sumMap],
  )
  const totalPeople = useMemo(() => schoolRows.reduce((a, r) => a + r.total, 0), [schoolRows])
  const overallPct = useMemo(() => {
    const withData = schoolRows.filter((r) => r.total > 0)
    if (!withData.length) return 0
    return Math.round(withData.reduce((a, r) => a + r.pct, 0) / withData.length)
  }, [schoolRows])
  // 작성물 리스트(0807 개편) — 진도 데이터(기록)가 있는 학교만 첫 화면에 표시
  const dataRows: SchoolRow[] = useMemo(
    () => schoolRows.filter((r) => r.total > 0 || r.latest),
    [schoolRows],
  )
  const q = useTableQuery(dataRows, SCHOOL_QUERY)

  function openSchool(s: School) {
    setSel(s)
    setTab('progress')
    setResult('')
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

  const avgPct = data ? Math.round((data.avg_progress || 0) * 100) : 0

  async function ingest() {
    if (!sid) return
    setBusy(true)
    setFormErr('')
    setResult('')
    try {
      const rows = text
        .split('\n')
        .map((line) => {
          const [name, prog, done] = line.split(',').map((c) => c.trim())
          if (!name) return null
          return {
            school_id: sid,
            person_name: name,
            progress: Number(prog) / 100,
            completed: (done || '').toLowerCase() === 'y',
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      const res = await api<{ ingested: number }>('/education/ingest', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
      setResult(`${res.ingested}건 입력되었습니다.`)
      setOpen(false)
      setReload((n) => n + 1)
      setLedgerReload((n) => n + 1)
      refetchSummary(sid)
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : '입력에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function openSession() {
    setSDate(today()); setSKind(SESSION_KINDS[0]); setSAcc(ACCIDENT_TYPES[0])
    setSHead(''); setSErr(''); setSOpen(true)
  }
  async function addSession() {
    if (!sid || sBusy) return
    if (!sDate) { setSErr('교육일을 입력하세요.'); return }
    const n = Number(sHead)
    if (!sHead || Number.isNaN(n) || n <= 0) { setSErr('교육 실시 인원을 입력하세요.'); return }
    setSBusy(true)
    setSErr('')
    try {
      await api<EduSession>(`/education/${sid}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ date: sDate, kind: sKind, accident_type: sAcc, headcount: n }),
      })
      setSOpen(false)
      setLedgerReload((x) => x + 1)
      refetchSummary(sid)
    } catch (e) {
      setSErr(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSBusy(false)
    }
  }

  function toggleSuper(r: Supervisor) {
    // 낙관적 갱신 후 서버 반영(실패 시 재조회로 수렴)
    setSupers((prev) => prev.map((x) => (x.id === r.id ? { ...x, completed: !x.completed } : x)))
    api(`/education/supervisors/${r.id}`, {
      method: 'PUT', body: JSON.stringify({ completed: !r.completed }),
    }).catch(() => setSuperReload((n) => n + 1))
  }

  async function addSuper() {
    if (!sid || !spName.trim()) { setSpErr('성명을 입력하세요.'); return }
    setSpErr('')
    try {
      await api(`/education/${sid}/supervisors`, {
        method: 'POST',
        body: JSON.stringify({ date: spDate || today(), name: spName.trim() }),
      })
      setSpName('')
      setSuperReload((n) => n + 1)
    } catch (e) {
      setSpErr(e instanceof Error ? e.message : '등록에 실패했습니다.')
    }
  }

  function removeSuper(id: string) {
    if (!window.confirm('이 교육 기록을 삭제할까요?')) return
    api(`/education/supervisors/${id}`, { method: 'DELETE' })
      .then(() => setSuperReload((n) => n + 1))
      .catch(() => setSuperReload((n) => n + 1))
  }

  async function sendProgressMail() {
    if (!sid || mailBusy) return
    setMailBusy(true)
    setResult('')
    try {
      const d = await api<{ total: number; completed_count: number; avg_progress: number }>(
        `/education/${sid}/mail`, { method: 'POST' },
      )
      setResult(`진도 메일 발송 요청 완료 — 평균진도 ${Math.round((d.avg_progress || 0) * 100)}% · 수료 ${d.completed_count}/${d.total}`)
    } catch (e) {
      setResult(e instanceof Error ? `메일 발송 실패: ${e.message}` : '메일 발송 실패')
    } finally {
      setMailBusy(false)
    }
  }

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / {sel
          ? <><a onClick={() => setSel(null)} style={{ cursor: 'pointer' }}>안전·보건 교육</a> / <b>{sel.name}</b></>
          : <b>안전·보건 교육</b>}
      </div>
      <div className="bar">
        <h2><GraduationCap size={20} style={{ verticalAlign: '-3px', marginRight: 6 }} />안전·보건 교육</h2>
        <div className="sp" />
        {sel && (
          <div className="tabs">
            <button className={'tab' + (tab === 'progress' ? ' active' : '')} onClick={() => setTab('progress')}>진도율</button>
            <button className={'tab' + (tab === 'sessions' ? ' active' : '')} onClick={() => setTab('sessions')}>
              교육 회차 대장<span className="n">{sessions.length}</span>
            </button>
            <button className={'tab' + (tab === 'people' ? ' active' : '')} onClick={() => setTab('people')}>
              종사자별 이수현황<span className="n">{records.length}</span>
            </button>
            <button className={'tab' + (tab === 'supervisor' ? ' active' : '')} onClick={() => setTab('supervisor')}>
              관리감독자 교육<span className="n">{supers.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── 1단계: 학교 목록 (학교별 진도 요약) ── */}
      {!sel && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="l">학교 수</div>
              <div className="v">{schools.length}<small> 곳</small></div>
              <div className="d">교육 진도 관리 대상</div>
            </div>
            <div className="kpi">
              <div className="l">교육 대상</div>
              <div className="v">{totalPeople}<small> 명</small></div>
              <div className="d">전 학교 교육 대상 종사자</div>
            </div>
            <div className={'kpi ' + (overallPct < 100 ? 'warn' : '')}>
              <div className="l">평균 진도율</div>
              <div className="v">{overallPct}<small> %</small></div>
              <div className="d">진도 데이터 보유 학교 평균</div>
            </div>
          </div>

          <div className="ledger">
            <div className="lh">
              <h2><GraduationCap size={18} /> 교육 진도 기록</h2>
              <span className="pillx doing">{q.total}교</span>
              <div className="sp" />
              <FilterBar q={q} />
              <label className="btn btn-ghost" htmlFor="edu-import-csv" style={{ cursor: 'pointer' }}>
                {importBusy ? '인입 중…' : 'CMS 진도 CSV 일괄 인입'}
              </label>
              <input id="edu-import-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={(e) => { void importCsv(e.target.files); e.target.value = '' }} />
              <ExportButton q={q} columns={SCHOOL_EXPORT} filename="교육진도_학교별" />
            </div>
            {importMsg && (
              <div className="tstate" style={{ margin: '0 22px', color: importMsg.ok ? 'var(--ink-2)' : 'var(--red-ink)' }}>
                {importMsg.ok ? '✓ ' : '✕ '}{importMsg.text}
              </div>
            )}
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortableTh q={q} col="name">학교</SortableTh>
                    <th>구분</th>
                    <th>담당자</th>
                    <SortableTh q={q} col="total" className="c">교육 대상</SortableTh>
                    <SortableTh q={q} col="pct">평균 진도율</SortableTh>
                    <SortableTh q={q} col="latest">최근 회차일</SortableTh>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && error && <tr><td colSpan={7}><div className="tstate">오류: {error}</div></td></tr>}
                  {!loading && !error && q.view.map((s) => (
                    <tr key={s.id} onClick={() => openSchool(s)}>
                      <td><b>{s.name}</b></td>
                      <td>{s.school_level ? <span className="pillx doing">{s.school_level}</span> : <span className="edh-dim">—</span>}</td>
                      <td className="edh-mgr">{s.manager || '—'}</td>
                      <td className="c">{sumLoading && !sumMap[s.id] ? <span className="edh-dim">…</span> : `${s.total}명`}</td>
                      <td>
                        {sumLoading && !sumMap[s.id]
                          ? <span className="edh-dim">…</span>
                          : s.total > 0
                            ? (
                              <span className="edh-gauge">
                                <span className="edh-bar">
                                  <span
                                    className={'edh-fill' + (s.pct >= 100 ? ' done' : '')}
                                    style={{ width: `${Math.min(100, s.pct)}%` }}
                                  />
                                </span>
                                <span className="edh-pct">{s.pct}%</span>
                              </span>
                            )
                            : <span className="edh-dim">—</span>}
                      </td>
                      <td>{sumLoading && !sumMap[s.id] ? <span className="edh-dim">…</span> : (s.latest || '—')}</td>
                      <td className="c"><span className="chev"><ChevronRight size={15} /></span></td>
                    </tr>
                  ))}
                  {!loading && !error && q.view.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">{dataRows.length === 0 ? '교육 진도 기록이 없습니다. CMS 진도 CSV를 인입하거나 학교 탭의 [교육] 바로가기에서 시작하세요.' : '조건에 맞는 기록이 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={q} />
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            학교를 선택하면 진도율·교육 회차 대장·종사자별 이수현황·관리감독자 교육을 확인할 수 있습니다.
          </div>
        </>
      )}

      {/* ── 2단계: 선택 학교 교육 상세 ── */}
      {sel && (
        <>
          <div className="edh-schoolhead">
            <button className="edh-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="edh-schoolname">{sel.name}</span>
            {sel.school_level && <span className="pillx doing">{sel.school_level}</span>}
            <span className="edh-schoolmeta">담당자 {sel.manager || '—'}</span>
          </div>

          {/* 진도율 (기존 기능 보존) */}
          {tab === 'progress' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 12 }}>
                <button className="btn btn-ghost" disabled={!sid || mailBusy} onClick={() => void sendProgressMail()}>
                  {mailBusy ? '발송 중…' : '진도 메일 발송'}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!sid}
                  onClick={() => { setText(''); setFormErr(''); setResult(''); setOpen(true) }}
                >
                  진도 일괄 입력
                </button>
              </div>

              {progLoading && <div className="tstate">불러오는 중…</div>}
              {!progLoading && progError && <div className="tstate">오류: {progError}</div>}
              {!progLoading && !progError && !data && <div className="tstate">진도 데이터가 없습니다. '진도 일괄 입력'으로 교육 진도를 등록하세요.</div>}

              {!progLoading && !progError && data && (
                <div className="kpis">
                  <div className="kpi">
                    <div className="l">총원</div>
                    <div className="v">{data.total}<small> 명</small></div>
                    <div className="d">교육 대상 종사자</div>
                  </div>
                  <div className="kpi">
                    <div className="l">수료</div>
                    <div className="v">{data.completed_count}<small> 명</small></div>
                    <div className="d">수료 완료 인원</div>
                  </div>
                  <div className={'kpi ' + (avgPct < 100 ? 'warn' : '')}>
                    <div className="l">평균 진도율</div>
                    <div className="v">{avgPct}<small> %</small></div>
                    <div className="d">전체 평균 진도</div>
                  </div>
                </div>
              )}

              {result && (
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8 }}>
                  {result}
                </div>
              )}

              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8 }}>
                진도 인입은 봇/엑셀 일괄(POST /education/ingest)로 처리됩니다.
              </div>
            </>
          )}

          {/* 교육 회차 대장 (C-1) */}
          {tab === 'sessions' && (
            <div className="ledger">
              <div className="lh">
                <h2><GraduationCap size={18} /> 교육 회차 대장</h2>
                <div className="sp" />
                <FilterBar q={sessionQ} />
                <ExportButton q={sessionQ} columns={SESSION_EXPORT} filename={`교육회차대장_${sel.name}`} />
                <button className="btn btn-primary" disabled={!sid} onClick={openSession}>
                  <Plus size={15} /> 회차 등록
                </button>
              </div>
              <div className="twrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>No</th>
                      <SortableTh q={sessionQ} col="date">교육일</SortableTh>
                      <th>구분</th>
                      <th>재해형태</th>
                      <SortableTh q={sessionQ} col="headcount">교육 실시 인원</SortableTh>
                      <th>작성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerLoading && <tr><td colSpan={6}><div className="tstate">불러오는 중…</div></td></tr>}
                    {!ledgerLoading && ledgerError && <tr><td colSpan={6}><div className="tstate">오류: {ledgerError}</div></td></tr>}
                    {!ledgerLoading && !ledgerError && sessionQ.view.map((r, i) => (
                      <tr key={r.id}>
                        <td>{(sessionQ.page - 1) * sessionQ.pageSize + i + 1}</td>
                        <td><b>{r.date}</b></td>
                        <td><span className="pillx doing">{r.kind}</span></td>
                        <td>{r.accident_type || '—'}</td>
                        <td>{r.headcount}명</td>
                        <td className="muted">{r.created_at}</td>
                      </tr>
                    ))}
                    {!ledgerLoading && !ledgerError && sessionQ.view.length === 0 && (
                      <tr><td colSpan={6}><div className="tstate">등록된 교육 회차가 없습니다. '회차 등록'으로 추가하세요.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination q={sessionQ} />
            </div>
          )}

          {/* 종사자별 이수현황 (C-4) */}
          {tab === 'people' && (
            <div className="ledger">
              <div className="lh">
                <h2><GraduationCap size={18} /> 종사자별 이수현황</h2>
                <div className="sp" />
                <FilterBar q={recordQ} />
                <ExportButton q={recordQ} columns={RECORD_EXPORT} filename={`종사자별이수현황_${sel.name}`} />
              </div>
              <div className="twrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>No</th>
                      <SortableTh q={recordQ} col="name">성명</SortableTh>
                      <th>소속</th>
                      <SortableTh q={recordQ} col="progress">진도율</SortableTh>
                      <th>수료여부</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerLoading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
                    {!ledgerLoading && ledgerError && <tr><td colSpan={5}><div className="tstate">오류: {ledgerError}</div></td></tr>}
                    {!ledgerLoading && !ledgerError && recordQ.view.map((r, i) => (
                      <tr key={r.id}>
                        <td>{(recordQ.page - 1) * recordQ.pageSize + i + 1}</td>
                        <td><b>{r.person_name}</b></td>
                        <td>{r.job}</td>
                        <td>{Math.round(r.progress * 100)}%</td>
                        <td>
                          {r.completed
                            ? <span className="pillx ok">수료</span>
                            : <span className="pillx todo">미수료</span>}
                        </td>
                      </tr>
                    ))}
                    {!ledgerLoading && !ledgerError && recordQ.view.length === 0 && (
                      <tr><td colSpan={5}><div className="tstate">조건에 맞는 종사자가 없습니다.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination q={recordQ} />
            </div>
          )}

          {/* 관리감독자 교육 (C-2) — 백엔드 CRUD */}
          {tab === 'supervisor' && (
            <div className="ledger">
              <div className="lh">
                <h2><GraduationCap size={18} /> 관리감독자 교육</h2>
                <div className="sp" />
                <span className="pillx na">{supers.length}건</span>
              </div>
              <div className="card-body" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line)' }}>
                <div className="formrow">
                  <label className="field">
                    <span>교육일</span>
                    <input className="input" type="date" value={spDate} onChange={(e) => setSpDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>대상(관리감독자)</span>
                    <input className="input" value={spName} onChange={(e) => setSpName(e.target.value)} placeholder="성명" />
                  </label>
                  <button className="btn btn-primary" onClick={() => void addSuper()} disabled={!sid}>등록</button>
                </div>
                {spErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 8, fontSize: 12, fontWeight: 600 }}>{spErr}</div>}
              </div>
              <div className="twrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>교육일</th>
                      <th>대상(관리감독자)</th>
                      <th>이수여부</th>
                      <th>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supers.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.date}</b></td>
                        <td>{r.name}</td>
                        <td>
                          {r.completed
                            ? <span className="pillx ok">이수</span>
                            : <span className="pillx todo">미이수</span>}
                        </td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => toggleSuper(r)}>
                            {r.completed ? '미이수 처리' : '이수 처리'}
                          </button>
                          <button className="btn btn-ghost" onClick={() => removeSuper(r.id)}>삭제</button>
                        </td>
                      </tr>
                    ))}
                    {supers.length === 0 && (
                      <tr><td colSpan={4}><div className="tstate">관리감독자 교육 기록이 없습니다. 위 양식으로 등록하세요.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 진도 일괄 입력 모달 (기존 보존) */}
      {open && (
        <Modal
          title={`교육 진도 입력${sel ? ` · ${sel.name}` : ''}`}
          onClose={() => { if (!busy) setOpen(false) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={ingest}>
                {busy ? '입력 중…' : '입력'}
              </button>
            </>
          }
        >
          {formErr && <div className="login-err">{formErr}</div>}
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            한 줄에 한 명 — 성명,진도(0~100),수료(y/n)
          </div>
          <textarea
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'홍길동,80,n\n김철수,100,y'}
          />
        </Modal>
      )}

      {/* 교육 회차 등록 모달 */}
      {sOpen && (
        <Modal
          title={`교육 회차 등록${sel ? ` · ${sel.name}` : ''}`}
          onClose={() => { if (!sBusy) setSOpen(false) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={sBusy} onClick={() => setSOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={sBusy || !sid} onClick={addSession}>
                {sBusy ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          {sErr && <div className="login-err" style={{ marginBottom: 12 }}>{sErr}</div>}
          <div className="formrow">
            <label className="field"><span>교육일 *</span>
              <input className="input" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
            </label>
            <label className="field"><span>구분</span>
              <select className="select" value={sKind} onChange={(e) => setSKind(e.target.value)}>
                {SESSION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <label className="field"><span>재해형태</span>
              <select className="select" value={sAcc} onChange={(e) => setSAcc(e.target.value)}>
                {ACCIDENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="field"><span>교육 실시 인원 *</span>
              <input className="input" type="number" value={sHead} onChange={(e) => setSHead(e.target.value)} placeholder="0" />
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
