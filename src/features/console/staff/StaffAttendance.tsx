// [148] 근태 관리 — 월 달력으로 출석·휴가 확인.
//  · 현장 출석(자동): 그날 점검 등 업무 기록(/history)이 있으면 자동으로 출석 처리 — 학교에 나가 점검하면 체크됨
//  · 수기 기록: 날짜를 눌러 내근 출근·출장·반차·연차·병가·결근 지정 (저장: /ops/docs/staff-attendance)
//  · 연차: 부여일수(기본 15일) − 올해 사용(연차 1, 반차 0.5) = 잔여
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { HOLIDAYS, shiftMonth } from '../../schedule/MasterCalendar'
import {
  ATT_BY_KEY, ATT_TYPES, DEFAULT_ANNUAL_LEAVE, type AttDay, type AttPerson, type AttType,
  leaveUsedInYear, loadFieldDates, monthDays, monthStat, patchDoc, todayStr,
} from './staffData'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function StaffAttendance({ login, name, person, onChange }: {
  login: string; name: string; person?: AttPerson; onChange: (p: AttPerson) => void
}) {
  const today = todayStr()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [field, setField] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<string | null>(null) // 수정 중인 날짜
  const [draft, setDraft] = useState<{ type: AttType | ''; note: string }>({ type: '', note: '' })
  const [leaveEdit, setLeaveEdit] = useState(false)
  const [leaveVal, setLeaveVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadFieldDates(login, `${ym}-01`, `${shiftMonth(ym, 1)}-01`).then((m) => { if (alive) { setField(m); setLoading(false) } })
    return () => { alive = false }
  }, [login, ym])

  const st = useMemo(() => monthStat(ym, field, person, today), [ym, field, person, today])
  const year = ym.slice(0, 4)
  const granted = person?.annual_leave ?? DEFAULT_ANNUAL_LEAVE
  const used = leaveUsedInYear(person, year)
  const days = monthDays(ym)
  const lead = new Date(days[0] + 'T00:00:00').getDay()

  async function save(next: AttPerson) {
    setBusy(true); setErr('')
    try { await patchDoc('staff-attendance', login, next); onChange(next); return true }
    catch (e) { setErr(e instanceof Error ? e.message : '저장 실패'); return false }
    finally { setBusy(false) }
  }
  async function saveDay() {
    if (!edit) return
    const ds = { ...(person?.days || {}) }
    if (draft.type) ds[edit] = { type: draft.type, ...(draft.note.trim() ? { note: draft.note.trim() } : {}) } as AttDay
    else delete ds[edit]
    if (await save({ ...(person || {}), days: ds })) setEdit(null)
  }
  async function saveLeave() {
    const n = Number(leaveVal)
    if (!Number.isFinite(n) || n < 0) { setErr('연차 부여일수를 숫자로 입력하세요.'); return }
    if (await save({ ...(person || {}), annual_leave: n })) setLeaveEdit(false)
  }
  function openDay(d: string) {
    const a = person?.days?.[d]
    setDraft({ type: a?.type ?? '', note: a?.note ?? '' }); setErr(''); setEdit(d)
  }

  return (
    <div className="sf-att">
      <div className="sf-att-top">
        <button className="btn btn-ghost sf-xs" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="이전 달"><ChevronLeft size={15} /></button>
        <b className="sf-att-ym">{ym.replace('-', '년 ')}월</b>
        <button className="btn btn-ghost sf-xs" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="다음 달"><ChevronRight size={15} /></button>
        {ym !== today.slice(0, 7) && <button className="btn btn-ghost sf-xs" onClick={() => setYm(today.slice(0, 7))}>이번 달</button>}
        <div className="sp" />
        <div className="sf-legend">
          <span><i className="sf-dot field" />현장 출석(자동)</span>
          {ATT_TYPES.map((t) => <span key={t.key}><i className={'sf-dot ' + t.cls} />{t.short}</span>)}
        </div>
      </div>

      <div className="sf-att-kpis">
        <div><span>출석일수</span><b>{st.present}<small>일</small></b><em>현장 {st.field} · 내근·출장 {st.manual}</em></div>
        <div><span>근무일수</span><b>{st.workdays}<small>일</small></b><em>{ym === today.slice(0, 7) ? '오늘까지 · ' : ''}주말·공휴일 제외</em></div>
        <div><span>출석률</span><b className={st.rate === null ? '' : st.rate >= 90 ? 'ok' : st.rate >= 70 ? 'warn' : 'late'}>{st.rate ?? '—'}<small>{st.rate === null ? '' : '%'}</small></b><em>결근 {st.absent}일</em></div>
        <div>
          <span>{year}년 연차</span>
          <b>{granted - used}<small>일 남음</small></b>
          <em>
            부여 {granted} · 사용 {used}{' '}
            {!leaveEdit
              ? <button className="sf-link" onClick={() => { setLeaveVal(String(granted)); setLeaveEdit(true) }}>부여일수 수정</button>
              : <span className="sf-inline">
                  <input className="input" type="number" min={0} step={0.5} value={leaveVal} onChange={(e) => setLeaveVal(e.target.value)} />
                  <button className="sf-link" disabled={busy} onClick={() => void saveLeave()}>저장</button>
                  <button className="sf-link" onClick={() => setLeaveEdit(false)}>취소</button>
                </span>}
          </em>
        </div>
      </div>

      <div className={'sf-cal' + (loading ? ' loading' : '')}>
        {DOW.map((w, i) => <div key={w} className={'sf-cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={'b' + i} className="sf-cal-c blank" />)}
        {days.map((d) => {
          const dow = new Date(d + 'T00:00:00').getDay()
          const hol = HOLIDAYS[d]
          const a = person?.days?.[d]
          const t = a ? ATT_BY_KEY[a.type] : undefined
          const f = field.get(d) || 0
          const future = d > today
          return (
            <button key={d} className={'sf-cal-c' + (dow === 0 || hol ? ' sun' : dow === 6 ? ' sat' : '') + (d === today ? ' today' : '') + (future ? ' future' : '')}
              onClick={() => openDay(d)} title={[hol, f ? `현장 업무 기록 ${f}건` : '', t?.label, a?.note].filter(Boolean).join(' · ') || '눌러서 근태 기록'}>
              <span className="n">{Number(d.slice(8))}{hol && <small>{hol}</small>}</span>
              {f > 0 && <span className="sf-tag field"><MapPin size={10} />현장 {f}건</span>}
              {t && <span className={'sf-tag ' + t.cls}>{t.short}</span>}
              {a?.note && <span className="sf-note">{a.note}</span>}
            </button>
          )
        })}
      </div>
      <p className="muted sf-help">
        학교에 나가 점검·평가 등을 기록하면 그날은 <b>현장 출석</b>으로 자동 체크됩니다. 현장 기록이 없는 날은 날짜를 눌러 내근 출근·출장·휴가 등을 지정하세요.
      </p>

      {edit && (
        <Modal title={`${name} · ${edit} 근태`} onClose={() => setEdit(null)}
          footer={<>
            {err && <span className="pillx late">{err}</span>}
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>취소</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void saveDay()}>{busy ? '저장 중…' : '저장'}</button>
          </>}>
          {(field.get(edit) || 0) > 0 && (
            <div className="pillx ok" style={{ display: 'block', marginBottom: 12, whiteSpace: 'normal' }}>
              이날 현장 업무 기록 {field.get(edit)}건 — 자동으로 출석 처리됩니다.
            </div>
          )}
          <div className="sf-att-types">
            <label className={draft.type === '' ? 'on' : ''}><input type="radio" checked={draft.type === ''} onChange={() => setDraft({ ...draft, type: '' })} />기록 없음</label>
            {ATT_TYPES.map((t) => (
              <label key={t.key} className={draft.type === t.key ? 'on' : ''}>
                <input type="radio" checked={draft.type === t.key} onChange={() => setDraft({ ...draft, type: t.key })} />
                <i className={'sf-dot ' + t.cls} />{t.label}
              </label>
            ))}
          </div>
          <label className="field" style={{ marginTop: 12 }}><span>메모</span>
            <input className="input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="예: 교육청 회의, 오후 반차" />
          </label>
        </Modal>
      )}
    </div>
  )
}
