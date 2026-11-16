// 활동 현황(관리자 전용) — 현장 앱 활동 로그를 점검 증빙·근무 기록 참고용으로 보는 화면.
// 구조는 세금계산서(Billing.tsx) 워크스페이스를 본떴다: 좌측 카테고리 · 상단 누적 탭(열어 본 화면이 쌓이고 × / 더블클릭으로 닫힘)
// · 우측 작업 영역. 탭·활성 탭·탭별 필터 상태는 localStorage 'activity.ws.v1' 에 보존된다.
// 사용자·학교는 대상마다 별도 탭("홍길동 · 11-16", "순천이수초")으로 열리며, 10개를 넘으면 가장 오래된 비활성 탭이 닫힌다.
// 접근: executive·hq_admin 만(사이드바 메뉴도 hqOnly 로 같은 역할에만 노출). 그 외 역할은 안내만 보인다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type LucideIcon, CalendarDays, CalendarRange, Footprints, HelpCircle, Info, ListOrdered, Lock, MapPin, MapPinCheck,
  Plus, School, ShieldAlert, Smartphone, UserRoundCheck, Users, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { fmtMD, todayKst } from '../features/activity/data'
import {
  type OpenReq, type St, ConsentPanel, DailyPanel, LedgerPanel, MonthPanel, OnsitePanel, SchoolPanel, SchoolsPanel,
  UserPanel, UsersPanel, WeekPanel, isAdminRole,
} from '../features/activity/panels'
import { DevicesPanel } from '../features/activity/devices'
import '../styles/billingws.css'
import '../styles/activity.css'

// ── 워크스페이스 탭 모델 ──
type FixedKind = 'daily' | 'week' | 'month' | 'users' | 'schools' | 'onsite' | 'consent' | 'devices' | 'ledger'
type TabKind = FixedKind | 'user' | 'school'
type Tab = { id: string; kind: TabKind; p?: Record<string, string> }   // p: 인스턴스 매개변수(login_id·name / school_id·school_name)
type Ws = { tabs: Tab[]; active: string | null; st: Record<string, St> }

const FIXED: Record<FixedKind, { label: string; Icon: LucideIcon; desc: string }> = {
  daily: { label: '일일 현황', Icon: CalendarDays, desc: '요약 카드 · 사용자별 표 · 날짜 이동' },
  week: { label: '주간 격자', Icon: CalendarRange, desc: '날짜 × 사용자 첫/마지막 활동' },
  month: { label: '월간 요약', Icon: CalendarDays, desc: '활동일 · 학교 수 · 저장 수 · 마지막 활동' },
  users: { label: '사용자별', Icon: Users, desc: '사용자 선택 → 날짜별 타임라인·학교·이벤트' },
  schools: { label: '학교별', Icon: School, desc: '학교 검색 → 누가 언제 다녀갔는지' },
  onsite: { label: '현장 작성 증빙', Icon: MapPinCheck, desc: '현장/현장 외/미판정 집계 · 거리 이상치' },
  consent: { label: '위치 동의 현황', Icon: MapPin, desc: '사용자별 동의/미동의 · 버전 · 시각(구서버는 추정)' },
  devices: { label: '기기 목록', Icon: Smartphone, desc: '앱 설치 단말 · 라벨 편집 · 마지막 사용자/활동' },
  ledger: { label: '이벤트 원장', Icon: ListOrdered, desc: '필터 · CSV 내려받기' },
}
const MENU: { title: string; keys: FixedKind[] }[] = [
  { title: '현황', keys: ['daily', 'week', 'month'] },
  { title: '드릴다운', keys: ['users', 'schools'] },
  { title: '증빙', keys: ['onsite', 'consent', 'devices'] },
  { title: '원장', keys: ['ledger'] },
]
const WS_STORE = 'activity.ws.v1'
const MAX_TABS = 10
const DEFAULT_WS: Ws = { tabs: [{ id: 'daily', kind: 'daily' }], active: 'daily', st: {} }

function isTab(x: unknown): x is Tab {
  if (!x || typeof x !== 'object') return false
  const t = x as Tab
  return typeof t.id === 'string' && typeof t.kind === 'string' && (t.kind in FIXED || t.kind === 'user' || t.kind === 'school')
}
function loadWs(): Ws {
  try {
    const raw = localStorage.getItem(WS_STORE)
    if (raw) {
      const d = JSON.parse(raw) as Partial<Ws>
      const tabs = (Array.isArray(d.tabs) ? d.tabs : []).filter(isTab)
      if (tabs.length) {
        const active = tabs.some((t) => t.id === d.active) ? (d.active as string) : tabs[0].id
        return { tabs, active, st: d.st && typeof d.st === 'object' ? d.st : {} }
      }
    }
  } catch { /* 저장소 미지원 — 기본 탭 */ }
  return { ...DEFAULT_WS, tabs: [...DEFAULT_WS.tabs] }
}

// 드릴다운 요청 → 탭 + 그 탭의 필터 패치
function reqToTab(req: OpenReq): { tab: Tab; patch: St } {
  switch (req.kind) {
    case 'daily': return { tab: { id: 'daily', kind: 'daily' }, patch: req.date ? { date: req.date } : {} }
    case 'week': return { tab: { id: 'week', kind: 'week' }, patch: req.anchor ? { anchor: req.anchor } : {} }
    case 'month': return { tab: { id: 'month', kind: 'month' }, patch: req.ym ? { ym: req.ym } : {} }
    case 'ledger': {
      const patch: St = {}
      if (req.date) { patch.from = req.date; patch.to = req.date }
      if (req.user !== undefined) patch.user = req.user
      if (req.school !== undefined) patch.school = req.school
      return { tab: { id: 'ledger', kind: 'ledger' }, patch }
    }
    case 'user': return { tab: { id: 'user:' + req.login_id, kind: 'user', p: { login_id: req.login_id, name: req.name } }, patch: req.date ? { date: req.date } : {} }
    case 'school': return { tab: { id: 'school:' + req.school_id, kind: 'school', p: { school_id: req.school_id, school_name: req.school_name } }, patch: {} }
    default: return { tab: { id: req.kind, kind: req.kind }, patch: {} }
  }
}

type Me = { role: string }

export function Activity() {
  // ── 접근 제한: 관리자 역할 확인(AppShell 과 같은 /auth/me) ──
  const [me, setMe] = useState<Me | null | 'denied'>(null)
  useEffect(() => {
    let alive = true
    api<Me>('/auth/me')
      .then((d) => { if (alive) setMe(isAdminRole(d?.role) ? { role: d.role } : 'denied') })
      .catch(() => { if (alive) setMe('denied') })
    return () => { alive = false }
  }, [])

  // ── 워크스페이스 상태 ──
  const [ws, setWs] = useState<Ws>(loadWs)
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(WS_STORE, JSON.stringify(ws)) } catch { /* 무시 */ }
  }, [ws])

  const openReq = useCallback((req: OpenReq) => {
    const { tab, patch } = reqToTab(req)
    setWs((w) => {
      let tabs = w.tabs.some((t) => t.id === tab.id) ? w.tabs.map((t) => (t.id === tab.id ? { ...t, p: tab.p ?? t.p } : t)) : [...w.tabs, tab]
      // 10개 초과 → 가장 오래된(앞쪽) 비활성 탭부터 닫음(새로 연 탭은 제외)
      const st = { ...w.st, [tab.id]: { ...(w.st[tab.id] || {}), ...patch } }
      while (tabs.length > MAX_TABS) {
        const victim = tabs.find((t) => t.id !== tab.id)
        if (!victim) break
        tabs = tabs.filter((t) => t !== victim)
        if (victim.kind === 'user' || victim.kind === 'school') delete st[victim.id]
      }
      return { tabs, active: tab.id, st }
    })
    setAddOpen(false)
  }, [])
  const openFixed = (k: FixedKind) => openReq({ kind: k } as OpenReq)

  function closeTab(id: string) {
    setWs((w) => {
      const i = w.tabs.findIndex((t) => t.id === id)
      if (i < 0) return w
      const victim = w.tabs[i]
      const tabs = w.tabs.filter((t) => t.id !== id)
      const st = { ...w.st }
      if (victim.kind === 'user' || victim.kind === 'school') delete st[id]   // 고정 탭 필터는 다시 열 때 복원되도록 유지
      const active = w.active !== id ? w.active : (tabs[Math.max(0, i - 1)]?.id ?? null)
      return { tabs, active, st }
    })
  }
  const setStFor = useCallback((id: string) => (patch: St) => setWs((w) => ({ ...w, st: { ...w.st, [id]: { ...(w.st[id] || {}), ...patch } } })), [])

  const active = ws.tabs.find((t) => t.id === ws.active) ?? null
  const instTabs = useMemo(() => ws.tabs.filter((t) => t.kind === 'user' || t.kind === 'school'), [ws.tabs])

  function tabLabel(t: Tab): string {
    if (t.kind === 'user') return `${t.p?.name || t.p?.login_id} · ${fmtMD(ws.st[t.id]?.date || todayKst())}`
    if (t.kind === 'school') return t.p?.school_name || t.p?.school_id || '학교'
    return FIXED[t.kind].label
  }
  function tabIcon(t: Tab): LucideIcon {
    if (t.kind === 'user') return UserRoundCheck
    if (t.kind === 'school') return School
    return FIXED[t.kind].Icon
  }
  function renderPanel(t: Tab) {
    const props = { st: ws.st[t.id] || {}, setSt: setStFor(t.id), open: openReq }
    switch (t.kind) {
      case 'daily': return <DailyPanel {...props} />
      case 'week': return <WeekPanel {...props} />
      case 'month': return <MonthPanel {...props} />
      case 'users': return <UsersPanel {...props} />
      case 'schools': return <SchoolsPanel {...props} />
      case 'onsite': return <OnsitePanel {...props} />
      case 'consent': return <ConsentPanel {...props} />
      case 'devices': return <DevicesPanel {...props} />
      case 'ledger': return <LedgerPanel {...props} />
      case 'user': return <UserPanel {...props} login_id={t.p?.login_id || ''} name={t.p?.name || t.p?.login_id || ''} />
      case 'school': return <SchoolPanel {...props} school_id={t.p?.school_id || ''} school_name={t.p?.school_name || ''} />
    }
  }

  return (
    <div className="page rv act-page">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>활동 현황</b></div>
      <div className="bar">
        <h2><Footprints size={22} strokeWidth={2.2} /> 활동 현황</h2>
        <span className="pillx warn"><ShieldAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />관리자 전용</span>
        <div className="sp" />
        <span className="muted" style={{ fontSize: 12 }}>왼쪽 기능을 열면 위에 탭으로 쌓이고, × 또는 더블클릭으로 닫습니다</span>
      </div>
      <p className="act-sub">
        현장 앱의 활동 기록(앱 실행 · 학교 선택 · 점검표 열기 · 저장 · 교육청 전송 요청 등)을 모아, <b>점검 증빙(현장 작성 여부)</b>과
        <b> 근무 기록 참고(마지막 업무가 언제 끝났는지)</b>로 확인합니다. 본사 관리자(경영진·본사 관리자)만 볼 수 있습니다.
      </p>

      {me === null && <div className="act-card act-msg spin"><Info size={14} /> 권한 확인 중…</div>}
      {me === 'denied' && (
        <div className="act-card act-denied">
          <Lock size={34} strokeWidth={1.6} />
          <b>관리자만 볼 수 있습니다</b>
          <span>이 화면은 경영진·본사 관리자 권한(executive · hq_admin) 계정에서만 열립니다.</span>
          <Link to="/" className="btn btn-ghost" style={{ marginTop: 6 }}>홈으로</Link>
        </div>
      )}

      {me !== null && me !== 'denied' && (
        <div className="bws act-ws">
          {/* ── 좌측 카테고리(Billing 과 동일한 bws-side 패턴) ── */}
          <aside className="bws-side">
            <div className="bws-side-h"><Footprints size={14} /> 활동 현황 · 증빙</div>
            {MENU.map((g) => (
              <div key={g.title} className="bws-group">
                <div className="bws-group-t">{g.title}</div>
                {g.keys.map((k) => {
                  const isOpen = ws.tabs.some((t) => t.id === k)
                  const { Icon, label, desc } = FIXED[k]
                  return (
                    <button key={k} type="button" className={'bws-item' + (isOpen ? ' open' : '') + (ws.active === k ? ' active' : '')} onClick={() => openFixed(k)} title={desc}>
                      <Icon size={14} strokeWidth={2} /> {label}
                      {isOpen && ws.active !== k && <span className="dot" />}
                    </button>
                  )
                })}
              </div>
            ))}
            {instTabs.length > 0 && (
              <div className="bws-group">
                <div className="bws-group-t">열린 사용자·학교</div>
                {instTabs.map((t) => {
                  const Icon = tabIcon(t)
                  return (
                    <button key={t.id} type="button" className={'bws-item open' + (ws.active === t.id ? ' active' : '')} onClick={() => setWs((w) => ({ ...w, active: t.id }))} title={tabLabel(t)}>
                      <Icon size={14} strokeWidth={2} /> <span className="act-ellip">{tabLabel(t)}</span>
                      <span role="button" className="act-sidex" title="닫기" onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}><X size={11} /></span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="bws-group">
              <div className="bws-group-t">도움말</div>
              <div className="muted" style={{ padding: '4px 14px', fontSize: 11.5, lineHeight: 1.7 }}>
                <HelpCircle size={12} style={{ verticalAlign: '-2px' }} /> 표의 행이나 이름을 누르면 사용자·학교 탭이 열립니다. 열어 둔 탭과 필터는 다음 접속 때 그대로 복원됩니다(최대 {MAX_TABS}개).
              </div>
            </div>
          </aside>

          {/* ── 우측: 누적 탭 + 화면 ── */}
          <div className="bws-main">
            <div className="bws-tabs">
              {ws.tabs.map((t) => {
                const Icon = tabIcon(t)
                return (
                  <button key={t.id} type="button" className={'bws-tab' + (ws.active === t.id ? ' active' : '')} onClick={() => setWs((w) => ({ ...w, active: t.id }))} onDoubleClick={() => closeTab(t.id)} title={tabLabel(t) + ' (더블클릭으로 닫기)'}>
                    <Icon size={13} strokeWidth={2.2} />
                    <span className="act-ellip">{tabLabel(t)}</span>
                    <span role="button" className="x" title="탭 닫기" onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}><X size={12} /></span>
                  </button>
                )
              })}
              <div style={{ position: 'relative' }}>
                <button type="button" className="bws-tab-add" title="기능 열기" onClick={() => setAddOpen((o) => !o)}><Plus size={15} /></button>
                {addOpen && (
                  <div className="bws-addmenu" onMouseLeave={() => setAddOpen(false)}>
                    {MENU.map((g) => (
                      <div key={g.title}>
                        <div className="t">{g.title}</div>
                        {g.keys.map((k) => <button key={k} type="button" onClick={() => openFixed(k)}>{FIXED[k].label}</button>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bws-body">
              {active ? renderPanel(active) : (
                <div className="bws-empty">
                  열린 기능이 없습니다.<br />왼쪽 카테고리나 위의 <b>+</b> 로 기능을 열면 탭으로 쌓입니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="act-foot">
        <Info size={14} />
        <span>
          기기 작성 시각 기준(오프라인 저장분은 서버 수신 시각과 다를 수 있음) · 위치는 동의한 사용자만, 저장·제출 시점에 1회 기록 ·
          근태 판정 근거가 아닌 참고용입니다.
        </span>
      </div>
    </div>
  )
}
