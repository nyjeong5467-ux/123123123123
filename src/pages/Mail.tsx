// 메일함 — 탭 2개: 받은편지함(개인 이메일 IMAP 연동, 읽기 전용) | 보낸 업무 메일(회사 대표계정 SMTP 발송 이력).
// [메일 쓰기] 모달: 학교 선택 → 담당자 이메일 프리필(/mail/school-contacts), 제목 접두어·서명(/mail/defaults),
// 첨부(base64, 개당 10MB·합 25MB) → POST /mail/send. 연동 계정 설정은 설정 페이지에서.
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Inbox, Paperclip, PenSquare, Plug, RefreshCw, Send, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'

type MailRow = { uid: string; subject: string; sender: string; date: string }
type MailDetail = MailRow & { to: string; body: string; attachments: string[] }
type MailSettings = { address: string; has_password: boolean }

type SentRow = {
  id: string
  ts: string
  by: string
  to: string[]
  subject: string
  school_id: string | null
  module: string | null
  attachment_names: string[]
}
type SchoolLite = { id: string; name: string }
type SchoolContact = { email: string; name?: string; phone?: string }
type MailDefaults = { default_subject_prefix?: string; signature?: string; default_body?: string }

const MODULE_LABEL: Record<string, string> = {
  inspection: '안전점검', risk: '위험성평가', musculo: '근골격계', education: '교육', compliance: '이행점검',
}
const ATTACH_MAX_EACH = 10 * 1024 * 1024
const ATTACH_MAX_TOTAL = 25 * 1024 * 1024

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}
function fmtTs(ts: string): string {
  // ISO(UTC) → 로컬 'YYYY-MM-DD HH:mm'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type Attachment = { name: string; b64: string; size: number }

/** 파일 → base64(데이터 URI 프리픽스 제거). */
function fileToB64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(new Error(`파일을 읽지 못했습니다: ${f.name}`))
    r.readAsDataURL(f)
  })
}

export function Mail() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [settings, setSettings] = useState<MailSettings | null>(null)
  const [rows, setRows] = useState<MailRow[]>([])
  const [limit, setLimit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<MailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ---- 보낸 업무 메일 탭 ----
  const [sent, setSent] = useState<SentRow[]>([])
  const [sentLoading, setSentLoading] = useState(false)
  const [sentError, setSentError] = useState('')
  const [sentSchool, setSentSchool] = useState('') // 학교 필터('' = 전체)
  const [schools, setSchools] = useState<SchoolLite[]>([])
  const [contacts, setContacts] = useState<Record<string, SchoolContact>>({})
  const [defaults, setDefaults] = useState<MailDefaults>({})
  const [compose, setCompose] = useState(false)
  const [sentToast, setSentToast] = useState('')

  useEffect(() => {
    let alive = true
    api<{ settings: MailSettings }>('/mail/settings')
      .then((d) => { if (alive) setSettings(d.settings) })
      .catch(() => { if (alive) setSettings(null) })
    api<SchoolLite[]>('/schools')
      .then((d) => { if (alive) setSchools(Array.isArray(d) ? d : []) })
      .catch(() => { if (alive) setSchools([]) })
    api<{ contacts: Record<string, SchoolContact> }>('/mail/school-contacts')
      .then((d) => { if (alive) setContacts(d.contacts || {}) })
      .catch(() => { if (alive) setContacts({}) })
    api<{ defaults: MailDefaults }>('/mail/defaults')
      .then((d) => { if (alive) setDefaults(d.defaults || {}) })
      .catch(() => { if (alive) setDefaults({}) })
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

  const loadSent = useCallback((schoolId: string) => {
    setSentLoading(true)
    setSentError('')
    api<SentRow[]>(`/mail/sent${schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : ''}`)
      .then((d) => setSent(Array.isArray(d) ? d : []))
      .catch((e) => setSentError(e instanceof Error ? e.message : '발송 이력 조회 실패'))
      .then(() => setSentLoading(false))
  }, [])

  const connected = !!settings?.has_password
  useEffect(() => {
    if (tab === 'inbox' && connected) load(limit)
  }, [tab, connected, limit, load])
  useEffect(() => {
    if (tab === 'sent') loadSent(sentSchool)
  }, [tab, sentSchool, loadSent])

  const schoolName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of schools) m[s.id] = s.name
    return m
  }, [schools])

  function openMessage(r: MailRow) {
    setDetail({ ...r, to: '', body: '', attachments: [] })
    setDetailLoading(true)
    api<MailDetail>(`/mail/message?uid=${encodeURIComponent(r.uid)}`)
      .then((d) => setDetail(d))
      .catch((e) => setDetail({ ...r, to: '', body: `본문을 불러오지 못했습니다: ${e instanceof Error ? e.message : ''}`, attachments: [] }))
      .then(() => setDetailLoading(false))
  }

  function onMailSent() {
    setCompose(false)
    setSentToast('메일을 발송했습니다.')
    window.setTimeout(() => setSentToast(''), 4000)
    setTab('sent')
    loadSent(sentSchool)
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>메일함</b></div>
      <div className="bar">
        <h2><Inbox size={20} /> 메일함</h2>
        {settings?.address && <span className="pillx doing">{settings.address}</span>}
        <div className="sp" />
        {tab === 'inbox' && connected && !detail && (
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
        {tab === 'sent' && (
          <button className="btn btn-ghost" onClick={() => loadSent(sentSchool)} disabled={sentLoading}>
            <RefreshCw size={14} /> 새로고침
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setCompose(true)}>
          <PenSquare size={14} /> 메일 쓰기
        </button>
        <button className="btn btn-ghost" onClick={() => nav('/settings')}>
          <Plug size={14} /> 연동 설정
        </button>
      </div>

      {/* 탭 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={'btn ' + (tab === 'inbox' ? 'btn-primary' : 'btn-ghost')}
          onClick={() => { setTab('inbox'); setDetail(null) }}
        >
          <Inbox size={14} /> 받은편지함
        </button>
        <button
          className={'btn ' + (tab === 'sent' ? 'btn-primary' : 'btn-ghost')}
          onClick={() => setTab('sent')}
        >
          <Send size={14} /> 보낸 업무 메일
        </button>
        {sentToast && <span className="pillx ok" style={{ alignSelf: 'center' }}>{sentToast}</span>}
      </div>

      {/* ===== 받은편지함 ===== */}
      {tab === 'inbox' && settings !== null && !connected && (
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
      {tab === 'inbox' && connected && detail && (
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
      {tab === 'inbox' && connected && !detail && (
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

      {/* ===== 보낸 업무 메일 ===== */}
      {tab === 'sent' && (
        <div className="ledger">
          <div className="lh">
            <h2><Send size={16} /> 발송 이력</h2>
            <div className="sp" />
            <select className="select" style={{ width: 200 }} value={sentSchool}
              onChange={(e) => setSentSchool(e.target.value)}>
              <option value="">전체 학교</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>시각</th>
                  <th style={{ width: 100 }}>보낸사람</th>
                  <th style={{ width: 200 }}>받는사람</th>
                  <th>제목</th>
                  <th style={{ width: 140 }}>학교</th>
                  <th style={{ width: 90 }}>업무</th>
                  <th style={{ width: 180 }}>첨부</th>
                </tr>
              </thead>
              <tbody>
                {sentLoading && <tr><td colSpan={7}><div className="tstate">발송 이력을 불러오는 중…</div></td></tr>}
                {!sentLoading && sentError && <tr><td colSpan={7}><div className="tstate">오류: {sentError}</div></td></tr>}
                {!sentLoading && !sentError && sent.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtTs(m.ts)}</td>
                    <td>{m.by || '—'}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                      {(m.to || []).join(', ') || '—'}
                    </td>
                    <td><b>{m.subject}</b></td>
                    <td>{m.school_id ? (schoolName[m.school_id] || m.school_id) : '—'}</td>
                    <td>{m.module ? (MODULE_LABEL[m.module] || m.module) : '—'}</td>
                    <td>
                      {(m.attachment_names || []).length
                        ? (m.attachment_names || []).map((a, i) => (
                          <span key={i} className="pillx na" style={{ marginRight: 4 }}>
                            <Paperclip size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />{a}
                          </span>
                        ))
                        : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
                {!sentLoading && !sentError && sent.length === 0 && (
                  <tr><td colSpan={7}><div className="tstate">발송한 업무 메일이 없습니다. 우측 상단 [메일 쓰기]로 보내세요.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {compose && (
        <ComposeModal
          schools={schools}
          contacts={contacts}
          defaults={defaults}
          onClose={() => setCompose(false)}
          onSent={onMailSent}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메일 쓰기 모달 — 학교 선택 시 담당자 이메일 프리필, 제목 접두어·서명 기본값 반영.
// ---------------------------------------------------------------------------
function ComposeModal({
  schools, contacts, defaults, onClose, onSent,
}: {
  schools: SchoolLite[]
  contacts: Record<string, SchoolContact>
  defaults: MailDefaults
  onClose: () => void
  onSent: () => void
}) {
  const nav = useNavigate()
  const prefix = (defaults.default_subject_prefix || '').trim()
  const [schoolId, setSchoolId] = useState('')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(prefix ? `${prefix} ` : '')
  const [body, setBody] = useState(() => {
    const base = defaults.default_body || ''            // 설정 '기본 본문'
    const sig = defaults.signature ? `\n\n${defaults.signature}` : ''
    return base + sig
  })
  const [module, setModule] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [needSetup, setNeedSetup] = useState(false)

  function pickSchool(id: string) {
    setSchoolId(id)
    if (id) {
      const c = contacts[id]
      if (c?.email && !to.trim()) setTo(c.email)
    }
  }

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    setErr('')
    const next = [...files]
    for (const f of list) {
      if (f.size > ATTACH_MAX_EACH) {
        setErr(`첨부파일이 10MB를 초과합니다: ${f.name}`)
        return
      }
      const total = next.reduce((a, x) => a + x.size, 0) + f.size
      if (total > ATTACH_MAX_TOTAL) {
        setErr('첨부파일 합계가 25MB를 초과합니다')
        return
      }
      try {
        const b64 = await fileToB64(f)
        next.push({ name: f.name, b64, size: f.size })
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : '파일 읽기 실패')
        return
      }
    }
    setFiles(next)
  }

  async function send() {
    const recipients = to.split(',').map((s) => s.trim()).filter(Boolean)
    if (!recipients.length) { setErr('받는 사람 이메일을 입력하세요.'); return }
    if (!subject.trim()) { setErr('제목을 입력하세요.'); return }
    setBusy(true)
    setErr('')
    setNeedSetup(false)
    try {
      await api<{ ok: boolean; id: string }>('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: recipients,
          subject: subject.trim(),
          body,
          school_id: schoolId || null,
          module: module || null,
          attachments: files.map((f) => ({ name: f.name, b64: f.b64 })),
        }),
      })
      onSent()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메일 발송 실패'
      // 404: 회사 대표계정(email-integration) 미설정 → 설정 안내
      if (msg.includes('설정되지 않았습니다') || msg.includes('대표계정')) {
        setNeedSetup(true)
        setErr('회사 대표계정(이메일 연동)이 설정되지 않았습니다. 메일 설정에서 대표계정을 등록하세요.')
      } else {
        setErr(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const totalSize = files.reduce((a, f) => a + f.size, 0)

  return (
    <Modal
      title="업무 메일 쓰기"
      wide
      onClose={onClose}
      footer={(
        <>
          {needSetup && (
            <button className="btn btn-ghost" onClick={() => nav('/settings')}>
              <Plug size={14} /> 메일 설정으로 이동
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy}>
            <Send size={14} /> {busy ? '발송 중…' : '보내기'}
          </button>
        </>
      )}
    >
      {err && <div className="login-err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="formrow">
        <label className="field" style={{ minWidth: 220 }}>
          <span>학교 선택 (선택 — 담당자 이메일 자동 입력)</span>
          <select className="select" value={schoolId} onChange={(e) => pickSchool(e.target.value)}>
            <option value="">학교 선택 안 함</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{contacts[s.id]?.email ? ` · ${contacts[s.id].email}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 160 }}>
          <span>업무 (선택)</span>
          <select className="select" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">선택 안 함</option>
            {Object.entries(MODULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="field" style={{ marginTop: 10, display: 'block' }}>
        <span>받는 사람 (여러 명은 쉼표로 구분)</span>
        <input className="input" value={to} placeholder="school@example.kr, admin@example.kr"
          onChange={(e) => setTo(e.target.value)} style={{ width: '100%' }} />
      </label>
      <label className="field" style={{ marginTop: 10, display: 'block' }}>
        <span>제목</span>
        <input className="input" value={subject} placeholder="제목"
          onChange={(e) => setSubject(e.target.value)} style={{ width: '100%' }} />
      </label>
      <label className="field" style={{ marginTop: 10, display: 'block' }}>
        <span>본문</span>
        <textarea className="input" value={body} rows={8}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
      </label>
      <div style={{ marginTop: 12 }}>
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
          <Paperclip size={14} /> 파일 첨부
          <input type="file" multiple style={{ display: 'none' }} onChange={(e) => void addFiles(e)} />
        </label>
        <span className="muted" style={{ marginLeft: 10, fontSize: 11.5 }}>
          개당 10MB · 합계 25MB 이하 {files.length > 0 && `(현재 ${fmtBytes(totalSize)})`}
        </span>
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {files.map((f, i) => (
              <span key={i} className="pillx na" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Paperclip size={11} />{f.name} · {fmtBytes(f.size)}
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'inherit' }}
                  aria-label="첨부 제거"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
        보내는 사람은 <b>회사 대표계정</b>(설정 → 개인 이메일 연동)입니다. 발송한 메일은 [보낸 업무 메일] 탭에 기록됩니다.
      </div>
    </Modal>
  )
}
