// [169] 담당자에게 보내기 창 — 받는 점검자(점검자 기본) · 보낸 사람(전화 받은 사람 기본, 점검자가 다시 물어볼 사람)
//       · 전달할 내용(등록 내용 기본). 불만은 보내지 않는다(목록·처리 창에서 버튼 없음).
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { type ContactMeta, type MetaDoc, META_KEY, kindLabel, nowIso, patchItem } from './contactData'
import type { Person } from './ContactModal'
import '../../styles/contact.css'

type Props = {
  id: string
  date: string
  schoolName: string
  content: string
  meta: ContactMeta
  inspectors: Person[]
  me: string
  phoneOf: (name: string) => string
  onClose: () => void
  onSaved: (doc: MetaDoc) => void
}

export default function ContactSendModal({ id, date, schoolName, content, meta, inspectors, me, phoneOf, onClose, onSaved }: Props) {
  // [169] 받는 점검자 = 점검자(기본). 이름으로 고르고, 계정이 있으면 계정 아이디도 함께 저장
  const [to, setTo] = useState(meta.send?.to_name || meta.inspector || '')
  const toAcc = inspectors.find((p) => p.name === to)
  const [by, setBy] = useState(meta.send?.by || meta.receiver || me)
  const [text, setText] = useState(meta.send?.text || content)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const phone = phoneOf(by.trim())

  async function send() {
    if (!to) { setErr('받는 점검자를 고르세요.'); return }
    const p = { login: toAcc?.login || '', name: to }
    if (!by.trim()) { setErr('보낸 사람을 입력하세요.'); return }
    if (!text.trim()) { setErr('전달할 내용을 입력하세요.'); return }
    setBusy(true); setErr('')
    try {
      const again = !!meta.send
      const doc = await patchItem<ContactMeta>(META_KEY, id, (cur) => {
        const base = { ...(cur ?? meta) }
        return {
          ...base,
          send: { to_login: p.login, to_name: p.name, text: text.trim(), ts: nowIso(), by: by.trim(), ...(phone ? { by_phone: phone } : {}) },
          closed: undefined, closed_ts: undefined,
          log: [...(base.log ?? []), { ts: nowIso(), by: me, what: `${again ? '다시 보내기' : '보내기'} → ${p.name} (보낸 사람 ${by.trim()})` }],
        }
      })
      onSaved(doc as MetaDoc)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '보내기 실패')
      setBusy(false)
    }
  }

  return (
    <Modal title={meta.send ? '담당자에게 다시 보내기' : '담당자에게 보내기'} width={620} onClose={onClose}
      footer={<>
        {err && <span className="ct-err">{err}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void send()}><Send size={14} /> {busy ? '보내는 중…' : '보내기'}</button>
      </>}>
      <div className="ct-modal">
        <div className="ct-sendhead"><span className={'ct-kind k-' + (['request', 'info'].includes(meta.kind) ? meta.kind : 'custom')}>{kindLabel(meta)}</span>
          <b>{schoolName}</b> · {date}{meta.type ? ` · ${meta.type}` : ''}</div>
        <div className="ct-grid2b">
          <label className="field"><span>받는 점검자</span>
            <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">선택</option>
              {meta.inspector && !inspectors.some((p) => p.name === meta.inspector) && <option value={meta.inspector}>{meta.inspector}</option>}
              {inspectors.map((p) => <option key={p.login} value={p.name}>{p.name}</option>)}
            </select>
            {to && !toAcc && <small className="ct-warn">점검자 계정이 없는 이름이라 홈에 표시되지 않을 수 있습니다(계정·권한 탭에서 같은 이름으로 계정 등록 필요).</small>}
          </label>
          <label className="field"><span>보낸 사람 <small className="muted">— 점검자가 다시 물어볼 사람</small></span>
            <div className="ct-by">
              <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="이름" />
              {phone && <span className="muted">{phone}</span>}
            </div></label>
        </div>
        <label className="field"><span>전달할 내용</span>
          <textarea className="input ct-ta" value={text} onChange={(e) => setText(e.target.value)} placeholder="점검자 홈 '내 현장 메모'에 표시될 내용" /></label>
        <div className="muted" style={{ fontSize: 11.5 }}>점검자 홈에는 전달할 내용과 보낸 사람{phone ? '(연락처 포함)' : ''}이 표시됩니다.</div>
      </div>
    </Modal>
  )
}
