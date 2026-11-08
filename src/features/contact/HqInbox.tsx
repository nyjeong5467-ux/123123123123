// [167] 홈 '내 현장 메모' 맨 위 — 본사가 [보내기]한 연락(본사 전달).
//   문의·전달: [확인] → 목록에서 사라짐
//   요청·불만: [확인] → [조치 완료](한 줄 조치 내용) → 목록에서 사라짐
//   지난 본사 전달(최근 30일)은 아래 링크로 다시 볼 수 있다. 확인·조치는 본인 문서(contact-acks-{login})에만 기록.
import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { type AckDoc, type ContactMeta, type MetaDoc, kindLabel, META_KEY, ackKey, fmtTs, getDoc, nowIso, patchItem } from './contactData'
import '../../styles/contact.css'

type Item = { id: string; m: ContactMeta }

export function useHqInbox(login: string, myName: string, reload = 0) {
  const [meta, setMeta] = useState<MetaDoc>({})
  const [acks, setAcks] = useState<AckDoc>({})
  useEffect(() => {
    if (!login) return
    let alive = true
    Promise.all([getDoc<MetaDoc>(META_KEY).catch(() => ({} as MetaDoc)), getDoc<AckDoc>(ackKey(login)).catch(() => ({} as AckDoc))])
      .then(([m, a]) => { if (alive) { setMeta(m); setAcks(a) } })
    return () => { alive = false }
  }, [login, reload])
  const mine: Item[] = useMemo(() => Object.entries(meta)
    .filter(([, m]) => m.send && m.closed !== 'canceled' && (m.send.to_login === login || (!m.send.to_login && m.send.to_name === myName)))
    .map(([id, m]) => ({ id, m }))
    .sort((x, y) => y.m.send!.ts.localeCompare(x.m.send!.ts)), [meta, login, myName])
  const ackOf = (it: Item) => { const a = acks[it.id]; return a && a.sent_ts === it.m.send!.ts ? a : undefined }
  const isOpen = (it: Item) => {
    if (it.m.closed === 'done') return false
    const a = ackOf(it)
    if (it.m.kind === 'info') return !a?.ack_ts
    return !a?.act
  }
  const open = mine.filter(isOpen)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const past = mine.filter((it) => !isOpen(it) && it.m.send!.ts >= since)
  async function write(it: Item, patch: { ack?: boolean; act?: string }) {
    const doc = await patchItem<AckDoc[string]>(ackKey(login), it.id, (cur) => {
      const base = cur && cur.sent_ts === it.m.send!.ts ? cur : { sent_ts: it.m.send!.ts }
      return {
        ...base,
        ...(patch.ack || patch.act ? { ack_ts: base.ack_ts || nowIso() } : {}),
        ...(patch.act ? { act: { text: patch.act, ts: nowIso() } } : {}),
      }
    })
    setAcks(doc)
  }
  return { open, past, ackOf, write }
}

export function HqInboxList({ inbox, onSchool }: { inbox: ReturnType<typeof useHqInbox>; onSchool: (id: string) => void }) {
  const [actId, setActId] = useState<string | null>(null)
  const [actText, setActText] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } catch { window.alert('저장하지 못했습니다. 잠시 후 다시 시도하세요.') } finally { setBusy(false) } }
  return (
    <>
      {inbox.open.map((it) => {
        const a = inbox.ackOf(it)
        const s = it.m.send!
        return (
          <div className="ct-hq" key={it.id}>
            <span className="ct-hqb">본사 전달</span>
            <div className="ct-hq-main">
              <div className="nm"><span className={'ct-kind k-' + it.m.kind}>{kindLabel(it.m)}</span>{s.text}
                {a?.ack_ts && <span className="ct-acked">{fmtTs(a.ack_ts)} 확인함</span>}</div>
              <div className="mt">{it.m.school_name || ''} · 보낸 사람 <b className="ct-who">{s.by}{s.by_phone ? ` (${s.by_phone})` : ''}</b> · {fmtTs(s.ts)}{it.m.type ? ` · ${it.m.type}` : ''}
                {it.m.kind === 'info' && ' · 확인하면 목록에서 사라집니다'}</div>
              {actId === it.id && (
                <div className="ct-fill">
                  <input className="input" autoFocus value={actText} placeholder="조치 내용 (예: 11/08 사진 2장 추가 업로드)" onChange={(e) => setActText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && actText.trim()) void run(async () => { await inbox.write(it, { act: actText.trim() }); setActId(null); setActText('') }) }} />
                  <button className="btn btn-primary ct-xs" disabled={busy || !actText.trim()}
                    onClick={() => void run(async () => { await inbox.write(it, { act: actText.trim() }); setActId(null); setActText('') })}>조치 완료</button>
                  <button className="btn btn-ghost ct-xs" onClick={() => { setActId(null); setActText('') }}>취소</button>
                </div>
              )}
            </div>
            <div className="ct-hq-btns">
              {it.m.school_id && <span className="hm-go" role="button" tabIndex={0} onClick={() => onSchool(it.m.school_id!)}>학교 →</span>}
              {!a?.ack_ts && <button className="btn ct-ack" disabled={busy} onClick={() => void run(() => inbox.write(it, { ack: true }))}><Check size={13} /> 확인</button>}
              {a?.ack_ts && it.m.kind !== 'info' && actId !== it.id && (
                <button className="btn btn-primary ct-xs" onClick={() => { setActId(it.id); setActText('') }}>조치 완료</button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

export function HqPastModal({ inbox, onClose }: { inbox: ReturnType<typeof useHqInbox>; onClose: () => void }) {
  return (
    <Modal title="지난 본사 전달 (최근 30일)" onClose={onClose} wide>
      {inbox.past.length === 0 && <div className="tstate">최근 30일 동안 처리한 본사 전달이 없습니다.</div>}
      {inbox.past.map((it) => {
        const a = inbox.ackOf(it)
        return (
          <div className="ct-past-row" key={it.id}>
            <div><span className={'ct-kind k-' + it.m.kind}>{kindLabel(it.m)}</span>{it.m.send!.text}</div>
            <div className="mt">{it.m.school_name} · 받은 날 {fmtTs(it.m.send!.ts)}{a?.ack_ts && ` · 확인 ${fmtTs(a.ack_ts)}`}
              {a?.act && ` · 조치 ${fmtTs(a.act.ts)}: ${a.act.text}`}{it.m.closed === 'done' && !a?.act && ' · 본사 완료 처리'}</div>
          </div>
        )
      })}
    </Modal>
  )
}
