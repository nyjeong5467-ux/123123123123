// 경영 콘솔 — 시스템 탭: 메일 연동 요약 + 문서 저장소 현황 + 시스템 정보 + 설정 링크.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, HardDrive, Inbox, Mail as MailIcon, Server, Settings } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'

type MailSettings = { address: string; has_password: boolean }
type MailRow = { uid: string; subject: string; sender: string; date: string }
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

export default function ConsoleSystem() {
  const { user } = useAuth()
  const [mail, setMail] = useState<MailSettings | null>(null)
  const [inbox, setInbox] = useState<MailRow[]>([])
  const [inboxErr, setInboxErr] = useState('')
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    api<{ settings: MailSettings }>('/mail/settings')
      .then((d) => { if (alive) setMail(d?.settings ?? null) })
      .catch(() => {})
    api<StorageInfo>('/files/info')
      .then((d) => { if (alive) setStorage(d) })
      .catch(() => {})
    api('/schools')
      .then(() => { if (alive) setBackendOk(true) })
      .catch(() => { if (alive) setBackendOk(false) })
    return () => { alive = false }
  }, [])

  const connected = Boolean(mail?.address && mail?.has_password)
  useEffect(() => {
    let alive = true
    if (!connected) return
    api<MailRow[]>('/mail/inbox?limit=3')
      .then((d) => { if (alive) setInbox(Array.isArray(d) ? d : []) })
      .catch((e) => { if (alive) setInboxErr(e instanceof Error ? e.message : '수신함 조회 실패') })
    return () => { alive = false }
  }, [connected])

  const modEntries = Object.entries(storage?.modules || {})

  return (
    <div>
      {/* ── 메일 연동 요약 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><MailIcon size={18} /> 이메일 연동</h2>
          <div className="sp" />
          {connected
            ? <span className="pillx ok">연동됨 · {mail?.address}</span>
            : <span className="pillx todo">미연동</span>}
          <Link to="/mail" className="btn btn-ghost"><Inbox size={14} /> 메일함 열기</Link>
          <Link to="/settings" className="btn btn-ghost"><Settings size={14} /> 연동 설정</Link>
        </div>
        <div className="card-body" style={{ padding: '16px 26px' }}>
          {!connected && (
            <div className="muted" style={{ fontSize: 13.5 }}>
              개인 이메일(IMAP)을 연동하면 학교로 발송한 점검·조사지 메일의 회신을 여기서 확인할 수 있습니다.
              [연동 설정]에서 주소와 앱 비밀번호를 등록하세요.
            </div>
          )}
          {connected && inboxErr && <div className="muted" style={{ fontSize: 13.5 }}>수신함 조회 실패: {inboxErr}</div>}
          {connected && !inboxErr && (
            <table className="tbl">
              <thead><tr><th>보낸 사람</th><th>제목</th><th style={{ width: 130 }}>수신일</th></tr></thead>
              <tbody>
                {inbox.map((m) => (
                  <tr key={m.uid}><td>{m.sender}</td><td><b>{m.subject}</b></td><td>{m.date}</td></tr>
                ))}
                {inbox.length === 0 && <tr><td colSpan={3}><div className="tstate">최근 수신 메일이 없습니다.</div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 문서 저장소 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><HardDrive size={18} /> 문서 저장소</h2>
          <div className="sp" />
          {/* 전체 로컬 경로 노출 대신 마지막 2단계만 표시(전체는 title 툴팁) — NAS 이관 시 혼란 방지 */}
          {storage && (
            <span className="pillx na" title={storage.root}>
              …{storage.root.split(/[\\/]/).filter(Boolean).slice(-2).join('/')}
            </span>
          )}
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th>모듈</th><th>저장 경로</th><th className="c" style={{ width: 90 }}>파일 수</th><th className="c" style={{ width: 100 }}>용량</th></tr></thead>
            <tbody>
              {modEntries.map(([k, v]) => (
                <tr key={k}>
                  <td><b>{MODULE_LABEL[k] || k}</b></td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{v.dir}</td>
                  <td className="c">{v.files}</td>
                  <td className="c">{fmtBytes(v.bytes)}</td>
                </tr>
              ))}
              {modEntries.length === 0 && <tr><td colSpan={4}><div className="tstate">저장소 정보를 불러오는 중이거나 파일이 없습니다.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 시스템 정보 ── */}
      <div className="ledger">
        <div className="lh"><h2><Server size={18} /> 시스템 정보</h2></div>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          <div className="kpis" style={{ marginBottom: 0 }}>
            <div className="kpi">
              <div className="l">플랫폼</div>
              <div className="v" style={{ fontSize: 15 }}>학교 안전관리 통합 플랫폼</div>
              <div className="d">한국산업안전협회</div>
            </div>
            <div className="kpi">
              <div className="l">백엔드 상태</div>
              <div className="v" style={{ fontSize: 15 }}>
                {backendOk === null ? '확인 중…' : backendOk
                  ? <span className="pillx ok">온라인</span>
                  : <span className="pillx late">연결 실패</span>}
              </div>
              <div className="d"><Database size={11} style={{ verticalAlign: '-1px' }} /> /api/v1</div>
            </div>
            <div className="kpi">
              <div className="l">로그인 계정</div>
              <div className="v" style={{ fontSize: 15 }}>{user?.login || '—'}</div>
              <div className="d">테넌트 {user?.tenant || '—'} · 개인 설정은 <Link to="/settings">설정</Link>에서</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
