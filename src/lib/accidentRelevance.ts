// [137] 산재 알림 — 뉴스·KOSHA 사례 중 '학교 종사자 업무와 관련 있는 것'만 고르는 규칙 (단일 소스).
// 같은 규칙을 dev-backend.mjs(로컬 뉴스 수집)도 사용 — 바꿀 때 함께 맞출 것.
//
// 판정: ① 사고·재해 단어가 있고 ② 학교 업무(공정·장소·직종) 단어가 있으며 ③ 제외어(학교폭력·입시 등)가 없을 것.
// 점수 = 학교 업무 단어 가중치 합 + 사고 유형 가중치 합 → 높은 순으로 노출.

export type RelevanceTag = { label: string; kind: 'sector' | 'type' }
export type Relevance = { ok: boolean; score: number; tags: RelevanceTag[]; region: 'local' | 'other' | 'none' }

// 학교 업무 관련어 — [표시 라벨, 정규식, 가중치]
const SECTOR: [string, RegExp, number][] = [
  ['급식실', /급식실|급식소|단체급식|학교\s*급식|급식\s*(종사자|노동자)/, 5],
  ['조리', /조리실무사|조리원|조리사|조리\s*종사자|조리실|조리흄|폐암/, 5],
  ['학교', /학교|초등|중학교|고등학교|유치원|특수학교/, 3],
  ['교육청', /교육청|교육지원청|교육공무직|교육부/, 3],
  ['시설관리', /시설관리|시설\s*주무관|당직|경비원|시설물\s*점검/, 3],
  ['미화', /미화원|환경미화|청소\s*노동자|청소원/, 3],
  ['통학', /통학\s*차량|통학버스|통학\s*보조/, 3],
]
// 사고·재해 유형 — [표시 라벨, 정규식, 가중치]
const TYPE: [string, RegExp, number][] = [
  ['중대재해', /중대재해|중대산업재해|사망사고|숨져|숨진|사망/, 4],
  ['화상', /화상|뜨거운\s*물|국솥|튀김|기름/, 3],
  ['끼임', /끼임|끼여|협착|절단기|분쇄기|파쇄기/, 3],
  ['넘어짐', /넘어짐|미끄러|전도/, 3],
  ['추락', /추락|떨어져|사다리/, 3],
  ['근골격계', /근골격계|허리|어깨|중량물/, 2],
  ['폐질환', /폐암|조리흄|호흡기/, 3],
  ['산재', /산재|산업재해|업무상\s*재해|노동부|고용노동부|산업안전/, 2],
  ['사고', /사고|부상|다쳐|다친|중상|재해|폭발|화재|감전/, 1],
]
// 학교 업무와 무관한 '학교' 기사 제외어
// [138] 지역 — 플랫폼 대상은 전남. 전남 기사 우선, 다른 지역 기사는 제외, 지역 언급이 없는 전국 기사는 포함.
//  (일반 단어와 겹치는 군 이름은 '군·교육' 등과 붙은 경우만: 영광·진도·장성·보성)
const LOCAL = /전남|김대중\s*교육감|전라남도|목포|여수|순천|나주|광양|담양|곡성|구례|고흥|보성(군|교육)|화순|장흥|강진|해남|영암|무안|함평|영광(군|교육)|장성(군|교육)|완도|진도(군|교육)|신안/
const OTHER_REGION = /서울|부산|대구|인천|광주|대전|울산|세종(시|교육)|경기|강원|충북|충남|충청|전북|전라북도|경북|경남|경상|제주|수원|성남|용인|고양|창원|청주|천안|전주|포항|김해|평택|화성|안산|안양|부천|의정부|남양주|김포|파주|춘천|원주|강릉|군산|익산|구미|경주|진주|거제|통영/
export const LOCAL_LABEL = '전남'
const EXCLUDE = /학교폭력|학폭|성범죄|성추행|성폭력|수능|입시|대입|졸업식|입학식|축제|체험학습\s*버스|수학여행|학생\s*안전사고|아동학대|급식\s*메뉴|급식비|무상급식\s*예산|맛집|주가|증시|선거/

export function scoreRelevance(...texts: (string | null | undefined)[]): Relevance {
  const t = texts.filter(Boolean).join(' ').replace(/\s+/g, ' ')
  if (!t || EXCLUDE.test(t)) return { ok: false, score: 0, tags: [], region: 'none' }
  const region: Relevance['region'] = LOCAL.test(t) ? 'local' : OTHER_REGION.test(t) ? 'other' : 'none'
  if (region === 'other') return { ok: false, score: 0, tags: [], region } // 다른 지역 기사 제외
  let s = 0; let ty = 0
  const tags: RelevanceTag[] = []
  for (const [label, re, w] of SECTOR) if (re.test(t)) { s += w; tags.push({ label, kind: 'sector' }) }
  for (const [label, re, w] of TYPE) if (re.test(t)) { ty += w; tags.push({ label, kind: 'type' }) }
  // 학교 업무 단어 1개 이상 + 사고 유형 1개 이상일 때만 관련 있음
  const ok = s > 0 && ty > 0
  // '학교'만 걸린 경우(급식·조리·시설 등 직종 단서 없음)는 사고 단서가 강할 때만 인정
  const onlyGeneric = tags.filter((x) => x.kind === 'sector').every((x) => x.label === '학교' || x.label === '교육청')
  const okFinal = ok && (!onlyGeneric || ty >= 4)
  // 화면에는 대표 태그 3개까지(직종 우선 → 유형), '사고'는 다른 유형이 있으면 생략
  const types = tags.filter((x) => x.kind === 'type')
  const shown = [
    ...tags.filter((x) => x.kind === 'sector' && x.label !== '학교'),
    ...types.filter((x) => !(x.label === '사고' && types.length > 1)),
  ].slice(0, 3)
  // 전남 기사는 우선 노출(+10) · 태그 맨 앞에 '전남'
  return { ok: okFinal, score: s + ty + (region === 'local' ? 10 : 0), tags: region === 'local' ? [{ label: LOCAL_LABEL, kind: 'sector' as const }, ...shown].slice(0, 3) : shown, region }
}

// [137→141] 같은 사건 기사 묶기 — 언론사마다 제목을 바꿔 써도 하나로.
//  같은 사건으로 보는 기준(제목 글자 2-gram 유사도 = 자카드):
//   ① 유사도 0.3 이상 — 날짜 무관
//   ② 유사도 0.15 이상 + 보도일 3일 이내 — 같은 날 쏟아진 보도(예: '교육청, 폐암 급식종사자 선제 배상' 여러 버전)
//  묶음 안 어느 기사와든 기준을 넘으면 같은 묶음(단일 연결). 대표 = 가장 최근 기사, 나머지는 others 로 보관(펼쳐 보기용).
// [143] 뉴스 보관 원칙 — 기사를 DB에 쌓지 않는다. 매번 최근 기사를 가져와 보여주기만 하고(서버는 30분 캐시만),
//       보도일이 3개월(90일) 지난 기사는 목록에서 자동으로 빠진다. (원문은 언론사 링크로만 연결)
export const NEWS_RETENTION_DAYS = 90
export const withinRetention = (date?: string, now = Date.now()) => {
  const t = Date.parse(date ?? '')
  return Number.isFinite(t) && now - t <= NEWS_RETENTION_DAYS * 864e5
}

export type StoryRef = { title: string; url?: string; publisher?: string; date?: string }
const bigrams = (t: string) => {
  const s = t.replace(/[^가-힣A-Za-z0-9]/g, '')
  const g = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2))
  return g
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / Math.max(1, a.size + b.size - inter)
}
const dayDiff = (a?: string, b?: string) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 864e5 : 99)
/** 언론사 표기 정리 — 'https://www.abc.com/' 처럼 주소로 온 경우 도메인만 */
export function cleanPublisher(p?: string) {
  const v = (p ?? '').trim()
  if (!/^https?:\/\//i.test(v)) return v
  try { return new URL(v).hostname.replace(/^www\./, '') } catch { return v }
}
export function dedupeStories<T extends StoryRef & { related?: number; others?: StoryRef[] }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const out: { it: T; mem: { g: Set<string>; date?: string }[] }[] = []
  for (const it of sorted) {
    const g = bigrams(it.title)
    const hit = out.find((o) => o.mem.some((m) => { const j = jaccard(m.g, g); return j >= 0.3 || (j >= 0.15 && dayDiff(m.date, it.date) <= 3) }))
    if (hit) {
      const add: StoryRef[] = [{ title: it.title, url: it.url, publisher: cleanPublisher(it.publisher), date: it.date }, ...(it.others ?? [])]
      const others = [...(hit.it.others ?? []), ...add]
      hit.it = { ...hit.it, others, related: others.length }
      hit.mem.push({ g, date: it.date })
    } else {
      const others = it.others ?? []
      out.push({ it: { ...it, publisher: cleanPublisher(it.publisher), others, related: others.length }, mem: [{ g, date: it.date }] })
    }
  }
  return out.map((o) => o.it)
}

// [142] 이슈(주제) 단위 묶기 — 같은 사건이 아니어도 같은 주제가 이어지는 기사(예: 급식실 폐암 산재·배상 관련
//       판결·통계·국감·배상 추진 기사)를 1행으로 묶는다. 주제 = 업무(급식실·시설관리·미화·통학·학교) × 대표 사고 유형.
//       전남 기사는 따로 묶어 전남 소식이 전국 이슈에 묻히지 않게 한다. 대표 = 가장 최근 기사.
const ISSUE_SECTOR: [string, RegExp][] = [
  ['급식실', /급식|조리/], ['시설관리', /시설관리|시설\s*주무관|당직|경비원/], ['미화', /미화|청소/], ['통학', /통학/], ['학교', /./],
]
const ISSUE_TYPE: [string, RegExp][] = [
  ['폐암', /폐암|조리흄|호흡기/], ['화상', /화상|뜨거운\s*물|국솥|튀김/], ['끼임', /끼임|끼여|협착|절단기|분쇄기/],
  ['넘어짐', /넘어짐|미끄러|전도/], ['추락', /추락|떨어져|사다리/], ['근골격계', /근골격계|중량물/],
  ['중대재해', /중대재해|사망|숨져|숨진/], ['산재', /./],
]
export function issueOf(text: string): { key: string; label: string } {
  const t = text || ''
  const sector = ISSUE_SECTOR.find(([, re]) => re.test(t))?.[0] ?? '학교'
  const type = ISSUE_TYPE.find(([, re]) => re.test(t))?.[0] ?? '산재'
  const local = LOCAL.test(t)
  return { key: `${local ? 'L' : 'N'}|${sector}|${type}`, label: `${local ? '전남 ' : ''}${sector} ${type}` }
}
export function groupByIssue<T extends StoryRef & { summary?: string; related?: number; others?: StoryRef[] }>(items: T[]): (T & { issue: string })[] {
  const sorted = [...items].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const map = new Map<string, T & { issue: string }>()
  for (const it of sorted) {
    const { key, label } = issueOf(`${it.title} ${it.summary ?? ''}`)
    const cur = map.get(key)
    if (!cur) { map.set(key, { ...it, issue: label, others: [...(it.others ?? [])], related: (it.others ?? []).length }); continue }
    const add: StoryRef[] = [{ title: it.title, url: it.url, publisher: it.publisher, date: it.date }, ...(it.others ?? [])]
    const others = [...(cur.others ?? []), ...add]
    map.set(key, { ...cur, others, related: others.length })
  }
  return [...map.values()]
}
