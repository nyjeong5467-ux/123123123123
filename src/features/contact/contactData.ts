// [167] 학교·기관 연락 이력 — 불만·요청·문의를 접수하고, 관리자가 [보내기]한 건만 담당 점검자 홈에 전달.
//
// 저장 — 새 백엔드 경로 없이:
//   POST/GET /complaints                 접수 원장(학교·날짜·원문) — 기존 불만 이력 그대로(삭제 없음)
//   org 문서 contact-meta                { [complaint_id]: ContactMeta }  구분·유형·점검자·관리자 조치·보내기·수정 기록 (관리자만 씀)
//   org 문서 contact-acks-{login}        { [complaint_id]: Ack }          점검자 본인의 확인·조치 완료 (점검자 본인만 씀)
//     → 점검자는 관리자 문서를 고치지 않는다(홈 방문계획 visit-plans-{login}과 같은 방식).
//
// 상태(화면 계산): 접수 → 전달됨 → 확인함 → 조치 완료 → 완료 / 등록 취소
//   문의·전달: 점검자 [확인] = 완료        요청: 점검자 [조치 완료] = 완료(자동)
//   불만: 점검자 [조치 완료] = '조치 완료' → 관리자가 보고 [완료 처리]
import { api } from '../../lib/api'

// 기본 구분 3개 + [168] 관리자가 직접 추가한 구분(org 문서 contact-options). 추가 구분은 '요청'처럼 동작(점검자 [조치 완료] → 완료).
export type Kind = string
export type KindDef = { key: Kind; label: string; types: string[]; custom?: boolean }
export const KINDS: KindDef[] = [
  { key: 'complaint', label: '불만', types: ['업무 미흡', '태도', '점검자 교체 요청', '기타'] },
  { key: 'request', label: '요청', types: ['일정 변경', '재방문', '서류·사진 보완', '기타'] },
  { key: 'info', label: '문의·전달', types: ['행사·공사 안내', '문의', '기타'] },
]
export const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]))

/** [168] 직접 추가한 구분·유형 — { kinds: [{key,label}], types: { [kindKey]: ['유형', …] } } */
export type Options = { kinds?: { key: string; label: string }[]; types?: Record<string, string[]> }
export const OPTIONS_KEY = 'contact-options'
export function kindsWith(opt: Options): KindDef[] {
  const base = KINDS.map((k) => ({ ...k, types: [...k.types.filter((t) => t !== '기타'), ...(opt.types?.[k.key] ?? []), ...(k.types.includes('기타') ? ['기타'] : [])] }))
  const extra = (opt.kinds ?? []).map((k) => ({ key: k.key, label: k.label, custom: true, types: opt.types?.[k.key] ?? [] }))
  return [...base, ...extra]
}
/** 구분 이름 — 기록에 저장된 이름 우선(추가 구분이 나중에 바뀌어도 기록은 그대로) */
export const kindLabel = (m: { kind: string; kind_label?: string }) => m.kind_label || KIND_LABEL[m.kind] || m.kind
/** 직접 추가(같은 이름이면 그대로 사용) — 저장 직전 최신본 기준 */
export async function addOption(kindKey: string | null, label: string): Promise<{ opt: Options; key: string }> {
  const name = label.trim()
  const cur = await getDoc<Options>(OPTIONS_KEY).catch(() => ({} as Options))
  const opt: Options = { kinds: [...(cur.kinds ?? [])], types: { ...(cur.types ?? {}) } }
  let key = name
  if (kindKey === null) {
    const hit = KINDS.find((k) => k.label === name) ?? opt.kinds!.find((k) => k.label === name)
    if (hit) return { opt: cur, key: hit.key }
    key = 'x' + Date.now().toString(36)
    opt.kinds!.push({ key, label: name })
  } else {
    const all = kindsWith(cur).find((k) => k.key === kindKey)?.types ?? []
    if (all.includes(name)) return { opt: cur, key: name }
    opt.types![kindKey] = [...(opt.types![kindKey] ?? []), name]
  }
  await api(`/ops/docs/${OPTIONS_KEY}`, { method: 'PUT', body: JSON.stringify({ doc: opt }) })
  return { opt, key }
}

export type Status = 'open' | 'sent' | 'ack' | 'acted' | 'done' | 'canceled'
export const STATUS_LABEL: Record<Status, string> = {
  open: '접수', sent: '전달됨', ack: '확인함', acted: '조치 완료', done: '완료', canceled: '등록 취소',
}
export const STATUS_PILL: Record<Status, string> = {
  open: 'warn', sent: 'doing', ack: 'ct-p-ack', acted: 'late', done: 'ok', canceled: 'todo',
}

export type Send = { to_login: string; to_name: string; text: string; ts: string; by: string; by_phone?: string } // by = 보낸 사람(점검자가 다시 물어볼 사람)
export type LogRow = { ts: string; by: string; what: string }
export type ContactMeta = {
  kind: Kind
  kind_label?: string       // 직접 추가한 구분의 이름
  type?: string
  inspector?: string        // 점검자 이름
  inspector_login?: string
  receiver?: string         // [169] 전화 받은 사람
  school_id?: string
  school_name?: string
  date?: string
  note?: string             // 관리자 조치 내용(관리자만 보임)
  send?: Send               // 마지막 보내기(다시 보내면 교체 — 이전 것은 log)
  closed?: 'done' | 'canceled'
  closed_ts?: string
  log?: LogRow[]
}
export type MetaDoc = Record<string, ContactMeta>
export type Ack = { sent_ts: string; ack_ts?: string; act?: { text: string; ts: string } }
export type AckDoc = Record<string, Ack>

export const META_KEY = 'contact-meta'
export const ackKey = (login: string) => `contact-acks-${login}`
export const nowIso = () => new Date().toISOString()
export const fmtTs = (ts?: string) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts.slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function getDoc<T>(key: string): Promise<T> {
  const r = await api<{ doc: T | null }>(`/ops/docs/${key}`)
  return ((r && r.doc) || {}) as T
}
/** 읽기→수정→쓰기(저장 직전 최신본 기준, 건 단위 병합) */
export async function patchItem<T>(key: string, id: string, fn: (cur: T | undefined) => T): Promise<Record<string, T>> {
  const cur = await getDoc<Record<string, T>>(key).catch(() => ({} as Record<string, T>))
  const next = { ...cur, [id]: fn(cur[id]) }
  await api(`/ops/docs/${key}`, { method: 'PUT', body: JSON.stringify({ doc: next }) })
  return next
}

/** 메타가 없는 과거 불만 이력 → 불만으로 간주 */
export function metaOf(meta: MetaDoc, id: string): ContactMeta {
  return meta[id] ?? { kind: 'complaint' }
}

/** 화면 상태 계산 — 관리자 메타 + 점검자 확인 문서 */
export function statusOf(m: ContactMeta, ack?: Ack, legacy?: string): Status {
  if (m.closed === 'canceled') return 'canceled'
  if (m.closed === 'done') return 'done'
  if (m.send) {
    const a = ack && ack.sent_ts === m.send.ts ? ack : undefined
    if (a?.act) return m.kind === 'complaint' ? 'acted' : 'done'
    if (a?.ack_ts) return m.kind === 'info' ? 'done' : 'ack'
    return 'sent'
  }
  if (legacy === 'resolved' || legacy === 'closed') return 'done'
  return 'open'
}
/** 이번 보내기에 대한 점검자 확인 기록(다시 보내기 이전 것은 무시) */
export const ackFor = (m: ContactMeta, acks: Record<string, AckDoc>, id: string): Ack | undefined => {
  const a = m.send ? acks[m.send.to_login]?.[id] : undefined
  return a && m.send && a.sent_ts === m.send.ts ? a : undefined
}

/** 그 날짜의 담당 점검자 — 학교 점검자 이력(manager-history) → 없으면 현재 담당(manager) */
type MgrRow = { start: string; end: string; name: string }
export async function inspectorAt(schoolId: string, date: string, fallback?: string): Promise<string> {
  try {
    const h = await api<unknown>(`/schools/${schoolId}/manager-history`)
    const rows: MgrRow[] = Array.isArray(h) ? (h as MgrRow[]) : Array.isArray((h as { items?: unknown })?.items) ? (h as { items: MgrRow[] }).items : []
    const hit = rows.find((r) => r.name && (!r.start || r.start <= date) && (!r.end || date <= r.end))
    if (hit) return hit.name
  } catch { /* 이력 없음 */ }
  return (fallback || '').trim()
}
