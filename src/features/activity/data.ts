// 활동 현황(관리자 전용) — API 계약 타입 · 호출/캐시 · 날짜/시각 포맷 공용 유틸.
// 백엔드: /api/v1/ops/activity/{daily,events,range} (관리자 토큰만, 아니면 403). 아직 라이브 전일 수 있어
// 404/403/네트워크 오류는 describeError 로 안내 문구로 바꿔 화면에 보여준다.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../../lib/api'

// ── 계약 타입 ──
export type SchoolStat = {
  school_id: string
  school_name: string
  first_at: string | null
  last_at: string | null
  first_hm?: string | null        // "HH:MM" KST(서버 계산) — 있으면 우선 표시
  last_hm?: string | null
  events: number
  saves: number
  min_distance_m?: number | null  // 그날 학교 좌표와의 최소 거리
  onsite: boolean | null          // 하루 중 한 번이라도 300m 이내면 true, 좌표 있는 이벤트가 전부 밖이면 false, 판정 불가 null
}
export type UserDay = {
  login_id: string
  name: string
  role: string
  first_at: string | null         // UTC ISO(+00:00)
  last_at: string | null
  first_hm?: string | null        // "HH:MM" KST — 있으면 우선 표시
  last_hm?: string | null
  last_kind: string | null
  last_school_name: string | null
  last_server_at?: string | null
  events: number
  saves?: number                  // 서버 집계(없으면 schools[].saves 합)
  schools: SchoolStat[]
  device_id?: string | null       // 마지막 활동 기기(11-16 계약 추가)
  device_label?: string | null
}
export type DailyRes = { date: string; users: UserDay[] }

export type ActEvent = {
  id: string | number
  kind: string
  actor_login_id: string
  actor_name: string
  school_id: string | null
  school_name: string | null
  module: string | null
  inspection_id: string | null
  device_at: string | null       // 기기 작성 시각(기준, UTC ISO)
  device_hm?: string | null      // "HH:MM" KST
  device_date?: string | null    // YYYY-MM-DD KST
  server_at: string | null       // 서버 수신 시각(오프라인 저장분은 다를 수 있음)
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  distance_m: number | null      // 학교 좌표와의 거리
  onsite: boolean | null
  note: string | null
  device_id?: string | null      // 기록한 기기(11-16 계약 추가)
  device_label?: string | null
}

// range 응답 {from,to,days:[{date,users:[…]}]} 을 날짜×사용자 행으로 평탄화한 것
export type RangeRow = {
  date: string
  login_id: string
  name: string
  role?: string
  first_at: string | null
  first_hm?: string | null
  last_at: string | null
  last_hm?: string | null
  last_kind?: string | null
  last_school_name?: string | null
  events: number
  device_id?: string | null
  device_label?: string | null
}
type RangeRes = { from: string; to: string; days: { date: string; users: Omit<RangeRow, 'date'>[] }[] }
export type EventsRes = { date: string; total: number; truncated: boolean; events: ActEvent[] }

// 위치 동의 목록 — GET /ops/activity/consents → {consents:[…]}. 404(구서버)면 호출자가 이벤트 lat 존재 여부로 추정.
export type ConsentRow = {
  login_id: string
  name?: string | null
  kind?: string | null            // 동의 종류(예: location). 위치 외 종류가 섞여 오면 그대로 표시
  agreed: boolean | null          // null = 아직 응답 없음
  version?: string | null
  at?: string | null              // 동의/철회 시각(ISO)
}
export type ConsentsRes = { consents: ConsentRow[] }

// 기기 목록 — GET /ops/devices → {devices:[…]} · PUT /ops/devices/{id} {label,note} → 행 반환(빈 라벨 = 삭제)
export type DeviceRow = {
  device_id: string
  label: string | null
  note: string | null
  first_seen: string | null
  last_seen: string | null
  last_login_id: string | null
  last_name: string | null
  last_kind: string | null
  last_school_name: string | null
  events_total: number
  last_lat: number | null
  last_lng: number | null
  last_at: string | null
  consent_agreed: boolean | null
}
export type DevicesRes = { devices: DeviceRow[] }

// 그날 사용자별 마지막 위치 — GET /ops/activity/positions?date= → {date, positions:[…]}
export type Position = {
  login_id: string
  name: string | null
  device_id: string | null
  device_label: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  at: string | null
  at_hm?: string | null
  kind: string | null
  school_name: string | null
  onsite: boolean | null
  distance_m?: number | null      // 계약에 없음 — 서버가 주면 핀 상세에 표시
  status?: 'online' | 'closed'    // 접속 중(마지막 활동 60분 이내·종료 아님) / 종료
  last_at?: string; last_hm?: string; last_kind?: string
}
export type PositionsRes = { date: string; positions: Position[] }

// ── 라벨 ──
export const KIND_LABEL: Record<string, string> = {
  app_open: '앱 실행',
  app_close: '앱 종료',
  school_select: '학교 선택',
  module_open: '업무 열기',
  inspection_open: '점검표 열기',
  draft_save: '임시저장',
  save: '저장',
  eduoffice_request: '교육청 전송 요청',
  photo_add: '사진 추가',
  sign: '서명',
  memo_add: '메모',
  logout: '앱 종료(로그아웃)',
  custom: '기타',
  heartbeat: '접속 확인',
}
export const KIND_ORDER = Object.keys(KIND_LABEL)
export const kindLabel = (k: string | null | undefined) => (k ? KIND_LABEL[k] || k : '—')

export const ROLE_LABEL: Record<string, string> = {
  hq_admin: '본사 관리자',
  executive: '경영진',
  field_inspector: '현장 점검자',
  school_confirmer: '학교 확인자',
}
export const roleLabel = (r: string | null | undefined) => (r ? ROLE_LABEL[r] || r : '—')

export const ADMIN_ROLES = ['hq_admin', 'executive']

// 저장·제출로 집계하는 종류(요약 카드 '저장·제출 건수' 와 이벤트 원장 필터 공용)
export const SAVE_KINDS = ['save', 'eduoffice_request']

// ── 날짜 유틸(모두 YYYY-MM-DD 문자열, KST 기준) ──
export const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
export const DOW = ['일', '월', '화', '수', '목', '금', '토']

const toUtc = (d: string) => new Date(d + 'T00:00:00Z')
const fromUtc = (dt: Date) => dt.toISOString().slice(0, 10)

export function addDays(d: string, n: number): string {
  const dt = toUtc(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUtc(dt)
}
export const dowOf = (d: string) => toUtc(d).getUTCDay()
export const isWeekend = (d: string) => { const w = dowOf(d); return w === 0 || w === 6 }

export function fmtKoDate(d: string): string {
  const [y, m, dd] = d.split('-')
  return `${y}년 ${Number(m)}월 ${Number(dd)}일 (${DOW[dowOf(d)]})`
}
export const fmtMD = (d: string) => d.slice(5)                  // 11-16
export const fmtMDw = (d: string) => `${d.slice(5)} (${DOW[dowOf(d)]})`

// 월요일 시작 7일
export function weekDays(anchor: string): string[] {
  const mon = addDays(anchor, -((dowOf(anchor) + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}
export function monthDays(ym: string): string[] {
  const first = ym + '-01'
  const out: string[] = []
  for (let d = first; d.slice(0, 7) === ym; d = addDays(d, 1)) out.push(d)
  return out
}
export function daysBetween(from: string, to: string, max = 62): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
}
export const monthOf = (d: string) => d.slice(0, 7)
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return dt.toISOString().slice(0, 7)
}

// ── 시각 포맷 ──
// 계약: ISO(타임존 포함 권장) 또는 KST 'HH:MM'. 타임존 없는 ISO 는 KST(브라우저 로컬)로 간주한다.
const HHMM = /^(\d{1,2}):(\d{2})/
const pad = (n: number) => String(n).padStart(2, '0')
function kstClock(d: Date, withSec: boolean): string {
  const s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })     // 2026-11-16 14:05:33
  return withSec ? s.slice(11, 19) : s.slice(11, 16)
}
export function fmtTime(v: string | null | undefined, withSec = false): string {
  if (!v) return '—'
  if (v.length <= 8) {
    const m = HHMM.exec(v)
    if (m) return `${pad(Number(m[1]))}:${m[2]}${withSec && v.length === 8 ? v.slice(5) : ''}`
  }
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v)
  if (hasTz) return kstClock(d, withSec)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${withSec ? ':' + pad(d.getSeconds()) : ''}`
}
// 서버가 준 KST "HH:MM"(*_hm) 을 우선, 없으면 ISO 를 KST 로 변환
export function hm(hmv: string | null | undefined, iso: string | null | undefined): string {
  return hmv ? fmtTime(hmv) : fmtTime(iso)
}
// 이벤트 일자/시각: device_date·device_hm 우선, 없으면 device_at 변환(초 단위는 device_at 이 있을 때만)
export const evDate = (e: ActEvent) => e.device_date || dateOfIso(e.device_at)
export const evTime = (e: ActEvent, withSec = false) => (e.device_at ? fmtTime(e.device_at, withSec) : fmtTime(e.device_hm))
// 시각 문자열 → 분 단위 숫자(정렬용). 파싱 불가면 -1.
export function timeMinutes(v: string | null | undefined, hmv?: string | null): number {
  const t = hm(hmv, v)
  if (t === '—') return -1
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1
}
// 날짜가 포함된 ISO 면 YYYY-MM-DD, 아니면 null
export function dateOfIso(v: string | null | undefined): string | null {
  if (!v || v.length < 10) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(v)
  return hasTz ? d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : v.slice(0, 10)
}

// ISO → "MM-DD HH:MM"(KST). 날짜가 없는 값은 시각만.
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = dateOfIso(v)
  const t = fmtTime(v)
  return d ? `${fmtMD(d)} ${t}` : t
}

export function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}
export const n0 = (n: number) => n.toLocaleString('ko-KR')
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

// ── 오류 문구 ──
export function isNotFound(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /^404\b/.test(msg) || /not found/i.test(msg)
}
export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (isNotFound(e)) return '활동 기록 API가 아직 준비되지 않았습니다(404). 백엔드 배포 후 다시 확인해 주세요.'
  if (/^403\b/.test(msg) || /forbidden/i.test(msg) || /권한/.test(msg)) return '관리자만 볼 수 있습니다(403).'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.'
  return '불러오지 못했습니다: ' + msg
}

// ── 호출 + 짧은 캐시(탭 전환·날짜 왕복 시 재호출 방지) ──
const CACHE_TTL = 60_000
const cache = new Map<string, { t: number; p: Promise<unknown> }>()
export function cached<T>(path: string): Promise<T> {
  const now = Date.now()
  const hit = cache.get(path)
  if (hit && now - hit.t < CACHE_TTL) return hit.p as Promise<T>
  const p = api<T>(path).catch((e) => { cache.delete(path); throw e })
  cache.set(path, { t: now, p })
  return p
}
export function clearActivityCache() { cache.clear() }
// 특정 경로 접두사만 비움(기기 라벨 저장 뒤 /ops/devices 등)
export function invalidateCache(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
}

const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')

export const fetchDaily = (date: string) =>
  cached<DailyRes>(`/ops/activity/daily?${qs({ date })}`).then((r) => { rememberDeviceLabels(Array.isArray(r?.users) ? r.users : []); return r })
// events: {date,total,truncated,events:[…]} (최신순 최대 500). 과거 계약의 배열 형태도 허용.
export const fetchEventsRes = (q: { date: string; login_id?: string; school_id?: string }) =>
  cached<EventsRes | ActEvent[]>(`/ops/activity/events?${qs(q)}`).then((r): EventsRes => {
    const res = Array.isArray(r) ? { date: q.date, total: r.length, truncated: false, events: r } : { ...r, events: Array.isArray(r?.events) ? r.events : [] }
    rememberDeviceLabels(res.events)
    return res
  })
export const fetchEvents = (q: { date: string; login_id?: string; school_id?: string }) => fetchEventsRes(q).then((r) => r.events)
// range: {from,to,days:[{date,users:[…]}]} → 날짜×사용자 행(빈 날은 행 없음). 과거 계약의 배열 형태도 허용.
export const fetchRange = (from: string, to: string) =>
  cached<RangeRes | RangeRow[]>(`/ops/activity/range?${qs({ from, to })}`).then((r): RangeRow[] =>
    Array.isArray(r) ? r : (r?.days || []).flatMap((d) => (d.users || []).map((u) => ({ ...u, date: d.date }))))
// 위치 동의 목록. 404 면 호출자가 추정 모드로 전환. 과거 형태(배열)도 허용.
export const fetchConsents = () =>
  cached<ConsentsRes | ConsentRow[]>('/ops/activity/consents').then((r): ConsentRow[] => (Array.isArray(r) ? r : Array.isArray(r?.consents) ? r.consents : []))
// 그날 사용자별 마지막 위치(미니맵). 라벨 캐시에도 반영.
export type Completion = {
  date: string; login_id: string; name: string; school_id?: string | null; school_name?: string | null
  kind: string; at?: string; at_hm?: string; lat?: number | null; lng?: number | null
  accuracy_m?: number | null; distance_m?: number | null; onsite?: boolean | null; count: number
}
/** 학교 완료 지점(기간) — 지도 완료 핀·지도 이력 탭. */
export const fetchCompletions = (from: string, to: string) =>
  api<{ completions: Completion[] }>(`/ops/activity/completions?${qs({ from, to })}`).then((r) => (Array.isArray(r?.completions) ? r.completions : []))
export type Track = { login_id: string; name: string; points: [number, number, string][] }
/** 사용자별 이동 경로(좌표·시각) — 지도 선. 실시간 갱신용이라 캐시하지 않는다. */
export const fetchTracks = (date: string) =>
  api<{ date: string; tracks: Track[] }>(`/ops/activity/tracks?${qs({ date })}`).then((r) => (Array.isArray(r?.tracks) ? r.tracks : []))
export const fetchPositionsLive = (date: string) =>
  api<PositionsRes>(`/ops/activity/positions?${qs({ date })}`).then((r) => ({ date: r?.date || date, positions: Array.isArray(r?.positions) ? r.positions : [] }))
export const fetchPositions = (date: string) =>
  cached<PositionsRes>(`/ops/activity/positions?${qs({ date })}`).then((r) => {
    const positions = Array.isArray(r?.positions) ? r.positions : []
    rememberDeviceLabels(positions)
    return { date: r?.date || date, positions }
  })
// 기기 목록. 라벨 캐시에 전체 반영(라벨 없는 기기는 '' 로 기록해 서버값보다 우선).
export const fetchDevices = () =>
  cached<DevicesRes | DeviceRow[]>('/ops/devices').then((r): DeviceRow[] => {
    const rows = Array.isArray(r) ? r : Array.isArray(r?.devices) ? r.devices : []
    for (const d of rows) if (d.device_id) deviceLabels.set(d.device_id, d.label || '')
    notifyLabels()
    return rows
  })
// 라벨·메모 저장 → 행 반환(서버가 본문 없이 응답하면 보낸 값으로 채움). 저장 뒤 캐시·라벨 스토어 갱신.
export async function updateDevice(device_id: string, body: { label: string; note: string }): Promise<Partial<DeviceRow>> {
  const r = await api<Partial<DeviceRow> | undefined>(`/ops/devices/${encodeURIComponent(device_id)}`, { method: 'PUT', body: JSON.stringify(body) })
  invalidateCache('/ops/devices')
  invalidateCache('/ops/activity/positions')
  const row = r && typeof r === 'object' ? r : {}
  setDeviceLabel(device_id, (row.label ?? body.label) || '')
  return { device_id, label: body.label || null, note: body.note || null, ...row }
}

// ── 기기 라벨 스토어 ──
// device_id → 라벨. 기기 목록·positions 응답으로 채우고, 라벨 저장 시 즉시 갱신해 모든 표·미니맵 핀이 같은 라벨을 보이게 한다.
// '' = 라벨 없음(삭제)으로 기록해, 응답에 끼어 있는 옛 device_label 보다 우선한다.
const deviceLabels = new Map<string, string>()
const labelSubs = new Set<() => void>()
let labelVer = 0
function notifyLabels() { labelVer++; labelSubs.forEach((f) => f()) }
export function setDeviceLabel(device_id: string, label: string) {
  deviceLabels.set(device_id, label)
  notifyLabels()
}
// 응답 행들의 device_label 을 스토어에 반영(이미 사용자가 바꾼 값이 있으면 덮지 않음)
export function rememberDeviceLabels(rows: { device_id?: string | null; device_label?: string | null }[]) {
  let changed = false
  for (const r of rows) {
    if (r.device_id && r.device_label && !deviceLabels.has(r.device_id)) { deviceLabels.set(r.device_id, r.device_label); changed = true }
  }
  if (changed) notifyLabels()
}
// 라벨이 바뀌면 다시 그리도록 구독(값은 버전 번호)
export function useDeviceLabels(): number {
  return useSyncExternalStore((f) => { labelSubs.add(f); return () => { labelSubs.delete(f) } }, () => labelVer)
}
// 기기 ID 축약: 앞 8자 + …
export function shortDevice(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length > 12 ? id.slice(0, 8) + '…' : id
}
// 표시용 기기 이름: 스토어 라벨 → 응답 라벨 → 축약 ID
export function deviceText(device_id: string | null | undefined, device_label?: string | null): string {
  if (!device_id) return device_label || '—'
  const s = deviceLabels.get(device_id)
  if (s !== undefined) return s || shortDevice(device_id)
  return device_label || shortDevice(device_id)
}
// 저장된(또는 응답에 실린) 라벨만 — 없으면 null
export function deviceLabelOf(_id?: string | null, _label?: string | null): string | null {
  return null // 기기 라벨 기능 제거(11-16) — 사용자 이름으로 표시
}

// 여러 날짜의 daily 를 병렬로 — 개별 실패는 빈 결과로 흡수(첫 오류는 errors 로 전달)
export async function fetchDailyMany(dates: string[]): Promise<{ days: DailyRes[]; error: unknown | null }> {
  let error: unknown | null = null
  const days = await Promise.all(dates.map((d) =>
    fetchDaily(d).then((r) => ({ date: d, users: Array.isArray(r?.users) ? r.users : [] }))
      .catch((e) => { error ??= e; return { date: d, users: [] as UserDay[] } }),
  ))
  return { days, error }
}
export async function fetchEventsMany(dates: string[], q: { login_id?: string; school_id?: string } = {}): Promise<{ events: ActEvent[]; error: unknown | null; truncated: string[] }> {
  let error: unknown | null = null
  const truncated: string[] = []       // 하루 500건을 넘어 잘린 날짜
  const lists = await Promise.all(dates.map((d) =>
    fetchEventsRes({ date: d, ...q }).then((r) => { if (r.truncated) truncated.push(d); return r.events })
      .catch((e) => { error ??= e; return [] as ActEvent[] }),
  ))
  return { events: lists.flat(), error, truncated }
}

// ── 비동기 훅: deps 바뀌면 재호출, reload() 로 캐시 비우고 다시 ──
export type Async<T> = { data: T | null; loading: boolean; error: unknown | null; reload: () => void }
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fn().then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e); setData(null); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => { clearActivityCache(); setTick((t) => t + 1) }, [])
  return { data, loading, error, reload }
}

// ── 공용 집계 ──
// 사용자 하루의 현장 작성 판정: 모두 현장 → 'yes', 하나라도 현장 외 → 'no', 판정 불가 → 'na'
export function userOnsite(u: UserDay): { mark: 'yes' | 'no' | 'na'; yes: number; no: number; na: number } {
  let yes = 0, no = 0, na = 0
  for (const s of u.schools || []) {
    if (s.onsite === true) yes++
    else if (s.onsite === false) no++
    else na++
  }
  const mark = no > 0 ? 'no' : yes > 0 ? 'yes' : 'na'
  return { mark, yes, no, na }
}
export function sumSaves(u: UserDay): number {
  if (typeof u.saves === 'number') return u.saves
  return (u.schools || []).reduce((a, s) => a + (s.saves || 0), 0)
}


// ── 요약 보기(11-16): 앱 실행 · 앱 종료 · 학교 완료(저장 / 교육청 전송 요청)만 ──
const LEDGER_DETAIL_KEY = 'activity.ledger.detail'
export function getLedgerDetail(): boolean {
  try { return localStorage.getItem(LEDGER_DETAIL_KEY) === '1' } catch { return false }
}
export function setLedgerDetail(v: boolean): void {
  try { localStorage.setItem(LEDGER_DETAIL_KEY, v ? '1' : '0') } catch { /* 무시 */ }
}
const OPEN_CLOSE = new Set(['app_open', 'app_close', 'logout'])
/** 요약 규칙: 앱 실행·종료는 그대로, 저장·교육청 전송 요청은 (사용자·학교·날짜·종류)별 마지막 1건 + 건수. 나머지는 제외. */
export function summarizeEvents(events: ActEvent[]): ActEvent[] {
  const out: ActEvent[] = []
  const done = new Map<string, { e: ActEvent; n: number }>()
  for (const e of events) {
    if (OPEN_CLOSE.has(e.kind)) { out.push(e); continue }
    if (e.kind !== 'save' && e.kind !== 'eduoffice_request') continue
    const day = (e.device_date || (e.device_at || '').slice(0, 10))
    const key = `${e.actor_login_id}|${e.school_id || ''}|${day}|${e.kind}`
    const cur = done.get(key)
    if (!cur) done.set(key, { e, n: 1 })
    else {
      cur.n += 1
      if ((e.device_at || '') > (cur.e.device_at || '')) cur.e = e
    }
  }
  for (const { e, n } of done.values()) {
    const label = e.kind === 'save' ? '학교 완료(저장)' : '학교 완료(교육청 전송 요청)'
    out.push({ ...e, note: n > 1 ? `${label} · ${n}건` : label })
  }
  return out
}
