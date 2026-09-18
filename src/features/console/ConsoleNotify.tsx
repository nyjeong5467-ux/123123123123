// 경영 콘솔 — 알림 설정(교육청 전송 탭 하위 섹션).
// 텔레그램 + 카카오톡('나에게 보내기') 채널 토큰과 이벤트별 on/off를 org_docs
// 'notify-settings' KV에 저장하는 설정 파사드. 백엔드 Notifier는 env로 주입되므로
// 실제 반영은 서버 재기동 후(안내 문구). 토큰은 절대 URL/쿼리에 넣지 않는다(POST body만).
import { useEffect, useState } from 'react'
import { Bell, Info, Save } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'

type Channel = { enabled: boolean; [k: string]: string | boolean }
type NotifySettings = {
  telegram: { enabled: boolean; bot_token: string; chat_id: string }
  kakao: { enabled: boolean; rest_api_key: string; refresh_token: string }
  events: { eduoffice_result: boolean; submit: boolean; review: boolean }
}

const DEFAULT: NotifySettings = {
  telegram: { enabled: false, bot_token: '', chat_id: '' },
  kakao: { enabled: false, rest_api_key: '', refresh_token: '' },
  events: { eduoffice_result: true, submit: true, review: true },
}

// 저장된 토큰은 마스킹해 보여준다(마지막 4자만). 편집 시작 시 실제값으로 교체.
function mask(v: string): string {
  if (!v) return ''
  return v.length <= 4 ? '••••' : '••••••' + v.slice(-4)
}

const EVENT_LABELS: { key: keyof NotifySettings['events']; label: string; desc: string }[] = [
  { key: 'eduoffice_result', label: '교육청 전송 결과', desc: '봇이 교육청에 전송 성공·실패했을 때' },
  { key: 'submit', label: '현장 제출', desc: '조사원이 점검·조사를 제출했을 때' },
  { key: 'review', label: '검수 필요', desc: '증상조사표 OMR 인식 검수가 필요할 때' },
]

export default function ConsoleNotify() {
  const [saved, setSaved] = useState<NotifySettings>(DEFAULT)
  const [draft, setDraft] = useState<NotifySettings>(DEFAULT)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    api<{ doc: Partial<NotifySettings> }>('/ops/docs/notify-settings')
      .then((d) => {
        if (!alive) return
        const doc = d?.doc || {}
        const merged: NotifySettings = {
          telegram: { ...DEFAULT.telegram, ...(doc.telegram || {}) },
          kakao: { ...DEFAULT.kakao, ...(doc.kakao || {}) },
          events: { ...DEFAULT.events, ...(doc.events || {}) },
        }
        setSaved(merged)
        setDraft(merged)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await api('/ops/docs/notify-settings', {
        method: 'PUT',
        body: JSON.stringify({ doc: draft }),
      })
      setSaved(draft)
      setEditing(false)
      setMsg('저장되었습니다 · 서버 재기동 후 반영됩니다')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function setCh<K extends 'telegram' | 'kakao'>(ch: K, patch: Partial<NotifySettings[K]>) {
    setDraft((d) => ({ ...d, [ch]: { ...d[ch], ...patch } as Channel }))
  }

  const tokenField = (
    label: string, ch: 'telegram' | 'kakao', key: string, ph: string,
  ) => (
    <label className="field" style={{ flex: 1, minWidth: 220 }}>
      <span>{label}</span>
      <input
        className="input"
        type={editing ? 'text' : 'password'}
        value={editing ? String((draft[ch] as Channel)[key] ?? '') : mask(String((saved[ch] as Channel)[key] ?? ''))}
        placeholder={ph}
        readOnly={!editing}
        autoComplete="off"
        onChange={(e) => setCh(ch, { [key]: e.target.value } as never)}
      />
    </label>
  )

  return (
    <div className="ledger" style={{ marginBottom: 24 }}>
      <div className="lh">
        <h2><Bell size={18} /> 알림 설정</h2>
        <div className="sp" />
        {msg && <span className="pillx ok">{msg}</span>}
        {!editing ? (
          <button className="btn btn-ghost" onClick={() => { setDraft(saved); setEditing(true) }}>편집</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => { setDraft(saved); setEditing(false) }}>취소</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? '저장 중…' : '저장'}
            </button>
          </>
        )}
      </div>
      <div className="card-body" style={{ padding: '18px 26px' }}>
        <div className="pillx na" style={{ marginBottom: 14 }}>
          <Info size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          토큰은 서버 환경변수로 주입됩니다 — 여기 저장한 값은 <b>서버 재기동 후</b> 반영됩니다.
        </div>

        {/* 텔레그램 */}
        <div style={{ marginBottom: 18 }}>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={draft.telegram.enabled}
              disabled={!editing}
              onChange={(e) => setCh('telegram', { enabled: e.target.checked })}
            />
            <b>텔레그램</b>
            {saved.telegram.enabled && <span className="pillx ok">사용</span>}
          </label>
          <div className="formrow">
            {tokenField('봇 토큰', 'telegram', 'bot_token', '123456:ABC…')}
            {tokenField('Chat ID', 'telegram', 'chat_id', '예: -100123…')}
          </div>
        </div>

        {/* 카카오톡 */}
        <div style={{ marginBottom: 18 }}>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={draft.kakao.enabled}
              disabled={!editing}
              onChange={(e) => setCh('kakao', { enabled: e.target.checked })}
            />
            <b>카카오톡</b>
            <span className="muted" style={{ fontSize: 12 }}>나에게 보내기(메모)</span>
            <InfoTip>학교·교사 대상 대량 알림톡(비즈메시지)은 사업용 채널·템플릿 승인이 별도로 필요합니다.</InfoTip>
            {saved.kakao.enabled && <span className="pillx ok">사용</span>}
          </label>
          <div className="formrow">
            {tokenField('REST API 키', 'kakao', 'rest_api_key', '카카오 developers REST 키')}
            {tokenField('Refresh Token', 'kakao', 'refresh_token', 'talk_message 동의 후 취득')}
          </div>
        </div>

        {/* 이벤트 on/off */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>알림 이벤트</div>
          {EVENT_LABELS.map(({ key, label, desc }) => (
            <label key={key} className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={draft.events[key]}
                disabled={!editing}
                onChange={(e) => setDraft((d) => ({ ...d, events: { ...d.events, [key]: e.target.checked } }))}
              />
              <b style={{ minWidth: 120 }}>{label}</b>
              <span className="muted" style={{ fontSize: 12.5 }}>{desc}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
