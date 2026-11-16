// 법령 검색 — "검색 엔진" 화면. 키워드로 조문·별표를 찾아 원문을 읽고 인용 문구를 복사한다.
//  · 첫 화면: 가운데 큰 검색창 + 추천 주제 칩 + 최근 검색어(localStorage) + 적재 법령 카드(클릭 → 그 법령으로 범위 고정)
//  · 결과 화면: 상단 고정 검색창 / 왼쪽 패싯(법령·종류·시행연도) / 가운데 결과 목록(하이라이트, 20개씩 더 보기) / 오른쪽 원문 패널
//  · 원문 패널: 인용·원문 복사, 법제처 새 창, 같은 법령 앞뒤 조문 이동, 관련 조문(같은 검색 결과 중 같은 법령 상위 5)
//  · 타이핑 중 300ms 디바운스 미리보기 5건(↑↓ Enter Esc), Enter 로 전체 검색. URL ?q=&law= 동기화(뒤로가기·공유)
//  · 데이터: 서버 BM25(공백 토큰 + 한글 2글자 조각, 동의어 확장) — 결과는 한 번에 300건 받아 클라이언트에서 패싯·정렬·페이지 처리, 60초 메모리 캐시
//  · 본사 관리자(hq_admin·executive): 오른쪽 위 톱니 → 서랍(적재 현황·마지막 동기화·[지금 갱신]). 일반 사용자에게는 보이지 않음
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Clock, Copy, ExternalLink, Loader2,
  RefreshCw, Scale, Search, Settings, SlidersHorizontal, Trash2, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import '../styles/law.css'

// ---------- 타입 ----------
type Law = { law_id: string; mst: string; name: string; kind: string; eff_date: string; article_count: number; annex_count: number; fetched_at: string }
type Hit = { id: string; kind: 'article' | 'annex'; law: string; law_short: string; law_kind: string; no: string; title: string; eff_date: string; citation: string; snippet: string; score: number }
type Full = Hit & { text: string }
type SearchRes = { query: string; count: number; results: Hit[]; source: string }
type Status = {
  indexed_docs: number; indexed_at: string | null; syncing: boolean; last_error: string | null; oc_configured: boolean
  runs: { started_at: string; finished_at: string; ok: boolean; summary: { updated?: unknown[]; unchanged?: unknown[]; errors?: string[] } }[]
}
type SortKey = 'rel' | 'law' | 'no'

// ---------- 상수 ----------
const PAGE = 20
const LIMIT = 300
const CACHE_MS = 60_000
const RECENT_KEY = 'law.recent.v1'
const RECENT_MAX = 8
const SOURCE = '출처: 법제처 국가법령정보센터 — 결과는 조문 원문 그대로이며 해석을 덧붙이지 않습니다.'

// 플레이스홀더 예시(3초마다 회전)
const EXAMPLES = ['사다리 미끄럼방지', '덤웨이터 안전검사', '분쇄기 덮개', '급식실 환기', 'LPG 누출 경보', '안전보건교육 시간', '특수건강진단 주기', '안전난간 높이']

// 추천 주제 칩 — 현장(학교·급식실)에서 자주 찾는 사물·상황 묶음
const TOPICS: { label: string; q: string }[] = [
  { label: '떨어짐·사다리', q: '사다리 떨어짐' },
  { label: '끼임·회전체', q: '회전체 끼임 덮개' },
  { label: '감전·전기', q: '감전 충전부' },
  { label: '가스·화재', q: '가스 누출 화재' },
  { label: '급식 기계·칼날', q: '절단기 칼날 방호' },
  { label: '보호구', q: '보호구 지급' },
  { label: '환기·고온', q: '환기 고열' },
  { label: '건강진단·교육', q: '건강진단 안전보건교육' },
  { label: '승강기·덤웨이터', q: '승강기 덤웨이터' },
  { label: '표지', q: '안전보건표지' },
]

// 동의어(백엔드 app/assets/law_synonyms.json 과 같은 내용) — 하이라이트와 "다른 표현 제안"에 쓴다. 검색 확장은 서버가 한다.
const SYN: Record<string, string[]> = {
  추락: ['떨어짐'], 떨어짐: ['추락'], 넘어짐: ['전도', '미끄러짐'], 미끄러짐: ['넘어짐', '전도'],
  끼임: ['협착', '말려'], 말려들: ['끼임', '협착'], 베임: ['절단', '날접촉', '칼날'], 화상: ['고열', '뜨거운', '열탕'],
  감전: ['전기', '충전부', '누전', '접지'], 사다리: ['이동식 사다리', '승강설비', '안전난간'],
  고소작업: ['높은 장소', '추락', '안전대', '작업발판'], 덤웨이터: ['리프트', '승강기', '화물용 엘리베이터'],
  리프트: ['덤웨이터', '승강기'], 엘리베이터: ['승강기', '리프트'], 승강기: ['엘리베이터', '리프트'],
  분쇄기: ['파쇄기', '회전체', '방호장치', '덮개'], 절단기: ['날접촉', '방호장치', '덮개', '칼날'],
  회전체: ['회전축', '벨트', '체인', '덮개', '방호'], 국솥: ['조리', '뜨거운', '고열', '화상'],
  가스: ['LPG', '액화석유가스', '누출', '가스누설'], LPG: ['액화석유가스', '가스'], 후드: ['국소배기장치', '환기'],
  환기: ['국소배기', '전체환기', '환기장치'], 조명: ['조도', '채광'], 통로: ['통행로', '안전통로', '장애물'],
  소화기: ['소방시설', '소화설비'], 보호구: ['개인보호구', '안전장화', '장갑', '보안경'], 장화: ['보호구', '미끄러짐'],
  지게차: ['차량계 하역운반기계'], 밀폐: ['밀폐공간', '산소결핍', '질식'], 온열: ['폭염', '고열작업', '휴식'],
  스트레칭: ['근골격계', '유해요인조사', '휴식'], 근골격계: ['근골격계부담작업', '유해요인조사'],
  안전교육: ['안전보건교육', '교육'], 교육: ['안전보건교육'], 작업환경측정: ['작업환경', '측정'],
  건강진단: ['특수건강진단', '일반건강진단'], 안전보건표지: ['경고표지', '표지'], 표지: ['안전보건표지', '경고표지'],
}

// ---------- 유틸 ----------
const fmtDate = (d: string) => (d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d || '')
const fmtTs = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '-')
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const numNo = (no: string) => parseInt(no, 10) || 0
// 법령 구분 → 배지 색 계열(법률 / 대통령령 / 부령·규칙)
const kindClass = (k: string) => (/법률/.test(k) ? 'k-act' : /대통령령/.test(k) ? 'k-decree' : 'k-rule')
const hitLabel = (h: Hit) => (h.kind === 'annex' ? `[별표 ${h.no}] ${h.title}` : `제${h.no}조${h.title ? `(${h.title})` : ''}`)
// 원문 첫 줄에서 "제42조의2" 같은 정확한 조문 표기를 뽑는다(가지번호 포함). 없으면 no 로 만든다.
const articleLabel = (d: Full) => (d.kind === 'article' ? d.text.match(/^제\d+조(의\d+)?/)?.[0] || `제${d.no}조` : '')
const lawGoKrUrl = (d: Full) =>
  d.kind === 'article'
    ? `https://www.law.go.kr/법령/${encodeURIComponent(d.law)}/${encodeURIComponent(articleLabel(d))}`
    : `https://www.law.go.kr/법령/${encodeURIComponent(d.law)}`

// 검색어 → 하이라이트 토큰(2글자 이상) + 동의어. 정규식은 이스케이프.
function highlightTerms(q: string): string[] {
  const base = q.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2)
  const out = new Set<string>(base)
  const flat = q.replace(/\s+/g, '')
  for (const [k, alts] of Object.entries(SYN)) {
    if (flat.includes(k)) for (const a of alts) if (a.length >= 2) out.add(a)
  }
  return [...out].sort((a, b) => b.length - a.length)
}
function buildRe(terms: string[]): RegExp | null {
  if (!terms.length) return null
  return new RegExp(`(${terms.map(escRe).join('|')})`, 'gi')
}
function Highlight({ text, re }: { text: string; re: RegExp | null }) {
  if (!re || !text) return <>{text}</>
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}
// 다른 표현 제안 — 검색어에 들어 있는 동의어 키의 대체어
function altSuggestions(q: string): string[] {
  const flat = q.replace(/\s+/g, '')
  const out = new Set<string>()
  for (const [k, alts] of Object.entries(SYN)) if (flat.includes(k)) alts.forEach((a) => out.add(a))
  return [...out].slice(0, 6)
}

// 60초 메모리 캐시(같은 q·law·annex·limit)
const cache = new Map<string, { t: number; res: SearchRes }>()
async function searchApi(q: string, opts: { law?: string; annex?: boolean; limit?: number }): Promise<SearchRes> {
  const limit = opts.limit ?? LIMIT
  const key = `${q}|${opts.law || ''}|${opts.annex !== false}|${limit}`
  const c = cache.get(key)
  if (c && Date.now() - c.t < CACHE_MS) return c.res
  const res = await api<SearchRes>(
    `/law/search?q=${encodeURIComponent(q)}&limit=${limit}&annex=${opts.annex !== false}${opts.law ? `&law=${encodeURIComponent(opts.law)}` : ''}`,
  )
  cache.set(key, { t: Date.now(), res })
  return res
}

// 최근 검색어(localStorage)
function loadRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [] } catch { return [] }
}
function saveRecent(list: string[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* 무시 */ } }

// 화면 폭(패싯 3단 / 2단 / 모달)
function useMedia(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setM(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return m
}

// 원문 줄 → 들여쓰기 단계(항 ①… / 호 1. / 목 가.)
function lineLevel(line: string): number {
  if (/^[①-⑳]/.test(line)) return 1
  if (/^\d{1,2}\.\s?/.test(line)) return 2
  if (/^[가-힣]\.\s?/.test(line)) return 3
  return 0
}

// ---------- 페이지 ----------
export function LawSearch() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const lawMst = params.get('law') || ''
  const narrow = useMedia('(max-width: 899px)')
  const wide = useMedia('(min-width: 1280px)')

  // 본사 관리자 여부 — /auth/me 의 role(hq_admin·executive)
  const [isHq, setIsHq] = useState(false)
  useEffect(() => {
    api<{ role?: string }>('/auth/me').then((me) => setIsHq(me.role === 'hq_admin' || me.role === 'executive')).catch(() => setIsHq(false))
  }, [])

  const [laws, setLaws] = useState<Law[]>([])
  useEffect(() => { api<Law[]>('/law/laws').then(setLaws).catch(() => setLaws([])) }, [])
  const lawByMst = useMemo(() => new Map(laws.map((l) => [l.mst, l])), [laws])
  const scopeLaw = lawMst ? lawByMst.get(lawMst) : undefined

  // 입력창
  const [input, setInput] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setInput(q) }, [q])
  const [phIdx, setPhIdx] = useState(0)
  useEffect(() => { const t = window.setInterval(() => setPhIdx((i) => (i + 1) % EXAMPLES.length), 3000); return () => window.clearInterval(t) }, [])

  // 최근 검색어
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const pushRecent = (s: string) => setRecent((r) => { const next = [s, ...r.filter((x) => x !== s)].slice(0, RECENT_MAX); saveRecent(next); return next })
  const dropRecent = (s: string) => setRecent((r) => { const next = r.filter((x) => x !== s); saveRecent(next); return next })

  // 검색 실행(URL 반영 → effect 가 조회)
  const submit = useCallback((text: string, mst: string = lawMst) => {
    const t = text.trim()
    if (!t) return
    const next = new URLSearchParams()
    next.set('q', t)
    if (mst) next.set('law', mst)
    setParams(next)
    pushRecent(t)
    setPreviewOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawMst, setParams])
  const setScope = (mst: string) => {
    const next = new URLSearchParams(params)
    if (mst) next.set('law', mst); else next.delete('law')
    setParams(next)
    inputRef.current?.focus()
  }
  const goHome = () => { setParams(new URLSearchParams()); setSel(null); setHits(null) }

  // 결과
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [annex, setAnnex] = useState(true)
  const [sort, setSort] = useState<SortKey>('rel')
  const [lawSel, setLawSel] = useState<Set<string>>(new Set())
  const [kindSel, setKindSel] = useState<'all' | 'article' | 'annex'>('all')
  const [yearSel, setYearSel] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const [facetOpen, setFacetOpen] = useState(false)
  const reqSeq = useRef(0)

  useEffect(() => {
    if (!q) { setHits(null); setErr(''); return }
    const seq = ++reqSeq.current
    setBusy(true); setErr('')
    const t0 = performance.now()
    searchApi(q, { law: lawMst || undefined, annex })
      .then((r) => { if (seq !== reqSeq.current) return; setHits(r.results); setElapsed((performance.now() - t0) / 1000) })
      .catch((e) => { if (seq !== reqSeq.current) return; setErr((e as Error).message || '검색 실패'); setHits([]) })
      .finally(() => { if (seq === reqSeq.current) setBusy(false) })
    // 새 검색이면 패싯·페이지 초기화
    setLawSel(new Set()); setKindSel('all'); setYearSel(new Set()); setShown(PAGE); setSel(null)
  }, [q, lawMst, annex])

  const terms = useMemo(() => highlightTerms(q), [q])
  const re = useMemo(() => buildRe(terms), [terms])

  // 패싯 집계(전체 결과 기준)
  const facets = useMemo(() => {
    const byLaw = new Map<string, number>(); const byKind = { article: 0, annex: 0 }; const byYear = new Map<string, number>()
    for (const h of hits || []) {
      byLaw.set(h.law, (byLaw.get(h.law) || 0) + 1)
      byKind[h.kind] += 1
      const y = h.eff_date?.slice(0, 4) || '기타'
      byYear.set(y, (byYear.get(y) || 0) + 1)
    }
    return {
      laws: [...byLaw.entries()].sort((a, b) => b[1] - a[1]),
      kinds: byKind,
      years: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    }
  }, [hits])

  // 필터 → 정렬
  const filtered = useMemo(() => {
    let list = (hits || []).filter((h) =>
      (lawSel.size === 0 || lawSel.has(h.law)) &&
      (kindSel === 'all' || h.kind === kindSel) &&
      (yearSel.size === 0 || yearSel.has(h.eff_date?.slice(0, 4) || '기타')))
    if (sort === 'law') list = [...list].sort((a, b) => a.law.localeCompare(b.law, 'ko') || (a.kind === b.kind ? 0 : a.kind === 'article' ? -1 : 1) || numNo(a.no) - numNo(b.no))
    else if (sort === 'no') list = [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'article' ? -1 : 1) || numNo(a.no) - numNo(b.no) || a.law.localeCompare(b.law, 'ko'))
    return list
  }, [hits, lawSel, kindSel, yearSel, sort])
  const visible = filtered.slice(0, shown)
  const toggleIn = (set: Set<string>, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n }

  // 원문 패널
  const [sel, setSel] = useState<Full | null>(null)
  const [selBusy, setSelBusy] = useState(false)
  const [navBusy, setNavBusy] = useState<'prev' | 'next' | ''>('')
  const [copied, setCopied] = useState('')
  const openDoc = async (h: Hit) => {
    setSelBusy(true)
    try { setSel(await api<Full>(`/law/articles/${encodeURIComponent(h.id)}`)) } catch { setSel({ ...h, text: h.snippet }) } finally { setSelBusy(false) }
  }
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1500) } catch { /* 클립보드 거부 */ }
  }
  // 같은 법령 안에서 앞뒤 조문 찾기 — id 규칙에 기대지 않고 search?law=<mst>&q=제N조 로 찾아 no·첫 줄 표기가 정확히 맞는 것을 고른다.
  //   삭제된 조문 번호는 건너뛰도록 최대 3번까지 번호를 늘리거나 줄여 본다. 가지조문(제42조의2 등)은 번호 기준으로만 이동한다(가정).
  const findArticle = async (mst: string, n: number): Promise<Hit | null> => {
    const r = await searchApi(`제${n}조`, { law: mst, annex: false, limit: 40 })
    const re1 = new RegExp(`^제${n}조(?!의)`)
    return r.results.find((h) => h.kind === 'article' && h.no === String(n) && re1.test(h.snippet)) || r.results.find((h) => h.kind === 'article' && h.no === String(n)) || null
  }
  const stepArticle = async (dir: 1 | -1) => {
    if (!sel || sel.kind !== 'article') return
    const mst = [...lawByMst.values()].find((l) => l.name === sel.law)?.mst
    if (!mst) return
    setNavBusy(dir > 0 ? 'next' : 'prev')
    try {
      let n = numNo(sel.no)
      for (let i = 0; i < 3; i++) {
        n += dir
        if (n < 1) break
        const h = await findArticle(mst, n)
        if (h) { await openDoc(h); return }
      }
    } finally { setNavBusy('') }
  }
  // 관련 조문: 같은 검색 결과 중 같은 법령 상위 5(자기 자신 제외)
  const related = useMemo(() => (sel && hits ? hits.filter((h) => h.law === sel.law && h.id !== sel.id).slice(0, 5) : []), [sel, hits])
  const docLines = useMemo(() => (sel ? sel.text.split('\n') : []), [sel])

  // 미리보기(300ms 디바운스, 상위 5건)
  const [preview, setPreview] = useState<Hit[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(-1)
  const pvTimer = useRef<number | null>(null)
  useEffect(() => {
    const t = input.trim()
    if (pvTimer.current) window.clearTimeout(pvTimer.current)
    if (!t || t === q) { setPreview([]); setPreviewOpen(false); return }
    pvTimer.current = window.setTimeout(() => {
      searchApi(t, { law: lawMst || undefined, annex: true, limit: 5 })
        .then((r) => { if (inputRef.current?.value.trim() === t) { setPreview(r.results); setPreviewOpen(r.results.length > 0); setPreviewIdx(-1) } })
        .catch(() => setPreview([]))
    }, 300)
    return () => { if (pvTimer.current) window.clearTimeout(pvTimer.current) }
  }, [input, q, lawMst])
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setPreviewOpen(false); return }
    if (previewOpen && preview.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPreviewIdx((i) => (i + 1) % preview.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPreviewIdx((i) => (i <= 0 ? preview.length - 1 : i - 1)); return }
      if (e.key === 'Enter' && previewIdx >= 0) { e.preventDefault(); const h = preview[previewIdx]; submit(input); void openDoc(h); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit(input) }
  }

  // 관리 서랍(본사 전용)
  const [drawer, setDrawer] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const loadStatus = useCallback(() => api<Status>('/law/status').then(setStatus).catch(() => setStatus(null)), [])
  useEffect(() => { if (isHq && drawer) void loadStatus() }, [isHq, drawer, loadStatus])
  const sync = async () => {
    if (!confirm('법제처에서 개정 여부를 확인해 바뀐 법령만 다시 받습니다. 1분쯤 걸립니다. 진행할까요?')) return
    try {
      await api('/law/sync', { method: 'POST', body: JSON.stringify({}) })
      setStatus((s) => (s ? { ...s, syncing: true } : s))
      window.setTimeout(() => { void loadStatus(); api<Law[]>('/law/laws').then(setLaws).catch(() => {}) }, 60000)
    } catch (e) { alert((e as Error).message) }
  }
  const lastRun = status?.runs?.[0]

  const searching = !!q
  const alt = useMemo(() => altSuggestions(q), [q])

  // ---------- 검색창(홈·결과 공용) ----------
  const searchBox = (compact: boolean) => (
    <div className={'law-box' + (compact ? ' compact' : '') + (previewOpen ? ' open' : '')} role="search">
      <div className="law-box-row">
        <Search size={compact ? 18 : 22} className="law-box-ico" aria-hidden />
        {scopeLaw && (
          <span className="law-scope" title="이 법령 안에서만 찾습니다">
            {scopeLaw.name}
            <button type="button" aria-label="범위 해제" onClick={() => setScope('')}><X size={12} /></button>
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => { if (preview.length && input.trim() !== q) setPreviewOpen(true) }}
          onBlur={() => window.setTimeout(() => setPreviewOpen(false), 120)}
          placeholder={`예: ${EXAMPLES[phIdx]}`}
          aria-label="법령 검색어"
          aria-autocomplete="list"
          aria-expanded={previewOpen}
          enterKeyHint="search"
        />
        {input && <button type="button" className="law-box-clear" aria-label="지우기" onClick={() => { setInput(''); inputRef.current?.focus() }}><X size={16} /></button>}
        <button type="button" className="law-box-go" onClick={() => submit(input)} disabled={!input.trim()}>검색</button>
      </div>
      {previewOpen && preview.length > 0 && (
        <ul className="law-preview" role="listbox" aria-label="미리보기">
          {preview.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === previewIdx} className={i === previewIdx ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); submit(input); void openDoc(h) }} onMouseEnter={() => setPreviewIdx(i)}>
              <span className={'law-badge ' + kindClass(h.law_kind)}>{h.law_short || h.law}</span>
              <span className="law-preview-t"><Highlight text={hitLabel(h)} re={buildRe(highlightTerms(input))} /></span>
              <span className="law-preview-s"><Highlight text={h.snippet.slice(0, 80)} re={buildRe(highlightTerms(input))} /></span>
            </li>
          ))}
          <li className="law-preview-foot">Enter: 전체 결과 보기 · ↑↓ 선택 · Esc 닫기</li>
        </ul>
      )}
    </div>
  )

  // ---------- 원문 패널 내용(패널·모달 공용) ----------
  const docBody = sel && (
    <div className="law-doc">
      <div className="law-doc-head">
        <span className={'law-badge ' + kindClass(sel.law_kind)}>{sel.law_kind || '법령'}</span>
        <span className="law-doc-meta">{sel.law} · 시행 {fmtDate(sel.eff_date)}</span>
      </div>
      <h3 className="law-doc-cite">{sel.citation}</h3>
      <div className="law-doc-actions">
        <button type="button" className="law-act" onClick={() => copy(sel.citation, 'cite')}>{copied === 'cite' ? <Check size={13} /> : <Copy size={13} />} {copied === 'cite' ? '복사됨' : '인용 복사'}</button>
        <button type="button" className="law-act" onClick={() => copy(`${sel.citation}\n${sel.text}`, 'text')}>{copied === 'text' ? <Check size={13} /> : <Copy size={13} />} {copied === 'text' ? '복사됨' : '원문 복사'}</button>
        <a className="law-act" href={lawGoKrUrl(sel)} target="_blank" rel="noopener noreferrer" title="법제처 원문 새 창"><ExternalLink size={13} /> 법제처</a>
        {sel.kind === 'article' && (
          <span className="law-doc-nav">
            <button type="button" className="law-act" onClick={() => void stepArticle(-1)} disabled={!!navBusy || numNo(sel.no) <= 1} title="앞 조문">{navBusy === 'prev' ? <Loader2 size={13} className="law-spin" /> : <ArrowLeft size={13} />} 앞 조문</button>
            <button type="button" className="law-act" onClick={() => void stepArticle(1)} disabled={!!navBusy} title="뒤 조문">뒤 조문 {navBusy === 'next' ? <Loader2 size={13} className="law-spin" /> : <ArrowRight size={13} />}</button>
          </span>
        )}
      </div>
      <div className="law-doc-text">
        {docLines.map((line, i) => (
          <p key={i} className={'law-line lv' + (i === 0 ? 'h' : lineLevel(line))}><Highlight text={line} re={re} /></p>
        ))}
      </div>
      {related.length > 0 && (
        <div className="law-related">
          <div className="law-related-h">같은 법령의 관련 조문</div>
          {related.map((h) => (
            <button key={h.id} type="button" className="law-related-i" onClick={() => void openDoc(h)}>
              <span className="law-related-t">{hitLabel(h)}</span>
              <span className="law-related-s">{h.snippet.slice(0, 70)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="law-doc-foot">{SOURCE}</div>
    </div>
  )

  // ---------- 패싯 ----------
  const facetBody = hits && hits.length > 0 && (
    <div className="law-facets">
      <div className="law-facet">
        <div className="law-facet-h">법령 {lawSel.size > 0 && <button type="button" onClick={() => setLawSel(new Set())}>해제</button>}</div>
        {facets.laws.map(([name, n]) => (
          <label key={name} className={'law-facet-i' + (lawSel.has(name) ? ' on' : '')}>
            <input type="checkbox" checked={lawSel.has(name)} onChange={() => { setLawSel(toggleIn(lawSel, name)); setShown(PAGE) }} />
            <span className="law-facet-l">{name}</span>
            <span className="law-facet-n">{n}</span>
          </label>
        ))}
      </div>
      <div className="law-facet">
        <div className="law-facet-h">종류</div>
        {([['all', '전체', facets.kinds.article + facets.kinds.annex], ['article', '조문', facets.kinds.article], ['annex', '별표·서식', facets.kinds.annex]] as const).map(([k, l, n]) => (
          <label key={k} className={'law-facet-i' + (kindSel === k ? ' on' : '')}>
            <input type="radio" name="law-kind" checked={kindSel === k} onChange={() => { setKindSel(k); setShown(PAGE) }} />
            <span className="law-facet-l">{l}</span>
            <span className="law-facet-n">{n}</span>
          </label>
        ))}
      </div>
      <div className="law-facet">
        <div className="law-facet-h">시행연도 {yearSel.size > 0 && <button type="button" onClick={() => setYearSel(new Set())}>해제</button>}</div>
        {facets.years.map(([y, n]) => (
          <label key={y} className={'law-facet-i' + (yearSel.has(y) ? ' on' : '')}>
            <input type="checkbox" checked={yearSel.has(y)} onChange={() => { setYearSel(toggleIn(yearSel, y)); setShown(PAGE) }} />
            <span className="law-facet-l">{y}</span>
            <span className="law-facet-n">{n}</span>
          </label>
        ))}
      </div>
    </div>
  )

  const activeFilters = lawSel.size + (kindSel !== 'all' ? 1 : 0) + yearSel.size

  return (
    <div className={'page law-page' + (searching ? ' searching' : ' home') + (isHq ? ' has-gear' : '')}>
      {/* 본사 전용: 적재 현황 서랍 토글 */}
      {isHq && (
        <button type="button" className={'law-gear' + (drawer ? ' on' : '')} title="적재 현황·동기화(본사)" aria-label="적재 현황" onClick={() => setDrawer((v) => !v)}>
          <Settings size={17} />
        </button>
      )}

      {!searching ? (
        // ======================= 첫 화면 =======================
        <div className="law-home">
          <div className="breadcrumb law-crumb"><Link to="/">홈</Link> / <b>법령 검색</b></div>
          <div className="law-hero">
            <div className="law-hero-t"><Scale size={28} /> 법령 검색</div>
            <p className="law-hero-s">사물·상황 키워드로 산업안전보건법 체계와 학교·급식·소방 관련 법령의 조문을 찾습니다.</p>
          </div>
          {searchBox(false)}
          <div className="law-topics" aria-label="추천 주제">
            {TOPICS.map((t) => <button key={t.label} type="button" className="law-chip" onClick={() => submit(t.q)}>{t.label}</button>)}
          </div>
          {recent.length > 0 && (
            <div className="law-recent">
              <div className="law-sec-h"><Clock size={14} /> 최근 검색어 <button type="button" className="law-link" onClick={() => { setRecent([]); saveRecent([]) }}><Trash2 size={12} /> 모두 지우기</button></div>
              <div className="law-recent-l">
                {recent.map((r) => (
                  <span key={r} className="law-chip soft">
                    <button type="button" onClick={() => submit(r)}>{r}</button>
                    <button type="button" aria-label={`${r} 삭제`} className="law-chip-x" onClick={() => dropRecent(r)}><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="law-laws">
            <div className="law-sec-h"><BookOpen size={14} /> 적재된 법령 {laws.length}개 <span className="law-sec-hint">카드를 누르면 그 법령 안에서만 찾습니다</span></div>
            <div className="law-laws-g">
              {laws.map((l) => (
                <button key={l.law_id} type="button" className="law-lawcard" onClick={() => setScope(l.mst)}>
                  <span className={'law-badge ' + kindClass(l.kind)}>{l.kind}</span>
                  <span className="law-lawcard-n">{l.name}</span>
                  <span className="law-lawcard-m">시행 {fmtDate(l.eff_date)} · 조문 {l.article_count}{l.annex_count ? ` · 별표 ${l.annex_count}` : ''}</span>
                </button>
              ))}
              {laws.length === 0 && <div className="law-msg">법령 목록을 불러오는 중…</div>}
            </div>
          </div>
          <div className="law-src">{SOURCE}</div>
        </div>
      ) : (
        // ======================= 결과 화면 =======================
        <div className="law-results">
          <div className="law-topbar">
            <button type="button" className="law-brand" onClick={goHome} title="처음으로"><Scale size={20} /><span>법령 검색</span></button>
            {searchBox(true)}
          </div>
          <div className="law-statbar">
            <div className="law-stat">
              {busy ? <><Loader2 size={14} className="law-spin" /> 검색 중…</> : err ? <span className="law-err">{err}</span>
                : hits ? <>결과 <b>{filtered.length.toLocaleString()}</b>건{filtered.length !== hits.length && <span className="law-stat-sub"> / 전체 {hits.length}</span>} · {elapsed.toFixed(2)}초{hits.length >= LIMIT && <span className="law-stat-sub"> · 상위 {LIMIT}건만</span>}</> : null}
            </div>
            <div className="law-stat-tools">
              {!wide && hits && hits.length > 0 && (
                <button type="button" className={'law-tool' + (facetOpen ? ' on' : '')} onClick={() => setFacetOpen((v) => !v)}>
                  <SlidersHorizontal size={13} /> 필터{activeFilters > 0 && <b className="law-tool-n">{activeFilters}</b>}{facetOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
              <label className="law-tool">정렬
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="정렬">
                  <option value="rel">관련도</option><option value="law">법령순</option><option value="no">조문번호</option>
                </select>
              </label>
              <label className="law-tool law-toggle">
                <input type="checkbox" checked={annex} onChange={(e) => setAnnex(e.target.checked)} /> 별표 포함
              </label>
            </div>
          </div>

          <div className={'law-grid' + (sel ? ' has-doc' : '') + (!hits || hits.length === 0 ? ' no-cols' : '')}>
            {/* 왼쪽 패싯 — 넓은 화면은 항상, 중간 화면은 접힘 */}
            {hits && hits.length > 0 && (wide || facetOpen) && <aside className="law-col-facet">{facetBody}</aside>}

            {/* 가운데 결과 목록 */}
            <section className="law-col-list" aria-live="polite">
              {!busy && !err && hits && hits.length === 0 && (
                <div className="law-empty">
                  <div className="law-empty-t">「{q}」에 맞는 조문이 없습니다.</div>
                  <div className="law-empty-s">다른 표현으로 다시 찾아보세요{alt.length === 0 && ' (예: 추락 → 떨어짐, 협착 → 끼임)'}.</div>
                  {alt.length > 0 && <div className="law-topics">{alt.map((a) => <button key={a} type="button" className="law-chip" onClick={() => submit(a)}>{a}</button>)}</div>}
                  <div className="law-empty-s" style={{ marginTop: 12 }}>추천 주제</div>
                  <div className="law-topics">{TOPICS.map((t) => <button key={t.label} type="button" className="law-chip soft" onClick={() => submit(t.q)}>{t.label}</button>)}</div>
                  {scopeLaw && <button type="button" className="law-link" onClick={() => setScope('')}>범위 해제하고 전체 법령에서 찾기</button>}
                </div>
              )}
              {hits && hits.length > 0 && filtered.length === 0 && (
                <div className="law-empty"><div className="law-empty-t">선택한 필터에 맞는 결과가 없습니다.</div>
                  <button type="button" className="law-link" onClick={() => { setLawSel(new Set()); setKindSel('all'); setYearSel(new Set()) }}>필터 모두 해제</button></div>
              )}
              {visible.map((h) => (
                <article key={h.id} className={'law-hit' + (sel?.id === h.id ? ' on' : '')}>
                  <button type="button" className="law-hit-main" onClick={() => void openDoc(h)} aria-label={`${h.citation} 원문 보기`}>
                    <div className="law-hit-top">
                      <span className={'law-badge ' + kindClass(h.law_kind)}>{h.law_short || h.law}</span>
                      {h.kind === 'annex' && <span className="law-badge k-annex">별표</span>}
                      <span className="law-hit-law">「{h.law}」</span>
                      <span className="law-hit-date">시행 {fmtDate(h.eff_date)}</span>
                    </div>
                    <div className="law-hit-title"><Highlight text={hitLabel(h)} re={re} /></div>
                    <div className="law-hit-snip"><Highlight text={h.snippet} re={re} /></div>
                  </button>
                  <div className="law-hit-acts">
                    <button type="button" className="law-mini" title="인용 복사" aria-label="인용 복사" onClick={() => copy(h.citation, 'c:' + h.id)}>{copied === 'c:' + h.id ? <Check size={14} /> : <Copy size={14} />}</button>
                    <button type="button" className="law-mini" title="원문 보기" aria-label="원문 보기" onClick={() => void openDoc(h)}><BookOpen size={14} /></button>
                  </div>
                </article>
              ))}
              {filtered.length > shown && (
                <button type="button" className="law-more" onClick={() => setShown((n) => n + PAGE)}>
                  더 보기 <span className="law-stat-sub">({Math.min(shown, filtered.length)} / {filtered.length})</span> <ChevronDown size={14} />
                </button>
              )}
              {hits && hits.length > 0 && <div className="law-src">{SOURCE}</div>}
            </section>

            {/* 오른쪽 원문 패널(900 이상) */}
            {!narrow && hits && hits.length > 0 && (
              <aside className="law-col-doc">
                {selBusy && !sel ? <div className="law-msg"><Loader2 size={14} className="law-spin" /> 원문을 불러오는 중…</div>
                  : sel ? <div className="law-doc-wrap">{selBusy && <div className="law-doc-loading"><Loader2 size={14} className="law-spin" /></div>}{docBody}</div>
                    : <div className="law-doc-ph"><BookOpen size={28} /><p>결과를 누르면 조문 원문이 여기에 나옵니다.</p><small>인용 복사 · 원문 복사 · 법제처 원문 · 앞뒤 조문 이동</small></div>}
              </aside>
            )}
          </div>
        </div>
      )}

      {/* 좁은 화면: 원문 모달 */}
      {narrow && sel && (
        <Modal title={<span className="law-modal-t"><Scale size={16} /> 조문 원문</span>} onClose={() => setSel(null)} width={760}>
          {docBody}
        </Modal>
      )}

      {/* 본사 전용: 적재 현황 서랍 */}
      {isHq && drawer && (
        <>
          <div className="law-drawer-bg" onClick={() => setDrawer(false)} />
          <aside className="law-drawer" role="dialog" aria-label="적재 현황">
            <div className="law-drawer-h">
              <h2><Settings size={16} /> 적재 현황</h2>
              <button type="button" className="law-mini" aria-label="닫기" onClick={() => setDrawer(false)}><X size={16} /></button>
            </div>
            <div className="law-drawer-meta">
              {status ? (
                <>
                  <div>색인 <b>{status.indexed_docs.toLocaleString()}</b>건 · 법령 {laws.length}개</div>
                  <div>마지막 동기화 {fmtTs(lastRun?.finished_at)}{lastRun && ` (${lastRun.ok ? '정상' : '오류'}${lastRun.summary?.updated?.length ? ` · 갱신 ${lastRun.summary.updated.length}` : ''})`}</div>
                  {status.syncing && <div className="law-amber"><Loader2 size={12} className="law-spin" /> 동기화 진행 중</div>}
                  {!status.oc_configured && <div className="law-amber">법제처 인증 ID 미설정 — 자동 갱신 꺼짐</div>}
                  {status.last_error && <div className="law-err">{status.last_error}</div>}
                </>
              ) : '상태를 불러오는 중…'}
            </div>
            <button type="button" className="law-act primary" onClick={sync} disabled={!!status?.syncing || !status?.oc_configured}><RefreshCw size={13} /> 지금 갱신</button>
            <table className="law-table">
              <thead><tr><th>법령</th><th>시행일</th><th className="r">조문</th><th className="r">별표</th><th>받은 시각</th></tr></thead>
              <tbody>
                {laws.map((l) => (
                  <tr key={l.law_id}>
                    <td><span className={'law-badge ' + kindClass(l.kind)}>{l.kind}</span> {l.name}</td>
                    <td>{fmtDate(l.eff_date)}</td><td className="r">{l.article_count}</td><td className="r">{l.annex_count}</td>
                    <td>{fmtTs(l.fetched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="law-src">{SOURCE}</div>
          </aside>
        </>
      )}
    </div>
  )
}
