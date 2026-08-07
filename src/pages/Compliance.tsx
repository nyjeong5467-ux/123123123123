// 이행점검 — 중대재해예방 의무이행사항 점검 조사지 중심 재구성 (0806 요청).
// 프로세스: 교육청 공문 하달(상·하반기 각 1회) → 조사지 작성(내용: 점검자) →
//           학교 행정선생님 면담 후 결과 체크 → 학교 메일로 제출 → 완료.
// 위계: 학교 목록 → 학교별 조사지 리스트(반기별) → 조사지 작성 화면.
// 저장: /ops/docs/compliance-sheets 문서(학교별×반기별) — 백엔드 계약 파일 수정 없음.
// (구 화면: 학교별 연도·반기 이력 + 항목 체크 모달 — 조사지 체계로 대체. /compliance API 데이터는 서버에 보존)
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileCheck2, Mail, Plus, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type TableQueryConfig } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import {
  ComplianceSheetForm, ComplianceSheetPrint, emptySheet, periodLabel, sheetProgress,
  type CxDoc, type CxSheet,
} from '../features/compliance/ComplianceSheet'
import '../styles/hier.css'

type School = { id: string; name: string; manager?: string; school_level?: string; email?: string }

const DOC_KEY = 'compliance-sheets'
const YEAR = String(new Date().getFullYear())
const CUR_PERIODS = [`${YEAR}_h1`, `${YEAR}_h2`]

function sheetStatus(s: CxSheet | undefined): [string, string] {
  if (!s) return ['미작성', 'todo']
  if (s.status === 'submitted') return ['제출 완료', 'ok']
  return ['작성 중', 'doing']
}

// ===== 1단계: 학교 목록 =====
type SchoolRow = School & { h1: string; h2: string }
const SCHOOL_LEVELS = ['유', '초', '중', '고', '기타']
const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [{
    key: 'level', label: '학교급',
    options: SCHOOL_LEVELS.map((v) => ({ value: v, label: v })),
    accessor: (r) => r.school_level || '기타',
  }],
  sortAccessors: { name: (r) => r.name, manager: (r) => r.manager ?? '' },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '학교', value: (r) => r.name },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '상반기', value: (r) => r.h1 },
  { header: '하반기', value: (r) => r.h2 },
]

export function Compliance() {
  const [schools, setSchools] = useState<School[]>([])
  const [doc, setDoc] = useState<CxDoc>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [sel, setSel] = useState<School | null>(null)
  const [editKey, setEditKey] = useState('') // 편집 중인 조사지 period key
  const [printKey, setPrintKey] = useState('') // 인쇄 미리보기 period key

  // 조사지 생성 모달 — 교육청 공문이 내려왔을 때 연도·반기를 골라 생성 (미리 생성하지 않음)
  const [createOpen, setCreateOpen] = useState(false)
  const [createYear, setCreateYear] = useState(YEAR)
  const [createHalf, setCreateHalf] = useState<'h1' | 'h2'>(new Date().getMonth() + 1 <= 6 ? 'h1' : 'h2')
  const [createNotice, setCreateNotice] = useState('')
  const [createErr, setCreateErr] = useState('')

  function createSheet() {
    if (!sel) return
    const key = `${createYear}_${createHalf}`
    if (doc[sel.id]?.[key]) { setCreateErr(`${periodLabel(key)} 조사지가 이미 있습니다.`); return }
    const sheet = { ...emptySheet(), notice_date: createNotice }
    setDoc((d) => ({ ...d, [sel.id]: { ...(d[sel.id] ?? {}), [key]: sheet } }))
    setCreateOpen(false)
    setCreateErr('')
    setEditKey(key)
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<{ doc: CxDoc }>(`/ops/docs/${DOC_KEY}`).catch(() => ({ doc: {} as CxDoc })),
    ]).then(([s, d]) => {
      if (!alive) return
      setSchools(Array.isArray(s) ? s : [])
      setDoc(d.doc && typeof d.doc === 'object' ? d.doc : {})
      setLoading(false)
    }).catch((e) => {
      if (!alive) return
      setError(e instanceof Error ? e.message : '오류')
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  async function saveDoc(next: CxDoc) {
    setDoc(next)
    setBusy(true)
    setMsg('')
    try {
      await api(`/ops/docs/${DOC_KEY}`, { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setMsg('저장되었습니다.')
    } catch (e) {
      setMsg(e instanceof Error ? `저장 실패: ${e.message}` : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const rows: SchoolRow[] = useMemo(
    () => schools.map((s) => ({
      ...s,
      h1: sheetStatus(doc[s.id]?.[CUR_PERIODS[0]])[0],
      h2: sheetStatus(doc[s.id]?.[CUR_PERIODS[1]])[0],
    })),
    [schools, doc],
  )
  const q = useTableQuery(rows, SCHOOL_QUERY)

  /* ── 학교별 조사지 목록: 실제 작성된 조사지만 표시 (연도 역순) — 새 조사지는 [조사지 작성]으로 생성 ── */
  const periodKeys = useMemo(() => {
    if (!sel) return [] as string[]
    return Object.keys(doc[sel.id] ?? {}).sort((a, b) => b.localeCompare(a))
  }, [sel, doc])

  const editSheet = sel && editKey ? (doc[sel.id]?.[editKey] ?? emptySheet()) : null

  function patchSheet(next: CxSheet) {
    if (!sel || !editKey) return
    setDoc((d) => ({ ...d, [sel.id]: { ...(d[sel.id] ?? {}), [editKey]: next } }))
    setMsg('')
  }

  function submitByMail(key: string) {
    if (!sel) return
    const sheet = doc[sel.id]?.[key]
    if (!sheet) return
    const subject = `[중대재해 이행점검] ${sel.name} ${periodLabel(key)} 점검 조사지 제출`
    const body = [
      `${sel.name} 담당자님께,`, '',
      `${periodLabel(key)} 중대재해예방 의무이행사항 점검 조사지를 제출합니다.`,
      '조사지 PDF를 본 메일에 첨부하였으니 확인 부탁드립니다.',
      `(면담: ${sheet.interviewee || '-'} · 면담일: ${sheet.interview_date || '-'})`, '',
      '한국산업안전협회 드림',
    ].join('\n')
    window.location.href = `mailto:${sel.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    const today = new Date()
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    void saveDoc({ ...doc, [sel.id]: { ...(doc[sel.id] ?? {}), [key]: { ...sheet, status: 'submitted', submitted_date: ymd } } })
  }

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / {sel
          ? <><a onClick={() => { setSel(null); setEditKey('') }} style={{ cursor: 'pointer' }}>이행점검</a> / <b>{sel.name}</b></>
          : <b>이행점검</b>}
      </div>
      <div className="bar">
        <h2><FileCheck2 size={20} /> 이행점검</h2>
        <div className="sp" />
        <span className="pillx doing" style={{ whiteSpace: 'normal' }}>
          중대재해예방 의무이행사항 점검 — 교육청 공문 하달 시 반기 1회 (상·하반기)
        </span>
      </div>

      {/* ═════ 1단계: 학교 목록 ═════ */}
      {!sel && (
        <div className="ledger">
          <div className="lh">
            <h2><FileCheck2 size={18} /> 학교 목록</h2>
            <div className="sp" />
            <FilterBar q={q} />
            <ExportButton q={q} columns={SCHOOL_EXPORT} filename="이행점검_학교별" />
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <SortableTh q={q} col="name">학교</SortableTh>
                  <SortableTh q={q} col="manager">담당자</SortableTh>
                  <th className="c">{YEAR} 상반기</th>
                  <th className="c">{YEAR} 하반기</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
                {!loading && error && <tr><td colSpan={5}><div className="tstate">오류: {error}</div></td></tr>}
                {!loading && !error && q.view.map((r) => {
                  const st1 = sheetStatus(doc[r.id]?.[CUR_PERIODS[0]])
                  const st2 = sheetStatus(doc[r.id]?.[CUR_PERIODS[1]])
                  return (
                    <tr key={r.id} onClick={() => { setSel(schools.find((s) => s.id === r.id) ?? null); setEditKey('') }}>
                      <td><b>{r.name}</b></td>
                      <td>{r.manager || '—'}</td>
                      <td className="c"><span className={'pillx ' + st1[1]}>{st1[0]}</span></td>
                      <td className="c"><span className={'pillx ' + st2[1]}>{st2[0]}</span></td>
                      <td className="c"><span className="chev"><ChevronRight size={15} /></span></td>
                    </tr>
                  )
                })}
                {!loading && !error && q.view.length === 0 && (
                  <tr><td colSpan={5}><div className="tstate">조건에 맞는 학교가 없습니다.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination q={q} />
        </div>
      )}

      {/* ═════ 2단계: 학교별 조사지 리스트 ═════ */}
      {sel && !editKey && (
        <>
          <div className="rkh-schoolhead">
            <button className="rkh-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="rkh-schoolname">{sel.name}</span>
            <span className="rkh-schoolmgr">담당자 {sel.manager || '—'}</span>
            {/* 위험성평가와 동일한 위치(학교 헤더 우측) — 리스트 위 상단 버튼 */}
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-primary" onClick={() => { setCreateErr(''); setCreateOpen(true) }}>
                <Plus size={14} /> 조사지 작성
              </button>
            </div>
          </div>
          <div className="ledger">
            <div className="lh">
              <h2><FileCheck2 size={18} /> 점검 조사지 리스트</h2>
              <div className="sp" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>반기 1회 · 작성 → 행정선생님 면담 → 학교 메일 제출</span>
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>조사지</th>
                    <th>공문 접수일</th>
                    <th>면담</th>
                    <th className="c">결과 기입</th>
                    <th className="c">상태</th>
                    <th>제출일</th>
                    <th className="c">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {periodKeys.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">
                      작성된 조사지가 없습니다 — 교육청 공문이 내려오면 "조사지 작성"으로 시작하세요.
                    </div></td></tr>
                  )}
                  {periodKeys.map((key) => {
                    const sheet = doc[sel.id]?.[key]
                    const st = sheetStatus(sheet)
                    const prog = sheet ? sheetProgress(sheet) : null
                    return (
                      <tr key={key} onClick={() => setEditKey(key)} style={{ cursor: 'pointer' }}>
                        <td><b>{periodLabel(key)} 중대재해예방 의무이행사항 점검 조사지</b></td>
                        <td>{sheet?.notice_date || '—'}</td>
                        <td>{sheet?.interview_date ? `${sheet.interviewee || ''} · ${sheet.interview_date}` : '—'}</td>
                        <td className="c">{prog ? `${prog.done}/${prog.total}` : '—'}</td>
                        <td className="c"><span className={'pillx ' + st[1]}>{st[0]}</span></td>
                        <td>{sheet?.submitted_date || '—'}</td>
                        <td className="c" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditKey(key)}>
                              {sheet ? '이어서 작성' : '작성'}
                            </button>
                            {sheet && (
                              <button className="btn" style={{ fontSize: 12 }} onClick={() => setPrintKey(key)}>
                                <Printer size={13} /> 인쇄
                              </button>
                            )}
                            {sheet && sheet.status !== 'submitted' && (
                              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => submitByMail(key)}>
                                <Mail size={13} /> 메일 제출
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0 24px 14px', fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
              결과 컬럼은 종사자가 아닌 학교 행정선생님과 면담 후 작성합니다. 제출 시 조사지 PDF(인쇄 → PDF 저장)를 학교 메일에 첨부하세요.
            </div>
          </div>
        </>
      )}

      {/* ═════ 3단계: 조사지 작성 ═════ */}
      {sel && editKey && editSheet && (
        <>
          <div className="rkh-schoolhead">
            <button className="rkh-back" onClick={() => setEditKey('')}><ArrowLeft size={14} /> 조사지 리스트</button>
            <span className="rkh-schoolname">{sel.name}</span>
            <span className="rkh-schoolmgr">{periodLabel(editKey)} 점검 조사지</span>
            {editSheet.status === 'submitted' && <span className="pillx ok" style={{ marginLeft: 8 }}>제출 완료 · {editSheet.submitted_date}</span>}
          </div>
          <div className="ledger">
            <div style={{ padding: '16px 24px 20px' }}>
              <ComplianceSheetForm sheet={editSheet} onChange={patchSheet} />
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void saveDoc(doc)} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
                <button className="btn" onClick={() => setPrintKey(editKey)}><Printer size={14} /> 인쇄 / PDF</button>
                {editSheet.status !== 'submitted' ? (
                  <button className="btn" style={{ background: 'var(--ok-soft)', color: 'var(--ok-ink)', fontWeight: 800 }} onClick={() => submitByMail(editKey)}>
                    <Mail size={14} /> 학교 메일로 제출
                  </button>
                ) : (
                  <button className="btn" onClick={() => patchSheet({ ...editSheet, status: 'draft', submitted_date: '' })}>제출 완료 해제</button>
                )}
                {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('저장 실패') ? 'var(--red-ink)' : 'var(--ok-ink)', fontWeight: 700 }}>{msg}</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 조사지 생성 모달 */}
      {createOpen && sel && (
        <Modal
          title={`조사지 작성 · ${sel.name}`}
          onClose={() => setCreateOpen(false)}
          footer={(
            <>
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>취소</button>
              <button className="btn btn-primary" onClick={createSheet}>생성</button>
            </>
          )}
        >
          {createErr && <div className="login-err">{createErr}</div>}
          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>
            교육청 공문이 하달된 반기의 조사지를 생성합니다. (연도가 바뀌면 해당 연도를 선택해 새로 생성 — 지난 조사지는 리스트에 이력으로 남습니다)
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field"><span>연도</span>
              <input className="input" style={{ width: 110 }} value={createYear} onChange={(e) => setCreateYear(e.target.value)} /></label>
            <label className="field"><span>반기</span>
              <select className="select" value={createHalf} onChange={(e) => setCreateHalf(e.target.value as 'h1' | 'h2')}>
                <option value="h1">상반기</option>
                <option value="h2">하반기</option>
              </select></label>
            <label className="field"><span>교육청 공문 접수일</span>
              <input className="input" type="date" value={createNotice} onChange={(e) => setCreateNotice(e.target.value)} /></label>
          </div>
        </Modal>
      )}

      {/* 인쇄 미리보기 */}
      {sel && printKey && doc[sel.id]?.[printKey] && (
        <ComplianceSheetPrint
          schoolName={sel.name}
          periodKey={printKey}
          sheet={doc[sel.id][printKey]}
          onClose={() => setPrintKey('')}
        />
      )}
    </div>
  )
}
