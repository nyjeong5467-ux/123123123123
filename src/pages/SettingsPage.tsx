import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderTree, Inbox, SlidersHorizontal, Moon, Sun, Monitor, Mail, Plug, Save, Check } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'

// 이메일(IMAP) 연동 — GET·PUT /mail/settings · POST /mail/test · GET /mail/inbox
type MailSettings = {
  address: string
  provider: string   // naver | gmail | daum | custom
  host: string
  port: number
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

export function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { user } = useAuth()
  const nav = useNavigate()

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

  // 문서 저장소(NAS 대비)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  useEffect(() => {
    let alive = true
    api<{ settings: MailSettings }>('/mail/settings')
      .then((d) => { if (alive) setMail(d.settings) })
      .catch(() => { if (alive) setMail(null) })
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

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>설정</b></div>
      <div className="bar">
        <h2><SlidersHorizontal size={20} /> 설정</h2>
      </div>

      <div className="grid2">
        {/* 화면 테마 */}
        <div className="ledger">
          <div className="lh"><h2>{dark ? <Moon size={18} /> : <Sun size={18} />} 화면 테마</h2></div>
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
        </div>

        {/* 알림 설정 */}
        <div className="ledger">
          <div className="lh"><h2>알림 설정</h2></div>
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
        </div>
      </div>

      {/* 표시 설정 */}
      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh"><h2><SlidersHorizontal size={18} /> 표시 설정</h2></div>
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
      </div>

      {/* 개인 이메일 연동(IMAP 열람) */}
      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh">
          <h2><Plug size={18} /> 개인 이메일 연동</h2>
          <div className="sp" />
          {mail && <span className={'pillx ' + (mail.has_password ? 'ok' : 'todo')}>{mail.has_password ? '연동됨' : '미연동'}</span>}
        </div>
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
                열람 전용(IMAP 읽기)이며 메일 발송·삭제는 하지 않습니다. 교육 진도율 메일 등 학교 회신 확인용.
              </div>
            </>
          )}
        </div>
      </div>

      {/* 문서 저장소 — NAS 이관 대비 */}
      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh">
          <h2><FolderTree size={18} /> 문서 저장소 (NAS 대비)</h2>
          <div className="sp" />
          <span className="pillx doing">로컬 저장 중</span>
        </div>
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
      </div>

      {/* 시스템 정보 */}
      <div className="ledger" style={{ marginTop: 24 }}>
        <div className="lh"><h2>시스템 정보</h2></div>
        <div className="card-body" style={{ padding: '4px 26px 12px' }}>
          <div className="kv"><b>제품명</b><span>Safeplatform (본사웹)</span></div>
          <div className="kv"><b>버전</b><span>{APP_VERSION}</span></div>
          <div className="kv"><b>로그인 계정</b><span>{user?.login ?? '—'}</span></div>
          <div className="kv"><b>소속</b><span>{user?.tenant ?? '—'}</span></div>
        </div>
      </div>

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
