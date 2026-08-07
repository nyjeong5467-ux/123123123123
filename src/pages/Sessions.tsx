// 세션코드 발급 — 본사가 외근(조사원·학교 묶음·열 업무·유효기간) 단위로 1회성 코드를 발급.
// 규모(수백 개교) 대응: 학교 검색·학교급 필터·담당학교 필터·일괄 선택 + 업무/기간 프리셋.
// 선택 UI는 체크박스 대신 토글 칩(sessions.css sess-).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, KeyRound, Search } from 'lucide-react'
import { api } from '../lib/api'
import '../styles/sessions.css'

type School = {
  id: string
  name: string
  school_level?: string
  manager?: string
  assigned_inspector_id?: string | null
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

// datetime-local 형식(YYYY-MM-DDTHH:mm)으로 로컬 시각 변환
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export function Sessions() {
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

  // 발급 결과 + 이번 화면 발급 이력
  const [result, setResult] = useState<Issued | null>(null)
  const [history, setHistory] = useState<Issued[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const now = new Date()
    setValidFrom(toLocalInput(now))
    setValidUntil(toLocalInput(new Date(now.getTime() + 8 * 3600e3)))
    let alive = true
    api<School[]>('/schools')
      .then((d) => { if (alive) setSchools(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '오류') })
    return () => { alive = false }
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
        moduleLabels: MODULES.filter((m) => modules.includes(m.key)).map((m) => m.label),
        from: validFrom.replace('T', ' '),
        until: validUntil.replace('T', ' '),
      }
      setResult(issued)
      setHistory((h) => [issued, ...h])
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

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>세션코드 발급</b></div>
      <div className="bar">
        <h2>세션코드 발급</h2>
        <div className="sp" />
        <span className="pillx doing">선택 학교 {schoolIds.length}개</span>
      </div>

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
                <option value="">학교급 전체</option>
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
          <div className="lh"><h2>발급된 세션코드</h2></div>
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
              <br />태블릿에 이 코드를 입력하면 선택한 학교·업무만 열립니다. 코드는 1회 교환 후 만료됩니다.
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="ledger">
          <div className="lh"><h2>이번 화면에서 발급한 코드</h2><div className="sp" /><span className="pillx na">{history.length}건</span></div>
          <div className="twrap">
            <table className="tbl">
              <thead><tr><th>코드</th><th>조사원</th><th>학교</th><th>업무</th><th>유효기간</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td><b>{h.code}</b></td>
                    <td>{h.inspector}</td>
                    <td>{h.schoolNames.length <= 3 ? h.schoolNames.join(' · ') : `${h.schoolNames.slice(0, 3).join(' · ')} 외 ${h.schoolNames.length - 3}`}</td>
                    <td>{h.moduleLabels.join('/')}</td>
                    <td>{h.from} ~ {h.until}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
