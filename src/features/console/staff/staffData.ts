// [148] 직원 이력(점검자 관리) — 데이터 타입·조회·계산 (화면과 분리한 단일 소스)
//
// 저장 위치 — 새 백엔드 경로 없이 기존 org 문서(/ops/docs/:key)를 사용한다.
//   staff-resumes     { [login_id]: Resume }        점검자 이력서(직위·입사일·학력·경력·자격·교육)
//   staff-attendance  { [login_id]: AttPerson }     근태(내근·출장·반차·연차·병가·결근 수기 기록 + 연차 부여일수)
// 읽기 전용으로 함께 쓰는 문서·경로
//   staff-registry    { [login_id]: {affiliation, department, phone} }   (계정·권한 탭에서 편집)
//   visit-plans-{login}  { 'YYYY-MM-DD': Plan[] }   홈 캘린더 방문계획(학교별 업무) — 오늘 할 업무의 기준
//   schedules         { 'YYYY-MM': { 이름: { 'YYYY-MM-DD': {schools} } } }  근무표 — 방문계획이 없을 때 보조 기준
//   GET /history?author_id=…                       실제 수행 기록(5대 업무) — 수행 여부·현장 출석의 근거
import { api } from '../../../lib/api'
import { HOLIDAYS, type SchedDoc } from '../../schedule/MasterCalendar'

export type UserAcc = { id: string; login_id: string; name: string; role: string }
export type StaffReg = { affiliation?: string; department?: string; phone?: string }
export type SchoolLite = {
  id: string; name: string; manager?: string; school_level?: string; region?: string; office?: string
  contracted?: boolean; email?: string; address?: string; is_private?: boolean; education_count?: number | null
  principal?: string; supervisor?: string; inspection_agency?: string; org_kind?: string
}
export type Author = { author_id: string; name: string; affiliation: string; counts: Record<string, number>; total: number; last_activity: string }
export type HistRow = {
  module: string; record_id: string; school_id: string; school_name: string
  date: string; status: string; title: string; count?: number
}

export const TASKS: { key: string; label: string }[] = [
  { key: 'inspection', label: '안전점검' }, { key: 'risk', label: '위험성평가' }, { key: 'musculo', label: '근골격계' },
  { key: 'education', label: '교육' }, { key: 'compliance', label: '이행점검' },
]
export const MODULE_LABEL: Record<string, string> = Object.fromEntries(TASKS.map((t) => [t.key, t.label]))
export const MODULE_PILL: Record<string, string> = {
  inspection: 'ok', risk: 'warn', musculo: 'doing', education: 'na', compliance: 'late',
}
export const STATUS_LABEL: Record<string, string> = { draft: '작성 중', signed: '서명 완료', submitted: '제출 완료' }
export const UNKNOWN = '__unknown__'

/* ---------- 날짜 ---------- */
const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => ymd(new Date())
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d) }
export const isWorkday = (s: string) => { const w = new Date(s + 'T00:00:00').getDay(); return w !== 0 && w !== 6 && !HOLIDAYS[s] }
export function monthDays(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`)
}
/** 입사일 → '3년 2개월' */
export function tenure(hire?: string): string {
  if (!hire || !/^\d{4}-\d{2}-\d{2}/.test(hire)) return ''
  const a = new Date(hire + 'T00:00:00'); const b = new Date()
  let mo = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) mo--
  if (mo < 0) return ''
  const y = Math.floor(mo / 12); const r = mo % 12
  return y ? `${y}년${r ? ` ${r}개월` : ''}` : `${r}개월`
}

/* ---------- org 문서 ---------- */
export async function getDoc<T>(key: string): Promise<T> {
  const r = await api<{ doc: T | null }>(`/ops/docs/${key}`)
  return ((r && r.doc) || {}) as T
}
/** 읽기→수정→쓰기: 저장 직전 최신본을 다시 읽어 다른 사람의 변경을 덮어쓰지 않게 한다(사람 단위 병합). */
export async function patchDoc<T extends Record<string, unknown>>(key: string, login: string, value: T[keyof T] | null): Promise<T> {
  const cur = await getDoc<T>(key).catch(() => ({} as T))
  const next = { ...cur } as Record<string, unknown>
  if (value === null) delete next[login]
  else next[login] = value
  await api(`/ops/docs/${key}`, { method: 'PUT', body: JSON.stringify({ doc: next }) })
  return next as T
}

/* ---------- 이력서 ---------- */
export type ResumeRow = { period: string; title: string; detail?: string }
export type Resume = {
  position?: string; hire_date?: string; email?: string; phone?: string
  education?: ResumeRow[]; career?: ResumeRow[]; certs?: ResumeRow[]; trainings?: ResumeRow[]
  memo?: string; updated_at?: string
}
export type ResumeDoc = Record<string, Resume>
export const RESUME_SECTIONS: { key: 'education' | 'career' | 'certs' | 'trainings'; label: string; period: string; title: string; detail: string }[] = [
  { key: 'education', label: '학력', period: '기간 (예: 2010.03~2014.02)', title: '학교', detail: '전공·학위' },
  { key: 'career', label: '경력', period: '기간 (예: 2018.01~2023.12)', title: '기관·회사', detail: '담당 업무' },
  { key: 'certs', label: '자격·면허', period: '취득일', title: '자격명', detail: '발급기관·번호' },
  { key: 'trainings', label: '교육 이수', period: '이수일', title: '교육명', detail: '시간·기관' },
]

/* ---------- 근태 ---------- */
export type AttType = 'office' | 'trip' | 'half' | 'leave' | 'sick' | 'absent'
export const ATT_TYPES: { key: AttType; label: string; short: string; present: boolean; leave: number; cls: string }[] = [
  { key: 'office', label: '내근 출근', short: '내근', present: true, leave: 0, cls: 'office' },
  { key: 'trip', label: '출장', short: '출장', present: true, leave: 0, cls: 'trip' },
  { key: 'half', label: '반차 (0.5일)', short: '반차', present: true, leave: 0.5, cls: 'half' },
  { key: 'leave', label: '연차 휴가 (1일)', short: '연차', present: false, leave: 1, cls: 'leave' },
  { key: 'sick', label: '병가', short: '병가', present: false, leave: 0, cls: 'sick' },
  { key: 'absent', label: '결근', short: '결근', present: false, leave: 0, cls: 'absent' },
]
export const ATT_BY_KEY = Object.fromEntries(ATT_TYPES.map((t) => [t.key, t])) as Record<AttType, (typeof ATT_TYPES)[number]>
export type AttDay = { type: AttType; note?: string }
export type AttPerson = { annual_leave?: number; days?: Record<string, AttDay> }
export type AttDoc = Record<string, AttPerson>
export const DEFAULT_ANNUAL_LEAVE = 15

/** 그 달 현장 출석일(점검 등 기록이 있는 날) — /history 의 날짜 */
//   [170] 점검자·기간별로 1번만 조회(화면 안에서 다시 열면 바로 표시). 지난달 이전은 바뀌지 않으므로 계속 재사용, 이번 달은 1분 뒤 새로 조회
const fieldCache = new Map<string, { at: number; p: Promise<Map<string, number>> }>()
export function loadFieldDates(login: string, from: string, toExclusive: string): Promise<Map<string, number>> {
  const key = `${login}|${from}|${toExclusive}`
  const hit = fieldCache.get(key)
  const past = toExclusive <= todayStr().slice(0, 7) + '-01'
  if (hit && (past || Date.now() - hit.at < 60000)) return hit.p
  const p = fetchFieldDates(login, from, toExclusive)
  fieldCache.set(key, { at: Date.now(), p })
  p.catch(() => fieldCache.delete(key))
  return p
}
async function fetchFieldDates(login: string, from: string, toExclusive: string): Promise<Map<string, number>> {
  const q = new URLSearchParams({ author_id: login, date_from: from, date_to: toExclusive })
  const rows = await api<HistRow[]>(`/history?${q}`).catch(() => [] as HistRow[])
  const m = new Map<string, number>()
  for (const r of Array.isArray(rows) ? rows : []) {
    const d = (r.date || '').slice(0, 10)
    if (d >= from && d < toExclusive) m.set(d, (m.get(d) || 0) + 1)
  }
  return m
}

export type MonthStat = { workdays: number; present: number; field: number; manual: number; leave: number; absent: number; rate: number | null }
/** 월 근태 집계 — 근무일(평일-공휴일, 이번 달은 오늘까지) 중 출석(현장 기록 또는 내근·출장·반차) 비율 */
export function monthStat(ym: string, field: Map<string, number>, person: AttPerson | undefined, today = todayStr()): MonthStat {
  const days = monthDays(ym).filter((d) => d <= today)
  let workdays = 0; let present = 0; let fieldN = 0; let manual = 0; let leave = 0; let absent = 0
  for (const d of days) {
    const a = person?.days?.[d]
    const t = a ? ATT_BY_KEY[a.type] : undefined
    const isField = field.has(d)
    const isPresent = isField || !!t?.present
    if (isWorkday(d)) workdays++
    if (isPresent) { present++; if (isField) fieldN++; else manual++ }
    if (t) { leave += t.leave; if (a!.type === 'absent') absent++ }
  }
  return { workdays, present, field: fieldN, manual, leave, absent, rate: workdays ? Math.min(100, Math.round((present / workdays) * 100)) : null }
}
/** 올해 연차 사용(연차 1 + 반차 0.5) */
export function leaveUsedInYear(person: AttPerson | undefined, year: string): number {
  let s = 0
  for (const [d, a] of Object.entries(person?.days || {})) if (d.startsWith(year)) s += ATT_BY_KEY[a.type]?.leave || 0
  return s
}

/* ---------- 오늘 업무 수행 ---------- */
type Plan = { id: string; name: string; school_id?: string; tasks?: string[] }
export type TodayItem = { school: string; school_id?: string; task?: string; done: boolean; status?: string; records: HistRow[] }
export type TodayResult = { source: 'plan' | 'schedule' | 'none'; items: TodayItem[]; extra: HistRow[]; done: number; total: number; pct: number | null }

export async function loadToday(login: string, name: string, sched: SchedDoc, today = todayStr()): Promise<TodayResult> {
  const [plansDoc, rowsRaw] = await Promise.all([
    getDoc<Record<string, Plan[]>>(`visit-plans-${login}`).catch(() => ({} as Record<string, Plan[]>)),
    api<HistRow[]>(`/history?${new URLSearchParams({ author_id: login, date_from: today, date_to: addDays(today, 1) })}`).catch(() => [] as HistRow[]),
  ])
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []).filter((r) => (r.date || '').slice(0, 10) === today)
  let plans: Plan[] = Array.isArray(plansDoc[today]) ? plansDoc[today] : []
  let source: TodayResult['source'] = plans.length ? 'plan' : 'none'
  if (!plans.length) {
    const sc = sched[today.slice(0, 7)]?.[name]?.[today]?.schools ?? []
    if (sc.length) { plans = sc.map((s, i) => ({ id: 'sc' + i, name: s })); source = 'schedule' }
  }
  const match = (r: HistRow, p: Plan) => (!!p.school_id && r.school_id === p.school_id) || (!!r.school_name && r.school_name === p.name)
  const items: TodayItem[] = []
  for (const p of plans) {
    const tasks = p.tasks && p.tasks.length ? p.tasks : [undefined]
    for (const task of tasks) {
      const hit = rows.filter((r) => match(r, p) && (!task || r.module === task))
      items.push({ school: p.name, school_id: p.school_id, task, done: hit.length > 0, status: hit[0]?.status, records: hit })
    }
  }
  const extra = rows.filter((r) => !plans.some((p) => match(r, p) && (!(p.tasks && p.tasks.length) || p.tasks.includes(r.module))))
  const done = items.filter((i) => i.done).length
  return { source, items, extra, done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : null }
}
export const pctCls = (p: number | null) => (p === null ? 'todo' : p >= 100 ? 'ok' : p >= 50 ? 'warn' : 'late')

/* ---------- [151] 경력 합산 ---------- */
/** '2014.03~2021.12', '2014-03 ~ 2021-12', '2019.05~현재' 같은 기간 → 개월 수(해석 불가면 0) */
export function periodMonths(period: string): number {
  const m = (period || '').match(/(\d{4})[.\-/년\s]*(\d{1,2})?[^~\d]*~\s*(?:(\d{4})[.\-/년\s]*(\d{1,2})?|(현재|재직))/)
  if (!m) return 0
  const a = Number(m[1]) * 12 + (Number(m[2] || 1) - 1)
  const now = new Date()
  const b = m[5] ? now.getFullYear() * 12 + now.getMonth() : Number(m[3]) * 12 + (Number(m[4] || 12) - 1)
  return b >= a ? b - a + 1 : 0
}
export function monthsOfTenure(hire?: string): number {
  if (!hire || !/^\d{4}-\d{2}-\d{2}/.test(hire)) return 0
  const a = new Date(hire + 'T00:00:00'); const b = new Date()
  let mo = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) mo--
  return Math.max(0, mo)
}
export const fmtMonths = (mo: number) => {
  if (mo <= 0) return ''
  const y = Math.floor(mo / 12); const r = mo % 12
  return y ? `${y}년${r ? ` ${r}개월` : ''}` : `${r}개월`
}
