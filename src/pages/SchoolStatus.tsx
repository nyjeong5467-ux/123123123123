import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import { SchoolFormModal } from '../components/SchoolFormModal'

type School = {
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

const LEVELS = ['유', '초', '중', '고', '기타']
const LEVEL_ORDER: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }

const SCH_FILTERS: FilterDef<School>[] = [
  {
    key: 'level',
    label: '학교급',
    options: LEVELS.map((l) => ({ value: l, label: l })),
    accessor: (r) => r.school_level ?? '',
  },
]
const SCH_SORTS = {
  level: (r: School) => LEVEL_ORDER[r.school_level ?? ''] ?? 99,
  name: (r: School) => r.name,
  principal: (r: School) => r.principal ?? '',
  manager: (r: School) => r.manager ?? '',
}
const SCH_EXPORT: ExportColumn<School>[] = [
  { header: '구분', value: (r) => r.school_level ?? '' },
  { header: '학교(기관)명', value: (r) => r.name },
  { header: '학교(기관)장', value: (r) => r.principal ?? '' },
  { header: '관리감독자', value: (r) => r.supervisor ?? '' },
  { header: '담당자', value: (r) => r.manager ?? '' },
  { header: '안전점검기관', value: (r) => r.inspection_agency ?? '' },
  { header: '교육생수', value: (r) => r.education_count ?? '' },
]

export function SchoolStatus() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<'list' | 'register'>('list')
  const [editing, setEditing] = useState<School | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    api<School[]>('/schools')
      .then((d) => { if (alive) { setSchools(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [reload])

  const q = useTableQuery(schools, {
    searchFields: [(r) => r.name, (r) => r.manager ?? '', (r) => r.principal ?? ''],
    filters: SCH_FILTERS,
    sortAccessors: SCH_SORTS,
    searchPlaceholder: '학교명·담당자',
  })

  // 등록 폼 상태
  const [rName, setRName] = useState('')
  const [rLevel, setRLevel] = useState('')
  const [rPrincipal, setRPrincipal] = useState('')
  const [rSupervisor, setRSupervisor] = useState('')
  const [rManager, setRManager] = useState('')
  const [rAgency, setRAgency] = useState('')
  const [rEdu, setREdu] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  function resetForm() {
    setRName(''); setRLevel(''); setRPrincipal(''); setRSupervisor('')
    setRManager(''); setRAgency(''); setREdu(''); setFormErr('')
  }

  async function register() {
    if (!rName.trim()) { setFormErr('학교(기관)명을 입력하세요.'); return }
    setSaving(true)
    setFormErr('')
    try {
      await api('/schools', {
        method: 'POST',
        body: JSON.stringify({
          name: rName.trim(), school_level: rLevel, principal: rPrincipal,
          supervisor: rSupervisor, manager: rManager, inspection_agency: rAgency,
          education_count: rEdu === '' ? null : Number(rEdu),
        }),
      })
      resetForm()
      setReload((n) => n + 1)
      setTab('list')
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : '등록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>학교(기관) 현황</b></div>
      <div className="bar">
        <h2><Building2 size={20} /> 학교(기관) 현황</h2>
        <div className="sp" />
        <div className="tabs">
          <button className={'tab' + (tab === 'list' ? ' active' : '')} onClick={() => setTab('list')}>
            현황<span className="n">{schools.length}</span>
          </button>
          <button className={'tab' + (tab === 'register' ? ' active' : '')} onClick={() => setTab('register')}>
            등록
          </button>
        </div>
      </div>

      {tab === 'list' && (
        <div className="ledger">
          <div className="lh">
            <h2><Building2 size={18} /> 기관 목록</h2>
            <div className="sp" />
            <FilterBar q={q} />
            <ExportButton q={q} columns={SCH_EXPORT} filename="학교기관현황" />
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>No</th>
                  <SortableTh q={q} col="level">구분</SortableTh>
                  <SortableTh q={q} col="name">학교(기관)명</SortableTh>
                  <SortableTh q={q} col="principal">학교(기관)장</SortableTh>
                  <th>관리감독자</th>
                  <SortableTh q={q} col="manager">담당자</SortableTh>
                  <th>안전점검기관</th>
                </tr>
              </thead>
              <tbody>
                {q.view.map((s, i) => (
                  <tr key={s.id} onClick={() => setEditing(s)}>
                    <td>{(q.page - 1) * q.pageSize + i + 1}</td>
                    <td>{s.school_level ? <span className="pillx doing">{s.school_level}</span> : '—'}</td>
                    <td><b>{s.name}</b></td>
                    <td>{s.principal || '—'}</td>
                    <td>{s.supervisor || '—'}</td>
                    <td>{s.manager || '—'}</td>
                    <td>{s.inspection_agency || '—'}</td>
                  </tr>
                ))}
                {!loading && !error && q.view.length === 0 && (
                  <tr><td colSpan={7}><div className="tstate">{schools.length === 0 ? "등록된 학교(기관)가 없습니다. '등록' 탭에서 추가하세요." : '조건에 맞는 기관이 없습니다.'}</div></td></tr>
                )}
                {loading && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                {error && <tr><td colSpan={7}><div className="tstate">오류: {error}</div></td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination q={q} />
        </div>
      )}

      {tab === 'register' && (
        <div className="ledger">
          <div className="lh"><h2><Plus size={18} /> 신규 학교(기관) 등록</h2></div>
          <div className="card-body" style={{ padding: '22px 26px' }}>
            {formErr && <div className="login-err" style={{ marginBottom: 14 }}>{formErr}</div>}
            <div className="formrow">
              <label className="field" style={{ minWidth: 220, flex: 1 }}>
                <span>학교(기관)명 *</span>
                <input className="input" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="학교(기관)명" />
              </label>
              <label className="field">
                <span>학교급(구분)</span>
                <select className="select" value={rLevel} onChange={(e) => setRLevel(e.target.value)}>
                  <option value="">선택</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="field">
                <span>교육생 수</span>
                <input className="input" type="number" value={rEdu} onChange={(e) => setREdu(e.target.value)} placeholder="0" />
              </label>
            </div>
            <div className="formrow" style={{ marginTop: 14 }}>
              <label className="field"><span>학교(기관)장</span><input className="input" value={rPrincipal} onChange={(e) => setRPrincipal(e.target.value)} placeholder="학교(기관)장" /></label>
              <label className="field"><span>관리감독자</span><input className="input" value={rSupervisor} onChange={(e) => setRSupervisor(e.target.value)} placeholder="관리감독자" /></label>
              <label className="field"><span>담당자</span><input className="input" value={rManager} onChange={(e) => setRManager(e.target.value)} placeholder="담당자" /></label>
              <label className="field"><span>안전점검기관</span><input className="input" value={rAgency} onChange={(e) => setRAgency(e.target.value)} placeholder="안전점검기관명" /></label>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={register} disabled={saving}>{saving ? '등록 중…' : '등록'}</button>
              <button className="btn btn-ghost" onClick={resetForm} disabled={saving}>초기화</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <SchoolFormModal
          school={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setReload((n) => n + 1) }}
        />
      )}
    </div>
  )
}
