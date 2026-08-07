// 오늘의 할 일 히어로 — 홈 최상단 (0724 요청).
// 오늘 방문 예정/완료 학교(Home의 todayItems: 캘린더 계획 + /visits 실적 병합)를 받아,
// 학교별 미완 업무를 4개 API(inspections·risk·compliance·musculo)로 병렬 조회해 칩으로 표시.
// 조회 실패 시 해당 칩만 생략(화면은 항상 렌더).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, ListTodo } from 'lucide-react'
import { api } from '../lib/api'

export type TodayItem = { key: string; name: string; school_id?: string; done: boolean }
type SchoolLite = { id: string; name: string; school_level?: string; manager?: string }

type TaskChip = { label: string; cls: 'warn' | 'doing' | 'bad' | 'muted' }
type InspRow = { status: string; submitted_at?: string | null; signed_at?: string | null }
type StatusRow = { status: string }
type MusRow = { needs_review: number }

const pad2 = (n: number) => String(n).padStart(2, '0')
const DOW = ['일', '월', '화', '수', '목', '금', '토']

function deriveTasks(insp: InspRow[], risk: StatusRow[], comp: StatusRow[], mus: MusRow[], ym: string): TaskChip[] {
  const out: TaskChip[] = []
  const inspDone = insp.some((r) => ((r.submitted_at || r.signed_at || '') + '').slice(0, 7) === ym)
  if (!inspDone) out.push({ label: '안전점검 · 이번 달 미실시', cls: 'warn' })
  const riskDoing = risk.filter((r) => r.status !== 'completed').length
  if (riskDoing > 0) out.push({ label: `위험성평가 진행 ${riskDoing}건`, cls: 'doing' })
  const compDraft = comp.filter((c) => c.status === 'draft').length
  if (compDraft > 0) out.push({ label: '이행점검 작성 중', cls: 'doing' })
  const review = mus.reduce((a, m) => a + (m.needs_review || 0), 0)
  if (review > 0) out.push({ label: `증상조사표 검수 ${review}건`, cls: 'bad' })
  if (out.length === 0) out.push({ label: '특이 업무 없음 · 정기 방문', cls: 'muted' })
  return out
}

export function TodayHero(p: {
  today: Date
  items: TodayItem[]
  schools: SchoolLite[]
  unvisited: number
}) {
  const nav = useNavigate()
  const { today, items, schools } = p
  const YM = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`
  const doneCount = items.filter((i) => i.done).length

  const schoolById = useMemo(() => {
    const m = new Map<string, SchoolLite>()
    schools.forEach((s) => m.set(s.id, s))
    return m
  }, [schools])

  // 학교별 미완 업무 조회 — 오늘 방문 대상 학교만(소수) 병렬 호출
  const [tasks, setTasks] = useState<Record<string, TaskChip[]>>({})
  const idsKey = items.map((i) => i.school_id).filter(Boolean).join(',')
  useEffect(() => {
    let alive = true
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) { setTasks({}); return }
    void Promise.all(
      ids.map(async (id) => {
        const [insp, risk, comp, mus] = await Promise.all([
          api<InspRow[]>(`/inspections?school_id=${id}`).catch(() => [] as InspRow[]),
          api<StatusRow[]>(`/risk?school_id=${id}`).catch(() => [] as StatusRow[]),
          api<StatusRow[]>(`/compliance?school_id=${id}`).catch(() => [] as StatusRow[]),
          api<MusRow[]>(`/musculo?school_id=${id}`).catch(() => [] as MusRow[]),
        ])
        return [id, deriveTasks(insp, risk, comp, mus, YM)] as const
      }),
    ).then((pairs) => { if (alive) setTasks(Object.fromEntries(pairs)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return (
    <div className="hm-card hm-today">
      <div className="hm-strip" />
      <div className="hm-cyc-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>오늘의 할 일</h2>
          <div className="hm-tagline">
            {today.getMonth() + 1}월 {today.getDate()}일 ({DOW[today.getDay()]}) · 방문 예정 {items.length - doneCount}곳 · 완료 {doneCount}곳
          </div>
        </div>
        <div className="hm-td-sum">
          <div className="n">
            {doneCount}
            <small> / {items.length}곳</small>
          </div>
          <div className={'s' + (items.length > 0 && doneCount === items.length ? ' ok' : '')}>오늘 방문</div>
        </div>
      </div>

      <div className="hm-td-list">
        {items.length === 0 ? (
          <div className="hm-td-empty">
            <ListTodo size={26} strokeWidth={1.6} />
            <b>오늘 방문 일정이 없습니다</b>
            <span>
              아래 캘린더에서 방문 계획을 추가하세요
              {p.unvisited > 0 && <> · 이번 달 미방문 <em>{p.unvisited}개교</em></>}
            </span>
          </div>
        ) : (
          items.map((it, idx) => {
            const sc = it.school_id ? schoolById.get(it.school_id) : undefined
            const chips = it.school_id ? tasks[it.school_id] : undefined
            const clickable = !!it.school_id
            return (
              <div
                key={it.key}
                className={'hm-td-row' + (it.done ? ' done' : '') + (clickable ? ' hm-clickable' : '')}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={() => { if (it.school_id) nav('/schools/' + it.school_id) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && it.school_id) nav('/schools/' + it.school_id) }}
              >
                <span className={'hm-td-st' + (it.done ? ' ok' : '')}>
                  {it.done ? <CheckCircle2 size={17} strokeWidth={2.2} /> : idx + 1 - doneCount}
                </span>
                <div className="hm-td-main">
                  <div className="t">
                    {it.name}
                    {sc?.school_level && <i>{sc.school_level}</i>}
                    {sc?.manager && <span className="mg">담당 {sc.manager}</span>}
                  </div>
                  <div className="chips">
                    {it.done ? (
                      <span className="hm-td-chip muted">방문 완료 · 업무 기록은 학교 상세에서 확인</span>
                    ) : chips ? (
                      chips.map((c, i) => (
                        <span key={i} className={'hm-td-chip ' + c.cls}>{c.label}</span>
                      ))
                    ) : (
                      <span className="hm-td-chip muted">업무 확인 중…</span>
                    )}
                  </div>
                </div>
                <span className={'hm-td-pill' + (it.done ? ' ok' : '')}>{it.done ? '방문 완료' : '방문 예정'}</span>
                {clickable && <ChevronRight size={16} className="hm-td-arr" />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
