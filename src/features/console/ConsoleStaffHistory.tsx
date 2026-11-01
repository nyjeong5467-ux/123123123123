// 직원 이력 — 관리자 전용 조사원 관리.
// [148] 조사원을 누르면: 조사원 정보·이력서 + 금일 업무 수행률(오늘 할 업무 대비 실제 기록) + 근태(출석·휴가) + 업무 기록.
//   · 오늘 할 업무 = 홈 캘린더 방문계획(학교별 업무 visit-plans-{login}) → 없으면 근무표(schedules)의 오늘 학교
//   · 수행 여부 = 오늘 날짜의 실제 기록(GET /history) 이 그 학교·업무에 있는지
//   · '조사원 담당학교 변경' 버튼 → 기존 조사원 선택 → 그 조사원의 학교마다 새 조사원 지정
// ?author= 쿼리로 딥링크(계정·권한 탭 "이력" 버튼과 연동). 데이터 규칙은 staff/staffData.ts.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, CalendarCheck, CheckCircle2, CircleSlash, FileUser, ListChecks, School, ChevronLeft, ChevronRight, ScrollText, Search, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'
import type { SchedDoc } from '../schedule/MasterCalendar'
import {
  type AttDoc, type Author, type HistRow, type ResumeDoc, type SchoolLite, type StaffReg, type TodayResult, type UserAcc,
  MODULE_LABEL, MODULE_PILL, STATUS_LABEL, TASKS, UNKNOWN,
  addDays, fmtMonths, getDoc, loadToday, monthsOfTenure, pctCls, periodMonths, tenure, todayStr,
} from './staff/staffData'
import StaffAssignModal from './staff/StaffAssignModal'
import StaffAttendance from './staff/StaffAttendance'
import { ResumeEditModal } from './staff/StaffResume'
import '../../styles/staff.css'

type Person = { login: string; name: string; role: string; affiliation: string }
type SubTab = 'today' | 'schools' | 'att'
const ROLE_LABEL: Record<string, string> = { hq_admin: '본사 관리자', executive: '경영진', field_inspector: '현장 조사원', school_confirmer: '학교 확인자' }

export default function ConsoleStaffHistory() {
  const [sp, setSp] = useSearchParams()
  const selected = sp.get('author') || ''
  const today = todayStr()

  const [users, setUsers] = useState<UserAcc[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [reg, setReg] = useState<Record<string, StaffReg>>({})
  const [schools, setSchools] = useState<SchoolLite[]>([])
  const [sched, setSched] = useState<SchedDoc>({})
  const [resumes, setResumes] = useState<ResumeDoc>({})
  const [att, setAtt] = useState<AttDoc>({})
  const [todayMap, setTodayMap] = useState<Record<string, TodayResult>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sub, setSub] = useState<SubTab>('att')
  const [assignOpen, setAssignOpen] = useState(false)
  const [resumeEdit, setResumeEdit] = useState(false)
  const [msg, setMsg] = useState('')
  const [reloadSchools, setReloadSchools] = useState(0)

  // 기본 데이터
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [u, a, r, sc, rs, at] = await Promise.all([
          api<UserAcc[]>('/users').catch(() => [] as UserAcc[]),
          api<Author[]>('/history/authors').catch(() => [] as Author[]),
          getDoc<Record<string, StaffReg>>('staff-registry').catch(() => ({})),
          getDoc<SchedDoc>('schedules').catch(() => ({} as SchedDoc)),
          getDoc<ResumeDoc>('staff-resumes').catch(() => ({} as ResumeDoc)),
          getDoc<AttDoc>('staff-attendance').catch(() => ({} as AttDoc)),
        ])
        if (!alive) return
        setUsers(Array.isArray(u) ? u : []); setAuthors(Array.isArray(a) ? a : [])
        setReg(r); setSched(sc); setResumes(rs); setAtt(at)
        setLoading(false)
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : '조회 실패'); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [])
  useEffect(() => {
    api<SchoolLite[]>('/schools').then((s) => setSchools(Array.isArray(s) ? s : [])).catch(() => setSchools([]))
  }, [reloadSchools])

  // 조사원 목록 = 현장 조사원 계정 + 기록이 있는 작성자(계정 없는 경우 포함)
  const people: Person[] = useMemo(() => {
    const m = new Map<string, Person>()
    for (const u of users) {
      if (u.role !== 'field_inspector' || !u.login_id) continue
      m.set(u.login_id, { login: u.login_id, name: u.name || u.login_id, role: u.role, affiliation: reg[u.login_id]?.affiliation || '' })
    }
    for (const a of authors) {
      if (a.author_id === UNKNOWN || m.has(a.author_id)) continue
      const u = users.find((x) => x.login_id === a.author_id)
      m.set(a.author_id, { login: a.author_id, name: a.name || a.author_id, role: u?.role || '', affiliation: reg[a.author_id]?.affiliation || a.affiliation || '' })
    }
    return [...m.values()].sort((x, y) => x.name.localeCompare(y.name, 'ko'))
  }, [users, authors, reg])
  const hasUnknown = authors.some((a) => a.author_id === UNKNOWN && a.total > 0)

  // 오늘 수행률 — 조사원별(목록 배지·상단 요약)
  useEffect(() => {
    if (loading || !people.length) return
    let alive = true
    Promise.all(people.map((p) => loadToday(p.login, p.name, sched, today).then((r) => [p.login, r] as const)))
      .then((rs) => { if (alive) setTodayMap(Object.fromEntries(rs)) })
    return () => { alive = false }
  }, [loading, people, sched, today])

  const schoolsOf = (name: string) => schools.filter((s) => (s.manager || '').trim() === name)
  const pick = (login: string) => { setSp({ tab: 'history', author: login }); setSub('att') }

  const shown = people.filter((p) => !q.trim() || (p.name + p.login + p.affiliation).includes(q.trim()))
  const cur = people.find((p) => p.login === selected)

  return (
    <div>
      <div className="ledger">
        <div className="lh">
          <h2><ScrollText size={18} /> 직원 이력
            <InfoTip>
              조사원을 누르면 기본 정보·이력서, 오늘 할 업무의 수행률, 근태(출석·휴가), 업무 기록을 볼 수 있습니다.
              오늘 할 업무는 홈 캘린더 방문계획(학교별 업무)을 기준으로 하고, 없으면 근무표의 오늘 학교를 기준으로 합니다.
              학교에 나가 점검 등을 기록하면 그날은 출석으로 자동 체크됩니다.
            </InfoTip></h2>
          <div className="sp" />
          {msg && <span className="pillx ok">{msg}</span>}
          <button className="btn btn-primary" onClick={() => setAssignOpen(true)}><ArrowLeftRight size={15} /> 조사원 담당학교 변경</button>
        </div>

        {loading && <div className="tstate">불러오는 중…</div>}
        {!loading && error && <div className="tstate">오류: {error}</div>}

        {!loading && !error && (
          <div className="sf-body">
            <div className="sf-wrap">
              {/* 좌: 조사원 목록 */}
              <div className="sf-list">
                <div className="lsearch sf-mini-search"><Search size={14} />
                  <input className="input" placeholder="이름·아이디·소속 검색" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="sf-list-body">
                  {shown.map((p) => {
                    const t = todayMap[p.login]
                    return (
                      <button key={p.login} className={'sf-person' + (p.login === selected ? ' on' : '')} onClick={() => pick(p.login)}>
                        <span className="sf-av">{p.name.slice(0, 1)}</span>
                        <span className="sf-pi">
                          <b>{p.name}</b>
                          <small>{[p.login, p.affiliation].filter(Boolean).join(' · ')} · 담당 {schoolsOf(p.name).length}개</small>
                        </span>
                        <span className={'pillx ' + pctCls(t ? t.pct : null)} title="오늘 업무 수행률">
                          {!t ? '…' : t.pct === null ? '계획 없음' : `${t.pct}%`}
                        </span>
                      </button>
                    )
                  })}
                  {shown.length === 0 && <div className="tstate">조사원이 없습니다.</div>}
                  {hasUnknown && (
                    <button className={'sf-person' + (selected === UNKNOWN ? ' on' : '')} onClick={() => pick(UNKNOWN)}>
                      <span className="sf-av muted">?</span>
                      <span className="sf-pi"><b>작성자 미상</b><small>작성자 정보 없는 과거 기록</small></span>
                    </button>
                  )}
                </div>
              </div>

              {/* 우: 상세 */}
              <div className="sf-detail">
                {!selected && <div className="tstate">왼쪽에서 조사원을 선택하면 정보·이력서·오늘 업무·근태가 표시됩니다.</div>}
                {selected === UNKNOWN && <Records login={UNKNOWN} />}
                {selected && selected !== UNKNOWN && (
                  <PersonDetail
                    person={cur ?? { login: selected, name: selected, role: '', affiliation: '' }}
                    reg={reg[selected]} resume={resumes[selected]} attPerson={att[selected]}
                    schools={schoolsOf(cur?.name ?? '')} today={todayMap[selected]} sched={sched} sub={sub} setSub={setSub}
                    onEditResume={() => setResumeEdit(true)}
                    onAttChange={(p) => setAtt((a) => ({ ...a, [selected]: p }))}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {assignOpen && (
        <StaffAssignModal schools={schools} inspectors={people.map((p) => p.name)} initialFrom={cur?.name}
          onClose={() => setAssignOpen(false)}
          onSaved={(m) => { setAssignOpen(false); setMsg(m); setReloadSchools((n) => n + 1) }} />
      )}
      {resumeEdit && cur && (
        <ResumeEditModal login={cur.login} name={cur.name} resume={resumes[cur.login]}
          onClose={() => setResumeEdit(false)}
          onSaved={(r) => { setResumes((x) => ({ ...x, [cur.login]: r })); setResumeEdit(false) }} />
      )}
    </div>
  )
}

/* ---------------- 조사원 상세 ---------------- */
function PersonDetail({ person, reg, resume, attPerson, schools, today, sched, sub, setSub, onEditResume, onAttChange }: {
  person: Person; reg?: StaffReg; resume?: ResumeDoc[string]; attPerson?: AttDoc[string]; schools: SchoolLite[]
  today?: TodayResult; sched: SchedDoc; sub: SubTab; setSub: (s: SubTab) => void; onEditResume: () => void; onAttChange: (p: AttDoc[string]) => void
}) {
  const info = [reg?.affiliation && `소속 ${reg.affiliation}`, reg?.department, resume?.position].filter(Boolean)
  // [151] 프로필 요약 — 입사·경력·연락처·학력·이전 근무
  const nowMo = monthsOfTenure(resume?.hire_date)
  const prevMo = (resume?.career ?? []).reduce((s, c) => s + periodMonths(c.period), 0)
  // 최종 학력: 대학원 > 대학(교) > 그 외, 같으면 기간이 늦은 것
  const eduRank = (t: string) => (/대학원|박사|석사/.test(t) ? 3 : /대학/.test(t) ? 2 : 1)
  const edu = [...(resume?.education ?? [])].sort((a, b) => eduRank(b.title + ' ' + (b.detail || '')) - eduRank(a.title + ' ' + (a.detail || '')) || b.period.localeCompare(a.period))[0]
  const prev = resume?.career ?? []
  const facts: { k: string; v: ReactNode }[] = [
    { k: '입사일', v: resume?.hire_date ? <>{resume.hire_date}{tenure(resume.hire_date) && <small> 근속 {tenure(resume.hire_date)}</small>}</> : null },
    { k: '총 경력', v: nowMo + prevMo > 0 ? <>{fmtMonths(nowMo + prevMo)}{prevMo > 0 && nowMo > 0 && <small> 이전 {fmtMonths(prevMo)} + 현 {fmtMonths(nowMo)}</small>}{prevMo > 0 && nowMo === 0 && <small> 이전 경력 합계 (입사일 미등록)</small>}</> : null },
    { k: '전화번호', v: reg?.phone || resume?.phone || null },
    { k: '이메일', v: resume?.email || null },
    { k: '대학·전공', v: edu ? <>{edu.title}{edu.detail && <small> {edu.detail}</small>}</> : null },
    { k: '이전 근무', v: prev.length ? <>{prev.slice(0, 2).map((c, i) => <span key={i} className="sf-prev">{c.title}{c.detail && ` · ${c.detail}`}{c.period && <small> ({c.period})</small>}</span>)}{prev.length > 2 && <small>외 {prev.length - 2}곳</small>}</> : null },
  ]
  return (
    <div>
      <div className="sf-head">
        <div className="sf-av lg">{person.name.slice(0, 1)}</div>
        <div className="sf-head-main">
          <h3>{person.name} {person.role && <span className="pillx doing">{ROLE_LABEL[person.role] || person.role}</span>}
            <span className="muted sf-login">{person.login}</span></h3>
          {info.length > 0 && <div className="sf-info">{info.map((x, i) => <span key={i}>{x}</span>)}</div>}
          <div className="sf-facts">
            {facts.map((f) => (
              <div key={f.k}><span>{f.k}</span><b className={f.v ? '' : 'muted'}>{f.v ?? '미등록'}</b></div>
            ))}
          </div>
          <div className="sf-schools">
            <button className="sf-link sf-schools-btn" onClick={() => setSub('schools')} title="담당 학교 목록 보기">담당 학교 {schools.length}개</button>
            {schools.slice(0, 8).map((s) => <span key={s.id} className="sf-chip">{s.name}</span>)}
            {schools.length > 8 && <span className="muted">외 {schools.length - 8}개</span>}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onEditResume}><FileUser size={15} /> 이력서 편집</button>
      </div>

      <div className="tabs sf-tabs">
        <button className={'tab' + (sub === 'att' ? ' active' : '')} onClick={() => setSub('att')}><CalendarCheck size={13} /> 근태 관리</button>
        <button className={'tab' + (sub === 'schools' ? ' active' : '')} onClick={() => setSub('schools')}><School size={13} /> 담당 학교<span className="n">{schools.length}</span></button>
        <button className={'tab' + (sub === 'today' ? ' active' : '')} onClick={() => setSub('today')}><ListChecks size={13} /> 금일 업무·업무 기록{today && today.pct !== null && <span className="n">{today.pct}%</span>}</button>
      </div>

      <div className="sf-pane">
        {sub === 'today' && <WorkPane login={person.login} name={person.name} sched={sched} todayR={today} />}
        {sub === 'schools' && <SchoolsPane login={person.login} schools={schools} />}
        {sub === 'att' && <StaffAttendance login={person.login} name={person.name} person={attPerson} onChange={onAttChange} />}
      </div>
    </div>
  )
}

/* ---------------- [155] 금일 업무 · 업무 기록 (한 화면) ----------------
   위: 고른 날짜(기본 오늘)의 할 업무 ↔ 그에 대한 실제 업무 기록을 한 줄에 나란히
   아래: 업무 기록 전체 — 고른 날짜 행 강조, 날짜를 누르면 위 표가 그날로 바뀜 */
function WorkPane({ login, name, sched, todayR }: { login: string; name: string; sched: SchedDoc; todayR?: TodayResult }) {
  const nav = useNavigate()
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [other, setOther] = useState<TodayResult | null>(null)
  useEffect(() => {
    if (date === today) { setOther(null); return }
    let alive = true
    setOther(null)
    loadToday(login, name, sched, date).then((r) => { if (alive) setOther(r) })
    return () => { alive = false }
  }, [login, name, sched, date, today])
  const r = date === today ? todayR : other
  const isToday = date === today
  const recCell = (rs: HistRow[]) => rs.length === 0 ? <span className="muted">기록 없음</span> : (
    <div className="sf-recs">
      {rs.map((x) => (
        <span key={x.module + x.record_id} className="sf-rec">
          <b>{x.title || MODULE_LABEL[x.module] || x.module}</b>
          <span className="muted">{(x.date || '').slice(0, 10)}</span>
          <span className={'pillx ' + (x.status === 'submitted' ? 'ok' : x.status === 'signed' ? 'doing' : 'warn')}>{x.status ? (STATUS_LABEL[x.status] || x.status) : '—'}</span>
          {(x.count ?? 1) > 1 && <span className="muted">제출 {x.count}회</span>}
        </span>
      ))}
    </div>
  )
  return (
    <div>
      <div className="sf-today-head">
        <button className="btn btn-ghost sf-xs" onClick={() => setDate(addDays(date, -1))} aria-label="전날"><ChevronLeft size={14} /></button>
        <input className="input sf-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn btn-ghost sf-xs" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} aria-label="다음날"><ChevronRight size={14} /></button>
        {!isToday && <button className="btn btn-ghost sf-xs" onClick={() => setDate(today)}>오늘</button>}
        <b>{isToday ? '오늘' : date} 할 업무와 업무 기록</b>
        {r && r.total > 0 && <span className={'pillx ' + pctCls(r.pct)}>수행률 {r.pct}% · {r.total}건 중 {r.done}건</span>}
        <span className="muted">
          {r?.source === 'plan' ? '기준: 홈 캘린더 방문계획(학교별 업무)' : r?.source === 'schedule' ? '기준: 근무표 일정(업무 미지정 — 그 학교 기록이 있으면 수행)' : ''}
        </span>
      </div>
      {!r ? <div className="tstate">불러오는 중…</div> : (
        <>
          {r.total === 0 && r.extra.length === 0 ? (
            <div className="tstate">{isToday ? '오늘' : '이날'} 등록된 방문 계획과 업무 기록이 없습니다. 홈 캘린더에서 학교와 업무(안전점검·근골격계 등)를 등록하면 수행 여부가 표시됩니다.</div>
          ) : (
            <div className="twrap">
              <table className="tbl sf-work">
                <thead><tr><th style={{ width: 220 }}>학교</th><th style={{ width: 120 }}>할 업무</th><th style={{ width: 100 }}>수행</th><th>업무 기록</th></tr></thead>
                <tbody>
                  {r.items.map((it, i) => (
                    <tr key={i} className={it.done ? '' : 'sf-miss'} style={{ cursor: it.school_id ? 'pointer' : undefined }}
                      onClick={() => it.school_id && nav(`/schools/${it.school_id}`)} title={it.school_id ? '학교 상세로 이동' : undefined}>
                      <td><b>{it.school}</b></td>
                      <td>{it.task ? <span className={'pillx ' + (MODULE_PILL[it.task] || 'na')}>{MODULE_LABEL[it.task] || it.task}</span> : <span className="muted">업무 미지정</span>}</td>
                      <td>{it.done
                        ? <span className="sf-res ok"><CheckCircle2 size={15} /> 수행</span>
                        : <span className="sf-res late"><XCircle size={15} /> 미수행</span>}</td>
                      <td>{recCell(it.records)}</td>
                    </tr>
                  ))}
                  {r.extra.map((x) => (
                    <tr key={'x' + x.module + x.record_id} className="sf-extra-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/schools/${x.school_id}`)}>
                      <td><b>{x.school_name}</b></td>
                      <td><span className="muted">계획 없음</span></td>
                      <td><span className="sf-res extra"><CircleSlash size={14} /> 계획 외</span></td>
                      <td>{recCell([x])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.extra.length > 0 && <div className="muted sf-today-legend">계획 외 수행 {r.extra.length}건은 수행률 계산에 포함하지 않습니다.</div>}
        </>
      )}

      <div className="sf-subhead"><ScrollText size={14} /> {isToday ? '금일' : date} 업무 기록(문서) <span className="muted">— 위에서 고른 날짜에 작성한 문서만 표시</span></div>
      <Records login={login} day={date} />
    </div>
  )
}

/* ---------------- [153] 담당 학교 ---------------- */
function SchoolsPane({ login, schools }: { login: string; schools: SchoolLite[] }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [last, setLast] = useState<Record<string, HistRow>>({}) // 학교별 이 조사원의 최근 기록
  const [cnt, setCnt] = useState<Record<string, number>>({})
  useEffect(() => {
    let alive = true
    api<HistRow[]>(`/history?${new URLSearchParams({ author_id: login })}`)
      .then((rows) => {
        if (!alive) return
        const l: Record<string, HistRow> = {}; const c: Record<string, number> = {}
        for (const r of Array.isArray(rows) ? rows : []) {
          c[r.school_id] = (c[r.school_id] || 0) + 1
          if (!l[r.school_id] || (r.date || '') > (l[r.school_id].date || '')) l[r.school_id] = r
        }
        setLast(l); setCnt(c)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [login])
  const shown = schools
    .filter((s) => !q.trim() || (s.name + ' ' + (s.region || '') + ' ' + (s.office || '')).includes(q.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const levels = schools.reduce<Record<string, number>>((m, s) => { const k = s.school_level || '기타'; m[k] = (m[k] || 0) + 1; return m }, {})
  if (!schools.length) return <div className="tstate">담당 학교가 없습니다. 위의 &lsquo;조사원 담당학교 변경&rsquo;으로 학교를 배정하세요.</div>
  return (
    <div>
      <div className="sf-rec-tools">
        <b>담당 학교 {schools.length}개</b>
        {['유', '초', '중', '고', '기타'].filter((k) => levels[k]).map((k) => <span key={k} className="pillx todo">{k} {levels[k]}</span>)}
        {schools.some((s) => s.contracted === false) && <span className="pillx warn">미계약 {schools.filter((s) => s.contracted === false).length}</span>}
        <div className="sp" />
        <div className="lsearch sf-mini-search" style={{ width: 240 }}><Search size={14} />
          <input className="input" placeholder="학교·지역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="twrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>학교(기관)</th><th style={{ width: 70 }}>구분</th><th style={{ width: 130 }}>지역</th><th style={{ width: 90 }}>계약</th><th style={{ width: 300 }}>최근 업무 (이 조사원)</th><th style={{ width: 80 }}>기록</th></tr></thead>
          <tbody>
            {shown.map((s) => {
              const r = last[s.id]
              return (
                <tr key={s.id} onClick={() => nav(`/schools/${s.id}`)} style={{ cursor: 'pointer' }} title="학교 상세로 이동">
                  <td><b>{s.name}</b></td>
                  <td>{s.school_level || '—'}</td>
                  <td className="muted">{s.region || '—'}</td>
                  <td>{s.contracted === false ? <span className="pillx warn">미계약</span> : <span className="pillx ok">계약</span>}</td>
                  <td>{r ? <><span className="muted" style={{ marginRight: 6 }}>{(r.date || '').slice(0, 10)}</span><span className={'pillx ' + (MODULE_PILL[r.module] || 'na')}>{MODULE_LABEL[r.module] || r.module}</span></> : <span className="muted">기록 없음</span>}</td>
                  <td>{cnt[s.id] ? `${cnt[s.id]}건` : '—'}</td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={6}><div className="tstate">검색 결과가 없습니다.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- 업무 기록(기존 이력) ---------------- */
function Records({ login, day }: { login: string; day?: string }) {
  const nav = useNavigate()
  const [rows, setRows] = useState<HistRow[]>([])
  const [moduleFilter, setModuleFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    const q = new URLSearchParams({ author_id: login })
    if (moduleFilter) q.set('module', moduleFilter)
    // [156] day 가 있으면 그날 작성한 문서만(금일 업무와 같은 날짜)
    if (day) { q.set('date_from', day); q.set('date_to', addDays(day, 1)) }
    else { if (from) q.set('date_from', from); if (to) q.set('date_to', to) }
    setLoading(true); setErr('')
    api<HistRow[]>(`/history?${q}`)
      .then((r) => { const list = Array.isArray(r) ? r : []; setRows(day ? list.filter((x) => (x.date || '').slice(0, 10) === day) : list); setLoading(false) })
      .catch((e) => { setErr(e instanceof Error ? e.message : '조회 실패'); setLoading(false) })
  }, [login, moduleFilter, from, to, day])
  return (
    <div>
      <div className="sf-rec-tools">
        {login === UNKNOWN && <b>작성자 미상 기록</b>}
        <div className="sp" />
        <select className="select" style={{ width: 130 }} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="">전체 업무</option>
          {TASKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {!day && <>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={(e) => setFrom(e.target.value)} title="시작일" />
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={(e) => setTo(e.target.value)} title="종료일" />
        </>}
      </div>
      <div className="twrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 118 }}>날짜</th><th style={{ width: 120 }}>업무</th><th>학교</th><th style={{ width: 100 }}>상태</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4}><div className="tstate">불러오는 중…</div></td></tr>}
            {!loading && err && <tr><td colSpan={4}><div className="tstate">오류: {err}</div></td></tr>}
            {!loading && !err && rows.map((r) => (
              <tr key={`${r.module}-${r.record_id}`} onClick={() => nav(`/schools/${r.school_id}`)} style={{ cursor: 'pointer' }} title="학교 상세로 이동">
                <td style={{ whiteSpace: 'nowrap' }}>{r.date ? r.date.slice(0, 10) : '—'}</td>
                <td><span className={'pillx ' + (MODULE_PILL[r.module] || 'na')}>{r.title || MODULE_LABEL[r.module] || r.module}</span></td>
                <td><b>{r.school_name}</b>{(r.count ?? 1) > 1 && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>제출 {r.count}회 통합</span>}</td>
                <td>{r.status ? (STATUS_LABEL[r.status] || r.status) : '—'}</td>
              </tr>
            ))}
            {!loading && !err && rows.length === 0 && <tr><td colSpan={4}><div className="tstate">{day ? '이날 작성한 업무 기록(문서)이 없습니다.' : '조건에 맞는 기록이 없습니다.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

