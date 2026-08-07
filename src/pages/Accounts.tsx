// 계정 관리(본사 관리자 전용) — 계정 목록·생성·역할/모듈 권한 부여·비밀번호 재설정.
// 모듈 권한: 비면 전체 허용, 지정하면 해당 모듈 메뉴만 사이드바에 표시(재로그인/새로고침 시 반영).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, KeyRound, Plus, Users } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'

type Account = {
  id: string
  login_id: string
  name: string
  role: string
  modules: string[]
}

const ROLES: { value: string; label: string }[] = [
  { value: 'hq_admin', label: '본사 관리자' },
  { value: 'executive', label: '경영진' },
  { value: 'field_inspector', label: '현장 조사원' },
  { value: 'school_confirmer', label: '학교 확인자' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))
const ROLE_PILL: Record<string, string> = {
  hq_admin: 'doing', executive: 'warn', field_inspector: 'ok', school_confirmer: 'na',
}

// 부여 가능한 모듈 카탈로그(사이드바 메뉴 키와 동일)
const MODULES: { key: string; label: string; group: string }[] = [
  { key: 'inspection', label: '안전점검', group: '업무' },
  { key: 'risk', label: '위험성평가', group: '업무' },
  { key: 'musculo', label: '근골격계', group: '업무' },
  { key: 'education', label: '교육', group: '업무' },
  { key: 'compliance', label: '이행점검', group: '업무' },
  { key: 'accidents', label: '산업재해', group: '업무' },
  { key: 'ledger', label: '경영 대시보드', group: '본사' },
  { key: 'ops', label: '종합관리', group: '본사' },
  { key: 'billing', label: '세금계산서', group: '본사' },
  { key: 'resources', label: '자료실', group: '본사' },
  { key: 'sessions', label: '세션코드', group: '본사' },
]
const MODULE_LABEL = Object.fromEntries(MODULES.map((m) => [m.key, m.label]))

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 신규 계정 모달
  const [createOpen, setCreateOpen] = useState(false)
  const [nLogin, setNLogin] = useState('')
  const [nName, setNName] = useState('')
  const [nPw, setNPw] = useState('')
  const [nRole, setNRole] = useState('field_inspector')
  const [nErr, setNErr] = useState('')

  // 모듈 권한 편집 모달
  const [modTarget, setModTarget] = useState<Account | null>(null)
  const [modSel, setModSel] = useState<string[]>([])

  // 비밀번호 재설정 모달
  const [pwTarget, setPwTarget] = useState<Account | null>(null)
  const [pwNew, setPwNew] = useState('')
  const [pwErr, setPwErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<Account[]>('/users')
      .then((d) => { if (alive) { setAccounts(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [reload])

  const stats = useMemo(() => ({
    total: accounts.length,
    hq: accounts.filter((a) => a.role === 'hq_admin' || a.role === 'executive').length,
    limited: accounts.filter((a) => a.modules.length > 0).length,
  }), [accounts])

  async function changeRole(a: Account, role: string) {
    setBusy(a.id)
    setMsg(null)
    try {
      await api(`/users/${a.id}`, { method: 'PUT', body: JSON.stringify({ role }) })
      setReload((n) => n + 1)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '역할 변경 실패' })
    } finally {
      setBusy('')
    }
  }

  async function createAccount() {
    setNErr('')
    if (!nLogin.trim()) { setNErr('로그인 ID를 입력하세요.'); return }
    if (!nPw) { setNErr('초기 비밀번호를 입력하세요.'); return }
    setBusy('create')
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ login_id: nLogin.trim(), password: nPw, role: nRole, name: nName.trim() }),
      })
      setCreateOpen(false)
      setNLogin(''); setNName(''); setNPw(''); setNRole('field_inspector')
      setReload((n) => n + 1)
      setMsg({ ok: true, text: '계정을 생성했습니다.' })
    } catch (e) {
      setNErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy('')
    }
  }

  function openModules(a: Account) {
    setModTarget(a)
    setModSel([...a.modules])
  }

  async function saveModules() {
    if (!modTarget) return
    setBusy('modules')
    try {
      await api(`/users/${modTarget.id}`, {
        method: 'PUT', body: JSON.stringify({ modules: modSel }),
      })
      setModTarget(null)
      setReload((n) => n + 1)
      setMsg({ ok: true, text: `${modTarget.login_id} 계정의 모듈 권한을 저장했습니다. (해당 계정은 새로고침 시 반영)` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '권한 저장 실패' })
    } finally {
      setBusy('')
    }
  }

  async function resetPw() {
    if (!pwTarget) return
    setPwErr('')
    if (!pwNew) { setPwErr('새 비밀번호를 입력하세요.'); return }
    setBusy('pw')
    try {
      await api(`/users/${pwTarget.id}/reset-password`, {
        method: 'POST', body: JSON.stringify({ new_password: pwNew }),
      })
      setPwTarget(null)
      setPwNew('')
      setMsg({ ok: true, text: '비밀번호를 재설정했습니다.' })
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : '재설정 실패')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>계정 관리</b></div>
      <div className="bar">
        <h2><Users size={20} /> 계정 관리</h2>
        <div className="sp" />
        {msg && <span className={'pillx ' + (msg.ok ? 'ok' : 'late')}>{msg.text}</span>}
        <button className="btn btn-primary" onClick={() => { setNErr(''); setCreateOpen(true) }}>
          <Plus size={15} /> 계정 생성
        </button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">전체 계정</div><div className="v">{stats.total}<small> 개</small></div><div className="d">이 테넌트 소속</div></div>
        <div className="kpi"><div className="l">본사 권한</div><div className="v">{stats.hq}<small> 개</small></div><div className="d">관리자·경영진</div></div>
        <div className="kpi"><div className="l">모듈 제한</div><div className="v">{stats.limited}<small> 개</small></div><div className="d">일부 모듈만 허용된 계정</div></div>
      </div>

      <div className="ledger">
        <div className="lh"><h2>계정 목록</h2></div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>로그인 ID</th><th>이름</th><th>역할</th><th>사용 가능 모듈</th><th style={{ width: 210 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
              {!loading && error && <tr><td colSpan={5}><div className="tstate">오류: {error}</div></td></tr>}
              {!loading && !error && accounts.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.login_id}</b></td>
                  <td>{a.name || '—'}</td>
                  <td>
                    <select className="select" style={{ width: 140, padding: '4px 8px' }}
                      value={a.role} disabled={busy === a.id}
                      onChange={(e) => void changeRole(a, e.target.value)}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {a.modules.length === 0
                      ? <span className="pillx ok">전체 허용</span>
                      : a.modules.map((m) => (
                        <span key={m} className="pillx doing" style={{ marginRight: 4 }}>{MODULE_LABEL[m] || m}</span>
                      ))}
                  </td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => openModules(a)}>모듈 권한</button>
                    <button className="btn btn-ghost" onClick={() => { setPwErr(''); setPwNew(''); setPwTarget(a) }}>
                      <KeyRound size={13} /> 비밀번호
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !error && accounts.length === 0 && (
                <tr><td colSpan={5}><div className="tstate">계정이 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.7 }}>
        역할: <b>본사 관리자/경영진</b>은 시스템 전체(계정·설정·발행·연동 설정)를, <b>현장 조사원</b>은 업무 화면을 사용합니다.
        모듈 권한을 지정하면 해당 계정 사이드바에는 허용된 모듈만 표시됩니다(비면 전체 허용).
        마지막 본사 관리자는 강등할 수 없습니다.
      </div>

      {/* 신규 계정 */}
      {createOpen && (
        <Modal
          title="계정 생성"
          onClose={() => { if (busy !== 'create') setCreateOpen(false) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'create'} onClick={() => setCreateOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'create'} onClick={() => void createAccount()}>
                {busy === 'create' ? '생성 중…' : '생성'}
              </button>
            </>
          }
        >
          {nErr && <div className="login-err">{nErr}</div>}
          <div className="formrow">
            <label className="field"><span>로그인 ID *</span>
              <input className="input" value={nLogin} onChange={(e) => setNLogin(e.target.value)} placeholder="예: insp-kim" /></label>
            <label className="field"><span>이름</span>
              <input className="input" value={nName} onChange={(e) => setNName(e.target.value)} placeholder="예: 김조사" /></label>
          </div>
          <div className="formrow" style={{ marginTop: 10 }}>
            <label className="field"><span>초기 비밀번호 *</span>
              <input className="input" type="password" value={nPw} autoComplete="new-password"
                onChange={(e) => setNPw(e.target.value)} /></label>
            <label className="field"><span>역할</span>
              <select className="select" value={nRole} onChange={(e) => setNRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select></label>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
            모듈 권한은 생성 후 목록의 「모듈 권한」에서 지정하세요(기본: 전체 허용).
          </div>
        </Modal>
      )}

      {/* 모듈 권한 편집 */}
      {modTarget && (
        <Modal
          title={`모듈 권한 · ${modTarget.login_id}`}
          onClose={() => { if (busy !== 'modules') setModTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'modules'} onClick={() => setModTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'modules'} onClick={() => void saveModules()}>
                {busy === 'modules' ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => setModSel([])}>전체 허용(제한 없음)</button>
            <button className="btn btn-ghost" onClick={() => setModSel(MODULES.filter((m) => m.group === '업무').map((m) => m.key))}>업무만</button>
            <button className="btn btn-ghost" onClick={() => setModSel(MODULES.map((m) => m.key))}>모두 선택</button>
          </div>
          {['업무', '본사'].map((g) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 12.5 }}>{g}</b>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {MODULES.filter((m) => m.group === g).map((m) => {
                  const on = modSel.includes(m.key)
                  return (
                    <button key={m.key} type="button"
                      className={'pillx ' + (on ? 'doing' : 'na')}
                      style={{ cursor: 'pointer', border: on ? '1px solid var(--violet)' : '1px solid var(--line)' }}
                      onClick={() => setModSel((prev) => on ? prev.filter((x) => x !== m.key) : [...prev, m.key])}>
                      {on && <Check size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />}{m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            {modSel.length === 0
              ? '아무것도 선택하지 않으면 전체 모듈이 허용됩니다.'
              : `선택한 ${modSel.length}개 모듈만 이 계정의 사이드바에 표시됩니다.`}
          </div>
        </Modal>
      )}

      {/* 비밀번호 재설정 */}
      {pwTarget && (
        <Modal
          title={`비밀번호 재설정 · ${pwTarget.login_id}`}
          onClose={() => { if (busy !== 'pw') setPwTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'pw'} onClick={() => setPwTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'pw'} onClick={() => void resetPw()}>
                {busy === 'pw' ? '재설정 중…' : '재설정'}
              </button>
            </>
          }
        >
          {pwErr && <div className="login-err">{pwErr}</div>}
          <label className="field"><span>새 비밀번호</span>
            <input className="input" type="password" value={pwNew} autoComplete="new-password"
              onChange={(e) => setPwNew(e.target.value)} /></label>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
            관리자 재설정은 현재 비밀번호 확인 없이 즉시 적용됩니다. 본인 변경은 마이페이지에서.
          </div>
        </Modal>
      )}
    </div>
  )
}
