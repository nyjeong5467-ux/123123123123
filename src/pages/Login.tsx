import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [tenant, setTenant] = useState('t_demo')
  const [id, setId] = useState('admin')
  const [pw, setPw] = useState('pw')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(tenant, id, pw)
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
          <span>테넌트</span>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} autoComplete="off" />
        </label>
        <label className="login-f">
          <span>아이디</span>
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
        </label>
        <label className="login-f">
          <span>비밀번호</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <div className="login-err">{err}</div>}
        <button className="login-btn" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        <div className="login-hint">데모 계정 · t_demo / admin / pw</div>
      </form>
    </div>
  )
}
