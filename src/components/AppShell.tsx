import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  type LucideIcon,
  Activity,
  Bell,
  Building2,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  FileCheck2,
  FolderOpen,
  Globe,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Receipt,
  ReceiptText,
  ScrollText,
  Search,
  Settings,
  Settings2,
  Siren,
  Sun,
  TabletSmartphone,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

type SchoolLite = { id: string; name: string; address?: string }

type Alert = { kind: string; school_id: string; school_name: string; message: string }

const KIND_ACCENT: Record<string, string> = {
  headcount: 'var(--amber)',
  accident: 'var(--red)',
  omr_review: 'var(--violet)',
}

type NavItem = {
  Icon: LucideIcon; label: string; to: string; end?: boolean; sub?: boolean
  module?: string    // 계정별 모듈 권한 키(미지정=항상 표시)
  hqOnly?: boolean   // 본사 관리자/경영진 전용 메뉴
}

// 위계: 업무(홈/학교+5대 업무 서브/산업재해) · 본사 · 시스템 — 0709 회의 반영
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '업무',
    items: [
      { Icon: Home, label: '홈', to: '/', end: true },
      { Icon: Building2, label: '학교', to: '/schools' },
      { Icon: ClipboardCheck, label: '안전점검', to: '/inspection', sub: true, module: 'inspection' },
      { Icon: TriangleAlert, label: '위험성평가', to: '/risk', sub: true, module: 'risk' },
      { Icon: Activity, label: '근골격계', to: '/musculo', sub: true, module: 'musculo' },
      { Icon: GraduationCap, label: '교육 진도표', to: '/education', sub: true, module: 'education' },
      { Icon: FileCheck2, label: '이행점검', to: '/compliance', sub: true, module: 'compliance' },
      { Icon: Siren, label: '산업재해', to: '/accidents', module: 'accidents' },
      { Icon: ReceiptText, label: '세금계산서', to: '/billing', module: 'billing' },
      // 세션코드 발급 nav 숨김(2026-09-18) — 조사원 앱 로그인 전환. 비상용은 /sessions 직접 접근.
      { Icon: FolderOpen, label: '자료실', to: '/resources', module: 'resources' },
    ],
  },
  {
    // 본사 관리 기능은 경영 대시보드(회사 관리자 콘솔) 한 곳으로 통합 —
    // 종합관리·세금계산서·세션코드·계정 등은 콘솔 탭으로 이동(기존 라우트는 딥링크 호환 유지).
    title: '본사',
    items: [
      { Icon: LayoutDashboard, label: '경영 대시보드', to: '/ledger', hqOnly: true },
      { Icon: Mail, label: '메일함', to: '/mail', hqOnly: true },
    ],
  },
  {
    title: '시스템',
    items: [
      { Icon: Settings, label: '설정', to: '/settings' },
    ],
  },
]

// 경영 대시보드(회사 관리자 콘솔) 하위 탭 — 학교의 5대 업무 서브메뉴처럼 사이드바에 나열.
// Dashboard.tsx의 TABS와 key·label을 맞춘다(?tab= 딥링크).
const CONSOLE_SUBS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'overview', label: '경영 현황', Icon: LayoutDashboard },
  { key: 'billing', label: '청구·정산', Icon: Receipt },
  { key: 'accounts', label: '계정·권한', Icon: Users },
  { key: 'history', label: '직원 이력', Icon: ScrollText },
  { key: 'schedule', label: '근무 종합관리표', Icon: CalendarRange },
  { key: 'app', label: '현장 앱 관리', Icon: TabletSmartphone },
  { key: 'eduoffice', label: '교육청 전송', Icon: CloudUpload },
  { key: 'content', label: '홈페이지·콘텐츠', Icon: Globe },
  { key: 'system', label: '시스템', Icon: Settings2 },
]

type Me = { role: string; modules: string[] }
const HQ_ROLES = ['hq_admin', 'executive']

// 모듈 권한 게이팅: modules 비면 전체 허용, hqOnly는 본사 역할만
function navVisible(item: NavItem, me: Me | null): boolean {
  if (me === null) return !item.hqOnly   // 프로필 로드 전엔 일반 메뉴만
  if (item.hqOnly && !HQ_ROLES.includes(me.role)) return false
  if (item.module && me.modules.length > 0 && !me.modules.includes(item.module)) return false
  return true
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme()
  const { logout, user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()

  // 경영 대시보드 하위 탭 메뉴 접기/펼치기(기본 펼침, localStorage 유지)
  const [consoleOpen, setConsoleOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('sb-console-open') !== '0' } catch { return true }
  })
  function toggleConsole(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setConsoleOpen((o) => {
      try { localStorage.setItem('sb-console-open', o ? '0' : '1') } catch { /* 무시 */ }
      return !o
    })
  }
  const onLedger = loc.pathname === '/ledger'
  const ledgerTab = new URLSearchParams(loc.search).get('tab') ?? 'overview'

  const [notifOpen, setNotifOpen] = useState(false)
  const [profOpen, setProfOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])

  // 로그인 사용자 프로필(역할·모듈 권한) — 사이드바 메뉴 게이팅
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    let alive = true
    let tries = 0
    const load = () => {
      api<Me>('/auth/me')
        .then((d) => { if (alive) setMe({ role: d.role, modules: Array.isArray(d.modules) ? d.modules : [] }) })
        .catch(() => {
          if (!alive) return
          if (tries++ < 2) { setTimeout(load, 800); return }   // 일시 오류 재시도
          // 최종 실패 시 최소권한으로 폴백 — 강등된 계정이 관리자 메뉴(경영 대시보드)를
          // 순간적으로 보게 되던 버그 방지(과거엔 hq_admin 으로 폴백했음).
          setMe({ role: 'field_inspector', modules: [] })
        })
    }
    load()
    return () => { alive = false }
  }, [])

  const [schools, setSchools] = useState<SchoolLite[]>([])
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    api<SchoolLite[]>('/schools')
      .then((data) => {
        if (alive) setSchools(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (alive) setSchools([])
      })
    return () => {
      alive = false
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])

  useEffect(() => {
    let alive = true
    api<Alert[]>('/ops/alerts')
      .then((data) => {
        if (alive) setAlerts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (alive) setAlerts([])
      })
    return () => {
      alive = false
    }
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, schools])

  const showResults = searchFocused && query.trim().length > 0

  // 로그인한 본사 관리자 표시(데모 admin → 관리자).
  const profileName = user ? (user.login === 'admin' ? '관리자' : user.login) : '관리자'

  function pickSchool(id: string) {
    nav('/schools/' + id)
    setQuery('')
    setSearchFocused(false)
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <NavLink to="/" className="logo">
          <span className="lg-ic">
            <img src="/woori-mark.png" alt="WOORI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </span>
          <span>
            <span className="lg-org" style={{ display: 'block' }}>한국산업안전협회</span>
            <span className="lg-name" style={{ display: 'block' }}>안전보건 통합 플랫폼</span>
          </span>
        </NavLink>
        {NAV_GROUPS.map((grp) => {
          const items = grp.items.filter((it) => navVisible(it, me))
          if (items.length === 0) return null
          return (
            <div key={grp.title}>
              <div className="sb-grp-title">{grp.title}</div>
              <nav className="sbnav">
                {items.map(({ Icon, label, to, end, sub }) => {
                  // 경영 대시보드: 학교의 5대 업무처럼 하위 탭을 나열하고, 셰브론으로 접기/펼치기
                  if (to === '/ledger') {
                    // NavLink는 경로만 보고 ?tab= 8개 링크를 전부 active 처리하므로
                    // 쿼리 탭 링크는 Link + 수동 active 클래스로 구성한다.
                    return (
                      <div key={label} style={{ display: 'contents' }}>
                        <Link
                          to={to}
                          className={'sbi' + (onLedger && !consoleOpen ? ' active' : '')}
                          title={label}
                        >
                          <Icon size={19} strokeWidth={1.9} />
                          <span>{label}</span>
                          <button
                            className={'sb-caret' + (consoleOpen ? '' : ' closed')}
                            onClick={toggleConsole}
                            title={consoleOpen ? '하위 메뉴 접기' : '하위 메뉴 펼치기'}
                            aria-label={consoleOpen ? '하위 메뉴 접기' : '하위 메뉴 펼치기'}
                          >
                            <ChevronDown size={15} strokeWidth={2.2} />
                          </button>
                        </Link>
                        {consoleOpen && CONSOLE_SUBS.map(({ key, label: sl, Icon: SIcon }) => (
                          <Link
                            key={key}
                            to={key === 'overview' ? '/ledger' : '/ledger?tab=' + key}
                            className={'sbi sub' + (onLedger && ledgerTab === key ? ' active' : '')}
                            aria-current={onLedger && ledgerTab === key ? 'page' : undefined}
                            title={sl}
                          >
                            <SIcon size={17} strokeWidth={1.9} />
                            <span>{sl}</span>
                          </Link>
                        ))}
                      </div>
                    )
                  }
                  return (
                    <NavLink
                      key={label}
                      to={to}
                      end={end}
                      className={({ isActive }) => 'sbi' + (sub ? ' sub' : '') + (isActive ? ' active' : '')}
                      title={label}
                    >
                      <Icon size={sub ? 17 : 19} strokeWidth={1.9} />
                      <span>{label}</span>
                    </NavLink>
                  )
                })}
              </nav>
            </div>
          )
        })}
        <div className="sb-sp" />
        <div className="sbnav">
          <div className="sbi" onClick={() => { logout(); nav('/login') }}>
            <LogOut size={19} strokeWidth={1.9} />
            <span>로그아웃</span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="search">
          <Search size={18} strokeWidth={2} />
          <input
            placeholder="학교·조사원·업무 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current)
              setSearchFocused(true)
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setSearchFocused(false), 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchFocused(false)
                e.currentTarget.blur()
              }
            }}
          />
          {showResults && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                boxShadow: 'var(--sh-pop)',
                maxHeight: 360,
                overflowY: 'auto',
                padding: 6,
                zIndex: 90,
              }}
            >
              {matches.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>
                  검색 결과 없음
                </div>
              ) : (
                matches.map((s) => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSchool(s.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--violet-soft)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: 'transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                    {s.address && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.address}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="sp" />
        <button className="tact" onClick={toggle} title="테마 전환" aria-label="테마 전환">
          {theme === 'light' ? <Moon size={20} strokeWidth={1.9} /> : <Sun size={20} strokeWidth={1.9} />}
        </button>
        <button className="tact" onClick={() => nav('/settings')} title="설정" aria-label="설정">
          <Settings size={20} strokeWidth={1.9} />
        </button>
        <div className="notif-wrap">
          <button className="tact" onClick={() => setNotifOpen((v) => !v)} title="알림" aria-label="알림">
            {alerts.length > 0 && <span className="dot" />}
            <Bell size={20} strokeWidth={1.9} />
          </button>
          {notifOpen && (
            <div className="notif">
              <div className="nh">
                <b>알림</b>
                {alerts.length > 0 && <span>새 알림 {alerts.length}</span>}
              </div>
              {alerts.length === 0 ? (
                <div className="ni" style={{ color: 'var(--muted)', fontSize: 12.5 }}>새 알림이 없습니다</div>
              ) : (
                alerts.map((a, i) => (
                  <div
                    key={a.school_id + ':' + a.kind + ':' + i}
                    className="ni"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      nav('/schools/' + a.school_id)
                      setNotifOpen(false)
                    }}
                    style={{
                      cursor: 'pointer',
                      borderLeft: '3px solid ' + (KIND_ACCENT[a.kind] || 'var(--line)'),
                    }}
                  >
                    <div>
                      <div className="t">{a.school_name}</div>
                      <div className="s">{a.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="notif-wrap">
          <div
            className="prof"
            onClick={() => setProfOpen((v) => !v)}
            style={{ cursor: 'pointer' }}
          >
            <div className="av">{profileName.slice(0, 1)}</div>
            <div className="nm">{profileName}</div>
            <ChevronDown size={16} strokeWidth={2.2} />
          </div>
          {profOpen && (
            <div className="notif">
              <div
                className="ni"
                role="button"
                tabIndex={0}
                onClick={() => {
                  nav('/mypage')
                  setProfOpen(false)
                }}
                style={{ cursor: 'pointer' }}
              >
                마이페이지
              </div>
              <div
                className="ni"
                role="button"
                tabIndex={0}
                onClick={() => {
                  nav('/settings')
                  setProfOpen(false)
                }}
                style={{ cursor: 'pointer' }}
              >
                설정
              </div>
              <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
              <div
                className="ni"
                role="button"
                tabIndex={0}
                onClick={() => {
                  logout()
                  nav('/login')
                  setProfOpen(false)
                }}
                style={{ cursor: 'pointer' }}
              >
                로그아웃
              </div>
            </div>
          )}
        </div>
      </header>

      {children}
    </div>
  )
}
