// 근무 종합관리표 보드 — 인원×날짜 매트릭스(기본) + 월간 캘린더(보조) 전환.
// 16명 규모에서는 날짜 캘린더에 칩을 쌓는 방식이 읽히지 않으므로,
// 세로=조사원 · 가로=일자 매트릭스를 기본 뷰로 한다(엑셀 근무표와 동일한 독법).
// 콘솔 "근무 종합관리표" 탭과 /schedule "종합관리표" 탭이 이 컴포넌트를 공유한다.
import { useMemo, useState } from 'react'
import { CalendarRange, Grid3X3 } from 'lucide-react'
import {
  MasterCalendar, type DayPlan, type MonthPlan, type SchedDoc,
  HOLIDAYS, pad, todayKey, monthInspectors, colorMapOf,
} from './MasterCalendar'
import '../../styles/console.css'

const DOW_CH = ['일', '월', '화', '수', '목', '금', '토']

type View = 'matrix' | 'calendar'
const VIEW_KEY = 'sp-sched-master-view'

// 학교 수 집계 — "여수중·여수고" / "a, b"처럼 합쳐 적힌 항목까지 분해(통계 탭과 동일 기준).
function countSchools(p: DayPlan): number {
  const raw = p.schools
  if (!raw || raw.length === 0) return 0
  const items = raw.flatMap((s) => String(s).split(/[,·]/)).map((s) => s.trim()).filter(Boolean)
  return items.length > 0 ? items.length : 1
}
// 근무일 판정 — 학교 배정 또는 지역 출장(메모만 있는 날: 연차·회의 등은 제외).
function isWorkDay(p: DayPlan | undefined): boolean {
  return !!(p && (p.schools?.length || p.region))
}
function cellTitle(name: string, key: string, p: DayPlan): string {
  const bits = [`${name} · ${key}`]
  if (p.region) bits.push(`지역: ${p.region}`)
  if (p.schools?.length) bits.push(`학교: ${(p.schools || []).join(', ')}`)
  if (p.note) bits.push(`메모: ${p.note}`)
  return bits.join('\n')
}

function Matrix({ doc, month, staffNames }: { doc: SchedDoc; month: string; staffNames: string[] }) {
  const monthPlan: MonthPlan = useMemo(() => doc[month] || {}, [doc, month])
  const inspectors = useMemo(() => monthInspectors(doc, month, staffNames), [doc, month, staffNames])
  const colorOf = useMemo(() => colorMapOf(inspectors), [inspectors])
  const [yy, mm] = useMemo(() => month.split('-').map(Number), [month])
  const days = useMemo(() => new Date(yy, mm, 0).getDate(), [yy, mm])
  const tKey = todayKey()

  // 일자 메타(요일·주말·공휴일·오늘) — 열 배경/헤더 공유
  const dayMeta = useMemo(() => Array.from({ length: days }, (_, i) => {
    const d = i + 1
    const key = `${month}-${pad(d)}`
    const dow = new Date(yy, mm - 1, d).getDay()
    return { d, key, dow, weekend: dow === 0 || dow === 6, hol: HOLIDAYS[key], today: key === tKey }
  }), [days, month, yy, mm, tKey])

  // 행별(조사원) 월간 합계 + 열별(일자) 투입 인원 합계
  const rowStats = useMemo(() => inspectors.map((name) => {
    const plan = monthPlan[name] || {}
    let workDays = 0, schools = 0
    for (const k of Object.keys(plan)) {
      if (isWorkDay(plan[k])) workDays++
      schools += countSchools(plan[k])
    }
    return { name, workDays, schools }
  }), [inspectors, monthPlan])
  const colTotals = useMemo(() => dayMeta.map(({ key }) =>
    inspectors.reduce((c, n) => c + (isWorkDay(monthPlan[n]?.[key]) ? 1 : 0), 0),
  ), [dayMeta, inspectors, monthPlan])
  const maxCol = Math.max(1, ...colTotals)

  if (inspectors.length === 0) {
    return <div className="tstate">등록된 조사원이 없습니다. 조사원 계정 등록 또는 근무표 작성 후 표시됩니다.</div>
  }

  return (
    <div className="mx-wrap">
      <table className="mx-tbl">
        <thead>
          <tr>
            <th className="mx-name mx-h">담당자</th>
            {dayMeta.map((m) => (
              <th key={m.d}
                className={'mx-day mx-h' + (m.weekend || m.hol ? ' we' : '') + (m.today ? ' today' : '')}
                title={m.hol ? `${m.d}일 · ${m.hol}` : undefined}>
                <span className={'mx-dnum' + (m.dow === 0 || m.hol ? ' sun' : m.dow === 6 ? ' sat' : '')}>{m.d}</span>
                <span className={'mx-dow' + (m.dow === 0 || m.hol ? ' sun' : m.dow === 6 ? ' sat' : '')}>{DOW_CH[m.dow]}</span>
              </th>
            ))}
            <th className="mx-tot mx-h">근무</th>
            <th className="mx-tot mx-h">학교</th>
          </tr>
        </thead>
        <tbody>
          {inspectors.map((name, ri) => {
            const plan = monthPlan[name] || {}
            const st = rowStats[ri]
            return (
              <tr key={name}>
                <td className="mx-name">
                  <span className="cal-swatch" style={{ background: colorOf[name] }} />{name}
                </td>
                {dayMeta.map((m) => {
                  const p = plan[m.key]
                  const work = isWorkDay(p)
                  const cls = 'mx-day' + (m.weekend || m.hol ? ' we' : '') + (m.today ? ' today' : '')
                  if (!p) return <td key={m.d} className={cls} />
                  if (!work) {
                    // 메모만 있는 날(연차·회의 등) — 회색 칩(첫 글자)
                    return (
                      <td key={m.d} className={cls} title={cellTitle(name, m.key, p)}>
                        <span className="mx-chip off">{(p.note || '·').slice(0, 1)}</span>
                      </td>
                    )
                  }
                  const n = countSchools(p)
                  const label = n > 0 ? String(n) : (p.region || '출').slice(0, 1)
                  return (
                    <td key={m.d} className={cls} title={cellTitle(name, m.key, p)}>
                      <span className="mx-chip" style={{
                        color: colorOf[name],
                        background: `color-mix(in srgb, ${colorOf[name]} 16%, transparent)`,
                      }}>{label}</span>
                    </td>
                  )
                })}
                <td className="mx-tot">{st.workDays > 0 ? <b>{st.workDays}</b> : <span className="mx-zero">0</span>}</td>
                <td className="mx-tot">{st.schools > 0 ? st.schools : <span className="mx-zero">0</span>}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="mx-name mx-f">일별 투입</td>
            {dayMeta.map((m, i) => (
              <td key={m.d}
                className={'mx-day mx-f' + (m.weekend || m.hol ? ' we' : '') + (m.today ? ' today' : '')}
                title={`${m.d}일 투입 ${colTotals[i]}명`}>
                {colTotals[i] > 0 && (
                  <span className="mx-fcell" style={{ opacity: 0.45 + 0.55 * (colTotals[i] / maxCol) }}>
                    {colTotals[i]}
                  </span>
                )}
              </td>
            ))}
            <td className="mx-tot mx-f" colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <div className="mx-note">
        칸의 숫자는 그날 배정된 <b>학교 수</b>, 글자는 지역 출장·메모(연차 등) 첫 글자입니다. 칸에 마우스를 올리면 학교 목록이 표시됩니다.
      </div>
    </div>
  )
}

export function MasterBoard({ doc, month, staffNames }: { doc: SchedDoc; month: string; staffNames: string[] }) {
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'matrix' } catch { return 'matrix' }
  })
  function pick(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* 무시 */ }
  }
  return (
    <div>
      <div className="mx-switch" role="tablist" aria-label="종합관리표 보기 방식">
        <button className={'mx-sw' + (view === 'matrix' ? ' active' : '')} role="tab" aria-selected={view === 'matrix'}
          onClick={() => pick('matrix')}>
          <Grid3X3 size={14} /> 매트릭스
        </button>
        <button className={'mx-sw' + (view === 'calendar' ? ' active' : '')} role="tab" aria-selected={view === 'calendar'}
          onClick={() => pick('calendar')}>
          <CalendarRange size={14} /> 캘린더
        </button>
      </div>
      {view === 'matrix'
        ? <div className="card-body" style={{ padding: '4px 22px 18px' }}><Matrix doc={doc} month={month} staffNames={staffNames} /></div>
        : <MasterCalendar doc={doc} month={month} staffNames={staffNames} />}
    </div>
  )
}

export default MasterBoard
