// 근골격계 유해요인조사 보고서 작성 — 발주처 프로토타입(school-safety-ledger v-musculo) 포팅.
// HO(1~11호)·MU_PARTS/HAZ(작업조건)·사진(여러 장, 0709)·증상조사표(judge/overall/drawForm)·
// 공단 엑셀 열 매핑 + CSV·개선계획서·백엔드 제출(musculo API 재사용, 미지원분 localStorage 파사드).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, Camera, Download, Plus, Save, Send, Upload, X } from 'lucide-react'
import { api } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import '../styles/musculoreport.css'

/* ===================== 프로토타입 도메인 데이터 (문구 그대로) ===================== */

// 근골격계부담작업 1~11호 (프로토타입 HO — <b> 강조 포함 11개 문항)
const HO: [number, string][] = [
  [1, '하루 4시간 이상 집중 <b>VDT 작업</b>'],
  [2, '하루 총 2시간 이상 목·어깨·팔꿈치·손목의 <b>반복 작업</b>'],
  [3, '하루 총 2시간 이상 머리 위에 손, 팔꿈치가 <b>어깨 위</b>·몸통 뒤쪽'],
  [4, '하루 총 2시간 이상 목·허리를 <b>구부리거나 비트는</b> 자세'],
  [5, '하루 총 2시간 이상 <b>쪼그리거나</b> 무릎을 굽힌 자세'],
  [6, '하루 총 2시간 이상 <b>1kg 이상</b>을 손가락으로 집는 작업'],
  [7, '하루 총 2시간 이상 <b>4.5kg 이상</b>을 한 손으로 들거나 쥐는 작업'],
  [8, '하루 10회 이상 <b>25kg 이상</b> 물체를 드는 작업'],
  [9, '하루 25회 이상 <b>10kg 이상</b> 물체를 무릎 아래·어깨 위에서 드는 작업'],
  [10, '하루 총 2시간 이상 분당 2회 이상 <b>4.5kg 이상</b> 물체를 드는 작업'],
  [11, '하루 총 2시간 이상 시간당 10회 이상 <b>손·무릎으로 충격</b>을 가하는 작업'],
]

// 백엔드 Part enum 값 (app.domain.common.value_objects.Part)
type ApiPart = 'catering' | 'facility' | 'cleaning' | 'commute' | 'night_duty'
type PartDef = { key: string; name: string; api: ApiPart | null; jobs: string[]; custom?: boolean }

const MU_PARTS: PartDef[] = [
  { key: '급식', name: '급식(조리)', api: 'catering', jobs: ['검수', '전처리', '조리', '배식', '청소·세척'] },
  { key: '시설', name: '시설관리', api: 'facility', jobs: ['순회 점검', '전기·기계 보수', '사다리 고소작업', '자재 운반'] },
  { key: '미화', name: '미화', api: 'cleaning', jobs: ['바닥 청소', '화장실 청소', '쓰레기 수거·운반'] },
  { key: '통학', name: '통학', api: 'commute', jobs: ['승하차 보조', '차량 점검·정리'] },
  { key: '당직', name: '당직', api: 'night_duty', jobs: ['야간 순찰', '시건·개방'] },
]
const HAZ = ['허리굽힘', '중량물', '반복동작', '넘어짐', '충돌', '끼임', '절단', '베임', '찔림', '감전', '화상', '유해물질 접촉', '미끄러짐']

// 초기 체크 상태 (프로토타입 MU_INIT)
const MU_INIT: Record<string, number[]> = {
  급식: [0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0],
  시설: [0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0],
  미화: [0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0],
  통학: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  당직: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

// 작업 부하(A)·작업 빈도(B) 척도 (프로토타입 scale 표)
const SCALE_A = ['매우 쉬움', '쉬움', '약간 힘듦', '힘듦', '매우 힘듦']
const SCALE_A_FULL = ['매우 쉬움', '쉬움', '약간 힘듦', '힘듦', '매우 힘듦']
const SCALE_B = ['아주 가끔', '가끔', '자주', '계속', '초과근무']
const SCALE_B_FULL = ['아주 가끔 (하루 1~2회)', '가끔 (하루 또는 주 2~3회)', '자주 (1일 4시간)', '계속 (1일 4시간 이상)', '초과근무 시간 (1일 8시간 이상)']

/* ---- 증상조사표 (프로토타입 SURVEY/BODY/JD/judge/overall/drawForm) ---- */
const BODY = ['목', '어깨', '팔/팔꿈치', '손/손목/손가락', '허리', '다리/발']
const BODY_COL: Record<string, string> = {
  목: 'T~X', 어깨: 'Y~AD', '팔/팔꿈치': 'AE~AJ', '손/손목/손가락': 'AK~AP', 허리: 'AQ~AU', '다리/발': 'AV~BA',
}
const NO_SIDE = ['목', '허리'] // 1번(좌우) 문항이 없는 부위
const Q1_SIDE = ['오른쪽', '왼쪽', '양쪽 모두']
const Q2_DUR = ['1일 미만', '1일~1주일 미만', '1주일~1달 미만', '1달~6개월 미만', '6개월 이상']
const Q3_INT = ['약한 통증', '중간 통증', '심한 통증', '매우 심한 통증']
const Q4_FRQ = ['6개월에 1번', '2~3달에 1번', '1달에 1번', '1주일에 1번', '매일']
const Q5_WK = ['아니오', '예']
const Q6_ACT = ['병원·한의원 치료', '약국 치료', '병가·산재', '작업 전환', '해당사항 없음', '기타']

const I_Q1 = ['게임 등 컴퓨터 관련', '악기 연주', '뜨개질·붓글씨 등', '스포츠 활동', '해당사항 없음']
const I_Q2 = ['거의 하지 않는다', '1시간 미만', '1~2시간 미만', '2~3시간 미만', '3시간 이상']
const I_Q3 = ['아니오', '예']
const I_Q4 = ['아니오', '예']
const I_Q5 = ['전혀 힘들지 않음', '견딜만 함', '약간 힘듦', '힘듦', '매우 힘듦']

type Judgment = '정상' | '관리대상자' | '통증호소자'
const JD: Record<Judgment, string> = { 정상: 'ok', 관리대상자: 'mg', 통증호소자: 'pn' }

type Answers = { q1: number; q2: number; q3: number; q4: number; q5: number; q6: number }
type PersonForm = {
  pain: number // 0 미응답 · 1 아니오 · 2 예
  parts: Record<string, Answers>
  i1?: number; i2?: number; i3?: number; i4?: number; i5?: number
}
type Via = 'mob' | 'omr' | 'non'
type PStat = 'done' | 'review' | 'doing' | 'todo'
type Person = {
  n: string; a: number; g: string; d: string
  via: Via; st: PStat
  res: Judgment[] | null
  detail: string[] | null
  form?: PersonForm
  omrFile?: string
}

const ST: Record<PStat, [string, string]> = {
  done: ['ok', '작성 완료'], review: ['warn', '인식 검수 필요'], doing: ['doing', '작성중'], todo: ['todo', '미제출'],
}
const VIA: Record<Via, [string, string]> = { mob: ['mob', '직접 입력'], omr: ['omr', '종이 OMR'], non: ['non', '미배포'] }

// 명단 = 학교 대장의 파트별 종사자 집계(GET /schools/{id}/ledger workers)에서 생성.
// 백엔드는 개인 실명이 아닌 파트별 인원수만 보유 → 행은 직무 자리표시자로 전개하고,
// 성명·연령·성별은 조사표 작성 시 기입한다(초안 localStorage에 학교별 보존).
type Worker = { id: string; part: string; count: number; contact: string; is_nutrition_teacher: boolean }

const PART_INFO: Record<string, { dept: string; job: string }> = {
  catering: { dept: '급식실', job: '조리실무사' },
  facility: { dept: '시설관리', job: '시설관리원' },
  cleaning: { dept: '미화', job: '미화원' },
  commute: { dept: '통학', job: '동승보호자' },
  night_duty: { dept: '당직', job: '당직전담원' },
}

function rosterFromWorkers(workers: Worker[]): Person[] {
  const out: Person[] = []
  const seq: Record<string, number> = {}
  for (const w of workers) {
    const info = PART_INFO[w.part] || { dept: w.part, job: '종사자' }
    const job = w.is_nutrition_teacher ? '영양(교)사' : info.job
    for (let i = 0; i < (w.count || 0); i++) {
      const k = `${info.dept}|${job}`
      seq[k] = (seq[k] || 0) + 1
      out.push({ n: `${job} ${seq[k]}`, a: 0, g: '—', d: `${info.dept} · ${job}`, via: 'non', st: 'todo', res: null, detail: null })
    }
  }
  return out
}

// 대장 기반 행 + 초안 진행분 병합: 같은 성명|부서 행은 초안(작성 진행) 우선,
// 초안 전용 행(수동 추가·OMR·실명 기입분)은 뒤에 유지.
function personKey(p: Person): string {
  return `${p.n}|${p.d}`
}
function mergeRoster(base: Person[], draft: Person[]): Person[] {
  const dm = new Map(draft.map((p) => [personKey(p), p]))
  const merged = base.map((p) => dm.get(personKey(p)) || p)
  const bk = new Set(base.map(personKey))
  for (const p of draft) if (!bk.has(personKey(p))) merged.push(p)
  return merged
}

/* ===================== 판정 로직 (프로토타입 judge/overall 그대로) ===================== */

// 판정: 공단 엑셀 메모 기준.
//  통증호소자 = 기간(2번)≥3 그리고 빈도(4번)≥3 그리고 강도(3번)≥3
//  관리대상자 = (기간≥3 또는 빈도≥3) 이면서 강도≥2
function judge(a?: Answers | null): Judgment {
  if (!a || !a.q2 || !a.q3 || !a.q4) return '정상'
  const pain = a.q2 >= 3 && a.q4 >= 3 && a.q3 >= 3
  const mgmt = (a.q2 >= 3 || a.q4 >= 3) && a.q3 >= 2
  return pain ? '통증호소자' : mgmt ? '관리대상자' : '정상'
}

function overall(res: Judgment[] | null): Judgment | null {
  if (!res) return null
  if (res.includes('통증호소자')) return '통증호소자'
  if (res.includes('관리대상자')) return '관리대상자'
  return '정상'
}

/* ===================== 헬퍼 ===================== */

// 프로토타입 문구의 <b>…</b> 강조 렌더
function B({ s }: { s: string }) {
  const seg = s.split(/<\/?b>/)
  return <>{seg.map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <span key={i}>{t}</span>))}</>
}

// 0-based 인덱스 → 엑셀 열 이름 (0=A … 19=T)
function colName(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// T~BA 마킹 배열(34칸): 목5 + 어깨6 + 팔6 + 손6 + 허리5 + 다리6. 무통증/미응답 = 0.
const MARKS_LEN = 34
function buildMarks(form: PersonForm): number[] {
  const out: number[] = []
  for (const b of BODY) {
    const a = form.pain === 2 ? form.parts[b] : undefined
    const qs: (keyof Answers)[] = NO_SIDE.includes(b)
      ? ['q2', 'q3', 'q4', 'q5', 'q6']
      : ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']
    for (const q of qs) out.push(a ? a[q] || 0 : 0)
  }
  return out
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

type Shot = { name: string; url?: string }
type PlanRow = { src: string; part: string; target: string; problem: string; measure: string; due: string; owner: string }
type School = { id: string; name: string }

type Draft = {
  parts: PartDef[]
  chk: Record<string, number[]>
  ab: Record<string, [number, number]>
  hz: Record<string, string[]>
  caps: Record<string, string>
  shots: Record<string, Shot[]> // 파일명 메타만 저장
  roster: Person[]
  plan: PlanRow[]
  surveyId: string
  date: string
}

function defaultDraft(): Draft {
  return {
    parts: clone(MU_PARTS), chk: clone(MU_INIT), ab: {}, hz: {}, caps: {}, shots: {},
    roster: [], plan: [], surveyId: '', date: new Date().toISOString().slice(0, 10),
  }
}

// v2: 명단이 데모 하드코딩 → 대장 종사자 실연동으로 바뀌며 키 버전 업(구 초안의 데모 명단 잔존 방지)
const DRAFT_KEY = 'mur:draft:v2:'

const OPT_A = SCALE_A
const OPT_B = SCALE_B

function Opts({ list, cur, low, onPick }: { list: string[]; cur?: number; low?: number[]; onPick: (v: number) => void }) {
  return (
    <div className="mur-opts">
      {list.map((l, i) => {
        const v = i + 1
        return (
          <button
            key={v}
            type="button"
            className={'mur-op' + (cur === v ? ' on' : '') + (low && low.includes(v) ? ' low' : '')}
            onClick={() => onPick(v)}
          >
            <span className="k">{v}</span>{l}
          </button>
        )
      })}
    </div>
  )
}

/* ===================== 화면 ===================== */

export function MusculoReport() {
  const [sp, setSp] = useSearchParams()
  const sid = sp.get('school') || ''
  const [schools, setSchools] = useState<School[]>([])

  // 보고서 상태 (학교별 localStorage 초안)
  const [parts, setParts] = useState<PartDef[]>(() => clone(MU_PARTS))
  const [chk, setChk] = useState<Record<string, number[]>>(() => clone(MU_INIT))
  const [ab, setAb] = useState<Record<string, [number, number]>>({})
  const [hz, setHz] = useState<Record<string, string[]>>({})
  const [caps, setCaps] = useState<Record<string, string>>({})
  const [shots, setShots] = useState<Record<string, Shot[]>>({})
  const [roster, setRoster] = useState<Person[]>([])
  const [plan, setPlan] = useState<PlanRow[]>([])
  const [surveyId, setSurveyId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hydrated, setHydrated] = useState(false)
  const [savedAt, setSavedAt] = useState('')

  // 파트 추가 입력
  const [npName, setNpName] = useState('')
  const [npJobs, setNpJobs] = useState('')

  // 증상조사표 UI
  const [syOpen, setSyOpen] = useState(-1)
  const [formIdx, setFormIdx] = useState(-1)
  const [form, setForm] = useState<PersonForm | null>(null)
  const [toolMsg, setToolMsg] = useState('')
  const [apName, setApName] = useState('')
  const [apAge, setApAge] = useState('')
  const [apG, setApG] = useState('여')
  const [apDept, setApDept] = useState('')
  const omrAllRef = useRef<HTMLInputElement>(null)

  // 제출
  const [submitting, setSubmitting] = useState(false)
  const [subLog, setSubLog] = useState<string[]>([])

  /* ---- 학교 목록 ---- */
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((s) => {
        if (!alive) return
        const list = Array.isArray(s) ? s : []
        setSchools(list)
        if (!sp.get('school') && list.length) setSp({ school: list[0].id }, { replace: true })
      })
      .catch(() => { /* 학교 목록 실패 시 셀렉트만 비어 있음 */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const schoolName = schools.find((s) => s.id === sid)?.name || (sid ? sid.slice(0, 8) : '—')

  /* ---- 초안 로드/저장 — 명단은 대장 종사자(API)에서 생성, 작성 진행분은 localStorage 초안 병합 ---- */
  useEffect(() => {
    if (!sid) return
    setHydrated(false)
    let alive = true
    api<{ workers: Worker[] }>(`/schools/${sid}/ledger`)
      .then((led) => rosterFromWorkers(Array.isArray(led.workers) ? led.workers : []))
      .catch(() => [] as Person[])   // 대장 조회 실패 시 빈 명단(초안 행은 병합으로 유지)
      .then((base) => {
        if (!alive) return
        let d = defaultDraft()
        const raw = localStorage.getItem(DRAFT_KEY + sid)
        if (raw) {
          try { d = { ...d, ...(JSON.parse(raw) as Partial<Draft>) } } catch { /* 손상된 초안은 무시 */ }
        }
        setParts(d.parts); setChk(d.chk); setAb(d.ab); setHz(d.hz); setCaps(d.caps)
        setShots(d.shots); setRoster(mergeRoster(base, d.roster)); setPlan(d.plan); setSurveyId(d.surveyId); setDate(d.date)
        setSyOpen(-1); setFormIdx(-1); setForm(null); setSubLog([])
        setHydrated(true)
      })
    return () => { alive = false }
  }, [sid])

  function buildDraft(): Draft {
    const meta: Record<string, Shot[]> = {}
    for (const [k, list] of Object.entries(shots)) meta[k] = list.map((s) => ({ name: s.name })) // dataURL 미보존 — 파일명 메타만
    return { parts, chk, ab, hz, caps, shots: meta, roster, plan, surveyId, date }
  }

  useEffect(() => {
    if (!sid || !hydrated) return
    localStorage.setItem(DRAFT_KEY + sid, JSON.stringify(buildDraft()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, chk, ab, hz, caps, shots, roster, plan, surveyId, date, sid, hydrated])

  function saveDraft() {
    if (!sid) return
    localStorage.setItem(DRAFT_KEY + sid, JSON.stringify(buildDraft()))
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
  }

  /* ---- 1. 체크리스트 ---- */
  function toggleHo(pkey: string, i: number) {
    setChk((c) => {
      const next = { ...c, [pkey]: [...(c[pkey] || Array(HO.length).fill(0))] }
      next[pkey][i] = next[pkey][i] ? 0 : 1
      return next
    })
  }

  function addPart() {
    const name = npName.trim()
    if (!name) return
    if (parts.some((p) => p.key === name)) { setToolMsg('이미 있는 파트명입니다.'); return }
    const jobs = npJobs.split(',').map((j) => j.trim()).filter(Boolean)
    setParts((ps) => [...ps, { key: name, name, api: null, jobs: jobs.length ? jobs : ['기본 작업'], custom: true }])
    setChk((c) => ({ ...c, [name]: Array(HO.length).fill(0) }))
    setNpName(''); setNpJobs('')
  }

  function removePart(key: string) {
    setParts((ps) => ps.filter((p) => p.key !== key))
    setChk((c) => { const n = { ...c }; delete n[key]; return n })
  }

  const activeParts = useMemo(() => parts.filter((p) => (chk[p.key] || []).some(Boolean)), [parts, chk])

  /* ---- 2. 작업조건 ---- */
  function setAB(k: string, which: 0 | 1, v: number) {
    setAb((m) => {
      const cur: [number, number] = m[k] ? [...m[k]] as [number, number] : [3, 3]
      cur[which] = v
      return { ...m, [k]: cur }
    })
  }

  /* ---- 3. 사진 ---- */
  function addShots(k: string, files: FileList | null) {
    if (!files || !files.length) return
    for (const f of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = () => {
        setShots((m) => ({ ...m, [k]: [...(m[k] || []), { name: f.name, url: String(reader.result) }] }))
      }
      reader.readAsDataURL(f)
    }
  }
  function removeShot(k: string, i: number) {
    setShots((m) => ({ ...m, [k]: (m[k] || []).filter((_, j) => j !== i) }))
  }
  function toggleHz(k: string, h: string) {
    setHz((m) => {
      const set = new Set(m[k] || [])
      if (set.has(h)) set.delete(h); else set.add(h)
      return { ...m, [k]: [...set] }
    })
  }

  /* ---- 4. 증상조사표 ---- */
  function openForm(i: number) {
    const p = roster[i]
    if (!p) return
    let f = p.form
    if (!f) {
      f = { pain: p.res ? (p.res.some((r) => r !== '정상') ? 2 : 1) : 0, parts: {} }
      // OMR / 기존 응답 복원 (프로토타입 openSurveyForm)
      if (p.detail) {
        BODY.forEach((b, j) => {
          const d = p.detail![j]
          if (d && d !== '—') {
            const m = d.match(/기간(\d).*강도(\d).*빈도(\d)/)
            if (m) f!.parts[b] = { q1: 3, q2: +m[1], q3: +m[2], q4: +m[3], q5: 2, q6: 1 }
          }
        })
      }
    }
    setForm(clone(f))
    setFormIdx(i)
  }

  function closeForm(temp?: boolean) {
    if (form && formIdx >= 0) {
      setRoster((rs) => rs.map((p, i) =>
        i === formIdx ? { ...p, form: form, st: temp && p.st === 'todo' ? 'doing' : p.st } : p))
    }
    setFormIdx(-1); setForm(null)
  }

  function completeForm() {
    if (!form || formIdx < 0) return
    const res: Judgment[] = BODY.map((b) => (form.pain === 2 ? judge(form.parts[b]) : '정상'))
    const detail = BODY.map((b) => {
      const a = form.parts[b]
      return form.pain === 2 && a && a.q2 && a.q3 && a.q4 ? `기간${a.q2}·강도${a.q3}·빈도${a.q4}` : '—'
    })
    setRoster((rs) => rs.map((p, i) =>
      i === formIdx ? { ...p, form, res, detail, st: 'done', via: p.via === 'non' ? 'mob' : p.via } : p))
    setFormIdx(-1); setForm(null)
  }

  useEffect(() => {
    if (formIdx < 0) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeForm() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formIdx])

  function addPerson() {
    const n = apName.trim()
    if (!n) return
    setRoster((rs) => [...rs, { n, a: +apAge || 0, g: apG, d: apDept.trim() || '—', via: 'non', st: 'todo', res: null, detail: null }])
    setApName(''); setApAge(''); setApDept('')
  }

  function omrUploadAll(files: FileList | null) {
    if (!files || !files.length) return
    const add: Person[] = Array.from(files).map((f) => ({
      n: f.name.replace(/\.[^.]+$/, ''), a: 0, g: '—', d: '종이 제출', via: 'omr', st: 'review',
      res: null, detail: null, omrFile: f.name,
    }))
    setRoster((rs) => [...rs, ...add])
    setToolMsg(`종이 스캔 ${add.length}건 업로드 — OMR 인식 검수 대기로 등록되었습니다 (제출 시 검수 큐로 전송).`)
  }

  function omrUploadFor(i: number, files: FileList | null) {
    if (!files || !files.length) return
    const f = files[0]
    setRoster((rs) => rs.map((p, j) => (j === i ? { ...p, via: 'omr', st: 'review', omrFile: f.name } : p)))
    setToolMsg(`${roster[i]?.n} 종이 스캔 업로드 — OMR 인식 검수 대기 (파일명 메타만 전송됩니다).`)
  }

  const done = roster.filter((p) => p.st === 'done').length
  const review = roster.filter((p) => p.st === 'review').length
  const mob = roster.filter((p) => p.via === 'mob' && p.st !== 'todo').length
  const omrN = roster.filter((p) => p.via === 'omr').length
  const painN = roster.filter((p) => overall(p.res) === '통증호소자').length
  const mgmtN = roster.filter((p) => overall(p.res) === '관리대상자').length

  /* ---- 5. 공단 엑셀 CSV ---- */
  function exportCsv() {
    const headers = ['성명', '연령', '성별(남1/여2)', '부서·작업']
    let col = 19 // T
    for (const b of BODY) {
      const qs = NO_SIDE.includes(b) ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]
      for (const q of qs) { headers.push(`${colName(col)} ${b} ${q}번`); col++ }
    }
    for (const b of BODY) headers.push(`판정-${b}`)
    headers.push('판정-전체')
    const rows = roster
      .filter((p) => p.st === 'done' && p.form)
      .map((p) => {
        const f = p.form!
        const marks = buildMarks(f)
        const per: Judgment[] = BODY.map((b) => (f.pain === 2 ? judge(f.parts[b]) : '정상'))
        return [p.n, p.a, p.g === '남' ? 1 : 2, p.d, ...marks, ...per, overall(per) || '정상']
      })
    downloadCsv(`안전보건공단_증상조사표_${schoolName}`, headers, rows)
  }

  /* ---- 6. 개선계획서 ---- */
  function autoPlan() {
    const out: PlanRow[] = []
    for (const p of activeParts) {
      for (const j of p.jobs) {
        const k = `${p.key}-${j}`
        const [A, Bv] = ab[k] || [3, 3]
        const t = A * Bv
        if (t >= 12) {
          out.push({
            src: '작업조건', part: p.name, target: j,
            problem: `작업부하 총점 ${t}점 (부하 ${A} × 빈도 ${Bv})` + ((hz[k] || []).length ? ` · ${(hz[k] || []).join(', ')}` : ''),
            measure: '', due: '', owner: '',
          })
        }
      }
    }
    roster.forEach((person) => {
      if (overall(person.res) !== '통증호소자') return
      const bodies = (person.res || []).map((r, i) => (r === '통증호소자' ? BODY[i] : null)).filter(Boolean).join(', ')
      out.push({ src: '증상조사', part: person.d, target: person.n, problem: `통증호소자 — ${bodies}`, measure: '', due: '', owner: '' })
    })
    setPlan(out)
  }
  function setPlanCell(i: number, key: keyof PlanRow, v: string) {
    setPlan((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  }

  /* ---- 7. 백엔드 제출 ---- */
  async function submitReport() {
    if (!sid || submitting) return
    setSubmitting(true)
    const log: string[] = []
    const push = (m: string) => { log.push(m); setSubLog([...log]) }
    try {
      const created = await api<{ id: string }>('/musculo', { method: 'POST', body: JSON.stringify({ school_id: sid }) })
      const mid = created?.id || ''
      setSurveyId(mid)
      push(`✓ 근골격계 조사 생성 — ${mid.slice(0, 8)}`)

      // 1~11호 부담작업 판정 (파트별)
      for (const p of parts) {
        const flags = chk[p.key] || []
        if (!flags.some(Boolean)) continue
        if (!p.api) { push(`· ${p.name}: 추가 파트는 표준 공정이 아니어서 로컬 보관(파사드)됩니다`); continue }
        const clauses: Record<string, boolean> = {}
        HO.forEach(([n], i) => { clauses[String(n)] = !!flags[i] })
        const r = await api<{ has_burden: boolean; burden_clauses: number[] }>(`/musculo/${mid}/burden`, {
          method: 'POST', body: JSON.stringify({ process: p.api, clauses }),
        })
        push(`✓ 부담작업 판정 ${p.name} — ${r.burden_clauses.map((c) => c + '호').join(', ') || '해당 없음'}`)
      }

      // 작업조건 조사 (작업부하×빈도)
      for (const p of activeParts) {
        if (!p.api) continue
        for (const j of p.jobs) {
          const k = `${p.key}-${j}`
          const [A, Bv] = ab[k] || [3, 3]
          const r = await api<{ id: string; score: number }>(`/musculo/${mid}/basic-survey`, {
            method: 'POST', body: JSON.stringify({ process: p.api, workload: A, frequency: Bv }),
          })
          push(`✓ 작업조건 ${p.name} · ${j} — 총점 ${r.score}`)
        }
      }

      // 증상조사표
      for (const person of roster) {
        if (person.st === 'done' && person.form) {
          const r = await api<{ id: string; review_status: string }>(`/musculo/${mid}/sheets`, {
            method: 'POST',
            body: JSON.stringify({ person_name: person.n, image_ref: '', marks: buildMarks(person.form), confidence: 1 }),
          })
          push(`✓ 증상조사표 ${person.n} — ${r.review_status === 'auto' ? '자동 확정' : r.review_status}`)
        } else if (person.st === 'review') {
          await api(`/musculo/${mid}/sheets`, {
            method: 'POST',
            body: JSON.stringify({
              person_name: person.n, image_ref: person.omrFile || '',
              marks: Array(MARKS_LEN).fill(null), confidence: 0.5,
            }),
          })
          push(`✓ 증상조사표(종이 OMR) ${person.n} — 검수 대기 큐 등록`)
        }
      }

      push('완료 — 유해위험요인 사진(파일명 메타)·개선계획서는 전용 API가 없어 localStorage에 보존됩니다(파사드).')
    } catch (e) {
      push('✕ 오류: ' + (e instanceof Error ? e.message : '제출 실패'))
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 모달 전체 판정 ---- */
  const picked = form ? Object.keys(form.parts) : []
  const modalOver: Judgment = form && form.pain === 2 && picked.length
    ? (picked.map((b) => judge(form.parts[b])).includes('통증호소자')
      ? '통증호소자'
      : picked.map((b) => judge(form.parts[b])).includes('관리대상자') ? '관리대상자' : '정상')
    : '정상'
  const formPerson = formIdx >= 0 ? roster[formIdx] : null

  /* ===================== 렌더 ===================== */
  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <Link to="/musculo">근골격계 부담작업</Link> / <b>유해요인조사 보고서</b></div>

      {/* ---- 보고서 헤더 ---- */}
      <div className="mur-rephead">
        <div className="mur-reptop">
          <div>
            <h1><Activity size={18} style={{ verticalAlign: -3, marginRight: 6 }} />근골격계 유해요인조사 보고서</h1>
            <div className="mur-sy">1호~11호 부담작업 판정 → 해당 작업만 작업조건조사·사진·증상조사로 이어집니다</div>
          </div>
          <div className="mur-repacts">
            <button className="btn btn-ghost" onClick={saveDraft}><Save size={15} /> 임시저장{savedAt ? ` (${savedAt})` : ''}</button>
            <button className="btn btn-primary" onClick={submitReport} disabled={submitting || !sid}>
              <Send size={15} /> {submitting ? '제출 중…' : '보고서 제출'}
            </button>
          </div>
        </div>
        <div className="mur-meta">
          <div className="m">
            <div className="k">사업장명 (학교)</div>
            <select className="select" value={sid} onChange={(e) => setSp({ school: e.target.value })}>
              {schools.length === 0 && <option value="">학교 없음</option>}
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="m">
            <div className="k">조사일</div>
            <input className="select" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="m"><div className="k">조사자</div><div className="v">한국산업안전협회</div></div>
          <div className="m"><div className="k">부서명</div><div className="v">공정별 조사</div></div>
          <div className="m"><div className="k">조사 주기</div><div className="v">3년 1회 <small>· 8월 착수 → 10월 제출</small></div></div>
        </div>
      </div>

      {/* ---- 목차 ---- */}
      <div className="mur-toc">
        <a href="#mur-s1"><span className="n">1</span>부담작업 체크리스트</a>
        <a href="#mur-s2"><span className="n">2</span>작업조건 조사</a>
        <a href="#mur-s3"><span className="n">3</span>유해위험요인 사진</a>
        <a href="#mur-s4"><span className="n">4</span>증상 조사표</a>
        <a href="#mur-s5"><span className="n">5</span>공단 엑셀 열 매핑</a>
        <a href="#mur-s6"><span className="n">6</span>작업환경 개선계획서</a>
        <a href="#mur-s7"><span className="n">7</span>제출</a>
      </div>

      {/* ---- 1. 부담작업 체크리스트 ---- */}
      <div className="mur-sec" id="mur-s1">
        <div className="mur-ch">
          <span className="num">1</span><h3>근골격계부담작업 체크리스트</h3>
          <div className="r">칸을 눌러 <b style={{ color: 'var(--red-ink)' }}>O</b> / <b>X</b> 를 전환합니다</div>
        </div>
        <div className="mur-hochk">
          <table className="mur-ho">
            <thead>
              <tr>
                <th className="lead">파트 \ 부담작업</th>
                {HO.map(([n, d]) => (
                  <th key={n}><div className="hoho">{n}호</div><div className="hodesc"><B s={d} /></div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.key}>
                  <td className="pt">
                    {p.name}
                    <em>{p.jobs.length}개 작업{p.custom ? ' · 추가 파트' : ''}</em>
                    {p.custom && (
                      <button className="mur-btn-sm" style={{ marginTop: 5 }} onClick={() => removePart(p.key)}><X size={11} /> 삭제</button>
                    )}
                  </td>
                  {HO.map(([n], i) => {
                    const on = (chk[p.key] || [])[i]
                    return (
                      <td key={n}>
                        <div className={'mur-cellho' + (on ? ' on' : '')} onClick={() => toggleHo(p.key, i)}>{on ? 'O' : 'X'}</div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mur-note">2시간 이상이더라도 작업기간이 <b>1년 60일 이상</b>이 아니면 부담작업에 해당하지 않습니다.</div>
        <div className="mur-hosum">
          {parts.map((p) => {
            const hits = (chk[p.key] || []).map((v, i) => (v ? HO[i][0] + '호' : null)).filter(Boolean)
            return hits.length
              ? <span key={p.key} className="mur-hs hit">{p.name} · 부담작업 해당 ({hits.join(', ')}) — 작업조건 조사 대상</span>
              : <span key={p.key} className="mur-hs miss">{p.name} · 해당 없음</span>
          })}
        </div>
        {/* 파트가 없는 학교(기관)도 파트 추가 가능 — 0709 회의 결정 */}
        <div className="mur-addpart">
          <span className="lb">파트 추가</span>
          <input placeholder="파트명 (예: 과학실 관리)" value={npName} onChange={(e) => setNpName(e.target.value)} />
          <input className="jobs" placeholder="작업 목록 — 쉼표로 구분 (예: 약품 정리, 기자재 운반)" value={npJobs} onChange={(e) => setNpJobs(e.target.value)} />
          <button className="mur-btn-sm pri" onClick={addPart}><Plus size={12} /> 추가</button>
          <span className="mur-note" style={{ margin: 0 }}>표준 5개 파트가 없는 기관도 파트를 추가해 조사할 수 있습니다.</span>
        </div>
      </div>

      {/* ---- 2. 작업조건 조사 ---- */}
      <div className="mur-sec" id="mur-s2">
        <div className="mur-ch">
          <span className="num">2</span><h3>작업조건 조사</h3>
          <div className="r">2단계 · 작업별 작업부하 및 작업빈도 (근로자 면담)</div>
        </div>
        <div className="mur-scale">
          <table>
            <thead><tr><th colSpan={2}>작업 부하 (A)</th></tr></thead>
            <tbody>
              {SCALE_A_FULL.map((l, i) => <tr key={l}><td>{l}</td><td className="sc">{i + 1}</td></tr>)}
            </tbody>
          </table>
          <table>
            <thead><tr><th colSpan={2}>작업 빈도 (B)</th></tr></thead>
            <tbody>
              {SCALE_B_FULL.map((l, i) => <tr key={l}><td>{l}</td><td className="sc">{i + 1}</td></tr>)}
            </tbody>
          </table>
        </div>
        <table className="mur-wtab">
          <thead>
            <tr>
              <th style={{ width: 190 }}>작업내용</th>
              <th className="c" style={{ width: 180 }}>작업 부하 (A)</th>
              <th className="c" style={{ width: 180 }}>작업 빈도 (B)</th>
              <th className="c" style={{ width: 120 }}>총점 (A×B)</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {activeParts.length === 0 && (
              <tr><td colSpan={5}><div className="mur-noitem">1호~11호에 체크된 파트가 없습니다. 체크리스트에서 먼저 판정하세요.</div></td></tr>
            )}
            {activeParts.map((p) => {
              const hits = (chk[p.key] || []).map((v, i) => (v ? HO[i][0] + '호' : null)).filter(Boolean).join(', ')
              return [
                <tr key={p.key + '-grp'}><td className="grp" colSpan={5}>{p.name} — 부담작업 {hits}</td></tr>,
                ...p.jobs.map((j) => {
                  const k = `${p.key}-${j}`
                  const [A, Bv] = ab[k] || [3, 3]
                  const t = A * Bv
                  const cls = t >= 12 ? 'hi' : t >= 6 ? 'mid' : 'lo'
                  return (
                    <tr key={k}>
                      <td style={{ paddingLeft: 22 }}>{j}</td>
                      <td className="c">
                        <select value={A} onChange={(e) => setAB(k, 0, +e.target.value)}>
                          {OPT_A.map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}
                        </select>
                      </td>
                      <td className="c">
                        <select value={Bv} onChange={(e) => setAB(k, 1, +e.target.value)}>
                          {OPT_B.map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}
                        </select>
                      </td>
                      <td className="c"><span className={'mur-score ' + cls}>{t}</span></td>
                      <td style={{ color: 'var(--muted)', fontSize: 11 }}>{t >= 12 ? '개선계획서 작성 대상' : t >= 6 ? '경과 관찰' : '—'}</td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* ---- 3. 유해위험요인 사진 ---- */}
      <div className="mur-sec" id="mur-s3">
        <div className="mur-ch">
          <span className="num">3</span><h3>부담작업 유해위험요인 사진</h3>
          <div className="r">부담작업으로 판정된 작업만 표시됩니다 <span className="mur-facade">사진은 파일명 메타만 서버 전송</span></div>
        </div>
        <div className="mur-modelrule">
          <b>사진은 한 장이 아닌 여러 장</b> 첨부할 수 있습니다. 촬영 컷 수 기준 — 조사 인원 <b>5명 이하 1컷</b> ·
          <b> 6~10명 2컷</b> · <b>11~15명 3컷</b> (필요 시 추가 촬영 가능).
        </div>
        {activeParts.length === 0 && <div className="mur-noitem">부담작업으로 판정된 작업이 없습니다.</div>}
        {activeParts.map((p) => (
          <div key={p.key}>
            <div className="mur-riskgrp">{p.name}</div>
            {p.jobs.map((j) => {
              const k = `${p.key}-${j}`
              const list = shots[k] || []
              const on = hz[k] || []
              const inputId = 'mur-file-' + k
              return (
                <div className="mur-riskrow" key={k}>
                  <div className="wn">{j}</div>
                  <div>
                    <div className="mur-shots">
                      {list.map((s, i) => (
                        <div className={'mur-shot' + (s.url ? '' : ' meta')} key={i}>
                          {s.url ? <img src={s.url} alt={s.name} /> : <span>{s.name}</span>}
                          {s.url && <span className="nm">{s.name}</span>}
                          <button className="x" onClick={() => removeShot(k, i)} title="삭제">×</button>
                        </div>
                      ))}
                      <label className="mur-addshot" htmlFor={inputId} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Camera size={13} /> 사진 추가
                      </label>
                      <input id={inputId} type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={(e) => { addShots(k, e.target.files); e.target.value = '' }} />
                    </div>
                    <textarea className="mur-cap" placeholder="작업 설명 (예: 국솥 앞 서서 젓기, 1회 15분)"
                      value={caps[k] || ''} onChange={(e) => setCaps((m) => ({ ...m, [k]: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mur-hazlab">유해위험요인 (복수 선택)</div>
                    <div className="mur-hazchips">
                      {HAZ.map((h) => (
                        <button key={h} className={'mur-hz' + (on.includes(h) ? ' on' : '')} onClick={() => toggleHz(k, h)}>{h}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ---- 4. 증상 조사표 ---- */}
      <div className="mur-sec" id="mur-s4">
        <div className="mur-ch">
          <span className="num">4</span><h3>근골격계질환 증상 조사표</h3>
          <div className="r">부담작업 여부와 무관하게 <b>전 종사자</b>가 작성</div>
        </div>

        <div className="mur-svbar">
          <div className="mur-sv p"><div className="l">작성 완료</div><div className="n">{done}<small> / {roster.length}명</small></div></div>
          <div className="mur-sv"><div className="l">직접 입력 · 종이</div><div className="n">{mob}<small> · </small>{omrN}<small>명</small></div></div>
          <div className="mur-sv o"><div className="l">OMR 인식 검수</div><div className="n">{review}<small>명</small></div></div>
          <div className="mur-sv o"><div className="l">관리대상자</div><div className="n">{mgmtN}<small>명</small></div></div>
          <div className="mur-sv d"><div className="l">통증호소자</div><div className="n">{painN}<small>명</small></div></div>
        </div>

        <div className="mur-svtools">
          <button className="mur-btn-sm" onClick={() => setToolMsg('조사표 링크 일괄 발송 — 데모 파사드 (발송 API 미연결)')}>✉ 조사표 링크 일괄 발송</button>
          <button className="mur-btn-sm" onClick={() => omrAllRef.current?.click()}><Upload size={12} /> 종이 스캔 업로드 (OMR)</button>
          <input ref={omrAllRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }}
            onChange={(e) => { omrUploadAll(e.target.files); e.target.value = '' }} />
          <div className="sp">전 종사자 {roster.length}명 · 미제출 {roster.filter((p) => p.st === 'todo').length}명</div>
          <button className="btn btn-primary" style={{ height: 34, fontSize: 12 }} onClick={exportCsv}>
            <Download size={14} /> 안전보건공단 엑셀 내보내기
          </button>
        </div>
        {toolMsg && <div className="mur-note" style={{ marginBottom: 10 }}>{toolMsg}</div>}

        <table className="mur-roster">
          <thead>
            <tr>
              <th className="c" style={{ width: 40 }}>#</th>
              <th style={{ width: 130 }}>성명</th>
              <th className="c" style={{ width: 56 }}>연령</th>
              <th className="c" style={{ width: 56 }}>성별</th>
              <th style={{ width: 160 }}>부서 · 작업</th>
              <th className="c" style={{ width: 100 }}>작성 방식</th>
              <th className="c" style={{ width: 110 }}>상태</th>
              <th className="c" style={{ width: 100 }}>전체 판정</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p, i) => {
              const ov = overall(p.res)
              const rows = [
                <tr key={'r' + i} className={'row' + (syOpen === i ? ' open' : '')}
                  onClick={() => setSyOpen(syOpen === i ? -1 : i)}>
                  <td className="c" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                  <td className="who">{p.n}</td>
                  <td className="c">{p.a || '—'}</td>
                  <td className="c">{p.g}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{p.d}</td>
                  <td className="c"><span className={'mur-via ' + VIA[p.via][0]}>{VIA[p.via][1]}</span></td>
                  <td className="c"><span className={'pillx ' + ST[p.st][0]}>{ST[p.st][1]}</span></td>
                  <td className="c">{ov ? <span className={'mur-jd ' + JD[ov]}>{ov}</span> : <span className="mur-jd no">—</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="mur-btn-sm" onClick={(e) => { e.stopPropagation(); openForm(i) }}>
                      {p.st === 'todo' ? '조사표 작성' : p.st === 'review' ? '인식값 검수' : '조사표 열기'}
                    </button>
                  </td>
                </tr>,
              ]
              if (syOpen === i) {
                rows.push(
                  <tr key={'d' + i} className="mur-detail">
                    <td colSpan={9}>
                      {p.st === 'review' && (
                        <div className="mur-omrbox">
                          <b>종이 OMR 스캔본에서 값을 추출했습니다.</b>{' '}
                          {p.res
                            ? <>Ⅱ부 3번(통증강도) 문항의 마킹이 흐려 확인이 필요합니다. 인식률 <b>94%</b></>
                            : <>OMR 인식값 대기 중 — 보고서 제출 시 검수 큐로 전송됩니다. {p.omrFile ? <>(파일 {p.omrFile})</> : null}</>}
                        </div>
                      )}
                      {p.res ? (
                        <>
                          <div className="mur-bodygrid">
                            {BODY.map((b, j) => {
                              const r = p.res![j]
                              const c = JD[r]
                              return (
                                <div className={'mur-bp' + (c === 'ok' ? '' : ' ' + c)} key={b}>
                                  <div className="t">{b}</div>
                                  <div className="s" style={{ fontWeight: 700, color: c === 'ok' ? 'var(--muted)' : c === 'mg' ? 'var(--amber-ink)' : 'var(--red-ink)' }}>{r}</div>
                                  <div className="s">{p.detail ? p.detail[j] : '—'}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="mur-note" style={{ margin: 0 }}>기간=2번 · 강도=3번 · 빈도=4번 · 엑셀 <b>T~BA</b> 열에 숫자 그대로 기입됩니다.</div>
                        </>
                      ) : p.st === 'doing' ? (
                        <div className="mur-note" style={{ margin: 0 }}>작성 중입니다. 조사표를 열어 이어서 작성하세요.</div>
                      ) : (
                        <div className="mur-btnrow">
                          <button className="mur-btn-sm pri" onClick={() => openForm(i)}>조사표 작성</button>
                          <button className="mur-btn-sm" onClick={() => setToolMsg(`${p.n}에게 조사표 링크 발송 — 데모 파사드`)}>✉ 조사표 링크 발송</button>
                          <label className="mur-btn-sm" htmlFor={'mur-omr-' + i} style={{ cursor: 'pointer' }}><Upload size={12} /> 종이 스캔 업로드</label>
                          <input id={'mur-omr-' + i} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                            onChange={(e) => { omrUploadFor(i, e.target.files); e.target.value = '' }} />
                          <span className="mur-note" style={{ margin: 0 }}>종이로 받은 경우 스캔본을 올리면 OMR로 값을 추출합니다.</span>
                        </div>
                      )}
                    </td>
                  </tr>,
                )
              }
              return rows
            })}
            {roster.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="tstate">
                    등록된 현업종사자가 없습니다. 학교 상세의 「종사자 편집」에서 파트별 인원을 등록하면 명단이 생성됩니다.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mur-addperson">
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>종사자 추가</span>
          <input placeholder="성명" value={apName} onChange={(e) => setApName(e.target.value)} style={{ width: 110 }} />
          <input placeholder="연령" value={apAge} onChange={(e) => setApAge(e.target.value)} style={{ width: 70 }} />
          <select value={apG} onChange={(e) => setApG(e.target.value)}>
            <option>여</option><option>남</option>
          </select>
          <input placeholder="부서 · 작업 (예: 급식실 · 조리실무사)" value={apDept} onChange={(e) => setApDept(e.target.value)} style={{ minWidth: 220 }} />
          <button className="mur-btn-sm pri" onClick={addPerson}><Plus size={12} /> 추가</button>
        </div>
      </div>

      {/* ---- 5. 공단 엑셀 열 매핑 ---- */}
      <div className="mur-sec" id="mur-s5">
        <div className="mur-ch">
          <span className="num">5</span><h3 style={{ fontSize: 12.5 }}>안전보건공단 엑셀 자동 기입 — 열 매핑</h3>
          <div className="r"><span className="mur-colhint">데이터</span> 시트 7행부터 1인 1행</div>
        </div>
        <div className="mur-xlmap">
          <table>
            <thead><tr><th style={{ width: 96 }}>열</th><th style={{ width: 180 }}>구간</th><th>조사표 입력값 → 엑셀 값</th></tr></thead>
            <tbody>
              <tr><td className="col">A ~ S</td><td>기본정보</td><td>성명 · 연령 · 성별(남 1 / 여 2) · 경력 · 부서 · 작업 · 결혼(기혼 1 / 미혼 2) · 근무·휴식시간 · Ⅰ부 1·2·3·5번</td></tr>
              <tr><td className="col">T ~ X</td><td>목</td><td>2·3·4·5·6번 <span style={{ color: 'var(--muted)' }}>— 목은 좌우 구분(1번)이 없음</span></td></tr>
              <tr><td className="col">Y ~ AD</td><td>어깨</td><td>1 ~ 6번</td></tr>
              <tr><td className="col">AE ~ AJ</td><td>팔/팔꿈치</td><td>1 ~ 6번</td></tr>
              <tr><td className="col">AK ~ AP</td><td>손/손목/손가락</td><td>1 ~ 6번</td></tr>
              <tr><td className="col">AQ ~ AU</td><td>허리</td><td>2·3·4·5·6번 <span style={{ color: 'var(--muted)' }}>— 허리도 좌우 구분 없음</span></td></tr>
              <tr><td className="col">AV ~ BA</td><td>다리/발</td><td>1 ~ 6번</td></tr>
              <tr><td className="col">BB ~ BH</td><td>판정 결과</td><td>부위별 6칸 + 전체 — <b>엑셀 수식이 자동 계산</b> (플랫폼은 미리보기만 표시)</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mur-xlnote">
          모든 응답은 숫자 코드로 저장되므로 조사표에서 고른 값을 그대로 넣습니다. PC·모바일 어디서 작성해도 같은 값이 들어갑니다.
          <b> 결과</b> 시트는 <b>데이터</b> 시트를 참조하는 수식이라 값만 채우면 부서별 통계와 판정이 자동으로 갱신됩니다.<br />
          판정 기준 — <b>관리대상자</b>: 통증기간 1주일 이상(2번) 또는 1달 1회 이상 발생(4번)이면서 강도가 '중간 통증'(3번) ·{' '}
          <b>통증호소자</b>: 통증기간 1주일 이상 <i>그리고</i> 1달 1회 이상 <i>그리고</i> '심한' 또는 '매우 심한 통증'<br />
          <b>공단 엑셀 제출용</b> CSV 다운로드는 위 열 순서(T~BA 숫자 코드 + 판정 미리보기)로 내보냅니다 — 4번 섹션의 「안전보건공단 엑셀 내보내기」.
        </div>
      </div>

      {/* ---- 6. 작업환경 개선계획서 ---- */}
      <div className="mur-sec" id="mur-s6">
        <div className="mur-ch">
          <span className="num">6</span><h3>작업환경 개선계획서</h3>
          <div className="r">
            총점 12점 이상 작업과 통증호소자를 근거로 개선계획을 세웁니다
            <button className="mur-btn-sm" onClick={autoPlan}>개선 대상 자동 구성</button>
            <button className="mur-btn-sm" onClick={() => setPlan((r) => [...r, { src: '수동', part: '', target: '', problem: '', measure: '', due: '', owner: '' }])}>
              <Plus size={12} /> 행 추가
            </button>
          </div>
        </div>
        {plan.length === 0 ? (
          <div className="mur-noitem">「개선 대상 자동 구성」을 누르면 작업조건 조사(총점 12점 이상)와 증상조사표(통증호소자) 결과에서 개선 대상을 자동으로 추려 채웁니다.</div>
        ) : (
          <table className="mur-plan">
            <thead>
              <tr>
                <th style={{ width: 70 }}>근거</th>
                <th style={{ width: 130 }}>파트/부서</th>
                <th style={{ width: 130 }}>대상 (작업/인원)</th>
                <th>문제점 (유해요인)</th>
                <th style={{ width: 200 }}>개선방안</th>
                <th style={{ width: 110 }}>개선 일정</th>
                <th style={{ width: 90 }}>담당자</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {plan.map((r, i) => (
                <tr key={i}>
                  <td><span className="src">{r.src}</span></td>
                  <td><input value={r.part} onChange={(e) => setPlanCell(i, 'part', e.target.value)} /></td>
                  <td><input value={r.target} onChange={(e) => setPlanCell(i, 'target', e.target.value)} /></td>
                  <td><input value={r.problem} onChange={(e) => setPlanCell(i, 'problem', e.target.value)} /></td>
                  <td><input value={r.measure} placeholder="예: 이동대차 도입, 2인 1조" onChange={(e) => setPlanCell(i, 'measure', e.target.value)} /></td>
                  <td><input value={r.due} placeholder="예: 2026.10" onChange={(e) => setPlanCell(i, 'due', e.target.value)} /></td>
                  <td><input value={r.owner} onChange={(e) => setPlanCell(i, 'owner', e.target.value)} /></td>
                  <td><button className="mur-btn-sm" onClick={() => setPlan((rows) => rows.filter((_, j) => j !== i))}><X size={11} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mur-note">개선계획서는 전용 API가 없어 <b>localStorage에 보존(파사드)</b>됩니다. <span className="mur-facade">파사드</span></div>
      </div>

      {/* ---- 7. 백엔드 제출 ---- */}
      <div className="mur-sec" id="mur-s7">
        <div className="mur-ch">
          <span className="num">7</span><h3>백엔드 제출</h3>
          <div className="r">
            {surveyId ? <>최근 제출 조사 ID <b>{surveyId.slice(0, 8)}</b></> : '아직 제출된 조사가 없습니다'}
            <button className="btn btn-primary" style={{ height: 34, fontSize: 12 }} onClick={submitReport} disabled={submitting || !sid}>
              <Send size={14} /> {submitting ? '제출 중…' : '보고서 제출'}
            </button>
          </div>
        </div>
        <div className="mur-note" style={{ marginTop: 0 }}>
          제출 시 실제 API 호출 — <b>POST /musculo</b>(조사 생성) → <b>POST /musculo/{'{sid}'}/burden</b>(파트별 1~11호 판정)
          → <b>POST /musculo/{'{sid}'}/basic-survey</b>(작업별 부하×빈도) → <b>POST /musculo/{'{sid}'}/sheets</b>(증상조사표 · 직접 입력은 확정,
          종이 OMR은 검수 대기 큐). 사진(파일명 메타)·개선계획서·추가 파트 체크리스트는 API 미지원으로 localStorage 보존 <span className="mur-facade">파사드</span>
        </div>
        {subLog.length > 0 && (
          <div className="mur-sublog">
            {subLog.map((m, i) => (
              <div key={i} className={m.startsWith('✓') ? 'ok' : m.startsWith('✕') ? 'err' : ''}>{m}</div>
            ))}
          </div>
        )}
      </div>

      {/* ===================== 증상조사표 작성 모달 (drawForm 포팅) ===================== */}
      {form && formPerson && (
        <div className="mur-modal" onClick={(e) => { if (e.target === e.currentTarget) closeForm() }}>
          <div className="mur-sheet">
            <div className="mur-sheettop">
              <div>
                <h2>근골격계질환 증상조사표</h2>
                <div className="who2">
                  {schoolName} · {formPerson.n} ({formPerson.a || '—'}세 {formPerson.g}) · {formPerson.d} ·{' '}
                  <span className={'mur-via ' + VIA[formPerson.via][0]}>{VIA[formPerson.via][1]}</span>
                </div>
              </div>
              <div className="r">
                <span className={'mur-jd ' + JD[modalOver]} style={{ fontSize: 11, padding: '5px 10px' }}>전체 판정 · {modalOver}</span>
                <button className="mur-x" onClick={() => closeForm()}>✕</button>
              </div>
            </div>

            {formPerson.st === 'review' && (
              <div className="mur-omrbox">
                <b>종이 조사표 OMR 인식값</b>{' '}
                강조 표시된 선택지는 마킹이 흐려 인식 신뢰도가 낮습니다. 원본과 대조해 확인하세요. 인식률 <b>94%</b>
              </div>
            )}

            {/* Ⅰ부 기본 정보 · 작업 이력 */}
            <div className="mur-part1">
              <div className="mur-ph"><span className="rn">Ⅰ</span>기본 정보 · 작업 이력<span className="mur-colhint" style={{ marginLeft: 'auto' }}>A~S</span></div>
              <div className="mur-f2">
                <div className="mur-fld"><label>성명</label><input defaultValue={formPerson.n} /></div>
                <div className="mur-fld"><label>연령 (만)</label><input defaultValue={formPerson.a || ''} /></div>
                <div className="mur-fld">
                  <label>성별</label>
                  <select defaultValue={formPerson.g === '남' ? '남 (1)' : '여 (2)'}><option>남 (1)</option><option>여 (2)</option></select>
                </div>
                <div className="mur-fld"><label>현 직장경력</label><input placeholder="예: 8년 2개월" /></div>
                <div className="mur-fld">
                  <label>작업부서</label>
                  <select><option>급식</option><option>당직</option><option>미화</option><option>시설관리</option><option>통학 차량</option></select>
                </div>
                <div className="mur-fld"><label>결혼여부</label><select><option>기혼 (1)</option><option>미혼 (2)</option></select></div>
                <div className="mur-fld"><label>현재 작업내용</label><input placeholder="예: 조리, 배식" /></div>
                <div className="mur-fld"><label>현재 작업기간</label><input placeholder="예: 8년 2개월" /></div>
                <div className="mur-fld"><label>1일 근무시간</label><input placeholder="8" /></div>
                <div className="mur-fld"><label>휴식시간</label><input placeholder="30분씩 1회" /></div>
                <div className="mur-fld"><label>이전 작업내용</label><input placeholder="없으면 비워두세요" /></div>
                <div className="mur-fld"><label>이전 작업기간</label><input placeholder="예: 10년" /></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="mur-qrow"><div className="qt"><b>1</b>규칙적인 여가 및 취미활동</div>
                  <Opts list={I_Q1} cur={form.i1} onPick={(v) => setForm({ ...form, i1: v })} /></div>
                <div className="mur-qrow"><div className="qt"><b>2</b>하루 평균 가사노동시간</div>
                  <Opts list={I_Q2} cur={form.i2} onPick={(v) => setForm({ ...form, i2: v })} /></div>
                <div className="mur-qrow"><div className="qt"><b>3</b>의사로부터 질병 진단을 받은 적이 있습니까?</div>
                  <Opts list={I_Q3} cur={form.i3} onPick={(v) => setForm({ ...form, i3: v })} /></div>
                <div className="mur-qrow"><div className="qt"><b>4</b>과거 운동·사고로 다친 적이 있습니까?</div>
                  <Opts list={I_Q4} cur={form.i4} onPick={(v) => setForm({ ...form, i4: v })} /></div>
                <div className="mur-qrow"><div className="qt"><b>5</b>현재 하시는 일의 육체적 부담 정도</div>
                  <Opts list={I_Q5} cur={form.i5} onPick={(v) => setForm({ ...form, i5: v })} /></div>
              </div>
            </div>

            {/* Ⅱ부 게이트 */}
            <div className="mur-gate">
              <div className="t">
                <span className="mur-ph" style={{ display: 'inline-flex', margin: '0 8px 0 0' }}><span className="rn">Ⅱ</span></span>
                지난 1년 동안 목·어깨·팔·손·허리·다리 중 어느 한 부위에서라도 작업과 관련한 통증이나 불편함을 느낀 적이 있습니까?
              </div>
              <div className="r" style={{ display: 'flex', gap: 6 }}>
                <button className={'mur-op' + (form.pain === 1 ? ' on' : '')}
                  onClick={() => setForm({ ...form, pain: 1, parts: {} })}><span className="k">1</span>아니오</button>
                <button className={'mur-op' + (form.pain === 2 ? ' on' : '')}
                  onClick={() => setForm({ ...form, pain: 2 })}><span className="k">2</span>예</button>
              </div>
            </div>

            {/* Ⅱ부 부위별 문항 */}
            {form.pain === 2 ? (
              <>
                <div className="mur-bodypick">
                  {BODY.map((b) => {
                    const on = !!form.parts[b]
                    const j = on ? judge(form.parts[b]) : null
                    return (
                      <label className={'mur-bpk' + (on ? ' on' : '')} key={b}>
                        <input type="checkbox" checked={on} onChange={(e) => {
                          const parts = { ...form.parts }
                          if (e.target.checked) parts[b] = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0 }
                          else delete parts[b]
                          setForm({ ...form, parts })
                        }} />
                        {b}
                        {on && j && <span className={'mur-jd ' + JD[j]}>{j}</span>}
                      </label>
                    )
                  })}
                </div>
                {Object.keys(form.parts).map((b) => {
                  const a = form.parts[b]
                  const j = judge(a)
                  const cls = JD[j] === 'ok' ? '' : JD[j]
                  // OMR 검수 데모: 허리 3번(강도) 보기 2·3 저신뢰 강조 (프로토타입 low)
                  const lowQ3 = formPerson.st === 'review' && b === '허리' ? [2, 3] : undefined
                  const setQ = (q: keyof Answers) => (v: number) =>
                    setForm({ ...form, parts: { ...form.parts, [b]: { ...a, [q]: v } } })
                  return (
                    <div className={'mur-bsec ' + cls} key={b}>
                      <div className="mur-bh">
                        <span className="bt">{b}</span><span className="mur-colhint">{BODY_COL[b]}</span>
                        <div className="r"><span className={'mur-jd ' + JD[j]}>{j}</span></div>
                      </div>
                      <div className="mur-bb">
                        {!NO_SIDE.includes(b) && (
                          <div className="mur-qrow"><div className="qt"><b>1</b>통증의 구체적 부위는?</div>
                            <Opts list={Q1_SIDE} cur={a.q1} onPick={setQ('q1')} /></div>
                        )}
                        <div className="mur-qrow"><div className="qt"><b>2</b>한번 아프기 시작하면 통증 기간은?</div>
                          <Opts list={Q2_DUR} cur={a.q2} onPick={setQ('q2')} /></div>
                        <div className="mur-qrow"><div className="qt"><b>3</b>그때의 아픈 정도는?</div>
                          <Opts list={Q3_INT} cur={a.q3} low={lowQ3} onPick={setQ('q3')} /></div>
                        <div className="mur-qrow"><div className="qt"><b>4</b>지난 1년 동안 얼마나 자주 경험했습니까?</div>
                          <Opts list={Q4_FRQ} cur={a.q4} onPick={setQ('q4')} /></div>
                        <div className="mur-qrow"><div className="qt"><b>5</b>지난 1주일 동안에도 증상이 있었습니까?</div>
                          <Opts list={Q5_WK} cur={a.q5} onPick={setQ('q5')} /></div>
                        <div className="mur-qrow"><div className="qt"><b>6</b>통증으로 인해 어떤 일이 있었습니까?</div>
                          <Opts list={Q6_ACT} cur={a.q6} onPick={setQ('q6')} /></div>
                      </div>
                    </div>
                  )
                })}
              </>
            ) : form.pain === 1 ? (
              <div className="mur-noitem">통증 없음으로 응답하여 설문이 종료되었습니다. 판정 <span className="mur-jd ok">정상</span></div>
            ) : (
              <div className="mur-noitem">위에서 통증 경험 여부를 먼저 선택하세요.</div>
            )}

            <div className="mur-sheetfoot">
              <div className="msg">응답은 숫자 코드로 저장되어 <b>안전보건공단 엑셀 '데이터' 시트</b>에 그대로 기입됩니다. 판정(BB~BH)은 엑셀 수식이 계산합니다.</div>
              <div className="r">
                <button className="mur-btn-sm" onClick={() => closeForm()}>닫기</button>
                <button className="mur-btn-sm" onClick={() => closeForm(true)}>임시저장</button>
                <button className="mur-btn-sm pri" onClick={completeForm}>작성 완료</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
