import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  type LucideIcon,
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FolderOpen,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Siren,
  Sun,
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
    ],
  },
  {
    title: '본사',
    items: [
      { Icon: LayoutDashboard, label: '경영 대시보드', to: '/ledger', module: 'ledger' },
      { Icon: BarChart3, label: '종합관리', to: '/ops', module: 'ops' },
      { Icon: Receipt, label: '세금계산서 발행', to: '/billing', module: 'billing' },
      { Icon: FolderOpen, label: '자료실', to: '/resources', module: 'resources' },
      { Icon: KeyRound, label: '세션코드 발급', to: '/sessions', module: 'sessions' },
      { Icon: Mail, label: '메일함', to: '/mail', hqOnly: true },
    ],
  },
  {
    title: '시스템',
    items: [
      { Icon: Users, label: '계정 관리', to: '/accounts', hqOnly: true },
      { Icon: Settings, label: '설정', to: '/settings' },
    ],
  },
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
  const [notifOpen, setNotifOpen] = useState(false)
  const [profOpen, setProfOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])

  // 로그인 사용자 프로필(역할·모듈 권한) — 사이드바 메뉴 게이팅
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    let alive = true
    api<Me>('/auth/me')
      .then((d) => { if (alive) setMe({ role: d.role, modules: Array.isArray(d.modules) ? d.modules : [] }) })
      .catch(() => { if (alive) setMe({ role: 'hq_admin', modules: [] }) })  // 조회 실패 시 전체 표시(구버전 호환)
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
            <ShieldCheck size={23} strokeWidth={2.2} />
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
                {items.map(({ Icon, label, to, end, sub }) => (
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
                ))}
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
