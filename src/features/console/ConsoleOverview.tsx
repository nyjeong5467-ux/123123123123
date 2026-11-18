import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footprints, PhoneCall, Plus, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { useTableQuery, type FilterDef } from '../../lib/useTableQuery'
import { Pagination, SortableTh } from '../../components/table'
import { InfoTip } from '../../components/InfoTip'
import { Modal } from '../../components/Modal'
import { useAuth } from '../../lib/auth'
import {
  type AckDoc, type ContactMeta, type MetaDoc, type Options, type Status, META_KEY, OPTIONS_KEY, STATUS_LABEL, STATUS_PILL, kindLabel,
  ackFor, ackKey, fmtTs, getDoc, metaOf, statusOf,
} from '../contact/contactData'
import ContactModal from '../contact/ContactModal'
import ContactRegisterModal from '../contact/ContactRegisterModal'
import ContactSendModal from '../contact/ContactSendModal'
import StaffAssignModal from './staff/StaffAssignModal'
import type { SchoolLite } from './staff/staffData'
import '../../styles/contact.css'

// ── 경영 현황 탭 — 회사 관리자용 경영 지표·이력·편집형 경영 콘텐츠만.
//    (학교별 업무 진행률·학교 대장은 홈/학교 탭 담당 — 중복 제거. 집계 API 1회씩만 호출.)

type School = SchoolLite
type Complaint = { id: string; school_id: string; date: string; content: string; status: string }
type Visit = { id: string; school_id: string; date: string; visitor: string; purpose: string }

// [167] 학교·기관 연락 이력 — 접수 원장(/complaints) + 메타(구분·유형·점검자·보내기) + 점검자 확인
type UserAcc = { id: string; login_id: string; name: string; role: string }
type CRow = Complaint & { m: ContactMeta; st: Status; schoolName: string }
const CMP_FILTERS: FilterDef<CRow>[] = [
  {
    key: 'st', label: '상태',
    options: (Object.keys(STATUS_LABEL) as Status[]).map((k) => ({ value: k, label: STATUS_LABEL[k] })),
    accessor: (r) => r.st,
  },
]
const CMP_SORTS = { date: (r: CRow) => r.date, status: (r: CRow) => r.st }


export default function ConsoleOverview() {
  const [schools, setSchools] = useState<School[]>([])
  const [users, setUsers] = useState<UserAcc[]>([])
  const [meta, setMeta] = useState<MetaDoc>({})
  const [acks, setAcks] = useState<Record<string, AckDoc>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [assignFrom, setAssignFrom] = useState<string | null>(null)
  const [assignMsg, setAssignMsg] = useState('')
  const { user } = useAuth()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)

  // 불만/방문 등록 폼(종합관리 통합)
  const [regOpen, setRegOpen] = useState(false) // [168] 등록 창
  const [ctOpt, setCtOpt] = useState<Options>({}) // [168] 직접 추가한 구분·유형
  const [sendId, setSendId] = useState<string | null>(null) // [169] 보내기 창
  const [phones, setPhones] = useState<Record<string, string>>({}) // [169] 보낸 사람 연락처(login → 전화)
  const [vOpen, setVOpen] = useState(false) // [184] 방문 등록 창
  const [vSid, setVSid] = useState('')
  const [vDate, setVDate] = useState('')
  const [vVisitor, setVVisitor] = useState('')
  const [vPurpose, setVPurpose] = useState('')
  const [vBusy, setVBusy] = useState(false)
  const [vErr, setVErr] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<UserAcc[]>('/users').catch(() => null),
      api<Complaint[]>('/complaints').catch(() => [] as Complaint[]),
      api<Visit[]>('/visits').catch(() => [] as Visit[]),
      getDoc<MetaDoc>(META_KEY).catch(() => ({} as MetaDoc)),
      getDoc<Options>(OPTIONS_KEY).catch(() => ({} as Options)),
      getDoc<Record<string, { phone?: string }>>('staff-registry').catch(() => ({} as Record<string, { phone?: string }>)),
      getDoc<Record<string, { phone?: string }>>('staff-resumes').catch(() => ({} as Record<string, { phone?: string }>)),
    ]).then(([s, usr, cmp, vis, md, opt, reg, rsm]) => {
      if (!alive) return
      const list = Array.isArray(s) ? s : []
      setSchools(list)
      if (list.length) setVSid(list[0].id)
      setUsers(Array.isArray(usr) ? usr : [])
      setMeta(md || {})
      setCtOpt(opt || {})
      const ph: Record<string, string> = {}
      for (const [k, v] of Object.entries(rsm || {})) if (v?.phone) ph[k] = v.phone
      for (const [k, v] of Object.entries(reg || {})) if (v?.phone) ph[k] = v.phone
      setPhones(ph)
      setComplaints(Array.isArray(cmp) ? cmp : [])
      setVisits(Array.isArray(vis) ? vis : [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // [167] 보낸 건의 점검자 확인 문서(contact-acks-{login}) — 받는 사람별 1회씩
  const ackLogins = useMemo(() => [...new Set(Object.values(meta).map((m) => m.send?.to_login).filter(Boolean) as string[])].sort().join(','), [meta])
  useEffect(() => {
    if (!ackLogins) return
    let alive = true
    Promise.all(ackLogins.split(',').map((l) => getDoc<AckDoc>(ackKey(l)).catch(() => ({} as AckDoc)).then((d) => [l, d] as const)))
      .then((rs) => { if (alive) setAcks(Object.fromEntries(rs)) })
    return () => { alive = false }
  }, [ackLogins])

  const inspectors = useMemo(() => users.filter((u) => u.role === 'field_inspector' && u.login_id)
    .map((u) => ({ login: u.login_id, name: u.name || u.login_id })).sort((a, b) => a.name.localeCompare(b.name, 'ko')), [users])
  const me = useMemo(() => users.find((u) => u.login_id === user?.login)?.name || user?.login || '관리자', [users, user])

  function openVisit() { setVDate(new Date().toLocaleDateString('sv-SE')); setVVisitor(''); setVPurpose(''); setVErr(''); setVOpen(true) }
  async function submitVisit() {
    if (!vSid || !vDate || !vVisitor.trim()) { setVErr('학교·날짜·방문자를 모두 입력하세요.'); return }
    setVBusy(true)
    setVErr('')
    try {
      await api('/visits', { method: 'POST', body: JSON.stringify({ school_id: vSid, date: vDate, visitor: vVisitor.trim(), purpose: vPurpose.trim() }) })
      setVVisitor('')
      setVPurpose('')
      setVOpen(false)
      setVisits(await api<Visit[]>('/visits'))
    } catch (e) {
      setVErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setVBusy(false)
    }
  }

  const rows: CRow[] = useMemo(() => complaints.map((c) => {
    const m = metaOf(meta, c.id)
    return { ...c, m, st: statusOf(m, ackFor(m, acks, c.id), c.status), schoolName: schools.find((s) => s.id === c.school_id)?.name || m.school_name || c.school_id }
  }), [complaints, meta, acks, schools])
  const q = useTableQuery(rows, {
    searchFields: [(r) => r.schoolName, (r) => r.content, (r) => r.m.inspector || '', (r) => r.m.type || ''],
    filters: CMP_FILTERS,
    sortAccessors: CMP_SORTS,
    searchPlaceholder: '학교·내용·점검자',
    dateField: (r) => r.date,
    dateLabel: '날짜',
  })
  const openRow = rows.find((r) => r.id === openId)
  const sendRow = rows.find((r) => r.id === sendId)
  // 보낸 사람 이름 → 연락처(계정 이름 기준, staff-registry 우선·없으면 이력서)
  const phoneOf = (name: string) => { const u = users.find((x) => x.name === name); return (u && phones[u.login_id]) || '' }
  const pending = rows.filter((r) => r.st !== 'done' && r.st !== 'canceled').length
  const unacked = rows.filter((r) => r.st === 'sent').length
  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name || id

  if (loading) return <div className="tstate">불러오는 중…</div>

  return (
    <>
      {/* [183] 우측 편집형 경영 콘텐츠(관리체계·주요일정·지시/요청) 삭제 — 연락 이력·임원 방문 이력만 전체 폭 */}
      <div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ledger">
            <div className="lh">
              <h2><PhoneCall size={18} /> 학교·기관 연락 이력
                <InfoTip>
                  학교·기관에서 온 불만·요청·문의를 기록합니다. 행을 누르면 처리 창에서 조치 내용을 적고
                  [담당자에게 보내기]로 담당 점검자 홈의 '내 현장 메모'에 전달할 수 있습니다(보내지 않으면 점검자에게 가지 않음).
                  기록은 지워지지 않으며, 잘못 등록한 건은 '등록 취소'로 남깁니다.
                </InfoTip></h2>
              <div className="sp" />
              {assignMsg && <span className="pillx ok">{assignMsg}</span>}
              <span className="pillx warn">관리자 전용</span>
              <button className="btn btn-primary" onClick={() => setRegOpen(true)} disabled={schools.length === 0}><Plus size={15} /> 이력 등록</button>
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead><tr>
                  <SortableTh q={q} col="date">날짜</SortableTh><th>학교·기관</th><th style={{ width: 190 }}>구분 · 유형</th>
                  <th style={{ width: 100 }}>점검자</th><th>내용</th><th style={{ width: 190 }}>전달</th><SortableTh q={q} col="status" className="c">상태</SortableTh>
                </tr></thead>
                <tbody>
                  {q.view.map((c) => {
                    const act = ackFor(c.m, acks, c.id)?.act
                    return (
                      <tr key={c.id} className={'ct-row' + (c.st === 'canceled' ? ' canceled' : '')} onClick={() => setOpenId(c.id)}>
                        <td><b>{c.date}</b></td>
                        <td>{c.schoolName}</td>
                        <td><span className={'ct-kind k-' + (['complaint', 'request', 'info'].includes(c.m.kind) ? c.m.kind : 'custom')}>{kindLabel(c.m)}</span>{c.m.type && <span className="ct-type">{c.m.type}</span>}</td>
                        <td>{c.m.inspector ? <b>{c.m.inspector}</b> : <span className="muted">—</span>}</td>
                        <td>{c.content}
                          {act && <div className="ct-sub">점검자 조치: {act.text}</div>}
                        </td>
                        <td onClick={(e) => { if (c.m.kind !== 'complaint' && !c.m.send && c.st !== 'canceled') e.stopPropagation() }}>
                          {c.m.kind === 'complaint' ? <span className="muted">—</span>
                            : c.m.send ? (
                              <div className="ct-sent"><b>{c.m.send.to_name}</b>에게
                                <small>보낸 사람 {c.m.send.by} · {fmtTs(c.m.send.ts)}</small></div>
                            ) : c.st === 'canceled' ? <span className="muted">—</span>
                            : <button className="btn ct-tx" onClick={() => setSendId(c.id)}><Send size={12} /> 보내기</button>}
                        </td>
                        <td className="c"><span className={'pillx ' + STATUS_PILL[c.st]}>{STATUS_LABEL[c.st]}</span></td>
                      </tr>
                    )
                  })}
                  {q.view.length === 0 && <tr><td colSpan={7}><div className="tstate">{complaints.length === 0 ? '등록된 연락 이력이 없습니다.' : '조건에 맞는 연락 이력이 없습니다.'}</div></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ padding: '10px 26px 0', fontSize: 12 }}>미처리 {pending}건 · 전달 후 미확인 {unacked}건</div>
            <Pagination q={q} />
          </div>
          {regOpen && (
            <ContactRegisterModal schools={schools} inspectors={inspectors} me={me} options={ctOpt} onOptions={setCtOpt} onClose={() => setRegOpen(false)}
              onDone={(list, doc) => { setComplaints(list); if (doc) setMeta(doc); setRegOpen(false) }} />
          )}
          {sendRow && (
            <ContactSendModal key={sendRow.id} id={sendRow.id} date={sendRow.date} schoolName={sendRow.schoolName} content={sendRow.content}
              meta={sendRow.m} inspectors={inspectors} me={me} phoneOf={phoneOf}
              onClose={() => setSendId(null)} onSaved={(d) => { setMeta(d); setSendId(null) }} />
          )}
          {openRow && (
            <ContactModal key={openRow.id} id={openRow.id} date={openRow.date} schoolName={openRow.schoolName} content={openRow.content}
              meta={openRow.m} status={openRow.st} ack={ackFor(openRow.m, acks, openRow.id)} inspectors={inspectors} me={me} options={ctOpt}
              onClose={() => setOpenId(null)} onSaved={(d) => setMeta(d)}
              onAssign={(from) => { setOpenId(null); setAssignFrom(from || '') }}
              onSend={() => { setOpenId(null); setSendId(openRow.id) }} />
          )}
          {assignFrom !== null && (
            <StaffAssignModal schools={schools} inspectors={inspectors.map((p) => p.name)} initialFrom={assignFrom || undefined}
              onClose={() => setAssignFrom(null)}
              onSaved={(m) => { setAssignFrom(null); setAssignMsg(m); api<School[]>('/schools').then((x) => setSchools(Array.isArray(x) ? x : [])).catch(() => {}) }} />
          )}

          <div className="ledger">
            <div className="lh">
              <h2><Footprints size={18} /> 임원 방문 이력</h2>
              <div className="sp" />
              <span className="pillx warn">관리자 전용</span>
              <button className="btn btn-primary" onClick={openVisit} disabled={schools.length === 0}><Plus size={15} /> 방문 등록</button>
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead><tr><th>날짜</th><th>학교</th><th>방문자</th><th>목적</th></tr></thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <td><b>{v.date}</b></td>
                      <td>{schoolName(v.school_id)}</td>
                      <td>{v.visitor}</td>
                      <td>{v.purpose}</td>
                    </tr>
                  ))}
                  {visits.length === 0 && <tr><td colSpan={4}><div className="tstate">등록된 임원 방문 이력이 없습니다.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, marginTop: 2 }}>
            <span className="muted" style={{ fontSize: 12 }}>다른 화면 위치 안내</span>
            <InfoTip>학교별 업무 진행·대장은 <Link to="/schools">학교</Link> 탭에서, 업무 현황 요약은 <Link to="/">홈</Link>에서 확인하세요.</InfoTip>
          </div>
        </div>

      </div>
      {/* [184] 임원 방문 등록 — [방문 등록] 버튼을 누르면 창에서 작성 */}
      {vOpen && (
        <Modal title="임원 방문 등록" width={520} onClose={() => !vBusy && setVOpen(false)}
          footer={<>
            <button className="btn btn-ghost" disabled={vBusy} onClick={() => setVOpen(false)}>취소</button>
            <button className="btn btn-primary" disabled={vBusy} onClick={() => void submitVisit()}>{vBusy ? '등록 중…' : '등록'}</button>
          </>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <label className="field">
              <span>학교</span>
              <select className="select" value={vSid} onChange={(e) => setVSid(e.target.value)}>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span>날짜</span>
                <input className="input" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
              </label>
              <label className="field">
                <span>방문자</span>
                <input className="input" type="text" placeholder="직책/이름" value={vVisitor} onChange={(e) => setVVisitor(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>목적</span>
              <input className="input" type="text" placeholder="방문 목적" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitVisit() }} />
            </label>
            {vErr && <div style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600 }}>{vErr}</div>}
          </div>
        </Modal>
      )}
    </>
  )
}
