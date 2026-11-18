// [190] 작성 중 안전관리 도우미(챗봇) — 안전점검·위험성평가·근골격계·교육 진도표·이행점검 화면 오른쪽 아래 동그라미 버튼.
//       누르면 오른쪽에 대화 창이 열리고(작성 화면은 왼쪽으로 좁아질 뿐 가리지 않음) 문장으로 물어보면 관련 조문을 찾아 답한다.
//  · 1단계(지금): AI 없이 질문에서 핵심 낱말을 뽑아 /law/search(법령 검색 탭과 같은 API)로 관련 조문을 찾아 말풍선으로 보여준다.
//  · 2단계(백엔드 준비 후): CHAT_ENDPOINT 에 서버 주소(예: '/law/chat')를 넣으면 AI 요약 답변 + 근거 조문으로 바뀐다.
//    서버 응답 형식(약속): POST { question, page } → { answer: string, results: Hit[] }. AI 키는 서버에만 둔다.
//  · 대화·보던 조문은 탭을 옮겨도 유지(앱 실행 중 메모리). 법령 원문은 해석 없이 그대로 보여준다.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Bot, Check, ClipboardCheck, Copy, ExternalLink, Loader2, Maximize2, RotateCcw, Scale, Send, Wrench, X } from 'lucide-react'
import { api } from '../lib/api'
import { matchTopic, type SafetyTopic } from '../lib/safetyTopics'
import '../styles/lawdock.css'

// 2단계: 서버에 AI 질문 창구가 생기면 주소를 넣는다(null = AI 없이 조문 찾기만)
const CHAT_ENDPOINT: string | null = null

type Hit = { id: string; kind: 'article' | 'annex'; law: string; law_short: string; no: string; title: string; citation: string; snippet: string }
type Full = Hit & { text: string }
type Msg =
  | { id: number; who: 'me'; text: string }
  | { id: number; who: 'bot'; text: string; hits?: Hit[]; kw?: string; busy?: boolean; more?: boolean; topic?: SafetyTopic }

// 작성 화면 경로 → 이름·추천 질문
const PAGES: { test: (p: string) => boolean; name: string; asks: string[] }[] = [
  { test: (p) => p.startsWith('/inspection'), name: '안전점검', asks: ['급식실 바닥이 젖어서 미끄러워요', '사다리 작업할 때 떨어질까 걱정돼요', '국솥 옮기다 화상 위험이 있어요', '소화기 비치 기준은?'] },
  { test: (p) => p.startsWith('/risk'), name: '위험성평가', asks: ['위험성평가는 언제 해야 해?', '수시 위험성평가 실시 시기', '위험성평가에 근로자 참여 방법', '위험성평가 기록 보존 기간'] },
  { test: (p) => p.startsWith('/musculo'), name: '근골격계', asks: ['근골격계부담작업이 뭐야?', '유해요인조사 주기는?', '중량물 취급 기준', '근골격계 질환 예방 조치'] },
  { test: (p) => p.startsWith('/education'), name: '교육 진도표', asks: ['안전보건교육 시간은?', '신규 채용 시 교육 내용', '관리감독자 교육 시간', '특별교육 대상 작업'] },
  { test: (p) => p.startsWith('/compliance'), name: '이행점검', asks: ['안전보건관리체계 구축 의무', '중대재해 예방 조치', '안전보건 예산 편성', '종사자 의견 청취 방법'] },
]

// 질문 문장 → 검색 낱말(조사·의문형 어미·군말 제거). 서버 BM25가 동의어·조각 검색을 하므로 낱말만 넘긴다.
const STOP = new Set(['뭐야', '뭐', '무엇', '어떤', '어떻게', '언제', '알려줘', '알려', '주세요', '해줘', '봐야', '해야', '하나요', '되나요', '인가요', '있나요', '있어', '조문', '법령', '기준이', '관련', '방법', '대해', '대한', '경우', '그리고', '좀'])
const JOSA = /(으로|에서|에게|까지|부터|이랑|하고|하면|해야|이면|은|는|이|가|을|를|에|의|로|와|과|도|만|요|은요|는요)$/
function toKeywords(q: string): string {
  const toks = q.replace(/[?？!.,~"'“”‘’()]/g, ' ').split(/\s+/).map((t) => t.trim()).filter(Boolean)
  const out: string[] = []
  for (let t of toks) {
    if (STOP.has(t)) continue
    if (t.length > 2) t = t.replace(JOSA, '')
    if (t.length > 2) t = t.replace(/(할때|할|하는|했을|하려면|되는)$/, '') // 동사형 어미(작업할 → 작업)
    if (t.length >= 2 && !STOP.has(t) && !out.includes(t)) out.push(t)
  }
  return (out.length ? out : toks).slice(0, 6).join(' ')
}

// 받침 있으면 '을', 없으면 '를'
function eul(w: string) { const c = w.charCodeAt(w.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를' }

// 탭을 옮겨도 남는 상태
const mem: { open: boolean; msgs: Msg[]; sel: Full | null; seq: number } = { open: false, msgs: [], sel: null, seq: 1 }

function highlight(text: string, kw: string) {
  const toks = kw.split(/\s+/).filter((t) => t.length >= 2)
  if (!toks.length) return text
  const re = new RegExp(`(${toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(re).map((part, i) => (toks.includes(part) ? <mark key={i}>{part}</mark> : part))
}

export function LawDock() {
  const loc = useLocation()
  const page = PAGES.find((x) => x.test(loc.pathname))
  const [open, setOpen] = useState(mem.open)
  const [msgs, setMsgs] = useState<Msg[]>(mem.msgs)
  const [sel, setSel] = useState<Full | null>(mem.sel)
  const [selKw, setSelKw] = useState('')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState('')
  const inRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { Object.assign(mem, { open, msgs, sel }) }, [open, msgs, sel])
  const shown = !!page && open
  useEffect(() => {
    document.body.classList.toggle('ld-open', shown)
    return () => document.body.classList.remove('ld-open')
  }, [shown])
  useEffect(() => { if (shown && !sel) inRef.current?.focus() }, [shown, sel])
  // 새 답변이 오면 내 질문이 창 맨 위에 오도록(긴 답변을 처음부터 읽게)
  useEffect(() => {
    if (sel) return
    const el = bodyRef.current
    const mine = el?.querySelectorAll('.ld-msg.me')
    const last = mine && mine.length ? (mine[mine.length - 1] as HTMLElement) : null
    if (el && last) el.scrollTo({ top: last.offsetTop - el.offsetTop - 8, behavior: 'smooth' })
  }, [msgs, sel])

  if (!page) return null
  const pageName = page.name
  const busy = msgs.some((m) => m.who === 'bot' && m.busy)

  async function ask(qRaw: string) {
    const q = qRaw.trim()
    if (!q || busy) return
    const meId = mem.seq++, botId = mem.seq++
    setText('')
    setMsgs((m) => [...m, { id: meId, who: 'me', text: q }, { id: botId, who: 'bot', text: '', busy: true }])
    const put = (patch: Partial<Extract<Msg, { who: 'bot' }>>) =>
      setMsgs((m) => m.map((x) => (x.id === botId ? ({ ...x, ...patch, busy: false } as Msg) : x)))
    try {
      if (CHAT_ENDPOINT) {
        const r = await api<{ answer: string; results?: Hit[] }>(CHAT_ENDPOINT, { method: 'POST', body: JSON.stringify({ question: q, page: pageName }) })
        put({ text: r.answer, hits: r.results || [], kw: toKeywords(q) })
        return
      }
      // 위험 주제가 맞으면 미리 정리한 답변(위험 요약·개선 대책·점검 포인트) + 주제 법령, 아니면 조문 찾기만
      const topic = matchTopic(q)
      const kw = topic ? topic.lawQuery : toKeywords(q)
      const r = await api<{ results: Hit[] }>(`/law/search?q=${encodeURIComponent(kw)}&limit=8&annex=true`).catch(() => ({ results: [] as Hit[] }))
      const hits = Array.isArray(r.results) ? r.results : []
      if (topic) { put({ text: '', topic, hits, kw }); return }
      put(hits.length
        ? { text: `'${kw}' 관련 조문을 ${hits.length}건 찾았어요. 눌러서 원문을 확인하세요.`, hits, kw }
        : { text: `'${kw}'에 맞는 조문을 찾지 못했어요. 다른 낱말로 물어봐 주세요. (예: '급식실 바닥 미끄럼')`, hits: [], kw })
    } catch (e) {
      put({ text: `조문을 찾지 못했어요 — ${e instanceof Error ? e.message : '서버 오류'}` })
    }
  }
  async function openHit(h: Hit, kw: string) {
    setSelKw(kw)
    setSel({ ...h, text: h.snippet })
    try { setSel(await api<Full>(`/law/articles/${encodeURIComponent(h.id)}`)) } catch { /* 요약으로 표시 */ }
  }
  function copy(t: string, what: string) {
    void navigator.clipboard?.writeText(t).then(() => { setCopied(what); window.setTimeout(() => setCopied(''), 1500) })
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text) }
  }
  const lastKw = [...msgs].reverse().find((m) => m.who === 'bot' && m.kw)
  const lastQ = lastKw && lastKw.who === 'bot' ? lastKw.kw || '' : ''

  return (
    <>
      <button className={'ld-fab' + (open ? ' on' : '')} title={open ? '안전관리 도우미 닫기' : '안전관리 도우미 — 작성하면서 물어보기'}
        aria-label="안전관리 도우미" onClick={() => setOpen((v) => !v)}>
        {open ? <X size={22} /> : <Bot size={24} />}
        {!open && <span className="ld-fab-tip">안전관리 도우미</span>}
      </button>

      {open && (
        <aside className="ld-panel" aria-label="안전관리 도우미">
          <div className="ld-head">
            <span className="ld-av"><Bot size={17} /></span>
            <b>안전관리 도우미</b>
            <span className="ld-ctx">{pageName} 작성 중</span>
            <span style={{ flex: 1 }} />
            {msgs.length > 0 && !sel && (
              <button className="ld-x" title="대화 지우기" onClick={() => setMsgs([])}><RotateCcw size={14} /></button>
            )}
            <button className="ld-x" title="닫기" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>

          {sel ? (
            <div className="ld-body">
              <div className="ld-art">
                <button className="ld-back" onClick={() => setSel(null)}><ArrowLeft size={14} /> 대화로 돌아가기</button>
                <div className="ld-law">{sel.law}</div>
                <h4>{sel.no} {sel.title && <span>({sel.title})</span>}</h4>
                <div className="ld-text">{highlight(sel.text || '', selKw)}</div>
                <div className="ld-acts">
                  <button className="btn btn-primary" onClick={() => copy(sel.citation || `${sel.law} ${sel.no}`, 'cite')}>
                    {copied === 'cite' ? <Check size={14} /> : <Copy size={14} />} 인용 복사
                  </button>
                  <button className="btn btn-ghost" onClick={() => copy(sel.text || '', 'text')}>
                    {copied === 'text' ? <Check size={14} /> : <Copy size={14} />} 원문 복사
                  </button>
                  <a className="btn btn-ghost" target="_blank" rel="noopener" href={`https://www.law.go.kr/법령/${encodeURIComponent(sel.law)}`}>
                    <ExternalLink size={14} /> 법제처
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="ld-body ld-chat" ref={bodyRef}>
              <div className="ld-msg bot">
                <span className="ld-av"><Bot size={15} /></span>
                <div className="ld-bub">
                  안녕하세요. {pageName}{eul(pageName)} 작성하다 궁금한 점을 물어보세요. 위험 상황을 적어 주시면 개선 대책과 관련 법령을 알려 드려요.
                  <div className="ld-asks">
                    {page.asks.map((a) => <button key={a} disabled={busy} onClick={() => void ask(a)}>{a}</button>)}
                  </div>
                </div>
              </div>
              {msgs.map((m) => m.who === 'me' ? (
                <div key={m.id} className="ld-msg me"><div className="ld-bub">{m.text}</div></div>
              ) : (
                <div key={m.id} className="ld-msg bot">
                  <span className="ld-av"><Bot size={15} /></span>
                  <div className="ld-bub">
                    {m.busy ? <span className="ld-typing"><Loader2 size={14} className="ld-spin" /> 답변을 찾는 중…</span> : m.topic ? (
                      <div className="ld-ans">
                        <div className="ld-tt">{m.topic.title}</div>
                        <section className="ld-sec risk"><h5><AlertTriangle size={13} /> 위험 요약</h5><p>{m.topic.risk}</p></section>
                        <section className="ld-sec fix"><h5><Wrench size={13} /> 개선 대책</h5>
                          <div className="ld-sub">바로 할 일</div>
                          <ul>{m.topic.now.map((t, i) => <li key={i}>{t}</li>)}</ul>
                          <div className="ld-sub">근본 대책</div>
                          <ul>{m.topic.fix.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </section>
                        <section className="ld-sec chk"><h5><ClipboardCheck size={13} /> 점검할 때 볼 것</h5>
                          <ul className="ld-chk">{m.topic.check.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </section>
                        <h5 className="ld-lawh"><Scale size={13} /> 관련 법령 {m.hits?.length ? `${m.hits.length}건` : ''}</h5>
                        {!m.hits?.length && <div className="ld-none">관련 조문을 불러오지 못했어요.</div>}
                      </div>
                    ) : m.text}
                    {!!m.hits?.length && (
                      <div className="ld-cards">
                        {(m.more ? m.hits : m.hits.slice(0, 3)).map((h) => (
                          <button key={h.id} className="ld-hit" onClick={() => void openHit(h, m.kw || '')}>
                            <span className="ld-hl">{h.law_short || h.law} · {h.no}{h.kind === 'annex' && <i>별표</i>}</span>
                            <b>{h.title || h.no}</b>
                            <small>{highlight(h.snippet, m.kw || '')}</small>
                          </button>
                        ))}
                        {m.hits.length > 3 && !m.more && (
                          <button className="ld-more" onClick={() => setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, more: true } as Msg : x)))}>
                            조문 {m.hits.length - 3}건 더 보기
                          </button>
                        )}
                      </div>
                    )}
                    {m.topic && <div className="ld-note">참고용 안내예요 — 현장 상황에 맞게 판단하고, 조치 기준은 법령 원문으로 확인하세요.</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!sel && (
            <form className="ld-input" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
              <textarea ref={inRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
                placeholder="궁금한 점을 물어보세요 (예: 급식실 바닥이 미끄러우면?)" />
              <button type="submit" className="ld-send" disabled={!text.trim() || busy} title="보내기"><Send size={16} /></button>
            </form>
          )}
          <div className="ld-foot">
            <Link to={lastQ ? `/law?q=${encodeURIComponent(lastQ)}` : '/law'} onClick={() => setOpen(false)}>
              <Maximize2 size={13} /> 법령 검색 탭에서 크게 보기
            </Link>
            <span><Scale size={11} style={{ verticalAlign: -1 }} /> {CHAT_ENDPOINT ? 'AI 답변은 참고용 · 원문 확인' : '조문 원문 그대로 · 법제처'}</span>
          </div>
        </aside>
      )}
    </>
  )
}
