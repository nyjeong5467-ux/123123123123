// 근무 종합관리표 — 본사 콘솔용 전체 조사원 월간 마스터 캘린더(읽기 전용).
// 렌더링은 features/schedule/MasterCalendar(단일 소스)를 공유하고,
// 이 파일은 콘솔 탭용 데이터 로드 + 헤더(월 이동·요약 pill) + 안내문만 담당한다.
// 데이터: /ops/docs/schedules ({ "YYYY-MM": { 담당자명: { "YYYY-MM-DD": {schools?,region?,note?} } } }) + /users
// 편집은 /schedule(직원 근무표)에서 조사원·날짜별로. 이 화면은 종합 열람용(HQ 콘솔은 hqOnly 게이팅).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'
import {
  type SchedDoc, curYm, shiftMonth, monthInspectors, totalEntriesOf,
} from '../schedule/MasterCalendar'
import MasterBoard from '../schedule/MasterBoard'

type Account = { name: string; role: string; login_id: string }

export default function ConsoleSchedule() {
  const [doc, setDoc] = useState<SchedDoc>({})
  const [accNames, setAccNames] = useState<string[]>([]) // 전체 조사원 이름
  const [month, setMonth] = useState(curYm())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [d, users] = await Promise.all([
          api<{ doc: SchedDoc | null }>('/ops/docs/schedules').then((r) => r.doc || {}),
          api<Account[]>('/users').catch(() => [] as Account[]),
        ])
        if (!alive) return
        setDoc(d)
        setAccNames(Array.isArray(users) ? users.filter((u) => u.role === 'field_inspector' && u.name).map((u) => u.name) : [])
        setLoading(false)
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [])

  const inspectors = useMemo(() => monthInspectors(doc, month, accNames), [doc, month, accNames])
  const activeCount = useMemo(
    () => inspectors.filter((n) => doc[month]?.[n] && Object.keys(doc[month][n]).length > 0).length,
    [inspectors, doc, month],
  )
  const totalEntries = useMemo(() => totalEntriesOf(doc, month), [doc, month])

  return (
    <div className="ledger">
      <div className="lh">
        <h2><CalendarRange size={18} /> 근무 종합관리표
          <InfoTip>
            일정 편집은 <Link to="/schedule">직원 근무표</Link>에서 조사원·날짜를 선택해 등록하세요. 이 표는 전체 조사원 종합 열람용입니다.
          </InfoTip></h2>
        <div className="sp" />
        <span className="pillx doing">조사원 {activeCount || inspectors.length}명</span>
        <span className="pillx na">일정 {totalEntries}건</span>
        <div className="cal-nav">
          <button className="btn btn-ghost" aria-label="이전 달" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={16} /></button>
          <input className="input" type="month" style={{ width: 148 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-ghost" aria-label="다음 달" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {loading && <div className="tstate">불러오는 중…</div>}
      {!loading && error && <div className="tstate">오류: {error}</div>}
      {!loading && !error && <MasterBoard doc={doc} month={month} staffNames={accNames} />}
    </div>
  )
}
