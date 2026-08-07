// 홈 — 발주처 프로토타입(school-safety-ledger-pc.html v-home)의 React 포팅.
// 구성: 연간 법정업무 사이클 히어로 · 공지사항 · 산재 알림(익명) · 학교 방문률 ·
//       월간 캘린더(계획=localStorage, 실적=/visits) · 오늘 방문 · 기한 알림 · 담당 학교 표.
// 스타일: 보라 디자인 시스템(tokens.css) 기반 hm- 클래스(home.css) + 기존 .page/.ledger/.tbl 재사용.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlarmClock,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Megaphone,
  Paperclip,
  Plus,
  Siren,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { FilterBar, Pagination, SortableTh } from '../components/table'
import { Modal } from '../components/Modal'
import { SchoolFormModal } from '../components/SchoolFormModal'
import { AY_MONTH_NO, CycleHero, CYCLE_DOC_DEFAULT, migrateCycleDoc, type CycleDoc } from '../components/CycleHero'
import { TodayHero } from '../components/TodayHero'
import './../styles/home.css'

/* ===================== 타입 ===================== */
type School = {
  id: string
  name: string
  school_level?: string
  manager?: string
  address?: string
}
type Visit = { id: string; school_id: string; date: string; visitor?: string; purpose?: string }
type NoticeFile = { name: string }
type Notice = {
  id: string
  title: string
  body?: string
  files?: NoticeFile[]
  pinned?: boolean
  created_at?: string
}
// 산재는 익명 알림 — school_masked 외 학교 식별 필드는 표시하지 않는다(0709 회의 보안 결정).
type Accident = {
  id: string
  school_masked?: string
  date?: string
  description?: string
  created_at?: string
}
type Plan = { id: string; name: string; school_id?: string }
type HomeAlert = { level: 'danger' | 'warn' | 'info'; title: string; sub: string }

/* ===================== 상수 · 헬퍼 ===================== */
const LS_PLANS = 'hq_home_visit_plans_v1'
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_EN = ['MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB']

// 연간 법정업무 사이클: 데이터 모델·기본값·인터랙티브 에디터는 components/CycleHero.tsx

const pad2 = (n: number) => String(n).padStart(2, '0')
const toYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
// 학년도 내 월 순서: 3월=0 … 2월=11
const ayIdx = (month: number) => (month + 9) % 12

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)
}

// 구 localStorage 계획(v1) — 서버(/ops/docs/visit-plans) 도입 전 데이터를 1회 이관용으로만 읽음
function loadLegacyPlans(): Record<string, Plan[]> {
  try {
    const raw = localStorage.getItem(LS_PLANS)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Plan[]>) : {}
  } catch {
    return {}
  }
}

/* ===================== 담당 학교 표 설정 (모듈 상수 — 접근자 안정) ===================== */
const LEVELS = ['유', '초', '중', '고', '기타']
const LEVEL_ORDER: Record<string, number> = { 유: 0, 초: 1, 중: 2, 고: 3, 기타: 4 }
const SCH_FILTERS: FilterDef<School>[] = [
  {
    key: 'level',
    label: '학교급',
    options: LEVELS.map((l) => ({ value: l, label: l })),
    accessor: (r) => r.school_level ?? '',
  },
]
const SCH_SORTS = {
  name: (r: School) => r.name,
  level: (r: School) => LEVEL_ORDER[r.school_level ?? ''] ?? 99,
  manager: (r: School) => r.manager ?? '',
}

/* ===================== 페이지 ===================== */
export function Home() {
  const nav = useNavigate()

  // 오늘 기준값 — 렌더 간 고정.
  const [today] = useState(() => new Date())
  const TODAY_YMD = toYmd(today)
  const CUR_MONTH = today.getMonth() + 1
  const AY = CUR_MONTH >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const curAyIdx = ayIdx(CUR_MONTH)

  // 학년도 12개월(3월~익년 2월) 목록.
  const AY_MONTHS = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = ((i + 2) % 12) + 1
        const y = m >= 3 ? AY : AY + 1
        return { y, m, key: `${y}-${pad2(m)}`, label: `${m}월` }
      }),
    [AY],
  )

  /* ---- 데이터 로드 (백엔드 병렬 구현 중 — 실패 시 빈 상태) ---- */
  const [schools, setSchools] = useState<School[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [noticeReload, setNoticeReload] = useState(0)
  const [dataReload, setDataReload] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<Visit[]>('/visits').catch(() => [] as Visit[]),
      api<Accident[]>('/accidents').catch(() => [] as Accident[]),
    ]).then(([s, v, a]) => {
      if (!alive) return
      setSchools(Array.isArray(s) ? s : [])
      setVisits(Array.isArray(v) ? v : [])
      setAccidents(Array.isArray(a) ? a : [])
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [dataReload])

  useEffect(() => {
    let alive = true
    api<Notice[]>('/notices')
      .then((n) => {
        if (alive) setNotices(Array.isArray(n) ? n : [])
      })
      .catch(() => {
        if (alive) setNotices([])
      })
    return () => {
      alive = false
    }
  }, [noticeReload])

  const schoolName = useMemo(() => {
    const m = new Map<string, string>()
    schools.forEach((s) => m.set(s.id, s.name))
    return m
  }, [schools])

  /* ---- 월별 방문률 (같은 달 재방문은 1회로 계산 — 학교 distinct) ---- */
  const monthVisited = useMemo(
    () =>
      AY_MONTHS.map(({ key }) => {
        const ids = new Set<string>()
        visits.forEach((v) => {
          if ((v.date || '').startsWith(key)) ids.add(v.school_id)
        })
        return ids.size
      }),
    [AY_MONTHS, visits],
  )
  const totalSchools = schools.length
  const curVisited = monthVisited[curAyIdx] ?? 0
  const unvisited = Math.max(0, totalSchools - curVisited)
  const curPct = totalSchools ? Math.round((curVisited / totalSchools) * 100) : 0

  /* ---- 연간 법정업무 사이클(서버 문서, 인터랙티브 에디터는 CycleHero) ---- */
  const [cycleDoc, setCycleDoc] = useState<CycleDoc>(CYCLE_DOC_DEFAULT)
  useEffect(() => {
    let alive = true
    api<{ doc: Record<string, unknown> }>('/ops/docs/annual-cycle')
      .then((d) => { if (alive) setCycleDoc(migrateCycleDoc(d.doc)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  async function saveCycleDoc(doc: CycleDoc) {
    await api('/ops/docs/annual-cycle', { method: 'PUT', body: JSON.stringify({ doc }) })
    setCycleDoc(doc)
  }

  const alerts = useMemo<HomeAlert[]>(() => {
    const out: HomeAlert[] = []
    if (totalSchools > 0 && unvisited > 0) {
      out.push({
        level: today.getDate() >= 20 ? 'danger' : 'warn',
        title: `${CUR_MONTH}월 안전점검 미방문 ${unvisited}개교`,
        sub: '매월 1회 방문 점검 · 월말까지 완료하세요',
      })
    }
    for (const row of cycleDoc.rows) {
      if (!row.auto || !row.bars[0]) continue
      const b = row.bars[0]
      const sM = AY_MONTH_NO[b.s], eM = AY_MONTH_NO[b.e]
      if (curAyIdx === b.e) {
        out.push({
          level: 'danger',
          title: `${row.name} 보고서 제출 마감 (${eM}월)`,
          sub: `${sM}월 착수분 · 이번 달 말까지 제출`,
        })
      } else if (curAyIdx >= b.s && curAyIdx < b.e) {
        out.push({ level: 'warn', title: `${row.name} 진행 중 · ${eM}월 제출`, sub: row.sub })
      } else if (curAyIdx + 1 === b.s) {
        out.push({ level: 'info', title: `${row.name} 다음 달(${sM}월) 착수`, sub: `${row.sub} · 사전 준비` })
      }
    }
    out.push({
      level: 'info',
      title: '이행점검 · 교육청 공지 시 시행',
      sub: '반기 1회 (상·하반기) · 공지 하달 시 즉시 안내',
    })
    return out
    // curAyIdx/CUR_MONTH/today는 렌더 간 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSchools, unvisited, cycleDoc])

  /* ---- 캘린더: 계획(/ops/docs/visit-plans 서버 저장) + 실적(/visits) 하이브리드 ---- */
  const [plans, setPlans] = useState<Record<string, Plan[]>>({})
  const [plansReady, setPlansReady] = useState(false)
  useEffect(() => {
    let alive = true
    api<{ doc: Record<string, Plan[]> }>('/ops/docs/visit-plans')
      .then((d) => {
        if (!alive) return
        const doc = d.doc || {}
        if (Object.keys(doc).length) {
          setPlans(doc)
        } else {
          // 서버에 없으면 구 localStorage 데이터 1회 이관(있을 때만)
          const legacy = loadLegacyPlans()
          setPlans(legacy)
          if (Object.keys(legacy).length) {
            void api('/ops/docs/visit-plans', {
              method: 'PUT', body: JSON.stringify({ doc: legacy }),
            }).then(() => localStorage.removeItem(LS_PLANS)).catch(() => {})
          }
        }
        setPlansReady(true)
      })
      .catch(() => { if (alive) { setPlans(loadLegacyPlans()); setPlansReady(true) } })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!plansReady) return   // 초기 로드 전 빈 상태로 서버를 덮어쓰지 않도록 가드
    void api('/ops/docs/visit-plans', {
      method: 'PUT', body: JSON.stringify({ doc: plans }),
    }).catch(() => { /* 저장 실패는 무시 — 세션 내 상태로 동작 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans])

  const [calY, setCalY] = useState(today.getFullYear())
  const [calM, setCalM] = useState(today.getMonth() + 1) // 1~12
  const [editCal, setEditCal] = useState(false)
  const [addDate, setAddDate] = useState<string | null>(null)

  function moveMonth(delta: number) {
    const d = new Date(calY, calM - 1 + delta, 1)
    setCalY(d.getFullYear())
    setCalM(d.getMonth() + 1)
    setAddDate(null)
  }

  // 날짜별 방문 실적(학교 distinct).
  const visitsByDate = useMemo(() => {
    const m = new Map<string, { school_id: string; name: string }[]>()
    visits.forEach((v) => {
      const d = (v.date || '').slice(0, 10)
      if (!d) return
      const list = m.get(d) ?? []
      if (!list.some((x) => x.school_id === v.school_id)) {
        list.push({ school_id: v.school_id, name: schoolName.get(v.school_id) ?? '학교' })
      }
      m.set(d, list)
    })
    return m
  }, [visits, schoolName])

  function addPlan(date: string, schoolId: string) {
    const s = schools.find((x) => x.id === schoolId)
    if (!s) return
    setPlans((prev) => ({
      ...prev,
      [date]: [...(prev[date] ?? []), { id: newId(), name: s.name, school_id: s.id }],
    }))
    setAddDate(null)
  }
  function removePlan(date: string, planId: string) {
    setPlans((prev) => {
      const list = (prev[date] ?? []).filter((p) => p.id !== planId)
      const next = { ...prev }
      if (list.length) next[date] = list
      else delete next[date]
      return next
    })
  }
  // 자유 일정(학교 무관 메모형 일정 — school_id 없음)
  function addFreePlan(date: string, text: string) {
    const name = text.trim()
    if (!name) return
    setPlans((prev) => ({
      ...prev,
      [date]: [...(prev[date] ?? []), { id: newId(), name }],
    }))
  }

  // 날짜 클릭 → 일정 추가/편집 모달 (편집 모드 토글 없이 바로)
  const [dayModal, setDayModal] = useState<string | null>(null)
  const [dayFree, setDayFree] = useState('')
  const [daySchool, setDaySchool] = useState('')

  // 학교 등록 모달(홈에서 바로 등록)
  const [schoolModal, setSchoolModal] = useState(false)

  // 달력 셀 배열.
  const calCells = useMemo(() => {
    const startDow = new Date(calY, calM - 1, 1).getDay()
    const days = new Date(calY, calM, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calY, calM])

  /* ---- 오늘 방문: 실적 + 계획 병합 ---- */
  const todayItems = useMemo(() => {
    const done = visitsByDate.get(TODAY_YMD) ?? []
    const doneIds = new Set(done.map((d) => d.school_id))
    const planned = (plans[TODAY_YMD] ?? []).filter((p) => !p.school_id || !doneIds.has(p.school_id))
    return [
      ...done.map((d) => ({ key: 'v-' + d.school_id, name: d.name, school_id: d.school_id as string | undefined, done: true })),
      ...planned.map((p) => ({ key: 'p-' + p.id, name: p.name, school_id: p.school_id, done: false })),
    ]
  }, [visitsByDate, plans, TODAY_YMD])

  /* ---- 이번 주 방문 예정: 내일부터 7일간의 계획(날짜별 그룹) ---- */
  const weekPlans = useMemo(() => {
    const out: { ymd: string; label: string; entries: Plan[] }[] = []
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const key = toYmd(d)
      const entries = plans[key] ?? []
      if (entries.length) out.push({ ymd: key, label: `${d.getMonth() + 1}/${d.getDate()} (${DOW_LABELS[d.getDay()]})`, entries })
    }
    return out
    // today는 렌더 간 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans])
  const weekCount = weekPlans.reduce((a, d) => a + d.entries.length, 0)

  /* ---- 공지 등록 모달 (본사 관리자) ---- */
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [nTitle, setNTitle] = useState('')
  const [nBody, setNBody] = useState('')
  const [nFiles, setNFiles] = useState<NoticeFile[]>([])
  const [nPinned, setNPinned] = useState(false)
  const [nSaving, setNSaving] = useState(false)
  const [nErr, setNErr] = useState('')

  function resetNoticeForm() {
    setNTitle('')
    setNBody('')
    setNFiles([])
    setNPinned(false)
    setNErr('')
  }

  async function submitNotice() {
    if (!nTitle.trim()) {
      setNErr('제목을 입력하세요.')
      return
    }
    setNSaving(true)
    setNErr('')
    try {
      // 파일은 이름만 전송(회의 결정 — 실파일 업로드는 추후).
      await api('/notices', {
        method: 'POST',
        body: JSON.stringify({ title: nTitle.trim(), body: nBody.trim(), files: nFiles, pinned: nPinned }),
      })
      resetNoticeForm()
      setNoticeOpen(false)
      setNoticeReload((n) => n + 1)
    } catch (e) {
      setNErr(e instanceof Error ? e.message : '등록에 실패했습니다.')
    } finally {
      setNSaving(false)
    }
  }

  const sortedNotices = useMemo(
    () =>
      [...notices].sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
        return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      }),
    [notices],
  )

  const recentAccidents = useMemo(
    () =>
      [...accidents]
        .sort((a, b) => (b.date ?? b.created_at ?? '').localeCompare(a.date ?? a.created_at ?? ''))
        .slice(0, 5),
    [accidents],
  )

  /* ---- 담당 학교 표 ---- */
  const q = useTableQuery(schools, {
    searchFields: [(r) => r.name, (r) => r.manager ?? ''],
    filters: SCH_FILTERS,
    sortAccessors: SCH_SORTS,
    searchPlaceholder: '학교명·담당자',
  })

  /* ---- 사이클 히어로: 안전점검 월 세그먼트 ---- */
  const inspSegs = AY_MONTHS.map((_, i) => {
    if (i === curAyIdx) return { cls: 'now', label: '진행' }
    if (i > curAyIdx) return { cls: 'plan', label: '' }
    if (visits.length === 0) return { cls: 'plan', label: '—' }
    return monthVisited[i] > 0 ? { cls: 'done', label: '완료' } : { cls: 'miss', label: '미실시' }
  })
  // nowline 가로 위치: gantt 좌우 패딩 20px + 라벨 150px + 상태열 132px 제외한
  // 12칸 트랙 영역에서 (현재월 + 0.5)/12 지점. left 기준은 패딩 박스라 20px을 더한다.
  const nowlineLeft = `calc(170px + (100% - 322px) * ${(curAyIdx + 0.5) / 12})`

  const ALERT_ICON: Record<HomeAlert['level'], string> = { danger: '!', warn: '!', info: 'i' }

  return (
    <div className="page rv">
      {/* ===== 1. 오늘의 할 일 히어로 + 공지사항 ===== */}
      <div className="hm-top">
        <TodayHero today={today} items={todayItems} schools={schools} unvisited={unvisited} />

        {/* 공지사항 */}
        <div className="hm-side-col">
          <div className="hm-card">
            <div className="hm-ch">
              <span className="hm-ic v"><Megaphone size={16} /></span>
              <h3>공지사항</h3>
              <div className="hm-r">
                <button className="hm-qbtn" onClick={() => setNoticeOpen(true)}>
                  <Plus size={13} /> 공지 등록
                </button>
              </div>
            </div>
            <div className="hm-nlist">
              {sortedNotices.length === 0 && (
                <div className="hm-empty">{loading ? '불러오는 중…' : '등록된 공지가 없습니다.'}</div>
              )}
              {sortedNotices.slice(0, 6).map((n) => (
                <div className="hm-n" key={n.id}>
                  <span className={'hm-pin' + (n.pinned ? '' : ' g')}>{n.pinned ? '필독' : '안내'}</span>
                  <div className="hm-nbody">
                    <div className="b">{n.title}</div>
                    <div className="m">
                      {n.created_at && <span className="dt">{n.created_at.slice(0, 10)}</span>}
                      {(n.files ?? []).length > 0 && (
                        <span className="hm-nfile">
                          <Paperclip size={11} />
                          {(n.files ?? []).map((f) => f.name).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    title={n.pinned ? '필독 해제' : '필독 고정'}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700 }}
                    onClick={() => {
                      void api(`/notices/${n.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ title: n.title, body: n.body || '', files: n.files ?? [], pinned: !n.pinned }),
                      }).then(() => setNoticeReload((x) => x + 1)).catch(() => {})
                    }}
                  >
                    {n.pinned ? '해제' : '고정'}
                  </button>
                  <button
                    type="button"
                    title="공지 삭제"
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1 }}
                    onClick={() => {
                      if (!window.confirm(`공지 "${n.title}"을(를) 삭제할까요?`)) return
                      void api(`/notices/${n.id}`, { method: 'DELETE' })
                        .then(() => setNoticeReload((x) => x + 1)).catch(() => {})
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 산재 알림(익명) — school_masked만 노출 */}
          <div className="hm-card">
            <div className="hm-ch">
              <span className="hm-ic r"><Siren size={16} /></span>
              <h3>산재 알림</h3>
              <div className="hm-r">
                <button className="hm-link" onClick={() => nav('/accidents')}>전체 보기</button>
              </div>
            </div>
            <div className="hm-nlist">
              {recentAccidents.length === 0 && (
                <div className="hm-empty">{loading ? '불러오는 중…' : '최근 산업재해 알림이 없습니다.'}</div>
              )}
              {recentAccidents.map((a) => (
                <div
                  className="hm-n hm-clickable"
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => nav('/accidents')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') nav('/accidents')
                  }}
                >
                  <span className="hm-pin">산재</span>
                  <div className="hm-nbody">
                    <div className="b">{a.school_masked || '학교 비공개'}</div>
                    <div className="m">
                      {(a.date || a.created_at) && <span className="dt">{(a.date ?? a.created_at ?? '').slice(0, 10)}</span>}
                      {a.description && <span>{a.description}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 1-2. 연간 법정업무 운영 공지 (전체 폭 — 오늘의 할 일 아래로 이동) ===== */}
      <div className="hm-mt">
        <CycleHero
          ay={AY}
          monthLabels={AY_MONTHS.map((m) => m.label)}
          monthEn={MONTH_EN}
          curAyIdx={curAyIdx}
          inspSegs={inspSegs}
          inspNum={
            <div className="hm-gnum">
              <div className="n">
                {totalSchools ? curVisited : '—'}
                {totalSchools > 0 && <small> / {totalSchools}교</small>}
              </div>
              <div className={'s' + (unvisited > 0 ? ' bad' : totalSchools ? ' ok' : '')}>
                {totalSchools === 0
                  ? '학교 등록 대기'
                  : unvisited > 0
                    ? `${CUR_MONTH}월 · 미방문 ${unvisited}교`
                    : `${CUR_MONTH}월 · 전 학교 완료`}
              </div>
            </div>
          }
          nowlineLeft={nowlineLeft}
          doc={cycleDoc}
          onSave={saveCycleDoc}
        />
      </div>

      {/* ===== 3. 캘린더 + 오늘 방문 + 기한 알림 ===== */}
      <div className="hm-plan hm-mt">
        <div className="hm-card">
          <div className="hm-calhead">
            <div className="hm-navb">
              <button onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={15} /></button>
              <button onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight size={15} /></button>
            </div>
            <h3>{calY}년 {calM}월</h3>
            <div className="hm-callegend">
              <span><i className="sw-done" />방문 완료</span>
              <span><i className="sw-now" />방문 예정</span>
              <span><i className="sw-miss" />미이행</span>
            </div>
            <div className="hm-editbar">
              {editCal ? (
                <>
                  <span className="hm-hint">날짜의 + 학교로 추가 · ×로 삭제</span>
                  <button className="btn btn-primary hm-btn-sm" onClick={() => { setEditCal(false); setAddDate(null) }}>
                    편집 완료
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost hm-btn-sm" onClick={() => setEditCal(true)}>일정 편집</button>
              )}
            </div>
          </div>
          <div className="hm-cal">
            {DOW_LABELS.map((d) => (
              <div className="hm-dow" key={d}>{d}</div>
            ))}
            {calCells.map((d, idx) => {
              if (d === null) return <div className="hm-cell off" key={'e' + idx} />
              const dateKey = `${calY}-${pad2(calM)}-${pad2(d)}`
              const dow = idx % 7
              const isToday = dateKey === TODAY_YMD
              const done = visitsByDate.get(dateKey) ?? []
              const dayPlans = plans[dateKey] ?? []
              const doneIds = new Set(done.map((x) => x.school_id))
              return (
                <div
                  key={dateKey}
                  className={
                    'hm-cell' +
                    (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') +
                    (isToday ? ' now' : '')
                  }
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  title="클릭하여 일정 추가/편집"
                  onClick={() => { setDaySchool(''); setDayFree(''); setDayModal(dateKey) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setDaySchool(''); setDayFree(''); setDayModal(dateKey) } }}
                >
                  <div className="d">{d}</div>
                  {done.map((v) => (
                    <button
                      key={'v' + v.school_id}
                      className="hm-ev done"
                      onClick={(e) => { e.stopPropagation(); nav('/schools/' + v.school_id) }}
                      title={v.name + ' · 방문 완료'}
                    >
                      {v.name}
                    </button>
                  ))}
                  {dayPlans
                    .filter((p) => !p.school_id || !doneIds.has(p.school_id))
                    .map((p) => {
                      const missed = dateKey < TODAY_YMD
                      return (
                        <button
                          key={p.id}
                          className={'hm-ev ' + (missed ? 'miss' : 'plan')}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (editCal) return
                            if (p.school_id) nav('/schools/' + p.school_id)
                          }}
                          title={p.name + (missed ? ' · 미이행' : ' · 방문 예정')}
                        >
                          <span className="tx">{p.name}</span>
                          {editCal && (
                            <span
                              className="hm-x"
                              role="button"
                              tabIndex={0}
                              aria-label="삭제"
                              onClick={(e) => {
                                e.stopPropagation()
                                removePlan(dateKey, p.id)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation()
                                  removePlan(dateKey, p.id)
                                }
                              }}
                            >
                              ×
                            </span>
                          )}
                        </button>
                      )
                    })}
                  {editCal && addDate !== dateKey && (
                    <button className="hm-addbtn" onClick={(e) => { e.stopPropagation(); setAddDate(dateKey) }}>+ 학교</button>
                  )}
                  {editCal && addDate === dateKey && (
                    <select
                      className="hm-addsel"
                      autoFocus
                      defaultValue=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (e.target.value) addPlan(dateKey, e.target.value)
                      }}
                      onBlur={() => setAddDate(null)}
                    >
                      <option value="">학교 선택…</option>
                      {schools
                        .filter((s) => !dayPlans.some((p) => p.school_id === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="hm-side-col">
          {/* 이번 주 방문 예정 (구 '오늘 방문' — 오늘 목록은 상단 '오늘의 할 일'로 이동, 0804) */}
          <div className="hm-card">
            <div className="hm-ch">
              <span className="hm-ic y"><CalendarDays size={16} /></span>
              <h3>이번 주 방문 예정</h3>
              <div className="hm-r">{weekCount}건</div>
            </div>
            {weekCount === 0 && (
              <div className="hm-empty">다가오는 7일간 방문 계획이 없습니다. 캘린더에서 일정을 추가하세요.</div>
            )}
            {weekPlans.map((day) => (
              <div key={day.ymd}>
                <div className="hm-wk-day">{day.label}</div>
                {day.entries.map((p) => (
                  <div
                    className="hm-todo"
                    key={p.id}
                    role={p.school_id ? 'button' : undefined}
                    tabIndex={p.school_id ? 0 : undefined}
                    onClick={() => {
                      if (p.school_id) nav('/schools/' + p.school_id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && p.school_id) nav('/schools/' + p.school_id)
                    }}
                  >
                    <div className="hm-todo-main">
                      <div className="nm">{p.name}</div>
                    </div>
                    {p.school_id && <span className="hm-go">대장 →</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 기한 알림 */}
          <div className="hm-card">
            <div className="hm-ch">
              <span className="hm-ic r"><AlarmClock size={16} /></span>
              <h3>기한 알림</h3>
              <div className="hm-r">{alerts.length}건</div>
            </div>
            {alerts.map((a, i) => (
              <div className={'hm-alert ' + a.level} key={i}>
                <i className="ic">{ALERT_ICON[a.level]}</i>
                <div>
                  <b>{a.title}</b>
                  <span>{a.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 공지 등록 모달 ===== */}
      {noticeOpen && (
        <Modal
          title="공지 등록"
          onClose={() => {
            setNoticeOpen(false)
            resetNoticeForm()
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setNoticeOpen(false)
                  resetNoticeForm()
                }}
                disabled={nSaving}
              >
                취소
              </button>
              <button className="btn btn-primary" onClick={submitNotice} disabled={nSaving}>
                {nSaving ? '등록 중…' : '등록'}
              </button>
            </>
          }
        >
          {nErr && <div className="login-err">{nErr}</div>}
          <label className="field">
            <span>제목 *</span>
            <input
              className="input"
              value={nTitle}
              onChange={(e) => setNTitle(e.target.value)}
              placeholder="예: 상반기 이행점검 시행 안내"
            />
          </label>
          <label className="field">
            <span>내용</span>
            <textarea
              className="input hm-ta"
              value={nBody}
              onChange={(e) => setNBody(e.target.value)}
              placeholder="공지 내용을 입력하세요"
            />
          </label>
          <label className="field">
            <span>파일 첨부 (파일명만 전송)</span>
            <input
              className="input hm-filein"
              type="file"
              multiple
              onChange={(e) => {
                const fl = e.target.files
                const picked: NoticeFile[] = fl ? Array.from(fl).map((f) => ({ name: f.name })) : []
                if (picked.length) setNFiles((prev) => [...prev, ...picked])
                e.target.value = ''
              }}
            />
          </label>
          {nFiles.length > 0 && (
            <div className="hm-files">
              {nFiles.map((f, i) => (
                <span className="hm-file" key={f.name + i}>
                  <Paperclip size={12} />
                  {f.name}
                  <button
                    className="rm"
                    aria-label="첨부 제거"
                    onClick={() => setNFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <label className="hm-pincheck">
            <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} />
            필독 공지로 상단 고정
          </label>
        </Modal>
      )}

      {/* ===== 날짜 클릭 → 일정 추가/편집 모달 ===== */}
      {dayModal && (
        <Modal
          title={`${dayModal} 일정`}
          onClose={() => setDayModal(null)}
          footer={<button className="btn btn-primary" onClick={() => setDayModal(null)}>닫기</button>}
        >
          {(visitsByDate.get(dayModal) ?? []).length > 0 && (
            <>
              <b style={{ fontSize: 13 }}>방문 완료</b>
              <ul className="shub-notes" style={{ marginBottom: 12 }}>
                {(visitsByDate.get(dayModal) ?? []).map((v, i) => (
                  <li key={i}>
                    <span className="dt">완료</span>
                    <span className="tx">{v.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <b style={{ fontSize: 13 }}>방문 예정 · 일정</b>
          {(plans[dayModal] ?? []).length === 0 && (
            <div className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>등록된 일정이 없습니다.</div>
          )}
          {(plans[dayModal] ?? []).length > 0 && (
            <ul className="shub-notes" style={{ marginBottom: 10 }}>
              {(plans[dayModal] ?? []).map((p) => (
                <li key={p.id}>
                  <span className="dt">{p.school_id ? '학교' : '일정'}</span>
                  <span className="tx">{p.name}</span>
                  <button className="shub-del" title="삭제" onClick={() => removePlan(dayModal, p.id)}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <div className="formrow" style={{ marginTop: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>학교 방문 추가</span>
              <select className="select" value={daySchool}
                onChange={(e) => {
                  setDaySchool('')
                  if (e.target.value) addPlan(dayModal, e.target.value)
                }}>
                <option value="">학교 선택…</option>
                {schools
                  .filter((s) => !(plans[dayModal] ?? []).some((p) => p.school_id === s.id))
                  .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="formrow" style={{ marginTop: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span>자유 일정 추가 (교육·회의 등)</span>
              <input className="input" value={dayFree} placeholder="예: 안전보건 교육 준비"
                onChange={(e) => setDayFree(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addFreePlan(dayModal, dayFree); setDayFree('') } }} />
            </label>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-end' }}
              onClick={() => { addFreePlan(dayModal, dayFree); setDayFree('') }}>추가</button>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
            일정은 서버에 저장되어 어느 PC에서나 동일하게 보입니다. 학교 일정은 방문 완료(임원 방문 기록) 시 완료 표시로 바뀝니다.
          </div>
        </Modal>
      )}

      {/* ===== 홈에서 학교 등록 ===== */}
      {schoolModal && (
        <SchoolFormModal onClose={() => setSchoolModal(false)} onSaved={() => setDataReload((n) => n + 1)} />
      )}
    </div>
  )
}
