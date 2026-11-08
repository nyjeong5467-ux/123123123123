// [167] 직원 이력 › 점검자 상세 › '불만·요청' 탭 — 연락 이력 중 구분 '불만'이고 관련 점검자가 이 사람인 건(읽기 전용).
//   기록은 지워지지 않고 계속 쌓인다(완료·등록 취소 포함, 등록 취소는 흐리게).
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { type AckDoc, type ContactMeta, type MetaDoc, META_KEY, STATUS_LABEL, STATUS_PILL, ackFor, ackKey, getDoc, statusOf } from './contactData'
import '../../styles/contact.css'

export type Complaint = { id: string; school_id: string; date: string; content: string; status: string }
export type ContactData = { meta: MetaDoc; complaints: Complaint[] }

export function useContactData(): ContactData {
  const [d, setD] = useState<ContactData>({ meta: {}, complaints: [] })
  useEffect(() => {
    let alive = true
    Promise.all([getDoc<MetaDoc>(META_KEY).catch(() => ({} as MetaDoc)), api<Complaint[]>('/complaints').catch(() => [] as Complaint[])])
      .then(([meta, c]) => { if (alive) setD({ meta, complaints: Array.isArray(c) ? c : [] }) })
    return () => { alive = false }
  }, [])
  return d
}

const isMine = (m: ContactMeta, login: string, name: string) =>
  m.kind === 'complaint' && (m.inspector_login ? m.inspector_login === login : !!name && m.inspector === name)

/** 점검자별 불만 건수(등록 취소 제외) — 목록 배지용 */
export function complaintCount(d: ContactData, login: string, name: string) {
  return d.complaints.filter((c) => { const m = d.meta[c.id]; return m && m.closed !== 'canceled' && isMine(m, login, name) }).length
}

export function useStaffComplaints(d: ContactData, login: string, name: string) {
  const items = useMemo(() => d.complaints
    .filter((c) => d.meta[c.id] && isMine(d.meta[c.id], login, name))
    .map((c) => ({ ...c, m: d.meta[c.id] }))
    .sort((a, b) => b.date.localeCompare(a.date)), [d, login, name])
  const recips = useMemo(() => [...new Set(items.map((i) => i.m.send?.to_login).filter(Boolean) as string[])].sort().join(','), [items])
  const [acks, setAcks] = useState<Record<string, AckDoc>>({})
  useEffect(() => {
    if (!recips) { setAcks({}); return }
    let alive = true
    Promise.all(recips.split(',').map((l) => getDoc<AckDoc>(ackKey(l)).catch(() => ({} as AckDoc)).then((x) => [l, x] as const)))
      .then((rs) => { if (alive) setAcks(Object.fromEntries(rs)) })
    return () => { alive = false }
  }, [recips])
  const rows = items.map((i) => { const a = ackFor(i.m, acks, i.id); return { ...i, ack: a, st: statusOf(i.m, a, i.status) } })
  const live = rows.filter((r) => r.st !== 'canceled')
  return { rows, total: live.length, pending: live.filter((r) => r.st !== 'done').length }
}

export function StaffComplaintsPane({ data }: { data: ReturnType<typeof useStaffComplaints> }) {
  return (
    <div>
      <div className="ct-sum">
        <div>전체<b>{data.total}</b></div>
        <div>미처리<b className={data.pending ? 'red' : ''}>{data.pending}</b></div>
      </div>
      {data.rows.length === 0 ? (
        <div className="tstate">이 점검자와 관련된 불만 기록이 없습니다. (경영 현황 › 학교·기관 연락 이력에서 구분 '불만'·관련 점검자로 등록한 건이 여기에 모입니다)</div>
      ) : (
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 110 }}>날짜</th><th style={{ width: 180 }}>학교·기관</th><th style={{ width: 130 }}>유형</th><th>내용</th><th>조치 내용</th><th className="c" style={{ width: 90 }}>상태</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className={r.st === 'canceled' ? 'ct-row canceled' : ''} style={{ cursor: 'default' }}>
                  <td className="ct-nowrap"><b>{r.date}</b></td>
                  <td>{r.m.school_name || r.school_id}</td>
                  <td>{r.m.type ? <span className="ct-type">{r.m.type}</span> : <span className="muted">—</span>}</td>
                  <td>{r.content}</td>
                  <td className="muted">{[r.m.note, r.ack?.act && `점검자: ${r.ack.act.text}`].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="c"><span className={'pillx ' + STATUS_PILL[r.st]}>{STATUS_LABEL[r.st]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
