import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Footprints, Megaphone, MessageSquare, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useTableQuery, type FilterDef } from '../../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../../components/table'

// ── 경영 현황 탭 — 회사 관리자용 경영 지표·이력·편집형 경영 콘텐츠만.
//    (학교별 업무 진행률·학교 대장은 홈/학교 탭 담당 — 중복 제거. 집계 API 1회씩만 호출.)

// 대시보드 편집 콘텐츠(관리체계·주요일정·지시/요청) — /ops/docs/dashboard-content 서버 저장.
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

type School = { id: string; name: string }
type Invoice = { id: string; amount: number; status: string }
type Complaint = { id: string; school_id: string; date: string; content: string; status: string }
type Visit = { id: string; school_id: string; date: string; visitor: string; purpose: string }
type OpsDash = { school_count?: number; visit_count?: number; complaint_count?: number }

const STATUS_LABEL: Record<string, string> = { open: '접수', doing: '처리중', resolved: '완료', closed: '종결' }
const STATUS_PILL: Record<string, string> = { open: 'warn', doing: 'doing', resolved: 'ok', closed: 'todo' }

const CMP_FILTERS: FilterDef<Complaint>[] = [
  {
    key: 'status',
    label: '상태',
    options: [
      { value: 'open', label: '접수' },
      { value: 'doing', label: '처리중' },
      { value: 'resolved', label: '완료' },
      { value: 'closed', label: '종결' },
    ],
    accessor: (r) => r.status,
  },
]
const CMP_SORTS = { date: (r: Complaint) => r.date, status: (r: Complaint) => r.status }

function fmtKRW(n: number): string {
  return n >= 100000000 ? `${(n / 100000000).toFixed(1)}억원` : `${Math.round(n / 10000).toLocaleString()}만원`
}

export default function ConsoleOverview() {
  const [schools, setSchools] = useState<School[]>([])
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [opsDash, setOpsDash] = useState<OpsDash>({})
  const [accidentCount, setAccidentCount] = useState<number | null>(null)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)

  // 편집형 경영 콘텐츠 — 인플레이스 편집(기존 대시보드 UX 유지)
  const [dContent, setDContent] = useState<DashContent>(DASH_DEFAULT)
  const [dEdit, setDEdit] = useState(false)
  const [dDraft, setDDraft] = useState<DashContent>(DASH_DEFAULT)
  const [dBusy, setDBusy] = useState(false)
  const [dErr, setDErr] = useState('')
  const dView = dEdit ? dDraft : dContent

  // 불만/방문 등록 폼(종합관리 통합)
  const [fSid, setFSid] = useState('')
  const [fDate, setFDate] = useState('')
  const [fContent, setFContent] = useState('')
  const [fBusy, setFBusy] = useState(false)
  const [fErr, setFErr] = useState('')
  const [vSid, setVSid] = useState('')
  const [vDate, setVDate] = useState('')
  const [vVisitor, setVVisitor] = useState('')
  const [vPurpose, setVPurpose] = useState('')
  const [vBusy, setVBusy] = useState(false)
  const [vErr, setVErr] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<Invoice[]>('/invoices').catch(() => null),
      api<OpsDash>('/ops/dashboard').catch(() => ({}) as OpsDash),
      api<unknown[]>('/accidents').catch(() => null),
      api<unknown[]>('/users').catch(() => null),
      api<Complaint[]>('/complaints').catch(() => [] as Complaint[]),
      api<Visit[]>('/visits').catch(() => [] as Visit[]),
      api<{ doc: Partial<DashContent> }>('/ops/docs/dashboard-content').catch(() => ({ doc: {} as Partial<DashContent> })),
    ]).then(([s, inv, od, acc, usr, cmp, vis, doc]) => {
      if (!alive) return
      const list = Array.isArray(s) ? s : []
      setSchools(list)
      if (list.length) { setFSid(list[0].id); setVSid(list[0].id) }
      setInvoices(Array.isArray(inv) ? inv : null)
      setOpsDash(od && typeof od === 'object' ? od : {})
      setAccidentCount(Array.isArray(acc) ? acc.length : null)
      setUserCount(Array.isArray(usr) ? usr.length : null)
      setComplaints(Array.isArray(cmp) ? cmp : [])
      setVisits(Array.isArray(vis) ? vis : [])
      const d = doc?.doc || {}
      if (Object.keys(d).length) setDContent({ ...DASH_DEFAULT, ...d, ms: { ...DASH_DEFAULT.ms, ...(d.ms || {}) } })
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // ── 편집 콘텐츠 저장 ──
  function startEdit() { setDDraft(structuredClone(dContent)); setDErr(''); setDEdit(true) }
  function patchMs(patch: Partial<DashContent['ms']>) { setDDraft((d) => ({ ...d, ms: { ...d.ms, ...patch } })) }
  function patchList(key: 'directives' | 'requests', i: number, v: string) {
    setDDraft((d) => ({ ...d, [key]: d[key].map((x, idx) => (idx === i ? v : x)) }))
  }
  function removeAt(key: 'directives' | 'requests' | 'schedule', i: number) {
    setDDraft((d) => ({ ...d, [key]: (d[key] as unknown[]).filter((_, idx) => idx !== i) } as DashContent))
  }
  async function saveEdit() {
    setDBusy(true)
    setDErr('')
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

  // ── 불만/방문 등록(종합관리 통합) ──
  async function submitComplaint() {
    if (!fSid || !fDate || !fContent.trim()) { setFErr('학교·날짜·내용을 모두 입력하세요.'); return }
    setFBusy(true)
    setFErr('')
    try {
      await api('/complaints', { method: 'POST', body: JSON.stringify({ school_id: fSid, date: fDate, content: fContent.trim() }) })
      setFContent('')
      setComplaints(await api<Complaint[]>('/complaints'))
    } catch (e) {
      setFErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setFBusy(false)
    }
  }
  async function submitVisit() {
    if (!vSid || !vDate || !vVisitor.trim()) { setVErr('학교·날짜·방문자를 모두 입력하세요.'); return }
    setVBusy(true)
    setVErr('')
    try {
      await api('/visits', { method: 'POST', body: JSON.stringify({ school_id: vSid, date: vDate, visitor: vVisitor.trim(), purpose: vPurpose.trim() }) })
      setVVisitor('')
      setVPurpose('')
      setVisits(await api<Visit[]>('/visits'))
    } catch (e) {
      setVErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setVBusy(false)
    }
  }

  const q = useTableQuery(complaints, {
    searchFields: [(r) => schools.find((s) => s.id === r.school_id)?.name ?? '', (r) => r.content],
    filters: CMP_FILTERS,
    sortAccessors: CMP_SORTS,
    searchPlaceholder: '학교·내용',
    dateField: (r) => r.date,
    dateLabel: '날짜',
  })
  const cmpExport: ExportColumn<Complaint>[] = [
    { header: '날짜', value: (r) => r.date },
    { header: '학교', value: (r) => schools.find((s) => s.id === r.school_id)?.name ?? r.school_id },
    { header: '내용', value: (r) => r.content },
    { header: '상태', value: (r) => STATUS_LABEL[r.status] || r.status },
  ]
  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name || id

  // ── KPI 집계 ──
  const issued = invoices?.filter((i) => i.status === 'issued') ?? []
  const failedCnt = invoices?.filter((i) => i.status === 'failed').length ?? 0
  const issuedSum = issued.reduce((a, b) => a + (b.amount || 0), 0)

  const cardBox: CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-soft)', padding: '18px 22px',
  }
  const editOutline = dEdit ? { outline: '2px dashed var(--violet)', outlineOffset: -2 } : undefined
  const tinyBtn: CSSProperties = {
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)',
    borderRadius: 7, width: 22, height: 22, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
  }

  if (loading) return <div className="tstate">불러오는 중…</div>

  return (
    <>
      {/* ── 경영 KPI — 6장 균등 그리드(랩핑 시 폭 불일치 방지, console.css) ── */}
      <div className="kpis console-kpis" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="l">계약 학교</div>
          <div className="v">{schools.length}<small> 개교</small></div>
          <div className="d">{String(opsDash.school_count ?? schools.length)}개교 관리 중</div>
        </div>
        <div className="kpi">
          <div className="l">세금계산서 발행액</div>
          <div className="v">{invoices ? fmtKRW(issuedSum) : '—'}</div>
          <div className="d">발행 {issued.length}건{invoices === null ? ' · 조회 권한 필요' : ''}</div>
        </div>
        <div className="kpi">
          <div className="l">발행 실패</div>
          <div className="v" style={failedCnt > 0 ? { color: 'var(--red-ink)' } : undefined}>{invoices ? failedCnt : '—'}<small> 건</small></div>
          <div className="d">{failedCnt > 0 ? '청구·정산 탭에서 재발행하세요' : '이상 없음'}</div>
        </div>
        <div className="kpi">
          <div className="l">불만 접수</div>
          <div className="v">{opsDash.complaint_count ?? complaints.length}<small> 건</small></div>
          <div className="d">임원 방문 {opsDash.visit_count ?? visits.length}건</div>
        </div>
        <div className="kpi">
          <div className="l">산재 이력</div>
          <div className="v">{accidentCount ?? '—'}<small> 건</small></div>
          <div className="d">산업재해 탭 연동</div>
        </div>
        <div className="kpi">
          <div className="l">시스템 계정</div>
          <div className="v">{userCount ?? '—'}<small> 개</small></div>
          <div className="d">계정·권한 탭에서 관리</div>
        </div>
      </div>

      <div className="console-grid">
        {/* ── 좌: 불만/방문 이력(종합관리 통합) ── */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ledger">
            <div className="lh">
              <h2><ShieldAlert size={18} /> 불만 이력</h2>
              <div className="sp" />
              <FilterBar q={q} />
              <ExportButton q={q} columns={cmpExport} filename="불만이력" />
              <span className="pillx warn">관리자 전용</span>
            </div>
            <div className="card-body" style={{ padding: '18px 26px', borderBottom: '1px solid var(--line)' }}>
              <div className="formrow">
                <label className="field">
                  <span>학교</span>
                  <select className="select" value={fSid} onChange={(e) => setFSid(e.target.value)}>
                    {schools.length === 0 && <option value="">학교 없음</option>}
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>날짜</span>
                  <input className="input" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 200 }}>
                  <span>내용</span>
                  <input className="input" type="text" placeholder="불만 내용" value={fContent} onChange={(e) => setFContent(e.target.value)} />
                </label>
                <button className="btn btn-primary" onClick={() => void submitComplaint()} disabled={fBusy || schools.length === 0}>
                  <Plus size={15} /> 등록
                </button>
              </div>
              {fErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{fErr}</div>}
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead><tr><SortableTh q={q} col="date">날짜</SortableTh><th>학교</th><th>내용</th><SortableTh q={q} col="status" className="c">상태</SortableTh></tr></thead>
                <tbody>
                  {q.view.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.date}</b></td>
                      <td>{schoolName(c.school_id)}</td>
                      <td>{c.content}</td>
                      <td className="c"><span className={'pillx ' + (STATUS_PILL[c.status] || 'todo')}>{STATUS_LABEL[c.status] || c.status}</span></td>
                    </tr>
                  ))}
                  {q.view.length === 0 && <tr><td colSpan={4}><div className="tstate">{complaints.length === 0 ? '등록된 불만 이력이 없습니다.' : '조건에 맞는 불만 이력이 없습니다.'}</div></td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination q={q} />
          </div>

          <div className="ledger">
            <div className="lh">
              <h2><Footprints size={18} /> 임원 방문 이력</h2>
              <div className="sp" />
              <span className="pillx warn">관리자 전용</span>
            </div>
            <div className="card-body" style={{ padding: '18px 26px', borderBottom: '1px solid var(--line)' }}>
              <div className="formrow">
                <label className="field">
                  <span>학교</span>
                  <select className="select" value={vSid} onChange={(e) => setVSid(e.target.value)}>
                    {schools.length === 0 && <option value="">학교 없음</option>}
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>날짜</span>
                  <input className="input" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
                </label>
                <label className="field">
                  <span>방문자</span>
                  <input className="input" type="text" placeholder="직책/이름" value={vVisitor} onChange={(e) => setVVisitor(e.target.value)} />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 200 }}>
                  <span>목적</span>
                  <input className="input" type="text" placeholder="방문 목적" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
                </label>
                <button className="btn btn-primary" onClick={() => void submitVisit()} disabled={vBusy || schools.length === 0}>
                  <Plus size={15} /> 방문 등록
                </button>
              </div>
              {vErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{vErr}</div>}
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead><tr><th>날짜</th><th>학교</th><th>방문자</th><th>목적</th></tr></thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <td><b>{v.date}</b></td>
                      <td>{schoolName(v.school_id)}</td>
                      <td>{v.visitor}</td>
                      <td>{v.purpose}</td>
                    </tr>
                  ))}
                  {visits.length === 0 && <tr><td colSpan={4}><div className="tstate">등록된 임원 방문 이력이 없습니다.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="console-note">
            학교별 업무 진행·대장은 <Link to="/schools">학교</Link> 탭에서, 업무 현황 요약은 <Link to="/">홈</Link>에서 확인하세요.
          </div>
        </div>

        {/* ── 우: 편집형 경영 콘텐츠(관리체계·주요일정·지시/요청) ── */}
        <div className="console-side">
          <div style={{ ...cardBox, ...editOutline }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <ShieldCheck size={18} strokeWidth={1.9} style={{ color: 'var(--violet)' }} />
              <b style={{ fontSize: 14 }}>안전보건관리체계 구축현황</b>
              <div style={{ flex: 1 }} />
              {dEdit ? (
                <>
                  {dErr && <span style={{ color: 'var(--red-ink)', fontSize: 11.5, fontWeight: 600 }}>{dErr}</span>}
                  <button className="btn btn-ghost" disabled={dBusy} onClick={() => setDEdit(false)}>취소</button>
                  <button className="btn btn-primary" disabled={dBusy} onClick={() => void saveEdit()}>
                    {dBusy ? '저장 중…' : '저장'}
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={startEdit}>편집</button>
              )}
            </div>
            {dEdit && (
              <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                주요일정·지시/요청사항 카드도 함께 편집 상태입니다 — 저장은 여기서 한 번에.
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

          <div style={{ ...cardBox, ...editOutline }}>
            <b style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>안전보건 주요일정</b>
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
                <div className="muted" style={{ fontSize: 12.5 }}>등록된 일정이 없습니다. 「편집」에서 입력하세요.</div>
              )}
              {dEdit && (
                <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11.5, padding: '4px 10px' }}
                  onClick={() => setDDraft((d) => ({ ...d, schedule: [...d.schedule, { mo: '', text: '' }] }))}>
                  ＋ 일정 추가
                </button>
              )}
            </div>
          </div>

          <div style={{ ...cardBox, ...editOutline }}>
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
        </div>
      </div>
    </>
  )
}
