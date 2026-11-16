// 활동 현황 — 탭 패널 모음. Billing(세금계산서) 워크스페이스의 bws-head/bws-tools 패턴을 그대로 쓰고,
// 표는 공용 .tbl + sortth(정렬 헤더), 활동 전용 장식은 act-* (activity.css).
// 모든 패널은 { st, setSt, open } 을 받는다: st = 탭별 필터 상태(localStorage 보존), open = 드릴다운 탭 열기.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Download, Footprints, ListOrdered,
  MapPin, MapPinCheck, MapPinOff, RefreshCw, Save, School, Search, UserRoundCheck, Users,
} from 'lucide-react'
import { downloadCsv } from '../../lib/csv'
import {
  type ActEvent, type ConsentRow, type DailyRes, type RangeRow, type SchoolStat, type UserDay,
  ADMIN_ROLES, KIND_ORDER, SAVE_KINDS, addDays, addMonths, cached, dateOfIso, daysBetween, describeError, deviceLabelOf, deviceText,
  evDate, evTime, fetchConsents, fetchDaily, fetchDailyMany, fetchEventsRes, fetchEventsMany, fetchRange, fmtDateTime, fmtDist,
  fmtKoDate, fmtMD, fmtMDw, fmtTime, hm, isNotFound, isWeekend, kindLabel, monthDays, monthOf, n0, pct, roleLabel, shortDevice,
  sumSaves, timeMinutes, todayKst, useAsync, useDeviceLabels, userOnsite, weekDays, DOW, summarizeEvents, getLedgerDetail, setLedgerDetail,
} from './data'
import { MiniMap } from './MiniMap'

// ── 드릴다운 요청(셸이 탭으로 바꿔 연다) ──
export type OpenReq =
  | { kind: 'daily'; date?: string }
  | { kind: 'week'; anchor?: string }
  | { kind: 'month'; ym?: string }
  | { kind: 'users' }
  | { kind: 'schools' }
  | { kind: 'onsite' }
  | { kind: 'consent' }
  | { kind: 'devices' }
  | { kind: 'ledger'; date?: string; user?: string; school?: string }
  | { kind: 'user'; login_id: string; name: string; date?: string }
  | { kind: 'school'; school_id: string; school_name: string }
export type OpenFn = (req: OpenReq) => void

export type St = Record<string, string>
export type PanelProps = { st: St; setSt: (patch: St) => void; open: OpenFn }

// ═══════════════ 공용 소품 ═══════════════

export function Msg({ kind, children }: { kind: 'load' | 'err' | 'empty'; children: ReactNode }) {
  return (
    <div className={'act-msg' + (kind === 'err' ? ' err' : '') + (kind === 'load' ? ' spin' : '')}>
      {kind === 'load' && <RefreshCw size={14} />}
      {kind === 'err' && <AlertTriangle size={14} />}
      {children}
    </div>
  )
}

// 정렬 상태(헤더 클릭 토글) — 접근자 맵은 모듈 상수로 둘 것
type SortDir = 'asc' | 'desc'
type SortSpec = { key: string; dir: SortDir }
export type Acc<T> = Record<string, (r: T) => string | number | null | undefined>
export type SortState = { sort: SortSpec; toggle: (k: string) => void }
export function useSort<T>(rows: T[], acc: Acc<T>, init: SortSpec): { rows: T[]; s: SortState } {
  const [sort, setSort] = useState<SortSpec>(init)
  const sorted = useMemo(() => {
    const f = acc[sort.key]
    if (!f) return rows
    const m = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b)
      if ((x == null || x === '') && (y == null || y === '')) return 0
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * m
      return String(x).localeCompare(String(y), 'ko') * m
    })
  }, [rows, sort, acc])
  const toggle = useCallback((k: string) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })), [])
  return { rows: sorted, s: { sort, toggle } }
}
export function Th({ k, label, s, num, c }: { k: string; label: string; s: SortState; num?: boolean; c?: boolean }) {
  const active = s.sort.key === k
  return (
    <th className={'sortth' + (active ? ' active' : '') + (num ? ' num' : '') + (c ? ' c' : '')} onClick={() => s.toggle(k)} title="클릭하여 정렬">
      {label}<span className="caret">{active ? (s.sort.dir === 'asc' ? '▲' : '▼') : '◇'}</span>
    </th>
  )
}

export function Head({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="bws-head">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icon}{title}</h3>
      <div className="sp" />
      {children}
    </div>
  )
}
export function RowCount({ n, unit = '건', extra }: { n: number; unit?: string; extra?: string }) {
  return <span className="act-rowcount"><ListOrdered size={13} /> {n0(n)}{unit}{extra ? ` · ${extra}` : ''}</span>
}
export function Reload({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return <button type="button" className="tb" onClick={onClick} disabled={loading} title="다시 불러오기"><RefreshCw size={13} className={loading ? 'act-spin' : ''} /> 새로고침</button>
}

// 날짜 1개 이동(◀ 날짜 ▶ · 오늘)
function DateNav({ value, onChange, step = 1 }: { value: string; onChange: (d: string) => void; step?: number }) {
  return (
    <div className="act-daynav">
      <button type="button" className="act-ibtn" onClick={() => onChange(addDays(value, -step))} title={step === 1 ? '전날' : '이전 주'}><ChevronLeft size={16} /></button>
      <input type="date" value={value} max={todayKst()} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="act-ibtn" onClick={() => onChange(addDays(value, step))} title={step === 1 ? '다음날' : '다음 주'} disabled={addDays(value, step) > todayKst()}><ChevronRight size={16} /></button>
      <button type="button" className="act-today" onClick={() => onChange(todayKst())}>오늘</button>
    </div>
  )
}
// 기간(from~to) + 프리셋. 최대 일수 초과 시 from 을 당긴다.
function RangeNav({ from, to, onChange, maxDays = 31 }: { from: string; to: string; onChange: (from: string, to: string) => void; maxDays?: number }) {
  const today = todayKst()
  const preset = (n: number) => onChange(addDays(today, -(n - 1)), today)
  const days = daysBetween(from, to, 400).length
  return (
    <div className="act-daynav">
      <input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} />
      <span className="act-datesep">~</span>
      <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && onChange(from, e.target.value)} />
      <button type="button" className="act-today" onClick={() => preset(7)}>7일</button>
      <button type="button" className="act-today" onClick={() => preset(14)}>14일</button>
      <button type="button" className="act-today" onClick={() => preset(30)}>30일</button>
      {days > maxDays && <span className="act-warn">최대 {maxDays}일까지만 조회합니다</span>}
    </div>
  )
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="act-search">
      <Search size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function OnsiteChip({ v, small }: { v: boolean | null | undefined; small?: boolean }) {
  if (v === true) return <span className={'act-onsite yes' + (small ? ' sm' : '')}><MapPinCheck size={11} /> 현장</span>
  if (v === false) return <span className={'act-onsite no' + (small ? ' sm' : '')}><MapPin size={11} /> 현장 외</span>
  return <span className={'act-onsite na' + (small ? ' sm' : '')}><MapPinOff size={11} /> 미판정</span>
}
function Mark({ u }: { u: UserDay }) {
  const o = userOnsite(u)
  const sym = o.mark === 'yes' ? '○' : o.mark === 'no' ? '×' : '—'
  const title = o.mark === 'yes' ? '모든 학교 현장 작성' : o.mark === 'no' ? `현장 외 작성 ${o.no}곳` : '판정 불가(좌표 미등록·위치 미기록)'
  return (
    <span title={title}>
      <span className={'act-mark ' + o.mark}>{sym}</span>
      {(o.yes + o.no + o.na) > 0 && <span className="act-mark-sub">○{o.yes} ×{o.no} —{o.na}</span>}
    </span>
  )
}
export function KindChip({ k }: { k: string | null }) {
  return <span className={'act-kind k-' + (k || 'custom')}>{kindLabel(k)}</span>
}
// 사용자/학교 이름을 드릴다운 버튼으로
export function Who({ name, sub, onClick }: { name: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" className="act-link" onClick={(e) => { e.stopPropagation(); onClick() }} title="탭으로 열기">
      <b>{name}</b>{sub && <span>{sub}</span>}
    </button>
  )
}
// 요약/전체 토글 — 기본은 요약(앱 실행·앱 종료·학교 완료). 원장·사용자 탭이 같은 설정을 쓴다.
function useDetail(): [boolean, (v: boolean) => void] {
  const [d, setD] = useState<boolean>(() => getLedgerDetail())
  return [d, (v: boolean) => { setLedgerDetail(v); setD(v) }]
}
function DetailToggle({ detail, onChange }: { detail: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={detail} onChange={(e) => onChange(e.target.checked)} />
      모든 활동 보기 <small>(끄면 앱 실행·앱 종료·학교 완료만)</small>
    </label>
  )
}
// 기기 표시: 라벨(스토어 → 응답) 있으면 라벨, 없으면 ID 축약. 라벨 저장 시 스토어 구독으로 즉시 갱신.
export function DeviceCell({ id, label }: { id?: string | null; label?: string | null }) {
  useDeviceLabels()
  if (!id && !label) return <span className="muted">—</span>
  const lab = deviceLabelOf(id, label)
  return (
    <span className="act-dev" title={id ? `기기 ID ${id}` : undefined}>
      {lab ? <b>{lab}</b> : <code>{shortDevice(id)}</code>}
    </span>
  )
}

// 기간 범위 정리: 비어 있으면 기본값, 최대 일수 초과면 from 을 당김
function useRangeSt(st: St, setSt: (p: St) => void, defDays: number, maxDays: number) {
  const today = todayKst()
  const to = st.to || today
  let from = st.from || addDays(to, -(defDays - 1))
  if (daysBetween(from, to, 400).length > maxDays) from = addDays(to, -(maxDays - 1))
  const setRange = (f: string, t: string) => setSt({ from: f, to: t })
  return { from, to, days: daysBetween(from, to, maxDays), setRange }
}

// 범위의 daily 를 활동 있는 날만 골라 병렬 로드(range 로 날짜 선별 → daily N회)
async function loadActiveDays(from: string, to: string): Promise<{ range: RangeRow[]; days: DailyRes[]; error: unknown | null }> {
  const range = await fetchRange(from, to)
  const rows = Array.isArray(range) ? range : []
  const dates = [...new Set(rows.filter((r) => (r.events || 0) > 0).map((r) => r.date))].sort()
  const { days, error } = await fetchDailyMany(dates)
  return { range: rows, days, error }
}

// ═══════════════ 1. 일일 현황 ═══════════════
const DAILY_ACC: Acc<UserDay> = {
  name: (u) => u.name || u.login_id,
  role: (u) => roleLabel(u.role),
  device: (u) => (u.device_id || u.device_label ? deviceText(u.device_id, u.device_label) : ''),
  first: (u) => timeMinutes(u.first_at, u.first_hm),
  last: (u) => timeMinutes(u.last_at, u.last_hm),
  schools: (u) => (u.schools || []).length,
  saves: (u) => sumSaves(u),
  events: (u) => u.events || 0,
  onsite: (u) => ({ yes: 2, na: 1, no: 0 })[userOnsite(u).mark],
}
export function DailyPanel({ st, setSt, open }: PanelProps) {
  const date = st.date || todayKst()
  const q = st.q || ''
  const { data, loading, error, reload } = useAsync(() => fetchDaily(date), [date])
  const users = useMemo(() => (data?.users || []).filter((u) => (u.events || 0) > 0 || (u.schools || []).length > 0), [data])

  // 요약 카드
  const kpi = useMemo(() => {
    const schoolIds = new Set<string>()
    let saves = 0, yes = 0, judged = 0, na = 0
    for (const u of users) for (const s of u.schools || []) {
      schoolIds.add(s.school_id || s.school_name)
      saves += s.saves || 0
      if (s.onsite === null || s.onsite === undefined) na++
      else { judged++; if (s.onsite) yes++ }
    }
    return { people: users.length, schools: schoolIds.size, saves, yes, judged, na, ratio: pct(yes, judged) }
  }, [users])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? users.filter((u) => (u.name || '').toLowerCase().includes(k) || (u.login_id || '').toLowerCase().includes(k) || roleLabel(u.role).includes(k)) : users
  }, [users, q])
  const { rows, s } = useSort(filtered, DAILY_ACC, { key: 'last', dir: 'desc' })

  return (
    <div>
      <Head icon={<CalendarDays size={17} />} title="일일 현황">
        <span className="act-datelabel">{fmtKoDate(date)}</span>
      </Head>
      <div className="act-tools">
        <DateNav value={date} onChange={(d) => setSt({ date: d })} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className="tb" onClick={() => open({ kind: 'week', anchor: date })}><CalendarRange size={13} /> 이 주 격자</button>
          <button type="button" className="tb" onClick={() => open({ kind: 'ledger', date })}><ListOrdered size={13} /> 이날 이벤트 원장</button>
          <Reload onClick={reload} loading={loading} />
        </div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디·역할 검색" />
      </div>

      <div className="kpis act-kpis">
        <div className="kpi"><div className="l act-kpi-l"><Users size={13} /> 활동 인원</div><div className="v">{n0(kpi.people)}<small> 명</small></div><div className="d">앱 활동이 1건 이상 기록된 사용자</div></div>
        <div className="kpi"><div className="l act-kpi-l"><School size={13} /> 다녀간 학교</div><div className="v">{n0(kpi.schools)}<small> 곳</small></div><div className="d">학교 선택·점검 활동이 있던 학교(중복 제외)</div></div>
        <div className="kpi"><div className="l act-kpi-l"><Save size={13} /> 저장·제출</div><div className="v">{n0(kpi.saves)}<small> 건</small></div><div className="d">저장 + 교육청 전송 요청</div></div>
        <div className={'kpi' + (kpi.ratio !== null && kpi.ratio < 80 ? ' warn' : '')}>
          <div className="l act-kpi-l"><MapPinCheck size={13} /> 현장 작성 확인</div>
          <div className="v">{kpi.ratio === null ? '—' : kpi.ratio}<small>{kpi.ratio === null ? '' : ' %'}</small></div>
          <div className="d">현장 {kpi.yes} / 판정 {kpi.judged} · 좌표 미등록 {kpi.na}곳 분모 제외</div>
        </div>
      </div>

      {/* 미니맵: 그날 사용자별 마지막 위치 */}
      <MiniMap date={date} peopleCount={users.length} onOpenUser={(login_id, name) => open({ kind: 'user', login_id, name, date })} />

      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && users.length === 0 && <Msg kind="empty">이 날짜에는 기록된 앱 활동이 없습니다.</Msg>}
      {!loading && !error && users.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" extra={q ? `전체 ${users.length}명 중` : undefined} /><span className="muted" style={{ fontSize: 12 }}>행을 누르면 사용자 탭이 열립니다</span></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr>
                <Th k="name" label="이름 · 역할" s={s} />
                <Th k="first" label="첫 활동" s={s} />
                <Th k="last" label="마지막 활동" s={s} />
                <Th k="schools" label="학교" s={s} num />
                <Th k="saves" label="저장" s={s} num />
                <Th k="events" label="이벤트" s={s} num />
                <Th k="onsite" label="현장작성" s={s} c />
                <th />
              </tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.login_id} className="act-row" onClick={() => open({ kind: 'user', login_id: u.login_id, name: u.name || u.login_id, date })}>
                    <td className="act-name"><b>{u.name || u.login_id}</b><span className="r">{roleLabel(u.role)} · {u.login_id}</span></td>
                    <td className="act-time">{hm(u.first_hm, u.first_at)}</td>
                    <td className="act-last"><b>{hm(u.last_hm, u.last_at)}</b><span>{kindLabel(u.last_kind)}{u.last_school_name ? ` · ${u.last_school_name}` : ''}</span></td>
                    <td className="num">{(u.schools || []).length}</td>
                    <td className="num">{sumSaves(u)}</td>
                    <td className="num">{u.events || 0}</td>
                    <td className="c"><Mark u={u} /></td>
                    <td><button type="button" className="act-detail" onClick={(e) => { e.stopPropagation(); open({ kind: 'user', login_id: u.login_id, name: u.name || u.login_id, date }) }}>상세 ›</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 2. 주간 격자 ═══════════════
type WeekUser = { login_id: string; name: string; cells: Record<string, RangeRow>; total: number }
const WEEK_ACC: Acc<WeekUser> = { name: (u) => u.name, total: (u) => u.total }
export function WeekPanel({ st, setSt, open }: PanelProps) {
  const anchor = st.anchor || todayKst()
  const days = useMemo(() => weekDays(anchor), [anchor])
  const q = st.q || ''
  const { data, loading, error, reload } = useAsync(() => fetchRange(days[0], days[6]), [days[0]])
  const users = useMemo<WeekUser[]>(() => {
    const m = new Map<string, WeekUser>()
    for (const r of data || []) {
      if (!r.login_id) continue
      const u = m.get(r.login_id) || { login_id: r.login_id, name: r.name || r.login_id, cells: {}, total: 0 }
      u.cells[r.date] = r
      u.total += r.events || 0
      m.set(r.login_id, u)
    }
    const k = q.trim().toLowerCase()
    return [...m.values()].filter((u) => !k || u.name.toLowerCase().includes(k) || u.login_id.toLowerCase().includes(k))
  }, [data, q])
  const { rows, s } = useSort(users, WEEK_ACC, { key: 'name', dir: 'asc' })
  const today = todayKst()
  const dayTotals = useMemo(() => days.map((d) => users.filter((u) => (u.cells[d]?.events || 0) > 0).length), [days, users])

  return (
    <div>
      <Head icon={<CalendarRange size={17} />} title="주간 격자">
        <span className="act-datelabel">{fmtMDw(days[0])} ~ {fmtMDw(days[6])}</span>
      </Head>
      <div className="act-tools">
        <DateNav value={anchor} onChange={(d) => setSt({ anchor: d })} step={7} />
        <div className="bws-tools" style={{ margin: 0 }}><Reload onClick={reload} loading={loading} /></div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디 검색" />
      </div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && users.length === 0 && <Msg kind="empty">이 주에는 기록된 앱 활동이 없습니다.</Msg>}
      {!loading && !error && users.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" /><span className="muted" style={{ fontSize: 12 }}>날짜 머리글 → 그날 일일 현황 · 칸 → 사용자 탭</span></div>
          <div className="act-week-wrap">
            <table className="act-week">
              <thead><tr>
                <th className="sortth" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => s.toggle('name')}>사용자 {s.sort.key === 'name' ? (s.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
                {days.map((d, i) => (
                  <th key={d} className={'day' + (d === today ? ' sel' : '') + (isWeekend(d) ? ' wknd' : '') + (d > today ? ' future' : '')} onClick={() => open({ kind: 'daily', date: d })} title="일일 현황 열기">
                    {DOW[(i + 1) % 7]}<span className="d">{fmtMD(d)}</span><span className="n">{dayTotals[i]}명</span>
                  </th>
                ))}
                <th className="sortth" style={{ cursor: 'pointer' }} onClick={() => s.toggle('total')}>주간 이벤트 {s.sort.key === 'total' ? (s.sort.dir === 'asc' ? '▲' : '▼') : ''}</th>
              </tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.login_id}>
                    <td className="u"><Who name={u.name} sub={u.login_id} onClick={() => open({ kind: 'user', login_id: u.login_id, name: u.name, date: anchor })} /></td>
                    {days.map((d) => {
                      const c = u.cells[d]
                      const has = c && (c.events || 0) > 0
                      return (
                        <td key={d} className={'cell' + (has ? '' : ' none') + (d === today ? ' sel' : '')} onClick={() => has && open({ kind: 'user', login_id: u.login_id, name: u.name, date: d })} style={{ cursor: has ? 'pointer' : 'default' }}>
                          {has ? <><span className="rng">{hm(c.first_hm, c.first_at)} – {hm(c.last_hm, c.last_at)}</span><span className="n">{c.events}건</span></> : '—'}
                        </td>
                      )
                    })}
                    <td className="cell"><b>{n0(u.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 3. 월간 요약 ═══════════════
type MonthUser = { login_id: string; name: string; role: string; days: number; schools: number; saves: number; events: number; lastDate: string; lastAt: string | null; lastHm: string | null; onsiteYes: number; onsiteNo: number }
const MONTH_ACC: Acc<MonthUser> = {
  name: (u) => u.name, role: (u) => roleLabel(u.role), days: (u) => u.days, schools: (u) => u.schools, saves: (u) => u.saves,
  events: (u) => u.events, last: (u) => u.lastDate + ' ' + hm(u.lastHm, u.lastAt), onsite: (u) => u.onsiteYes + u.onsiteNo > 0 ? u.onsiteYes / (u.onsiteYes + u.onsiteNo) : -1,
}
export function MonthPanel({ st, setSt, open }: PanelProps) {
  const today = todayKst()
  const ym = st.ym || monthOf(today)
  const q = st.q || ''
  const all = useMemo(() => monthDays(ym).filter((d) => d <= today), [ym, today])
  const { data, loading, error, reload } = useAsync(() => loadActiveDays(all[0], all[all.length - 1]), [ym, all.length])

  const users = useMemo<MonthUser[]>(() => {
    const m = new Map<string, MonthUser>()
    const schoolSets = new Map<string, Set<string>>()     // 사용자별 방문 학교(중복 제외)
    for (const day of data?.days || []) for (const u of day.users || []) {
      if ((u.events || 0) === 0 && (u.schools || []).length === 0) continue
      const cur = m.get(u.login_id) || { login_id: u.login_id, name: u.name || u.login_id, role: u.role, days: 0, schools: 0, saves: 0, events: 0, lastDate: '', lastAt: null, lastHm: null, onsiteYes: 0, onsiteNo: 0 }
      const set = schoolSets.get(u.login_id) || new Set<string>()
      cur.days++
      cur.events += u.events || 0
      cur.saves += sumSaves(u)
      for (const sch of u.schools || []) {
        set.add(sch.school_id || sch.school_name)
        if (sch.onsite === true) cur.onsiteYes++
        else if (sch.onsite === false) cur.onsiteNo++
      }
      if (day.date >= cur.lastDate) { cur.lastDate = day.date; cur.lastAt = u.last_at; cur.lastHm = u.last_hm ?? null }
      cur.schools = set.size
      m.set(u.login_id, cur)
      schoolSets.set(u.login_id, set)
    }
    const k = q.trim().toLowerCase()
    return [...m.values()].filter((u) => !k || u.name.toLowerCase().includes(k) || u.login_id.toLowerCase().includes(k))
  }, [data, q])
  const { rows, s } = useSort(users, MONTH_ACC, { key: 'days', dir: 'desc' })
  const activeDays = data ? new Set((data.range || []).filter((r) => (r.events || 0) > 0).map((r) => r.date)).size : 0
  const [y, mo] = ym.split('-')

  return (
    <div>
      <Head icon={<CalendarDays size={17} />} title="월간 요약">
        <span className="act-datelabel">{y}년 {Number(mo)}월</span>
      </Head>
      <div className="act-tools">
        <div className="act-daynav">
          <button type="button" className="act-ibtn" onClick={() => setSt({ ym: addMonths(ym, -1) })} title="이전 달"><ChevronLeft size={16} /></button>
          <input type="month" value={ym} max={monthOf(today)} onChange={(e) => e.target.value && setSt({ ym: e.target.value })} />
          <button type="button" className="act-ibtn" onClick={() => setSt({ ym: addMonths(ym, 1) })} title="다음 달" disabled={addMonths(ym, 1) > monthOf(today)}><ChevronRight size={16} /></button>
          <button type="button" className="act-today" onClick={() => setSt({ ym: monthOf(today) })}>이번 달</button>
        </div>
        <div className="bws-tools" style={{ margin: 0 }}><Reload onClick={reload} loading={loading} /></div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디 검색" />
      </div>
      {loading && <Msg kind="load">월간 집계 중… (활동 있는 날짜별로 일일 자료를 합산합니다)</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && data?.error != null && <Msg kind="err">일부 날짜를 불러오지 못했습니다: {describeError(data.error)}</Msg>}
      {!loading && !error && users.length === 0 && <Msg kind="empty">이 달에는 기록된 앱 활동이 없습니다.</Msg>}
      {!loading && !error && users.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" extra={`활동일 ${activeDays}일 / 경과 ${all.length}일`} /><span className="muted" style={{ fontSize: 12 }}>행 → 마지막 활동일의 사용자 탭</span></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr>
                <Th k="name" label="이름 · 역할" s={s} />
                <Th k="days" label="활동일" s={s} num />
                <Th k="schools" label="학교 수" s={s} num />
                <Th k="saves" label="저장·제출" s={s} num />
                <Th k="events" label="이벤트" s={s} num />
                <Th k="onsite" label="현장 비율" s={s} c />
                <Th k="last" label="마지막 활동" s={s} />
              </tr></thead>
              <tbody>
                {rows.map((u) => {
                  const r = pct(u.onsiteYes, u.onsiteYes + u.onsiteNo)
                  return (
                    <tr key={u.login_id} className="act-row" onClick={() => open({ kind: 'user', login_id: u.login_id, name: u.name, date: u.lastDate })}>
                      <td className="act-name"><b>{u.name}</b><span className="r">{roleLabel(u.role)} · {u.login_id}</span></td>
                      <td className="num">{u.days}<small className="muted"> / {all.length}</small></td>
                      <td className="num">{u.schools}</td>
                      <td className="num">{u.saves}</td>
                      <td className="num">{n0(u.events)}</td>
                      <td className="c">{r === null ? <span className="act-mark na">—</span> : <span className={'act-mark ' + (r >= 80 ? 'yes' : 'no')}>{r}%</span>}</td>
                      <td className="act-last"><b>{fmtMDw(u.lastDate)}</b><span>{hm(u.lastHm, u.lastAt)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 4. 사용자별(선택 목록) ═══════════════
type PickUser = { login_id: string; name: string; role?: string; days: number; events: number; lastDate: string; lastAt: string | null; lastHm: string | null }
const PICK_ACC: Acc<PickUser> = { name: (u) => u.name, days: (u) => u.days, events: (u) => u.events, last: (u) => u.lastDate + hm(u.lastHm, u.lastAt) }
export function UsersPanel({ st, setSt, open }: PanelProps) {
  const { from, to, setRange } = useRangeSt(st, setSt, 30, 62)
  const q = st.q || ''
  const { data, loading, error, reload } = useAsync(() => fetchRange(from, to), [from, to])
  const users = useMemo<PickUser[]>(() => {
    const m = new Map<string, PickUser>()
    for (const r of data || []) {
      if (!r.login_id || (r.events || 0) === 0) continue
      const u = m.get(r.login_id) || { login_id: r.login_id, name: r.name || r.login_id, role: r.role, days: 0, events: 0, lastDate: '', lastAt: null, lastHm: null }
      u.days++; u.events += r.events || 0
      if (r.date >= u.lastDate) { u.lastDate = r.date; u.lastAt = r.last_at; u.lastHm = r.last_hm ?? null }
      m.set(r.login_id, u)
    }
    const k = q.trim().toLowerCase()
    return [...m.values()].filter((u) => !k || u.name.toLowerCase().includes(k) || u.login_id.toLowerCase().includes(k))
  }, [data, q])
  const { rows, s } = useSort(users, PICK_ACC, { key: 'last', dir: 'desc' })
  return (
    <div>
      <Head icon={<Users size={17} />} title="사용자별 — 대상 선택"><span className="muted" style={{ fontSize: 12 }}>기간 내 활동이 있던 사용자. 행을 누르면 사용자 탭이 열립니다.</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={62} />
        <div className="bws-tools" style={{ margin: 0 }}><Reload onClick={reload} loading={loading} /></div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디 검색" />
      </div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && users.length === 0 && <Msg kind="empty">기간 내 활동 사용자가 없습니다.</Msg>}
      {!loading && !error && users.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" /></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr><Th k="name" label="이름 · 아이디" s={s} /><Th k="days" label="활동일" s={s} num /><Th k="events" label="이벤트" s={s} num /><Th k="last" label="마지막 활동" s={s} /><th /></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.login_id} className="act-row" onClick={() => open({ kind: 'user', login_id: u.login_id, name: u.name, date: u.lastDate })}>
                    <td className="act-name"><b>{u.name}</b><span className="r">{u.role ? roleLabel(u.role) + ' · ' : ''}{u.login_id}</span></td>
                    <td className="num">{u.days}</td>
                    <td className="num">{n0(u.events)}</td>
                    <td className="act-last"><b>{fmtMDw(u.lastDate)}</b><span>{hm(u.lastHm, u.lastAt)}</span></td>
                    <td><button type="button" className="act-detail" onClick={(e) => { e.stopPropagation(); open({ kind: 'user', login_id: u.login_id, name: u.name, date: u.lastDate }) }}>열기 ›</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 5. 사용자 탭(인스턴스): 날짜별 타임라인 · 학교 · 이벤트 ═══════════════
const EV_ACC: Acc<ActEvent> = {
  time: (e) => (evDate(e) || '') + ' ' + evTime(e, true),
  kind: (e) => kindLabel(e.kind), school: (e) => e.school_name || '', dist: (e) => e.distance_m ?? null, actor: (e) => e.actor_name || e.actor_login_id,
  onsite: (e) => (e.onsite === true ? 2 : e.onsite === false ? 0 : 1),
  device: (e) => (e.device_id || e.device_label ? deviceText(e.device_id, e.device_label) : ''),
}
function EventsTable({ events, s, open, showActor, showDate }: { events: ActEvent[]; s: SortState; open: OpenFn; showActor?: boolean; showDate?: boolean }) {
  return (
    <div className="act-ev-wrap">
      <table className="act-ev">
        <thead><tr>
          <Th k="time" label={showDate ? '일시(기기)' : '시각(기기)'} s={s} />
          {showActor && <Th k="actor" label="사용자" s={s} />}
          <Th k="kind" label="종류" s={s} />
          <Th k="school" label="학교" s={s} />
          <Th k="dist" label="거리" s={s} num />
          <Th k="onsite" label="현장" s={s} />
          <th>비고</th>
        </tr></thead>
        <tbody>
          {events.map((e) => {
            const dDay = evDate(e), sDay = dateOfIso(e.server_at)
            const diff = !!e.server_at && (sDay !== dDay || fmtTime(e.server_at) !== evTime(e))
            return (
              <tr key={String(e.id)}>
                <td className="tm" title={e.server_at ? `서버 수신 ${sDay && sDay !== dDay ? sDay + ' ' : ''}${fmtTime(e.server_at, true)}` : undefined}>
                  {showDate && dDay ? fmtMD(dDay) + ' ' : ''}{evTime(e, true)}
                  {diff && <small>서버 {sDay && sDay !== dDay ? fmtMD(sDay) + ' ' : ''}{fmtTime(e.server_at)}</small>}
                </td>
                {showActor && <td><Who name={e.actor_name || e.actor_login_id} onClick={() => open({ kind: 'user', login_id: e.actor_login_id, name: e.actor_name || e.actor_login_id, date: dDay || undefined })} /></td>}
                <td><KindChip k={e.kind} /></td>
                <td className="sc">{e.school_id ? <Who name={e.school_name || e.school_id} onClick={() => open({ kind: 'school', school_id: e.school_id as string, school_name: e.school_name || e.school_id || '' })} /> : <span className="muted">—</span>}</td>
                <td className="num" title={e.accuracy_m != null ? `정확도 ±${Math.round(e.accuracy_m)} m` : undefined}>{fmtDist(e.distance_m)}</td>
                <td>{e.lat == null ? <span className="act-onsite na sm"><MapPinOff size={11} /> 위치 없음</span> : <OnsiteChip v={e.onsite} small />}</td>
                <td className="note" title={e.note || undefined}>{e.note || (e.inspection_id ? `점검 #${e.inspection_id}` : '')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const SCH_ACC: Acc<SchoolStat> = { name: (x) => x.school_name, first: (x) => timeMinutes(x.first_at, x.first_hm), last: (x) => timeMinutes(x.last_at, x.last_hm), events: (x) => x.events, saves: (x) => x.saves, dist: (x) => x.min_distance_m ?? null, onsite: (x) => (x.onsite === true ? 2 : x.onsite === false ? 0 : 1) }

export function UserPanel({ st, setSt, open, login_id, name }: PanelProps & { login_id: string; name: string }) {
  const today = todayKst()
  const date = st.date || today
  // 왼쪽 활동일 목록 기간: 기본은 선택 날짜까지 14일. 날짜를 기간 밖으로 옮기면 기간을 늘린다.
  const { from, to, setRange } = useRangeSt({ from: st.from, to: st.to || date }, setSt, 14, 62)
  // 날짜 목록(기간 내 활동일) — range
  const rangeQ = useAsync(() => fetchRange(from, to), [from, to])
  const myDays = useMemo(() => (rangeQ.data || []).filter((r) => r.login_id === login_id && (r.events || 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1)), [rangeQ.data, login_id])
  // 선택 날짜의 학교별 요약 + 이벤트
  const dayQ = useAsync(() => fetchDaily(date), [date])
  const me = useMemo(() => (dayQ.data?.users || []).find((u) => u.login_id === login_id) || null, [dayQ.data, login_id])
  const evQ = useAsync(() => fetchEventsRes({ date, login_id }), [date, login_id])
  const [detail, setDetail] = useDetail()
  const events = useMemo(() => { const all = evQ.data?.events || []; return detail ? all : summarizeEvents(all) }, [evQ.data, detail])
  const schools = useMemo(() => me?.schools || [], [me])
  const sch = useSort(schools, SCH_ACC, { key: 'first', dir: 'asc' })
  const ev = useSort(events, EV_ACC, { key: 'time', dir: 'desc' })
  const loading = dayQ.loading || evQ.loading
  const err = dayQ.error || evQ.error
  const reload = () => { dayQ.reload(); evQ.reload(); rangeQ.reload() }
  const o = me ? userOnsite(me) : null

  return (
    <div>
      <Head icon={<UserRoundCheck size={17} />} title={`${name} · ${fmtKoDate(date)}`}>
        {me && <span className="pillx doing">{roleLabel(me.role)}</span>}
        <span className="muted" style={{ fontSize: 12 }}>{login_id}</span>
      </Head>
      <div className="act-tools">
        <DateNav value={date} onChange={(d) => setSt({ date: d, ...(d < from ? { from: d } : {}), ...(d > to ? { to: d } : {}) })} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className="tb" onClick={() => open({ kind: 'ledger', date, user: name })}><ListOrdered size={13} /> 원장에서 보기</button>
          <Reload onClick={reload} loading={loading} />
        </div>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>왼쪽 날짜 목록 기간</span>
        <RangeNav from={from} to={to} onChange={setRange} maxDays={62} />
      </div>

      <div className="act-user-grid">
        {/* 왼쪽: 활동일 목록 */}
        <div className="act-sub-card">
          <h4><CalendarDays size={14} /> 활동일 <small>{myDays.length}일 · {fmtMD(from)}~{fmtMD(to)}</small></h4>
          {rangeQ.loading && <Msg kind="load">불러오는 중…</Msg>}
          {!rangeQ.loading && rangeQ.error != null && <Msg kind="err">{describeError(rangeQ.error)}</Msg>}
          {!rangeQ.loading && !rangeQ.error && myDays.length === 0 && <Msg kind="empty">기간 내 활동이 없습니다.</Msg>}
          <div className="act-daylist">
            {myDays.map((r) => (
              <button key={r.date} type="button" className={'act-day' + (r.date === date ? ' on' : '') + (isWeekend(r.date) ? ' wknd' : '')} onClick={() => setSt({ date: r.date })}>
                <span className="d">{fmtMDw(r.date)}</span>
                <span className="t">{hm(r.first_hm, r.first_at)} – {hm(r.last_hm, r.last_at)}</span>
                <span className="n">{r.events}건</span>
              </button>
            ))}
          </div>
        </div>

        {/* 오른쪽: 그날 요약 + 학교 타임라인 + 이벤트 */}
        <div className="act-user-main">
          {loading && <Msg kind="load">불러오는 중…</Msg>}
          {!loading && err != null && <Msg kind="err">{describeError(err)}</Msg>}
          {!loading && !err && !me && events.length === 0 && <Msg kind="empty">{fmtKoDate(date)}에는 이 사용자의 활동이 없습니다. 왼쪽에서 다른 날짜를 고르세요.</Msg>}
          {!loading && !err && (me || events.length > 0) && (
            <>
              <div className="act-minikpis">
                <div className="act-minikpi"><span>첫 활동</span><b>{hm(me?.first_hm, me?.first_at)}</b></div>
                <div className="act-minikpi"><span>마지막 활동</span><b>{hm(me?.last_hm, me?.last_at)}</b><small>{kindLabel(me?.last_kind)}{me?.last_school_name ? ` · ${me.last_school_name}` : ''}</small></div>
                <div className="act-minikpi"><span>학교</span><b>{schools.length}<small> 곳</small></b></div>
                <div className="act-minikpi"><span>저장·제출</span><b>{me ? sumSaves(me) : 0}<small> 건</small></b></div>
                <div className="act-minikpi"><span>이벤트</span><b>{me?.events ?? events.length}<small> 건</small></b></div>
                <div className="act-minikpi"><span>현장 작성</span><b>{o ? (o.mark === 'yes' ? '○' : o.mark === 'no' ? '×' : '—') : '—'}</b><small>{o ? `○${o.yes} ×${o.no} —${o.na}` : ''}</small></div>
              </div>

              <div className="act-sub-card">
                <h4><School size={14} /> 학교별 타임라인 <small>{schools.length}곳 · 학교명을 누르면 학교 탭</small></h4>
                {schools.length === 0 ? <Msg kind="empty">학교 단위 활동이 없습니다(앱 실행·로그아웃 등만 기록).</Msg> : (
                  <table className="act-ev">
                    <thead><tr><Th k="name" label="학교" s={sch.s} /><Th k="first" label="첫 활동" s={sch.s} /><Th k="last" label="마지막" s={sch.s} /><Th k="events" label="이벤트" s={sch.s} num /><Th k="saves" label="저장" s={sch.s} num /><Th k="dist" label="최소 거리" s={sch.s} num /><Th k="onsite" label="현장 여부" s={sch.s} /></tr></thead>
                    <tbody>
                      {sch.rows.map((x) => (
                        <tr key={x.school_id || x.school_name}>
                          <td><Who name={x.school_name} onClick={() => open({ kind: 'school', school_id: x.school_id, school_name: x.school_name })} /></td>
                          <td className="tm">{hm(x.first_hm, x.first_at)}</td>
                          <td className="tm">{hm(x.last_hm, x.last_at)}</td>
                          <td className="num">{x.events}</td>
                          <td className="num">{x.saves}</td>
                          <td className="num">{fmtDist(x.min_distance_m)}</td>
                          <td><OnsiteChip v={x.onsite} small /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="act-sub-card">
                <h4><Footprints size={14} /> 이벤트 <DetailToggle detail={detail} onChange={setDetail} /> <small>{events.length}건 · 기기 작성 시각 기준{evQ.data?.truncated ? ` · 하루 ${evQ.data.total}건 중 최신 ${events.length}건만 표시` : ''}</small></h4>
                {events.length === 0 ? <Msg kind="empty">이벤트가 없습니다.</Msg> : <EventsTable events={ev.rows} s={ev.s} open={open} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════ 6. 학교별(검색 목록) ═══════════════
type SchoolLite = { id: string; name: string; address?: string }
type PickSchool = { school_id: string; name: string; address?: string; visits: number; users: Set<string>; lastDate: string; onsiteYes: number; onsiteNo: number }
const PSCH_ACC: Acc<PickSchool> = { name: (x) => x.name, visits: (x) => x.visits, users: (x) => x.users.size, last: (x) => x.lastDate, onsite: (x) => (x.onsiteYes + x.onsiteNo > 0 ? x.onsiteYes / (x.onsiteYes + x.onsiteNo) : -1) }
export function SchoolsPanel({ st, setSt, open }: PanelProps) {
  const { from, to, setRange } = useRangeSt(st, setSt, 7, 31)
  const q = st.q || ''
  const onlyVisited = st.only !== '0'
  const listQ = useAsync(() => cached<SchoolLite[]>('/schools'), [])
  const actQ = useAsync(() => loadActiveDays(from, to), [from, to])
  const rowsAll = useMemo<PickSchool[]>(() => {
    const m = new Map<string, PickSchool>()
    for (const sc of Array.isArray(listQ.data) ? listQ.data : []) m.set(sc.id, { school_id: sc.id, name: sc.name, address: sc.address, visits: 0, users: new Set(), lastDate: '', onsiteYes: 0, onsiteNo: 0 })
    for (const day of actQ.data?.days || []) for (const u of day.users || []) for (const sch of u.schools || []) {
      const key = sch.school_id || sch.school_name
      const cur = m.get(key) || { school_id: key, name: sch.school_name, visits: 0, users: new Set<string>(), lastDate: '', onsiteYes: 0, onsiteNo: 0 }
      cur.visits++; cur.users.add(u.name || u.login_id)
      if (day.date > cur.lastDate) cur.lastDate = day.date
      if (sch.onsite === true) cur.onsiteYes++; else if (sch.onsite === false) cur.onsiteNo++
      m.set(key, cur)
    }
    const k = q.trim().toLowerCase()
    return [...m.values()].filter((x) => (!onlyVisited || x.visits > 0) && (!k || x.name.toLowerCase().includes(k) || (x.address || '').toLowerCase().includes(k)))
  }, [listQ.data, actQ.data, q, onlyVisited])
  const { rows, s } = useSort(rowsAll, PSCH_ACC, { key: 'visits', dir: 'desc' })
  const loading = listQ.loading || actQ.loading
  return (
    <div>
      <Head icon={<School size={17} />} title="학교별 — 학교 검색"><span className="muted" style={{ fontSize: 12 }}>기간 내 방문(사용자×일) 집계. 행을 누르면 학교 탭이 열립니다.</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={31} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className={'tb' + (onlyVisited ? ' on' : '')} onClick={() => setSt({ only: onlyVisited ? '0' : '1' })}>{onlyVisited ? '방문 학교만' : '전체 학교'}</button>
          <Reload onClick={() => { listQ.reload(); actQ.reload() }} loading={loading} />
        </div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="학교명·주소 검색" />
      </div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && actQ.error != null && <Msg kind="err">{describeError(actQ.error)}</Msg>}
      {!loading && !actQ.error && rows.length === 0 && <Msg kind="empty">{onlyVisited ? '기간 내 방문 기록이 있는 학교가 없습니다. "전체 학교" 로 바꿔 검색할 수 있습니다.' : '검색 결과가 없습니다.'}</Msg>}
      {!loading && rows.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="곳" /></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr><Th k="name" label="학교" s={s} /><Th k="visits" label="방문" s={s} num /><Th k="users" label="방문자" s={s} num /><Th k="onsite" label="현장 비율" s={s} c /><Th k="last" label="마지막 방문" s={s} /><th /></tr></thead>
              <tbody>
                {rows.map((x) => {
                  const r = pct(x.onsiteYes, x.onsiteYes + x.onsiteNo)
                  return (
                    <tr key={x.school_id} className="act-row" onClick={() => open({ kind: 'school', school_id: x.school_id, school_name: x.name })}>
                      <td className="act-name"><b>{x.name}</b>{x.address && <span className="r">{x.address}</span>}</td>
                      <td className="num">{x.visits}</td>
                      <td className="num" title={[...x.users].join(', ')}>{x.users.size}</td>
                      <td className="c">{r === null ? <span className="act-mark na">—</span> : <span className={'act-mark ' + (r >= 80 ? 'yes' : 'no')}>{r}%</span>}</td>
                      <td>{x.lastDate ? fmtMDw(x.lastDate) : <span className="muted">—</span>}</td>
                      <td><button type="button" className="act-detail" onClick={(e) => { e.stopPropagation(); open({ kind: 'school', school_id: x.school_id, school_name: x.name }) }}>열기 ›</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 7. 학교 탭(인스턴스): 누가 언제 다녀갔는지 ═══════════════
type Visit = { date: string; login_id: string; name: string; role: string; first_at: string | null; first_hm?: string | null; last_at: string | null; last_hm?: string | null; events: number; saves: number; dist: number | null; onsite: boolean | null }
const VISIT_ACC: Acc<Visit> = { date: (v) => v.date + hm(v.first_hm, v.first_at), name: (v) => v.name, first: (v) => timeMinutes(v.first_at, v.first_hm), last: (v) => timeMinutes(v.last_at, v.last_hm), events: (v) => v.events, saves: (v) => v.saves, dist: (v) => v.dist, onsite: (v) => (v.onsite === true ? 2 : v.onsite === false ? 0 : 1) }
export function SchoolPanel({ st, setSt, open, school_id, school_name }: PanelProps & { school_id: string; school_name: string }) {
  const { from, to, setRange } = useRangeSt(st, setSt, 30, 62)
  const { data, loading, error, reload } = useAsync(() => loadActiveDays(from, to), [from, to])
  const visits = useMemo<Visit[]>(() => {
    const out: Visit[] = []
    for (const day of data?.days || []) for (const u of day.users || []) for (const sch of u.schools || []) {
      if ((sch.school_id || sch.school_name) !== school_id && sch.school_name !== school_name) continue
      out.push({ date: day.date, login_id: u.login_id, name: u.name || u.login_id, role: u.role, first_at: sch.first_at, first_hm: sch.first_hm, last_at: sch.last_at, last_hm: sch.last_hm, events: sch.events, saves: sch.saves, dist: sch.min_distance_m ?? null, onsite: sch.onsite })
    }
    return out
  }, [data, school_id, school_name])
  const { rows, s } = useSort(visits, VISIT_ACC, { key: 'date', dir: 'desc' })
  const sum = useMemo(() => ({
    days: new Set(visits.map((v) => v.date)).size, users: new Set(visits.map((v) => v.login_id)).size,
    saves: visits.reduce((a, v) => a + v.saves, 0), yes: visits.filter((v) => v.onsite === true).length, no: visits.filter((v) => v.onsite === false).length, na: visits.filter((v) => v.onsite == null).length,
  }), [visits])
  return (
    <div>
      <Head icon={<School size={17} />} title={school_name}><span className="muted" style={{ fontSize: 12 }}>{school_id}</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={62} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className="tb" onClick={() => open({ kind: 'ledger', date: rows[0]?.date, school: school_name })}><ListOrdered size={13} /> 원장에서 보기</button>
          <Reload onClick={reload} loading={loading} />
        </div>
      </div>
      <div className="act-minikpis">
        <div className="act-minikpi"><span>방문일</span><b>{sum.days}<small> 일</small></b></div>
        <div className="act-minikpi"><span>방문자</span><b>{sum.users}<small> 명</small></b></div>
        <div className="act-minikpi"><span>방문(사용자×일)</span><b>{visits.length}<small> 회</small></b></div>
        <div className="act-minikpi"><span>저장·제출</span><b>{sum.saves}<small> 건</small></b></div>
        <div className="act-minikpi"><span>현장 / 현장 외 / 미판정</span><b>{sum.yes} / {sum.no} / {sum.na}</b>{sum.na > 0 && sum.yes + sum.no === 0 && <small>학교 좌표 미등록 가능</small>}</div>
      </div>
      {loading && <Msg kind="load">기간 내 활동일을 모아 집계 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && visits.length === 0 && <Msg kind="empty">기간 내 이 학교의 방문 기록이 없습니다.</Msg>}
      {!loading && !error && visits.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="회" /><span className="muted" style={{ fontSize: 12 }}>행 → 그날 사용자 탭</span></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr><Th k="date" label="날짜" s={s} /><Th k="name" label="사용자" s={s} /><Th k="first" label="첫 활동" s={s} /><Th k="last" label="마지막" s={s} /><Th k="events" label="이벤트" s={s} num /><Th k="saves" label="저장" s={s} num /><Th k="dist" label="최소 거리" s={s} num /><Th k="onsite" label="현장 여부" s={s} /></tr></thead>
              <tbody>
                {rows.map((v, i) => (
                  <tr key={v.date + v.login_id + i} className="act-row" onClick={() => open({ kind: 'user', login_id: v.login_id, name: v.name, date: v.date })}>
                    <td><b>{fmtMDw(v.date)}</b></td>
                    <td className="act-name"><b>{v.name}</b><span className="r">{roleLabel(v.role)}</span></td>
                    <td className="act-time">{hm(v.first_hm, v.first_at)}</td>
                    <td className="act-time">{hm(v.last_hm, v.last_at)}</td>
                    <td className="num">{v.events}</td>
                    <td className="num">{v.saves}</td>
                    <td className="num">{fmtDist(v.dist)}</td>
                    <td><OnsiteChip v={v.onsite} small /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 8. 현장 작성 증빙 ═══════════════
type OnsiteUser = { login_id: string; name: string; role: string; yes: number; no: number; na: number; days: number }
const ONS_ACC: Acc<OnsiteUser> = { name: (u) => u.name, yes: (u) => u.yes, no: (u) => u.no, na: (u) => u.na, days: (u) => u.days, ratio: (u) => (u.yes + u.no > 0 ? u.yes / (u.yes + u.no) : -1) }
const ANOM_ACC: Acc<ActEvent> = { ...EV_ACC }
export function OnsitePanel({ st, setSt, open }: PanelProps) {
  const { from, to, days, setRange } = useRangeSt(st, setSt, 7, 31)
  const threshold = Math.max(0, Number(st.threshold) || 1000)
  const dailyQ = useAsync(() => fetchDailyMany(days), [from, to])
  const evQ = useAsync(() => fetchEventsMany(days), [from, to])
  const agg = useMemo(() => {
    const users = new Map<string, OnsiteUser>()
    let yes = 0, no = 0, na = 0
    for (const day of dailyQ.data?.days || []) for (const u of day.users || []) {
      if ((u.schools || []).length === 0) continue
      const cur = users.get(u.login_id) || { login_id: u.login_id, name: u.name || u.login_id, role: u.role, yes: 0, no: 0, na: 0, days: 0 }
      cur.days++
      for (const sch of u.schools || []) {
        if (sch.onsite === true) { cur.yes++; yes++ } else if (sch.onsite === false) { cur.no++; no++ } else { cur.na++; na++ }
      }
      users.set(u.login_id, cur)
    }
    return { users: [...users.values()], yes, no, na }
  }, [dailyQ.data])
  const anomalies = useMemo(() => (evQ.data?.events || []).filter((e) => e.distance_m != null && e.distance_m > threshold), [evQ.data, threshold])
  const located = useMemo(() => (evQ.data?.events || []).filter((e) => e.lat != null).length, [evQ.data])
  const us = useSort(agg.users, ONS_ACC, { key: 'no', dir: 'desc' })
  const an = useSort(anomalies, ANOM_ACC, { key: 'dist', dir: 'desc' })
  const loading = dailyQ.loading || evQ.loading
  const ratio = pct(agg.yes, agg.yes + agg.no)
  return (
    <div>
      <Head icon={<MapPinCheck size={17} />} title="현장 작성 증빙"><span className="muted" style={{ fontSize: 12 }}>저장·제출 시점 위치와 학교 좌표의 거리로 판정 · 참고용</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={31} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <label className="tb" style={{ cursor: 'default' }}>이상치 기준
            <input className="act-num" type="number" min={0} step={100} value={threshold} onChange={(e) => setSt({ threshold: e.target.value })} /> m 초과
          </label>
          <Reload onClick={() => { dailyQ.reload(); evQ.reload() }} loading={loading} />
        </div>
      </div>
      <div className="kpis act-kpis">
        <div className="kpi"><div className="l act-kpi-l"><MapPinCheck size={13} /> 현장 작성</div><div className="v">{n0(agg.yes)}<small> 건</small></div><div className="d">학교 단위(사용자×학교×일) 집계</div></div>
        <div className={'kpi' + (agg.no > 0 ? ' red' : '')}><div className="l act-kpi-l"><MapPin size={13} /> 현장 외 작성</div><div className="v">{n0(agg.no)}<small> 건</small></div><div className="d">학교 좌표와 떨어진 곳에서 저장·제출</div></div>
        <div className="kpi"><div className="l act-kpi-l"><MapPinOff size={13} /> 판정 불가</div><div className="v">{n0(agg.na)}<small> 건</small></div><div className="d">좌표 미등록 학교 또는 위치 미동의·미기록</div></div>
        <div className={'kpi' + (ratio !== null && ratio < 80 ? ' warn' : '')}><div className="l act-kpi-l"><Footprints size={13} /> 현장 비율</div><div className="v">{ratio === null ? '—' : ratio}<small>{ratio === null ? '' : ' %'}</small></div><div className="d">위치 기록 이벤트 {n0(located)}건 · 이상치 {anomalies.length}건</div></div>
      </div>
      {loading && <Msg kind="load">기간 자료를 모아 집계 중… ({days.length}일)</Msg>}
      {!loading && (dailyQ.error != null || evQ.error != null) && <Msg kind="err">{describeError(dailyQ.error || evQ.error)}</Msg>}
      {!loading && (dailyQ.data?.error != null || evQ.data?.error != null) && <Msg kind="err">일부 날짜를 불러오지 못했습니다: {describeError(dailyQ.data?.error || evQ.data?.error)}</Msg>}
      {!loading && !dailyQ.error && !evQ.error && (
        <div className="act-two">
          <div className="act-card" style={{ padding: 0 }}>
            <div className="act-tablebar"><b style={{ fontSize: 13 }}>사용자별 집계</b><RowCount n={us.rows.length} unit="명" /></div>
            {us.rows.length === 0 ? <Msg kind="empty">기간 내 학교 단위 활동이 없습니다.</Msg> : (
              <div className="twrap">
                <table className="tbl act-table">
                  <thead><tr><Th k="name" label="사용자" s={us.s} /><Th k="days" label="활동일" s={us.s} num /><Th k="yes" label="현장" s={us.s} num /><Th k="no" label="현장 외" s={us.s} num /><Th k="na" label="미판정" s={us.s} num /><Th k="ratio" label="비율" s={us.s} c /></tr></thead>
                  <tbody>
                    {us.rows.map((u) => {
                      const r = pct(u.yes, u.yes + u.no)
                      return (
                        <tr key={u.login_id} className="act-row" onClick={() => open({ kind: 'user', login_id: u.login_id, name: u.name, date: to })}>
                          <td className="act-name"><b>{u.name}</b><span className="r">{roleLabel(u.role)}</span></td>
                          <td className="num">{u.days}</td>
                          <td className="num" style={{ color: 'var(--ok-ink)' }}>{u.yes}</td>
                          <td className="num" style={{ color: u.no > 0 ? 'var(--red-ink)' : undefined }}>{u.no}</td>
                          <td className="num muted">{u.na}</td>
                          <td className="c">{r === null ? <span className="act-mark na">—</span> : <span className={'act-mark ' + (r >= 80 ? 'yes' : 'no')}>{r}%</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="act-card" style={{ padding: 0 }}>
            <div className="act-tablebar"><b style={{ fontSize: 13 }}><AlertTriangle size={13} style={{ verticalAlign: '-2px', color: 'var(--amber-ink)' }} /> 거리 이상치 ({n0(threshold)} m 초과)</b><RowCount n={an.rows.length} /></div>
            {an.rows.length === 0 ? <Msg kind="empty">기준을 넘는 이벤트가 없습니다.</Msg> : <EventsTable events={an.rows} s={an.s} open={open} showActor showDate />}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 9. 위치 동의 현황 ═══════════════
// GET /ops/activity/consents 가 있으면 실제 동의 기록(동의/미동의/버전/시각)을 보여준다.
// 404(구서버)면 종전 추정 모드(ConsentEstimate) — 기간 내 이벤트의 lat 존재 여부로 동의 여부를 추정.
export function ConsentPanel(props: PanelProps) {
  const apiQ = useAsync(
    () => fetchConsents().then((rows) => ({ rows, fallback: false })).catch((e) => { if (isNotFound(e)) return { rows: [] as ConsentRow[], fallback: true }; throw e }),
    [],
  )
  if (apiQ.loading) {
    return (
      <div>
        <Head icon={<MapPin size={17} />} title="위치 동의 현황" />
        <Msg kind="load">동의 기록을 불러오는 중…</Msg>
      </div>
    )
  }
  if (apiQ.error != null) {
    return (
      <div>
        <Head icon={<MapPin size={17} />} title="위치 동의 현황"><Reload onClick={apiQ.reload} /></Head>
        <Msg kind="err">{describeError(apiQ.error)}</Msg>
      </div>
    )
  }
  if (apiQ.data?.fallback) return <ConsentEstimate {...props} />
  return <ConsentApi {...props} rows={apiQ.data?.rows || []} reload={apiQ.reload} />
}

// 실제 동의 기록 표
const CAPI_ACC: Acc<ConsentRow> = {
  name: (c) => c.name || c.login_id,
  status: (c) => (c.agreed === true ? 2 : c.agreed === false ? 0 : 1),
  kind: (c) => c.kind || '',
  version: (c) => c.version || '',
  at: (c) => c.at || '',
}
function ConsentApi({ st, setSt, open, rows: all, reload }: PanelProps & { rows: ConsentRow[]; reload: () => void }) {
  const q = st.q || ''
  const onlyNo = st.only === 'no'
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return all.filter((c) => (!onlyNo || c.agreed !== true) && (!k || (c.name || '').toLowerCase().includes(k) || c.login_id.toLowerCase().includes(k)))
  }, [all, q, onlyNo])
  const { rows, s } = useSort(filtered, CAPI_ACC, { key: 'status', dir: 'asc' })
  const cnt = { yes: all.filter((c) => c.agreed === true).length, no: all.filter((c) => c.agreed === false).length, na: all.filter((c) => c.agreed == null).length }
  const noNames = all.filter((c) => c.agreed === false).map((c) => c.name || c.login_id)
  const kinds = new Set(all.map((c) => c.kind || '').filter(Boolean))
  return (
    <div>
      <Head icon={<MapPin size={17} />} title="위치 동의 현황"><span className="muted" style={{ fontSize: 12 }}>서버 동의 기록 기준 · 위치는 동의한 사용자만, 저장·제출 시점에 1회 기록</span></Head>
      <div className="act-tools">
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className={'tb' + (onlyNo ? ' on' : '')} onClick={() => setSt({ only: onlyNo ? '' : 'no' })}>{onlyNo ? '미동의·미응답만' : '전체 보기'}</button>
          <Reload onClick={reload} />
        </div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디 검색" />
      </div>
      {cnt.no > 0 && <div className="act-note warn"><AlertTriangle size={14} /> <span><b>미동의 {cnt.no}명</b>: {noNames.join(', ')} — 이 사용자들의 저장·제출에는 위치가 기록되지 않아 현장 작성 판정이 불가합니다.</span></div>}
      <div className="act-minikpis">
        <div className="act-minikpi"><span>동의</span><b style={{ color: 'var(--ok-ink)' }}>{cnt.yes}<small> 명</small></b></div>
        <div className="act-minikpi"><span>미동의</span><b style={{ color: cnt.no > 0 ? 'var(--red-ink)' : undefined }}>{cnt.no}<small> 명</small></b></div>
        <div className="act-minikpi"><span>미응답(기록 없음)</span><b>{cnt.na}<small> 명</small></b></div>
        <div className="act-minikpi"><span>전체</span><b>{all.length}<small> 명</small></b>{kinds.size > 0 && <small>종류: {[...kinds].join(', ')}</small>}</div>
      </div>
      {rows.length === 0 && <Msg kind="empty">{all.length === 0 ? '동의 기록이 없습니다.' : '조건에 맞는 사용자가 없습니다.'}</Msg>}
      {rows.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" extra={onlyNo || q ? `전체 ${all.length}명 중` : undefined} /><span className="muted" style={{ fontSize: 12 }}>행을 누르면 사용자 탭이 열립니다</span></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr><Th k="name" label="사용자" s={s} /><Th k="status" label="동의" s={s} c /><Th k="kind" label="종류" s={s} /><Th k="version" label="동의 버전" s={s} /><Th k="at" label="동의·철회 시각" s={s} /><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.login_id + (c.kind || '')} className={'act-row' + (c.agreed === false ? ' act-row-bad' : '')} onClick={() => open({ kind: 'user', login_id: c.login_id, name: c.name || c.login_id })}>
                    <td className="act-name"><b>{c.name || c.login_id}</b><span className="r">{c.login_id}</span></td>
                    <td className="c">{c.agreed === true ? <span className="act-onsite yes">동의</span> : c.agreed === false ? <span className="act-onsite no">미동의</span> : <span className="act-onsite na">미응답</span>}</td>
                    <td className="muted">{c.kind || '—'}</td>
                    <td className="muted">{c.version || '—'}</td>
                    <td className="act-time">{fmtDateTime(c.at)}</td>
                    <td><button type="button" className="act-detail" onClick={(e) => { e.stopPropagation(); open({ kind: 'user', login_id: c.login_id, name: c.name || c.login_id }) }}>상세 ›</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// 추정 모드(구서버): 기간 내 이벤트의 lat 존재 여부로 동의 여부를 추정. 동의 버전·시각은 '—'.
type ConsentView = { login_id: string; name: string; role: string; consented: boolean | null; located: number; total: number; lastLocated: string | null; lastLocatedDate: string | null }
const CON_ACC: Acc<ConsentView> = { name: (c) => c.name, status: (c) => (c.consented === true ? 2 : c.consented === false ? 0 : 1), located: (c) => c.located, total: (c) => c.total, ratio: (c) => (c.total > 0 ? c.located / c.total : -1), last: (c) => (c.lastLocatedDate || '') + (c.lastLocated || '') }
function ConsentEstimate({ st, setSt, open }: PanelProps) {
  const { from, to, days, setRange } = useRangeSt(st, setSt, 14, 31)
  const q = st.q || ''
  const evQ = useAsync(() => fetchEventsMany(days), [from, to])
  const dailyQ = useAsync(() => fetchDailyMany(days), [from, to])
  const rowsAll = useMemo<ConsentView[]>(() => {
    const m = new Map<string, ConsentView>()
    const roles = new Map<string, { name: string; role: string }>()
    for (const day of dailyQ.data?.days || []) for (const u of day.users || []) roles.set(u.login_id, { name: u.name || u.login_id, role: u.role })
    const get = (id: string, name?: string) => {
      const cur = m.get(id)
      if (cur) return cur
      const info = roles.get(id)
      const v: ConsentView = { login_id: id, name: info?.name || name || id, role: info?.role || '', consented: null, located: 0, total: 0, lastLocated: null, lastLocatedDate: null }
      m.set(id, v)
      return v
    }
    // 기간 내 활동은 있었지만 이벤트에 위치가 전혀 없는 사용자도 표에 올리기 위해 daily 사용자부터 등록
    for (const [id, info] of roles) get(id, info.name)
    for (const e of evQ.data?.events || []) {
      if (!e.actor_login_id) continue
      const v = get(e.actor_login_id, e.actor_name)
      v.total++
      if (e.lat != null) {
        v.located++
        const key = (evDate(e) || '') + 'T' + evTime(e, true)
        if (!v.lastLocatedDate || key > v.lastLocatedDate + 'T' + (v.lastLocated || '')) { v.lastLocatedDate = evDate(e); v.lastLocated = evTime(e, true) }
      }
    }
    for (const v of m.values()) v.consented = v.total === 0 ? null : v.located > 0
    const k = q.trim().toLowerCase()
    return [...m.values()].filter((v) => !k || v.name.toLowerCase().includes(k) || v.login_id.toLowerCase().includes(k))
  }, [evQ.data, dailyQ.data, q])
  const { rows, s } = useSort(rowsAll, CON_ACC, { key: 'status', dir: 'asc' })
  const loading = evQ.loading || dailyQ.loading
  const cnt = { yes: rowsAll.filter((r) => r.consented === true).length, no: rowsAll.filter((r) => r.consented === false).length, na: rowsAll.filter((r) => r.consented === null).length }
  return (
    <div>
      <Head icon={<MapPin size={17} />} title="위치 동의 현황"><span className="muted" style={{ fontSize: 12 }}>위치는 동의한 사용자만, 저장·제출 시점에 1회 기록</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={31} />
        <div className="bws-tools" style={{ margin: 0 }}><Reload onClick={() => { evQ.reload(); dailyQ.reload() }} loading={loading} /></div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="이름·아이디 검색" />
      </div>
      <div className="act-note warn"><AlertTriangle size={14} /> <span>이 서버에는 위치 동의 <b>목록</b> API(/ops/activity/consents)가 아직 없어(404), 기간 내 이벤트의 <b>위치값(lat) 존재 여부</b>로 동의 여부를 <b>추정</b>해 보여줍니다. 백엔드 배포 후에는 실제 동의/미동의·버전·시각이 표시됩니다.</span></div>
      <div className="act-minikpis">
        <div className="act-minikpi"><span>동의 추정(위치 기록 있음)</span><b style={{ color: 'var(--ok-ink)' }}>{cnt.yes}<small> 명</small></b></div>
        <div className="act-minikpi"><span>미동의 추정(위치 기록 없음)</span><b style={{ color: cnt.no > 0 ? 'var(--red-ink)' : undefined }}>{cnt.no}<small> 명</small></b></div>
        <div className="act-minikpi"><span>판단 불가(활동 없음)</span><b>{cnt.na}<small> 명</small></b></div>
        <div className="act-minikpi"><span>기간</span><b style={{ fontSize: 14 }}>{fmtMD(from)} ~ {fmtMD(to)}</b></div>
      </div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && evQ.error != null && <Msg kind="err">{describeError(evQ.error)}</Msg>}
      {!loading && !evQ.error && rows.length === 0 && <Msg kind="empty">표시할 사용자가 없습니다.</Msg>}
      {!loading && !evQ.error && rows.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="명" /></div>
          <div className="twrap">
            <table className="tbl act-table">
              <thead><tr><Th k="name" label="사용자" s={s} /><Th k="status" label="동의(추정)" s={s} c /><Th k="located" label="위치 기록" s={s} num /><Th k="total" label="이벤트" s={s} num /><Th k="ratio" label="기록 비율" s={s} c /><Th k="last" label="마지막 위치 기록" s={s} /><th>동의 버전 · 시각</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const r = pct(c.located, c.total)
                  return (
                    <tr key={c.login_id} className="act-row" onClick={() => open({ kind: 'user', login_id: c.login_id, name: c.name, date: c.lastLocatedDate || to })}>
                      <td className="act-name"><b>{c.name}</b><span className="r">{c.role ? roleLabel(c.role) + ' · ' : ''}{c.login_id}</span></td>
                      <td className="c">{c.consented === true ? <span className="act-onsite yes">동의 추정</span> : c.consented === false ? <span className="act-onsite no">위치 없음</span> : <span className="act-onsite na">활동 없음</span>}</td>
                      <td className="num">{c.located}</td>
                      <td className="num">{c.total}</td>
                      <td className="c">{r === null ? <span className="act-mark na">—</span> : <span className={'act-mark ' + (r > 0 ? 'yes' : 'no')}>{r}%</span>}</td>
                      <td className="muted">{c.lastLocatedDate ? `${fmtMD(c.lastLocatedDate)} ${c.lastLocated}` : '—'}</td>
                      <td className="muted" title="동의 목록 API 추가 후 표시">—</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ 10. 이벤트 원장 ═══════════════
export function LedgerPanel({ st, setSt, open }: PanelProps) {
  const { from, to, days, setRange } = useRangeSt(st, setSt, 1, 31)
  const user = st.user || '', school = st.school || '', kind = st.kind || '', onsite = st.onsite || ''
  const { data, loading, error, reload } = useAsync(() => fetchEventsMany(days), [from, to])
  const [detail, setDetail] = useDetail()
  const filtered = useMemo(() => {
    const u = user.trim().toLowerCase(), sc = school.trim().toLowerCase()
    const base = detail ? (data?.events || []) : summarizeEvents(data?.events || [])
    return base.filter((e) =>
      (!u || (e.actor_name || '').toLowerCase().includes(u) || (e.actor_login_id || '').toLowerCase().includes(u)) &&
      (!sc || (e.school_name || '').toLowerCase().includes(sc)) &&
      (!kind || (kind === '_save' ? SAVE_KINDS.includes(e.kind) : e.kind === kind)) &&
      (!onsite || (onsite === 'yes' ? e.onsite === true : onsite === 'no' ? e.onsite === false : e.lat == null)))
  }, [data, user, school, kind, onsite, detail])
  const { rows, s } = useSort(filtered, EV_ACC, { key: 'time', dir: 'desc' })
  const users = useMemo(() => [...new Set((data?.events || []).map((e) => e.actor_name || e.actor_login_id))].sort((a, b) => a.localeCompare(b, 'ko')), [data])

  function exportCsv() {
    downloadCsv(`활동원장_${from}_${to}`,
      ['일자', '기기시각', '서버시각', '사용자', '아이디', '기기ID', '종류', '종류코드', '학교', '학교ID', '업무', '점검ID', '위도', '경도', '정확도m', '거리m', '현장', '비고'],
      rows.map((e) => [evDate(e) || '', evTime(e, true), e.server_at ? `${dateOfIso(e.server_at) || ''} ${fmtTime(e.server_at, true)}` : '', e.actor_name || '', e.actor_login_id || '', e.device_id || '', kindLabel(e.kind), e.kind, e.school_name || '', e.school_id || '', e.module || '', e.inspection_id || '', e.lat ?? '', e.lng ?? '', e.accuracy_m ?? '', e.distance_m ?? '', e.onsite === true ? '현장' : e.onsite === false ? '현장외' : (e.lat == null ? '위치없음' : '미판정'), e.note || '']))
  }
  return (
    <div>
      <Head icon={<ListOrdered size={17} />} title="이벤트 원장"><span className="muted" style={{ fontSize: 12 }}>기기 작성 시각 기준 · 최신순 · 최대 31일</span></Head>
      <div className="act-tools">
        <RangeNav from={from} to={to} onChange={setRange} maxDays={31} />
        <div className="bws-tools" style={{ margin: 0 }}>
          <button type="button" className="tb" onClick={exportCsv} disabled={rows.length === 0}><Download size={13} /> CSV 내려받기 ({n0(rows.length)}건)</button>
          <Reload onClick={reload} loading={loading} />
        </div>
      </div>
      <div className="act-filters">
        <label>사용자
          <input list="act-ledger-users" value={user} onChange={(e) => setSt({ user: e.target.value })} placeholder="이름·아이디" />
          <datalist id="act-ledger-users">{users.map((u) => <option key={u} value={u} />)}</datalist>
        </label>
        <label>학교<input value={school} onChange={(e) => setSt({ school: e.target.value })} placeholder="학교명" /></label>
        <label>종류
          <select value={kind} onChange={(e) => setSt({ kind: e.target.value })}>
            <option value="">전체</option>
            <option value="_save">저장·제출만</option>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </label>
        <label>현장
          <select value={onsite} onChange={(e) => setSt({ onsite: e.target.value })}>
            <option value="">전체</option><option value="yes">현장</option><option value="no">현장 외</option><option value="none">위치 없음</option>
          </select>
        </label>
        {(user || school || kind || onsite) && <button type="button" className="act-today" onClick={() => setSt({ user: '', school: '', kind: '', onsite: '' })}>필터 지우기</button>}
        <DetailToggle detail={detail} onChange={setDetail} />
      </div>
      {loading && <Msg kind="load">불러오는 중… ({days.length}일)</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && data?.error != null && <Msg kind="err">일부 날짜를 불러오지 못했습니다: {describeError(data.error)}</Msg>}
      {!loading && !error && (data?.truncated.length || 0) > 0 && <div className="act-note warn"><AlertTriangle size={14} /> 하루 500건을 넘어 최신 500건만 받은 날짜: {data?.truncated.map(fmtMD).join(', ')} — 사용자·학교 필터는 받은 뒤 거르는 것이므로, 더 정확히 보려면 사용자 탭을 이용하세요.</div>}
      {!loading && !error && filtered.length === 0 && <Msg kind="empty">{(data?.events || []).length === 0 ? '기간 내 이벤트가 없습니다.' : '필터에 맞는 이벤트가 없습니다.'}</Msg>}
      {!loading && !error && filtered.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} extra={`전체 ${n0((data?.events || []).length)}건 중`} /><span className="muted" style={{ fontSize: 12 }}>사용자·학교 이름을 누르면 해당 탭이 열립니다</span></div>
          <EventsTable events={rows} s={s} open={open} showActor showDate={days.length > 1} />
        </div>
      )}
    </div>
  )
}

// 역할 판별(셸에서 사용)
export const isAdminRole = (r: string | null | undefined) => !!r && ADMIN_ROLES.includes(r)
