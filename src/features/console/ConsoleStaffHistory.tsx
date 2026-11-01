// 직원 이력 — 관리자 전용 조사원 관리.
// [148] 조사원을 누르면: 조사원 정보·이력서 + 금일 업무 수행률(오늘 할 업무 대비 실제 기록) + 근태(출석·휴가) + 업무 기록.
//   · 오늘 할 업무 = 홈 캘린더 방문계획(학교별 업무 visit-plans-{login}) → 없으면 근무표(schedules)의 오늘 학교
//   · 수행 여부 = 오늘 날짜의 실제 기록(GET /history) 이 그 학교·업무에 있는지
//   · '조사원 담당학교 변경' 버튼 → 기존 조사원 선택 → 그 조사원의 학교마다 새 조사원 지정
// ?author= 쿼리로 딥링크(계정·권한 탭 "이력" 버튼과 연동). 데이터 규칙은 staff/staffData.ts.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, CalendarCheck, CheckCircle2, CircleSlash, FileUser, ListChecks, ScrollText, Search, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'
import type { SchedDoc } from '../schedule/MasterCalendar'
import {
  type AttDoc, type Author, type HistRow, type ResumeDoc, type SchoolLite, type StaffReg, type TodayResult, type UserAcc,
  DEFAULT_ANNUAL_LEAVE, MODULE_LABEL, MODULE_PILL, STATUS_LABEL, TASKS, UNKNOWN,
  getDoc, leaveUsedInYear, loadToday, pctCls, tenure, todayStr,
} from './staff/staffData'
import StaffAssignModal from './staff/StaffAssignModal'
import StaffAttendance from './staff/StaffAttendance'
import { ResumeEditModal, ResumeView } from './staff/StaffResume'
import '../../styles/staff.css'

type Person = { login: string; name: string; role: string; affiliation: string }
type SubTab = 'today' | 'resume' | 'att' | 'records'
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
  const [sub, setSub] = useState<SubTab>('today')
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
  const pick = (login: string) => { setSp({ tab: 'history', author: login }); setSub(login === UNKNOWN ? 'records' : 'today') }

  const summary = useMemo(() => {
    const rs = Object.values(todayMap).filter((r) => r.total > 0)
    const done = rs.reduce((s, r) => s + r.done, 0); const total = rs.reduce((s, r) => s + r.total, 0)
    return { planned: rs.length, full: rs.filter((r) => r.done === r.total).length, pct: total ? Math.round((done / total) * 100) : null, missing: total - done }
  }, [todayMap])

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
            <div className="sf-sum">
              <div><span>오늘 계획 있는 조사원</span><b>{summary.planned}<small>/ {people.length}명</small></b></div>
              <div><span>오늘 전체 수행률</span><b className={pctCls(summary.pct)}>{summary.pct ?? '—'}<small>{summary.pct === null ? '' : '%'}</small></b></div>
              <div><span>업무 모두 완료</span><b>{summary.full}<small>명</small></b></div>
              <div><span>미수행 업무</span><b className={summary.missing ? 'late' : ''}>{summary.missing}<small>건</small></b></div>
            </div>

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
                    schools={schoolsOf(cur?.name ?? '')} today={todayMap[selected]} sub={sub} setSub={setSub}
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
function PersonDetail({ person, reg, resume, attPerson, schools, today, sub, setSub, onEditResume, onAttChange }: {
  person: Person; reg?: StaffReg; resume?: ResumeDoc[string]; attPerson?: AttDoc[string]; schools: SchoolLite[]
  today?: TodayResult; sub: SubTab; setSub: (s: SubTab) => void; onEditResume: () => void; onAttChange: (p: AttDoc[string]) => void
}) {
  const year = todayStr().slice(0, 4)
  const granted = attPerson?.annual_leave ?? DEFAULT_ANNUAL_LEAVE
  const used = leaveUsedInYear(attPerson, year)
  const info = [
    reg?.affiliation && `소속 ${reg.affiliation}`, reg?.department && reg.department, resume?.position,
    reg?.phone && `☎ ${reg.phone}`, resume?.email,
    resume?.hire_date && `입사 ${resume.hire_date}${tenure(resume.hire_date) ? ` (근속 ${tenure(resume.hire_date)})` : ''}`,
  ].filter(Boolean)
  return (
    <div>
      <div className="sf-head">
        <div className="sf-av lg">{person.name.slice(0, 1)}</div>
        <div className="sf-head-main">
          <h3>{person.name} {person.role && <span className="pillx doing">{ROLE_LABEL[person.role] || person.role}</span>}
            <span className="muted sf-login">{person.login}</span></h3>
          <div className="sf-info">{info.length ? info.map((x, i) => <span key={i}>{x}</span>) : <span className="muted">등록된 소속·연락처가 없습니다 (계정·권한 탭에서 등록)</span>}</div>
          <div className="sf-schools">
            <b>담당 학교 {schools.length}개</b>
            {schools.slice(0, 8).map((s) => <span key={s.id} className="sf-chip">{s.name}</span>)}
            {schools.length > 8 && <span className="muted">외 {schools.length - 8}개</span>}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onEditResume}><FileUser size={15} /> 이력서 편집</button>
      </div>

      <div className="sf-cards">
        <button className={'sf-card' + (sub === 'today' ? ' on' : '')} onClick={() => setSub('today')}>
          <span>금일 업무 수행률</span>
          <b className={pctCls(today ? today.pct : null)}>{!today ? '…' : today.pct === null ? '계획 없음' : `${today.pct}%`}</b>
          <div className="sf-bar"><i style={{ width: `${today?.pct ?? 0}%` }} className={pctCls(today ? today.pct : null)} /></div>
          <em>{today && today.total ? `${today.total}건 중 ${today.done}건 수행` : '오늘 등록된 방문 계획 없음'}</em>
        </button>
        <button className={'sf-card' + (sub === 'att' ? ' on' : '')} onClick={() => setSub('att')}>
          <span>{year}년 연차</span>
          <b>{granted - used}<small>일 남음</small></b>
          <em>부여 {granted}일 · 사용 {used}일</em>
        </button>
        <button className={'sf-card' + (sub === 'resume' ? ' on' : '')} onClick={() => setSub('resume')}>
          <span>이력서</span>
          <b>{resume?.career?.length ?? 0}<small>경력</small> {resume?.certs?.length ?? 0}<small>자격</small></b>
          <em>{resume?.updated_at ? `최종 수정 ${resume.updated_at}` : '미등록'}</em>
        </button>
      </div>

      <div className="tabs sf-tabs">
        <button className={'tab' + (sub === 'today' ? ' active' : '')} onClick={() => setSub('today')}><ListChecks size={13} /> 금일 업무</button>
        <button className={'tab' + (sub === 'resume' ? ' active' : '')} onClick={() => setSub('resume')}><FileUser size={13} /> 이력서</button>
        <button className={'tab' + (sub === 'att' ? ' active' : '')} onClick={() => setSub('att')}><CalendarCheck size={13} /> 근태 관리</button>
        <button className={'tab' + (sub === 'records' ? ' active' : '')} onClick={() => setSub('records')}><ScrollText size={13} /> 업무 기록</button>
      </div>

      <div className="sf-pane">
        {sub === 'today' && <TodayPane r={today} />}
        {sub === 'resume' && <ResumeView r={resume} />}
        {sub === 'att' && <StaffAttendance login={person.login} name={person.name} person={attPerson} onChange={onAttChange} />}
        {sub === 'records' && <Records login={person.login} />}
      </div>
    </div>
  )
}

/* ---------------- 금일 업무 ---------------- */
function TodayPane({ r }: { r?: TodayResult }) {
  const nav = useNavigate()
  if (!r) return <div className="tstate">불러오는 중…</div>
  return (
    <div>
      <div className="sf-today-head">
        <b>{todayStr()} 오늘 할 업무</b>
        <span className="muted">
          {r.source === 'plan' ? '기준: 홈 캘린더 방문계획(학교별 업무)' : r.source === 'schedule' ? '기준: 근무표 일정(업무 미지정 — 그 학교 기록이 있으면 수행)' : ''}
        </span>
      </div>
      {r.total === 0 ? (
        <div className="tstate">오늘 등록된 방문 계획이 없습니다. 홈 캘린더에서 학교와 업무(안전점검·근골격계 등)를 등록하면 수행 여부가 표시됩니다.</div>
      ) : (
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th>학교</th><th style={{ width: 150 }}>업무</th><th style={{ width: 130 }}>수행</th><th style={{ width: 120 }}>상태</th></tr></thead>
            <tbody>
              {r.items.map((it, i) => (
                <tr key={i} className={it.done ? '' : 'sf-miss'} style={{ cursor: it.school_id ? 'pointer' : undefined }}
                  onClick={() => it.school_id && nav(`/schools/${it.school_id}`)}>
                  <td><b>{it.school}</b></td>
                  <td>{it.task ? <span className={'pillx ' + (MODULE_PILL[it.task] || 'na')}>{MODULE_LABEL[it.task] || it.task}</span> : <span className="muted">업무 미지정</span>}</td>
                  <td>{it.done
                    ? <span className="sf-res ok"><CheckCircle2 size={15} /> 수행</span>
                    : <span className="sf-res late"><XCircle size={15} /> 미수행</span>}</td>
                  <td>{it.status ? (STATUS_LABEL[it.status] || it.status) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.extra.length > 0 && (
        <div className="sf-extra">
          <b><CircleSlash size={13} /> 계획 외 수행 {r.extra.length}건</b> <span className="muted">(수행률 계산에는 포함하지 않음)</span>
          <div>{r.extra.map((x) => <span key={x.module + x.record_id} className="sf-chip">{x.school_name} · {MODULE_LABEL[x.module] || x.module}</span>)}</div>
        </div>
      )}
      <div className="sf-today-legend muted">업무 종류: {TASKS.map((t) => t.label).join(' · ')}</div>
    </div>
  )
}

/* ---------------- 업무 기록(기존 이력) ---------------- */
function Records({ login }: { login: string }) {
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
    if (from) q.set('date_from', from)
    if (to) q.set('date_to', to)
    setLoading(true); setErr('')
    api<HistRow[]>(`/history?${q}`)
      .then((r) => { setRows(Array.isArray(r) ? r : []); setLoading(false) })
      .catch((e) => { setErr(e instanceof Error ? e.message : '조회 실패'); setLoading(false) })
  }, [login, moduleFilter, from, to])
  return (
    <div>
      <div className="sf-rec-tools">
        {login === UNKNOWN && <b>작성자 미상 기록</b>}
        <div className="sp" />
        <select className="select" style={{ width: 130 }} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="">전체 업무</option>
          {TASKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input className="input" type="date" style={{ width: 140 }} value={from} onChange={(e) => setFrom(e.target.value)} title="시작일" />
        <input className="input" type="date" style={{ width: 140 }} value={to} onChange={(e) => setTo(e.target.value)} title="종료일" />
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
            {!loading && !err && rows.length === 0 && <tr><td colSpan={4}><div className="tstate">조건에 맞는 기록이 없습니다.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

