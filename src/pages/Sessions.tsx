// 세션코드 발급 — 본사가 외근(조사원·학교 묶음·열 업무·유효기간) 단위로 1회성 코드를 발급.
// 규모(수백 개교) 대응: 학교 검색·학교급 필터·담당학교 필터·일괄 선택 + 업무/기간 프리셋.
// 선택 UI는 체크박스 대신 토글 칩(sessions.css sess-).
// 발급 후에도 영속 목록(GET /field/sessions)으로 발급 내역을 조회·수정·폐기한다.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Check, Copy, KeyRound, Pencil, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Modal } from '../components/Modal'
import { InfoTip } from '../components/InfoTip'
import '../styles/sessions.css'

type School = {
  id: string
  name: string
  school_level?: string
  manager?: string
  assigned_inspector_id?: string | null
}

// 백엔드 GET /field/sessions 항목 — HQ는 전체, 그 외는 본인 발급분만 반환.
type Session = {
  id: string
  inspector_id: string
  school_ids: string[]
  allowed_modules: string[]
  code: string
  valid_from: string
  valid_until: string
  status: 'issued' | 'redeemed' | 'closed' | string
  redeemed_at?: string | null
}

const MODULES: { key: string; label: string }[] = [
  { key: 'inspection', label: '안전점검' },
  { key: 'risk', label: '위험성평가' },
  { key: 'musculo', label: '근골격계' },
  { key: 'education', label: '교육' },
  { key: 'compliance', label: '이행점검' },
]

// 업무 프리셋 — 실무에서 자주 쓰는 외근 조합
const MODULE_PRESETS: { label: string; keys: string[] }[] = [
  { label: '전체 업무', keys: MODULES.map((m) => m.key) },
  { label: '월례 안전점검', keys: ['inspection'] },
  { label: '위험성평가 시즌', keys: ['risk'] },
  { label: '근골격계 조사', keys: ['musculo'] },
  { label: '점검+위평', keys: ['inspection', 'risk'] },
  { label: '이행점검(5·10월)', keys: ['compliance', 'inspection'] },
]

const LEVELS = ['유', '초', '중', '고', '기타']
const HQ_ROLES = ['hq_admin', 'executive']

// 상태 배지 매핑 — issued=활성, redeemed=사용됨, closed=폐기됨
const STATUS_META: Record<string, { label: string; cls: string }> = {
  issued: { label: '활성', cls: 'doing' },
  redeemed: { label: '사용됨', cls: 'na' },
  closed: { label: '폐기됨', cls: 'late' },
}

// datetime-local 형식(YYYY-MM-DDTHH:mm)으로 로컬 시각 변환
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ISO 문자열 → 사람이 읽기 좋은 로컬 표기(YYYY-MM-DD HH:mm)
function fmtDT(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 유효기간 프리셋 — 시작은 지금, 종료만 계산
const UNTIL_PRESETS: { label: string; calc: () => Date }[] = [
  { label: '4시간', calc: () => new Date(Date.now() + 4 * 3600e3) },
  { label: '8시간', calc: () => new Date(Date.now() + 8 * 3600e3) },
  {
    label: '오늘 18시',
    calc: () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d },
  },
  { label: '24시간', calc: () => new Date(Date.now() + 24 * 3600e3) },
]

type Issued = {
  code: string
  inspector: string
  schoolNames: string[]
  moduleLabels: string[]
  from: string
  until: string
}

// embedded: 경영 콘솔(현장 앱 관리 탭) 임베드용 — 페이지 헤더만 숨기고 본문 동일.
export function Sessions({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [inspectorId, setInspectorId] = useState('')
  const [schoolIds, setSchoolIds] = useState<string[]>([])
  const [modules, setModules] = useState<string[]>(['inspection'])
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')

  // 학교 선택 보조
  const [schQ, setSchQ] = useState('')
  const [schLevel, setSchLevel] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  // 발급 결과(단건)
  const [result, setResult] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  // 영속 발급 내역(백엔드 스코프: HQ=전체 / 그 외=본인 발급분)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessError, setSessError] = useState('')
  const [isHq, setIsHq] = useState(false)

  // 발급 내역 페이지네이션 (기본 10, 30/50 선택). 목록 재로딩·페이지크기 변경 시 1페이지로.
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // 수정 모달
  const [editing, setEditing] = useState<Session | null>(null)
  const [eSchoolIds, setESchoolIds] = useState<string[]>([])
  const [eModules, setEModules] = useState<string[]>([])
  const [eFrom, setEFrom] = useState('')
  const [eUntil, setEUntil] = useState('')
  const [eSchQ, setESchQ] = useState('')
  const [eSchLevel, setESchLevel] = useState('')
  const [eSaving, setESaving] = useState(false)
  const [eError, setEError] = useState('')

  async function loadSessions() {
    try {
      const d = await api<Session[]>('/field/sessions')
      setSessions(Array.isArray(d) ? d : [])
      setSessError('')
      setPage(1) // 목록 재로딩 시 1페이지로
    } catch (e) {
      setSessError(e instanceof Error ? e.message : '발급 내역 조회 실패')
    }
  }

  useEffect(() => {
    const now = new Date()
    setValidFrom(toLocalInput(now))
    setValidUntil(toLocalInput(new Date(now.getTime() + 8 * 3600e3)))
    // 기본 조사원 = 로그인 사용자(각자 자신부터 시작). 비어있으면 공란.
    if (user?.login) setInspectorId(user.login)
    let alive = true
    api<School[]>('/schools')
      .then((d) => { if (alive) setSchools(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '오류') })
    api<{ role?: string }>('/auth/me')
      .then((d) => { if (alive) setIsHq(HQ_ROLES.includes(d.role || '')) })
      .catch(() => {})
    void loadSessions()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 조사원 ID 자동완성 후보 — 학교 대장의 담당 조사원들
  const inspectorOptions = useMemo(
    () => [...new Set(schools.map((s) => s.assigned_inspector_id).filter((v): v is string => !!v))].sort(),
    [schools],
  )

  const filtered = useMemo(() => {
    const q = schQ.trim().toLowerCase()
    return schools.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.manager || '').toLowerCase().includes(q)) return false
      if (schLevel && (s.school_level || '기타') !== schLevel) return false
      if (onlyMine && inspectorId && s.assigned_inspector_id !== inspectorId.trim()) return false
      return true
    })
  }, [schools, schQ, schLevel, onlyMine, inspectorId])

  const selectedSet = useMemo(() => new Set(schoolIds), [schoolIds])
  const nameOf = useMemo(() => {
    const m = new Map(schools.map((s) => [s.id, s.name]))
    return (id: string) => m.get(id) || id.slice(0, 8)
  }, [schools])

  // 학교명 묶음을 짧게(3개 초과 시 "외 N")
  function truncNames(names: string[]) {
    return names.length <= 3 ? names.join(' · ') : `${names.slice(0, 3).join(' · ')} 외 ${names.length - 3}`
  }
  function moduleLabelsOf(keys: string[]) {
    return MODULES.filter((m) => keys.includes(m.key)).map((m) => m.label)
  }

  function toggleSchool(id: string) {
    setSchoolIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function selectFiltered() {
    setSchoolIds((prev) => [...new Set([...prev, ...filtered.map((s) => s.id)])])
  }
  function clearFiltered() {
    const ids = new Set(filtered.map((s) => s.id))
    setSchoolIds((prev) => prev.filter((x) => !ids.has(x)))
  }
  function toggleModule(key: string) {
    setModules((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])
  }

  async function issue() {
    setError('')
    setResult(null)
    setCopied(false)
    if (!inspectorId.trim()) { setError('조사원 ID를 입력하세요.'); return }
    if (schoolIds.length === 0) { setError('대상 학교를 선택하세요.'); return }
    if (modules.length === 0) { setError('열어줄 업무를 선택하세요.'); return }
    if (!validFrom || !validUntil) { setError('유효기간을 입력하세요.'); return }
    if (new Date(validUntil) <= new Date(validFrom)) { setError('유효 종료가 시작보다 빠릅니다.'); return }
    setIssuing(true)
    try {
      const res = await api<{ session_id: string; code: string }>('/field/session', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: inspectorId.trim(),
          school_ids: schoolIds,
          allowed_modules: modules,
          valid_from: new Date(validFrom).toISOString(),
          valid_until: new Date(validUntil).toISOString(),
        }),
      })
      const issued: Issued = {
        code: res.code,
        inspector: inspectorId.trim(),
        schoolNames: schoolIds.map(nameOf),
        moduleLabels: moduleLabelsOf(modules),
        from: validFrom.replace('T', ' '),
        until: validUntil.replace('T', ' '),
      }
      setResult(issued)
      void loadSessions() // 영속 목록에도 즉시 반영
    } catch (e) {
      setError(e instanceof Error ? e.message : '발급 실패')
    } finally {
      setIssuing(false)
    }
  }

  function copyCode(code: string) {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  // ── 수정 모달 ──────────────────────────────────────────
  const eFiltered = useMemo(() => {
    const q = eSchQ.trim().toLowerCase()
    return schools.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.manager || '').toLowerCase().includes(q)) return false
      if (eSchLevel && (s.school_level || '기타') !== eSchLevel) return false
      return true
    })
  }, [schools, eSchQ, eSchLevel])
  const eSelectedSet = useMemo(() => new Set(eSchoolIds), [eSchoolIds])

  function openEdit(s: Session) {
    setEditing(s)
    setESchoolIds([...s.school_ids])
    setEModules([...s.allowed_modules])
    setEFrom(toLocalInput(new Date(s.valid_from)))
    setEUntil(toLocalInput(new Date(s.valid_until)))
    setESchQ(''); setESchLevel(''); setEError('')
  }
  function toggleESchool(id: string) {
    setESchoolIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function toggleEModule(key: string) {
    setEModules((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])
  }
  async function saveEdit() {
    if (!editing) return
    setEError('')
    if (eSchoolIds.length === 0) { setEError('대상 학교를 선택하세요.'); return }
    if (eModules.length === 0) { setEError('열어줄 업무를 선택하세요.'); return }
    if (!eFrom || !eUntil) { setEError('유효기간을 입력하세요.'); return }
    if (new Date(eUntil) <= new Date(eFrom)) { setEError('유효 종료가 시작보다 빠릅니다.'); return }
    setESaving(true)
    try {
      await api<Session>(`/field/session/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          school_ids: eSchoolIds,
          allowed_modules: eModules,
          valid_from: new Date(eFrom).toISOString(),
          valid_until: new Date(eUntil).toISOString(),
        }),
      })
      setEditing(null)
      await loadSessions()
    } catch (e) {
      setEError(e instanceof Error ? e.message : '수정 실패')
    } finally {
      setESaving(false)
    }
  }

  // ── 폐기 ──────────────────────────────────────────────
  async function revoke(s: Session) {
    if (!window.confirm(`세션코드 ${s.code} 을(를) 폐기하시겠습니까?\n폐기하면 이 코드는 태블릿에서 더 이상 교환(사용)할 수 없습니다.`)) return
    try {
      await api(`/field/session/${s.id}/revoke`, { method: 'POST' })
      await loadSessions()
    } catch (e) {
      setSessError(e instanceof Error ? e.message : '폐기 실패')
    }
  }

  // ── 삭제(발급 내역 정리) — 사용됨/폐기됨 코드를 목록에서 영구 제거 ──
  async function del(s: Session) {
    if (!window.confirm(`발급 내역에서 이 세션코드(${s.code})를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await api(`/field/session/${s.id}`, { method: 'DELETE' })
      await loadSessions()
    } catch (e) {
      setSessError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  // ── 발급 내역 페이지네이션 파생값 (정렬은 백엔드 최신순 그대로) ──
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize))
  const pagedSessions = useMemo(
    () => sessions.slice((page - 1) * pageSize, page * pageSize),
    [sessions, page, pageSize],
  )
  const startIdx = sessions.length === 0 ? 0 : (page - 1) * pageSize + 1
  const endIdx = Math.min(page * pageSize, sessions.length)

  return (
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>세션코드 발급</b></div>}
      {!embedded && (
        <div className="bar">
          <h2>세션코드 발급</h2>
          <div className="sp" />
          <span className="pillx doing">선택 학교 {schoolIds.length}개</span>
        </div>
      )}

      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh"><h2><KeyRound size={18} /> 외근 정보</h2></div>
        <div className="card-body" style={{ padding: '22px 26px' }}>
          {/* 1. 조사원 + 유효기간 */}
          <div className="sess-sec">
            <div className="formrow">
              <label className="field" style={{ minWidth: 220 }}>
                <span>조사원 ID</span>
                <input className="input" list="sess-inspectors" value={inspectorId}
                  onChange={(e) => setInspectorId(e.target.value)} placeholder="조사원 ID (자동완성)" />
                <datalist id="sess-inspectors">
                  {inspectorOptions.map((v) => <option key={v} value={v} />)}
                </datalist>
              </label>
              <label className="field">
                <span>유효 시작</span>
                <input className="input" type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>유효 종료</span>
                <input className="input" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </label>
              <div className="field">
                <span>종료 프리셋</span>
                <div className="sess-row">
                  {UNTIL_PRESETS.map((p) => (
                    <button key={p.label} className="sess-preset"
                      onClick={() => { setValidFrom(toLocalInput(new Date())); setValidUntil(toLocalInput(p.calc())) }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2. 열어줄 업무 */}
          <div className="sess-sec">
            <span className="sess-lab">열어줄 업무<span className="hint">태블릿에는 선택한 업무만 표시됩니다</span></span>
            <div className="sess-row" style={{ marginBottom: 10 }}>
              {MODULE_PRESETS.map((p) => {
                const active = p.keys.length === modules.length && p.keys.every((k) => modules.includes(k))
                return (
                  <button key={p.label} className={'sess-preset' + (active ? ' on' : '')} onClick={() => setModules([...p.keys])}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div className="sess-row">
              {MODULES.map((m) => {
                const on = modules.includes(m.key)
                return (
                  <button key={m.key} className={'sess-chip' + (on ? ' on' : '')} onClick={() => toggleModule(m.key)}>
                    {on && <Check size={13} />}{m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. 대상 학교 */}
          <div className="sess-sec">
            <span className="sess-lab">대상 학교<span className="hint">그날 방문하는 학교 묶음 — 클릭하여 선택/해제</span></span>
            <div className="sess-row">
              <span className="sess-search">
                <Search size={14} />
                <input className="input" placeholder="학교명·담당자 검색" value={schQ} onChange={(e) => setSchQ(e.target.value)} />
              </span>
              <select className="select" value={schLevel} onChange={(e) => setSchLevel(e.target.value)} style={{ width: 120 }}>
                <option value="">구분 전체</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <button className={'sess-preset' + (onlyMine ? ' on' : '')} onClick={() => setOnlyMine((v) => !v)}
                title="조사원 ID와 담당 조사원이 일치하는 학교만 표시">
                이 조사원 담당학교만
              </button>
              <div className="sp" />
              <button className="sess-preset" onClick={selectFiltered}>검색결과 전체 선택 ({filtered.length})</button>
              <button className="sess-preset" onClick={clearFiltered}>검색결과 해제</button>
            </div>
            <div className="sess-schoolbox">
              {filtered.length === 0 && <span className="empty">조건에 맞는 학교가 없습니다.</span>}
              {filtered.map((s) => {
                const on = selectedSet.has(s.id)
                return (
                  <button key={s.id} className={'sess-chip' + (on ? ' on' : '')} onClick={() => toggleSchool(s.id)}>
                    {on && <Check size={13} style={{ flex: 'none' }} />}
                    <span className="nm">{s.name}</span>
                    {s.school_level && <span className="lv">{s.school_level}</span>}
                  </button>
                )
              })}
            </div>
            {schoolIds.length > 0 && (
              <div className="sess-picked">
                <b>{schoolIds.length}개 선택</b> — {schoolIds.map(nameOf).join(' · ')}
              </div>
            )}
          </div>

          <div className="sess-row">
            <button className="btn btn-primary" onClick={issue} disabled={issuing}>
              <KeyRound size={15} /> {issuing ? '발급 중…' : '세션코드 발급'}
            </button>
            {error && <span style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600 }}>{error}</span>}
          </div>
        </div>
      </div>

      {result && (
        <div className="ledger" style={{ marginBottom: 24 }}>
          <div className="lh"><h2>발급된 세션코드
            <InfoTip>태블릿에 이 코드를 입력하면 선택한 학교·업무만 열립니다. 코드는 1회 교환 후 만료됩니다.</InfoTip></h2></div>
          <div className="card-body sess-result" style={{ padding: '24px 26px' }}>
            <div className="codebox">{result.code}</div>
            <div className="sess-copy">
              <button className="btn btn-ghost" onClick={() => copyCode(result.code)}>
                {copied ? <><Check size={14} /> 복사됨</> : <><Copy size={14} /> 코드 복사</>}
              </button>
            </div>
            <div className="meta">
              <b>{result.inspector}</b> · 학교 {result.schoolNames.length}개 · {result.moduleLabels.join('/')}
              <br />유효 {result.from} ~ {result.until}
            </div>
          </div>
        </div>
      )}

      {/* 영속 발급 내역 — 백엔드 스코프에 따라 HQ=전체 / 그 외=본인 발급분 */}
      <div className="ledger">
        <div className="lh">
          <h2>발급 세션코드 내역</h2>
          <span className="sess-scope-note">{isHq ? '전체 발급 내역' : '내가 발급한 내역'}</span>
          <div className="sp" />
          {sessError && <span style={{ color: 'var(--red-ink)', fontSize: 12, fontWeight: 600, marginRight: 8 }}>{sessError}</span>}
          <label className="sess-scope-note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            페이지당
            <select className="select" value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} style={{ width: 72 }}>
              {[10, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="pillx na">{sessions.length}건</span>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr><th>코드</th><th>조사원</th><th>학교</th><th>업무</th><th>유효기간</th><th>상태</th><th>관리</th></tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '18px 4px' }}>발급된 세션코드가 없습니다.</td></tr>
              )}
              {pagedSessions.map((s) => {
                const st = STATUS_META[s.status] || { label: s.status, cls: 'todo' }
                const names = s.school_ids.map(nameOf)
                const canEdit = s.status === 'issued'
                return (
                  <tr key={s.id}>
                    <td><b>{s.code}</b></td>
                    <td>{s.inspector_id}</td>
                    <td title={names.join(' · ')}>{truncNames(names)}</td>
                    <td>{moduleLabelsOf(s.allowed_modules).join('/')}</td>
                    <td>{fmtDT(s.valid_from)} ~ {fmtDT(s.valid_until)}</td>
                    <td><span className={'pillx ' + st.cls}>{st.label}</span></td>
                    <td>
                      <div className="sess-actions">
                        {canEdit ? (
                          <>
                            <button className="sess-preset" onClick={() => openEdit(s)} disabled={!canEdit}
                              title={canEdit ? '학교·업무·유효기간 수정' : '활성(issued) 코드만 수정할 수 있습니다'}>
                              <Pencil size={12} /> 수정
                            </button>
                            <button className="sess-preset danger" onClick={() => revoke(s)} title="이 코드를 폐기(사용 불가 처리)">
                              <Ban size={12} /> 폐기
                            </button>
                          </>
                        ) : (
                          <button className="sess-preset danger" onClick={() => del(s)} title="발급 내역에서 이 코드를 삭제(정리)">
                            <Trash2 size={12} /> 삭제
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
        {sessions.length > 0 && (
          <div className="sess-row" style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '10px 2px 2px' }}>
            <button className="sess-preset" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
            <span className="sess-scope-note">{startIdx}–{endIdx} / 전체 {sessions.length}건</span>
            <button className="sess-preset" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title={`세션코드 수정 — ${editing.code}`}
          wide
          onClose={() => setEditing(null)}
          footer={
            <>
              {eError && <span style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600, marginRight: 'auto' }}>{eError}</span>}
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={eSaving}>{eSaving ? '저장 중…' : '저장'}</button>
            </>
          }
        >
          <p className="sess-note">코드 자체는 변경할 수 없습니다. 대상 학교·열어줄 업무·유효기간만 수정합니다. (활성 코드만 수정 가능)</p>

          {/* 유효기간 */}
          <div className="sess-sec" style={{ marginBottom: 0 }}>
            <span className="sess-lab">유효기간</span>
            <div className="sess-row">
              <label className="field">
                <span>유효 시작</span>
                <input className="input" type="datetime-local" value={eFrom} onChange={(e) => setEFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>유효 종료</span>
                <input className="input" type="datetime-local" value={eUntil} onChange={(e) => setEUntil(e.target.value)} />
              </label>
            </div>
            <div className="sess-row" style={{ marginTop: 10 }}>
              {UNTIL_PRESETS.map((p) => (
                <button key={p.label} className="sess-preset"
                  onClick={() => { setEFrom(toLocalInput(new Date())); setEUntil(toLocalInput(p.calc())) }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 열어줄 업무 */}
          <div className="sess-sec" style={{ marginBottom: 0 }}>
            <span className="sess-lab">열어줄 업무</span>
            <div className="sess-row">
              {MODULES.map((m) => {
                const on = eModules.includes(m.key)
                return (
                  <button key={m.key} className={'sess-chip' + (on ? ' on' : '')} onClick={() => toggleEModule(m.key)}>
                    {on && <Check size={13} />}{m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 대상 학교 */}
          <div className="sess-sec" style={{ marginBottom: 0 }}>
            <span className="sess-lab">대상 학교<span className="hint">클릭하여 선택/해제</span></span>
            <div className="sess-row">
              <span className="sess-search">
                <Search size={14} />
                <input className="input" placeholder="학교명·담당자 검색" value={eSchQ} onChange={(e) => setESchQ(e.target.value)} />
              </span>
              <select className="select" value={eSchLevel} onChange={(e) => setESchLevel(e.target.value)} style={{ width: 120 }}>
                <option value="">구분 전체</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="sess-schoolbox">
              {eFiltered.length === 0 && <span className="empty">조건에 맞는 학교가 없습니다.</span>}
              {eFiltered.map((s) => {
                const on = eSelectedSet.has(s.id)
                return (
                  <button key={s.id} className={'sess-chip' + (on ? ' on' : '')} onClick={() => toggleESchool(s.id)}>
                    {on && <Check size={13} style={{ flex: 'none' }} />}
                    <span className="nm">{s.name}</span>
                    {s.school_level && <span className="lv">{s.school_level}</span>}
                  </button>
                )
              })}
            </div>
            {eSchoolIds.length > 0 && (
              <div className="sess-picked">
                <b>{eSchoolIds.length}개 선택</b> — {eSchoolIds.map(nameOf).join(' · ')}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
