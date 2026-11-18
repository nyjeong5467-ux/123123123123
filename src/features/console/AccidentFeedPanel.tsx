// [181] 외부 산재 데이터 연동(공공데이터 API + CSV 일괄 인입) — 산업재해 화면에서 시스템 관리 › 시스템으로 이동.
//       연동 정보(엔드포인트·서비스 키)는 관리자 화면에서만 다룬다. 동작·API는 기존과 동일.
import { useEffect, useState } from 'react'
import { Siren, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { InfoTip } from '../../components/InfoTip'

type FeedSettings = { endpoint: string; items_path: string; map: Record<string, string>; has_service_key: boolean }
type ImportResult = { created: number; duplicates: number; unmatched: string[]; fetched?: number }

export default function AccidentFeedPanel() {
  const [feed, setFeed] = useState<FeedSettings | null>(null)
  const [feedKey, setFeedKey] = useState('')
  const [feedBusy, setFeedBusy] = useState('')
  const [feedMsg, setFeedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api<{ settings: FeedSettings }>('/accidents/feed-settings')
      .then((d) => setFeed(d.settings))
      .catch(() => setFeed(null))
  }, [])

  async function saveFeed() {
    if (!feed) return
    setFeedBusy('save')
    setFeedMsg(null)
    try {
      const d = await api<{ settings: FeedSettings }>('/accidents/feed-settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: { endpoint: feed.endpoint, items_path: feed.items_path, service_key: feedKey } }),
      })
      setFeed(d.settings)
      setFeedKey('')
      setFeedMsg({ ok: true, text: '연동 설정을 저장했습니다.' })
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  function fmtImport(r: ImportResult): string {
    const parts = [
      r.fetched != null ? `조회 ${r.fetched}건` : null,
      `신규 ${r.created}건`, `중복 제외 ${r.duplicates}건`,
      r.unmatched.length ? `학교 미매칭 ${r.unmatched.length}건(${r.unmatched.slice(0, 3).join(', ')}${r.unmatched.length > 3 ? '…' : ''})` : null,
    ]
    return parts.filter(Boolean).join(' · ')
  }

  async function syncFeed() {
    setFeedBusy('sync')
    setFeedMsg(null)
    try {
      const r = await api<ImportResult>('/accidents/feed-sync', { method: 'POST' })
      setFeedMsg({ ok: true, text: fmtImport(r) })
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : '동기화 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  // CSV 일괄 인입: 학교명,발생일,구분(사고/질병),재해개요[,접수번호]
  async function importCsv(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setFeedBusy('csv')
    setFeedMsg(null)
    try {
      const rows = (await f.text())
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [school = '', date = '', kind = '', summary = '', ref = ''] = l.split(',')
          return {
            school: school.trim(), date: date.trim(),
            kind: kind.includes('질병') || kind.includes('근골') ? 'disease' : kind.includes('사고') ? 'accident' : '',
            summary: summary.trim(), ref: ref.trim(),
          }
        })
        .filter((r) => r.school && !/^(학교|사업장)/.test(r.school))
      if (!rows.length) { setFeedMsg({ ok: false, text: 'CSV에서 행을 찾지 못했습니다. 형식: 학교명,발생일,구분,재해개요[,접수번호]' }); return }
      const r = await api<ImportResult>('/accidents/import', {
        method: 'POST', body: JSON.stringify({ rows }),
      })
      setFeedMsg({ ok: true, text: fmtImport(r) })
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : 'CSV 인입 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  return (
    <div className="ledger" style={{ marginBottom: 24 }}>
      <div className="lh">
        <h2><Siren size={18} /> 외부 산재 데이터 연동
          <InfoTip>공공데이터 API 또는 CSV로 받은 산재 건을 산업재해 › 산재내역에 넣습니다. 학교명이 일치하면 자동 매칭되고 중복은 걸러집니다.</InfoTip></h2>
      </div>
      <div className="card-body">
                <b style={{ fontSize: 13 }}>공공데이터 API (근로복지공단·고용노동부)</b>
        {feed === null && <div className="tstate" style={{ marginTop: 8 }}>설정을 불러오는 중이거나 권한이 없습니다.</div>}
        {feed && (
          <>
            <div className="formrow" style={{ marginTop: 10 }}>
              <label className="field" style={{ flex: 1, minWidth: 260 }}>
                <span>API 엔드포인트</span>
                <input className="input" value={feed.endpoint} placeholder="https://apis.data.go.kr/…"
                  onChange={(e) => setFeed({ ...feed, endpoint: e.target.value })} />
              </label>
              <label className="field" style={{ minWidth: 180 }}>
                <span>서비스 키 {feed.has_service_key && <span className="muted" style={{ fontWeight: 500 }}>(저장됨)</span>}</span>
                <input className="input" type="password" value={feedKey} autoComplete="new-password"
                  placeholder={feed.has_service_key ? '●●●●●●' : '공공데이터포털 인증키'}
                  onChange={(e) => setFeedKey(e.target.value)} />
              </label>
            </div>
            <div className="formrow" style={{ marginTop: 8 }}>
              <label className="field" style={{ flex: 1 }}>
                <span>응답 items 경로 <span className="muted" style={{ fontWeight: 500 }}>(공공데이터포털 표준)</span></span>
                <input className="input" value={feed.items_path}
                  onChange={(e) => setFeed({ ...feed, items_path: e.target.value })} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => void saveFeed()} disabled={feedBusy !== ''}>
                {feedBusy === 'save' ? '저장 중…' : '설정 저장'}
              </button>
              <button className="btn btn-ghost" onClick={() => void syncFeed()} disabled={feedBusy !== '' || !feed.has_service_key}>
                {feedBusy === 'sync' ? '동기화 중…' : '지금 동기화'}
              </button>
            </div>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--line)', margin: '16px 0 12px' }} />
        <b style={{ fontSize: 13 }}>엑셀/CSV 일괄 인입 (공단 제공분·협회 정리분)</b>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn btn-ghost" htmlFor="acc-import-csv" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> {feedBusy === 'csv' ? '인입 중…' : 'CSV 파일 선택'}
          </label>
          <input id="acc-import-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={(e) => { void importCsv(e.target.files); e.target.value = '' }} />
          <span className="muted" style={{ fontSize: 11.5 }}>형식: 학교명,발생일,구분(사고/질병),재해개요[,접수번호]</span>
        </div>

        {feedMsg && (
          <div className="tstate" style={{ marginTop: 14, color: feedMsg.ok ? 'var(--ink-2)' : 'var(--red-ink)' }}>
            {feedMsg.ok ? '✓ ' : '✕ '}{feedMsg.text}
          </div>
        )}
        <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
          학교(사업장)명이 등록 학교와 일치하거나 이름을 포함하면 자동 매칭되고, 접수번호 기준으로 중복이 걸러집니다(재실행 안전).
          질병/근골 키워드는 질병성으로 분류돼 수시 근골격계 조사 연동 대상이 됩니다.
          사업장별 산재 '건' 단위 공개 API는 없어(개인정보) 공단·고용노동부 API 활용 승인 또는 공단 제공 자료를 받으면 키만 넣어 연결하세요.
        </div>
      </div>
    </div>
  )
}
