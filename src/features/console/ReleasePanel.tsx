// [182] 프로그램 다운로드 — 경영 현황에서 시스템 관리 › 시스템으로 이동.
//       GET /release (무인증) 배포 파일(서버 설치본 exe · 현장앱 apk). url은 캐시버스팅 쿼리 포함 — 항상 그대로 사용.
import { useEffect, useState } from 'react'
import { Download, Monitor, TabletSmartphone } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'

type ReleaseFile = { name: string; size: number; modified: string; url: string }
const releaseLabel = (name: string) =>
  name.endsWith('.exe') ? '서버 설치본(PC)' : name.endsWith('.apk') ? '현장앱(태블릿 APK)' : name
const fmtMB = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

export default function ReleasePanel() {
  const [releases, setReleases] = useState<ReleaseFile[] | null | undefined>(undefined) // undefined = 불러오는 중, null = 조회 실패(fail-soft)

  useEffect(() => {
    let alive = true
    api<ReleaseFile[]>('/release')
      .then((d) => { if (alive) setReleases(Array.isArray(d) ? d : null) })
      .catch(() => { if (alive) setReleases(null) })
    return () => { alive = false }
  }, [])

  return (
    <div className="ledger" style={{ marginBottom: 24 }}>
      <div className="lh">
        <h2><Download size={18} /> 프로그램 다운로드
          <InfoTip>본사 서버 PC에 설치하는 <b>서버 설치본</b>과 점검자 태블릿에 설치하는 <b>현장앱(APK)</b> 최신 배포 파일입니다.</InfoTip>
        </h2>
      </div>
      <div style={{ padding: '6px 22px 18px' }}>
        {releases === undefined ? (
          <div className="muted" style={{ fontSize: 12.5 }}>불러오는 중…</div>
        ) : releases === null ? (
          <div className="muted" style={{ fontSize: 12.5 }}>배포 파일 목록을 불러오지 못했습니다.</div>
        ) : releases.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>배포 파일 없음</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {releases.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {f.name.endsWith('.apk')
                  ? <TabletSmartphone size={18} strokeWidth={1.9} style={{ color: 'var(--muted)', flex: 'none' }} />
                  : <Monitor size={18} strokeWidth={1.9} style={{ color: 'var(--muted)', flex: 'none' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{releaseLabel(f.name)}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{fmtMB(f.size)} · 갱신 {(f.modified || '').slice(0, 10)}</div>
                </div>
                <a className="btn btn-primary" style={{ flex: 'none' }} href={f.url} download>
                  <Download size={14} /> 다운로드
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
