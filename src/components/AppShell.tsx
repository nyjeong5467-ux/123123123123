import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  type LucideIcon,
  Activity,
  Bell,
  BellRing,
  Building2,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  FileCheck2,
  FolderOpen,
  Footprints,
  Globe,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Receipt,
  ReceiptText,
  Scale,
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
  Icon: LucideIcon; label: string; to: string; end?: boolean
  module?: string    // 계정별 모듈 권한 키(미지정=항상 표시)
  hqOnly?: boolean   // 본사 관리자/경영진 전용 메뉴
  kids?: NavItem[]   // 하위 메뉴(학교 → 5대 업무, 자료실 → 산업재해·법령 검색)
}

// 11-17 메뉴 재구성: 업무(전원) · 운영 · 인사·근무 · 시스템 관리(관리자 전용).
// 경영 대시보드의 탭 줄 대신 각 탭이 사이드바 메뉴로 바로 연결된다(/ledger?tab= 주소는 그대로 유지).
const NAV_GROUPS: { title: string; hqOnly?: boolean; items: NavItem[] }[] = [
  {
    title: '업무',
    items: [
      { Icon: Building2, label: '학교', to: '/schools', kids: [
        { Icon: ClipboardCheck, label: '안전점검', to: '/inspection', module: 'inspection' },
        { Icon: TriangleAlert, label: '위험성평가', to: '/risk', module: 'risk' },
        { Icon: Activity, label: '근골격계', to: '/musculo', module: 'musculo' },
        { Icon: GraduationCap, label: '교육 진도표', to: '/education', module: 'education' },
        { Icon: FileCheck2, label: '이행점검', to: '/compliance', module: 'compliance' },
      ] },
      { Icon: FolderOpen, label: '자료실', to: '/resources', module: 'resources', kids: [
        { Icon: Siren, label: '산업재해', to: '/accidents', module: 'accidents' },
        { Icon: Scale, label: '법령 검색', to: '/law' },
      ] },
      { Icon: Mail, label: '메일함', to: '/mail', hqOnly: true },
    ],
  },
  {
    title: '운영', hqOnly: true,
    items: [
      { Icon: LayoutDashboard, label: '경영 현황', to: '/ledger' },
      { Icon: ReceiptText, label: '세금계산서', to: '/billing' },
      { Icon: Globe, label: '홈페이지 콘텐츠', to: '/ledger?tab=content' },
    ],
  },
  {
    title: '인사·근무', hqOnly: true,
    items: [
      { Icon: ScrollText, label: '직원 이력', to: '/ledger?tab=history' },
      { Icon: CalendarRange, label: '근무 종합관리표', to: '/ledger?tab=schedule' },
      { Icon: Footprints, label: '활동 현황', to: '/activity' },
    ],
  },
  {
    title: '시스템 관리', hqOnly: true,
    items: [
      { Icon: TabletSmartphone, label: '현장 앱 관리', to: '/ledger?tab=app' },
      { Icon: CloudUpload, label: '교육청 전송', to: '/ledger?tab=eduoffice' },
      { Icon: Settings2, label: '시스템', to: '/ledger?tab=system' },
      { Icon: Users, label: '계정·권한', to: '/ledger?tab=accounts' },
      { Icon: BellRing, label: '팝업 공지', to: '/ledger?tab=popup' },
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
  const loc = useLocation()

  // 그룹(업무·운영·인사·근무·시스템 관리) 접기/펼치기 — 계정 브라우저에 기억
  const [closedGroups, setClosedGroups] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sb-groups-closed') || '[]') } catch { return [] }
  })
  function toggleGroup(title: string) {
    setClosedGroups((cur) => {
      const next = cur.includes(title) ? cur.filter((t) => t !== title) : [...cur, title]
      try { localStorage.setItem('sb-groups-closed', JSON.stringify(next)) } catch { /* 무시 */ }
      return next
    })
  }
  // 쿼리(?tab=)까지 비교하는 활성 판정 — /ledger?tab=… 메뉴가 서로 겹쳐 켜지지 않게
  const curTab = loc.pathname === '/ledger' ? (new URLSearchParams(loc.search).get('tab') ?? 'overview') : ''
  function isActive(to: string, end?: boolean): boolean {
    const [path, q] = to.split('?')
    if (path === '/ledger') {
      const t = q ? new URLSearchParams(q).get('tab') : 'overview'
      return loc.pathname === '/ledger' && curTab === t
    }
    if (end) return loc.pathname === path
    return loc.pathname === path || loc.pathname.startsWith(path + '/')
  }
  function renderItem(it: NavItem, sub = false): ReactNode {
    const active = isActive(it.to, it.end)
    const kids = (it.kids ?? []).filter((k) => navVisible(k, me))
    return (
      <div key={it.label} style={{ display: 'contents' }}>
        <Link to={it.to} className={'sbi' + (sub ? ' sub' : '') + (active ? ' active' : '')}
          aria-current={active ? 'page' : undefined} title={it.label}>
          <it.Icon size={sub ? 17 : 19} strokeWidth={1.9} />
          <span>{it.label}</span>
        </Link>
        {kids.map((k) => renderItem(k, true))}
      </div>
    )
  }

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
        <nav className="sbnav">{renderItem({ Icon: Home, label: '홈', to: '/', end: true })}</nav>
        {NAV_GROUPS.map((grp) => {
          if (grp.hqOnly && !(me && HQ_ROLES.includes(me.role))) return null
          // 상위가 권한 밖이어도 볼 수 있는 하위 메뉴는 그대로 꺼내 보여 준다(예: 자료실 없이 산업재해만 허용)
          const items: NavItem[] = []
          for (const it of grp.items) {
            if (navVisible(it, me)) items.push(it)
            else for (const k of it.kids ?? []) if (navVisible(k, me)) items.push(k)
          }
          if (items.length === 0) return null
          const closed = closedGroups.includes(grp.title)
          return (
            <div key={grp.title}>
              <button type="button" className={'sb-grp-title sb-grp-btn' + (closed ? ' closed' : '')}
                onClick={() => toggleGroup(grp.title)} aria-expanded={!closed}
                title={closed ? '펼치기' : '접기'}>
                <span>{grp.title}</span>
                <ChevronDown size={13} strokeWidth={2.4} />
              </button>
              {!closed && <nav className="sbnav">{items.map((it) => renderItem(it))}</nav>}
            </div>
          )
        })}
        <div className="sb-sp" />
        <div className="sbnav sb-bottom">
          {renderItem({ Icon: Settings, label: '설정', to: '/settings' })}
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
            placeholder="학교·점검자·업무 검색"
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
