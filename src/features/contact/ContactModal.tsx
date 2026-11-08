// [167] 연락 이력 처리 창(관리자) — 구분·유형·점검자 수정(수정 기록), 관리자 조치 내용,
//       [담당자에게 보내기](전달할 내용만 점검자 홈에 표시), 완료 처리, 등록 취소(삭제 없음).
import { useState } from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, Send } from 'lucide-react'
import { Modal } from '../../components/Modal'
import {
  type Ack, type ContactMeta, type Kind, type MetaDoc, type Options, type Status, META_KEY, STATUS_LABEL, STATUS_PILL, kindLabel, kindsWith,
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
  options: Options
  onClose: () => void
  onSaved: (doc: MetaDoc) => void
  onAssign: (fromName: string) => void
  onSend: () => void
}

export default function ContactModal({ id, date, schoolName, content, meta, status, ack, inspectors, me, options, onClose, onSaved, onAssign, onSend }: Props) {
  const kinds = kindsWith(options)
  if (!kinds.some((k) => k.key === meta.kind)) kinds.push({ key: meta.kind, label: kindLabel(meta), types: [], custom: true })
  const [kind, setKind] = useState<Kind>(meta.kind)
  const [type, setType] = useState(meta.type || '')
  const [insp, setInsp] = useState(meta.inspector || '')
  const [note, setNote] = useState(meta.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const closed = status === 'done' || status === 'canceled'
  const kdef = kinds.find((k) => k.key === kind)
  const types = [...(kdef?.types ?? []), ...(type && !(kdef?.types ?? []).includes(type) ? [type] : [])]

  async function save(extra: (m: ContactMeta) => Partial<ContactMeta>, what: string[]) {
    setBusy(true); setErr('')
    try {
      const doc = await patchItem<ContactMeta>(META_KEY, id, (cur) => {
        const base: ContactMeta = { ...(cur ?? meta) }
        const changes: string[] = []
        if (base.kind !== kind) changes.push(`구분 ${kindLabel(base)}→${kdef?.label || kind}`)
        if ((base.type || '') !== type) changes.push(`유형 ${base.type || '없음'}→${type || '없음'}`)
        if ((base.inspector || '') !== insp) changes.push(`점검자 ${base.inspector || '없음'}→${insp || '없음'}`)
        if ((base.note || '') !== note) changes.push('조치 내용 수정')
        const next: ContactMeta = {
          ...base, kind, kind_label: kdef?.custom ? kdef.label : undefined, type, inspector: insp,
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
          {meta.receiver && <><b>전화 받음</b><span>{meta.receiver}</span></>}
        </div>

        <div className="ct-grid3">
          <label className="field"><span>구분</span>
            <select className="select" value={kind} disabled={closed} onChange={(e) => { const k = e.target.value as Kind; setKind(k); setType(kinds.find((x) => x.key === k)?.types[0] || '') }}>
              {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></label>
          <label className="field"><span>유형</span>
            <select className="select" value={type} disabled={closed} onChange={(e) => setType(e.target.value)}>
              <option value="">선택 안 함</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label className="field"><span>점검자</span>
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

        {kind === 'complaint' ? (
          <div className="ct-nosend">불만은 점검자에게 보내지 않습니다. 관리자가 면담 등으로 처리하고, 점검자가 할 일이 생기면 '요청'으로 따로 등록해 보내세요.</div>
        ) : (
          <div className="ct-send">
            <h4><Send size={14} /> 담당자에게 보내기
              {meta.send && <small className="muted"> · {fmtTs(meta.send.ts)} {meta.send.to_name}에게 · 보낸 사람 {meta.send.by}</small>}</h4>
            {meta.send && (
              <div className="ct-track">
                <span className={ack?.ack_ts ? 'on' : ''}>확인 {ack?.ack_ts ? fmtTs(ack.ack_ts) : '전'}</span>
                {kind !== 'info' && <span className={act ? 'on' : ''}>조치 완료 {act ? fmtTs(act.ts) : '전'}</span>}
                <div className="ct-act"><b>전달한 내용</b> {meta.send.text}</div>
                {act && <div className="ct-act"><b>점검자 조치</b> {act.text}</div>}
              </div>
            )}
            <div className="ct-send-foot">
              <span className="muted">원문·조치 내용은 보내지 않습니다. 보내기 창에 적은 내용만 점검자 홈에 표시됩니다.</span>
              <button className="btn btn-primary ct-xs" disabled={busy} onClick={onSend}><Send size={13} /> {meta.send ? '다시 보내기' : '보내기'}</button>
            </div>
          </div>
        )}

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
