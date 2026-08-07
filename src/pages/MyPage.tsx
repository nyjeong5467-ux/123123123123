import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CircleUser, KeyRound, Bell } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

type NotifPrefs = { headcount: boolean; accident: boolean; review: boolean }

const NOTIF_KEY = 'sp-notif-prefs'
const DEFAULT_PREFS: NotifPrefs = { headcount: true, accident: true, review: true }

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<NotifPrefs>
    return {
      headcount: p.headcount ?? DEFAULT_PREFS.headcount,
      accident: p.accident ?? DEFAULT_PREFS.accident,
      review: p.review ?? DEFAULT_PREFS.review,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const okLine: CSSProperties = {
  background: 'var(--ok-soft)',
  color: 'var(--ok-ink)',
  fontSize: 12.5,
  fontWeight: 600,
  padding: '10px 12px',
  borderRadius: 11,
  marginBottom: 14,
}
const notifRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '11px 0',
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  borderBottom: '1px solid var(--line)',
}

export function MyPage() {
  const { user } = useAuth()
  const isAdmin = user?.login === 'admin'
  const displayName = isAdmin ? '관리자' : user?.login ?? '사용자'
  const tenant = user?.tenant ?? '—'
  const loginId = user?.login ?? '—'
  const avatarChar = displayName.charAt(0).toUpperCase()

  // 비밀번호 변경 (실 백엔드 POST /auth/change-password)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [pwOk, setPwOk] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  async function changePassword() {
    setPwErr('')
    setPwOk('')
    if (!curPw || !newPw || !confirmPw) { setPwErr('모든 항목을 입력하세요.'); return }
    if (newPw !== confirmPw) { setPwErr('새 비밀번호가 일치하지 않습니다.'); return }
    setPwBusy(true)
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: curPw, new_password: newPw }),
      })
      setCurPw(''); setNewPw(''); setConfirmPw('')
      setPwOk('비밀번호가 변경되었습니다.')
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setPwBusy(false)
    }
  }

  // 알림 수신 설정 (localStorage 저장)
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadPrefs())
  const [notifOk, setNotifOk] = useState('')

  function toggle(key: keyof NotifPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
    setNotifOk('')
  }

  function savePrefs() {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs))
    setNotifOk('알림 설정이 저장되었습니다.')
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>마이페이지</b></div>
      <div className="bar">
        <h2><CircleUser size={20} /> 마이페이지</h2>
      </div>

      <div className="grid2">
        {/* 프로필 + 계정 정보 */}
        <div className="ledger">
          <div className="lh"><h2><CircleUser size={18} /> 프로필</h2></div>
          <div className="card-body" style={{ padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: 'var(--grad-violet)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 28,
                  boxShadow: 'var(--sh-violet)',
                  flexShrink: 0,
                }}
              >
                {avatarChar}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{displayName}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>{tenant}</div>
                <span className="pillx doing" style={{ marginTop: 8 }}>관리자</span>
              </div>
            </div>
            <div className="kv"><b>로그인 ID</b><span>{loginId}</span></div>
            <div className="kv"><b>소속</b><span>{tenant}</span></div>
            <div className="kv"><b>권한</b><span>관리자</span></div>
            <div className="kv"><b>상태</b><span><span className="pillx ok">활성</span></span></div>
          </div>
        </div>

        {/* 비밀번호 변경 + 알림 수신 설정 */}
        <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
          <div className="ledger">
            <div className="lh"><h2><KeyRound size={18} /> 비밀번호 변경</h2></div>
            <div className="card-body" style={{ padding: '22px 26px' }}>
              {pwErr && <div className="login-err">{pwErr}</div>}
              {pwOk && <div style={okLine}>{pwOk}</div>}
              <label className="field" style={{ marginBottom: 14 }}>
                <span>현재 비밀번호</span>
                <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="현재 비밀번호" />
              </label>
              <label className="field" style={{ marginBottom: 14 }}>
                <span>새 비밀번호</span>
                <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새 비밀번호" />
              </label>
              <label className="field" style={{ marginBottom: 18 }}>
                <span>새 비밀번호 확인</span>
                <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="새 비밀번호 확인" />
              </label>
              <button className="btn btn-primary" onClick={changePassword} disabled={pwBusy}>{pwBusy ? '변경 중…' : '변경'}</button>
            </div>
          </div>

          <div className="ledger">
            <div className="lh"><h2><Bell size={18} /> 알림 수신 설정</h2></div>
            <div className="card-body" style={{ padding: '18px 26px 22px' }}>
              {notifOk && <div style={okLine}>{notifOk}</div>}
              <label style={notifRow}>
                <input type="checkbox" checked={prefs.headcount} onChange={() => toggle('headcount')} /> 인원 불일치 알림
              </label>
              <label style={notifRow}>
                <input type="checkbox" checked={prefs.accident} onChange={() => toggle('accident')} /> 산재 알림
              </label>
              <label style={{ ...notifRow, borderBottom: 0 }}>
                <input type="checkbox" checked={prefs.review} onChange={() => toggle('review')} /> 증상조사표 검수 대기 알림
              </label>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={savePrefs}>저장</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
