import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, Plus, Footprints } from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'

type School = { id: string; name: string; education_count: number | null }
type Complaint = { id: string; school_id: string; date: string; content: string; status: string }
type Visit = { id: string; school_id: string; date: string; visitor: string; purpose: string }

const STATUS_LABEL: Record<string, string> = {
  open: '접수', doing: '처리중', resolved: '완료', closed: '종결',
}
const STATUS_PILL: Record<string, string> = {
  open: 'warn', doing: 'doing', resolved: 'ok', closed: 'todo',
}

const OPS_FILTERS: FilterDef<Complaint>[] = [
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
const OPS_SORTS = {
  date: (r: Complaint) => r.date,
  status: (r: Complaint) => r.status,
}

export function Ops() {
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 불만 추가 폼
  const [fSid, setFSid] = useState('')
  const [fDate, setFDate] = useState('')
  const [fContent, setFContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState('')

  // 임원 방문 추가 폼
  const [vSid, setVSid] = useState('')
  const [vDate, setVDate] = useState('')
  const [vVisitor, setVVisitor] = useState('')
  const [vPurpose, setVPurpose] = useState('')
  const [vSubmitting, setVSubmitting] = useState(false)
  const [vFormErr, setVFormErr] = useState('')

  function loadComplaints() {
    return api<Complaint[]>('/complaints')
      .then((d) => setComplaints(Array.isArray(d) ? d : []))
  }

  function loadVisits() {
    return api<Visit[]>('/visits')
      .then((d) => setVisits(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api<Record<string, unknown>>('/ops/dashboard').catch(() => ({} as Record<string, unknown>)),
      api<Complaint[]>('/complaints').catch(() => [] as Complaint[]),
      api<School[]>('/schools').catch(() => [] as School[]),
      api<Visit[]>('/visits').catch(() => [] as Visit[]),
    ])
      .then(([d, c, s, v]) => {
        if (!alive) return
        setDashboard(d && typeof d === 'object' ? d : {})
        setComplaints(Array.isArray(c) ? c : [])
        setVisits(Array.isArray(v) ? v : [])
        const list = Array.isArray(s) ? s : []
        setSchools(list)
        if (list.length) { setFSid(list[0].id); setVSid(list[0].id) }
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  async function submitComplaint() {
    if (!fSid || !fDate || !fContent.trim()) { setFormErr('학교·날짜·내용을 모두 입력하세요.'); return }
    setSubmitting(true)
    setFormErr('')
    try {
      await api('/complaints', {
        method: 'POST',
        body: JSON.stringify({ school_id: fSid, date: fDate, content: fContent.trim() }),
      })
      setFContent('')
      await loadComplaints()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitVisit() {
    if (!vSid || !vDate || !vVisitor.trim()) { setVFormErr('학교·날짜·방문자를 모두 입력하세요.'); return }
    setVSubmitting(true)
    setVFormErr('')
    try {
      await api('/visits', {
        method: 'POST',
        body: JSON.stringify({ school_id: vSid, date: vDate, visitor: vVisitor.trim(), purpose: vPurpose.trim() }),
      })
      setVVisitor('')
      setVPurpose('')
      await loadVisits()
    } catch (e) {
      setVFormErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setVSubmitting(false)
    }
  }

  const q = useTableQuery(complaints, {
    searchFields: [(r) => schools.find((s) => s.id === r.school_id)?.name ?? '', (r) => r.content],
    filters: OPS_FILTERS,
    sortAccessors: OPS_SORTS,
    searchPlaceholder: '학교·내용',
    dateField: (r) => r.date,
    dateLabel: '날짜',
  })
  const opsExport: ExportColumn<Complaint>[] = [
    { header: '날짜', value: (r) => r.date },
    { header: '학교', value: (r) => schools.find((s) => s.id === r.school_id)?.name ?? r.school_id },
    { header: '내용', value: (r) => r.content },
    { header: '상태', value: (r) => STATUS_LABEL[r.status] || r.status },
  ]

  if (loading) return <div className="page"><div className="tstate">불러오는 중…</div></div>
  if (error) return <div className="page"><div className="tstate">오류: {error}</div></div>

  // 대시보드: 원시값(숫자/문자) 항목만 KPI 카드로 렌더
  const kpiEntries = Object.entries(dashboard || {}).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  )

  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name || id

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>종합관리 (경영)</b></div>
      <div className="bar">
        <h2>종합관리 (경영)</h2>
        <span className="pillx warn"><ShieldAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />관리자 전용</span>
        <div className="sp" />
      </div>

      {kpiEntries.length > 0 && (
        <div className="kpis">
          {kpiEntries.map(([k, v]) => (
            <div className="kpi" key={k}>
              <div className="l">{k}</div>
              <div className="v">{String(v)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="ledger">
        <div className="lh">
          <h2><ShieldAlert size={18} /> 불만 이력</h2>
          <div className="sp" />
          <FilterBar q={q} />
          <ExportButton q={q} columns={opsExport} filename="불만이력" />
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
            <label className="field" style={{ flex: 1, minWidth: 220 }}>
              <span>내용</span>
              <input className="input" type="text" placeholder="불만 내용" value={fContent} onChange={(e) => setFContent(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={submitComplaint} disabled={submitting || schools.length === 0}>
              <Plus size={15} /> 등록
            </button>
          </div>
          {formErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{formErr}</div>}
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
                  <td className="c">
                    <span className={'pillx ' + (STATUS_PILL[c.status] || 'todo')}>{STATUS_LABEL[c.status] || c.status}</span>
                  </td>
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
            <label className="field" style={{ flex: 1, minWidth: 220 }}>
              <span>목적</span>
              <input className="input" type="text" placeholder="방문 목적" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={submitVisit} disabled={vSubmitting || schools.length === 0}>
              <Plus size={15} /> 방문 등록
            </button>
          </div>
          {vFormErr && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{vFormErr}</div>}
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
    </div>
  )
}
