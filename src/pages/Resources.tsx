// 자료실 — [164] 개편(확정 예시 v13·A안 반영)
//  · 위: 흰 카드 1장 = 검색(업무 선택 + 검색어) · 많이 찾는 자료(받은 수 상위) · 필독(고정 자료)
//  · 가운데: 자료실 메뉴 — 폴더(01 공통 ~ 06 지원) × 세부 항목. 건수·N(최근 7일 새 자료) 표시, 누르면 아래 목록이 바뀜
//  · 아래: 선택 폴더 목록 — 세부 항목 칩(전체 + 항목), 파일 형식 배지(확장자 자동), 버전(최신본만·이전 버전 접기), 받은 수
//  · [+ 자료 올리기]: 선택 폴더에 올림 — 세부 항목 선택 또는 새 세부 항목 추가, 설명, 필독 고정, 기존 자료의 새 버전으로 올리기
// 저장: 파일은 기존 /resources API 그대로. 폴더·세부 항목·설명·필독·버전 묶음·받은 수는 org 문서(백엔드 수정 없이)
//   /ops/docs/resource-meta     { [자료id]: { folder, sub, desc?, pinned?, file?, group?, downloads?, ts? } }
//   /ops/docs/resource-folders  { [폴더key]: 추가한 세부 항목[] }
// 현장 앱(APK)은 릴리스 서버(/release, 공개) 파일을 '지원 › 현장 앱(APK)'에 함께 표시(삭제 불가).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Download, Eye, FolderOpen, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { Modal } from '../components/Modal'
import { FilePicker } from '../components/FilePicker'
import '../styles/resources.css'

type ReleaseFile = { name: string; display_name?: string; size: number; modified: string; url: string }
type ResourceItem = { id: string; title: string; category: string; size: string; date: string }
type ResourceFull = ResourceItem & { content: string }
type Meta = { folder: string; sub: string; desc?: string; pinned?: boolean; file?: string; group?: string; downloads?: number; ts?: number }
type MetaDoc = Record<string, Meta>
type FolderDoc = Record<string, string[]>

const FOLDERS: { key: string; label: string; subs: string[] }[] = [
  { key: 'common', label: '공통', subs: ['회사 규정·서식', '근태·출장 서식', '개인정보 서약서', '공문·안내문'] },
  { key: 'insp', label: '안전점검', subs: ['공정별 점검표', '점검 기준 해설', '사진대지 작성 예시', '교육청 업로드 안내'] },
  { key: 'risk', label: '위험성평가', subs: ['평가표 양식', '유해위험요인 목록', '정기·수시 작성 예시'] },
  { key: 'mus', label: '근골격계', subs: ['증상조사표', '유해요인 조사표', '보고서 양식', '작성 매뉴얼'] },
  { key: 'edu', label: '교육', subs: ['교육 PPT', '교육 영상', '출석부·수료증'] },
  { key: 'sup', label: '지원', subs: ['현장 앱(APK)', '사용 매뉴얼·FAQ'] },
]
const APK_SUB = '현장 앱(APK)'
const UNSORTED = '미분류'
// 분류 정보가 없는 기존 자료 — 제목으로 폴더를 추정하고 세부 항목은 '미분류'
const guessFolder = (t: string) =>
  /근골격|증상조사|부담작업/.test(t) ? 'mus' : /위험성/.test(t) ? 'risk' : /교육|이수|수료/.test(t) ? 'edu'
    : /점검/.test(t) ? 'insp' : /앱|apk|매뉴얼|사용법/i.test(t) ? 'sup' : 'common'

// 파일 형식 배지 — 확장자로 자동
const EXT: Record<string, [string, string]> = {
  hwp: ['HWP', 'x-hwp'], hwpx: ['HWPX', 'x-hwp'], docx: ['WORD', 'x-doc'], doc: ['WORD', 'x-doc'],
  xlsx: ['EXCEL', 'x-xls'], xls: ['EXCEL', 'x-xls'], csv: ['CSV', 'x-xls'], pdf: ['PDF', 'x-pdf'],
  pptx: ['PPT', 'x-ppt'], ppt: ['PPT', 'x-ppt'], mp4: ['영상', 'x-mp4'], apk: ['APK', 'x-apk'], zip: ['ZIP', 'x-zip'],
  png: ['이미지', 'x-img'], jpg: ['이미지', 'x-img'], jpeg: ['이미지', 'x-img'],
}
const extOf = (name?: string) => (name?.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
const stripExt = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, '')
const PREVIEWABLE = new Set(['pdf', 'png', 'jpg', 'jpeg'])
const NEW_DAYS = 7
const isNew = (d: string) => !!d && Date.now() - Date.parse(d.slice(0, 10)) < NEW_DAYS * 864e5

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function getDoc<T>(key: string): Promise<T> {
  const r = await api<{ doc: T | null }>(`/ops/docs/${key}`).catch(() => ({ doc: null }))
  return ((r && r.doc) || {}) as T
}
/** 읽기→수정→쓰기(저장 직전 최신본에 반영 — 다른 사람 변경을 덮어쓰지 않게) */
async function updateDoc<T extends object>(key: string, fn: (cur: T) => T): Promise<T> {
  const cur = await getDoc<T>(key)
  const next = fn({ ...cur })
  await api(`/ops/docs/${key}`, { method: 'PUT', body: JSON.stringify({ doc: next }) })
  return next
}

// 목록 한 줄(최신본) — 업로드 자료 또는 현장 앱 파일
type Row = {
  id: string; title: string; file: string; ext: string; size: string; date: string
  folder: string; sub: string; desc?: string; pinned: boolean; downloads: number
  older: Row[]; apkUrl?: string
}

// embedded: 경영 콘솔(홈페이지·콘텐츠 탭) 임베드용 — 페이지 헤더만 숨김
export function Resources({ embedded = false }: { embedded?: boolean } = {}) {
  const [docs, setDocs] = useState<ResourceItem[]>([])
  const [meta, setMeta] = useState<MetaDoc>({})
  const [extraSubs, setExtraSubs] = useState<FolderDoc>({})
  const [apks, setApks] = useState<ReleaseFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [cur, setCur] = useState('insp')
  const [sub, setSub] = useState('')
  const [sort, setSort] = useState<'new' | 'down' | 'name'>('new')
  const [qFolder, setQFolder] = useState('')
  const [qText, setQText] = useState('')
  const [query, setQuery] = useState<{ folder: string; text: string } | null>(null) // 검색 확정 시 목록이 검색 결과로
  const [openVer, setOpenVer] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true); setError('')
    Promise.all([
      api<ResourceItem[]>('/resources'),
      getDoc<MetaDoc>('resource-meta'),
      getDoc<FolderDoc>('resource-folders'),
    ])
      .then(([d, m, f]) => { setDocs(Array.isArray(d) ? d : []); setMeta(m); setExtraSubs(f); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : '오류'); setLoading(false) })
  }, [])
  useEffect(() => { refetch() }, [refetch])
  useEffect(() => {
    let alive = true
    api<ReleaseFile[]>('/release')
      .then((files) => { if (alive) setApks((files || []).filter((f) => f.name.toLowerCase().endsWith('.apk'))) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 3500) }

  // ---- 자료 → 목록 행(버전 묶음: 같은 group의 최신본 1행 + 이전 버전) ----
  const allRows: Row[] = useMemo(() => {
    const base = docs.map((d) => {
      const m = meta[d.id]
      const file = m?.file || d.title
      return {
        id: d.id, title: stripExt(d.title), file, ext: extOf(file) || extOf(d.title), size: d.size, date: d.date,
        folder: m?.folder || guessFolder(d.title), sub: m?.sub || UNSORTED, desc: m?.desc, pinned: !!m?.pinned,
        downloads: m?.downloads || 0, older: [] as Row[], group: m?.group || d.id, ts: m?.ts || 0,
      }
    })
    const byGroup = new Map<string, typeof base>()
    for (const r of base) { if (!byGroup.has(r.group)) byGroup.set(r.group, []); byGroup.get(r.group)!.push(r) }
    const rows: Row[] = []
    for (const list of byGroup.values()) {
      list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts) // 같은 날 올린 버전은 올린 시각 순
      const [latest, ...older] = list
      rows.push({ ...latest, older, downloads: list.reduce((s, x) => s + x.downloads, 0) })
    }
    for (const f of apks) {
      rows.push({
        id: 'apk:' + f.name, title: stripExt(f.display_name || f.name), file: f.display_name || f.name, ext: 'apk',
        size: humanSize(f.size), date: f.modified.slice(0, 10), folder: 'sup', sub: APK_SUB,
        desc: '점검자 태블릿·휴대폰 설치용 — 이미 설치돼 있으면 덮어쓰기 설치로 업데이트', pinned: false, downloads: 0, older: [], apkUrl: f.url,
      })
    }
    return rows
  }, [docs, meta, apks])

  const folders = useMemo(() => FOLDERS.map((f) => {
    const subs = [...f.subs, ...(extraSubs[f.key] || []).filter((s) => !f.subs.includes(s))]
    if (allRows.some((r) => r.folder === f.key && r.sub === UNSORTED)) subs.push(UNSORTED)
    return { ...f, subs }
  }), [extraSubs, allRows])
  const countOf = (folder: string, s?: string) => allRows.filter((r) => r.folder === folder && (!s || r.sub === s)).length
  const newOf = (folder: string, s?: string) => allRows.some((r) => r.folder === folder && (!s || r.sub === s) && isNew(r.date))

  const sorter = (a: Row, b: Row) =>
    sort === 'down' ? b.downloads - a.downloads : sort === 'name' ? a.title.localeCompare(b.title, 'ko') : (b.date || '').localeCompare(a.date || '')
  const view = useMemo(() => {
    let list = query
      ? allRows.filter((r) => (!query.folder || r.folder === query.folder)
        && (r.title + ' ' + (r.desc || '') + ' ' + r.sub + ' ' + r.file).toLowerCase().includes(query.text.toLowerCase()))
      : allRows.filter((r) => r.folder === cur && (!sub || r.sub === sub))
    list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || sorter(a, b))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, cur, sub, sort, query])
  const pinned = allRows.filter((r) => r.pinned)
  const popular = [...allRows].filter((r) => r.downloads > 0).sort((a, b) => b.downloads - a.downloads).slice(0, 5)
  const folderLabel = (k: string) => FOLDERS.find((f) => f.key === k)?.label || k
  const curFolder = folders.find((f) => f.key === cur)!

  function pickFolder(k: string, s = '') { setCur(k); setSub(s); setQuery(null); setOpenVer(null) }
  function doSearch(text = qText, folder = qFolder) {
    const t = text.trim()
    if (!t) { setQuery(null); return }
    setQText(t); setQuery({ folder, text: t })
  }

  // ---- 받기 · 미리보기 ----
  async function fetchBlob(id: string): Promise<{ blob: Blob; name: string } | null> {
    const full = await api<ResourceFull>(`/resources/${id}`)
    const name = meta[id]?.file || full.title
    if (full.content && full.content.startsWith('/api/v1/files/')) {
      const res = await fetch(full.content, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) throw new Error(String(res.status))
      return { blob: await res.blob(), name }
    }
    if (full.content) return { blob: await (await fetch(full.content)).blob(), name }
    return { blob: new Blob([`${full.title}\n(자료실 데모 문서 — 원본 파일 없음)`], { type: 'text/plain' }), name: stripExt(name) + '.txt' }
  }
  async function bumpDownloads(id: string) {
    try {
      const next = await updateDoc<MetaDoc>('resource-meta', (m) => {
        const cur0 = m[id] || { folder: guessFolder(docs.find((d) => d.id === id)?.title || ''), sub: UNSORTED }
        return { ...m, [id]: { ...cur0, downloads: (cur0.downloads || 0) + 1 } }
      })
      setMeta(next)
    } catch { /* 받은 수 집계 실패는 무시 */ }
  }
  async function download(r: Row) {
    if (r.apkUrl) { window.location.href = r.apkUrl; return }
    try {
      const got = await fetchBlob(r.id)
      if (!got) return
      const u = URL.createObjectURL(got.blob)
      const a = document.createElement('a')
      a.href = u; a.download = got.name
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(u), 4000)
      void bumpDownloads(r.id)
    } catch (e) {
      setError('다운로드 실패: ' + (e instanceof Error ? e.message : ''))
    }
  }
  async function preview(r: Row) {
    const w = window.open('', '_blank')
    try {
      const got = await fetchBlob(r.id)
      if (!got || !w) return
      const type = r.ext === 'pdf' ? 'application/pdf' : `image/${r.ext === 'jpg' ? 'jpeg' : r.ext}`
      w.location.href = URL.createObjectURL(new Blob([got.blob], { type }))
    } catch (e) {
      w?.close()
      setError('미리보기 실패: ' + (e instanceof Error ? e.message : ''))
    }
  }
  async function togglePin(r: Row) {
    try {
      const next = await updateDoc<MetaDoc>('resource-meta', (m) => ({ ...m, [r.id]: { ...(m[r.id] || { folder: r.folder, sub: r.sub }), pinned: !r.pinned } }))
      setMeta(next)
      flash(r.pinned ? '필독 고정을 해제했습니다.' : '필독으로 고정했습니다.')
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패') }
  }
  async function remove(r: Row) {
    const n = 1 + r.older.length
    if (!window.confirm(`'${r.title}' 자료를 삭제할까요?${r.older.length ? `\n(이전 버전 ${r.older.length}개 포함 ${n}개 파일이 함께 삭제됩니다)` : ''}`)) return
    try {
      for (const id of [r.id, ...r.older.map((o) => o.id)]) await api(`/resources/${id}`, { method: 'DELETE' })
      await updateDoc<MetaDoc>('resource-meta', (m) => { const x = { ...m }; for (const id of [r.id, ...r.older.map((o) => o.id)]) delete x[id]; return x }).catch(() => {})
      refetch(); flash('삭제했습니다.')
    } catch (e) { setError(e instanceof Error ? e.message : '삭제 실패') }
  }

  // ---- 자료 올리기 ----
  const [upOpen, setUpOpen] = useState(false)
  const [fSub, setFSub] = useState('')
  const [fNewSub, setFNewSub] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fFile, setFFile] = useState<File | null>(null)
  const [fPin, setFPin] = useState(false)
  const [fVerOf, setFVerOf] = useState('') // 새 버전으로 올릴 기존 자료 id
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const NEW = '__new__'
  function openUpload() {
    const subs = curFolder.subs.filter((s) => s !== APK_SUB && s !== UNSORTED)
    setFSub(sub && sub !== APK_SUB && sub !== UNSORTED ? sub : subs[0] || NEW)
    setFNewSub(''); setFTitle(''); setFDesc(''); setFFile(null); setFPin(false); setFVerOf(''); setFormErr('')
    setUpOpen(true)
  }
  const verCandidates = allRows.filter((r) => !r.apkUrl && r.folder === cur && r.sub === fSub)
  async function submit() {
    if (busy) return
    const subName = fSub === NEW ? fNewSub.trim() : fSub
    if (!subName) { setFormErr('세부 항목을 고르거나 새 세부 항목 이름을 입력하세요.'); return }
    if (fSub === NEW && curFolder.subs.includes(subName)) { setFormErr('이미 있는 세부 항목입니다.'); return }
    if (!fFile) { setFormErr('파일을 선택하세요.'); return }
    const file = fFile
    setBusy(true); setFormErr('')
    try {
      const content = file.size <= 800 * 1024
        ? await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.onerror = () => rej(new Error('파일을 읽을 수 없습니다.')); rd.readAsDataURL(file) })
        : ''
      // 새 버전으로 올릴 때 제목을 비우면 기존 자료 제목을 그대로 사용
      const title = fTitle.trim() || (fVerOf ? allRows.find((r) => r.id === fVerOf)?.title : '') || stripExt(file.name)
      const created = await api<ResourceItem>('/resources', {
        method: 'POST',
        body: JSON.stringify({ title: title + (extOf(file.name) ? '.' + extOf(file.name) : ''), category: '양식', size: humanSize(file.size), content }),
      })
      const prev = fVerOf ? meta[fVerOf] : undefined
      const group = fVerOf ? (prev?.group || fVerOf) : undefined
      const next = await updateDoc<MetaDoc>('resource-meta', (m) => {
        const x = { ...m, [created.id]: { folder: cur, sub: subName, desc: fDesc.trim() || undefined, pinned: fPin || !!prev?.pinned, file: file.name, ts: Date.now(), ...(group ? { group } : {}) } }
        if (fVerOf) { x[fVerOf] = { ...(m[fVerOf] || { folder: cur, sub: subName }), group, pinned: false } } // 이전 버전은 같은 묶음으로
        return x
      })
      setMeta(next)
      if (fSub === NEW) {
        const f = await updateDoc<FolderDoc>('resource-folders', (d) => ({ ...d, [cur]: [...(d[cur] || []).filter((s) => s !== subName), subName] }))
        setExtraSubs(f)
      }
      setUpOpen(false)
      setSub(subName); setQuery(null)
      refetch()
      flash(fVerOf ? '새 버전으로 올렸습니다(이전 파일은 이전 버전으로 보관).' : '자료를 올렸습니다.')
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setBusy(false)
    }
  }

  const listTitle = query
    ? `검색 결과 — '${query.text}'${query.folder ? ` (${folderLabel(query.folder)})` : ''}`
    : `${curFolder.label}${sub ? ` › ${sub}` : ' 전체'}`

  return (
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>자료실</b></div>}
      {!embedded && <div className="bar"><h2><FolderOpen size={20} /> 자료실</h2><div className="sp" />{msg && <span className="pillx ok">{msg}</span>}</div>}

      {/* 검색 · 많이 찾는 자료 · 필독 */}
      <section className="rs-sbox">
        <form className="rs-search" onSubmit={(e) => { e.preventDefault(); doSearch() }}>
          <select value={qFolder} onChange={(e) => setQFolder(e.target.value)}>
            <option value="">전체 업무</option>
            {FOLDERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <div className="rs-sin">
            <Search size={17} />
            <input value={qText} onChange={(e) => { setQText(e.target.value); if (!e.target.value.trim()) setQuery(null) }}
              placeholder="자료명·설명으로 검색 (예: 급식실 점검표, 근골격계 보고서)" />
          </div>
          <button type="submit">검색</button>
        </form>
        {popular.length > 0 && (
          <div className="rs-srow"><span className="lab">많이 찾는 자료</span>
            {popular.map((r) => <button key={r.id} className="rs-hc" onClick={() => { setQText(r.title); doSearch(r.title, '') }}>{r.title}</button>)}
          </div>
        )}
        {pinned.length > 0 && (
          <div className="rs-srow rs-must"><span className="lab"><b className="tag"><Pin size={11} /> 필독</b></span>
            {pinned.map((r, i) => (
              <span key={r.id}>{i > 0 && <span className="dot">·</span>}<button className="rs-mlink" onClick={() => void download(r)} title="받기">{r.title}</button></span>
            ))}
          </div>
        )}
      </section>

      {/* 자료실 메뉴 */}
      <section className="rs-card">
        <div className="rs-sech"><h3>자료실 메뉴</h3><span>폴더 제목 또는 세부 항목을 누르면 아래 목록이 바뀝니다</span></div>
        <div className="rs-map">
          {folders.map((f, i) => (
            <div key={f.key} className={'rs-col' + (!query && f.key === cur ? ' on' : '')}>
              <button className="rs-colh" onClick={() => pickFolder(f.key)}>
                <em>{String(i + 1).padStart(2, '0')}</em>{f.label}{newOf(f.key) && <span className="rs-new">N</span>}<span className="n">{countOf(f.key)}</span>
              </button>
              {f.subs.map((s) => (
                <button key={s} className={'rs-sub' + (!query && f.key === cur && sub === s ? ' sel' : '')} onClick={() => pickFolder(f.key, s)}>
                  <span className="t">{s}</span>{newOf(f.key, s) && <span className="rs-new">N</span>}<span className="c">{countOf(f.key, s)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* 자료 목록 */}
      <section className="rs-card">
        <div className="rs-listh">
          <h3>{listTitle}</h3>
          {query && <button className="btn btn-ghost rs-xs" onClick={() => { setQuery(null); setQText('') }}>검색 해제</button>}
          <div className="sp" />
          {embedded && msg && <span className="pillx ok">{msg}</span>}
          <select className="select rs-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="new">최신순</option><option value="down">많이 받은 순</option><option value="name">이름순</option>
          </select>
          <button className="btn btn-primary" onClick={openUpload}><Plus size={15} /> 자료 올리기</button>
        </div>
        {!query && (
          <div className="rs-chips">
            {[['', '전체', countOf(cur), newOf(cur)] as const, ...curFolder.subs.map((s) => [s, s, countOf(cur, s), newOf(cur, s)] as const)].map(([v, label, c, nw]) => (
              <button key={v || 'all'} className={'rs-chip' + (sub === v ? ' on' : '')} onClick={() => { setSub(v); setOpenVer(null) }}>
                {label} <small>{c}</small>{nw && <span className="rs-new">N</span>}
              </button>
            ))}
          </div>
        )}
        {error && <div className="pillx late" style={{ display: 'block', margin: '8px 0', whiteSpace: 'normal' }}>{error}</div>}
        <div className="twrap">
          <table className="tbl rs-tbl">
            <thead>
              <tr>
                <th>자료</th>
                <th style={{ width: 150 }}>파일 형식</th>
                <th style={{ width: 150 }}>개정일 · 크기</th>
                <th style={{ width: 80 }}>받은 수</th>
                <th style={{ width: 270 }} />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
              {!loading && view.map((r) => {
                const [lab, cls] = EXT[r.ext] || [r.ext ? r.ext.toUpperCase() : '파일', 'x-zip']
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <div className="rs-t">{r.pinned && <span className="rs-pin"><Pin size={11} /> 필독</span>}{r.title}{isNew(r.date) && <span className="rs-new">N</span>}</div>
                        <div className="rs-d">
                          {query && <span className="rs-loc">{folderLabel(r.folder)} › {r.sub}</span>}
                          {r.desc}
                          {r.older.length > 0 && (
                            <button className="rs-ver" onClick={() => setOpenVer(openVer === r.id ? null : r.id)}>
                              이전 버전 {r.older.length}개 <ChevronDown size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td><span className={'rs-ext ' + cls}>{lab}</span>{r.ext && <span className="rs-extn">.{r.ext}</span>}</td>
                      <td>{r.date?.slice(0, 10) || '—'}<div className="rs-d">{r.size}</div></td>
                      <td>{r.apkUrl ? '—' : `${r.downloads}회`}</td>
                      <td>
                        <div className="rs-act">
                          {!r.apkUrl && PREVIEWABLE.has(r.ext) && <button className="btn btn-ghost rs-xs" onClick={() => void preview(r)}><Eye size={13} /> 미리보기</button>}
                          <button className="btn btn-primary rs-xs" onClick={() => void download(r)}><Download size={13} /> 받기</button>
                          {!r.apkUrl && <>
                            <button className={'btn btn-ghost rs-ic' + (r.pinned ? ' on' : '')} title={r.pinned ? '필독 고정 해제' : '필독으로 고정'} onClick={() => void togglePin(r)}><Pin size={14} /></button>
                            <button className="btn btn-ghost rs-ic del" title="삭제" onClick={() => void remove(r)}><Trash2 size={14} /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                    {openVer === r.id && r.older.map((o) => (
                      <tr key={o.id} className="rs-oldrow">
                        <td><div className="rs-d">└ 이전 버전 · {o.file}</div></td>
                        <td />
                        <td>{o.date?.slice(0, 10)}<div className="rs-d">{o.size}</div></td>
                        <td>{o.downloads}회</td>
                        <td><div className="rs-act"><button className="btn btn-ghost rs-xs" onClick={() => void download(o)}><Download size={13} /> 받기</button></div></td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {!loading && view.length === 0 && (
                <tr><td colSpan={5}><div className="tstate">{query ? '검색 결과가 없습니다.' : "이 분류에 자료가 없습니다. '자료 올리기'로 추가하세요."}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {upOpen && (
        <Modal title={`${curFolder.label}에 자료 올리기`} onClose={() => { if (!busy) setUpOpen(false) }} width={560}
          footer={<>
            {formErr && <span className="pillx late" style={{ whiteSpace: 'normal' }}>{formErr}</span>}
            <button className="btn btn-ghost" disabled={busy} onClick={() => setUpOpen(false)}>취소</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}><Plus size={15} /> {busy ? '올리는 중…' : '올리기'}</button>
          </>}>
          <label className="field"><span>폴더</span><input className="input" value={curFolder.label} disabled /></label>
          <label className="field"><span>세부 항목</span>
            <select className="select" value={fSub} onChange={(e) => { setFSub(e.target.value); setFVerOf('') }}>
              {curFolder.subs.filter((s) => s !== APK_SUB && s !== UNSORTED).map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={NEW}>＋ 새 세부 항목 추가…</option>
            </select>
          </label>
          {fSub === NEW && (
            <label className="field"><span>새 세부 항목 이름</span>
              <input className="input" autoFocus value={fNewSub} onChange={(e) => setFNewSub(e.target.value)} placeholder="예: 안전보건 협의체 회의록" />
              <small className="muted">올리면 메뉴에 새 세부 항목으로 바로 추가됩니다</small>
            </label>
          )}
          <label className="field"><span>제목</span><input className="input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder={fVerOf ? '비워두면 기존 자료 제목 그대로' : '비워두면 파일 이름 사용'} /></label>
          <label className="field"><span>설명 (선택)</span><input className="input" value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="예: 2026년 개정 — 항목 3개 추가" /></label>
          <label className="field"><span>파일 *</span>
            <FilePicker fileName={fFile?.name} onPick={(fl) => setFFile(fl?.[0] ?? null)} />
            <small className="muted">HWP · HWPX · WORD · EXCEL · PDF · PPT 등 — 파일 형식은 자동 표시 · 800KB 이하는 원본 그대로 저장됩니다</small>
          </label>
          {fSub !== NEW && verCandidates.length > 0 && (
            <label className="field"><span>기존 자료의 새 버전으로 올리기 (선택)</span>
              <select className="select" value={fVerOf} onChange={(e) => setFVerOf(e.target.value)}>
                <option value="">새 자료로 올리기</option>
                {verCandidates.map((r) => <option key={r.id} value={r.id}>{r.title} 의 새 버전 (이전 파일은 '이전 버전'으로 보관)</option>)}
              </select>
            </label>
          )}
          <label className="rs-ck"><input type="checkbox" checked={fPin} onChange={(e) => setFPin(e.target.checked)} /> 필독으로 맨 위에 고정</label>
        </Modal>
      )}
    </div>
  )
}
