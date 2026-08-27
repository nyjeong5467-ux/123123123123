// 직원 이력 — 관리자 전용: 작성자별 5대 업무 통합 이력 열람(읽기 전용).
// 좌: /history/authors 목록(이름·소속·업무별 건수). 우: 선택 작성자 /history 테이블.
// ?author= 쿼리로 딥링크(계정·권한 탭 "이력" 버튼과 연동). 행 클릭 → 학교 상세.
// created_by가 없는 과거 기록은 '작성자 미상' 그룹(맨 아래)으로 묶인다.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ScrollText, UserRound } from 'lucide-react'
import { api } from '../../lib/api'

type Author = {
  author_id: string
  name: string
  affiliation: string
  counts: Record<string, number>
  total: number
  last_activity: string
}
type HistRow = {
  module: string
  record_id: string
  school_id: string
  school_name: string
  date: string
  status: string
  title: string
}

const MODULE_LABEL: Record<string, string> = {
  inspection: '안전점검', risk: '위험성평가', musculo: '근골격계',
  education: '교육', compliance: '이행점검',
}
const MODULE_PILL: Record<string, string> = {
  inspection: 'ok', risk: 'warn', musculo: 'doing', education: 'na', compliance: 'late',
}
const STATUS_LABEL: Record<string, string> = {
  draft: '작성 중', signed: '서명 완료', submitted: '제출 완료',
}
const UNKNOWN = '__unknown__'

export default function ConsoleStaffHistory() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const [authors, setAuthors] = useState<Author[]>([])
  const [rows, setRows] = useState<HistRow[]>([])
  const [moduleFilter, setModuleFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = sp.get('author') || ''

  useEffect(() => {
    api<Author[]>('/history/authors')
      .then((a) => { setAuthors(a); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : '조회 실패'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!selected) { setRows([]); return }
    const q = new URLSearchParams({ author_id: selected })
    if (moduleFilter) q.set('module', moduleFilter)
    if (from) q.set('date_from', from)
    if (to) q.set('date_to', to)
    setRowsLoading(true)
    api<HistRow[]>(`/history?${q.toString()}`)
      .then((r) => { setRows(r); setRowsLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : '조회 실패'); setRowsLoading(false) })
  }, [selected, moduleFilter, from, to])

  function pick(id: string) {
    setSp({ tab: 'history', author: id })
  }

  const cur = authors.find((a) => a.author_id === selected)

  return (
    <div className="ledger">
      <div className="lh">
        <h2><ScrollText size={18} /> 직원 이력</h2>
        <div className="sp" />
        <span className="muted" style={{ fontSize: 12.5 }}>
          작성자별 5대 업무 기록 열람(읽기 전용) · 작성자 기록이 없는 과거 자료는 &lsquo;작성자 미상&rsquo;
        </span>
      </div>

      {loading && <div className="tstate">불러오는 중…</div>}
      {!loading && error && <div className="tstate">오류: {error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, alignItems: 'start' }}>
          {/* 좌: 작성자 목록 */}
          <div className="twrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>직원</th><th style={{ width: 64 }}>기록</th></tr></thead>
              <tbody>
                {authors.map((a) => (
                  <tr key={a.author_id}
                    onClick={() => pick(a.author_id)}
                    style={{
                      cursor: 'pointer',
                      background: a.author_id === selected ? 'var(--violet-soft, rgba(124,92,251,.08))' : undefined,
                    }}>
                    <td>
                      <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserRound size={13} /> {a.name}
                      </b>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {a.author_id === UNKNOWN
                          ? '작성자 정보 없는 과거 기록'
                          : [a.author_id, a.affiliation].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td><span className={'pillx ' + (a.total > 0 ? 'doing' : 'na')}>{a.total}건</span></td>
                  </tr>
                ))}
                {authors.length === 0 && (
                  <tr><td colSpan={2}><div className="tstate">직원이 없습니다.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 우: 선택 작성자 이력 */}
          <div>
            {!selected && <div className="tstate">왼쪽에서 직원을 선택하면 이력이 표시됩니다.</div>}
            {selected && (
              <>
                <div className="lh" style={{ marginBottom: 8 }}>
                  <h2 style={{ fontSize: 15 }}>{cur?.name || selected}</h2>
                  {cur && Object.entries(cur.counts).map(([k, v]) => (
                    v > 0 && <span key={k} className={'pillx ' + (MODULE_PILL[k] || 'na')}>{MODULE_LABEL[k] || k} {v}</span>
                  ))}
                  <div className="sp" />
                  <select className="select" style={{ width: 130, padding: '4px 8px' }}
                    value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                    <option value="">전체 업무</option>
                    {Object.entries(MODULE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input className="input" type="date" style={{ width: 140 }} value={from}
                    onChange={(e) => setFrom(e.target.value)} title="시작일" />
                  <input className="input" type="date" style={{ width: 140 }} value={to}
                    onChange={(e) => setTo(e.target.value)} title="종료일" />
                </div>
                <div className="twrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
                  <table className="tbl">
                    <thead>
                      <tr><th style={{ width: 110 }}>날짜</th><th style={{ width: 120 }}>업무</th><th>학교</th><th style={{ width: 100 }}>상태</th></tr>
                    </thead>
                    <tbody>
                      {rowsLoading && <tr><td colSpan={4}><div className="tstate">불러오는 중…</div></td></tr>}
                      {!rowsLoading && rows.map((r) => (
                        <tr key={`${r.module}-${r.record_id}`}
                          onClick={() => nav(`/schools/${r.school_id}`)}
                          style={{ cursor: 'pointer' }}
                          title="학교 상세로 이동">
                          <td>{r.date ? r.date.slice(0, 10) : '—'}</td>
                          <td><span className={'pillx ' + (MODULE_PILL[r.module] || 'na')}>{r.title || MODULE_LABEL[r.module] || r.module}</span></td>
                          <td><b>{r.school_name}</b></td>
                          <td>{r.status ? (STATUS_LABEL[r.status] || r.status) : '—'}</td>
                        </tr>
                      ))}
                      {!rowsLoading && rows.length === 0 && (
                        <tr><td colSpan={4}><div className="tstate">조건에 맞는 기록이 없습니다.</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="console-note">
        열람 전용 화면입니다. 기록 수정·삭제는 각 업무 화면에서만 가능합니다.
        작성자 정보는 이 기능 도입 이후 생성된 기록부터 저장됩니다.
      </div>
    </div>
  )
}
