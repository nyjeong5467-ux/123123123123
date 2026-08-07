// 메일함(개인 이메일 IMAP 연동, 읽기 전용) — 리스트 → 클릭 → 본문 열람(네이버 메일식 전환).
// 연동 계정 설정은 설정 페이지 「개인 이메일 연동」에서.
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Inbox, Paperclip, Plug, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'

type MailRow = { uid: string; subject: string; sender: string; date: string }
type MailDetail = MailRow & { to: string; body: string; attachments: string[] }
type MailSettings = { address: string; has_password: boolean }

export function Mail() {
  const nav = useNavigate()
  const [settings, setSettings] = useState<MailSettings | null>(null)
  const [rows, setRows] = useState<MailRow[]>([])
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<MailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ settings: MailSettings }>('/mail/settings')
      .then((d) => { if (alive) setSettings(d.settings) })
      .catch(() => { if (alive) setSettings(null) })
    return () => { alive = false }
  }, [])

  const load = useCallback((n: number) => {
    setLoading(true)
    setError('')
    api<MailRow[]>(`/mail/inbox?limit=${n}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : '메일 조회 실패'))
      .then(() => setLoading(false))
  }, [])

  const connected = !!settings?.has_password
  useEffect(() => {
    if (connected) load(limit)
  }, [connected, limit, load])

  function openMessage(r: MailRow) {
    setDetail({ ...r, to: '', body: '', attachments: [] })
    setDetailLoading(true)
    api<MailDetail>(`/mail/message?uid=${encodeURIComponent(r.uid)}`)
      .then((d) => setDetail(d))
      .catch((e) => setDetail({ ...r, to: '', body: `본문을 불러오지 못했습니다: ${e instanceof Error ? e.message : ''}`, attachments: [] }))
      .then(() => setDetailLoading(false))
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>메일함</b></div>
      <div className="bar">
        <h2><Inbox size={20} /> 메일함</h2>
        {settings?.address && <span className="pillx doing">{settings.address}</span>}
        <div className="sp" />
        {connected && !detail && (
          <>
            <select className="select" style={{ width: 110 }} value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}>
              {[15, 30, 50].map((n) => <option key={n} value={n}>최근 {n}통</option>)}
            </select>
            <button className="btn btn-ghost" onClick={() => load(limit)} disabled={loading}>
              <RefreshCw size={14} /> 새로고침
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={() => nav('/settings')}>
          <Plug size={14} /> 연동 설정
        </button>
      </div>

      {settings !== null && !connected && (
        <div className="ledger">
          <div className="card-body" style={{ padding: '40px 26px', textAlign: 'center' }}>
            <div className="tstate">
              이메일이 아직 연동되지 않았습니다. 설정 → 「개인 이메일 연동」에서 주소와 앱 비밀번호를 저장하세요.
            </div>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => nav('/settings')}>
              <Plug size={14} /> 연동하러 가기
            </button>
          </div>
        </div>
      )}

      {/* 본문 뷰 */}
      {connected && detail && (
        <div className="ledger">
          <div className="lh">
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>
              <ArrowLeft size={14} /> 목록
            </button>
            <div className="sp" />
            <span className="muted" style={{ fontSize: 12 }}>{detail.date}</span>
          </div>
          <div className="card-body" style={{ padding: '20px 26px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800 }}>{detail.subject}</h3>
            <div className="kv"><b>보낸 사람</b><span>{detail.sender || '—'}</span></div>
            {detail.to && <div className="kv"><b>받는 사람</b><span>{detail.to}</span></div>}
            {detail.attachments.length > 0 && (
              <div className="kv">
                <b>첨부</b>
                <span>
                  {detail.attachments.map((a, i) => (
                    <span key={i} className="pillx na" style={{ marginRight: 6 }}>
                      <Paperclip size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />{a}
                    </span>
                  ))}
                </span>
              </div>
            )}
            <div style={{
              marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13.5,
              lineHeight: 1.8, color: 'var(--ink)', maxWidth: 860,
            }}>
              {detailLoading ? '본문을 불러오는 중…' : (detail.body || '(본문 없음)')}
            </div>
            <div className="muted" style={{ marginTop: 16, fontSize: 11.5 }}>
              읽기 전용입니다 — 답장·첨부 다운로드는 메일 서비스에서 하세요.
            </div>
          </div>
        </div>
      )}

      {/* 리스트 뷰 */}
      {connected && !detail && (
        <div className="ledger">
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 260 }}>보낸 사람</th>
                  <th>제목</th>
                  <th style={{ width: 140 }}>날짜</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={3}><div className="tstate">메일 서버에서 불러오는 중…</div></td></tr>}
                {!loading && error && <tr><td colSpan={3}><div className="tstate">오류: {error}</div></td></tr>}
                {!loading && !error && rows.map((m) => (
                  <tr key={m.uid} onClick={() => openMessage(m)} style={{ cursor: 'pointer' }}>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{m.sender || '—'}</td>
                    <td><b>{m.subject}</b></td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{m.date}</td>
                  </tr>
                ))}
                {!loading && !error && rows.length === 0 && (
                  <tr><td colSpan={3}><div className="tstate">메일이 없습니다.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
