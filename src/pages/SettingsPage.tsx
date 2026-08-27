import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronsDownUp, ChevronsUpDown, Eraser, Eye, FolderTree, Inbox,
  SlidersHorizontal, Moon, Sun, Monitor, Mail, PenLine, Plug, Save, Check, Sparkles,
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

// 메일 발송 기본값(회사 공통) — GET·PUT /mail/defaults (저장은 본사 전용)
type MailDefaults = { default_subject_prefix?: string; signature?: string }

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
  theme: true, notif: true, display: true, mail: false, maildef: false, storage: false, sysinfo: false,
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

  // 메일 발송 기본값(제목 접두어·서명)
  const [defaults, setDefaults] = useState<MailDefaults | null>(null)
  const [defBusy, setDefBusy] = useState(false)
  const [defMsg, setDefMsg] = useState<{ ok: boolean; text: string } | null>(null)

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
  const defSet = prefix.length > 0 || signature.trim().length > 0

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

      {/* 메일 발송 기본값 — 제목 접두어·서명 + 실시간 발송 미리보기(회사 공통, 저장은 본사 전용) */}
      <Sec id="maildef" title="메일 기본값" icon={<Mail size={18} />}
        pill={defaults !== null ? <span className={'pillx ' + (defSet ? 'ok' : 'todo')}>{defSet ? '설정됨' : '미설정'}</span> : undefined}
        open={!!openMap.maildef} onToggle={toggleSec} style={{ marginTop: 24 }}>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {defaults === null && <div className="tstate">기본값을 불러오지 못했습니다. (본사 관리자 권한 필요)</div>}
          {defaults !== null && (
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
                  [메일 쓰기]를 열면 제목에 접두어가, 본문 끝에 서명이 자동으로 채워집니다.
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
                    <p>안녕하세요, 행정실장님.</p>
                    <p>3월 정기 안전점검 결과 보고서를 첨부와 같이 송부드립니다. 지적사항에 대한 조치 결과를 회신 부탁드립니다.</p>
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
          )}
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
