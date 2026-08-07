import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ClipboardCheck, FileCheck2, Info, Layers, Megaphone, MessageSquare, ShieldCheck, TriangleAlert, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import { useAuth } from '../lib/auth'
import { SchoolFormModal } from '../components/SchoolFormModal'
import { BulkUploadModal } from '../components/BulkUploadModal'

// 대시보드 편집 콘텐츠(관리체계·주요일정·지시/요청) — /ops/docs/dashboard-content 서버 저장.
// 미저장 테넌트는 아래 기본값 표시(저장 시 서버로 승격).
type DashContent = {
  ms: { rev: string; doc_no: string; rev_no: string; dept: string; approver: string }
  schedule: { mo: string; text: string }[]
  directives: string[]
  requests: string[]
}
const DASH_DEFAULT: DashContent = {
  ms: { rev: '2026-03-02 제정', doc_no: 'SHM-2026-001', rev_no: 'Rev.2', dept: '안전관리부', approver: '안전보건관리책임자' },
  schedule: [
    { mo: '05월', text: '정기 안전점검 실시' },
    { mo: '06월', text: '근골격계 유해요인조사 (상반기)' },
    { mo: '10월', text: '이행점검 마감 · 결과 송부' },
    { mo: '11월', text: '근골격계 유해요인조사 (하반기)' },
    { mo: '연 2회', text: '정기 위험성평가 갱신' },
  ],
  directives: ['급식실 미이행 학교 5월 내 점검 완료', '고위험(9점↑) 공정 개선계획 제출'],
  requests: ['당직실 노후 소화기 교체 요청', '통학차량 승하차 안전요원 배치'],
}

type School = { id: string; name: string; education_count: number | null; school_level?: string }
type StatusItem = { status: string }
type Ledger = { workers: { part: string; count: number }[]; worker_total: number; headcount_mismatch: boolean }
type Edu = { total: number; completed_count: number; avg_progress: number }

type Detail = {
  school: School
  worker: string
  total: number
  mismatch: boolean
  safety: 'ok' | 'doing' | 'todo'
  risk: 'ok' | 'doing' | 'todo'
  comp: 'ok' | 'doing' | 'todo'
  eduPct: number | null
}

const PARTS: [string, string][] = [
  ['catering', '조'], ['facility', '시'], ['cleaning', '미'], ['commute', '통'], ['night_duty', '당'],
]
const ST_LABEL = { ok: '완료', doing: '진행중', todo: '예정' } as const

function derive(list: StatusItem[], doneVal: string): 'ok' | 'doing' | 'todo' {
  if (!Array.isArray(list) || list.length === 0) return 'todo'
  if (list.some((x) => x.status === doneVal)) return 'ok'
  return 'doing'
}

const R = 112
const C = 2 * Math.PI * R

const DASH_SEARCH = [(r: Detail) => r.school.name]
const DASH_FILTERS: FilterDef<Detail>[] = [
  {
    key: 'safety',
    label: '안전점검',
    options: [
      { value: 'ok', label: '완료' },
      { value: 'doing', label: '진행중' },
      { value: 'todo', label: '예정' },
    ],
    accessor: (r) => r.safety,
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
const DASH_SORTS = {
  name: (r: Detail) => r.school.name,
  workers: (r: Detail) => r.total,
  edu: (r: Detail) => r.eduPct ?? -1,
}
const DASH_EXPORT: ExportColumn<Detail>[] = [
  { header: '학교', value: (r) => r.school.name },
  { header: '현업종사자', value: (r) => r.worker },
  { header: '계(명)', value: (r) => r.total },
  { header: '안전', value: (r) => ST_LABEL[r.safety] },
  { header: '위험성', value: (r) => ST_LABEL[r.risk] },
  { header: '이행', value: (r) => ST_LABEL[r.comp] },
  { header: '교육진도율', value: (r) => (r.eduPct != null ? `${r.eduPct}%` : '') },
  { header: '인원대조', value: (r) => (r.mismatch ? '불일치' : '일치') },
]

export function Dashboard() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [rows, setRows] = useState<Detail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [modal, setModal] = useState<'create' | 'bulk' | null>(null)
  const [gapTab, setGapTab] = useState<'safety' | 'risk' | 'comp' | 'edu'>('safety')

  // 대시보드 편집 콘텐츠(서버 문서 + 기본값 폴백) — 인플레이스 편집 모드(사이클 히어로와 동일 UX)
  const [dContent, setDContent] = useState<DashContent>(DASH_DEFAULT)
  const [dEdit, setDEdit] = useState(false)
  const [dDraft, setDDraft] = useState<DashContent>(DASH_DEFAULT)
  const [dBusy, setDBusy] = useState(false)
  const [dErr, setDErr] = useState('')

  // 뷰는 편집 중이면 드래프트를 그대로 렌더(라이브 미리보기)
  const dView = dEdit ? dDraft : dContent

  useEffect(() => {
    let alive = true
    api<{ doc: Partial<DashContent> }>('/ops/docs/dashboard-content')
      .then((d) => {
        if (!alive) return
        const doc = d.doc || {}
        if (Object.keys(doc).length) setDContent({ ...DASH_DEFAULT, ...doc, ms: { ...DASH_DEFAULT.ms, ...(doc.ms || {}) } })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  function startDashEdit() {
    setDDraft(structuredClone(dContent))
    setDErr('')
    setDEdit(true)
  }

  function patchMs(patch: Partial<DashContent['ms']>) {
    setDDraft((d) => ({ ...d, ms: { ...d.ms, ...patch } }))
  }
  function patchList(key: 'directives' | 'requests', i: number, v: string) {
    setDDraft((d) => ({ ...d, [key]: d[key].map((x, idx) => (idx === i ? v : x)) }))
  }
  function removeAt(key: 'directives' | 'requests' | 'schedule', i: number) {
    setDDraft((d) => ({ ...d, [key]: (d[key] as unknown[]).filter((_, idx) => idx !== i) } as DashContent))
  }

  async function saveDashEdit() {
    setDBusy(true)
    setDErr('')
    // 빈 행 정리 후 저장
    const next: DashContent = {
      ms: dDraft.ms,
      schedule: dDraft.schedule.filter((s) => s.mo.trim() || s.text.trim()),
      directives: dDraft.directives.filter((t) => t.trim()),
      requests: dDraft.requests.filter((t) => t.trim()),
    }
    try {
      await api('/ops/docs/dashboard-content', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setDContent(next)
      setDEdit(false)
    } catch (e) {
      setDErr(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setDBusy(false)
    }
  }

  // 편집 모드 공용 스타일(사이클 히어로와 동일 시각 언어)
  const editOutline = dEdit ? { outline: '2px dashed var(--violet)', outlineOffset: -2 } : undefined
  const tinyBtn: CSSProperties = {
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)',
    borderRadius: 7, width: 22, height: 22, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const schools = await api<School[]>('/schools')
        const details = await Promise.all(
          schools.map(async (s): Promise<Detail> => {
            const [led, insp, risk, comp, edu] = await Promise.all([
              api<Ledger>(`/schools/${s.id}/ledger`).catch(() => null),
              api<StatusItem[]>(`/inspections?school_id=${s.id}`).catch(() => []),
              api<StatusItem[]>(`/risk?school_id=${s.id}`).catch(() => []),
              api<StatusItem[]>(`/compliance?school_id=${s.id}`).catch(() => []),
              api<Edu>(`/education/${s.id}/progress`).catch(() => null),
            ])
            const by: Record<string, number> = {}
            ;(led?.workers || []).forEach((w) => { by[w.part] = (by[w.part] || 0) + w.count })
            return {
              school: s,
              worker: PARTS.map(([k, l]) => `${l}${by[k] || 0}`).join('·'),
              total: led?.worker_total ?? 0,
              mismatch: !!led?.headcount_mismatch,
              safety: derive(insp, 'submitted'),
              risk: derive(risk, 'completed'),
              comp: derive(comp, 'submitted'),
              eduPct: edu && edu.total > 0 ? Math.round(edu.avg_progress * 100) : null,
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

  // ---- 실데이터 집계 ----
  const totalSchools = rows.length
  const done = (k: 'safety' | 'risk' | 'comp') => rows.filter((r) => r[k] === 'ok').length
  const inProg = (k: 'safety' | 'risk' | 'comp') => rows.filter((r) => r[k] === 'doing').length
  const safetyDone = done('safety')
  const notInspected = rows.filter((r) => r.safety === 'todo').length
  const gauge = totalSchools ? Math.round((safetyDone / totalSchools) * 1000) / 10 : 0
  const eduVals = rows.map((r) => r.eduPct).filter((v): v is number => v != null)
  const eduAvg = eduVals.length ? Math.round(eduVals.reduce((a, b) => a + b, 0) / eduVals.length) : null
  const dash = (gauge / 100) * C

  // ---- 미이행 현황 (gap B-1) ----
  const gapStat = (s: 'ok' | 'doing' | 'todo') => (s === 'doing' ? '진행중' : '미착수')
  type GapTab = { key: 'safety' | 'risk' | 'comp' | 'edu'; label: string; list: Detail[]; status: (r: Detail) => string }
  const gapTabs: GapTab[] = [
    { key: 'safety', label: '안전점검 미이행', list: rows.filter((r) => r.safety !== 'ok'), status: (r) => gapStat(r.safety) },
    { key: 'risk', label: '위험성평가 미이행', list: rows.filter((r) => r.risk !== 'ok'), status: (r) => gapStat(r.risk) },
    { key: 'comp', label: '이행점검 미이행', list: rows.filter((r) => r.comp !== 'ok'), status: (r) => gapStat(r.comp) },
    { key: 'edu', label: '교육 미이행', list: rows.filter((r) => r.eduPct == null || r.eduPct < 100), status: (r) => (r.eduPct == null ? '미입력' : `진행중 ${r.eduPct}%`) },
  ]
  const activeGap = gapTabs.find((t) => t.key === gapTab) ?? gapTabs[0]

  // ---- 학교급별 분해 (gap B-4) ----
  const LEVELS = ['유', '초', '중', '고', '기타']
  const levelOf = (r: Detail): string => {
    const lv = r.school.school_level
    return lv && LEVELS.includes(lv) ? lv : '기타'
  }
  const levelGroups = LEVELS.map((lv) => {
    const g = rows.filter((r) => levelOf(r) === lv)
    const okc = g.filter((r) => r.safety === 'ok').length
    return { lv, count: g.length, pct: g.length ? Math.round((okc / g.length) * 100) : 0 }
  }).filter((g) => g.count > 0)

  const cardBox: CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-soft)',
    padding: '18px 22px',
  }

  const q = useTableQuery(rows, {
    searchFields: DASH_SEARCH,
    filters: DASH_FILTERS,
    sortAccessors: DASH_SORTS,
    searchPlaceholder: '학교명 검색',
  })

  const MODS = [
    { c: 'v', Icon: ClipboardCheck, name: '안전점검', to: '/inspection', done: safetyDone, prog: inProg('safety') },
    { c: 'y', Icon: TriangleAlert, name: '위험성평가', to: '/risk', done: done('risk'), prog: inProg('risk') },
    { c: 'b', Icon: FileCheck2, name: '이행점검', to: '/compliance', done: done('comp'), prog: inProg('comp') },
  ]

  return (
    <>
      <main className="main">
        <section className="hello rv">
          <h1>안녕하세요{user ? `, ${user.login}님` : ''}</h1>
          <p>담당 학교 {totalSchools}개교 · 안전점검 완료 {safetyDone}/{totalSchools}. 현장 점검 데이터가 들어오면 자동 반영됩니다.</p>
          <div className="info">
            <div className="it"><Zap size={20} strokeWidth={2} /><b>{gauge}%</b>&nbsp;안전점검 진행률</div>
            <div className="it"><ClipboardCheck size={20} strokeWidth={2} />담당 {totalSchools}개교</div>
          </div>
        </section>

        <div className="bar rv" style={{ animationDelay: '.05s' }}>
          <h2><span className="live" />담당 학교 현황</h2>
          <div className="sp" />
          <span className="mini"><ClipboardCheck size={18} strokeWidth={2} />점검 완료 <b>{safetyDone}</b></span>
          <span className="mini t"><TriangleAlert size={18} strokeWidth={2} />미점검 <b>{notInspected}</b></span>
        </div>

        <div className="devrow rv" style={{ animationDelay: '.1s', gridTemplateColumns: 'repeat(4,1fr)' }}>
          {MODS.map((m) => {
            const pct = totalSchools ? Math.round((m.done / totalSchools) * 100) : 0
            return (
              <div className="dev" key={m.name} onClick={() => nav(m.to)}>
                <div className="top">
                  <m.Icon size={20} strokeWidth={1.9} />
                  <span className={'pillx ' + (m.prog ? 'doing' : m.done ? 'ok' : 'todo')}>
                    {m.prog ? '진행중' : m.done ? '완료분 있음' : '대기'}
                  </span>
                </div>
                <div className="ic"><m.Icon size={20} strokeWidth={1.9} /></div>
                <div className="nm">{m.name}</div>
                <div className="sub">{m.done} / {totalSchools} 교 · {pct}%</div>
                <div className="mbar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })}
          <div className="dev" onClick={() => nav('/musculo')}>
            <div className="top"><Activity size={20} strokeWidth={1.9} /><span className="pillx na">목록 API 없음</span></div>
            <div className="ic"><Activity size={20} strokeWidth={1.9} /></div>
            <div className="nm">근골격계</div>
            <div className="sub">현장 OMR/태블릿 · 집계 후속</div>
            <div className="mbar"><i style={{ width: '0%' }} /></div>
          </div>
        </div>

        <section className="ledger rv" style={{ animationDelay: '.13s', marginTop: 22 }}>
          <div className="lh">
            <h2><TriangleAlert size={18} /> 미이행 현황</h2>
            <span className="pillx warn">{activeGap.list.length}개교</span>
            <div className="sp" />
            <div className="tabs">
              {gapTabs.map((t) => (
                <button key={t.key} className={'tab' + (gapTab === t.key ? ' active' : '')} onClick={() => setGapTab(t.key)}>
                  {t.label}<span className="n">{t.list.length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr><th>학교명</th><th className="c">구분</th><th>담당</th><th className="c">상태</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4}><div className="tstate">불러오는 중…</div></td></tr>}
                {!loading && activeGap.list.length === 0 && (
                  <tr><td colSpan={4}><div className="tstate">{totalSchools === 0 ? '학교 데이터가 없습니다.' : '전 학교 이행 완료 ✓'}</div></td></tr>
                )}
                {!loading && activeGap.list.map((r) => (
                  <tr key={r.school.id} onClick={() => nav(`/schools/${r.school.id}`)}>
                    <td><b>{r.school.name}</b></td>
                    <td className="c">{r.school.school_level ? <span className="pillx doing">{r.school.school_level}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>{user?.login ?? '조사원'}</td>
                    <td className="c"><span className="pillx warn">{activeGap.status(r)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="gauge-card rv" style={{ animationDelay: '.15s' }}>
          <div className="gh">
            <div className="ic"><Zap size={18} strokeWidth={1.9} /></div>
            <div className="t">안전점검 진행률 (실데이터)</div>
            <div className="sp" />
            <span className="lab">학교 {totalSchools}개 기준</span>
          </div>
          <div className="gauge-wrap">
            <div className="gstat"><div className="v ok">{safetyDone}</div><div className="l">완료 (교)</div></div>
            <div className="dial">
              <svg viewBox="0 0 300 300">
                <defs>
                  <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7C5CFB" /><stop offset="55%" stopColor="#C06AD8" /><stop offset="100%" stopColor="#F2784B" />
                  </linearGradient>
                </defs>
                <circle className="track" cx="150" cy="150" r={R} fill="none" strokeWidth="14" />
                <circle cx="150" cy="150" r={R} fill="none" stroke="url(#arc)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} />
              </svg>
              <div className="center"><div className="big">{gauge}</div><div className="u">완료율 %</div><div className="frac">{safetyDone} / {totalSchools} 교</div></div>
            </div>
            <div className="gstat"><div className="v red">{notInspected}</div><div className="l">미점검 (교)</div></div>
          </div>
        </section>

        <div className="grid2 rv" style={{ animationDelay: '.2s', marginTop: 24 }}>
          <div className="card" style={cardBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Layers size={18} strokeWidth={1.9} style={{ color: 'var(--violet)' }} />
              <b style={{ fontSize: 14 }}>학교급별 안전점검 현황</b>
              <span className="pillx doing" style={{ marginLeft: 'auto' }}>{totalSchools}개교</span>
            </div>
            {levelGroups.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>학교 데이터가 없습니다.</p>
            ) : (
              levelGroups.map((g) => (
                <div key={g.lv} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12.5 }}>
                    <span><span className="pillx doing">{g.lv}</span><b style={{ marginLeft: 8 }}>{g.count}개교</b></span>
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>완료율 {g.pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
                    <i style={{ display: 'block', height: '100%', width: `${g.pct}%`, background: 'var(--grad-violet)', borderRadius: 999 }} />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card" style={{ ...cardBox, ...editOutline }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <ShieldCheck size={18} strokeWidth={1.9} style={{ color: 'var(--violet)' }} />
              <b style={{ fontSize: 14 }}>안전보건관리체계 구축현황</b>
              <div style={{ flex: 1 }} />
              {dEdit ? (
                <>
                  {dErr && <span style={{ color: 'var(--red-ink)', fontSize: 11.5, fontWeight: 600 }}>{dErr}</span>}
                  <button className="btn btn-ghost" disabled={dBusy} onClick={() => setDEdit(false)}>취소</button>
                  <button className="btn btn-primary" disabled={dBusy} onClick={() => void saveDashEdit()}>
                    {dBusy ? '저장 중…' : '저장'}
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={startDashEdit}>편집</button>
              )}
            </div>
            {dEdit && (
              <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                주요일정·지시/요청사항 카드(우측)도 함께 편집 상태입니다 — 저장은 여기서 한 번에.
              </div>
            )}
            {([
              ['제·개정일자', 'rev'], ['문서번호', 'doc_no'], ['개정번호', 'rev_no'],
              ['주관부서', 'dept'], ['승인권자', 'approver'],
            ] as const).map(([label, key]) => (
              <div className="kv" key={key}>
                <b>{label}</b>
                {dEdit
                  ? <input className="input" style={{ width: 190, padding: '3px 9px', fontSize: 12 }}
                      value={dDraft.ms[key]} onChange={(e) => patchMs({ [key]: e.target.value })} />
                  : <span>{dView.ms[key]}</span>}
              </div>
            ))}
          </div>
        </div>
      </main>

      <aside className="right">
        <div className="rhead rv"><h3>주요 업무 진행</h3></div>
        <div className="mydev rv" style={{ animationDelay: '.05s' }}>
          {MODS.map((m) => {
            const pct = totalSchools ? Math.round((m.done / totalSchools) * 100) : 0
            return (
              <div className={'mc ' + m.c} key={m.name} onClick={() => nav(m.to)}>
                <div className="mt"><div className="ic"><m.Icon size={21} strokeWidth={1.9} /></div><span className="pc">{pct}%</span></div>
                <div className="nm">{m.name}</div>
                <div className="sub">{m.done} / {totalSchools} 교</div>
                <div className="pbar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })}
          <div className="mc c" onClick={() => nav('/education')}>
            <div className="mt"><div className="ic"><Activity size={21} strokeWidth={1.9} /></div><span className="pc">{eduAvg ?? '—'}{eduAvg != null ? '%' : ''}</span></div>
            <div className="nm">교육 진도율</div>
            <div className="sub">평균 (학교 {eduVals.length}개 데이터)</div>
            <div className="pbar"><i style={{ width: `${eduAvg ?? 0}%` }} /></div>
          </div>
        </div>

        <div className="rhead rv" style={{ marginTop: 26 }}><h3>데이터 안내</h3></div>
        <div className="card rv" style={{ padding: '18px 20px', animationDelay: '.05s' }}>
          <div className="row" style={{ gap: 9, marginBottom: 10 }}>
            <Info size={18} strokeWidth={2} style={{ color: 'var(--violet)' }} />
            <b style={{ fontSize: 13.5 }}>현장 → 본사 데이터 흐름</b>
          </div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            안전점검·근골격계 등 현장 데이터는 <b>태블릿이 세션코드로 입력</b>하면 이 대시보드에 자동 집계됩니다.
            본사에서는 학교·종사자·세션코드·세금계산서를 등록합니다.
          </p>
          <div className="kv" style={{ marginTop: 8 }}><b>로그인</b><span>{user?.login ?? '—'} · {user?.tenant ?? '—'}</span></div>
        </div>

        <div className="rhead rv" style={{ marginTop: 26 }}><h3>안전보건 주요일정</h3></div>
        <div className="card rv" style={{ ...cardBox, animationDelay: '.05s', ...editOutline }}>
          <div className="tl">
            {dEdit && dDraft.schedule.map((s, i) => (
              <div className="row" key={i} style={{ gap: 8 }}>
                <input className="input" style={{ width: 64, padding: '3px 7px', fontSize: 11.5, flex: 'none' }}
                  value={s.mo} placeholder="월"
                  onChange={(e) => setDDraft((d) => ({ ...d, schedule: d.schedule.map((x, idx) => idx === i ? { ...x, mo: e.target.value } : x) }))} />
                <input className="input" style={{ flex: 1, minWidth: 0, padding: '3px 9px', fontSize: 12 }}
                  value={s.text} placeholder="일정 내용"
                  onChange={(e) => setDDraft((d) => ({ ...d, schedule: d.schedule.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x) }))} />
                <button style={tinyBtn} title="삭제" onClick={() => removeAt('schedule', i)}>✕</button>
              </div>
            ))}
            {!dEdit && dView.schedule.map((s, i) => (
              <div className="row" key={i}><span className="mo">{s.mo}</span><span>{s.text}</span></div>
            ))}
            {!dEdit && dView.schedule.length === 0 && (
              <div className="muted" style={{ fontSize: 12.5 }}>등록된 일정이 없습니다. 관리체계 카드의 「편집」에서 입력하세요.</div>
            )}
            {dEdit && (
              <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11.5, padding: '4px 10px' }}
                onClick={() => setDDraft((d) => ({ ...d, schedule: [...d.schedule, { mo: '', text: '' }] }))}>
                ＋ 일정 추가
              </button>
            )}
          </div>
        </div>

        <div className="rhead rv" style={{ marginTop: 22 }}><h3>지시 · 요청사항</h3></div>
        <div className="card rv" style={{ ...cardBox, animationDelay: '.05s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Megaphone size={16} strokeWidth={2} style={{ color: 'var(--violet)' }} />
            <b style={{ fontSize: 13 }}>관리책임자 지시사항</b>
          </div>
          {dEdit ? (
            <div style={{ display: 'grid', gap: 6, marginBottom: 2 }}>
              {dDraft.directives.map((t, i) => (
                <div className="row" key={i} style={{ gap: 8 }}>
                  <input className="input" style={{ flex: 1, minWidth: 0, padding: '3px 9px', fontSize: 12 }}
                    value={t} placeholder="지시사항"
                    onChange={(e) => patchList('directives', i, e.target.value)} />
                  <button style={tinyBtn} title="삭제" onClick={() => removeAt('directives', i)}>✕</button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ justifySelf: 'start', fontSize: 11.5, padding: '4px 10px' }}
                onClick={() => setDDraft((d) => ({ ...d, directives: [...d.directives, ''] }))}>
                ＋ 지시사항 추가
              </button>
            </div>
          ) : (
            <ul style={{ margin: '0 0 2px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9, color: 'var(--ink-2)' }}>
              {dView.directives.map((t, i) => <li key={i}>{t}</li>)}
              {dView.directives.length === 0 && <li style={{ color: 'var(--muted)' }}>등록된 지시사항이 없습니다.</li>}
            </ul>
          )}
          <div style={{ borderTop: '1px solid var(--line)', margin: '12px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <MessageSquare size={16} strokeWidth={2} style={{ color: 'var(--violet)' }} />
            <b style={{ fontSize: 13 }}>구성원 요청사항</b>
          </div>
          {dEdit ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {dDraft.requests.map((t, i) => (
                <div className="row" key={i} style={{ gap: 8 }}>
                  <input className="input" style={{ flex: 1, minWidth: 0, padding: '3px 9px', fontSize: 12 }}
                    value={t} placeholder="요청사항"
                    onChange={(e) => patchList('requests', i, e.target.value)} />
                  <button style={tinyBtn} title="삭제" onClick={() => removeAt('requests', i)}>✕</button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ justifySelf: 'start', fontSize: 11.5, padding: '4px 10px' }}
                onClick={() => setDDraft((d) => ({ ...d, requests: [...d.requests, ''] }))}>
                ＋ 요청사항 추가
              </button>
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9, color: 'var(--ink-2)' }}>
              {dView.requests.map((t, i) => <li key={i}>{t}</li>)}
              {dView.requests.length === 0 && <li style={{ color: 'var(--muted)' }}>등록된 요청사항이 없습니다.</li>}
            </ul>
          )}
        </div>
      </aside>

      <section className="ledger-sec">
        <div className="ledger rv">
          <div className="lh">
            <h2>담당 학교 대장</h2>
            <span className="pillx ok">{totalSchools}개교</span>
            <div className="sp" />
            <FilterBar q={q} />
            <ExportButton q={q} columns={DASH_EXPORT} filename="학교대장" />
            <button className="btn btn-ghost" onClick={() => setModal('bulk')}>엑셀 업로드</button>
            <button className="btn btn-primary" onClick={() => setModal('create')}>＋ 학교 등록</button>
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <SortableTh q={q} col="name">학교 / 담당</SortableTh><SortableTh q={q} col="workers">현업종사자</SortableTh>
                  <th className="c">안전</th><th className="c">위험성</th><th className="c">이행</th>
                  <SortableTh q={q} col="edu">교육 진도율</SortableTh><th>인원 대조</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                {error && !loading && <tr><td colSpan={7}><div className="tstate">오류: {error}</div></td></tr>}
                {!loading && !error && q.view.length === 0 && <tr><td colSpan={7}><div className="tstate">{rows.length === 0 ? '학교 데이터가 없습니다. 학교를 등록하세요.' : '조건에 맞는 학교가 없습니다.'}</div></td></tr>}
                {q.view.map((r) => (
                  <tr key={r.school.id} onClick={() => nav(`/schools/${r.school.id}`)}>
                    <td>
                      <div className="stn">
                        <div className="ava" style={{ background: 'var(--grad-violet)' }}>{r.school.name.slice(0, 1)}</div>
                        <div><div className="nm">{r.school.name}</div><div className="ins">조사원 {user?.login ?? ''}</div></div>
                      </div>
                    </td>
                    <td className="ws"><b>{r.worker}</b><span>계 {r.total}명</span></td>
                    <td className="c"><span className={'pillx ' + r.safety}>{ST_LABEL[r.safety]}</span></td>
                    <td className="c"><span className={'pillx ' + r.risk}>{ST_LABEL[r.risk]}</span></td>
                    <td className="c"><span className={'pillx ' + r.comp}>{ST_LABEL[r.comp]}</span></td>
                    <td>{r.eduPct != null ? `${r.eduPct}%` : <span className="muted">데이터 없음</span>}</td>
                    <td>{r.mismatch ? <span className="pillx warn">불일치</span> : <span className="pillx ok">일치</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination q={q} />
        </div>
      </section>
      {modal === 'create' && (
        <SchoolFormModal onClose={() => setModal(null)} onSaved={() => setReload((r) => r + 1)} />
      )}
      {modal === 'bulk' && (
        <BulkUploadModal onClose={() => setModal(null)} onSaved={() => setReload((r) => r + 1)} />
      )}
    </>
  )
}
