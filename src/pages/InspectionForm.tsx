// 종사자 안전·보건 점검표 작성 — 발주처 프로토타입(school-safety-ledger.js v-inspect) 포팅.
// PARTDEF/EXCL_RULES/CARRY_VALUE/autoExcl/renderInspect/tally 도메인 로직을 TS로 이식.
// 경로: /inspection/new?school=<id>
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import '../styles/inspectform.css'

/* ===================== 점검항목 (프로토타입 Q_GS·Q_TH·Q_SI·Q_MI 그대로) ===================== */
const Q_GS = ['바닥의 물·기름·물때 등으로 인해 미끄러질 위험 여부', '통로 확보 및 통행로나 바닥에 호스, 물품 적재·방치 여부', '장애물(문턱·배관·패인곳 및 돌출부 등)로 인해 넘어질 위험 여부', '조리장·계단·통로에 적정한 조명 설치 여부', '계단에 난간 설치, 답단 끝에 미끄러짐 방지 조치 여부', '미끄러짐 방지 장화 등 보호구 착용 여부', '청소 후 트렌치 덮개를 원상태로 덮어 놓았는지 여부', '왁스, 물청소 등으로 넘어짐 위험장소에 "미끄러짐표지" 부착 여부', '문은 쉽게 열고 닫을 수 있는 구조를 유지하고 있는지 여부', '재료 운반대차 및 배식차에 끼일 위험 여부', '양념재료(마늘·파·양파 등) 분쇄기·절단기에 말려들 위험 여부', '기계의 회전체(벨트·체인·회전날개 등)에 방호덮개 설치 여부', '리프트, 덤웨이터의 안전한 사용 여부||사람 탑승금지 조치, 출입문이 열린 상태에서는 동작이 안 되도록 조치 / 사용중량·경고표지 부착 여부', '절단기·분쇄기 칼날 부위에 베임방지용 덮개 설치 여부', '칼날 등에 베일 위험을 방지하기 위한 조치 여부', '칼 용도 외 사용 여부 (김치포장 끈 제거, 캔 뚜껑 제거, 식용유 뚜껑 제거 등)', '식자재 운반카트의 바퀴 고정장치(stopper) 정상작동 여부', '부딪힘 사고 유형별 예방 확인||선반 등 돌출부 / 이동 중인 급식카트 / 시야 미확보 / 식기세척·청소 후 일어서다가 / 의자·작업발판에서 내려오다가', '전기 기계·기구에 감전 예방용 접지 상태 여부', '누전차단기 설치 및 월 1회 이상 동작점검 여부', '전선의 노후화 또는 피복손상, 심하게 구부러짐 여부', '가스누출감지기, 경보기가 정상적으로 작동하는지 여부', '가스공급배관에서 가스가 누출되고 있지 않은지 여부', '급식실 작업장 환기는 충분히 실시하고 있는지 여부', '환기 방법', '환기장치 설치 및 조리 시 사용 여부', '환기장치 작동 여부', '급식실 후드청소 주기', '급식실 위치', '급식실에 적합한 소화기 비치 및 정상작동 여부', '국솥 등에 한꺼번에 많은 양의 식자재를 넣고 있지 않은가', '뜨거운 물, 국 등이 들어있는 회전식 국솥 핸들고정 장치가 정상적으로 고정되어 있는지 여부', '자외선 살균기, 전격살충기 등 램프 적정선정 및 정상작동 여부', '기타 각종 위험요인으로부터 근로자 보호조치 여부', '고온 스팀 사용장소에 "고온 경고" 또는 "화상주의" 표지 게시 여부', '뜨거운 용기 취급 시 방열장갑 또는 보조집게 사용 여부', '조리실 등 고온다습하고 환기가 불충분한 장소에 적정한 환기·통풍·냉방시설 설치 및 관리 여부', '물질안전보건자료(MSDS)의 게시(비치) 및 교육 여부', '취급용기 및 포장에 MSDS 경고표지 부착 여부', '세제, 청소제 등 화학물질 취급 시 고무장갑 등 적정 보호장구 착용 여부', '근골격계부담작업 유해요인조사 실시 여부', '근골격계질환 예방을 위해 인력작업 보조설비 및 편의설비 등 작업환경 개선 여부', '근골격계부담작업 종사자에 대한 유해성 주지(교육 등) 적정성', '중량물 안내포스터 부착 유무 — 5kg 이상 물체를 중량물로 취급', '작업 전·후 스트레칭 실시 및 적정 휴식시간 배분 여부', '운반작업 시 적정한 양 운반, 2인 1조 작업 또는 이동대차 등 운반보조도구 사용 여부']
const Q_TH = ['운전원은 차량이 항상 청결하도록 유지하였는가?', '운전 중 흡연 및 식음, 통화 등은 하지 않았는가?', '운전 중 직무수행에 필요한 사람 이외의 탑승은 없었는가?', '배차되지 않은 차량의 사적인 운행 행위는 금지되었는가?', '운전원은 차량 밖으로 이동 시 잠금장치를 하였는가?', '운전원은 경제속도운행 및 안전운행에 노력하였는가?', '승차 시 학생들의 안전한 탑승이 확인된 후에 출발하였는가?', '하차 시 학생들의 안전한 상태를 확인 후 하차하였는가?', '승하차 시 지정된 장소에 대기하고 있던 학부모와 인사를 나누고 학생들을 안전하게 인도하였는가?', '운행 중 창밖으로 손을 내밀거나 하는 위험 행동을 통제했는가?', '출발 전 학생들의 안전벨트 착용 등의 상태를 확인하였는가?', '차량의 학교 도착 후 유실물과 차량의 상태는 확인하였는가?']
const Q_SI = ['위험작업 시 안전모, 안전화 등 개인보호구를 착용하였는가?', '사다리 작업 시 안전한 작업방법을 숙지하고 있는가?', '각종 계기류 확인 시 감전 예방을 위한 절연장갑을 착용하였는가?', '기계 점검·보수 시 동력원을 완전히 차단 후 작업하는가?', '고장난 승강기를 임의로 열거나 기기를 조작하지는 않는가?', '승강기 점검·보수 시 접근금지 표지판을 부착하는가?', '각종 전기기구 작업 시 작업자가 감전사고에 대한 작업방법을 확실하게 인지하고 있는가?', '화학물질 취급 및 저장 시 별도의 지정된 장소에 보관하는가?', '사용하는 화학물질의 위험성 또는 유해성에 대해 정확히 알고 있는가?', '소화기 및 소화전의 작동 및 사용방법을 아는가?', '무거운 물체 운반 시 2인 1조로 작업을 실시하는가?', '올바른 중량물 취급방법에 대해 알고 있는가?', '작업 전·중·후 주기적으로 스트레칭을 하였는가?']
const Q_MI = ['바닥에 작업자가 걸려 넘어질 위험이 있는 장애물은 제거하였는가?', '근로자의 통행에 장해가 없도록 채광 또는 조명시설이 충분한가?', '교차점이나 코너에는 충돌방지용 거울을 설치하였는가?', '다른 사람과 충돌을 방지하기 위해 우측통행을 하는가?', '화장실 타일이 깨지거나 비어있는 부분은 없는가?', '청소 전 화장실 내부에 사람이 있는지 확인하였는가?', '화장실 천정이나 높은 벽 청소 시 사용하는 사다리에 미끄럼방지 조치를 하였는가?', '화장실 세면대나 변기 위에 올라가서 작업을 하지 않는가?', '청소 중에는 "청소 중"을 알리는 표지를 하고 작업하는가?', '청소 후 바닥에 미끄러운 세제나 물기를 깨끗이 제거하는가?', '청소도구를 지정된 위치에 보관하는가?', '자극성 세제를 이용한 청소 시 고무장갑을 착용하는가?', '청소 중에는 미끄럼 방지용 장화를 착용하는가?']

/* 비고가 '값'인 항목 — 지난 점검 값이 채워진 채 시작하고, 추천 보기에서 고를 수 있다 (CARRY_VALUE) */
const CARRY_VALUE: Record<string, { v: string; opts: string[] }> = {
  '급식-25': { v: '국소배기장치', opts: ['국소배기장치', '전체환기장치', '자연환기', '국소배기 + 전체환기'] },
  '급식-28': { v: '매주', opts: ['매주', '격주', '매월', '분기 1회'] },
  '급식-29': { v: '지상', opts: ['지상', '지하', '별동'] },
}

/* 파트 정의 — 백엔드 Part enum(catering/facility/cleaning/commute/night_duty) 매핑 */
type PartApi = 'catering' | 'facility' | 'cleaning' | 'commute' | 'night_duty'
type PartDef = { key: PartApi; label: string; name: string; q: string[] | null }
const PARTDEF: PartDef[] = [
  { key: 'catering', label: '급식', name: '급식종사자', q: Q_GS },
  { key: 'night_duty', label: '당직', name: '당직업무', q: null },
  { key: 'commute', label: '통학', name: '통학보조', q: Q_TH },
  { key: 'facility', label: '시설', name: '시설관리', q: Q_SI },
  { key: 'cleaning', label: '미화', name: '미화원', q: Q_MI },
]

/* ===================== 학교 특징 → 점검표 항목 자동 해당없음 매핑 (EXCL_RULES) ===================== */
const EXCL_RULES: { key: string; feat?: string; why: string; hit: Record<string, number[]> }[] = [
  { key: '엘리베이터', feat: '엘리베이터', why: '엘리베이터 없음', hit: { 시설: [5, 6] } },
  { key: '대형 곰솥', feat: '대형 곰솥', why: '대형 곰솥 없음', hit: { 급식: [32] } },
  { key: '계단 (2층 이상)', feat: '계단 (2층 이상)', why: '계단 없음', hit: { 급식: [5] } },
  { key: '덤웨이터', feat: '덤웨이터', why: '덤웨이터 없음', hit: { 급식: [13] } },
  { key: '미화 종사원', why: '미화 종사원 없음', hit: { 미화: [3, 7] } },
  { key: 'LPG 사용', feat: 'LPG 사용', why: 'LPG 미사용', hit: { 급식: [22, 23] } },
]

type FeatMap = Record<string, unknown> | null
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'yes' || v === '있음'

function autoExcl(feat: FeatMap, counts: Record<string, number>) {
  const ex: Record<string, Record<number, string>> = { 급식: {}, 통학: {}, 시설: {}, 미화: {} }
  const reasons: [string, string[]][] = []
  for (const r of EXCL_RULES) {
    // 학교 특징 규칙은 특징값이 저장돼 있을 때만 적용, 미화 규칙은 종사자 인원으로 판정
    const active = r.feat ? feat !== null && !truthy(feat[r.feat]) : (counts.cleaning ?? 0) === 0
    if (!active) continue
    const tags: string[] = []
    for (const [part, nos] of Object.entries(r.hit)) {
      for (const n of nos) {
        ex[part][n] = r.why
        tags.push(`${part} ${n}`)
      }
    }
    reasons.push([r.why, tags])
  }
  return { ex, reasons }
}

/* 사진대지 모델수 규칙(0709 회의): ~5명=1컷 · 6~10명=2컷 · 11~15명=3컷(최대 3컷 기본) */
const baseSlots = (n: number) => (n <= 5 ? 1 : n <= 10 ? 2 : 3)
const MAX_SLOTS = 8

/* ===================== 타입 ===================== */
type School = { id: string; name: string }
type Worker = { id: string; part: string; count: number }
type Ledger = {
  school: { id: string; name: string; is_private: boolean; address: string; email?: string }
  workers: Worker[]
}
type ApprovalStep = { title: string; name: string }
type PrevItem = { code: string; remark: string; result: string | null }
type PrevInsp = { id?: string; part: string; status?: string; items: PrevItem[] }
// 이어서 작성(resume): 저장된 결과값 → 폼 답변 역매핑 (구 시드 ok/fix 값도 방어적으로 수용)
const RES_INV: Record<string, Ans> = { good: '양호', poor: '미흡', na: '해당없음', ok: '양호', fix: '미흡' }
type Ans = '양호' | '미흡' | '해당없음'
type Slot = { name: string; dataUrl: string; caption: string }
type PartStatus = { st: 'idle' | 'run' | 'done' | 'err'; note: string }

const RES_API: Record<Ans, string> = { 양호: 'good', 미흡: 'poor', 해당없음: 'na' }
const ACC_TYPES = ['빈도순', '미끄러짐·넘어짐', '화상', '끼임', '부딪힘', '감전']
const emptySlot = (): Slot => ({ name: '', dataUrl: '', caption: '' })

/* ===================== 화면 ===================== */
export function InspectionForm() {
  const [params, setParams] = useSearchParams()
  const sid = params.get('school') || ''
  const partParam = params.get('part') || '' // 점검 현황 [이어서 작성] — 해당 공정만 선택
  const resumeId = params.get('resume') || '' // 이어서 작성할 작성중 점검 ID (있으면 새로 만들지 않고 이어감)
  const today = new Date().toISOString().slice(0, 10)

  const [schools, setSchools] = useState<School[]>([])
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [approval, setApproval] = useState<ApprovalStep[]>([])
  const [prevVals, setPrevVals] = useState<Record<string, string>>({})
  const [feat, setFeat] = useState<FeatMap>(null)

  // 작성 상태
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [answers, setAnswers] = useState<Record<string, Ans | undefined>>({})
  const [remarks, setRemarks] = useState<Record<string, string | undefined>>({})
  const [photos, setPhotos] = useState<Record<string, Slot[]>>({})
  const [etc, setEtc] = useState('')
  const [place, setPlace] = useState('')
  const [accType, setAccType] = useState(ACC_TYPES[0])
  const [inspectDate, setInspectDate] = useState(today)
  const [signerName, setSignerName] = useState('')
  const [signed, setSigned] = useState(false)
  const [followupOn, setFollowupOn] = useState(false)

  // 제출 상태
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [statuses, setStatuses] = useState<Record<string, PartStatus>>({})
  const [doneAll, setDoneAll] = useState(false)
  const [showMail, setShowMail] = useState(false)
  const [copied, setCopied] = useState(false)

  /* 학교 목록 + 기본 선택 */
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((d) => {
        if (!alive) return
        setSchools(d)
        if (!sid && d.length) setParams({ school: d[0].id }, { replace: true })
      })
      .catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : '오류') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 학교 변경 → 대장·결재선·지난 점검값·학교 특징 로드 + 작성 상태 초기화 */
  useEffect(() => {
    setLedger(null); setAnswers({}); setRemarks({}); setPhotos({}); setStatuses({})
    setSigned(false); setDoneAll(false); setShowMail(false); setSubmitErr(''); setPrevVals({}); setLoadErr('')
    if (!sid) return
    let alive = true
    api<Ledger>(`/schools/${sid}/ledger`)
      .then((d) => { if (alive) setLedger(d) })
      .catch((e) => { if (alive) setLoadErr(e instanceof Error ? e.message : '오류') })
    api<{ steps: ApprovalStep[] }>(`/schools/${sid}/approval-line`)
      .then((d) => { if (alive) setApproval(d.steps || []) })
      .catch(() => { if (alive) setApproval([]) })
    // 지난 점검값 추천(CARRY_VALUE): 이전 점검 기록의 비고값이 있으면 그것으로 시작
    api<PrevInsp[]>(`/inspections?school_id=${sid}`)
      .then((list) => {
        if (!alive) return
        const pv: Record<string, string> = {}
        for (const insp of list) for (const it of insp.items || []) if (CARRY_VALUE[it.code] && it.remark) pv[it.code] = it.remark
        setPrevVals(pv)
        // 이어서 작성: 대상 점검의 기존 결과·비고를 폼에 프리필 (코드가 폼 규격과 일치하는 항목만)
        if (resumeId) {
          const target = list.find((x) => x.id === resumeId)
          if (target) {
            const pa: Record<string, Ans | undefined> = {}
            const pr: Record<string, string | undefined> = {}
            for (const it of target.items || []) {
              const inv = it.result ? RES_INV[it.result] : undefined
              if (inv) pa[it.code] = inv
              if (it.remark) pr[it.code] = it.remark
            }
            if (Object.keys(pa).length) setAnswers((p) => ({ ...pa, ...p }))
            if (Object.keys(pr).length) setRemarks((p) => ({ ...pr, ...p }))
          }
        }
      })
      .catch(() => {})
    // 학교 특징 — 학교 카드에서 저장(GET /schools/{sid}/features), 미설정(빈 맵)이면 자동 해당없음 규칙 미적용
    api<{ features: Record<string, unknown> }>(`/schools/${sid}/features`)
      .then((d) => {
        if (!alive) return
        const f = d.features
        setFeat(f && typeof f === 'object' && Object.keys(f).length ? f : null)
      })
      .catch(() => { if (alive) setFeat(null) })
    return () => { alive = false }
  }, [sid])

  /* 파트별 종사자 인원 */
  const counts = useMemo(() => {
    const c: Record<string, number> = { catering: 0, facility: 0, cleaning: 0, commute: 0, night_duty: 0 }
    for (const w of ledger?.workers ?? []) c[w.part] = (c[w.part] ?? 0) + w.count
    return c
  }, [ledger])

  /* 점검대상 자동 선택: 인원이 있는 파트만 (수동 추가 가능 — 0709 회의) */
  useEffect(() => {
    if (!ledger) return
    const e: Record<string, boolean> = {}
    for (const d of PARTDEF) e[d.label] = partParam ? d.key === partParam : (counts[d.key] ?? 0) > 0
    setEnabled(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, ledger])

  /* 자동 해당없음 */
  const { ex, reasons } = useMemo(() => autoExcl(feat, counts), [feat, counts])
  const totalExcl = useMemo(() => Object.values(ex).reduce((a, o) => a + Object.keys(o).length, 0), [ex])

  const activeDefs = PARTDEF.filter((d) => d.q && enabled[d.label])

  function effAnswer(label: string, no: number): Ans | undefined {
    return answers[`${label}-${no}`] ?? (ex[label]?.[no] ? '해당없음' : undefined)
  }
  function carriedFor(code: string): string {
    const cv = CARRY_VALUE[code]
    return cv ? prevVals[code] || cv.v : ''
  }
  function effRemark(code: string): string {
    const r = remarks[code]
    return r !== undefined ? r : carriedFor(code)
  }

  /* 집계(tally) */
  const tally = useMemo(() => {
    let g = 0, b = 0, n = 0, e = 0, total = 0
    for (const d of activeDefs) {
      d.q!.forEach((_, i) => {
        total++
        const a = effAnswer(d.label, i + 1)
        if (!a) e++
        else if (a === '양호') g++
        else if (a === '미흡') b++
        else n++
      })
    }
    return { g, b, n, e, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, enabled, ex])

  /* 사진 슬롯 */
  function slotsFor(label: string): Slot[] {
    const def = PARTDEF.find((d) => d.label === label)
    const base = baseSlots(counts[def?.key ?? ''] ?? 0)
    const arr = (photos[label] ?? []).slice()
    while (arr.length < base) arr.push(emptySlot())
    return arr
  }
  function patchSlot(label: string, idx: number, patch: Partial<Slot>) {
    setPhotos((p) => {
      const def = PARTDEF.find((d) => d.label === label)
      const base = baseSlots(counts[def?.key ?? ''] ?? 0)
      const arr = (p[label] ?? []).slice()
      while (arr.length < Math.max(base, idx + 1)) arr.push(emptySlot())
      arr[idx] = { ...arr[idx], ...patch }
      return { ...p, [label]: arr }
    })
  }
  function addSlot(label: string) {
    setPhotos((p) => {
      const def = PARTDEF.find((d) => d.label === label)
      const base = baseSlots(counts[def?.key ?? ''] ?? 0)
      const arr = (p[label] ?? []).slice()
      while (arr.length < base) arr.push(emptySlot())
      if (arr.length >= MAX_SLOTS) return p
      arr.push(emptySlot())
      return { ...p, [label]: arr }
    })
  }
  function onPickPhoto(label: string, idx: number, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => patchSlot(label, idx, { name: f.name, dataUrl: String(reader.result || '') })
    reader.readAsDataURL(f)
  }

  /* 메일 문구 (ins-mailto) */
  const schoolName = ledger?.school.name || schools.find((s) => s.id === sid)?.name || ''
  const schoolMail = ledger?.school.email || ''
  const mailSteps = approval.length
    ? approval.map((s) => (s.name ? `${s.title} ${s.name}` : s.title))
    : ['업무담당', '행정실장', '교장']
  const photoNames = PARTDEF.filter((d) => enabled[d.label]).flatMap((d) =>
    (photos[d.label] ?? []).filter((s) => s.name).map((s) => s.name),
  )
  const mailText = useMemo(() => {
    const lines = [
      `수신: ${schoolMail || '(학교 이메일 미등록)'}`,
      `제목: [한국산업안전협회] ${schoolName} 종사자 안전·보건 점검표 송부 (${inspectDate})`,
      '',
      `${schoolName} 업무담당자님께`,
      '',
      `${inspectDate} 실시한 종사자 안전·보건 점검 결과를 송부드립니다.`,
      `· 점검 파트: ${activeDefs.map((d) => d.name).join(', ') || '—'}`,
      `· 점검 결과: 양호 ${tally.g} · 미흡 ${tally.b} · 해당없음 ${tally.n}`,
      `· 미흡 ${tally.b}건은 다음 달 점검 확인 대상으로 이월됩니다.`,
    ]
    if (photoNames.length) lines.push(`· 사진대지 ${photoNames.length}매: ${photoNames.join(', ')}`)
    if (etc.trim()) lines.push('', '[기타 의견]', etc.trim())
    lines.push('', `결재선(${mailSteps.join(' → ')})에 따라 결재 후 회신 부탁드립니다.`, '첨부: 종사자 안전·보건 점검표 PDF 1부', '', '(주)한국산업안전협회')
    return lines.join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolMail, schoolName, inspectDate, enabled, tally, etc, approval, photos])

  async function copyMail() {
    try {
      await navigator.clipboard.writeText(mailText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard 미지원 환경 */
    }
  }

  /* ===================== 제출: POST /inspections → 항목 결과 → sign → submit (파트당 1건) ===================== */
  function setStatus(label: string, st: PartStatus['st'], note: string) {
    setStatuses((p) => ({ ...p, [label]: { st, note } }))
  }

  async function submitAll() {
    if (!ledger || busy) return
    if (!activeDefs.length) { setSubmitErr('점검대상 파트가 없습니다. 점검대상을 선택하세요.'); return }
    if (!signerName.trim() || !signed) { setSubmitErr('확인자(담당자) 성명을 입력하고 서명해 주세요.'); return }
    setBusy(true)
    setSubmitErr('')
    let okAll = true
    for (const d of activeDefs) {
      const q = d.q!
      const exl = ex[d.label] || {}
      try {
        setStatus(d.label, 'run', '점검 생성')
        const items = q.map((question, i) => ({ code: `${d.label}-${i + 1}`, label: question.split('||')[0] }))
        // 이어서 작성이면 기존 점검(작성중)에 이어서 기록, 아니면 새로 생성
        const created = resumeId && d.key === partParam
          ? { id: resumeId }
          : await api<{ id: string }>('/inspections', {
            method: 'POST',
            body: JSON.stringify({
              school_id: sid,
              part: d.key,
              is_private_school: ledger.school.is_private,
              items,
            }),
          })
        let done = 0
        for (let i = 0; i < items.length; i++) {
          const code = items[i].code
          const a = effAnswer(d.label, i + 1)
          if (!a) continue
          const remark = exl[i + 1] && answers[code] === undefined ? `자동 해당없음 — ${exl[i + 1]}` : effRemark(code)
          await api(`/inspections/${created.id}/items/${encodeURIComponent(code)}`, {
            method: 'PUT',
            body: JSON.stringify({ result: RES_API[a], remark }),
          })
          done++
          setStatus(d.label, 'run', `결과 기록 ${done}건`)
        }
        // 추후보완: 미흡 항목을 추후보완 목록으로 등록
        if (followupOn) {
          for (let i = 0; i < items.length; i++) {
            if (effAnswer(d.label, i + 1) !== '미흡') continue
            await api(`/inspections/${created.id}/followups`, {
              method: 'POST',
              body: JSON.stringify({ item_code: items[i].code, description: effRemark(items[i].code) || items[i].label }),
            })
          }
        }
        setStatus(d.label, 'run', '서명')
        await api(`/inspections/${created.id}/sign`, {
          method: 'POST',
          body: JSON.stringify({ signer: signerName.trim(), image_ref: '' }),
        })
        const sub = await api<{ status: string; eduoffice: string | null }>(`/inspections/${created.id}/submit`, { method: 'POST' })
        setStatus(d.label, 'done', sub.eduoffice === 'pending' ? '제출 완료 · 교육청 전송 대기' : '제출 완료')
      } catch (e) {
        okAll = false
        setStatus(d.label, 'err', e instanceof Error ? e.message : '제출 실패')
      }
    }
    setBusy(false)
    if (okAll) {
      setDoneAll(true)
      setShowMail(true)
    } else {
      setSubmitErr('일부 파트 제출에 실패했습니다. 상태를 확인하세요.')
    }
  }

  /* ===================== 렌더 ===================== */
  const featMissing = feat === null

  return (
    <div className="page rv">
      <div className="breadcrumb">홈 / <Link to="/inspection">안전점검</Link> / <b>종사자 안전·보건 점검표</b></div>

      <div className="bar">
        <div>
          <h2>종사자 안전·보건 점검표</h2>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
            전남교육청 Digital SHM System 저장 시 자동 전송 · 서식 그대로 PDF 출력
          </div>
        </div>
        <div className="sp" />
        <Link className="btn btn-ghost" to="/inspection">목록</Link>
        <button className="btn btn-primary" disabled={busy || !ledger} onClick={submitAll}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      {loadErr && <div className="insf-err" style={{ marginBottom: 12 }}>오류: {loadErr}</div>}

      {/* 자동 처리 배너 (ins-autobar) */}
      <div className={'insf-autobar' + (totalExcl ? '' : ' none')}>
        <div className="insf-bang">{totalExcl ? '!' : '·'}</div>
        <div>
          <div className="insf-auto-t">
            {totalExcl
              ? `학교 특징에 따라 ${totalExcl}개 항목이 자동으로 '해당없음' 처리되었습니다`
              : "자동 '해당없음' 처리된 항목이 없습니다"}
          </div>
          <div className="insf-auto-d">
            {totalExcl
              ? reasons.map(([why, tags]) => (
                  <span key={why} style={{ display: 'block' }}>
                    {tags.map((t) => <code key={t}>{t}</code>)} {why}
                  </span>
                ))
              : featMissing
                ? '학교 특징 정보가 아직 저장되지 않아 자동 해당없음 규칙이 적용되지 않습니다. 학교 카드에서 특징을 저장하면 반영됩니다.'
                : `${schoolName || '이 학교'}은 점검표의 모든 설비·시설을 보유하고 있어 전 항목이 점검 대상입니다.`}
          </div>
        </div>
        {sid && <Link className="insf-auto-go" to={`/schools/${sid}`}>학교 특징 확인 →</Link>}
      </div>

      {/* 집계 바 (tally) */}
      <div className="insf-tally">
        <div className="insf-ty g"><div className="l">양호</div><div className="n">{tally.g}</div></div>
        <div className="insf-ty b"><div className="l">미흡</div><div className="n">{tally.b}</div></div>
        <div className="insf-ty n2"><div className="l">해당없음</div><div className="n">{tally.n}</div></div>
        <div className="insf-ty w"><div className="l">미입력</div><div className="n">{tally.e}</div></div>
        <div className="insf-ty"><div className="l">전체 항목</div><div className="n">{tally.total}</div></div>
      </div>

      {/* 기본정보 + 점검대상 */}
      <div className="insf-fset">
        <div className="insf-ch"><i className="insf-sq" /><h3>기본정보</h3><div className="r">회색 항목은 대장에서 자동 입력</div></div>
        <div className="insf-fgrid">
          <label className="field">
            <span>학교(기관)명</span>
            <select className="select" value={sid} onChange={(e) => setParams({ school: e.target.value })}>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className={'insf-hint' + (totalExcl ? ' hit' : '')}>
              {totalExcl
                ? <>학교 특징 반영 · {totalExcl}개 항목 자동 해당없음</>
                : featMissing
                  ? '학교 특징이 저장되면 자동 해당없음이 적용됩니다.'
                  : '학교를 선택하면 학교 특징에 따라 해당없음이 자동 적용됩니다.'}
            </span>
          </label>
          <label className="field"><span>소속명</span><input className="input" value="(주)한국산업안전협회" disabled /></label>
          <label className="field"><span>부서명</span><input className="input" value="(주)한국산업안전협회" disabled /></label>
          <label className="field"><span>직책</span><input className="input" value="대표" disabled /></label>
          <label className="field"><span>작성자</span><input className="input" value="(주)한국산업안전협회" disabled /></label>
          <label className="field"><span>작성일</span><input className="input" value={today} disabled /></label>
          <label className="field"><span>점검일</span><input className="input" type="date" value={inspectDate} onChange={(e) => setInspectDate(e.target.value)} /></label>
          <label className="field"><span>점검장소</span><input className="input" placeholder="예: 급식실, 시설창고" value={place} onChange={(e) => setPlace(e.target.value)} /></label>
          <label className="field">
            <span>재해형태</span>
            <select className="select" value={accType} onChange={(e) => setAccType(e.target.value)}>
              {ACC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <div className="insf-ch" style={{ borderTop: '1px solid var(--line-2)', marginTop: 14 }}>
          <i className="insf-sq" /><h3>점검대상</h3>
          <div className="r">종사자 현황에 따라 자동 선택 · 없는 파트도 추가할 수 있습니다</div>
        </div>
        <div className="insf-targets">
          {PARTDEF.map((d) => {
            const n = counts[d.key] ?? 0
            const on = !!enabled[d.label]
            if (n > 0) {
              return (
                <button key={d.key} type="button" className={'insf-tg' + (on ? ' on' : '')}
                  onClick={() => setEnabled((p) => ({ ...p, [d.label]: !p[d.label] }))}>
                  <input type="checkbox" readOnly checked={on} style={{ accentColor: 'var(--violet)', pointerEvents: 'none' }} />
                  {d.name} <span className="cnt2">{n}명</span>
                </button>
              )
            }
            return on ? (
              <button key={d.key} type="button" className="insf-tg on"
                onClick={() => setEnabled((p) => ({ ...p, [d.label]: false }))}>
                <input type="checkbox" readOnly checked style={{ accentColor: 'var(--violet)', pointerEvents: 'none' }} />
                {d.name} <span className="man">수동 추가</span>
              </button>
            ) : (
              <button key={d.key} type="button" className="insf-tg na"
                onClick={() => setEnabled((p) => ({ ...p, [d.label]: true }))}
                title="종사자 미배치 파트입니다. 필요 시 점검표를 수동으로 추가할 수 있습니다 (0709 회의).">
                {d.name} <span className="cnt2">미배치</span> <span className="add">＋ 추가</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 파트별 점검표 */}
      {PARTDEF.filter((d) => d.q).map((d) => {
        const n = counts[d.key] ?? 0
        const on = !!enabled[d.label]
        if (!on) {
          if (n > 0) return null
          return (
            <div className="insf-fset" key={d.key}>
              <div className="insf-ch"><i className="insf-sq" style={{ background: 'var(--muted)' }} /><h3>{d.name}</h3><div className="r">점검 대상 아님</div></div>
              <div className="insf-noitem">종사원이 배치되지 않아 점검표가 생성되지 않았습니다. 필요 시 점검대상에서 추가하세요.</div>
            </div>
          )
        }
        const exl = ex[d.label] || {}
        const exn = Object.keys(exl).length
        return (
          <div className="insf-fset" key={d.key}>
            <div className="insf-ch">
              <i className="insf-sq" />
              <h3>{d.name}<span className="cnt">{d.q!.length}개 항목 · {n > 0 ? `${n}명` : '수동 추가'}</span></h3>
              <div className="r">{exn ? <b>자동 해당없음 {exn}개</b> : null}</div>
            </div>
            <table className="insf-chk">
              <colgroup><col /><col width="72" /><col width="72" /><col width="86" /><col width="34%" /></colgroup>
              <thead>
                <tr><th>점검항목</th><th className="c">양호</th><th className="c">미흡</th><th className="c">해당없음</th><th>비고(보완계획)</th></tr>
              </thead>
              <tbody>
                {d.q!.map((q, i) => {
                  const no = i + 1
                  const [main, sub] = q.split('||')
                  const code = `${d.label}-${no}`
                  const why = exl[no]
                  const a = effAnswer(d.label, no)
                  const isAuto = !!why && answers[code] === undefined
                  const cv = why ? undefined : CARRY_VALUE[code]
                  const carried = cv ? prevVals[code] || cv.v : ''
                  const remark = effRemark(code)
                  const set = (v: Ans) => setAnswers((p) => ({ ...p, [code]: v }))
                  return (
                    <tr key={code} className={(isAuto ? 'insf-auto' : '') + (a === '미흡' ? ' insf-bad' : '')} >
                      <td className="q">
                        <span className="insf-no">{String(no).padStart(2, '0')}</span>{main}
                        {sub && <span className="insf-subq">{sub}</span>}
                        {isAuto && <span className="insf-autotag">자동 해당없음 · {why}</span>}
                      </td>
                      <td className="c"><input type="radio" name={code} checked={a === '양호'} onChange={() => set('양호')} /></td>
                      <td className="c"><input type="radio" name={code} checked={a === '미흡'} onChange={() => set('미흡')} /></td>
                      <td className="c"><input type="radio" name={code} checked={a === '해당없음'} onChange={() => set('해당없음')} /></td>
                      <td className="insf-memo">
                        {cv ? (
                          <>
                            <input className="carried" value={remark} onChange={(e) => setRemarks((p) => ({ ...p, [code]: e.target.value }))} />
                            <span className="insf-carrytag">지난 점검값 {carried}{prevVals[code] ? ' (기록)' : ' (기본)'}</span>
                            <div className="insf-sugg">
                              {cv.opts.map((o) => (
                                <button key={o} type="button" className={'insf-sg' + (o === remark ? ' on' : '')}
                                  onClick={() => setRemarks((p) => ({ ...p, [code]: o }))}>{o}</button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <input placeholder="보완계획" value={remarks[code] ?? ''} onChange={(e) => setRemarks((p) => ({ ...p, [code]: e.target.value }))} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* 기타 의견 */}
      <div className="insf-fset">
        <div className="insf-ch"><i className="insf-sq" /><h3>기타 의견</h3><div className="r">점검자 의견 — 메일 문구에 함께 들어갑니다</div></div>
        <textarea
          className="insf-etc"
          placeholder={'점검자 :\n* 2026 정기 위험성평가 진행중\n- 미화담당 위험성평가 결과 공유 및 위험성감소대책 교육 실시'}
          value={etc}
          onChange={(e) => setEtc(e.target.value)}
        />
      </div>

      {/* 사진대지 — 파트별 · 인원수 기준 모델수(0709) */}
      <div className="insf-fset">
        <div className="insf-ch">
          <i className="insf-sq" /><h3>사진대지</h3>
          <div className="r">사진마다 설명을 적어야 PDF에 함께 출력됩니다 · 인원 ~5명 1컷 · 6~10명 2컷 · 11~15명 3컷 · 공정 관련 추가 가능</div>
        </div>
        {PARTDEF.filter((d) => enabled[d.label]).map((d) => {
          const n = counts[d.key] ?? 0
          const slots = slotsFor(d.label)
          return (
            <div key={d.key}>
              <div className="insf-pgroup">
                {d.name}
                <span className="rule">{n}명 → 기본 {baseSlots(n)}컷</span>
              </div>
              <div className="insf-photos">
                {slots.map((s, i) => (
                  <div className="insf-phitem" key={i}>
                    <div className="insf-phnum">사진 {String(i + 1).padStart(2, '0')}</div>
                    <label className="insf-ph">
                      {s.dataUrl ? <img src={s.dataUrl} alt={s.name} /> : '+ 사진 추가'}
                      <input type="file" accept="image/*" hidden onChange={(e) => onPickPhoto(d.label, i, e)} />
                    </label>
                    {s.name && <div className="insf-phname">{s.name}</div>}
                    <textarea
                      className="insf-phcap"
                      placeholder={'사진 설명을 입력하세요\n예: 급식실 릴호스 볼트 고정 상태 양호'}
                      value={s.caption}
                      onChange={(e) => patchSlot(d.label, i, { caption: e.target.value })}
                    />
                  </div>
                ))}
                <button type="button" className="insf-addshot" disabled={slots.length >= MAX_SLOTS} onClick={() => addSlot(d.label)}>
                  {slots.length >= MAX_SLOTS ? `최대 ${MAX_SLOTS}매` : '+ 컷 추가 (공정 관련)'}
                </button>
              </div>
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          사진 원본은 기기에서 미리보기로만 사용되며, 제출 시에는 파일명 메타만 메일 문구에 포함됩니다.
        </div>
      </div>

      {/* 확인자 */}
      <div className="insf-fset">
        <div className="insf-ch"><i className="insf-sq" /><h3>확인자</h3><div className="r">서명 후 제출할 수 있습니다</div></div>
        <div className="insf-sign">
          <label className="field">
            <span>담당자</span>
            <input className="input" placeholder="학교 업무담당자 성명" value={signerName}
              onChange={(e) => { setSignerName(e.target.value); setSigned(false) }} />
          </label>
          <label className="field">
            <span>서명</span>
            <div
              className={'insf-signbox' + (signed ? ' signed' : '')}
              onClick={() => {
                if (!signerName.trim()) { setSubmitErr('담당자 성명을 먼저 입력하세요.'); return }
                setSubmitErr('')
                setSigned((v) => !v)
              }}
            >
              {signed ? `${signerName.trim()} ✓` : '클릭하여 서명하기'}
            </div>
          </label>
        </div>
      </div>

      {/* 메일 문구 미리보기 (ins-mailto) */}
      {showMail && (
        <div className="insf-mailbox">
          <div className="insf-ch" style={{ padding: '0 0 2px' }}>
            <i className="insf-sq" /><h3>학교 메일 제출 문구</h3>
            <div className="r">
              <button className="btn" onClick={copyMail}>{copied ? '복사됨 ✓' : '문구 복사'}</button>
            </div>
          </div>
          <div className="insf-mailtext">{mailText}</div>
        </div>
      )}

      {/* 제출 바 */}
      <div className="insf-submitbar">
        <div>
          <div className="insf-msg">
            {tally.e
              ? <>미입력 <b>{tally.e}개</b> 항목이 남아 있습니다. 저장하면 <b>미흡 {tally.b}건</b>이 다음 달 점검 확인 대상으로 이월됩니다.</>
              : <>모든 항목 입력 완료. 저장하면 <b>미흡 {tally.b}건</b>이 다음 달 점검 확인 대상으로 이월되고, 전남교육청 SHM System에 자동 전송됩니다.</>}
          </div>
          <div className="insf-mailline">
            PDF 수신 <span className="to">{schoolMail || '학교 이메일 미등록'}</span> · 결재선 {mailSteps.join(' → ')}
          </div>
          {(submitErr || doneAll) && (
            <div className={doneAll && !submitErr ? 'insf-msg' : 'insf-err'} style={doneAll && !submitErr ? { color: 'var(--ok-ink)', fontWeight: 700, marginTop: 4 } : undefined}>
              {submitErr || '전 파트 제출 완료 — 아래 메일 문구를 복사해 학교로 송부하세요.'}
            </div>
          )}
          {Object.keys(statuses).length > 0 && (
            <div className="insf-partstat">
              {activeDefs.map((d) => {
                const st = statuses[d.label] || { st: 'idle' as const, note: '대기' }
                return <span key={d.key} className={'insf-ps ' + st.st}>{d.name} · {st.note}</span>
              })}
            </div>
          )}
        </div>
        <div className="insf-sub-r">
          <label className="insf-fu">
            <input type="checkbox" checked={followupOn} onChange={(e) => setFollowupOn(e.target.checked)} /> 추후보완
          </label>
          <button className="btn" onClick={() => setShowMail((v) => !v)}>✉ 메일 문구</button>
          <button className="btn" disabled title="PDF 변환은 제출 후 백엔드에서 생성됩니다">▤ PDF 변환</button>
          <button className="btn btn-primary" disabled={busy || !ledger} onClick={submitAll}>
            {busy ? '전송 중…' : '저장 후 SHM 전송'}
          </button>
        </div>
      </div>
    </div>
  )
}
