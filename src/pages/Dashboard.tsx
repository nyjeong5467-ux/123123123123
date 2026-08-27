import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  type LucideIcon,
  CalendarRange,
  CloudUpload,
  Globe,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings2,
  ShieldAlert,
  TabletSmartphone,
  Users,
} from 'lucide-react'
import { Billing } from './Billing'
import { Accounts } from './Accounts'
import ConsoleOverview from '../features/console/ConsoleOverview'
import ConsoleApp from '../features/console/ConsoleApp'
import ConsoleContent from '../features/console/ConsoleContent'
import ConsoleSystem from '../features/console/ConsoleSystem'
import ConsoleEduoffice from '../features/console/ConsoleEduoffice'
import ConsoleSchedule from '../features/console/ConsoleSchedule'
import ConsoleStaffHistory from '../features/console/ConsoleStaffHistory'
import '../styles/console.css'

// ── 경영 대시보드 = 회사 관리자 콘솔 ──
// 본사 관리 기능(경영 현황·청구·계정·현장 앱·홈페이지 콘텐츠·시스템)을 탭 하나로 통합.
// 기존 /ops·/billing·/accounts·/sessions 라우트는 딥링크 호환을 위해 유지되며,
// 이 콘솔이 회사 관리자(hq_admin·executive)의 기본 진입점이다. ?tab= 쿼리로 딥링크 가능.

type TabKey = 'overview' | 'billing' | 'accounts' | 'history' | 'schedule' | 'app' | 'eduoffice' | 'content' | 'system'

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
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

const TAB_KEYS = TABS.map((t) => t.key) as string[]

export function Dashboard() {
  const [sp, setSp] = useSearchParams()

  const tab: TabKey = useMemo(() => {
    const t = sp.get('tab') ?? 'overview'
    return (TAB_KEYS.includes(t) ? t : 'overview') as TabKey
  }, [sp])

  function switchTab(next: TabKey) {
    setSp(next === 'overview' ? {} : { tab: next }, { replace: false })
  }

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>경영 대시보드</b></div>
      <div className="bar">
        <h2>경영 대시보드</h2>
        <span className="pillx warn">
          <ShieldAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />관리자 전용
        </span>
        <div className="sp" />
        <span className="muted" style={{ fontSize: 12.5 }}>
          회사 관리자 콘솔 — 경영·관리 기능 통합
        </span>
      </div>

      <div className="console-tabs">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={'console-tab' + (tab === key ? ' active' : '')}
            onClick={() => switchTab(key)}
          >
            <Icon size={15} strokeWidth={2} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <ConsoleOverview />}
      {tab === 'billing' && <div className="console-embed"><Billing embedded /></div>}
      {tab === 'accounts' && <div className="console-embed"><Accounts embedded /></div>}
      {tab === 'history' && <ConsoleStaffHistory />}
      {tab === 'schedule' && <ConsoleSchedule />}
      {tab === 'app' && <ConsoleApp />}
      {tab === 'eduoffice' && <ConsoleEduoffice />}
      {tab === 'content' && <ConsoleContent />}
      {tab === 'system' && <ConsoleSystem />}
    </div>
  )
}
