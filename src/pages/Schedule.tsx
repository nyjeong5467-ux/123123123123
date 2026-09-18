// 직원 근무표(/schedule) — 탭 허브: ① 내 근무표(편집) ② 종합관리표(HQ) ③ 통계(그래프).
// 데이터: /ops/docs/schedules  ({ "YYYY-MM": { 담당자명: { "YYYY-MM-DD": {schools?,region?,note?} } } })
// 조사원=본인 일정 보기·통계. 관리자/경영진=모든 조사원 선택 + 날짜 클릭 편집 + 전 직원 종합·통계.
// 종합관리표 캘린더는 features/schedule/MasterCalendar(관리자 콘솔 탭과 단일 소스)를 공유.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Pencil, School, Users } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { InfoTip } from '../components/InfoTip'
import {
  type DayPlan, type MonthPlan, type SchedDoc,
  HOLIDAYS, pad, curYm, shiftMonth, monthMatrix, monthInspectors, totalEntriesOf,
} from '../features/schedule/MasterCalendar'
import MasterBoard from '../features/schedule/MasterBoard'
import '../styles/schedule.css'

type Me = { role: string; name?: string; login_id?: string }
type Account = { name: string; role: string; login_id: string }
type TabKey = 'my' | 'master' | 'stats'

const HQ_ROLES = ['hq_admin', 'executive']
const WEEK_LABELS = ['월', '화', '수', '목', '금']

// 평일(월~금) 주 단위 행 — 내 근무표(점검계획표) 편집 그리드 전용.
function monthWeekRows(year: number, month1: number): (number | null)[][] {
  const daysInMonth = new Date(year, month1, 0).getDate()
  const rows: (number | null)[][] = []
  let row: (number | null)[] = [null, null, null, null, null]
  let has = false
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month1 - 1, d).getDay()
    if (dow === 0 || dow === 6) {
      if (dow === 0 && has) { rows.push(row); row = [null, null, null, null, null]; has = false }
      continue
    }
    row[dow - 1] = d
    has = true
    if (dow === 5) { rows.push(row); row = [null, null, null, null, null]; has = false }
  }
  if (has) rows.push(row)
  return rows
}

// 학교 수 세기 — schools 항목이 "여수중·여수고" / "a, b"처럼 합쳐 적힌 경우까지 분해해 집계.
// 분해 결과가 비면(형식 불명 자유 텍스트) 그 날은 1교로 계산.
function countSchools(p: DayPlan): number {
  const raw = p.schools
  if (!raw || raw.length === 0) return 0
  const items = raw
    .flatMap((s) => String(s).split(/[,·]/))
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length > 0 ? items.length : 1
}

// 근무일 판정 — 학교 배정 또는 지역 출장이 있는 날(메모만 있는 날: 연차·회의 등은 제외).
function isWorkDay(p: DayPlan | undefined): boolean {
  return !!(p && (p.schools?.length || p.region))
}

export function Schedule() {
  const [doc, setDoc] = useState<SchedDoc>({})
  const [me, setMe] = useState<Me | null>(null)
  const [accNames, setAccNames] = useState<string[]>([])   // 관리자용: 전체 조사원 이름
  const [month, setMonth] = useState(curYm())              // 탭 공유 월 상태
  const [who, setWho] = useState('')
  const [tabSel, setTabSel] = useState<TabKey | null>(null) // null=역할별 기본 탭
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // 편집 모달
  const [edit, setEdit] = useState<{ date: string } | null>(null)
  const [eSchools, setESchools] = useState('')
  const [eRegion, setERegion] = useState('')
  const [eNote, setENote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [d, m] = await Promise.all([
          api<{ doc: SchedDoc | null }>('/ops/docs/schedules').then((r) => r.doc || {}),
          api<Me>('/auth/me').catch(() => null),
        ])
        if (!alive) return
        setDoc(d); setMe(m)
        if (m && HQ_ROLES.includes(m.role)) {
          try {
            const users = await api<Account[]>('/users')
            if (alive) setAccNames(users.filter((u) => u.role === 'field_inspector' && u.name).map((u) => u.name))
          } catch { /* 조사원 계정 없으면 무시 */ }
        }
        setLoading(false)
      } catch (e) { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } }
    })()
    return () => { alive = false }
  }, [])

  const isHq = me ? HQ_ROLES.includes(me.role) : false
  // 기본 탭: 관리자/경영진 → 종합관리표(전체 현황 우선), 조사원 → 내 근무표.
  const tab: TabKey = tabSel ?? (isHq ? 'master' : 'my')

  const monthPlan: MonthPlan = doc[month] || {}
  const inspectors = useMemo(() => monthInspectors(doc, month, isHq ? accNames : []), [doc, month, isHq, accNames])

  const target = useMemo(() => {
    if (!isHq && me?.name) return me.name
    if (who && inspectors.includes(who)) return who
    return inspectors[0] || ''
  }, [isHq, me, who, inspectors])

  const plan = monthPlan[target] || {}
  const [yy, mm] = month ? month.split('-').map(Number) : [0, 0]
  const rows = month ? monthWeekRows(yy, mm) : []

  // ── 통계(월 기준) — HQ=전 직원, 조사원=본인만 ────────────────────
  const statNames = useMemo(() => {
    if (isHq) return inspectors
    return me?.name ? [me.name] : []
  }, [isHq, inspectors, me])

  const staffStats = useMemo(() => {
    return statNames.map((name) => {
      const days = monthPlan[name] || {}
      let workDays = 0
      let schools = 0
      for (const k of Object.keys(days)) {
        const p = days[k]
        if (isWorkDay(p)) workDays++
        schools += countSchools(p)
      }
      return { name, workDays, schools }
    })
  }, [statNames, monthPlan])

  const weekly = useMemo(() => {
    if (!month) return []
    const weeks = monthMatrix(yy, mm)
    return weeks.map((row) => {
      let c = 0
      for (const d of row) {
        if (d === null) continue
        const key = `${month}-${pad(d)}`
        for (const name of statNames) {
          if (isWorkDay(monthPlan[name]?.[key])) c++
        }
      }
      return c
    })
  }, [month, yy, mm, statNames, monthPlan])

  const totalWorkDays = staffStats.reduce((a, s) => a + s.workDays, 0)
  const totalSchools = staffStats.reduce((a, s) => a + s.schools, 0)
  const activeStaff = staffStats.filter((s) => s.workDays > 0).length
  const topStaff = staffStats.reduce<{ name: string; workDays: number } | null>(
    (best, s) => (s.workDays > 0 && (!best || s.workDays > best.workDays) ? { name: s.name, workDays: s.workDays } : best),
    null,
  )

  const byWorkDays = [...staffStats].sort((a, b) => b.workDays - a.workDays || a.name.localeCompare(b.name))
  const bySchools = [...staffStats].sort((a, b) => b.schools - a.schools || a.name.localeCompare(b.name))
  const maxWorkDays = Math.max(1, ...staffStats.map((s) => s.workDays))
  const maxSchools = Math.max(1, ...staffStats.map((s) => s.schools))
  const maxWeekly = Math.max(1, ...weekly)

  // ── 편집(내 근무표) — 문서 셰이프 보존 PUT ───────────────────────
  function openEdit(date: string) {
    const p = plan[date] || {}
    setESchools((p.schools || []).join('\n'))
    setERegion(p.region || '')
    setENote(p.note || '')
    setEdit({ date })
  }

  async function saveDay() {
    if (!edit || !target) return
    setSaving(true); setMsg('')
    const schools = eSchools.split('\n').map((s) => s.trim()).filter(Boolean)
    const day: DayPlan = {}
    if (schools.length) day.schools = schools
    if (eRegion.trim()) day.region = eRegion.trim()
    if (eNote.trim()) day.note = eNote.trim()
    // 문서 갱신(다른 월/담당자 보존)
    const next: SchedDoc = JSON.parse(JSON.stringify(doc))
    if (!next[month]) next[month] = {}
    if (!next[month][target]) next[month][target] = {}
    if (Object.keys(day).length === 0) delete next[month][target][edit.date]
    else next[month][target][edit.date] = day
    try {
      await api('/ops/docs/schedules', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setDoc(next); setEdit(null)
      setMsg('저장되었습니다.')
    } catch (e) { setMsg(e instanceof Error ? e.message : '저장 실패') }
    finally { setSaving(false) }
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>직원 근무표</b></div>
      <div className="bar">
        <h2><CalendarDays size={20} /> 직원 근무표</h2>
        <div className="sp" />
        {msg && <span className="pillx ok">{msg}</span>}
        <div className="cal-nav">
          <button className="btn btn-ghost" aria-label="이전 달" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={16} /></button>
          <input className="input" type="month" style={{ width: 148 }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button className="btn btn-ghost" aria-label="다음 달" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* 탭 pill — 관리자만 종합관리표 노출 */}
      <div className="sched-tabs" role="tablist">
        {isHq && (
          <button className={'sched-tab' + (tab === 'master' ? ' active' : '')} role="tab" aria-selected={tab === 'master'}
            onClick={() => setTabSel('master')}>
            <CalendarRange size={15} /> 종합관리표
          </button>
        )}
        <button className={'sched-tab' + (tab === 'my' ? ' active' : '')} role="tab" aria-selected={tab === 'my'}
          onClick={() => setTabSel('my')}>
          <CalendarDays size={15} /> {isHq ? '개별 근무표' : '내 근무표'}
        </button>
        <button className={'sched-tab' + (tab === 'stats' ? ' active' : '')} role="tab" aria-selected={tab === 'stats'}
          onClick={() => setTabSel('stats')}>
          <BarChart3 size={15} /> 통계
        </button>
      </div>

      {loading && <div className="tstate">불러오는 중…</div>}
      {!loading && error && <div className="tstate">오류: {error}</div>}

      {/* ── 탭 2: 종합관리표 (HQ 전용) ── */}
      {!loading && !error && tab === 'master' && isHq && (
        <div className="ledger">
          <div className="lh">
            <h2><CalendarRange size={18} /> {yy}년 {mm}월 근무 종합관리표
              <InfoTip>
                일정 등록·수정은 <b style={{ color: 'var(--violet)', cursor: 'pointer' }} onClick={() => setTabSel('my')}>개별 근무표</b> 탭에서
                조사원·날짜를 선택해 편집하세요.
              </InfoTip></h2>
            <div className="sp" />
            <span className="pillx doing">조사원 {inspectors.length}명</span>
            <span className="pillx na">일정 {totalEntriesOf(doc, month)}건</span>
          </div>
          <MasterBoard doc={doc} month={month} staffNames={accNames} />
        </div>
      )}

      {/* ── 탭 1: 내(개별) 근무표 — 기존 편집 캘린더 ── */}
      {!loading && !error && tab === 'my' && (
        <div className="ledger">
          <div className="lh">
            <h2>{yy}년 {mm}월 점검계획표</h2>
            <div className="sp" />
            <span className="pillx doing">담당자 · {target || '—'}</span>
            {isHq && inspectors.length > 0 && (
              <select className="lselect" value={target} onChange={(e) => setWho(e.target.value)}>
                {inspectors.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {isHq && <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}><Pencil size={11} style={{ verticalAlign: '-1px' }} /> 날짜 칸을 클릭해 편집</span>}
          </div>
          <div className="twrap">
            <table className="tbl sched-tbl">
              <thead>
                <tr>{WEEK_LABELS.map((w) => <th key={w} style={{ width: '20%', textAlign: 'center' }}>{w}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((d, ci) => {
                      if (d === null) return <td key={ci} />
                      const key = `${month}-${pad(d)}`
                      const p = plan[key]
                      const hol = HOLIDAYS[key]
                      const off = p?.note && !p?.schools?.length
                      return (
                        <td key={ci}
                          onClick={isHq ? () => openEdit(key) : undefined}
                          style={{
                            verticalAlign: 'top', minWidth: 120,
                            background: (off || hol) ? 'var(--red-soft, #fdecec)' : undefined,
                            cursor: isHq ? 'pointer' : 'default',
                          }}
                          title={isHq ? '클릭해 편집' : undefined}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2, color: hol ? 'var(--red-ink, #c0392b)' : undefined }}>{d}</div>
                          {hol && <div style={{ fontSize: 10.5, color: 'var(--red-ink, #c0392b)', fontWeight: 700, marginBottom: 3 }}>{hol}</div>}
                          {p?.region && <div style={{ fontSize: 11, color: 'var(--violet)', fontWeight: 700 }}>({p.region})</div>}
                          {p?.schools?.map((s, i) => <div key={i} style={{ fontSize: 12, lineHeight: 1.55 }}>{s}</div>)}
                          {p?.note && (
                            <div style={{ fontSize: 12, color: off ? 'var(--red-ink, #c0392b)' : 'var(--muted)', fontWeight: off ? 700 : 400, marginTop: p?.schools?.length ? 4 : 0 }}>
                              {p.note}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inspectors.length === 0 && <div className="tstate">등록된 조사원이 없습니다.</div>}
        </div>
      )}

      {/* ── 탭 3: 통계 — 월 기준 그래프 ── */}
      {!loading && !error && tab === 'stats' && (
        <>
          <div className="sched-sum">
            <div className="sched-stat hero">
              <span className="l">이번 달 총 근무일</span>
              <span className="v">{totalWorkDays}<small>일</small></span>
              <span className="d">{yy}년 {mm}월 · 학교·지역 배정 기준</span>
            </div>
            <div className="sched-stat">
              <span className="l">참여 직원</span>
              <span className="v">{activeStaff}<small>명</small></span>
              <span className="d">근무 1일 이상 직원 수</span>
            </div>
            <div className="sched-stat">
              <span className="l">최다 근무</span>
              <span className="v" style={{ fontSize: 19 }}>{topStaff ? topStaff.name : '—'}</span>
              <span className="d">{topStaff ? `${topStaff.workDays}일 근무` : '이번 달 근무 기록 없음'}</span>
            </div>
            <div className="sched-stat">
              <span className="l">배정 학교</span>
              <span className="v">{totalSchools}<small>교</small></span>
              <span className="d">중복 방문 포함 연건수</span>
            </div>
          </div>

          <div className="sched-charts">
            <div className="sched-chart">
              <h3><Users size={15} /> 직원별 근무일수</h3>
              <div className="sub">{yy}년 {mm}월 · 학교 또는 지역 배정이 있는 날 기준{!isHq && ' · 내 기록'}</div>
              {byWorkDays.length === 0 || totalWorkDays === 0 ? (
                <div className="sched-empty">이번 달 근무 기록이 없습니다. 근무표에 일정을 등록하면 집계됩니다.</div>
              ) : (
                <div className="hbar">
                  {byWorkDays.map((s) => (
                    <div className="hbar-row" key={s.name} title={`${s.name} · ${s.workDays}일 근무`}>
                      <span className="hbar-name">{s.name}</span>
                      <div className="hbar-track">
                        <div className="hbar-fill" style={{ width: `${(s.workDays / maxWorkDays) * 100}%` }} />
                      </div>
                      <span className="hbar-val">{s.workDays}<small>일</small></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sched-chart">
              <h3><School size={15} /> 직원별 배정 학교 수</h3>
              <div className="sub">{yy}년 {mm}월 · 하루 여러 학교 배정 시 모두 합산{!isHq && ' · 내 기록'}</div>
              {bySchools.length === 0 || totalSchools === 0 ? (
                <div className="sched-empty">이번 달 학교 배정 기록이 없습니다.</div>
              ) : (
                <div className="hbar">
                  {bySchools.map((s) => (
                    <div className="hbar-row" key={s.name} title={`${s.name} · ${s.schools}교 배정`}>
                      <span className="hbar-name">{s.name}</span>
                      <div className="hbar-track">
                        <div className="hbar-fill" style={{ width: `${(s.schools / maxSchools) * 100}%` }} />
                      </div>
                      <span className="hbar-val">{s.schools}<small>교</small></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sched-chart wide">
              <h3><BarChart3 size={15} /> 주차별 근무 건수</h3>
              <div className="sub">{yy}년 {mm}월 · 직원·일자별 배정 건수 합계(주 단위)</div>
              {weekly.every((c) => c === 0) ? (
                <div className="sched-empty">이번 달 근무 기록이 없습니다.</div>
              ) : (
                <div className="wchart">
                  {weekly.map((c, i) => (
                    <div className="wcol" key={i} title={`${i + 1}주차 · ${c}건`}>
                      <span className="wcol-val">{c}</span>
                      <div className="wcol-bar" style={{ height: `${Math.max((c / maxWeekly) * 100, c > 0 ? 4 : 1.5)}%` }} />
                      <span className="wcol-lbl">{i + 1}주차</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {edit && (
        <Modal
          title={`일정 편집 · ${target} · ${edit.date}`}
          onClose={() => { if (!saving) setEdit(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={saving} onClick={() => setEdit(null)}>취소</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveDay()}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          <label className="field">
            <span>점검 학교 (한 줄에 하나)</span>
            <textarea className="input" style={{ minHeight: 130, padding: 10 }}
              value={eSchools} onChange={(e) => setESchools(e.target.value)}
              placeholder={'예)\n소라초\n관기초\n죽림초'} />
          </label>
          <div className="formrow" style={{ marginTop: 10 }}>
            <label className="field" style={{ flex: 1 }}><span>지역(선택)</span>
              <input className="input" value={eRegion} onChange={(e) => setERegion(e.target.value)} placeholder="예: 여수" /></label>
            <label className="field" style={{ flex: 1 }}><span>메모(선택)</span>
              <input className="input" value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="예: 연차 / 대체휴일 / 오후 회의" /></label>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            학교·지역·메모를 모두 비우고 저장하면 이 날짜 일정이 삭제됩니다.
          </div>
        </Modal>
      )}
    </div>
  )
}
