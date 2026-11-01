// [152] 문서 파일 → 텍스트·표 추출 (브라우저 전용, 외부 라이브러리 없음)
//   · HWP (한글 5.0 바이너리) — OLE 복합문서 → BodyText/Section* 압축 해제 → 문단·표 셀 텍스트
//   · HWPX (한글 2014+) / DOCX (워드) — ZIP → XML → 문단·표
//   · TXT
// 결과는 문서 순서대로 '블록' 배열: 문단 = string, 표 = string[][] (행 × 셀)
// 압축 해제는 브라우저 내장 DecompressionStream('deflate-raw') 사용(크롬·엣지 103+).

export type DocBlock = string | string[][]
export type DocText = { kind: 'hwp' | 'hwpx' | 'docx' | 'txt'; blocks: DocBlock[]; text: string }

const td = (enc = 'utf-8') => new TextDecoder(enc)

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // 한글 본문 스트림은 압축 끝 뒤에 남는 바이트가 있을 수 있어(크롬은 오류로 처리) 받은 데까지는 살린다
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(data as BufferSource).catch(() => {})
  writer.close().catch(() => {})
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); total += value.length
    }
  } catch (e) {
    if (!total) throw e
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/* ============================== ZIP ============================== */
async function unzip(buf: Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('ZIP 형식이 아닙니다')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const nlen = dv.getUint16(p + 28, true); const elen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true)
    const lho = dv.getUint32(p + 42, true)
    const name = td().decode(buf.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen + elen + clen
    if (!want(name)) continue
    const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true)
    const raw = buf.subarray(ds, ds + csize)
    out.set(name, method === 8 ? await inflateRaw(raw) : raw.slice())
  }
  return out
}

/* ====================== XML (DOCX · HWPX 공통) ====================== */
// 두 형식 모두 문단 p · 글자 t · 표 tbl · 행 tr · 셀 tc 라는 같은 로컬 이름을 쓴다.
const kids = (el: Element) => Array.from(el.children)
function cellText(tc: Element): string {
  const parts: string[] = []
  const walk = (e: Element) => {
    for (const c of kids(e)) {
      const ln = c.localName
      if (ln === 't') parts.push(c.textContent || '')
      else if (ln === 'tab') parts.push(' ')
      else if (ln === 'p') { if (parts.length) parts.push(' '); walk(c) }
      else walk(c)
    }
  }
  walk(tc)
  return parts.join('').replace(/\s+/g, ' ').trim()
}
function readTable(tbl: Element): string[][] {
  const rows: string[][] = []
  const findRows = (e: Element) => {
    for (const c of kids(e)) {
      if (c.localName === 'tr') {
        const cells: string[] = []
        const findCells = (x: Element) => { for (const y of kids(x)) { if (y.localName === 'tc') cells.push(cellText(y)); else if (y.localName !== 'tbl') findCells(y) } }
        findCells(c)
        rows.push(cells)
      } else if (c.localName !== 'tbl') findRows(c)
    }
  }
  findRows(tbl)
  return rows
}
function readPara(p: Element, out: DocBlock[]) {
  let text = ''
  const tables: string[][][] = []
  const walk = (e: Element) => {
    for (const c of kids(e)) {
      const ln = c.localName
      if (ln === 'tbl') tables.push(readTable(c))
      else if (ln === 't') text += c.textContent || ''
      else if (ln === 'tab') text += ' '
      else if (ln === 'br' || ln === 'lineBreak') text += ' '
      else walk(c)
    }
  }
  walk(p)
  if (text.trim()) out.push(text.replace(/\s+/g, ' ').trim())
  for (const t of tables) out.push(t)
}
function walkXml(el: Element, out: DocBlock[]) {
  for (const c of kids(el)) {
    if (c.localName === 'tbl') out.push(readTable(c))
    else if (c.localName === 'p') readPara(c, out)
    else walkXml(c, out)
  }
}
function parseXml(bytes: Uint8Array): Element {
  const doc = new DOMParser().parseFromString(td().decode(bytes), 'application/xml')
  return doc.documentElement
}

/* ============================== HWP 5.0 ============================== */
type CfbEntry = { name: string; type: number; left: number; right: number; child: number; start: number; size: number }
function readCfb(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== 0xe011cfd0) throw new Error('한글(HWP) 5.0 형식이 아닙니다')
  const ss = 1 << dv.getUint16(30, true)
  const mss = 1 << dv.getUint16(32, true)
  const firstDir = dv.getUint32(48, true)
  const cutoff = dv.getUint32(56, true)
  const firstMini = dv.getUint32(60, true)
  let difatSec = dv.getUint32(68, true)
  const fatSecs: number[] = []
  for (let i = 0; i < 109; i++) { const s = dv.getUint32(76 + i * 4, true); if (s < 0xfffffffa) fatSecs.push(s) }
  const off = (s: number) => (s + 1) * ss
  let guard = 0
  while (difatSec < 0xfffffffa && guard++ < 10000) {
    const o = off(difatSec)
    for (let i = 0; i < ss / 4 - 1; i++) { const s = dv.getUint32(o + i * 4, true); if (s < 0xfffffffa) fatSecs.push(s) }
    difatSec = dv.getUint32(o + ss - 4, true)
  }
  const fat: number[] = []
  for (const s of fatSecs) { const o = off(s); for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(o + i * 4, true)) }
  const chain = (start: number, table: number[]) => { const r: number[] = []; let s = start; let g = 0; while (s < 0xfffffffa && g++ < 1e6) { r.push(s); s = table[s] } return r }
  const readChain = (start: number) => {
    const secs = chain(start, fat)
    const out = new Uint8Array(secs.length * ss)
    secs.forEach((s, i) => out.set(buf.subarray(off(s), off(s) + ss), i * ss))
    return out
  }
  const dir = readChain(firstDir)
  const ddv = new DataView(dir.buffer)
  const entries: CfbEntry[] = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = ddv.getUint16(o + 64, true)
    entries.push({
      name: td('utf-16le').decode(dir.subarray(o, o + Math.max(0, nl - 2))),
      type: dir[o + 66], left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true), child: ddv.getUint32(o + 76, true),
      start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true),
    })
  }
  const root = entries[0]
  const ministream = root && root.start < 0xfffffffa ? readChain(root.start) : new Uint8Array(0)
  const miniFatBytes = firstMini < 0xfffffffa ? readChain(firstMini) : new Uint8Array(0)
  const mdv = new DataView(miniFatBytes.buffer)
  const minifat: number[] = []
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) minifat.push(mdv.getUint32(i, true))
  const readStream = (e: CfbEntry): Uint8Array => {
    if (e.size < cutoff) {
      const secs = chain(e.start, minifat)
      const out = new Uint8Array(secs.length * mss)
      secs.forEach((s, i) => out.set(ministream.subarray(s * mss, s * mss + mss), i * mss))
      return out.subarray(0, e.size)
    }
    return readChain(e.start).subarray(0, e.size)
  }
  const childrenOf = (e: CfbEntry): CfbEntry[] => {
    const r: CfbEntry[] = []
    const visit = (i: number, g = 0) => { if (i >= entries.length || i === 0xffffffff || g > 500) return; const x = entries[i]; visit(x.left, g + 1); r.push(x); visit(x.right, g + 1) }
    visit(e.child)
    return r
  }
  return { root, childrenOf, readStream }
}

const tagId = (s: string) => (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)
const CTRL_TBL = tagId('tbl ')
// PARA_TEXT의 제어문자: 아래 코드와 탭(9)은 8글자(16바이트) 인라인·확장 제어, 나머지 0~31은 1글자
const EXT_CTRL = new Set([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])
function paraText(b: Uint8Array): string {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let s = ''
  for (let i = 0; i + 1 < b.length;) {
    const c = dv.getUint16(i, true)
    if (c < 32) {
      if (c === 9) { s += ' '; i += 16; continue } // 탭은 인라인 제어(8글자)
      if (EXT_CTRL.has(c)) { i += 16; continue }
      if (c === 10 || c === 13) s += ' '
      i += 2; continue
    }
    s += String.fromCharCode(c); i += 2
  }
  return s.replace(/\s+/g, ' ').trim()
}

async function hwpBlocks(buf: Uint8Array): Promise<DocBlock[]> {
  const cfb = readCfb(buf)
  const top = cfb.childrenOf(cfb.root)
  const fh = top.find((e) => e.name === 'FileHeader')
  const props = fh ? new DataView(cfb.readStream(fh).buffer.slice(0)).getUint32(36, true) : 1
  const compressed = (props & 1) === 1
  if (props & 2) throw new Error('암호가 걸린 한글 파일은 읽을 수 없습니다. 암호를 해제한 뒤 올려 주세요.')
  const body = top.find((e) => e.name === 'BodyText')
  const sections = body ? cfb.childrenOf(body).filter((e) => /^Section\d+$/.test(e.name)).sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7))) : []
  const out: DocBlock[] = []
  if (!sections.length || (props & 4)) {
    // 배포용 문서 등 본문을 못 읽으면 미리보기 텍스트(PrvText)라도 사용
    const pv = top.find((e) => e.name === 'PrvText')
    if (!pv) throw new Error('본문을 읽을 수 없는 한글 파일입니다(배포용 문서 등).')
    td('utf-16le').decode(cfb.readStream(pv)).split(/\r?\n/).map((x) => x.replace(/[<>]/g, ' ').trim()).filter(Boolean).forEach((x) => out.push(x))
    return out
  }
  type Tbl = { level: number; rows: number; cells: Map<number, Map<number, string>>; cur: [number, number] | null }
  for (const sec of sections) {
    let data = cfb.readStream(sec)
    if (compressed) data = await inflateRaw(data)
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const stack: Tbl[] = []
    const emit = (t: Tbl) => {
      const rows = [...t.cells.keys()].sort((a, b) => a - b).map((r) => { const m = t.cells.get(r)!; return [...m.keys()].sort((a, b) => a - b).map((c) => m.get(c)!.trim()) })
      const parent = stack[stack.length - 1]
      if (parent && parent.cur) { // 표 안의 표 → 부모 셀 텍스트로 합침
        const [r, c] = parent.cur
        const m = parent.cells.get(r)!
        m.set(c, (m.get(c) || '') + ' ' + rows.map((x) => x.join(' ')).join(' '))
      } else out.push(rows)
    }
    let p = 0
    while (p + 4 <= data.length) {
      const h = dv.getUint32(p, true); p += 4
      const tag = h & 0x3ff; const level = (h >>> 10) & 0x3ff; let size = (h >>> 20) & 0xfff
      if (size === 0xfff) { size = dv.getUint32(p, true); p += 4 }
      const rec = data.subarray(p, p + size); p += size
      while (stack.length && level <= stack[stack.length - 1].level) emit(stack.pop()!)
      const t = stack[stack.length - 1]
      if (tag === 71 && rec.length >= 4 && new DataView(rec.buffer, rec.byteOffset, 4).getUint32(0, true) === CTRL_TBL) {
        stack.push({ level, rows: 0, cells: new Map(), cur: null })
      } else if (tag === 77 && t && rec.length >= 8) { // HWPTAG_TABLE: 속성 u32, 행 u16, 열 u16
        t.rows = new DataView(rec.buffer, rec.byteOffset, rec.length).getUint16(4, true)
      } else if (tag === 72 && t && level === t.level + 1 && rec.length >= 12) { // 셀 리스트 헤더: col@8, row@10
        const rdv = new DataView(rec.buffer, rec.byteOffset, rec.length)
        const col = rdv.getUint16(8, true); const row = rdv.getUint16(10, true)
        if (!t.cells.has(row)) t.cells.set(row, new Map())
        if (!t.cells.get(row)!.has(col)) t.cells.get(row)!.set(col, '')
        t.cur = [row, col]
      } else if (tag === 67) { // HWPTAG_PARA_TEXT
        const s = paraText(rec)
        if (!s) continue
        if (t && t.cur) { const m = t.cells.get(t.cur[0])!; m.set(t.cur[1], (m.get(t.cur[1]) || '') + ' ' + s) }
        else out.push(s)
      }
    }
    while (stack.length) emit(stack.pop()!)
  }
  return out
}

/* ============================== 진입점 ============================== */
export const DOC_ACCEPT = '.hwp,.hwpx,.docx,.txt'
export async function extractDocument(file: File): Promise<DocText> {
  const name = file.name.toLowerCase()
  const buf = new Uint8Array(await file.arrayBuffer())
  let kind: DocText['kind']
  let blocks: DocBlock[] = []
  if (typeof DecompressionStream === 'undefined' && !name.endsWith('.txt')) throw new Error('이 브라우저는 파일 압축 해제를 지원하지 않습니다(크롬·엣지 최신 버전 사용).')
  if (name.endsWith('.hwp') || (buf[0] === 0xd0 && buf[1] === 0xcf)) {
    kind = 'hwp'; blocks = await hwpBlocks(buf)
  } else if (name.endsWith('.hwpx') || name.endsWith('.docx') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    const files = await unzip(buf, (n) => /^Contents\/section\d+\.xml$/i.test(n) || n === 'word/document.xml')
    const secs = [...files.keys()].filter((n) => n.startsWith('Contents/')).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    if (secs.length) { kind = 'hwpx'; for (const s of secs) walkXml(parseXml(files.get(s)!), blocks) }
    else if (files.has('word/document.xml')) { kind = 'docx'; walkXml(parseXml(files.get('word/document.xml')!), blocks) }
    else throw new Error('HWPX·DOCX 본문을 찾지 못했습니다.')
  } else if (name.endsWith('.txt')) {
    kind = 'txt'
    let s = td().decode(buf)
    if (s.includes('�')) s = td('euc-kr').decode(buf)
    blocks = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  } else if (name.endsWith('.pdf')) {
    throw new Error('PDF는 아직 지원하지 않습니다. 한글·워드에서 HWP·HWPX·DOCX로 저장해 올려 주세요.')
  } else {
    throw new Error('지원 형식: HWP · HWPX · DOCX · TXT')
  }
  blocks = blocks.map((b) => (typeof b === 'string' ? b : b.filter((r) => r.some((c) => c))))
    .filter((b) => (typeof b === 'string' ? b.trim() : b.length))
  const text = blocks.map((b) => (typeof b === 'string' ? b : b.map((r) => r.join(' | ')).join('\n'))).join('\n')
  return { kind, blocks, text }
}
