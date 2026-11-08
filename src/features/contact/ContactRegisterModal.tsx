// [168] 연락 등록 창 — 학교·기관 이름 일부를 치면 후보(지역·담당 점검자)가 뜨고, 고르면 그 날짜 담당 점검자 자동.
//       구분·유형은 버튼으로 고름. 등록 = 접수(보내기는 목록 행 → 처리 창에서).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/Modal'
import type { SchoolLite } from '../console/staff/staffData'
import { type ContactMeta, type Kind, type MetaDoc, type Options, KINDS, META_KEY, addOption, inspectorAt, kindsWith, nowIso, patchItem } from './contactData'
import type { Person } from './ContactModal'
import '../../styles/contact.css'

type Complaint = { id: string; school_id: string; date: string; content: string; status: string }
type Props = {
  schools: SchoolLite[]
  inspectors: Person[]
  me: string
  options: Options
  onOptions: (o: Options) => void
  onClose: () => void
  onDone: (list: Complaint[], meta: MetaDoc | null) => void
}
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export default function ContactRegisterModal({ schools, inspectors, me, options, onOptions, onClose, onDone }: Props) {
  const kinds = kindsWith(options)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [sid, setSid] = useState('')
  const [date, setDate] = useState(today())
  const [insp, setInsp] = useState('')
  const [inspAuto, setInspAuto] = useState(true)
  const [kind, setKind] = useState<Kind>('complaint')
  const [type, setType] = useState(KINDS[0].types[0])
  const [content, setContent] = useState('')
  const [receiver, setReceiver] = useState(me) // [169] 전화 받은 사람
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inRef = useRef<HTMLInputElement>(null)
  const school = schools.find((s) => s.id === sid)

  // 후보: 이름 앞부분 일치 우선 → 포함, 최대 8개
  const hits = useMemo(() => {
    const k = norm(q)
    if (!k) return []
    const list = schools.filter((s) => norm(s.name).includes(k))
    list.sort((a, b) => Number(!norm(a.name).startsWith(k)) - Number(!norm(b.name).startsWith(k)) || a.name.localeCompare(b.name, 'ko'))
    return list.slice(0, 8)
  }, [q, schools])
  useEffect(() => setHi(0), [q])

  // 학교·날짜 → 그날 담당 점검자(직접 바꾸면 자동 해제)
  useEffect(() => {
    if (!sid || !inspAuto) return
    let alive = true
    inspectorAt(sid, date || today(), school?.manager).then((n) => { if (alive) setInsp(n) })
    return () => { alive = false }
  }, [sid, date, inspAuto, school?.manager])

  const pick = (s: SchoolLite) => { setSid(s.id); setQ(''); setInspAuto(true); setErr('') }
  const place = (s: SchoolLite) => [s.region, s.office].filter(Boolean).join(' · ')

  async function submit() {
    if (!sid) { setErr('학교·기관을 고르세요.'); return }
    if (!content.trim()) { setErr('내용을 입력하세요.'); return }
    setBusy(true); setErr('')
    try {
      const made = await api<Complaint>('/complaints', { method: 'POST', body: JSON.stringify({ school_id: sid, date, content: content.trim() }) })
      const list = await api<Complaint[]>('/complaints')
      const id = made?.id || list.find((c) => c.school_id === sid && c.date === date && c.content === content.trim())?.id
      let doc: MetaDoc | null = null
      if (id) {
        doc = await patchItem<ContactMeta>(META_KEY, id, () => ({
          kind, ...(kinds.find((k) => k.key === kind)?.custom ? { kind_label: kinds.find((k) => k.key === kind)!.label } : {}), type, inspector: insp, inspector_login: inspectors.find((p) => p.name === insp)?.login || '',
          school_id: sid, school_name: school?.name || '', date, receiver: receiver.trim() || me, log: [{ ts: nowIso(), by: me, what: '접수' }],
        }))
      }
      onDone(Array.isArray(list) ? list : [], doc)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '등록 실패')
      setBusy(false)
    }
  }

  return (
    <Modal title="등록" width={620} onClose={onClose}
      footer={<>
        {err && <span className="ct-err">{err}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? '등록 중…' : '등록'}</button>
      </>}>
      <div className="ct-modal">
        <div>
          <div className="ct-lab">학교·기관 {!school && <small className="muted">— 이름 일부만 쳐도 됩니다</small>}</div>
          {school ? (
            <div className="ct-picked">
              <b>{school.name}</b><small className="muted">{place(school)}</small>
              <button className="ct-link" onClick={() => { setSid(''); setTimeout(() => inRef.current?.focus(), 0) }}>바꾸기</button>
            </div>
          ) : (
            <div className="ct-combo">
              <div className="ct-search"><Search size={15} />
                <input ref={inRef} autoFocus value={q} placeholder="학교·기관 이름 (예: 청람)" onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
                    else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi]) }
                  }} />
              </div>
              {q.trim() && (
                <div className="ct-drop">
                  {hits.map((s, i) => (
                    <button key={s.id} className={'ct-opt' + (i === hi ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={() => pick(s)}>
                      <b>{s.name}</b><small className="muted">{place(s)}</small>
                      <span className="mg">{s.manager ? `담당 ${s.manager}` : '담당 없음'}</span>
                    </button>
                  ))}
                  {hits.length === 0 && <div className="ct-none">'{q}'(으)로 찾은 학교·기관이 없습니다.</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ct-grid2b">
          <label className="field"><span>점검자 {inspAuto && insp && <span className="ct-auto">자동</span>}</span>
            <select className="select" value={insp} disabled={!sid} onChange={(e) => { setInsp(e.target.value); setInspAuto(false) }}>
              <option value="">{sid ? '없음' : '학교를 고르면 자동으로 채워집니다'}</option>
              {insp && !inspectors.some((p) => p.name === insp) && <option value={insp}>{insp}</option>}
              {inspectors.map((p) => <option key={p.login} value={p.name}>{p.name}</option>)}
            </select></label>
          <label className="field"><span>날짜</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>

        <label className="field"><span>전화 받은 사람 <small className="muted">— 보내기 할 때 '보낸 사람'으로 들어갑니다</small></span>
          <input className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="이름" /></label>

        <div>
          <div className="ct-lab">구분</div>
          <div className="ct-chips">
            {kinds.map((k) => (
              <button key={k.key} className={'ct-chip k-' + (k.custom ? 'custom' : k.key) + (kind === k.key ? ' on' : '')}
                onClick={() => { setKind(k.key); setType(k.types[0] || '') }}>{k.label}</button>
            ))}
            <AddChip placeholder="새 구분 (예: 칭찬)" onAdd={async (name) => {
              const r = await addOption(null, name); onOptions(r.opt); setKind(r.key); setType(kindsWith(r.opt).find((k) => k.key === r.key)?.types[0] || '')
            }} />
          </div>
        </div>
        <div>
          <div className="ct-lab">유형</div>
          <div className="ct-chips">
            {(kinds.find((k) => k.key === kind)?.types ?? []).map((t) => (
              <button key={t} className={'ct-chip' + (type === t ? ' on' : '')} onClick={() => setType(type === t ? '' : t)}>{t}</button>
            ))}
            <AddChip placeholder="새 유형" onAdd={async (name) => { const r = await addOption(kind, name); onOptions(r.opt); setType(r.key) }} />
          </div>
        </div>
        <label className="field"><span>내용</span>
          <textarea className="input ct-ta" value={content} onChange={(e) => setContent(e.target.value)} placeholder="예: 점검표 사진이 누락되어 재방문을 요청함 (행정실 전화)" /></label>
      </div>
    </Modal>
  )
}

/** [168] '＋ 직접 추가' 칩 — 누르면 입력칸, Enter/추가로 저장(다음부터 목록에 계속 나옴) */
function AddChip({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const done = async () => {
    if (!v.trim()) { setOpen(false); return }
    setBusy(true)
    try { await onAdd(v.trim()); setV(''); setOpen(false) } catch { window.alert('추가하지 못했습니다.') } finally { setBusy(false) }
  }
  if (!open) return <button className="ct-chip ct-chip-add" onClick={() => setOpen(true)}><Plus size={12} /> 직접 추가</button>
  return (
    <span className="ct-addbox">
      <input autoFocus value={v} placeholder={placeholder} maxLength={20} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void done() } if (e.key === 'Escape') setOpen(false) }} />
      <button className="ct-chip on" disabled={busy} onClick={() => void done()}>추가</button>
      <button className="ct-chip" onClick={() => { setOpen(false); setV('') }}>취소</button>
    </span>
  )
}
