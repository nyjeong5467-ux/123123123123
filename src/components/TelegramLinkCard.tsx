// 마이페이지 — 텔레그램 알림 연동(2026-10-30). 내가 제출한 점검표의 교육청 업로드 결과·화면 캡처를
// 개인 텔레그램으로 받는다. 코드 발급 → 봇에 전송 → 연동(서버가 텔레그램 수신으로 확인).
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Send, Unlink } from 'lucide-react'
import { api } from '../lib/api'

type Status = { configured: boolean; linked: boolean; linked_at: string; bot_username: string }
type LinkOut = { code: string; bot_username: string; link: string; expires_in: number }

export function TelegramLinkCard() {
  const [st, setSt] = useState<Status | null>(null)
  const [issued, setIssued] = useState<LinkOut | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [isHq, setIsHq] = useState(false)
  const pollRef = useRef<number | null>(null)

  const load = () =>
    api<Status>('/me/telegram')
      .then((s) => { setSt(s); return s })
      .catch(() => { setSt(null); return null })

  useEffect(() => {
    void load()
    api<{ role?: string }>('/auth/me')
      .then((u) => setIsHq(u?.role === 'hq_admin' || u?.role === 'executive'))
      .catch(() => {})
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [])

  // 코드 발급 후 연동될 때까지 4초마다 확인(최대 10분)
  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current)
    const until = Date.now() + 600_000
    pollRef.current = window.setInterval(() => {
      if (Date.now() > until) { window.clearInterval(pollRef.current!); pollRef.current = null; return }
      void load().then((s) => {
        if (s?.linked) {
          window.clearInterval(pollRef.current!); pollRef.current = null
          setIssued(null); setMsg('연동되었습니다. 텔레그램에 환영 메시지가 도착했는지 확인해 주세요.')
        }
      })
    }, 4000)
  }

  async function issue() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<LinkOut>('/me/telegram/link', { method: 'POST' })
      setIssued(r)
      startPolling()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '코드 발급 실패')
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true); setErr(''); setMsg('')
    try {
      await api('/me/telegram', { method: 'DELETE' })
      await load()
      setMsg('연동을 해제했습니다.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '해제 실패')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<{ admin_chat: boolean; personal: boolean }>('/telegram/test', { method: 'POST' })
      setMsg(`테스트 알림을 보냈습니다 — 관리자방 ${r.admin_chat ? 'O' : '미설정'} · 내 텔레그램 ${r.personal ? 'O' : '미연동'}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '테스트 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ledger">
      <div className="lh">
        <h2><Send size={18} /> 텔레그램 알림</h2>
        <div className="sp" />
        {st?.linked && <span className="pillx ok">연동됨</span>}
      </div>
      <div className="card-body" style={{ padding: '18px 26px 22px', fontSize: 13.5, lineHeight: 1.6 }}>
        <p className="muted" style={{ margin: '0 0 14px' }}>
          내가 제출한 안전점검표가 교육청에 올라갈 때마다 결과와 교육청 화면 캡처를 텔레그램으로 받습니다.
        </p>
        {err && <div className="login-err">{err}</div>}
        {msg && <div style={{ color: 'var(--ok-ink)', fontWeight: 700, marginBottom: 12 }}>{msg}</div>}

        {st && !st.configured && (
          <div className="muted">관리자가 텔레그램 봇을 설정하면 사용할 수 있습니다.</div>
        )}

        {st?.configured && st.linked && (
          <>
            <div className="kv"><b>상태</b><span>연동됨 · {(st.linked_at || '').slice(0, 16).replace('T', ' ')}</span></div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => void unlink()} disabled={busy}><Unlink size={14} /> 연동 해제</button>
              {isHq && <button className="btn btn-ghost" onClick={() => void test()} disabled={busy}><Send size={14} /> 테스트 알림</button>}
            </div>
          </>
        )}

        {st?.configured && !st.linked && !issued && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => void issue()} disabled={busy}>
              {busy ? '발급 중…' : '연동 코드 받기'}
            </button>
            {isHq && <button className="btn btn-ghost" onClick={() => void test()} disabled={busy}><Send size={14} /> 테스트 알림</button>}
          </div>
        )}

        {issued && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', background: 'var(--card-2)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>1. 아래 버튼을 눌러 텔레그램에서 봇을 열고 [시작]을 누르세요.</div>
            {issued.link && (
              <a className="btn btn-primary" href={issued.link} target="_blank" rel="noreferrer" style={{ marginBottom: 12 }}>
                텔레그램에서 열기 <ExternalLink size={14} />
              </a>
            )}
            <div style={{ fontWeight: 700, margin: '4px 0 6px' }}>
              2. 버튼이 안 되면 텔레그램에서 @{issued.bot_username || '봇'} 을 찾아 아래 코드를 보내세요.
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.18em', fontFamily: 'ui-monospace, monospace' }}>{issued.code}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>코드는 10분 동안 1회만 쓸 수 있습니다. 연동되면 이 화면이 자동으로 바뀝니다.</div>
          </div>
        )}
      </div>
    </div>
  )
}
