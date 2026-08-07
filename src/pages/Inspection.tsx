// 안전점검 — 학교 목록(1단계) → 학교별 월별 이력(2단계) → 상세 모달 위계.
// Risk.tsx("학교별 평가")와 동일 패턴: 학교 테이블 → 백버튼 있는 학교 컨텍스트 → 드릴다운 모달.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type TableQueryConfig } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import '../styles/hier.css'
import '../styles/inspecthier.css'

const PART_LABEL: Record<string, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}
const PART_OPTIONS: { value: string; label: string }[] = [
  { value: 'catering', label: '급식' },
  { value: 'facility', label: '시설' },
  { value: 'cleaning', label: '미화' },
  { value: 'commute', label: '통학' },
  { value: 'night_duty', label: '당직' },
]
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: '작성중', cls: 'todo' },
  signed: { label: '서명완료', cls: 'doing' },
  submitted: { label: '제출', cls: 'ok' },
}
const EDUOFFICE: Record<string, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'todo' },
  success: { label: '전송완료', cls: 'ok' },
  failed: { label: '실패', cls: 'late' },
  not_required: { label: '해당없음', cls: 'na' },
}
const RESULT_LABEL: Record<string, string> = { good: '양호', poor: '미흡', na: '해당없음' }

const LEVELS = ['유', '초', '중', '고', '기타']
const LEVEL_ORDER: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }

type InsItem = { code: string; label: string; result: string | null; remark: string; photos: string[] }
type InsSig = { signer: string; signed_at: string | null; image_ref: string }
type InsFollowUp = { id: string; item_code: string; description: string; status: string }
type Inspection = {
  id: string
  part: string
  status: string
  eduoffice_submit_status: string
  items: InsItem[]
  signatures: InsSig[]
  followups: InsFollowUp[]
  signed_at?: string | null
  submitted_at?: string | null
  created_at?: string | null // 백엔드 엔티티에 아직 없음 — 생기면 자동 수용
}
type School = { id: string; name: string; manager?: string; school_level?: string }

// 점검 일자 — 엔티티에 created_at 이 없어 제출일 → 서명일 → 서명기록 순으로 방어적으로 산출
function dateOf(r: Inspection): string {
  const d = r.submitted_at || r.signed_at || r.signatures?.[0]?.signed_at || r.created_at || ''
  return String(d).slice(0, 10)
}

// ===== 1단계: 학교 목록 (점검 요약) =====
type SchoolRow = School & {
  count: number
  draft: number
  signed: number
  submitted: number
  latest: string
}

const SCHOOL_QUERY: TableQueryConfig<SchoolRow> = {
  searchFields: [(r) => r.name, (r) => r.manager ?? ''],
  searchPlaceholder: '학교명·담당자 검색',
  filters: [
    {
      key: 'level',
      label: '학교급',
      options: LEVELS.map((l) => ({ value: l, label: l })),
      accessor: (r) => r.school_level ?? '',
    },
  ],
  sortAccessors: {
    level: (r) => LEVEL_ORDER[r.school_level ?? ''] ?? 99,
    name: (r) => r.name,
    manager: (r) => r.manager ?? '',
    count: (r) => r.count,
    latest: (r) => r.latest,
  },
}
const SCHOOL_EXPORT: ExportColumn<SchoolRow>[] = [
  { header: '학교급', value: (r) => r.school_level || '' },
  { header: '학교', value: (r) => r.name },
  { header: '담당자', value: (r) => r.manager || '' },
  { header: '점검 건수', value: (r) => r.count },
  { header: '작성중', value: (r) => r.draft },
  { header: '서명완료', value: (r) => r.signed },
  { header: '제출', value: (r) => r.submitted },
  { header: '최근 점검일', value: (r) => r.latest },
]

// ===== 2단계: 월별 그룹 (안전점검은 매월 반복 업무) =====
const UNKNOWN_MONTH = '일자 미상'
type MonthGroup = { month: string; rows: Inspection[] }

function groupByMonth(items: Inspection[]): MonthGroup[] {
  const map = new Map<string, Inspection[]>()
  for (const it of items) {
    const m = dateOf(it).slice(0, 7) || UNKNOWN_MONTH
    if (!map.has(m)) map.set(m, [])
    map.get(m)!.push(it)
  }
  const byDateDesc = (a: Inspection, b: Inspection) => dateOf(b).localeCompare(dateOf(a))
  return [...map.keys()]
    .sort((a, b) => {
      if (a === UNKNOWN_MONTH) return 1 // 일자 미상(작성중 등)은 항상 마지막
      if (b === UNKNOWN_MONTH) return -1
      return b.localeCompare(a) // 최신 월 우선
    })
    .map((month) => ({ month, rows: [...map.get(month)!].sort(byDateDesc) }))
}

function monthLabel(m: string): string {
  if (m === UNKNOWN_MONTH) return m
  const [y, mm] = m.split('-')
  return `${y}년 ${Number(mm)}월`
}

// 2단계 내보내기(월 포함 플랫 목록)
const FLAT_QUERY: TableQueryConfig<Inspection> = {}
const FLAT_EXPORT: ExportColumn<Inspection>[] = [
  { header: '월', value: (r) => dateOf(r).slice(0, 7) },
  { header: '공정', value: (r) => PART_LABEL[r.part] || r.part },
  { header: '항목수', value: (r) => r.items.length },
  { header: '서명', value: (r) => (r.signatures.length > 0 ? '서명완료' : '미서명') },
  { header: '상태', value: (r) => STATUS[r.status]?.label || r.status },
  { header: '교육청전송', value: (r) => EDUOFFICE[r.eduoffice_submit_status]?.label || r.eduoffice_submit_status },
  { header: '점검일', value: (r) => dateOf(r) },
]

export function Inspection() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 학교별 점검 목록 캐시 — 1단계 요약·2단계 월별 그룹 공용
  const [insMap, setInsMap] = useState<Record<string, Inspection[]>>({})
  const [sumLoading, setSumLoading] = useState(false)

  // 위계 상태: 선택 학교(2단계) · 접힌 월 그룹
  const [sel, setSel] = useState<School | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 생성 모달 상태 (기존 기능 보존 — 학교 컨텍스트 안으로 이동)
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState('catering')
  const [busy, setBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')

  // 드릴다운 상세 모달 (기존 재사용)
  const [detail, setDetail] = useState<Inspection | null>(null)

  // 학교 목록 로드
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((d) => {
        if (!alive) return
        setSchools(Array.isArray(d) ? d : [])
        setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // 전 학교 점검 목록 병렬 로드 → 학교 행 요약(건수/상태 분포/최근일)과 2단계 그룹에 사용
  useEffect(() => {
    if (!schools.length) return
    let alive = true
    setSumLoading(true)
    Promise.all(
      schools.map((s) =>
        api<Inspection[]>(`/inspections?school_id=${s.id}`)
          .then((d) => [s.id, Array.isArray(d) ? d : []] as const)
          .catch(() => [s.id, []] as const),
      ),
    ).then((entries) => {
      if (!alive) return
      setInsMap(Object.fromEntries(entries))
      setSumLoading(false)
    })
    return () => { alive = false }
  }, [schools])

  // 특정 학교만 재조회 (생성 후 / 학교 진입 시 최신화)
  const refetchSchool = useCallback((schoolId: string) => {
    api<Inspection[]>(`/inspections?school_id=${schoolId}`)
      .then((d) => setInsMap((m) => ({ ...m, [schoolId]: Array.isArray(d) ? d : [] })))
      .catch(() => { /* 캐시 유지 */ })
  }, [])

  async function create() {
    if (!sel || busy) return
    setBusy(true)
    setCreateErr('')
    try {
      await api('/inspections', {
        method: 'POST',
        body: JSON.stringify({ school_id: sel.id, part, is_private_school: false, items: [] }),
      })
      setOpen(false)
      refetchSchool(sel.id)
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  // ── 1단계: 학교 목록 데이터 ──
  const schoolRows: SchoolRow[] = useMemo(
    () => schools.map((s) => {
      const list = insMap[s.id] ?? []
      const latest = list.reduce((m, it) => {
        const d = dateOf(it)
        return d > m ? d : m
      }, '')
      return {
        ...s,
        count: list.length,
        draft: list.filter((it) => it.status === 'draft').length,
        signed: list.filter((it) => it.status === 'signed').length,
        submitted: list.filter((it) => it.status === 'submitted').length,
        latest,
      }
    }),
    [schools, insMap],
  )
  const totalCount = useMemo(() => schoolRows.reduce((a, r) => a + r.count, 0), [schoolRows])
  const totalSubmitted = useMemo(() => schoolRows.reduce((a, r) => a + r.submitted, 0), [schoolRows])
  const q = useTableQuery(schoolRows, SCHOOL_QUERY)

  function openSchool(s: School) {
    setSel(s)
    setCollapsed({})
    refetchSchool(s.id)
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

  // ── 2단계: 선택 학교 월별 그룹 ──
  const selItems = sel ? insMap[sel.id] ?? [] : []
  const monthGroups = useMemo(() => groupByMonth(selItems), [selItems])
  const selSubmitted = selItems.filter((r) => r.status === 'submitted').length
  const flatQ = useTableQuery(selItems, FLAT_QUERY) // 내보내기용

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  // 월 그룹 테이블 — 행 클릭 시 상세 모달
  function renderGroup(g: MonthGroup) {
    const isOpen = !collapsed[g.month]
    return (
      <div className="inh-group" key={g.month}>
        <button className="inh-grouphead" onClick={() => toggleGroup(g.month)}>
          <span className={'inh-chev' + (isOpen ? ' open' : '')}><ChevronRight size={15} /></span>
          {monthLabel(g.month)} 점검
          <span className="inh-count">{g.rows.length}건</span>
        </button>
        {isOpen && (
          <div className="inh-groupbody">
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>공정</th>
                    <th className="c">항목수</th>
                    <th className="c">서명</th>
                    <th className="c">상태</th>
                    <th className="c">교육청 전송</th>
                    <th>점검일</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const st = STATUS[r.status] || { label: r.status, cls: 'todo' }
                    const eo = EDUOFFICE[r.eduoffice_submit_status] || { label: r.eduoffice_submit_status, cls: 'todo' }
                    const signed = r.signatures.length > 0
                    return (
                      <tr key={r.id} onClick={() => setDetail(r)}>
                        <td><b>{PART_LABEL[r.part] || r.part}</b></td>
                        <td className="c">{r.items.length}</td>
                        <td className="c"><span className={'pillx ' + (signed ? 'ok' : 'todo')}>{signed ? '서명완료' : '미서명'}</span></td>
                        <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                        <td className="c"><span className={'pillx ' + eo.cls}>{eo.label}</span></td>
                        <td>{dateOf(r) || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / {sel
          ? <><a onClick={() => setSel(null)} style={{ cursor: 'pointer' }}>안전점검</a> / <b>{sel.name}</b></>
          : <b>안전점검</b>}
      </div>
      <div className="bar">
        <h2><ClipboardCheck size={20} /> 안전점검</h2>
        <div className="sp" />
        {sel && (
          <>
            <Link className="btn btn-primary" to={`/inspection/new?school=${sel.id}`}>
              점검표 작성
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => { setPart('catering'); setCreateErr(''); setOpen(true) }}
            >
              점검 생성
            </button>
          </>
        )}
      </div>

      {!sel && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="l">학교 수</div>
              <div className="v">{schools.length}<small> 곳</small></div>
              <div className="d">안전점검 관리 대상</div>
            </div>
            <div className="kpi">
              <div className="l">전체 점검</div>
              <div className="v">{totalCount}<small> 건</small></div>
              <div className="d">전 학교 누적 점검표</div>
            </div>
            <div className="kpi">
              <div className="l">제출</div>
              <div className="v">{totalSubmitted}<small> 건</small></div>
              <div className="d">서명 후 교육청 제출</div>
            </div>
          </div>

          <div className="ledger">
            <div className="lh">
              <h2><ClipboardCheck size={18} /> 학교 목록</h2>
              <div className="sp" />
              <FilterBar q={q} />
              <ExportButton q={q} columns={SCHOOL_EXPORT} filename="안전점검_학교별" />
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <SortableTh q={q} col="level">학교급</SortableTh>
                    <SortableTh q={q} col="name">학교</SortableTh>
                    <SortableTh q={q} col="manager">담당자</SortableTh>
                    <SortableTh q={q} col="count" className="c">점검</SortableTh>
                    <th className="c">상태 분포</th>
                    <SortableTh q={q} col="latest">최근 점검일</SortableTh>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && error && <tr><td colSpan={7}><div className="tstate">오류: {error}</div></td></tr>}
                  {!loading && !error && q.view.map((s) => (
                    <tr key={s.id} onClick={() => openSchool(s)}>
                      <td>{s.school_level ? <span className="pillx doing">{s.school_level}</span> : '—'}</td>
                      <td><b>{s.name}</b></td>
                      <td className="inh-mgr">{s.manager || '—'}</td>
                      <td className="c">{sumLoading ? <span className="inh-dim">…</span> : `${s.count}건`}</td>
                      <td className="c">
                        {sumLoading
                          ? <span className="inh-dim">…</span>
                          : s.count === 0
                            ? <span className="inh-dim">—</span>
                            : (
                              <span className="inh-dist">
                                {s.draft > 0 && <span className="pillx todo">작성중 {s.draft}</span>}
                                {s.signed > 0 && <span className="pillx doing">서명 {s.signed}</span>}
                                {s.submitted > 0 && <span className="pillx ok">제출 {s.submitted}</span>}
                              </span>
                            )}
                      </td>
                      <td>{sumLoading ? <span className="inh-dim">…</span> : (s.latest || '—')}</td>
                      <td className="c"><span className="chev"><ChevronRight size={15} /></span></td>
                    </tr>
                  ))}
                  {!loading && !error && q.view.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">{schools.length === 0 ? '등록된 학교가 없습니다.' : '조건에 맞는 학교가 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={q} />
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            학교를 선택하면 월별 안전점검 이력이 표시됩니다. 안전점검은 5대 공정(급식·시설·미화·통학·당직)에 대해 매월 실시합니다.
          </div>
        </>
      )}

      {sel && (
        <>
          <div className="inh-schoolhead">
            <button className="inh-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="inh-schoolname">{sel.name}</span>
            <span className="inh-schoolmgr">담당자 {sel.manager || '—'}</span>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="l">점검 수</div>
              <div className="v">{selItems.length}<small> 건</small></div>
              <div className="d">5대 공정 점검표</div>
            </div>
            <div className="kpi">
              <div className="l">제출 수</div>
              <div className="v">{selSubmitted}<small> 건</small></div>
              <div className="d">서명 후 교육청 제출</div>
            </div>
          </div>

          <div className="ledger" style={{ background: 'transparent', border: 0, boxShadow: 'none' }}>
            <div className="lh" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <h2><ClipboardCheck size={18} /> 월별 점검 이력</h2>
              <div className="sp" />
              <ExportButton q={flatQ} columns={FLAT_EXPORT} filename={`안전점검_${sel.name}`} />
            </div>
            {sumLoading && selItems.length === 0 && <div className="tstate">불러오는 중…</div>}
            {!sumLoading && selItems.length === 0 && (
              <div className="tstate">등록된 안전점검이 없습니다. '점검표 작성' 또는 '점검 생성'으로 추가하세요.</div>
            )}
            {monthGroups.map((g) => renderGroup(g))}
          </div>

          <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
            안전점검은 매월 반복 업무로, 서명·제출 전 건은 '일자 미상' 그룹에 표시됩니다.
            점검표는 서명 완료 후 교육청에 제출되며, 미흡 항목은 추후보완으로 관리됩니다.
          </div>
        </>
      )}

      {open && sel && (
        <Modal
          title={`안전점검 생성 · ${sel.name}`}
          onClose={() => { if (!busy) setOpen(false) }}
          footer={(
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={create}>
                {busy ? '생성 중…' : '생성'}
              </button>
            </>
          )}
        >
          {createErr && <div className="login-err">{createErr}</div>}
          <label className="field">
            <span>공정</span>
            <select className="select" value={part} onChange={(e) => setPart(e.target.value)}>
              {PART_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`안전점검 상세 · ${PART_LABEL[detail.part] || detail.part}`}
          onClose={() => setDetail(null)}
          footer={<button className="btn btn-primary" onClick={() => setDetail(null)}>닫기</button>}
        >
          <div className="kv"><b>상태</b><span>{STATUS[detail.status]?.label || detail.status}</span></div>
          <div className="kv"><b>점검일</b><span>{dateOf(detail) || '—'}</span></div>
          <div className="kv"><b>서명</b><span>{detail.signatures.length > 0 ? `서명완료 · ${detail.signatures.map((s) => s.signer).join(', ')}` : '미서명'}</span></div>
          <div className="kv"><b>교육청 전송</b><span>{EDUOFFICE[detail.eduoffice_submit_status]?.label || detail.eduoffice_submit_status}</span></div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>점검 항목 ({detail.items.length})</div>
          <div className="twrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>항목</th><th className="c">결과</th><th>비고</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.code}>
                    <td>{it.code}</td>
                    <td>{it.label}</td>
                    <td className="c">{it.result ? (RESULT_LABEL[it.result] || it.result) : '—'}</td>
                    <td>{it.remark || '—'}</td>
                  </tr>
                ))}
                {detail.items.length === 0 && <tr><td colSpan={4}><div className="tstate">항목 없음</div></td></tr>}
              </tbody>
            </table>
          </div>
          {detail.followups.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13 }}>추후보완 ({detail.followups.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                {detail.followups.map((f) => <li key={f.id}>[{f.item_code}] {f.description} — {f.status}</li>)}
              </ul>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
