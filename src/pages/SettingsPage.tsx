import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronsDownUp, ChevronsUpDown, Eraser, Eye, FolderTree, Inbox,
  SlidersHorizontal, Moon, Sun, Monitor, Mail, PenLine, Plug, Save, Check, Sparkles,
  KeyRound, Send, FileText, Plus, Trash2,
} from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

// 이메일(IMAP+SMTP) 연동 — GET·PUT /mail/settings · POST /mail/test · GET /mail/inbox
// 같은 계정으로 발송(SMTP)도 나간다. custom 프로바이더는 smtp_host/smtp_port 별도 입력.
type MailSettings = {
  address: string
  provider: string   // naver | gmail | daum | custom
  host: string
  port: number
  smtp_host: string
  smtp_port: number
  has_password: boolean
}

// 메일 템플릿 카드 — 이름·제목·본문까지 편집형(/mail/defaults 의 templates 배열)
type MailTemplate = { id: string; name: string; subject: string; body: string }
// 메일 발송 기본값(회사 공통) — GET·PUT /mail/defaults (저장은 본사 전용)
type MailDefaults = { default_subject_prefix?: string; signature?: string; default_body?: string; templates?: MailTemplate[] }

// 개인 이메일(각자 SMTP) — GET·PUT /mail/my-settings · POST /mail/my-test (로그인 계정 본인 슬롯)
type MyMailSettings = {
  address: string
  provider: string   // naver | gmail | daum | custom
  smtp_host: string
  smtp_port: number
  has_password: boolean
}

// 문서 저장소(NAS 대비) — GET /files/info
type StorageInfo = {
  root: string
  modules: Record<string, { dir: string; files: number; bytes: number }>
}
const MODULE_LABEL: Record<string, string> = {
  inspection: '안전점검', risk: '위험성평가', musculo: '근골격계', education: '교육', compliance: '이행점검',
}
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

type PageSize = '10' | '20' | '50'
type Density = 'normal' | 'compact'
type HomeScreen = 'ledger' | 'schools' | 'overview'
type NotifSettings = { desktop: boolean; email: boolean }

const PAGE_SIZE_KEY = 'sp-ui-page-size'
const DENSITY_KEY = 'sp-ui-density'
const HOME_KEY = 'sp-ui-home'
const NOTIF_KEY = 'sp-settings-notif'
const APP_VERSION = '0.1.0'

function readNotif(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    if (!raw) return { desktop: false, email: false }
    const p = JSON.parse(raw) as Partial<NotifSettings>
    return { desktop: !!p.desktop, email: !!p.email }
  } catch {
    return { desktop: false, email: false }
  }
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        width: 48,
        height: 27,
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: on ? 'var(--grad-violet)' : 'var(--bg)',
        boxShadow: on ? 'var(--sh-violet)' : 'none',
        padding: 3,
        display: 'inline-flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        transition: 'background 0.18s, box-shadow 0.18s',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 19, height: 19, borderRadius: '50%', background: '#fff', boxShadow: 'var(--sh-soft)', display: 'block' }} />
    </button>
  )
}

// ── 설정 섹션 아코디언 ──
// 각 설정 카드 헤더를 눌러 접고 펼친다. 열림 상태는 localStorage에 유지.
const SEC_OPEN_KEY = 'sp-settings-open'
const SEC_DEFAULT_OPEN: Record<string, boolean> = {
  theme: true, notif: true, display: true, pw: false, mail: false, mymail: false, maildef: false, storage: false, sysinfo: false,
}

function Sec({ id, title, icon, pill, open, onToggle, children, style }: {
  id: string
  title: string
  icon?: ReactNode
  pill?: ReactNode
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className={'ledger acc' + (open ? ' open' : '')} style={style}>
      <div
        className="lh acc-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id) } }}
      >
        <h2>{icon} {title}</h2>
        <div className="sp" />
        {pill}
        <span className="acc-caret"><ChevronDown size={17} strokeWidth={2.2} /></span>
      </div>
      <div className="acc-wrap" aria-hidden={!open}>
        <div className="acc-inner">{children}</div>
      </div>
    </div>
  )
}

// 메일 기본값 — 추천 접두어·서명 템플릿(입력 보조)
const PREFIX_PRESETS = ['[한국산업안전협회]', '[안전보건]', '[학교안전관리]']
const SIG_TEMPLATES: { name: string; text: string }[] = [
  {
    name: '기본 서명',
    text: '한국산업안전협회 학교안전관리팀\nTel. 02-000-0000 | Fax. 02-000-0000\nEmail. safety@safety.or.kr',
  },
  {
    name: '상세 서명',
    text: '━━━━━━━━━━━━━━━━━━━━━━\n한국산업안전협회 | 학교안전관리팀\n담당 ○○○ 과장\nTel. 02-000-0000 | Mobile. 010-0000-0000\nEmail. safety@safety.or.kr\n서울특별시 ○○구 ○○로 00, 한국산업안전협회\n━━━━━━━━━━━━━━━━━━━━━━\n본 메일은 학교 안전보건 업무 수행을 위해 발송되었습니다.',
  },
]

export function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { user } = useAuth()
  const nav = useNavigate()

  // 섹션 접기/펼치기 상태(localStorage 유지)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SEC_OPEN_KEY)
      return raw ? { ...SEC_DEFAULT_OPEN, ...(JSON.parse(raw) as Record<string, boolean>) } : { ...SEC_DEFAULT_OPEN }
    } catch {
      return { ...SEC_DEFAULT_OPEN }
    }
  })
  function persistOpen(next: Record<string, boolean>) {
    try { localStorage.setItem(SEC_OPEN_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
  }
  function toggleSec(id: string) {
    setOpenMap((m) => { const next = { ...m, [id]: !m[id] }; persistOpen(next); return next })
  }
  function setAllSec(open: boolean) {
    const next = Object.fromEntries(Object.keys(SEC_DEFAULT_OPEN).map((k) => [k, open]))
    setOpenMap(next)
    persistOpen(next)
  }

  const [pageSize, setPageSize] = useState<PageSize>(
    () => (localStorage.getItem(PAGE_SIZE_KEY) as PageSize) || '10',
  )
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem(DENSITY_KEY) as Density) || 'normal',
  )
  const [home, setHome] = useState<HomeScreen>(
    () => (localStorage.getItem(HOME_KEY) as HomeScreen) || 'ledger',
  )
  const [notif, setNotif] = useState<NotifSettings>(() => readNotif())
  const [saved, setSaved] = useState(false)

  // 이메일 연동
  const [mail, setMail] = useState<MailSettings | null>(null)
  const [mailPw, setMailPw] = useState('')
  const [mailBusy, setMailBusy] = useState('')
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 메일 발송 기본값(제목 접두어·서명·템플릿)
  const [defaults, setDefaults] = useState<MailDefaults | null>(null)
  const [defBusy, setDefBusy] = useState(false)
  const [defMsg, setDefMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 내 메일 템플릿(개인용) — GET·PUT /mail/my-templates (로그인 계정 본인 소유, 권한 게이트 없음)
  const [myTemplates, setMyTemplates] = useState<MailTemplate[] | null>(null)
  const [myTplBusy, setMyTplBusy] = useState(false)
  const [myTplMsg, setMyTplMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 로그인 사용자 역할(본사 여부 판별 — 템플릿 저장 게이팅). null = 미확인(일단 허용).
  const [role, setRole] = useState<string | null>(null)

  // 비밀번호 변경(POST /auth/change-password)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [pwOk, setPwOk] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  // 개인 이메일 연동(각자 SMTP) — 대표계정과 별개
  const [mymail, setMymail] = useState<MyMailSettings | null>(null)
  const [myPw, setMyPw] = useState('')
  const [myBusy, setMyBusy] = useState('')
  const [myMsg, setMyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 문서 저장소(NAS 대비)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  useEffect(() => {
    let alive = true
    api<{ settings: MailSettings }>('/mail/settings')
      .then((d) => { if (alive) setMail(d.settings) })
      .catch(() => { if (alive) setMail(null) })
    api<{ defaults: MailDefaults }>('/mail/defaults')
      .then((d) => { if (alive) setDefaults(d.defaults || {}) })
      .catch(() => { if (alive) setDefaults(null) })
    api<{ login_id: string; templates: MailTemplate[] }>('/mail/my-templates')
      .then((d) => { if (alive) setMyTemplates(Array.isArray(d.templates) ? d.templates : []) })
      .catch(() => { if (alive) setMyTemplates(null) })
    api<{ login_id: string; settings: MyMailSettings }>('/mail/my-settings')
      .then((d) => { if (alive) setMymail(d.settings) })
      .catch(() => { if (alive) setMymail(null) })
    api<{ role: string }>('/auth/me')
      .then((d) => { if (alive) setRole(d.role) })
      .catch(() => { if (alive) setRole(null) })
    api<StorageInfo>('/files/info')
      .then((d) => { if (alive) setStorage(d) })
      .catch(() => { if (alive) setStorage(null) })
    return () => { alive = false }
  }, [])

  async function saveMail() {
    if (!mail) return
    setMailBusy('save')
    setMailMsg(null)
    try {
      const d = await api<{ settings: MailSettings }>('/mail/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: { ...mail, password: mailPw } }),
      })
      setMail(d.settings)
      setMailPw('')
      setMailMsg({ ok: true, text: '이메일 연동 설정을 저장했습니다.' })
    } catch (e) {
      setMailMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setMailBusy('')
    }
  }

  async function saveDefaults() {
    if (!defaults) return
    setDefBusy(true)
    setDefMsg(null)
    try {
      const d = await api<{ ok: boolean; defaults: MailDefaults }>('/mail/defaults', {
        method: 'PUT',
        body: JSON.stringify({ defaults }),
      })
      setDefaults(d.defaults || {})
      setDefMsg({ ok: true, text: '메일 기본값을 저장했습니다.' })
    } catch (e) {
      setDefMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setDefBusy(false)
    }
  }

  async function testMail() {
    setMailBusy('test')
    setMailMsg(null)
    try {
      const d = await api<{ ok: boolean; message: string }>('/mail/test', { method: 'POST' })
      setMailMsg({ ok: d.ok, text: d.message })
    } catch (e) {
      setMailMsg({ ok: false, text: e instanceof Error ? e.message : '연동 테스트 실패' })
    } finally {
      setMailBusy('')
    }
  }

  // ── 비밀번호 변경 (MyPage와 동일 로직·검증) ──
  async function changePassword() {
    setPwErr('')
    setPwOk('')
    if (!curPw || !newPw || !confirmPw) { setPwErr('모든 항목을 입력하세요.'); return }
    if (newPw !== confirmPw) { setPwErr('새 비밀번호가 일치하지 않습니다.'); return }
    setPwBusy(true)
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: curPw, new_password: newPw }),
      })
      setCurPw(''); setNewPw(''); setConfirmPw('')
      setPwOk('비밀번호가 변경되었습니다.')
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setPwBusy(false)
    }
  }

  // ── 개인 이메일 연동(각자 SMTP) ──
  async function saveMyMail() {
    if (!mymail) return
    setMyBusy('save')
    setMyMsg(null)
    try {
      const d = await api<{ ok: boolean; settings: MyMailSettings }>('/mail/my-settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: { ...mymail, password: myPw } }),
      })
      setMymail(d.settings)
      setMyPw('')
      setMyMsg({ ok: true, text: '개인 이메일 연동 설정을 저장했습니다.' })
    } catch (e) {
      setMyMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setMyBusy('')
    }
  }

  async function testMyMail() {
    setMyBusy('test')
    setMyMsg(null)
    try {
      const d = await api<{ ok: boolean; message: string }>('/mail/my-test', { method: 'POST' })
      setMyMsg({ ok: d.ok, text: d.message })
    } catch (e) {
      setMyMsg({ ok: false, text: e instanceof Error ? e.message : '연결 테스트 실패' })
    } finally {
      setMyBusy('')
    }
  }

  // ── 메일 템플릿 카드 편집 ──
  function addTemplate() {
    if (!defaults) return
    const list = defaults.templates ?? []
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `tpl-${Date.now()}-${list.length}`
    setDefaults({ ...defaults, templates: [...list, { id, name: '새 템플릿', subject: '', body: '' }] })
    setDefMsg(null)
  }
  function updateTemplate(id: string, patch: Partial<MailTemplate>) {
    if (!defaults) return
    const list = defaults.templates ?? []
    setDefaults({ ...defaults, templates: list.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
    setDefMsg(null)
  }
  function removeTemplate(id: string) {
    if (!defaults) return
    const list = defaults.templates ?? []
    setDefaults({ ...defaults, templates: list.filter((t) => t.id !== id) })
    setDefMsg(null)
  }

  // ── 내 메일 템플릿(개인용) 카드 편집 — 로그인 계정 본인 소유(권한 게이트 없음) ──
  function addMyTemplate() {
    const list = myTemplates ?? []
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `mytpl-${Date.now()}-${list.length}`
    setMyTemplates([...list, { id, name: '새 템플릿', subject: '', body: '' }])
    setMyTplMsg(null)
  }
  function updateMyTemplate(id: string, patch: Partial<MailTemplate>) {
    const list = myTemplates ?? []
    setMyTemplates(list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setMyTplMsg(null)
  }
  function removeMyTemplate(id: string) {
    const list = myTemplates ?? []
    setMyTemplates(list.filter((t) => t.id !== id))
    setMyTplMsg(null)
  }
  async function saveMyTemplates() {
    const list = myTemplates ?? []
    setMyTplBusy(true)
    setMyTplMsg(null)
    try {
      const d = await api<{ login_id: string; templates: MailTemplate[] }>('/mail/my-templates', {
        method: 'PUT',
        body: JSON.stringify({ templates: list }),
      })
      setMyTemplates(Array.isArray(d.templates) ? d.templates : [])
      setMyTplMsg({ ok: true, text: '내 메일 템플릿을 저장했습니다.' })
    } catch (e) {
      setMyTplMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setMyTplBusy(false)
    }
  }

  const dark = theme === 'dark'

  function touch() {
    if (saved) setSaved(false)
  }

  function save() {
    localStorage.setItem(PAGE_SIZE_KEY, pageSize)
    localStorage.setItem(DENSITY_KEY, density)
    localStorage.setItem(HOME_KEY, home)
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notif))
    setSaved(true)
  }

  const prefix = (defaults?.default_subject_prefix ?? '').trim()
  const signature = defaults?.signature ?? ''
  const body = defaults?.default_body ?? ''
  const templates = defaults?.templates ?? []
  const defSet = prefix.length > 0 || body.trim().length > 0 || signature.trim().length > 0 || templates.length > 0
  // 본사(hq_admin/executive)만 저장 가능. 역할 미확인(null) 시엔 일단 허용하고 오류로 안내.
  const canEditDefaults = role === null ? true : (role === 'hq_admin' || role === 'executive')

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>설정</b></div>
      <div className="bar">
        <h2><SlidersHorizontal size={20} /> 설정</h2>
        <div className="sp" />
        <button className="btn btn-ghost" onClick={() => setAllSec(true)}>
          <ChevronsUpDown size={14} /> 모두 펼치기
        </button>
        <button className="btn btn-ghost" onClick={() => setAllSec(false)}>
          <ChevronsDownUp size={14} /> 모두 접기
        </button>
      </div>

      <div className="grid2">
        {/* 화면 테마 */}
        <Sec id="theme" title="화면 테마" icon={dark ? <Moon size={18} /> : <Sun size={18} />}
          pill={<span className={'pillx ' + (dark ? 'doing' : 'warn')}>{dark ? '다크' : '라이트'}</span>}
          open={!!openMap.theme} onToggle={toggleSec}>
          <div className="card-body" style={{ padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                현재 테마{' '}
                <span className={'pillx ' + (dark ? 'doing' : 'warn')}>{dark ? '다크' : '라이트'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>
                테마 변경은 즉시 적용되며 저장이 필요 없습니다.
              </div>
            </div>
            <button className="btn btn-ghost" onClick={toggle}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            </button>
          </div>
        </Sec>

        {/* 알림 설정 */}
        <Sec id="notif" title="알림 설정" open={!!openMap.notif} onToggle={toggleSec}>
          <div className="card-body" style={{ padding: '6px 26px 10px' }}>
            <div className="kv">
              <b style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Monitor size={16} /> 데스크톱 알림</b>
              <Toggle on={notif.desktop} onClick={() => { setNotif((n) => ({ ...n, desktop: !n.desktop })); touch() }} />
            </div>
            <div className="kv">
              <b style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Mail size={16} /> 이메일 요약</b>
              <Toggle on={notif.email} onClick={() => { setNotif((n) => ({ ...n, email: !n.email })); touch() }} />
            </div>
          </div>
        </Sec>
      </div>

      {/* 표시 설정 */}
      <Sec id="display" title="표시 설정" icon={<SlidersHorizontal size={18} />}
        open={!!openMap.display} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '22px 26px' }}>
          <div className="formrow">
            <label className="field" style={{ minWidth: 180 }}>
              <span>페이지당 행 수</span>
              <select
                className="select"
                value={pageSize}
                onChange={(e) => { setPageSize(e.target.value as PageSize); touch() }}
              >
                <option value="10">10개씩</option>
                <option value="20">20개씩</option>
                <option value="50">50개씩</option>
              </select>
            </label>
            <label className="field" style={{ minWidth: 180 }}>
              <span>목록 조밀도</span>
              <select
                className="select"
                value={density}
                onChange={(e) => { setDensity(e.target.value as Density); touch() }}
              >
                <option value="normal">보통</option>
                <option value="compact">조밀</option>
              </select>
            </label>
            <label className="field" style={{ minWidth: 200 }}>
              <span>기본 시작 화면</span>
              <select
                className="select"
                value={home}
                onChange={(e) => { setHome(e.target.value as HomeScreen); touch() }}
              >
                <option value="ledger">이력관리 대장</option>
                <option value="schools">학교 현황</option>
                <option value="overview">종합관리</option>
              </select>
            </label>
          </div>
        </div>
      </Sec>

      {/* 비밀번호 변경 — POST /auth/change-password (로그인 계정 누구나) */}
      <Sec id="pw" title="비밀번호 변경" icon={<KeyRound size={18} />}
        open={!!openMap.pw} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          <div className="formrow">
            <label className="field" style={{ minWidth: 200 }}>
              <span>현재 비밀번호</span>
              <input className="input" type="password" value={curPw} autoComplete="current-password"
                placeholder="현재 비밀번호" onChange={(e) => { setCurPw(e.target.value); setPwErr(''); setPwOk('') }} />
            </label>
            <label className="field" style={{ minWidth: 200 }}>
              <span>새 비밀번호</span>
              <input className="input" type="password" value={newPw} autoComplete="new-password"
                placeholder="새 비밀번호" onChange={(e) => { setNewPw(e.target.value); setPwErr(''); setPwOk('') }} />
            </label>
            <label className="field" style={{ minWidth: 200 }}>
              <span>새 비밀번호 확인</span>
              <input className="input" type="password" value={confirmPw} autoComplete="new-password"
                placeholder="새 비밀번호 확인" onChange={(e) => { setConfirmPw(e.target.value); setPwErr(''); setPwOk('') }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => void changePassword()} disabled={pwBusy}>
              <KeyRound size={15} /> {pwBusy ? '변경 중…' : '비밀번호 변경'}
            </button>
            {pwErr && <span className="pillx late">{pwErr}</span>}
            {pwOk && <span className="pillx ok">{pwOk}</span>}
          </div>
          <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
            현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다(로그인한 본인 계정).
          </div>
        </div>
      </Sec>

      {/* 개인 이메일 연동(IMAP 열람) */}
      <Sec id="mail" title="개인 이메일 연동" icon={<Plug size={18} />}
        pill={mail ? <span className={'pillx ' + (mail.has_password ? 'ok' : 'todo')}>{mail.has_password ? '연동됨' : '미연동'}</span> : undefined}
        open={!!openMap.mail} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {mail === null && <div className="tstate">설정을 불러오지 못했습니다. (본사 관리자 권한 필요)</div>}
          {mail && (
            <>
              <div className="formrow">
                <label className="field" style={{ minWidth: 220 }}>
                  <span>이메일 주소</span>
                  <input className="input" value={mail.address} placeholder="safety@naver.com"
                    onChange={(e) => setMail({ ...mail, address: e.target.value })} />
                </label>
                <label className="field">
                  <span>메일 서비스</span>
                  <select className="select" value={mail.provider}
                    onChange={(e) => setMail({ ...mail, provider: e.target.value })}>
                    <option value="naver">네이버</option>
                    <option value="gmail">구글(Gmail)</option>
                    <option value="daum">다음</option>
                    <option value="custom">직접 입력(IMAP)</option>
                  </select>
                </label>
                {mail.provider === 'custom' && (
                  <>
                    <label className="field">
                      <span>IMAP 호스트</span>
                      <input className="input" value={mail.host} placeholder="imap.example.com"
                        onChange={(e) => setMail({ ...mail, host: e.target.value })} />
                    </label>
                    <label className="field" style={{ width: 100 }}>
                      <span>포트</span>
                      <input className="input" type="number" value={mail.port}
                        onChange={(e) => setMail({ ...mail, port: Number(e.target.value) || 993 })} />
                    </label>
                    <label className="field">
                      <span>SMTP 호스트 (발송)</span>
                      <input className="input" value={mail.smtp_host} placeholder="smtp.example.com"
                        onChange={(e) => setMail({ ...mail, smtp_host: e.target.value })} />
                    </label>
                    <label className="field" style={{ width: 100 }}>
                      <span>SMTP 포트</span>
                      <input className="input" type="number" value={mail.smtp_port}
                        onChange={(e) => setMail({ ...mail, smtp_port: Number(e.target.value) || 465 })} />
                    </label>
                  </>
                )}
                <label className="field" style={{ minWidth: 200 }}>
                  <span>앱 비밀번호 {mail.has_password && <span className="muted" style={{ fontWeight: 500 }}>(저장됨 — 변경 시만 입력)</span>}</span>
                  <input className="input" type="password" value={mailPw} autoComplete="new-password"
                    placeholder={mail.has_password ? '●●●●●●●●' : 'IMAP 앱 비밀번호'}
                    onChange={(e) => setMailPw(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void saveMail()} disabled={mailBusy !== ''}>
                  {mailBusy === 'save' ? '저장 중…' : '연동 저장'}
                </button>
                <button className="btn btn-ghost" onClick={() => void testMail()} disabled={mailBusy !== ''}>
                  <Plug size={14} /> {mailBusy === 'test' ? '확인 중…' : '연동 테스트'}
                </button>
                <button className="btn btn-ghost" onClick={() => nav('/mail')} disabled={!mail.has_password}>
                  <Inbox size={14} /> 메일함 열기
                </button>
                {mailMsg && <span className={'pillx ' + (mailMsg.ok ? 'ok' : 'late')}>{mailMsg.text}</span>}
              </div>
              <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
                네이버/구글은 <b>2단계 인증의 앱 비밀번호</b>를 발급해 입력하세요(계정 비밀번호 아님).
                이 계정은 <b>회사 대표계정</b>으로, 메일함 열람(IMAP)과 <b>업무 메일 발송(SMTP)</b>에 함께 사용됩니다.
                메일함 → [메일 쓰기]로 보내는 업무 메일이 이 주소로 발송됩니다.
              </div>
            </>
          )}
        </div>
      </Sec>

      {/* 개인 이메일 연동(각자 SMTP) — 본인 개인 주소로 업무 메일 발송. 대표계정과 별개. */}
      <Sec id="mymail" title="개인 이메일 연동 (각자 SMTP)" icon={<Send size={18} />}
        pill={mymail ? <span className={'pillx ' + (mymail.has_password ? 'ok' : 'todo')}>{mymail.has_password ? '연동됨' : '미연동'}</span> : undefined}
        open={!!openMap.mymail} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {mymail === null && <div className="tstate">설정을 불러오지 못했습니다.</div>}
          {mymail && (
            <>
              <div className="formrow">
                <label className="field" style={{ minWidth: 220 }}>
                  <span>이메일 주소</span>
                  <input className="input" value={mymail.address} placeholder="hong@naver.com"
                    onChange={(e) => setMymail({ ...mymail, address: e.target.value })} />
                </label>
                <label className="field">
                  <span>제공자</span>
                  <select className="select" value={mymail.provider}
                    onChange={(e) => setMymail({ ...mymail, provider: e.target.value })}>
                    <option value="naver">네이버</option>
                    <option value="gmail">구글(Gmail)</option>
                    <option value="daum">다음</option>
                    <option value="custom">직접 입력(SMTP)</option>
                  </select>
                </label>
                {mymail.provider === 'custom' && (
                  <>
                    <label className="field">
                      <span>SMTP 호스트</span>
                      <input className="input" value={mymail.smtp_host} placeholder="smtp.example.com"
                        onChange={(e) => setMymail({ ...mymail, smtp_host: e.target.value })} />
                    </label>
                    <label className="field" style={{ width: 100 }}>
                      <span>SMTP 포트</span>
                      <input className="input" type="number" value={mymail.smtp_port}
                        onChange={(e) => setMymail({ ...mymail, smtp_port: Number(e.target.value) || 465 })} />
                    </label>
                  </>
                )}
                <label className="field" style={{ minWidth: 200 }}>
                  <span>앱 비밀번호 {mymail.has_password && <span className="muted" style={{ fontWeight: 500 }}>(저장됨 — 변경 시만 입력)</span>}</span>
                  <input className="input" type="password" value={myPw} autoComplete="new-password"
                    placeholder={mymail.has_password ? '●●●●●●●●' : '앱 비밀번호'}
                    onChange={(e) => setMyPw(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void saveMyMail()} disabled={myBusy !== ''}>
                  <Save size={15} /> {myBusy === 'save' ? '저장 중…' : '연동 저장'}
                </button>
                <button className="btn btn-ghost" onClick={() => void testMyMail()} disabled={myBusy !== ''}>
                  <Send size={14} /> {myBusy === 'test' ? '확인 중…' : '연결 테스트'}
                </button>
                {myMsg && <span className={'pillx ' + (myMsg.ok ? 'ok' : 'late')}>{myMsg.text}</span>}
              </div>
              <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
                여기서 연동하면 내가 보내는 업무 메일이 회사 <b>대표계정</b>이 아니라 <b>내 개인 이메일 주소</b>로 발송됩니다.
                네이버/지메일/다음은 계정 비밀번호가 아니라 <b>앱 비밀번호</b>(2단계 인증에서 발급)를 입력하세요.
              </div>
            </>
          )}
        </div>
      </Sec>

      {/* 메일 발송 기본값 — 제목 접두어·서명 + 실시간 발송 미리보기(회사 공통, 저장은 본사 전용) */}
      <Sec id="maildef" title="메일 기본값" icon={<Mail size={18} />}
        pill={defaults !== null ? <span className={'pillx ' + (defSet ? 'ok' : 'todo')}>{defSet ? '설정됨' : '미설정'}</span> : undefined}
        open={!!openMap.maildef} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {defaults === null && <div className="tstate">기본값을 불러오지 못했습니다. (본사 관리자 권한 필요)</div>}
          {defaults !== null && (
            <>
            <div className="mdef">
              {/* 좌: 입력 폼 */}
              <div className="mdef-form">
                <label className="field" style={{ display: 'block' }}>
                  <span><PenLine size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />기본 제목 접두어</span>
                  <input className="input" value={defaults.default_subject_prefix ?? ''}
                    placeholder="예: [한국산업안전협회]"
                    style={{ width: '100%' }}
                    onChange={(e) => setDefaults({ ...defaults, default_subject_prefix: e.target.value })} />
                </label>
                <div className="mdef-chips">
                  <span className="mdef-chips-label">추천</span>
                  {PREFIX_PRESETS.map((p) => (
                    <button key={p} type="button"
                      className={'mchip' + (prefix === p ? ' on' : '')}
                      onClick={() => setDefaults({ ...defaults, default_subject_prefix: p })}>
                      {p}
                    </button>
                  ))}
                </div>

                <label className="field" style={{ display: 'block', marginTop: 16 }}>
                  <span>
                    기본 본문 (메일 쓰기 시 자동 입력)
                    <em className="mdef-count">{body.length.toLocaleString()}자</em>
                  </span>
                  <textarea className="input" rows={9} value={body}
                    placeholder={'예:\n안녕하세요, 행정실장님.\n\n정기 안전점검 결과 보고서를 첨부와 같이 송부드립니다. 지적사항에 대한 조치 결과를 회신 부탁드립니다.'}
                    onChange={(e) => setDefaults({ ...defaults, default_body: e.target.value })}
                    style={{ width: '100%', minHeight: 220, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
                </label>

                <label className="field" style={{ display: 'block', marginTop: 16 }}>
                  <span>
                    서명 (본문 끝에 자동 첨부)
                    <em className="mdef-count">{signature.length.toLocaleString()}자</em>
                  </span>
                  <textarea className="input" rows={8} value={signature}
                    placeholder={'예:\n한국산업안전협회 학교안전관리팀\nTel. 02-000-0000'}
                    onChange={(e) => setDefaults({ ...defaults, signature: e.target.value })}
                    style={{ width: '100%', resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
                </label>
                <div className="mdef-chips">
                  <span className="mdef-chips-label"><Sparkles size={12} style={{ verticalAlign: '-2px' }} /> 템플릿</span>
                  {SIG_TEMPLATES.map((t) => (
                    <button key={t.name} type="button" className="mchip"
                      onClick={() => setDefaults({ ...defaults, signature: t.text })}>
                      {t.name}
                    </button>
                  ))}
                  <button type="button" className="mchip danger" disabled={signature.length === 0}
                    onClick={() => setDefaults({ ...defaults, signature: '' })}>
                    <Eraser size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />비우기
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => void saveDefaults()} disabled={defBusy}>
                    <Save size={15} /> {defBusy ? '저장 중…' : '기본값 저장'}
                  </button>
                  {defMsg && <span className={'pillx ' + (defMsg.ok ? 'ok' : 'late')}>{defMsg.text}</span>}
                </div>
                <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
                  [메일 쓰기]를 열면 제목에 접두어가, 본문에 기본 본문이, 본문 끝에 서명이 자동으로 채워집니다.
                  회사 공통 설정이며 저장은 본사 관리자만 가능합니다.
                </div>
              </div>

              {/* 우: 실시간 발송 미리보기 */}
              <div className="mdef-prev">
                <div className="mdef-prev-title"><Eye size={14} /> 발송 미리보기</div>
                <div className="mdmail">
                  <div className="mdmail-meta">
                    <span className="k">보내는사람</span>
                    <span>{mail?.address || '회사 대표계정'}</span>
                  </div>
                  <div className="mdmail-meta">
                    <span className="k">받는사람</span>
                    <span>강진여자중학교 행정실</span>
                  </div>
                  <div className="mdmail-subject">
                    {prefix && <mark className="pfx">{prefix}</mark>}
                    <span>3월 정기 안전점검 결과 송부</span>
                  </div>
                  <div className="mdmail-body">
                    {body.trim().length > 0 ? (
                      <p style={{ whiteSpace: 'pre-wrap' }}>{body}</p>
                    ) : (
                      <div className="mdmail-sig-empty">기본 본문을 입력하면 이 자리에 표시됩니다.</div>
                    )}
                    {signature.trim().length > 0 ? (
                      <>
                        <div className="mdmail-sig-div" />
                        <pre className="mdmail-sig">{signature}</pre>
                      </>
                    ) : (
                      <div className="mdmail-sig-empty">서명을 입력하면 이 자리에 표시됩니다.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 메일 템플릿 — 이름·제목·본문까지 편집형 카드(저장은 본사 전용) */}
            <div style={{ marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <FileText size={16} /> 메일 템플릿 (회사 공통, 본사 전용)
                </h3>
                <span className="pillx doing">{templates.length}개</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={addTemplate} disabled={!canEditDefaults}>
                  <Plus size={14} /> 카드 추가
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 14 }}>
                자주 쓰는 메일을 제목·본문까지 저장해 두면 [메일 쓰기]에서 골라 바로 채울 수 있습니다.
                {!canEditDefaults && <b> (본사 관리자만 저장할 수 있어 현재는 열람만 가능합니다.)</b>}
              </div>

              {templates.length === 0 && (
                <div className="tstate">등록된 템플릿이 없습니다. [카드 추가]로 첫 템플릿을 만들어 보세요.</div>
              )}

              <div style={{ display: 'grid', gap: 14 }}>
                {templates.map((t, i) => (
                  <div key={t.id} className="ledger" style={{ padding: '16px 18px' }}>
                    <div className="formrow" style={{ alignItems: 'flex-start' }}>
                      <label className="field" style={{ minWidth: 180, flex: '0 0 auto' }}>
                        <span>이름</span>
                        <input className="input" value={t.name} readOnly={!canEditDefaults}
                          placeholder={`템플릿 ${i + 1}`}
                          onChange={(e) => updateTemplate(t.id, { name: e.target.value })} />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: 240 }}>
                        <span>제목</span>
                        <input className="input" value={t.subject} readOnly={!canEditDefaults}
                          placeholder="예: [한국산업안전협회] ○○ 결과 송부"
                          onChange={(e) => updateTemplate(t.id, { subject: e.target.value })} />
                      </label>
                      <button className="btn btn-ghost" style={{ marginTop: 22 }}
                        onClick={() => removeTemplate(t.id)} disabled={!canEditDefaults}>
                        <Trash2 size={14} /> 삭제
                      </button>
                    </div>
                    <label className="field" style={{ display: 'block', marginTop: 12 }}>
                      <span>본문</span>
                      <textarea className="input" rows={5} value={t.body} readOnly={!canEditDefaults}
                        placeholder={'메일 본문을 입력하세요.'}
                        onChange={(e) => updateTemplate(t.id, { body: e.target.value })}
                        style={{ width: '100%', resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
                    </label>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void saveDefaults()} disabled={defBusy || !canEditDefaults}>
                  <Save size={15} /> {defBusy ? '저장 중…' : '템플릿 저장'}
                </button>
                {defMsg && <span className={'pillx ' + (defMsg.ok ? 'ok' : 'late')}>{defMsg.text}</span>}
              </div>
            </div>
            </>
          )}

          {/* 내 메일 템플릿(개인용) — 로그인 계정 본인 소유. 회사 공통 템플릿과 별개로 누구나 편집·저장 가능. */}
          <div style={{ marginTop: 24, borderTop: '2px solid var(--line)', paddingTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <FileText size={16} /> 내 메일 템플릿 (개인용) — 나만 사용
              </h3>
              <span className="pillx doing">{(myTemplates ?? []).length}개</span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={addMyTemplate} disabled={myTemplates === null}>
                <Plus size={14} /> 카드 추가
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 14 }}>
              여기 등록한 템플릿은 <b>내 계정에서만</b> 보이고 사용됩니다. 회사 공통 템플릿과 달리 <b>누구나 자유롭게 추가·수정·삭제·저장</b>할 수 있습니다.
            </div>

            {myTemplates === null && (
              <div className="tstate">개인 템플릿을 불러오지 못했습니다. 잠시 후 다시 시도하세요.</div>
            )}
            {myTemplates !== null && myTemplates.length === 0 && (
              <div className="tstate">등록된 개인 템플릿이 없습니다. [카드 추가]로 나만의 템플릿을 만들어 보세요.</div>
            )}

            {myTemplates !== null && myTemplates.length > 0 && (
              <div style={{ display: 'grid', gap: 14 }}>
                {myTemplates.map((t, i) => (
                  <div key={t.id} className="ledger" style={{ padding: '16px 18px' }}>
                    <div className="formrow" style={{ alignItems: 'flex-start' }}>
                      <label className="field" style={{ minWidth: 180, flex: '0 0 auto' }}>
                        <span>이름</span>
                        <input className="input" value={t.name}
                          placeholder={`내 템플릿 ${i + 1}`}
                          onChange={(e) => updateMyTemplate(t.id, { name: e.target.value })} />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: 240 }}>
                        <span>제목</span>
                        <input className="input" value={t.subject}
                          placeholder="예: ○○ 결과 송부"
                          onChange={(e) => updateMyTemplate(t.id, { subject: e.target.value })} />
                      </label>
                      <button className="btn btn-ghost" style={{ marginTop: 22 }}
                        onClick={() => removeMyTemplate(t.id)}>
                        <Trash2 size={14} /> 삭제
                      </button>
                    </div>
                    <label className="field" style={{ display: 'block', marginTop: 12 }}>
                      <span>본문</span>
                      <textarea className="input" rows={5} value={t.body}
                        placeholder={'메일 본문을 입력하세요.'}
                        onChange={(e) => updateMyTemplate(t.id, { body: e.target.value })}
                        style={{ width: '100%', resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
                    </label>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => void saveMyTemplates()} disabled={myTplBusy || myTemplates === null}>
                <Save size={15} /> {myTplBusy ? '저장 중…' : '내 템플릿 저장'}
              </button>
              {myTplMsg && <span className={'pillx ' + (myTplMsg.ok ? 'ok' : 'late')}>{myTplMsg.text}</span>}
            </div>
          </div>
        </div>
      </Sec>

      {/* 문서 저장소 — NAS 이관 대비 */}
      <Sec id="storage" title="문서 저장소" icon={<FolderTree size={18} />}
        pill={<span className="pillx doing">로컬 저장 중</span>}
        open={!!openMap.storage} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {storage === null && <div className="tstate">저장소 정보를 불러오지 못했습니다.</div>}
          {storage && (
            <>
              <div className="kv"><b>저장 위치</b><span style={{ wordBreak: 'break-all' }}>{storage.root}</span></div>
              <div className="twrap" style={{ marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr><th>업무</th><th>폴더</th><th className="c">파일 수</th><th className="c">용량</th></tr></thead>
                  <tbody>
                    {Object.entries(storage.modules).map(([k, m]) => (
                      <tr key={k}>
                        <td><b>{MODULE_LABEL[k] || k}</b></td>
                        <td>{m.dir}/</td>
                        <td className="c">{m.files}</td>
                        <td className="c">{fmtBytes(m.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
                업무별 산출물(점검표·평가서·조사표·교육·이행점검)이 위 5개 폴더에 월별로 자동 정리됩니다.
                <b> NAS 설치 후에는 서버 환경변수 STORAGE_ROOT를 NAS 경로로 바꾸면</b> 같은 폴더 구조 그대로
                NAS에 저장됩니다(화면·데이터 변경 없음).
              </div>
            </>
          )}
        </div>
      </Sec>

      {/* 시스템 정보 */}
      <Sec id="sysinfo" title="시스템 정보" open={!!openMap.sysinfo} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '4px 26px 12px' }}>
          <div className="kv"><b>제품명</b><span>Safeplatform (본사웹)</span></div>
          <div className="kv"><b>버전</b><span>{APP_VERSION}</span></div>
          <div className="kv"><b>로그인 계정</b><span>{user?.login ?? '—'}</span></div>
          <div className="kv"><b>소속</b><span>{user?.tenant ?? '—'}</span></div>
        </div>
      </Sec>

      {/* 저장 */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save}><Save size={16} /> 저장</button>
        {saved && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ok-ink)', fontWeight: 700, fontSize: 13 }}>
            <Check size={16} /> 표시·알림 설정이 저장되었습니다.
          </span>
        )}
      </div>

    </div>
  )
}
