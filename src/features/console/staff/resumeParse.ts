// [152] 이력서 문서(HWP·HWPX·DOCX·TXT) → 이력서 항목 자동 인식
// 규칙 기반(표 머리글·구역 제목·날짜 모양)으로 학력·경력·자격·교육과 연락처·이메일을 찾는다.
// 결과는 바로 저장하지 않고 편집 화면에 미리보기로 보여 준 뒤 '적용'을 눌러야 반영된다.
import type { DocBlock } from '../../../lib/docText'
import type { Resume, ResumeRow } from './staffData'

export type ParsedResume = {
  name?: string; phone?: string; email?: string; position?: string
  education: ResumeRow[]; career: ResumeRow[]; certs: ResumeRow[]; trainings: ResumeRow[]
}
type Sec = 'education' | 'career' | 'certs' | 'trainings'

const SEC_RE: [Sec, RegExp][] = [
  ['education', /^(최종\s*)?학\s*력(\s*사\s*항)?$|^학력\s*및\s*전공$/],
  ['career', /^(주요\s*)?경\s*력(\s*사\s*항)?$|^근무\s*경력$|^경력\s*및\s*업무$/],
  ['certs', /^자\s*격(\s*증|\s*사\s*항|\s*면허|\s*및\s*면허)?(\s*사\s*항)?$|^면허\s*[·및]?\s*자격(\s*사\s*항)?$|^보유\s*자격(증)?$/],
  ['trainings', /^(교육|연수|훈련)(\s*이수)?(\s*사\s*항|\s*내역|\s*실적)?$|^이수\s*교육$/],
]
// 구역을 끝내는 다른 제목(가족·병역·어학 등)
const OTHER_SEC = /^(인적\s*사항|가족\s*사항|병\s*역(\s*사항)?|어\s*학(\s*능력)?|외국어|수상(\s*경력|\s*내역)?|상\s*벌|자기\s*소개(서)?|특기\s*사항|기타(\s*사항)?|컴퓨터\s*활용(\s*능력)?|OA\s*능력|경력\s*기술서)$/
const norm = (s: string) => s.replace(/[\s:：·ㆍ]+/g, ' ').replace(/[()（）[\]]/g, '').trim()
const secOf = (s: string): Sec | 'other' | null => {
  const n = norm(s)
  if (n.length > 14) return null
  for (const [k, re] of SEC_RE) if (re.test(n)) return k
  if (OTHER_SEC.test(n)) return 'other'
  return null
}

// 머리글 역할
type Role = 'from' | 'to' | 'period' | 'org' | 'major' | 'degree' | 'position' | 'duty' | 'name' | 'issuer' | 'note'
// 머리글 칸 이름(칸 전체가 이 말일 때만 — '전남대학교' 같은 자료 값과 구분)
const HEAD: [Role, RegExp][] = [
  ['from', /^(입학|입사|시작|개시)(일|년월|일자)?$/],
  ['to', /^(졸업|퇴사|종료|수료)(일|년월|일자)?$/],
  ['period', /^((재학|근무|재직|교육|이수|수강|연수)?기간|년월|연월|일자|일시|날짜|연도|년도|취득(일|년월|일자)?|이수(일|년월|일자)|교육일)$/],
  ['issuer', /^(발급|발행|시행|교육|주관)(기관|처)?$|^(등록|자격|면허)?번호$|^(이수)?시간$|^주관$/],
  ['org', /^(학교|학교명|출신학교|대학|대학교|대학명|회사|회사명|근무처|직장|직장명|기관|기관명|업체|업체명|소속|근무지)$/],
  ['major', /^(전공|학과|학과명|전공학과|계열|전공\(학과\))$/],
  ['degree', /^(학위|졸업여부|졸업구분|구분|상태|학력구분)$/],
  ['position', /^(직위|직급|직책|직함|직위직급)$/],
  ['duty', /^(담당업무|업무내용|주요업무|업무|담당|주요경력|수행업무)$/],
  ['name', /^(자격증|자격증명|자격명|자격|면허|면허명|자격면허|종목|교육명|교육과정|과정명|과정|연수명|교육내용)$/],
  ['note', /^(비고|퇴직사유|사유|등급|점수)$/],
]
const roleOf = (s: string): Role | null => {
  const n = norm(s).replace(/\s+/g, '')
  if (!n || n.length > 10 || /\d/.test(n)) return null
  for (const [r, re] of HEAD) if (re.test(n)) return r
  return null
}

const DATE_RE = /(19|20)\d{2}\s*[.\-/년]\s*\d{1,2}(\s*[.\-/월]\s*\d{1,2})?\s*[.일]?|(19|20)\d{2}\s*년?/g
const ym = (s: string): string => {
  const m = s.match(/((19|20)\d{2})\s*[.\-/년]?\s*(\d{1,2})?/)
  if (!m) return ''
  return m[3] ? `${m[1]}.${m[3].padStart(2, '0')}` : m[1]
}
/** 셀 안의 기간 표기를 'YYYY.MM~YYYY.MM' 꼴로 */
function periodOf(s: string): string {
  const ds = s.match(DATE_RE) || []
  const now = /현재|재직|재학|~\s*$/.test(s)
  if (ds.length >= 2) { const a = ym(ds[0] ?? ''); const b = ym(ds[1] ?? ''); return a === b ? a : `${a}~${b}` }
  if (ds.length === 1) return now ? `${ym(ds[0] ?? "")}~현재` : ym(ds[0] ?? "")
  return ''
}
const hasDate = (s: string) => /(19|20)\d{2}\s*[.\-/년]/.test(s) || /^(19|20)\d{2}$/.test(s.trim())

const cleanRow = (r: ResumeRow): ResumeRow => ({ period: r.period.trim(), title: r.title.replace(/\s+/g, ' ').trim(), detail: (r.detail || '').replace(/\s+/g, ' ').trim() })

/** 머리글로 열 역할을 알면 그걸로, 모르면 날짜·순서로 한 행을 항목으로 바꾼다 */
function rowToItem(sec: Sec, cells: string[], roles: (Role | null)[] | null): ResumeRow | null {
  const vals = cells.map((c) => c.trim())
  if (!vals.some(Boolean)) return null
  if (vals.every((v) => roleOf(v))) return null // 머리글 반복
  let period = ''; let title = ''; const detail: string[] = []
  if (roles) {
    // 왼쪽 병합(구역 제목) 셀 때문에 칸 수가 모자라면 오른쪽 기준으로 맞춘다
    // 병합 셀이 빈 칸으로 남은 경우(칸 수가 많음) 왼쪽 빈 칸·구역 제목 칸을 버린다
    while (vals.length > roles.length && (!vals[0] || secOf(vals[0]))) vals.shift()
    const shift = roles.length - vals.length
    let from = ''; let to = ''
    vals.forEach((v, i) => {
      const r = roles[i + Math.max(0, shift)] ?? null
      if (!v) return
      if (r === 'from') from = v
      else if (r === 'to') to = v
      else if (r === 'period') period = periodOf(v) || v
      else if (r === 'org' || r === 'name') title = title ? `${title} ${v}` : v
      else if (r === 'major' || r === 'degree' || r === 'position' || r === 'duty' || r === 'issuer') detail.push(v)
      else if (!r && hasDate(v) && !period) period = periodOf(v)
      else if (!r && !title) title = v
      else if (r !== 'note') detail.push(v)
    })
    if (!period && (from || to)) period = `${ym(from) || from}~${ym(to) || (/(현재|재직)/.test(to) ? '현재' : to)}`.replace(/^~|~$/, '')
  } else {
    const rest: string[] = []
    for (const v of vals) { if (!v) continue; if (!period && hasDate(v)) { const p = periodOf(v); period = p; const left = v.replace(DATE_RE, '').replace(/[~\-–]|현재|재직|재학|졸업|입학/g, ' ').trim(); if (left.length > 1) rest.push(left) } else rest.push(v) }
    title = rest.shift() || ''
    detail.push(...rest)
  }
  if (!title && !period) return null
  if (!title && detail.length) title = detail.shift()!
  // 학력: 학교명만 들어간 칸이 아닐 때 'OO대학교 건축공학과' 를 학교/전공으로 나눔
  if (sec === 'education' && !detail.length) {
    const m = title.match(/^(.*?(대학교|대학원|대학|고등학교|학교))\s+(.+)$/)
    if (m) { title = m[1]; detail.push(m[3]) }
  }
  return cleanRow({ period, title, detail: detail.join(' · ') })
}

/** 문단 한 줄(표가 아닌 이력서)을 항목으로: '2014.03 ~ 2021.12 ○○건설 현장 안전관리' */
function lineToItem(sec: Sec, s: string): ResumeRow | null {
  if (!hasDate(s)) return null
  const period = periodOf(s)
  const rest = s.replace(DATE_RE, ' ').replace(/^[\s~\-–:·]+|(현재|재직|재학)/g, ' ').replace(/^[\s~\-–:·,]+/, '').replace(/\s+/g, ' ').trim()
  if (!rest) return null
  const parts = rest.split(/\s*[,|/·]\s*|\s{2,}/).filter(Boolean)
  let title = parts.shift() || rest
  const detail = parts
  const paren = title.match(/^(.*\S)\s*[(（]([^)）]+)[)）]$/)
  if (paren) { title = paren[1]; detail.unshift(paren[2]) }
  if (detail.length === 0) {
    const m = title.match(/^(\S+(?:\s+\S+)?(?:대학교|대학원|대학|고등학교|건설|공단|공사|협회|㈜|\(주\)|주식회사)\S*)\s+(.+)$/)
    if (m) { title = m[1]; detail.push(m[2]) }
  }
  return cleanRow({ period, title, detail: detail.join(' · ') })
}

export function parseResume(blocks: DocBlock[]): ParsedResume {
  const res: ParsedResume = { education: [], career: [], certs: [], trainings: [] }
  const all = blocks.map((b) => (typeof b === 'string' ? b : b.map((r) => r.join(' ')).join(' '))).join(' ')
  res.email = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]
  res.phone = all.match(/01[016789][-.\s)]*\d{3,4}[-.\s]*\d{4}/)?.[0]?.replace(/[.\s)]+/g, '-').replace(/-+/g, '-')

  let sec: Sec | 'other' | null = null
  const push = (s: Sec, r: ResumeRow | null) => { if (r && (r.title || r.period)) res[s].push(r) }

  for (const b of blocks) {
    if (typeof b === 'string') {
      const k = secOf(b.replace(/^[\d\s.\-■□▶●○◆◇※▣❍\][]+/, ''))
      if (k) { sec = k; continue }
      if (sec && sec !== 'other') push(sec, lineToItem(sec, b))
      continue
    }
    // 표: 행마다 구역 제목·머리글·자료를 판단
    let roles: (Role | null)[] | null = null
    for (const row0 of b) {
      let row = row0
      // 행 첫 칸이 구역 제목인 형식(왼쪽 병합 셀)
      const k0 = row.length ? secOf(row[0]) : null
      if (k0) { if (k0 !== sec) roles = null; sec = k0; row = row.slice(1) }
      // 한 칸짜리 구역 제목 행
      if (row.length === 1 && secOf(row[0])) { sec = secOf(row[0]); roles = null; continue }
      if (!row.some(Boolean)) continue
      // 인적사항 칸에서 이름·직위
      for (let i = 0; i + 1 < row.length; i++) {
        const k = norm(row[i])
        if (!res.name && /^(성\s*명|이\s*름|성명\s*한글|한\s*글)$/.test(k) && row[i + 1] && row[i + 1].length <= 10) res.name = row[i + 1].trim()
        if (!res.position && /^(직\s*위|직\s*급|희망\s*직무|지원\s*분야)$/.test(k) && row[i + 1] && row[i + 1].length <= 20 && !roleOf(row[i + 1])) res.position = row[i + 1].trim()
      }
      const rs = row.map(roleOf)
      if (rs.filter(Boolean).length >= 2 && rs.filter(Boolean).length >= Math.ceil(row.filter(Boolean).length * 0.6)) { roles = rs; continue }
      if (!sec || sec === 'other') continue
      push(sec, rowToItem(sec, row, roles))
    }
  }
  // 중복 제거
  for (const k of ['education', 'career', 'certs', 'trainings'] as Sec[]) {
    const seen = new Set<string>()
    res[k] = res[k].filter((r) => { const key = r.period + '|' + r.title; if (seen.has(key)) return false; seen.add(key); return true })
  }
  return res
}

/** 인식 결과를 편집 중 이력서에 반영 — 인식된 구역만 교체, 빈 기본 항목만 채움 */
export function applyParsed(cur: Resume, p: ParsedResume, pick: Record<string, boolean>): Resume {
  const next: Resume = { ...cur }
  if (pick.email && p.email) next.email = p.email
  if (pick.position && p.position) next.position = p.position
  if (pick.phone && p.phone) next.phone = p.phone
  for (const k of ['education', 'career', 'certs', 'trainings'] as Sec[]) if (pick[k] && p[k].length) next[k] = p[k]
  return next
}
