import { useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  type LucideIcon,
  BellRing,
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
import { Accounts } from './Accounts'
import ConsoleOverview from '../features/console/ConsoleOverview'
import ConsoleApp from '../features/console/ConsoleApp'
import ConsoleContent from '../features/console/ConsoleContent'
import ConsolePopup from '../features/console/ConsolePopup'
import ConsoleSystem from '../features/console/ConsoleSystem'
import ConsoleEduoffice from '../features/console/ConsoleEduoffice'
import ConsoleSchedule from '../features/console/ConsoleSchedule'
import ConsoleStaffHistory from '../features/console/ConsoleStaffHistory'
import '../styles/console.css'

// ── 경영 대시보드 = 회사 관리자 콘솔 ──
// 본사 관리 기능(경영 현황·청구·계정·현장 앱·홈페이지 콘텐츠·시스템)을 탭 하나로 통합.
// 기존 /ops·/billing·/accounts·/sessions 라우트는 딥링크 호환을 위해 유지되며,
// 이 콘솔이 회사 관리자(hq_admin·executive)의 기본 진입점이다. ?tab= 쿼리로 딥링크 가능.

type TabKey = 'overview' | 'billing' | 'accounts' | 'history' | 'schedule' | 'app' | 'eduoffice' | 'content' | 'popup' | 'system'

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'overview', label: '경영 현황', Icon: LayoutDashboard },
  { key: 'billing', label: '청구·정산', Icon: Receipt },
  { key: 'accounts', label: '계정·권한', Icon: Users },
  { key: 'history', label: '직원 이력', Icon: ScrollText },
  { key: 'schedule', label: '근무 종합관리표', Icon: CalendarRange },
  { key: 'app', label: '현장 앱 관리', Icon: TabletSmartphone },
  { key: 'eduoffice', label: '교육청 전송', Icon: CloudUpload },
  { key: 'content', label: '홈페이지·콘텐츠', Icon: Globe },
  { key: 'popup', label: '팝업 공지', Icon: BellRing },
  { key: 'system', label: '시스템', Icon: Settings2 },
]

const TAB_KEYS = TABS.map((t) => t.key) as string[]

// 11-17 메뉴 재구성: 탭 줄 대신 사이드바 메뉴로 바로 진입 — 화면 제목·경로 표시용 (그룹, 메뉴 이름)
const TAB_META: Record<TabKey, { group: string; label: string }> = {
  overview: { group: '운영', label: '경영 현황' },
  billing: { group: '운영', label: '세금계산서' },
  content: { group: '운영', label: '홈페이지 콘텐츠' },
  history: { group: '인사·근무', label: '직원 이력' },
  schedule: { group: '인사·근무', label: '근무 종합관리표' },
  app: { group: '시스템 관리', label: '현장 앱 관리' },
  eduoffice: { group: '시스템 관리', label: '교육청 전송' },
  system: { group: '시스템 관리', label: '시스템' },
  accounts: { group: '시스템 관리', label: '계정·권한' },
  popup: { group: '시스템 관리', label: '팝업 공지' },
}

export function Dashboard() {
  const [sp, setSp] = useSearchParams()

  const tab: TabKey = useMemo(() => {
    const t = sp.get('tab') ?? 'overview'
    return (TAB_KEYS.includes(t) ? t : 'overview') as TabKey
  }, [sp])

  // 예전 '청구·정산' 탭 주소는 세금계산서 메뉴로(같은 화면)
  if (tab === 'billing') return <Navigate to="/billing" replace />
  const meta = TAB_META[tab]

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / {meta.group} / <b>{meta.label}</b></div>
      <div className="bar">
        <h2>{meta.label}</h2>
        <span className="pillx warn">
          <ShieldAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />관리자 전용
        </span>
      </div>

      {tab === 'overview' && <ConsoleOverview />}
      {tab === 'accounts' && <div className="console-embed"><Accounts embedded /></div>}
      {tab === 'history' && <ConsoleStaffHistory />}
      {tab === 'schedule' && <ConsoleSchedule />}
      {tab === 'app' && <ConsoleApp />}
      {tab === 'eduoffice' && <ConsoleEduoffice />}
      {tab === 'content' && <ConsoleContent />}
      {tab === 'popup' && <ConsolePopup />}
      {tab === 'system' && <ConsoleSystem />}
    </div>
  )
}
