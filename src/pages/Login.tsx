import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'

// 단일 기관(한국산업안전협회) 운영 — 테넌트는 내부 고정값(사용자에게 노출/입력 불필요).
const TENANT_ID = 't_demo'

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(TENANT_ID, id, pw)
      nav('/')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '로그인 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card rv" onSubmit={submit}>
        <div className="login-brand">
          <div className="login-logo"><ShieldCheck size={26} strokeWidth={2.2} /></div>
          <div>
            <div className="login-org">한국산업안전협회</div>
            <div className="login-prod">안전관리 통합 플랫폼</div>
          </div>
        </div>
        <h1 className="login-h">로그인</h1>
        <p className="login-sub">본사 관리자 계정으로 로그인하세요.</p>
        <label className="login-f">
          <span>아이디</span>
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" placeholder="아이디" />
        </label>
        <label className="login-f">
          <span>비밀번호</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" placeholder="비밀번호" />
        </label>
        {err && <div className="login-err">{err}</div>}
        <button className="login-btn" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </div>
  )
}
