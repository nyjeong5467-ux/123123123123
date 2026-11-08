// [167] 연락 이력 처리 창(관리자) — 구분·유형·관련 점검자 수정(수정 기록), 관리자 조치 내용,
//       [담당자에게 보내기](전달할 내용만 점검자 홈에 표시), 완료 처리, 등록 취소(삭제 없음).
import { useState } from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, Send } from 'lucide-react'
import { Modal } from '../../components/Modal'
import {
  type Ack, type ContactMeta, type Kind, type MetaDoc, type Status, KINDS, KIND_LABEL, META_KEY, STATUS_LABEL, STATUS_PILL,
  fmtTs, nowIso, patchItem,
} from './contactData'
import '../../styles/contact.css'

export type Person = { login: string; name: string }
type Props = {
  id: string
  date: string
  schoolName: string
  content: string
  meta: ContactMeta
  status: Status
  ack?: Ack
  inspectors: Person[]
  me: string
  onClose: () => void
  onSaved: (doc: MetaDoc) => void
  onAssign: (fromName: string) => void
}

export default function ContactModal({ id, date, schoolName, content, meta, status, ack, inspectors, me, onClose, onSaved, onAssign }: Props) {
  const [kind, setKind] = useState<Kind>(meta.kind)
  const [type, setType] = useState(meta.type || '')
  const [insp, setInsp] = useState(meta.inspector || '')
  const [note, setNote] = useState(meta.note || '')
  const [to, setTo] = useState(meta.send?.to_login || inspectors.find((p) => p.name === meta.inspector)?.login || '')
  const [text, setText] = useState(meta.send?.text || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const closed = status === 'done' || status === 'canceled'
  const types = KINDS.find((k) => k.key === kind)?.types ?? []

  async function save(extra: (m: ContactMeta) => Partial<ContactMeta>, what: string[]) {
    setBusy(true); setErr('')
    try {
      const doc = await patchItem<ContactMeta>(META_KEY, id, (cur) => {
        const base: ContactMeta = { ...(cur ?? meta) }
        const changes: string[] = []
        if (base.kind !== kind) changes.push(`구분 ${KIND_LABEL[base.kind]}→${KIND_LABEL[kind]}`)
        if ((base.type || '') !== type) changes.push(`유형 ${base.type || '없음'}→${type || '없음'}`)
        if ((base.inspector || '') !== insp) changes.push(`관련 점검자 ${base.inspector || '없음'}→${insp || '없음'}`)
        if ((base.note || '') !== note) changes.push('조치 내용 수정')
        const next: ContactMeta = {
          ...base, kind, type, inspector: insp,
          inspector_login: inspectors.find((p) => p.name === insp)?.login || '', note,
        }
        const all = [...changes, ...what]
        return { ...next, ...extra(next), log: [...(base.log ?? []), ...(all.length ? [{ ts: nowIso(), by: me, what: all.join(' · ') }] : [])] }
      })
      onSaved(doc as MetaDoc)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  function send() {
    const p = inspectors.find((x) => x.login === to)
    if (!p) { setErr('받는 사람을 고르세요.'); return }
    if (!text.trim()) { setErr('전달할 내용을 입력하세요.'); return }
    const again = !!meta.send
    void save(() => ({ send: { to_login: p.login, to_name: p.name, text: text.trim(), ts: nowIso(), by: me }, closed: undefined, closed_ts: undefined }),
      [`${again ? '다시 보내기' : '보내기'} → ${p.name}`])
  }

  const act = ack?.act
  return (
    <Modal width={720} title={<>처리 · {date} {schoolName}</>} onClose={onClose}
      footer={<>
        {err && <span className="ct-err">{err}</span>}
        {!closed && <button className="btn btn-ghost ct-cancel" disabled={busy}
          onClick={() => { if (window.confirm('등록 취소로 바꿀까요? (기록은 지워지지 않고 목록에 흐리게 남습니다)')) void save(() => ({ closed: 'canceled', closed_ts: nowIso() }), ['등록 취소']) }}>
          <Ban size={14} /> 등록 취소</button>}
        {closed && <button className="btn btn-ghost" disabled={busy} onClick={() => void save(() => ({ closed: undefined, closed_ts: undefined }), ['완료·취소 되돌림'])}>되돌리기</button>}
        <span className="sp" style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
        {!closed && <button className="btn btn-ghost" disabled={busy} onClick={() => void save(() => ({ closed: 'done', closed_ts: nowIso() }), ['완료 처리'])}><CheckCircle2 size={14} /> 완료 처리</button>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void save(() => ({}), [])}>저장</button>
      </>}>
      <div className="ct-modal">
        <div className="ct-kv">
          <b>상태</b><span><span className={'pillx ' + STATUS_PILL[status]}>{STATUS_LABEL[status]}</span></span>
          <b>원문</b><span className="ct-orig">{content}</span>
        </div>

        <div className="ct-grid3">
          <label className="field"><span>구분</span>
            <select className="select" value={kind} disabled={closed} onChange={(e) => { const k = e.target.value as Kind; setKind(k); setType(KINDS.find((x) => x.key === k)?.types[0] || '') }}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></label>
          <label className="field"><span>유형</span>
            <select className="select" value={type} disabled={closed} onChange={(e) => setType(e.target.value)}>
              <option value="">선택 안 함</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label className="field"><span>관련 점검자</span>
            <select className="select" value={insp} disabled={closed} onChange={(e) => setInsp(e.target.value)}>
              <option value="">없음</option>
              {insp && !inspectors.some((p) => p.name === insp) && <option value={insp}>{insp}</option>}
              {inspectors.map((p) => <option key={p.login} value={p.name}>{p.name}</option>)}
            </select></label>
        </div>

        {kind === 'complaint' && type === '점검자 교체 요청' && (
          <div className="ct-call"><ArrowLeftRight size={15} /> 점검자 교체 요청입니다
            <span className="sp" style={{ flex: 1 }} />
            <button className="btn btn-primary ct-xs" onClick={() => onAssign(insp)}>담당학교 변경 열기</button>
          </div>
        )}

        <label className="field"><span>조치 내용 <small className="muted">(관리자만 보임)</small></span>
          <textarea className="input ct-ta" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 11/10 점검자 면담 예정" /></label>

        <div className="ct-send">
          <h4><Send size={14} /> 담당자에게 보내기
            {meta.send && <small className="muted"> · {fmtTs(meta.send.ts)} {meta.send.to_name}에게 보냄</small>}</h4>
          {meta.send && (
            <div className="ct-track">
              <span className={ack?.ack_ts ? 'on' : ''}>확인 {ack?.ack_ts ? fmtTs(ack.ack_ts) : '전'}</span>
              {kind !== 'info' && <span className={act ? 'on' : ''}>조치 완료 {act ? fmtTs(act.ts) : '전'}</span>}
              {act && <div className="ct-act"><b>점검자 조치</b> {act.text}</div>}
            </div>
          )}
          <div className="ct-grid2">
            <label className="field"><span>받는 사람</span>
              <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">선택</option>
                {inspectors.map((p) => <option key={p.login} value={p.login}>{p.name}{p.name === insp ? ' (관련 점검자)' : ''}</option>)}
              </select></label>
            <label className="field"><span>전달할 내용 <small className="muted">— 원문 대신 다듬어서</small></span>
              <textarea className="input ct-ta" value={text} onChange={(e) => setText(e.target.value)} placeholder="점검자 홈 '내 현장 메모'에 표시될 내용" /></label>
          </div>
          <div className="ct-send-foot">
            <span className="muted">원문·조치 내용은 보내지 않습니다. 이 칸의 내용만 점검자 홈에 표시됩니다.</span>
            <button className="btn btn-primary ct-xs" disabled={busy} onClick={send}><Send size={13} /> {meta.send ? '다시 보내기' : '보내기'}</button>
          </div>
        </div>

        {(meta.log?.length ?? 0) > 0 && (
          <details className="ct-log">
            <summary>수정 기록 {meta.log!.length}건</summary>
            {[...meta.log!].reverse().map((l, i) => <div key={i}><span className="muted">{fmtTs(l.ts)} · {l.by}</span> {l.what}</div>)}
          </details>
        )}
      </div>
    </Modal>
  )
}
