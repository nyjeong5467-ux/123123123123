// 근골격계 증상조사표 통계 — KOSHA 「근골격계부담작업 유해요인조사 지침」 기준.
// 기존 엑셀(00_보호해제_수식유지.xlsx '데이터'/'결과' 시트)의 분류·집계 로직을 그대로 이식.
//
// 부위별 판정(문항2 통증기간 1~5 · 문항3 통증강도 1~4 · 문항4 통증빈도 1~5):
//   통증호소자 : 기간>=3 AND 강도>=3 AND 빈도>=3        (엑셀 BB8 1차 조건)
//   관리대상자 : (기간>=3 OR 빈도>=3) AND 강도>=2         (엑셀 BB8 2차 조건)
//   정상       : 그 외 / 문항 미응답
// 전체 판정: 한 부위라도 통증호소자→통증호소자, 없고 관리대상자 있으면→관리대상자, else 정상 (엑셀 BH8)

export type PartKey = 'neck' | 'shoulder' | 'arm' | 'hand' | 'waist' | 'leg'
export type Verdict = '정상' | '관리대상자' | '통증호소자'

export const PARTS: { key: PartKey; label: string }[] = [
  { key: 'neck', label: '목' },
  { key: 'shoulder', label: '어깨' },
  { key: 'arm', label: '팔/팔꿈치' },
  { key: 'hand', label: '손/손목/손가락' },
  { key: 'waist', label: '허리' },
  { key: 'leg', label: '다리/발' },
]

// 문항 코드(엑셀 값과 동일: 1부터). 표시 라벨.
export const DURATION_OPTS = ['1일 미만', '1일~1주일 미만', '1주일~1달 미만', '1달~6달 미만', '6달 이상'] // 문항2 기간 1~5
export const INTENSITY_OPTS = ['약한 통증', '중간 통증', '심한 통증', '매우 심한 통증'] // 문항3 강도 1~4
export const FREQUENCY_OPTS = ['6개월에 1번', '2~3달에 1번', '1~2주에 1번', '2~3일에 1번', '매일'] // 문항4 빈도 1~5
export const BURDEN_OPTS = ['전혀 힘들지 않음', '견딜만 함', '약간 힘듬', '매우 힘듬'] // 육체적 부담정도 1~4

export type PartAnswer = { duration?: number; intensity?: number; frequency?: number }
export type Worker = {
  id: string
  name: string
  age?: number
  sex?: 1 | 2 // 남1/여2
  dept?: string // 부서
  line?: string // 라인
  job?: string // 작업
  married?: 1 | 2
  curYears?: number // 현재 작업기간(년)
  workHours?: number
  prevYears?: number // 이전 작업기간(년)
  burden?: number // 육체적 부담정도 1~4
  parts: Partial<Record<PartKey, PartAnswer>>
}

export const VERDICTS: Verdict[] = ['정상', '관리대상자', '통증호소자']

/** 부위 1개 판정 — 엑셀 BB8 로직 그대로. */
export function classifyPart(a?: PartAnswer): Verdict {
  if (!a) return '정상'
  const d = a.duration, i = a.intensity, f = a.frequency
  if (d == null || i == null || f == null) return '정상'
  if (d >= 3 && i >= 3 && f >= 3) return '통증호소자'
  if ((d >= 3 || f >= 3) && i >= 2) return '관리대상자'
  return '정상'
}

/** 종사자 전체 판정 — 엑셀 BH8 로직(통증호소자 우선 → 관리대상자 → 정상). */
export function classifyWorker(w: Worker): { byPart: Record<PartKey, Verdict>; overall: Verdict } {
  const byPart = {} as Record<PartKey, Verdict>
  let anyPain = false, anyManage = false
  for (const p of PARTS) {
    const v = classifyPart(w.parts[p.key])
    byPart[p.key] = v
    if (v === '통증호소자') anyPain = true
    else if (v === '관리대상자') anyManage = true
  }
  const overall: Verdict = anyPain ? '통증호소자' : anyManage ? '관리대상자' : '정상'
  return { byPart, overall }
}

type VC = Record<Verdict, number>
const emptyVC = (): VC => ({ 정상: 0, 관리대상자: 0, 통증호소자: 0 })
const vcTotal = (c: VC) => c.정상 + c.관리대상자 + c.통증호소자

export type Group = { key: string; counts: VC; total: number }
export type Thresh = [number, number, number]
// 엑셀 결과!I21·J21·K21(현재)·I26·J26·K26(이전) 기본값.
export const DEFAULT_CUR_THRESH: Thresh = [1, 3, 3]
export const DEFAULT_PREV_THRESH: Thresh = [1, 2, 3]

// 연령대 구간(20대 이하~60세 이상). 엑셀엔 없고(평균/표준편차만) 신규 추가.
export const AGE_BANDS: { label: string; test: (a: number) => boolean }[] = [
  { label: '29세 이하', test: (a) => a <= 29 },
  { label: '30~39세', test: (a) => a >= 30 && a <= 39 },
  { label: '40~49세', test: (a) => a >= 40 && a <= 49 },
  { label: '50~59세', test: (a) => a >= 50 && a <= 59 },
  { label: '60세 이상', test: (a) => a >= 60 },
]
function ageBandIndex(a: number): number {
  const i = AGE_BANDS.findIndex((b) => b.test(a))
  return i < 0 ? AGE_BANDS.length - 1 : i
}

export type Stats = {
  total: number
  overall: VC
  byPart: Record<PartKey, VC> & { all: VC }
  bySex: { 남: VC; 여: VC; 미상: VC }
  byDept: Group[]
  byLine: Group[]
  byJob: Group[]
  byBurden: { level: number; label: string; counts: VC; total: number }[]
  byCurPeriod: Group[]
  byPrevPeriod: Group[]
  byAgeBand: Group[]
  age: { n: number; mean: number; sd: number }
}

/** 작업기간(년) → 버킷 인덱스 0~3 (엑셀 BM8: <t1→0, <t2→1, <t3→2, else→3). */
function bucketIndex(x: number, t: Thresh): number {
  return x < t[0] ? 0 : x < t[1] ? 1 : x < t[2] ? 2 : 3
}
export function periodLabels(t: Thresh): string[] {
  return [`${t[0]}년 미만`, `${t[0]}~${t[1]}년`, `${t[1]}~${t[2]}년`, `${t[2]}년 이상`]
}

/** 전 종사자 집계 — 결과 시트의 통증호소자 분포·부서/라인/작업·작업기간 그룹 통계. */
export function computeStats(
  workers: Worker[],
  opts?: { curThresh?: Thresh; prevThresh?: Thresh },
): Stats {
  const curThresh = opts?.curThresh ?? DEFAULT_CUR_THRESH
  const prevThresh = opts?.prevThresh ?? DEFAULT_PREV_THRESH
  const overall = emptyVC()
  const byPart = { all: emptyVC() } as Record<PartKey, VC> & { all: VC }
  for (const p of PARTS) byPart[p.key] = emptyVC()
  const bySex = { 남: emptyVC(), 여: emptyVC(), 미상: emptyVC() }
  const deptMap = new Map<string, VC>()
  const lineMap = new Map<string, VC>()
  const jobMap = new Map<string, VC>()
  const burdenMap = new Map<string, VC>()
  const curBuckets = [emptyVC(), emptyVC(), emptyVC(), emptyVC()]
  const prevBuckets = [emptyVC(), emptyVC(), emptyVC(), emptyVC()]
  const ageBands = AGE_BANDS.map(() => emptyVC())
  const ages: number[] = []
  const bump = (m: Map<string, VC>, k: string, v: Verdict) => {
    if (!m.has(k)) m.set(k, emptyVC())
    m.get(k)![v]++
  }

  for (const w of workers) {
    const { byPart: bp, overall: ov } = classifyWorker(w)
    overall[ov]++
    byPart.all[ov]++
    for (const p of PARTS) byPart[p.key][bp[p.key]]++
    bySex[w.sex === 1 ? '남' : w.sex === 2 ? '여' : '미상'][ov]++
    bump(deptMap, (w.dept || '').trim() || '(미지정)', ov)
    bump(lineMap, (w.line || '').trim() || '(미지정)', ov)
    bump(jobMap, (w.job || '').trim() || '(미지정)', ov)
    if (w.burden && w.burden >= 1 && w.burden <= 4) bump(burdenMap, String(w.burden), ov)
    if (typeof w.curYears === 'number' && !Number.isNaN(w.curYears)) curBuckets[bucketIndex(w.curYears, curThresh)][ov]++
    if (typeof w.prevYears === 'number' && !Number.isNaN(w.prevYears)) prevBuckets[bucketIndex(w.prevYears, prevThresh)][ov]++
    if (typeof w.age === 'number' && !Number.isNaN(w.age)) {
      ages.push(w.age)
      ageBands[ageBandIndex(w.age)][ov]++
    }
  }

  const toGroups = (m: Map<string, VC>): Group[] =>
    [...m.entries()].map(([key, counts]) => ({ key, counts, total: vcTotal(counts) })).sort((a, b) => b.total - a.total)
  const bucketsToGroups = (buckets: VC[], t: Thresh): Group[] =>
    buckets.map((counts, i) => ({ key: periodLabels(t)[i], counts, total: vcTotal(counts) })).filter((g) => g.total > 0)

  const byBurden = [1, 2, 3, 4]
    .filter((l) => burdenMap.has(String(l)))
    .map((l) => {
      const counts = burdenMap.get(String(l))!
      return { level: l, label: BURDEN_OPTS[l - 1], counts, total: vcTotal(counts) }
    })
  const n = ages.length
  const mean = n ? ages.reduce((s, a) => s + a, 0) / n : 0
  const sd = n ? Math.sqrt(ages.reduce((s, a) => s + (a - mean) ** 2, 0) / n) : 0

  return {
    total: workers.length, overall, byPart, bySex,
    byDept: toGroups(deptMap), byLine: toGroups(lineMap), byJob: toGroups(jobMap),
    byBurden,
    byCurPeriod: bucketsToGroups(curBuckets, curThresh),
    byPrevPeriod: bucketsToGroups(prevBuckets, prevThresh),
    byAgeBand: ageBands.map((counts, i) => ({ key: AGE_BANDS[i].label, counts, total: vcTotal(counts) })).filter((g) => g.total > 0),
    age: { n, mean, sd },
  }
}

// ── 엑셀 '데이터' 시트 붙여넣기 파서 ──────────────────────────────────────
// Excel에서 데이터 행(A열 순번부터)을 복사→붙여넣으면 탭 구분. 컬럼 위치(0-based):
//  1=성명 2=연령 3=성별 5=부서 6=라인 7=작업 8=결혼 10=현재기간(K) 11=근무(L) 14=이전기간(O)
//  18=부담(S)  목: 19,20,21(T2·U3·V4)  어깨: 25,26,27(Z2·AA3·AB4)  팔: 31,32,33(AF·AG·AH)
//  손: 37,38,39(AL·AM·AN)  허리: 42,43,44(AQ·AR·AS)  다리: 48,49,50(AW·AX·AY)
const PART_COLS: Record<PartKey, [number, number, number]> = {
  neck: [19, 20, 21],
  shoulder: [25, 26, 27],
  arm: [31, 32, 33],
  hand: [37, 38, 39],
  waist: [42, 43, 44],
  leg: [48, 49, 50],
}
const numOr = (s: string | undefined): number | undefined => {
  if (s == null) return undefined
  const t = s.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** 엑셀 데이터 시트 붙여넣기(TSV) → Worker[]. 헤더/빈행 스킵.
 *  복사 시작 열이 A(순번)든 B(성명)든 자동 감지(shift)하여 정렬을 보정한다. */
export function parsePastedData(tsv: string, idBase = 'w'): Worker[] {
  const out: Worker[] = []
  const lines = tsv.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')

  // A열(순번)부터인지 B열(성명)부터인지 자동 감지.
  //  A-start: col0=순번(숫자), col1=성명(텍스트)  → shift 0
  //  B-start: col0=성명(텍스트), col1=연령(숫자)  → shift -1
  let shift = 0
  for (const line of lines) {
    const c = line.split('\t')
    const c0 = (c[0] || '').trim(), c1 = (c[1] || '').trim()
    const c0num = numOr(c0) != null, c1num = numOr(c1) != null
    if (c0num && c1 !== '' && !c1num) { shift = 0; break }
    if (c0 !== '' && !c0num && c1num) { shift = -1; break }
  }
  const at = (cols: string[], idx: number): string | undefined => cols[idx + shift]

  let seq = 0
  for (const line of lines) {
    const cols = line.split('\t')
    const name = (at(cols, 1) || '').trim()
    // 헤더/합계/설명행 스킵
    if (!name || name === '성명' || /^#/.test(name)) continue
    const parts: Partial<Record<PartKey, PartAnswer>> = {}
    for (const p of PARTS) {
      const [dc, ic, fc] = PART_COLS[p.key]
      const duration = numOr(at(cols, dc)), intensity = numOr(at(cols, ic)), frequency = numOr(at(cols, fc))
      if (duration != null || intensity != null || frequency != null) parts[p.key] = { duration, intensity, frequency }
    }
    const sexN = numOr(at(cols, 3))
    const marN = numOr(at(cols, 8))
    out.push({
      id: `${idBase}-${++seq}`,
      name,
      age: numOr(at(cols, 2)),
      sex: sexN === 1 ? 1 : sexN === 2 ? 2 : undefined,
      dept: (at(cols, 5) || '').trim() || undefined,
      line: (at(cols, 6) || '').trim() || undefined,
      job: (at(cols, 7) || '').trim() || undefined,
      married: marN === 1 ? 1 : marN === 2 ? 2 : undefined,
      curYears: numOr(at(cols, 10)),
      workHours: numOr(at(cols, 11)),
      prevYears: numOr(at(cols, 14)),
      burden: numOr(at(cols, 18)),
      parts,
    })
  }
  return out
}
