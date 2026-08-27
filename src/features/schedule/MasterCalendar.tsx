// 근무 종합관리표 — 전 직원 월간 마스터 캘린더(읽기 전용) 공유 컴포넌트.
// /schedule(직원 근무표)의 "종합관리표" 탭과 관리자 콘솔의 "근무 종합관리표" 탭이
// 이 컴포넌트 하나를 공유한다(단일 소스). 데이터 셰이프:
//   /ops/docs/schedules  ({ "YYYY-MM": { 담당자명: { "YYYY-MM-DD": {schools?,region?,note?} } } })
import { useMemo } from 'react'
import '../../styles/console.css'

export type DayPlan = { schools?: string[]; region?: string; note?: string }
export type MonthPlan = Record<string, Record<string, DayPlan>> // 담당자 -> (날짜 -> 계획)
export type SchedDoc = Record<string, MonthPlan>                 // YYYY-MM -> MonthPlan

const DOW = ['일', '월', '화', '수', '목', '금', '토']
export const pad = (n: number) => String(n).padStart(2, '0')
const MAX_CHIPS = 6 // 셀당 표시 칩 상한(초과분은 +N명 더)

// 담당자 색상 팔레트 — 이름 정렬 순서대로 순환 배정(범례와 캘린더 칩이 공유).
export const PALETTE = ['#7c5cfb', '#33bbe0', '#2fb985', '#f2784b', '#ea9a1c', '#f2545b', '#6a47e0', '#12a5a0', '#c05cd6', '#4b7bec']

// 대한민국 공휴일 — 2026(음력·대체공휴일 포함) + 2027 양력 고정공휴일.
export const HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석', '2026-09-28': '대체공휴일',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2027-01-01': '신정', '2027-03-01': '삼일절', '2027-05-05': '어린이날',
  '2027-06-06': '현충일', '2027-08-15': '광복절', '2027-10-03': '개천절',
  '2027-10-09': '한글날', '2027-12-25': '성탄절',
}

export function curYm(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
// 달력 주(week) 매트릭스 — 일요일 시작 7열, 앞뒤 공백(null) 포함.
export function monthMatrix(year: number, month1: number): (number | null)[][] {
  const first = new Date(year, month1 - 1, 1).getDay() // 0=일
  const days = new Date(year, month1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

// 담당자 후보: 조사원 계정 + 이 달 배정된 이름(계정 없이 배정된 경우까지) → 정렬.
export function monthInspectors(doc: SchedDoc, month: string, staffNames: string[]): string[] {
  const s = new Set<string>(staffNames)
  Object.keys(doc[month] || {}).forEach((n) => s.add(n))
  return Array.from(s).sort()
}

// 이름 → 색상(정렬 순서 기반). 범례·칩·통계 그래프가 동일 색을 쓴다.
export function colorMapOf(inspectors: string[]): Record<string, string> {
  const m: Record<string, string> = {}
  inspectors.forEach((n, i) => { m[n] = PALETTE[i % PALETTE.length] })
  return m
}

// 이 달 등록된 일정 총 건수(담당자·날짜별).
export function totalEntriesOf(doc: SchedDoc, month: string): number {
  const mp = doc[month] || {}
  let c = 0
  for (const name of Object.keys(mp)) c += Object.keys(mp[name]).length
  return c
}

// 칩 요약: "여수 3교" / "3교" / (배정 없으면) 메모.
function summarize(p: DayPlan): string {
  const bits: string[] = []
  if (p.region) bits.push(p.region)
  if (p.schools?.length) bits.push(`${p.schools.length}교`)
  if (!bits.length && p.note) bits.push(p.note)
  return bits.join(' ')
}

export function MasterCalendar({ doc, month, staffNames }: { doc: SchedDoc; month: string; staffNames: string[] }) {
  const monthPlan: MonthPlan = useMemo(() => doc[month] || {}, [doc, month])
  const inspectors = useMemo(() => monthInspectors(doc, month, staffNames), [doc, month, staffNames])
  const colorOf = useMemo(() => colorMapOf(inspectors), [inspectors])

  // 이 달 실제 배정이 있는 담당자만 범례에 노출.
  const activeNames = useMemo(
    () => inspectors.filter((n) => monthPlan[n] && Object.keys(monthPlan[n]).length > 0),
    [inspectors, monthPlan],
  )

  const [yy, mm] = useMemo(() => (month ? month.split('-').map(Number) : [0, 0]), [month])
  const weeks = useMemo(() => (month ? monthMatrix(yy, mm) : []), [month, yy, mm])
  const tKey = todayKey()

  // 특정 날짜에 배정된 담당자 목록(칩 데이터).
  function entriesOn(day: number): { name: string; p: DayPlan }[] {
    const key = `${month}-${pad(day)}`
    const out: { name: string; p: DayPlan }[] = []
    for (const name of inspectors) {
      const p = monthPlan[name]?.[key]
      if (p && (p.schools?.length || p.region || p.note)) out.push({ name, p })
    }
    return out
  }

  if (inspectors.length === 0) {
    return <div className="tstate">등록된 조사원이 없습니다. 조사원 계정 등록 또는 근무표 작성 후 표시됩니다.</div>
  }

  return (
    <div className="card-body" style={{ padding: '14px 22px 20px' }}>
      {/* 담당자 색상 범례 */}
      {activeNames.length > 0 && (
        <div className="cal-legend">
          {activeNames.map((n) => (
            <span key={n} className="cal-legend-item">
              <span className="cal-swatch" style={{ background: colorOf[n] }} />{n}
            </span>
          ))}
        </div>
      )}

      <div className="cal" role="grid" aria-label={`${yy}년 ${mm}월 근무 종합관리표`}>
        <div className="cal-head">
          {DOW.map((w, i) => (
            <div key={w} className={'cal-hcell' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
          ))}
        </div>
        {weeks.map((row, ri) => (
          <div className="cal-row" key={ri}>
            {row.map((d, ci) => {
              if (d === null) return <div className="cal-cell out" key={ci} />
              const key = `${month}-${pad(d)}`
              const hol = HOLIDAYS[key]
              const isToday = key === tKey
              const weekend = ci === 0 || ci === 6
              const list = entriesOn(d)
              const shown = list.slice(0, MAX_CHIPS)
              const extra = list.length - shown.length
              return (
                <div
                  className={'cal-cell' + (weekend ? ' weekend' : '') + (hol ? ' holiday' : '') + (isToday ? ' today' : '')}
                  key={ci}
                >
                  <div className="cal-daynum">
                    <span className={ci === 0 || hol ? 'sun' : ci === 6 ? 'sat' : ''}>{d}</span>
                    {hol && <span className="cal-hol">{hol}</span>}
                    {list.length > 0 && <span className="cal-count">{list.length}</span>}
                  </div>
                  <div className="cal-chips">
                    {shown.map(({ name, p }) => (
                      <div
                        className="cal-chip"
                        key={name}
                        style={{ borderLeftColor: colorOf[name] }}
                        title={`${name} · ${(p.schools || []).join(', ') || p.region || p.note || ''}`}
                      >
                        <b style={{ color: colorOf[name] }}>{name}</b>
                        {summarize(p) && <span>{summarize(p)}</span>}
                      </div>
                    ))}
                    {extra > 0 && <div className="cal-more">+{extra}명 더</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default MasterCalendar
