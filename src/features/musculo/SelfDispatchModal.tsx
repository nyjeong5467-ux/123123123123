// 근골격계 자가작성 일괄전송 — 개인별(로스터) 웹 콘솔 (Phase 2)
// 학교 컨텍스트에서 (1) 개인 수신자 로스터 관리, (2) 개인별 발송, (3) 개인 단위 현황,
// (4) 미제출자 수동 리마인드 를 한 모달에서 처리한다.
// API 계약(백엔드 확정):
//   GET  /musculo/recipients?school_id=            → {school_id, recipients:[...]}
//   PUT  /musculo/recipients {school_id,recipients} → {ok, school_id, recipients:[정규화]}
//   POST /field/musculo/dispatch {school_id,target:"roster",channels?,recipient_ids?}
//   GET  /field/musculo/dispatch/{batch_id}
//   POST /field/musculo/dispatch/{batch_id}/remind
// 미동의(consent=false) 수신자는 서버가 발송 대상에서 제외한다(개인정보 근거).
import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, Copy, Plus, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/Modal'
import { InfoTip } from '../../components/InfoTip'

type Recipient = {
  id?: string
  name: string
  part: string
  phone: string
  consent: boolean
  consent_at?: string | null
  created_by?: string | null
  created_at?: string | null
}
type ChannelResult = { channel: string; status: string; detail?: string; share_action?: unknown }
type PerRecipient = {
  recipient_id: string
  name: string
  part?: string
  phone?: string
  channels_result: ChannelResult[]
  opened: number
  submitted_at?: string | null
  remind_count: number
  last_remind_at?: string | null
  token?: string
  link?: string
}
type ShareAction = { channel: string; recipient_name: string; phone: string; message: string; link: string }
type DispatchResult = {
  batch_id: string
  mode: string
  status: string
  channels?: string[]
  recipients_total: number
  sent_count: number
  skipped_unconsented: { recipient_id: string; name: string }[]
  per_recipient: PerRecipient[]
  share_actions: ShareAction[]
}
type StatusResult = {
  batch_id: string
  mode: string
  opens: number
  submits: number
  status: string
  per_recipient: PerRecipient[]
}

// 발송 채널 — 미선택 시 채널을 생략(서버가 테넌트 기본 활성 채널 사용). 웹에서는 무인 채널
// (알림톡/문자)이 실발송되므로 이를 권장하고, 카카오 공유는 링크를 사람이 직접 공유해야 한다.
const CHANNEL_OPTS: { value: string; label: string; hint?: string }[] = [
  { value: 'alimtalk', label: '알림톡' },
  { value: 'sms', label: '문자(SMS)' },
  { value: 'email', label: '이메일' },
  { value: 'kakao_share', label: '카카오 공유', hint: '링크 직접 공유' },
]
const CHANNEL_LABEL: Record<string, string> = {
  alimtalk: '알림톡', sms: '문자', email: '이메일', kakao_share: '카카오 공유', '-': '—',
}
const CH_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: '발송', cls: 'ok' },
  deferred_to_app: { label: '공유 대기', cls: 'doing' },
  skipped: { label: '제외', cls: 'na' },
  failed: { label: '실패', cls: 'warn' },
}

const BATCH_KEY = (sid: string) => `mus_dispatch_batch_${sid}`

function chSummary(cr: ChannelResult[]): { label: string; cls: string } {
  if (!cr || !cr.length) return { label: '—', cls: 'na' }
  if (cr.some((c) => c.status === 'sent')) return CH_STATUS.sent
  if (cr.some((c) => c.status === 'deferred_to_app')) return CH_STATUS.deferred_to_app
  if (cr.some((c) => c.status === 'skipped')) return CH_STATUS.skipped
  return CH_STATUS.failed
}

export function SelfDispatchModal({
  school, onClose,
}: {
  school: { id: string; name: string; manager?: string }
  onClose: () => void
}) {
  const [tab, setTab] = useState<'roster' | 'dispatch'>('roster')

  // ── 로스터 ──
  const [rows, setRows] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [rosterMsg, setRosterMsg] = useState('')
  const [rosterErr, setRosterErr] = useState('')

  const loadRoster = useCallback(() => {
    setLoading(true)
    setRosterErr('')
    api<{ recipients: Recipient[] }>(`/musculo/recipients?school_id=${school.id}`)
      .then((d) => { setRows(Array.isArray(d?.recipients) ? d.recipients : []); setDirty(false) })
      .catch((e) => setRosterErr(e instanceof Error ? e.message : '로스터 조회 실패'))
      .then(() => setLoading(false))
  }, [school.id])

  useEffect(() => { loadRoster() }, [loadRoster])

  function updateRow(i: number, patch: Partial<Recipient>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setDirty(true)
    setRosterMsg('')
  }
  function addRow() {
    setRows((rs) => [...rs, { name: '', part: '', phone: '', consent: false }])
    setDirty(true)
    setRosterMsg('')
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i))
    setDirty(true)
    setRosterMsg('')
  }

  async function saveRoster() {
    setSaving(true)
    setRosterErr('')
    setRosterMsg('')
    try {
      const payload = rows
        .filter((r) => r.name.trim() || r.phone.trim())
        .map((r) => ({
          id: r.id, name: r.name.trim(), part: r.part.trim(),
          phone: r.phone.trim(), consent: !!r.consent,
        }))
      const res = await api<{ recipients: Recipient[] }>('/musculo/recipients', {
        method: 'PUT',
        body: JSON.stringify({ school_id: school.id, recipients: payload }),
      })
      setRows(Array.isArray(res?.recipients) ? res.recipients : [])
      setDirty(false)
      setRosterMsg(`저장 완료 — 수신자 ${res?.recipients?.length ?? 0}명 (동의 ${(res?.recipients || []).filter((r) => r.consent).length}명)`)
    } catch (e) {
      setRosterErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const consentCount = rows.filter((r) => r.consent).length

  // ── 발송 ──
  const [channels, setChannels] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<DispatchResult | null>(null)
  const [dispatchErr, setDispatchErr] = useState('')

  function toggleChannel(v: string) {
    setChannels((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n })
  }

  async function sendDispatch() {
    if (dirty) { setDispatchErr('로스터를 먼저 저장한 뒤 발송하세요.'); setTab('roster'); return }
    setSending(true)
    setDispatchErr('')
    try {
      const body: Record<string, unknown> = { school_id: school.id, target: 'roster' }
      if (channels.size) body.channels = [...channels]
      const res = await api<DispatchResult>('/field/musculo/dispatch', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult(res)
      if (res?.batch_id) {
        setBatchId(res.batch_id)
        localStorage.setItem(BATCH_KEY(school.id), res.batch_id)
        setStatus({
          batch_id: res.batch_id, mode: res.mode, opens: 0, submits: 0,
          status: res.status, per_recipient: res.per_recipient || [],
        })
      }
    } catch (e) {
      setDispatchErr(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }

  // ── 현황 / 리마인드 ──
  const [batchId, setBatchId] = useState<string>(() => localStorage.getItem(BATCH_KEY(school.id)) || '')
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusErr, setStatusErr] = useState('')
  const [reminding, setReminding] = useState(false)
  const [remindMsg, setRemindMsg] = useState('')

  const loadStatus = useCallback((bid: string) => {
    if (!bid) return
    setStatusLoading(true)
    setStatusErr('')
    api<StatusResult>(`/field/musculo/dispatch/${bid}`)
      .then((d) => setStatus(d))
      .catch((e) => setStatusErr(e instanceof Error ? e.message : '현황 조회 실패'))
      .then(() => setStatusLoading(false))
  }, [])

  // 저장된 배치가 있으면 발송 탭 진입 시 현황 자동 로드
  useEffect(() => {
    if (tab === 'dispatch' && batchId && !status) loadStatus(batchId)
  }, [tab, batchId, status, loadStatus])

  async function remind() {
    if (!batchId) return
    setReminding(true)
    setRemindMsg('')
    setStatusErr('')
    try {
      const res = await api<{ reminded: number; per_recipient: PerRecipient[]; share_actions: ShareAction[] }>(
        `/field/musculo/dispatch/${batchId}/remind`, { method: 'POST' },
      )
      setRemindMsg(`미제출자 ${res?.reminded ?? 0}명에게 재발송했습니다.`)
      loadStatus(batchId)
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : '리마인드 실패')
    } finally {
      setReminding(false)
    }
  }

  // ── 클립보드 ──
  const [copied, setCopied] = useState('')
  function copy(text: string, key: string) {
    if (!text) return
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? '' : k)), 1500)
    }).catch(() => { /* 클립보드 미지원 */ })
  }

  const per = status?.per_recipient || []
  const submittedCount = per.filter((p) => p.submitted_at).length
  const pendingCount = per.filter((p) => !p.submitted_at && p.token).length // 미동의(토큰없음) 제외

  return (
    <Modal
      title="근골격계 자가작성 발송 (개인별)"
      onClose={onClose}
      wide
      footer={<button className="btn btn-ghost" onClick={onClose}>닫기</button>}
    >
      <div className="muted" style={{ marginTop: -4, fontSize: 12.5 }}>
        <b style={{ color: 'var(--ink)' }}>{school.name}</b> · 담당자 {school.manager || '—'}
      </div>

      {/* 서브 탭 */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
        <button
          className={'btn ' + (tab === 'roster' ? 'btn-primary' : 'btn-ghost')}
          style={{ borderRadius: '10px 10px 0 0' }}
          onClick={() => setTab('roster')}
        >
          <Users size={14} /> 수신자 로스터 {rows.length > 0 && <span className="pillx doing" style={{ marginLeft: 4 }}>{rows.length}</span>}
        </button>
        <button
          className={'btn ' + (tab === 'dispatch' ? 'btn-primary' : 'btn-ghost')}
          style={{ borderRadius: '10px 10px 0 0' }}
          onClick={() => setTab('dispatch')}
        >
          <Send size={14} /> 발송 · 현황
        </button>
      </div>

      {/* ═══════════ 로스터 ═══════════ */}
      {tab === 'roster' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.6, background: 'var(--bg)', padding: '10px 12px', borderRadius: 10 }}>
            개인정보 보호를 위해 <b style={{ color: 'var(--ink)' }}>수신 동의를 확보한 경우에만</b> 동의 체크박스를 선택하세요.
            미동의 수신자는 발송 대상에서 자동 제외됩니다.
          </div>

          {rosterErr && <div className="login-err">{rosterErr}</div>}

          <div className="twrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 110 }}>이름</th>
                  <th style={{ minWidth: 90 }}>파트/부서</th>
                  <th style={{ minWidth: 130 }}>휴대전화</th>
                  <th className="c" style={{ width: 70 }}>수신동의</th>
                  <th style={{ width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
                {!loading && rows.map((r, i) => (
                  <tr key={r.id || `new-${i}`}>
                    <td>
                      <input className="input" value={r.name} placeholder="성명"
                        onChange={(e) => updateRow(i, { name: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={r.part} placeholder="예: 급식"
                        onChange={(e) => updateRow(i, { part: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={r.phone} placeholder="010-0000-0000" inputMode="tel"
                        onChange={(e) => updateRow(i, { phone: e.target.value })} />
                    </td>
                    <td className="c">
                      <input type="checkbox" checked={!!r.consent}
                        style={{ accentColor: 'var(--violet)', width: 17, height: 17 }}
                        onChange={(e) => updateRow(i, { consent: e.target.checked })} />
                    </td>
                    <td className="c">
                      <button className="btn btn-ghost" title="삭제" style={{ padding: '4px 8px' }}
                        onClick={() => removeRow(i)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={5}><div className="tstate">등록된 수신자가 없습니다. 아래 [수신자 추가]로 등록하세요.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={addRow}><Plus size={14} /> 수신자 추가</button>
            <span className="muted" style={{ fontSize: 12 }}>총 {rows.length}명 · 동의 {consentCount}명</span>
            <div style={{ flex: 1 }} />
            {rosterMsg && <span className="pillx ok" style={{ fontSize: 12 }}>{rosterMsg}</span>}
            <button className="btn btn-primary" onClick={() => void saveRoster()} disabled={saving || !dirty}>
              {saving ? '저장 중…' : dirty ? '로스터 저장' : '저장됨'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ 발송 · 현황 ═══════════ */}
      {tab === 'dispatch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 발송 */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>발송 채널 (미선택 시 기본 활성 채널)<InfoTip>알림톡·문자·이메일은 서버가 즉시 발송합니다. 카카오 공유는 링크를 사람이 직접 전달해야 하므로, 발송 후 아래 [카카오 공유 링크]에서 복사해 공유하세요. 미동의 수신자는 자동 제외됩니다.</InfoTip></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CHANNEL_OPTS.map((c) => (
                <label key={c.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
                    border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer',
                    background: channels.has(c.value) ? 'var(--violet-soft)' : 'var(--card)', fontSize: 12.5,
                  }}>
                  <input type="checkbox" checked={channels.has(c.value)}
                    style={{ accentColor: 'var(--violet)' }}
                    onChange={() => toggleChannel(c.value)} />
                  {c.label}{c.hint && <span className="muted" style={{ fontSize: 11 }}>· {c.hint}</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => void sendDispatch()} disabled={sending || consentCount === 0}>
                <Send size={14} /> {sending ? '발송 중…' : `개인별 발송 (동의 ${consentCount}명)`}
              </button>
              {consentCount === 0 && <span className="muted" style={{ fontSize: 12 }}>동의한 수신자가 없습니다. 로스터 탭에서 등록·저장하세요.</span>}
              {dispatchErr && <span style={{ color: 'var(--red-ink)', fontSize: 12.5 }}>오류: {dispatchErr}</span>}
            </div>
          </div>

          {/* 발송 요약 */}
          {result && (
            <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
              <div className="kv"><b>발송 결과</b>
                <span>
                  <span className="pillx ok">발송 {result.sent_count}명</span>{' '}
                  <span className="pillx doing">대상 {result.recipients_total}명</span>{' '}
                  {result.skipped_unconsented.length > 0 && <span className="pillx na">미동의 제외 {result.skipped_unconsented.length}명</span>}
                </span>
              </div>
              {result.skipped_unconsented.length > 0 && (
                <div className="kv"><b>제외(미동의)</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {result.skipped_unconsented.map((s) => s.name || s.recipient_id).join(', ')}
                  </span>
                </div>
              )}
              {/* 카카오 공유 링크 목록(사람이 직접 공유) */}
              {result.share_actions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
                    카카오 공유 링크 — 직접 공유 필요 ({result.share_actions.length}건)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.share_actions.map((sa, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                        <span style={{ minWidth: 90 }}><b>{sa.recipient_name}</b></span>
                        <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sa.link}</span>
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }}
                          onClick={() => copy(sa.link, `link-${i}`)}>
                          {copied === `link-${i}` ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 링크</>}
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }}
                          onClick={() => copy(sa.message, `msg-${i}`)}>
                          {copied === `msg-${i}` ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 메시지</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 개인 단위 현황 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>개인 단위 현황<InfoTip>제출 여부는 공개 폼(자가작성) 제출 시각 기준으로 갱신됩니다. 미제출자에게만 동일 링크로 재발송됩니다.</InfoTip></div>
              {status && (
                <span className="muted" style={{ fontSize: 12 }}>
                  제출 {submittedCount} · 미제출 {pendingCount} · 열람 {status.opens}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {batchId && (
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12 }}
                  onClick={() => loadStatus(batchId)} disabled={statusLoading}>
                  <RefreshCw size={13} /> {statusLoading ? '갱신 중…' : '새로고침'}
                </button>
              )}
              {batchId && (
                <button className="btn btn-primary" style={{ padding: '5px 11px', fontSize: 12 }}
                  onClick={() => void remind()} disabled={reminding || pendingCount === 0}>
                  <Bell size={13} /> {reminding ? '재발송 중…' : '미제출자 리마인드'}
                </button>
              )}
            </div>
            {remindMsg && <div className="pillx ok" style={{ fontSize: 12, marginBottom: 8 }}>{remindMsg}</div>}
            {statusErr && <div className="login-err" style={{ marginBottom: 8 }}>{statusErr}</div>}

            {!batchId && <div className="tstate">아직 발송 이력이 없습니다. 위에서 [개인별 발송]을 실행하세요.</div>}

            {batchId && (
              <div className="twrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>파트</th>
                      <th>전화</th>
                      <th className="c">채널</th>
                      <th className="c">열람</th>
                      <th className="c">제출</th>
                      <th className="c">리마인드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusLoading && per.length === 0 && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                    {per.map((p) => {
                      const cs = chSummary(p.channels_result)
                      const chDetail = (p.channels_result || [])
                        .map((c) => `${CHANNEL_LABEL[c.channel] || c.channel}: ${CH_STATUS[c.status]?.label || c.status}${c.detail ? ` (${c.detail})` : ''}`)
                        .join('\n')
                      return (
                        <tr key={p.recipient_id}>
                          <td><b>{p.name}</b></td>
                          <td>{p.part || '—'}</td>
                          <td className="muted">{p.phone || '—'}</td>
                          <td className="c"><span className={'pillx ' + cs.cls} title={chDetail}>{cs.label}</span></td>
                          <td className="c">{p.opened > 0 ? <span className="pillx doing">열람</span> : <span className="muted">—</span>}</td>
                          <td className="c">
                            {p.submitted_at
                              ? <span className="pillx ok" title={p.submitted_at}>제출</span>
                              : p.token ? <span className="pillx warn">미제출</span> : <span className="pillx na">제외</span>}
                          </td>
                          <td className="c">{p.remind_count > 0 ? `${p.remind_count}회` : '—'}</td>
                        </tr>
                      )
                    })}
                    {!statusLoading && per.length === 0 && (
                      <tr><td colSpan={7}><div className="tstate">현황 데이터가 없습니다.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
