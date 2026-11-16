// 법령 검색 — 키워드로 관련 조문·별표를 찾아 원문을 보고 인용 문구를 복사한다.
//  · 데이터: 백엔드 DB에 적재된 법제처 코퍼스(산안법 체계 등 16개 법령, 일 1회 자동 갱신). 결과는 조문 원문 그대로.
//  · 검색: 서버 BM25(공백 토큰 + 한글 2글자 조각) + 동의어 사전. 법령별 필터·별표 포함 여부.
//  · 본사 관리자: 적재 현황(법령·시행일·조문 수·마지막 동기화)과 [지금 갱신] 버튼.
import { useEffect, useRef, useState } from 'react'
import { Copy, RefreshCw, Scale, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import '../styles/law.css'

type Law = { law_id: string; mst: string; name: string; kind: string; eff_date: string; article_count: number; annex_count: number; fetched_at: string }
type Hit = { id: string; kind: string; law: string; law_kind: string; no: string; title: string; eff_date: string; citation: string; snippet: string; score: number }
type Full = Hit & { text: string }
type Status = { indexed_docs: number; indexed_at: string | null; syncing: boolean; last_error: string | null; oc_configured: boolean; runs: { started_at: string; finished_at: string; ok: boolean; summary: { updated?: unknown[]; unchanged?: unknown[]; errors?: string[] } }[] }

const fmtDate = (d: string) => (d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d || '')
const EXAMPLES = ['사다리 미끄럼방지', '덤웨이터', '분쇄기 덮개', '급식실 환기', 'LPG 누출', '안전보건교육 시간', '건강진단']

export function LawSearch() {
  const { user } = useAuth()
  const isHq = user?.role === 'hq_admin' || user?.role === 'executive'
  const [q, setQ] = useState('')
  const [law, setLaw] = useState('')
  const [annex, setAnnex] = useState(true)
  const [laws, setLaws] = useState<Law[]>([])
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Full | null>(null)
  const [copied, setCopied] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [err, setErr] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    api<Law[]>('/law/laws').then(setLaws).catch(() => setLaws([]))
    if (isHq) api<Status>('/law/status').then(setStatus).catch(() => setStatus(null))
  }, [isHq])

  const run = async (query: string) => {
    if (!query.trim()) { setHits(null); return }
    setBusy(true); setErr('')
    try {
      const r = await api<{ results: Hit[] }>(`/law/search?q=${encodeURIComponent(query.trim())}&limit=30&annex=${annex}${law ? `&law=${law}` : ''}`)
      setHits(r.results)
    } catch (e) {
      setErr((e as Error).message || '검색 실패'); setHits([])
    } finally { setBusy(false) }
  }
  // 입력 멈추면 0.4초 뒤 자동 검색
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void run(q) }, 400)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, law, annex])

  const openDoc = async (h: Hit) => {
    try { setSel(await api<Full>(`/law/articles/${encodeURIComponent(h.id)}`)) } catch { setSel({ ...h, text: h.snippet }) }
  }
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1500) } catch { /* 클립보드 거부 */ }
  }
  const sync = async () => {
    if (!confirm('법제처에서 개정 여부를 확인해 바뀐 법령만 다시 받습니다. 1분쯤 걸립니다. 진행할까요?')) return
    try {
      await api('/law/sync', { method: 'POST', body: JSON.stringify({}) })
      setStatus((s) => (s ? { ...s, syncing: true } : s))
      window.setTimeout(() => api<Status>('/law/status').then(setStatus).catch(() => {}), 60000)
    } catch (e) { alert((e as Error).message) }
  }

  const lastRun = status?.runs?.[0]
  return (
    <div className="law-page">
      <header className="law-head">
        <h1><Scale size={22} /> 법령 검색</h1>
        <p className="law-sub">사물·상황 키워드로 산업안전보건법 체계와 학교·급식·소방 관련 법령의 조문을 찾습니다. 결과는 조문 원문 그대로이며, 출처는 법제처 국가법령정보센터입니다.</p>
      </header>

      <section className="law-card law-search">
        <div className="law-searchrow">
          <Search size={18} className="law-ico" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 사다리 미끄럼방지, 덤웨이터, 분쇄기 덮개, 급식실 환기" />
          <select value={law} onChange={(e) => setLaw(e.target.value)} title="법령 한정">
            <option value="">전체 법령</option>
            {laws.map((l) => <option key={l.mst} value={l.mst}>{l.name}</option>)}
          </select>
          <label className="law-chk"><input type="checkbox" checked={annex} onChange={(e) => setAnnex(e.target.checked)} /> 별표 포함</label>
        </div>
        {!q && (
          <div className="law-examples">
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setQ(x)}>{x}</button>)}
          </div>
        )}
      </section>

      <div className="law-body">
        <section className="law-card law-results">
          {busy && <div className="law-msg">검색 중…</div>}
          {err && <div className="law-msg law-err">{err}</div>}
          {hits && hits.length === 0 && !busy && !err && <div className="law-msg">일치하는 조문이 없습니다. 다른 표현(예: 추락 → 떨어짐)으로 다시 찾아보세요.</div>}
          {hits && hits.length > 0 && <div className="law-count">{hits.length}건</div>}
          {hits?.map((h) => (
            <button key={h.id} type="button" className={'law-hit' + (sel?.id === h.id ? ' on' : '')} onClick={() => openDoc(h)}>
              <div className="law-hit-top">
                <span className={'law-kind k-' + h.kind}>{h.kind === 'annex' ? '별표' : '조문'}</span>
                <span className="law-hit-title">{h.kind === 'annex' ? `[별표 ${h.no}] ${h.title}` : `제${h.no}조${h.title ? `(${h.title})` : ''}`}</span>
              </div>
              <div className="law-hit-law">{h.law} · 시행 {fmtDate(h.eff_date)}</div>
              <div className="law-hit-snip">{h.snippet}</div>
            </button>
          ))}
        </section>

        <aside className="law-card law-doc">
          {!sel ? (
            <div className="law-msg">왼쪽 결과를 누르면 조문 원문이 여기에 나옵니다.</div>
          ) : (
            <>
              <div className="law-doc-cite">
                <strong>{sel.citation}</strong>
                <button type="button" className="law-copy" onClick={() => copy(sel.citation, 'cite')}>
                  <Copy size={13} /> {copied === 'cite' ? '복사됨' : '인용 복사'}
                </button>
              </div>
              <div className="law-doc-meta">{sel.law} ({sel.law_kind}) · 시행 {fmtDate(sel.eff_date)}</div>
              <pre className="law-doc-text">{sel.text}</pre>
              <div className="law-doc-foot">
                <button type="button" className="law-copy" onClick={() => copy(sel.text, 'text')}>
                  <Copy size={13} /> {copied === 'text' ? '복사됨' : '원문 복사'}
                </button>
                <span>출처: 법제처 국가법령정보센터</span>
              </div>
            </>
          )}
        </aside>
      </div>

      {isHq && (
        <section className="law-card law-admin">
          <div className="law-admin-head">
            <h2>적재 현황</h2>
            <div className="law-admin-meta">
              {status ? (
                <>
                  색인 {status.indexed_docs.toLocaleString()}건
                  {lastRun && ` · 마지막 동기화 ${lastRun.finished_at?.slice(0, 16).replace('T', ' ') || '-'} (${lastRun.ok ? '정상' : '오류'}` +
                    `${lastRun.summary?.updated?.length ? ` · 갱신 ${lastRun.summary.updated.length}` : ''})`}
                  {status.syncing && ' · 동기화 진행 중'}
                  {!status.oc_configured && ' · 법제처 인증 ID 미설정(자동 갱신 꺼짐)'}
                </>
              ) : '상태를 불러오지 못했습니다'}
            </div>
            <button type="button" className="law-copy" onClick={sync} disabled={!!status?.syncing || !status?.oc_configured}>
              <RefreshCw size={13} /> 지금 갱신
            </button>
          </div>
          {status?.last_error && <div className="law-msg law-err">{status.last_error}</div>}
          <table className="law-table">
            <thead><tr><th>법령</th><th>구분</th><th>시행일</th><th>조문</th><th>별표·서식</th><th>받은 시각</th></tr></thead>
            <tbody>
              {laws.map((l) => (
                <tr key={l.law_id}>
                  <td>{l.name}</td><td>{l.kind}</td><td>{fmtDate(l.eff_date)}</td>
                  <td className="r">{l.article_count}</td><td className="r">{l.annex_count}</td>
                  <td>{l.fetched_at?.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
