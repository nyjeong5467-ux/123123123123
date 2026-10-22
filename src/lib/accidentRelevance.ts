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

// [137] 같은 사건을 여러 언론사가 쓴 기사 묶기 — 제목 글자 2-gram 유사도(자카드) 0.3 이상이면 같은 기사로 보고
//       첫 기사(최신순 정렬 기준)만 남기고 묶인 수를 related 로 센다.
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
export function dedupeStories<T extends { title: string; related?: number }>(items: T[], threshold = 0.3): T[] {
  // 묶음 안의 어느 제목과든 비슷하면 같은 사건(단일 연결) — 언론사마다 제목을 조금씩 바꿔 쓰는 경우까지 묶음
  const out: { it: T; gs: Set<string>[] }[] = []
  for (const it of items) {
    const g = bigrams(it.title)
    const hit = out.find((o) => o.gs.some((x) => jaccard(x, g) >= threshold))
    if (hit) { hit.it = { ...hit.it, related: (hit.it.related ?? 0) + 1 }; hit.gs.push(g) }
    else out.push({ it: { ...it }, gs: [g] })
  }
  return out.map((o) => o.it)
}
