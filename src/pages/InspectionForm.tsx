// 종사자 안전·보건 점검표 작성 — 발주처 프로토타입(school-safety-ledger.js v-inspect) 포팅.
// PARTDEF/EXCL_RULES/CARRY_VALUE/autoExcl/renderInspect/tally 도메인 로직을 TS로 이식.
// 경로: /inspection/new?school=<id>
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, getToken } from '../lib/api'
import { InspectionMailModal } from '../components/InspectionMailModal'
import { SignImage } from '../components/SignImage'
import { SignaturePadModal, type SignStrokes } from '../components/SignaturePadModal'
import type { SheetData } from '../components/InspectionSheetView'
import { resolveExtra, type InspExtra } from '../lib/inspExtra'
import '../styles/inspectform.css'

// 기존 사용처 호환 재수출 — InspExtra 본체는 lib/inspExtra.ts로 이동(공용 매칭 로직과 함께).
export type { InspExtra } from '../lib/inspExtra'

/* ===================== 점검항목 (프로토타입 Q_GS·Q_TH·Q_SI·Q_MI 그대로) ===================== */
const Q_GS = ['바닥의 물·기름·물때 등으로 인해 미끄러질 위험 여부', '통로 확보 및 통행로나 바닥에 호스, 물품 적재·방치 여부', '장애물(문턱·배관·패인곳 및 돌출부 등)로 인해 넘어질 위험 여부', '조리장·계단·통로에 적정한 조명 설치 여부', '계단에 난간 설치, 답단 끝에 미끄러짐 방지 조치 여부', '미끄러짐 방지 장화 등 보호구 착용 여부', '청소 후 트렌치 덮개를 원상태로 덮어 놓았는지 여부', '왁스, 물청소 등으로 넘어짐 위험장소에 "미끄러짐표지" 부착 여부', '문은 쉽게 열고 닫을 수 있는 구조를 유지하고 있는지 여부', '재료 운반대차 및 배식차에 끼일 위험 여부', '양념재료(마늘·파·양파 등) 분쇄기·절단기에 말려들 위험 여부', '기계의 회전체(벨트·체인·회전날개 등)에 방호덮개 설치 여부', '리프트, 덤웨이터의 안전한 사용 여부||사람 탑승금지 조치, 출입문이 열린 상태에서는 동작이 안 되도록 조치 / 사용중량·경고표지 부착 여부', '절단기·분쇄기 칼날 부위에 베임방지용 덮개 설치 여부', '칼날 등에 베일 위험을 방지하기 위한 조치 여부', '칼 용도 외 사용 여부 (김치포장 끈 제거, 캔 뚜껑 제거, 식용유 뚜껑 제거 등)', '식자재 운반카트의 바퀴 고정장치(stopper) 정상작동 여부', '부딪힘 사고 유형별 예방 확인||선반 등 돌출부 / 이동 중인 급식카트 / 시야 미확보 / 식기세척·청소 후 일어서다가 / 의자·작업발판에서 내려오다가', '전기 기계·기구에 감전 예방용 접지 상태 여부', '누전차단기 설치 및 월 1회 이상 동작점검 여부', '전선의 노후화 또는 피복손상, 심하게 구부러짐 여부', '가스누출감지기, 경보기가 정상적으로 작동하는지 여부', '가스공급배관에서 가스가 누출되고 있지 않은지 여부', '급식실 작업장 환기는 충분히 실시하고 있는지 여부', '환기 방법', '환기장치 설치 및 조리 시 사용 여부', '환기장치 작동 여부', '급식실 후드청소 주기', '급식실 위치', '급식실에 적합한 소화기 비치 및 정상작동 여부', '국솥 등에 한꺼번에 많은 양의 식자재를 넣고 있지 않은가', '뜨거운 물, 국 등이 들어있는 회전식 국솥 핸들고정 장치가 정상적으로 고정되어 있는지 여부', '자외선 살균기, 전격살충기 등 램프 적정선정 및 정상작동 여부', '기타 각종 위험요인으로부터 근로자 보호조치 여부', '고온 스팀 사용장소에 "고온 경고" 또는 "화상주의" 표지 게시 여부', '뜨거운 용기 취급 시 방열장갑 또는 보조집게 사용 여부', '조리실 등 고온다습하고 환기가 불충분한 장소에 적정한 환기·통풍·냉방시설 설치 및 관리 여부', '물질안전보건자료(MSDS)의 게시(비치) 및 교육 여부', '취급용기 및 포장에 MSDS 경고표지 부착 여부', '세제, 청소제 등 화학물질 취급 시 고무장갑 등 적정 보호장구 착용 여부', '근골격계부담작업 유해요인조사 실시 여부', '근골격계질환 예방을 위해 인력작업 보조설비 및 편의설비 등 작업환경 개선 여부', '근골격계부담작업 종사자에 대한 유해성 주지(교육 등) 적정성', '중량물 안내포스터 부착 유무 — 5kg 이상 물체를 중량물로 취급', '작업 전·후 스트레칭 실시 및 적정 휴식시간 배분 여부', '운반작업 시 적정한 양 운반, 2인 1조 작업 또는 이동대차 등 운반보조도구 사용 여부']
const Q_TH = ['운전원은 차량이 항상 청결하도록 유지하였는가?', '운전 중 흡연 및 식음, 통화 등은 하지 않았는가?', '운전 중 직무수행에 필요한 사람 이외의 탑승은 없었는가?', '배차되지 않은 차량의 사적인 운행 행위는 금지되었는가?', '운전원은 차량 밖으로 이동 시 잠금장치를 하였는가?', '운전원은 경제속도운행 및 안전운행에 노력하였는가?', '승차 시 학생들의 안전한 탑승이 확인된 후에 출발하였는가?', '하차 시 학생들의 안전한 상태를 확인 후 하차하였는가?', '승하차 시 지정된 장소에 대기하고 있던 학부모와 인사를 나누고 학생들을 안전하게 인도하였는가?', '운행 중 창밖으로 손을 내밀거나 하는 위험 행동을 통제했는가?', '출발 전 학생들의 안전벨트 착용 등의 상태를 확인하였는가?', '차량의 학교 도착 후 유실물과 차량의 상태는 확인하였는가?']
const Q_SI = ['위험작업 시 안전모, 안전화 등 개인보호구를 착용하였는가?', '사다리 작업 시 안전한 작업방법을 숙지하고 있는가?', '각종 계기류 확인 시 감전 예방을 위한 절연장갑을 착용하였는가?', '기계 점검·보수 시 동력원을 완전히 차단 후 작업하는가?', '고장난 승강기를 임의로 열거나 기기를 조작하지는 않는가?', '승강기 점검·보수 시 접근금지 표지판을 부착하는가?', '각종 전기기구 작업 시 작업자가 감전사고에 대한 작업방법을 확실하게 인지하고 있는가?', '화학물질 취급 및 저장 시 별도의 지정된 장소에 보관하는가?', '사용하는 화학물질의 위험성 또는 유해성에 대해 정확히 알고 있는가?', '소화기 및 소화전의 작동 및 사용방법을 아는가?', '무거운 물체 운반 시 2인 1조로 작업을 실시하는가?', '올바른 중량물 취급방법에 대해 알고 있는가?', '작업 전·중·후 주기적으로 스트레칭을 하였는가?']
// 당직 점검표 — 전남교육청 실사이트 당직업무 15문항 원문(2026-08-27 실측, 앱 inspection_screen.dart와 동일)
const Q_DJ = ['랜턴, 야광조끼, 야광봉, 안전화 등 챙겼는가?', '계단을 오르내릴땐 손잡이를 잡는가?', '주머니에 손을 넣고 경사, 결빙, 어두운 곳을 순찰하지 않는가?', '흡연하면서 작업하거나 근무 중 음주하지 않는가?', '통로는 충분히 밝은가?', '통로는 정리정돈 되어 걸려 넘어질 위험이 없는가?', '계단은 파손부위가 없고 미끄럼방지 조치를 하였는가?', '경비책임자가 주기적으로 현장을 점검하는가?', '현장 점검결과 문제점은 빠른 시일 내에 해결하는가?', '비상연락망이 게시되어 있는가?', '소화기 및 소화전의 작동 및 사용방법을 아는가?', '화재발생 시 소방 및 대피방법을 알고 있는가?', '무거운 물체 운반 시 2인 1조로 작업을 실시하는가?', '올바른 중량물 취급방법에 대해 알고 있는가?', '작업 전, 중, 후 주기적으로 스트레칭을 하는가?']
const Q_MI = ['바닥에 작업자가 걸려 넘어질 위험이 있는 장애물은 제거하였는가?', '근로자의 통행에 장해가 없도록 채광 또는 조명시설이 충분한가?', '교차점이나 코너에는 충돌방지용 거울을 설치하였는가?', '다른 사람과 충돌을 방지하기 위해 우측통행을 하는가?', '화장실 타일이 깨지거나 비어있는 부분은 없는가?', '청소 전 화장실 내부에 사람이 있는지 확인하였는가?', '화장실 천정이나 높은 벽 청소 시 사용하는 사다리에 미끄럼방지 조치를 하였는가?', '화장실 세면대나 변기 위에 올라가서 작업을 하지 않는가?', '청소 중에는 "청소 중"을 알리는 표지를 하고 작업하는가?', '청소 후 바닥에 미끄러운 세제나 물기를 깨끗이 제거하는가?', '청소도구를 지정된 위치에 보관하는가?', '자극성 세제를 이용한 청소 시 고무장갑을 착용하는가?', '청소 중에는 미끄럼 방지용 장화를 착용하는가?']

/* 비고가 '값'인 항목 — 지난 점검 값이 채워진 채 시작하고, 추천 보기에서 고를 수 있다 (CARRY_VALUE) */
const CARRY_VALUE: Record<string, { v: string; opts: string[] }> = {
  '급식-25': { v: '국소배기장치', opts: ['국소배기장치', '전체환기장치', '자연환기', '국소배기 + 전체환기'] },
  '급식-28': { v: '매주', opts: ['매주', '격주', '매월', '분기 1회'] },
  '급식-29': { v: '지상', opts: ['지상', '지하', '별동'] },
}

/* 비고 추천문구 — 값입력형(CARRY_VALUE)과 달리 양호/미흡/해당없음 그대로 두고 비고칸만 한 번 탭으로 채우는 선택지.
   시설-5·6(승강기)은 대개 전문 유지관리 업체가 관리하므로 '전문업체 관리중' 원탭 입력 [테스터 요청 #5] */
const REMARK_SUGGEST: Record<string, string[]> = {
  '시설-5': ['전문업체 관리중'],
  '시설-6': ['전문업체 관리중'],
}

/* 파트 정의 — 백엔드 Part enum(catering/facility/cleaning/commute/night_duty) 매핑 */
type PartApi = 'catering' | 'facility' | 'cleaning' | 'commute' | 'night_duty'
type PartDef = { key: PartApi; label: string; name: string; q: string[] | null }
// 실물 양식 보기(InspectionSheetView)에서도 표준 문항 전체를 그리는 데 사용 [056]
export const PARTDEF: PartDef[] = [
  { key: 'catering', label: '급식', name: '급식종사자', q: Q_GS },
  { key: 'night_duty', label: '당직', name: '당직업무', q: Q_DJ },
  { key: 'commute', label: '통학', name: '통학보조', q: Q_TH },
  { key: 'facility', label: '시설', name: '시설관리', q: Q_SI },
  { key: 'cleaning', label: '미화', name: '미화원', q: Q_MI },
]

/* ===================== 학교 특징 → 점검표 항목 자동 해당없음 매핑 (EXCL_RULES) ===================== */
const EXCL_RULES: { key: string; feat?: string; why: string; hit: Record<string, number[]> }[] = [
  { key: '엘리베이터', feat: '엘리베이터', why: '엘리베이터 없음', hit: { 시설: [5, 6] } },
  // feat는 학교 대장 특징 데이터 키(기존 저장값 '대형 곰솥')와 일치해야 하므로 유지 — 표시 문구만 '국솥'으로 교정.
  { key: '대형 국솥', feat: '대형 곰솥', why: '대형 국솥 없음', hit: { 급식: [32] } },
  { key: '계단 (2층 이상)', feat: '계단 (2층 이상)', why: '계단 없음', hit: { 급식: [5] } },
  { key: '덤웨이터', feat: '덤웨이터', why: '덤웨이터 없음', hit: { 급식: [13] } },
  { key: '미화 종사원', why: '미화 종사원 없음', hit: { 미화: [3, 7] } },
  { key: 'LPG 사용', feat: 'LPG 사용', why: 'LPG 미사용', hit: { 급식: [22, 23] } },
  // 08-28 조사원 피드백: 거울 미설치·고소작업 없는 학교 대응.
  // 09-18 테스터 요청: 미화 고소작업 없음 = 미화-7(사다리)만 해당없음. 미화-8(세면대·변기 위 작업)은 양호로 답해야 하므로 제외.
  { key: '충돌방지용 거울', feat: '충돌방지용 거울', why: '충돌방지용 거울 없음', hit: { 미화: [3] } },
  { key: '미화 고소작업', feat: '미화 고소작업', why: '미화 고소작업 없음', hit: { 미화: [7] } },
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
type School = { id: string; name: string; email?: string }
type Worker = { id: string; part: string; count: number }
type Ledger = {
  school: { id: string; name: string; is_private: boolean; address: string; email?: string }
  workers: Worker[]
}
type ApprovalStep = { title: string; name: string }
type PrevItem = { code: string; remark: string; result: string | null }
type PrevSig = { signer: string; signed_at?: string | null; image_ref?: string | null }
type PrevInsp = {
  id?: string; part: string; status?: string; items: PrevItem[]
  signatures?: PrevSig[]; submitted_at?: string | null; signed_at?: string | null
  eduoffice_submit_status?: string // 수정 모드: 전송완료(success) 건 재전송 확인 흐름에 사용
}
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
  const resumeAll = params.get('resumeall') === '1' // 점검표 1장 단위 이어서 작성 — 이 학교의 모든 작성중 공정을 프리필 [052]
  const editIds = (params.get('edit') || '').split(',').filter(Boolean) // 제출·서명완료 점검표 수정 — 해당 점검 ID들을 프리필하고 같은 점검에 덮어쓰기 [068]
  const [resumeParts, setResumeParts] = useState<string[]>([]) // resumeall로 발견된 작성중 공정 키
  const today = new Date().toISOString().slice(0, 10)

  const [schools, setSchools] = useState<School[]>([])
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [approval, setApproval] = useState<ApprovalStep[]>([])
  const [prevVals, setPrevVals] = useState<Record<string, string>>({})
  const [feat, setFeat] = useState<FeatMap>(null)
  // [비고 연속성] 과거 방문 이력 — 날짜별 비고 묶음. 어느 방문에서 불러올지 사용자가 고른다.
  const [pastVisits, setPastVisits] = useState<{ date: string; parts: string[]; remarks: Record<string, string>; count: number }[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const [histPick, setHistPick] = useState(0)
  const [histOverwrite, setHistOverwrite] = useState(false)

  // 작성 상태
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  // null = 명시적 해제 — 자동 해당없음 값도 무시하고 "선택 없음"으로 표시 [048]
  const [answers, setAnswers] = useState<Record<string, Ans | null | undefined>>({})
  const [remarks, setRemarks] = useState<Record<string, string | undefined>>({})
  const [photos, setPhotos] = useState<Record<string, Slot[]>>({})
  const [etc, setEtc] = useState('')
  const [place, setPlace] = useState('')
  const [accType, setAccType] = useState(ACC_TYPES[0])
  const [inspectDate, setInspectDate] = useState(today)
  const [signerName, setSignerName] = useState('')
  const [signed, setSigned] = useState(false)
  // [G-6] 웹 서명패드 — 그린 서명 PNG(dataURL)·원본 스트로크(앱 동일 스키마). 서명 시 백엔드로 전송.
  const [signImage, setSignImage] = useState('')
  const [signStrokes, setSignStrokes] = useState<SignStrokes | null>(null)
  const [padOpen, setPadOpen] = useState(false)
  const [followupOn, setFollowupOn] = useState(false)
  // 수신 데이터(현장앱 제출분) — 이어서 작성/수정 모드에서 표시·보존 [서명·사진 출력 수정]
  // recvSigs: part key → 주서명(이미지 저장경로 포함), recvLines: 다중 결재란(서명 이미지 포함)
  const [recvSigs, setRecvSigs] = useState<Record<string, PrevSig[]>>({})
  const [recvLines, setRecvLines] = useState<NonNullable<InspExtra['approval_lines']>>([])

  // 제출 상태
  const [busy, setBusy] = useState(false)
  // 전남교육청 업로드 진행 팝업(게이지) — 완료 시 자동 사라짐
  const [prog, setProg] = useState<null | { done: number; total: number; label: string; phase: 'run' | 'done' | 'err'; msg: string }>(null)
  const [draftIds, setDraftIds] = useState<Record<string, string>>({}) // 임시저장으로 생성된 파트별 점검 ID [047]
  // 수정 모드에서 이전에 교육청 전송완료(success)였던 점검 ID들 — 저장 시 재서명·재제출을
  // 건너뛰어 전송상태를 보존하고, 저장 후 확인창으로 재전송(request-eduoffice) 여부를 묻는다.
  const [eduSuccessIds, setEduSuccessIds] = useState<string[]>([])
  const [draftNote, setDraftNote] = useState('')
  const [submitErr, setSubmitErr] = useState('')
  const [statuses, setStatuses] = useState<Record<string, PartStatus>>({})
  const [doneAll, setDoneAll] = useState(false)
  const [mailOpen, setMailOpen] = useState(false) // [062] 학교 메일 전송 모달
  const [pdfIds, setPdfIds] = useState<string[]>([]) // 제출 완료 후 점검표 PDF 대상 ids
  const [pdfBusy, setPdfBusy] = useState(false)

  // 완성 점검표 PDF — 백엔드 아카이브(GET /inspections/{id}/report.pdf). 수정 모드는
  // 기존 점검(editIds), 신규는 제출 완료 후(pdfIds) 활성.
  const pdfTargetId = pdfIds[0] || editIds[0] || ''
  async function downloadFormPdf() {
    if (!pdfTargetId) return
    setPdfBusy(true)
    try {
      const res = await fetch(`/api/v1/inspections/${pdfTargetId}/report.pdf`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `안전점검표_${(schools.find((s) => s.id === sid)?.name || '학교')}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setSubmitErr(e instanceof Error ? `PDF 생성 실패: ${e.message}` : 'PDF 생성 실패')
    } finally {
      setPdfBusy(false)
    }
  }

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
    setPastVisits([]); setHistOpen(false)
    setSigned(false); setDoneAll(false); setMailOpen(false); setSubmitErr(''); setPrevVals({}); setLoadErr('')
    setRecvSigs({}); setRecvLines([]); setEduSuccessIds([])
    setSignImage(''); setSignStrokes(null); setPadOpen(false)
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
        // [비고 연속성] 과거 방문 목록 구성 — 날짜별 그룹(현재 수정 중인 점검은 제외),
        // 비고가 1칸이라도 있는 방문만. 최신 방문이 앞.
        {
          const editSet = new Set(editIds)
          const byDate = new Map<string, { parts: Set<string>; remarks: Record<string, string> }>()
          for (const insp of list) {
            if (insp.id && editSet.has(insp.id)) continue
            const d = String(insp.submitted_at || insp.signed_at || '').slice(0, 10)
            if (!d) continue
            const g = byDate.get(d) ?? { parts: new Set<string>(), remarks: {} }
            g.parts.add(insp.part)
            for (const it of insp.items || []) if (it.remark) g.remarks[it.code] = it.remark
            byDate.set(d, g)
          }
          setPastVisits([...byDate.entries()]
            .map(([date, g]) => ({ date, parts: [...g.parts], remarks: g.remarks, count: Object.keys(g.remarks).length }))
            .filter((v) => v.count > 0)
            .sort((a, b) => (a.date < b.date ? 1 : -1)))
        }
        // 이어서 작성: 대상 점검의 기존 결과·비고를 폼에 프리필 (코드가 폼 규격과 일치하는 항목만)
        const prefill = (targets: PrevInsp[]) => {
          const pa: Record<string, Ans | undefined> = {}
          const pr: Record<string, string | undefined> = {}
          for (const target of targets) {
            for (const it of target.items || []) {
              const inv = it.result ? RES_INV[it.result] : undefined
              if (inv) pa[it.code] = inv
              if (it.remark) pr[it.code] = it.remark
            }
          }
          if (Object.keys(pa).length) setAnswers((p) => ({ ...pa, ...p }))
          if (Object.keys(pr).length) setRemarks((p) => ({ ...pr, ...p }))
        }
        // [서명·사진 출력 수정] 수신분 프리필 — 기존/제출된 점검표를 열면 앱이 보낸 서명 이미지와
        // 사진대지·기본정보·결재선을 함께 불러와 표시한다. (기존엔 항목 결과만 프리필되어
        // '실제 점검표'(작성/수정 화면)에서 서명·사진이 안 보였음.)
        const loadReceived = (targets: PrevInsp[]) => {
          // ① 주서명 — GET /inspections 응답의 signatures(image_ref 포함)를 part key별 보관
          const sigs: Record<string, PrevSig[]> = {}
          for (const t of targets) if (t.signatures?.length) sigs[t.part] = t.signatures
          if (Object.keys(sigs).length) setRecvSigs(sigs)
          // 확인자 성명 프리필 — 서명 기록이 있으면 서명 완료 상태로 표시(재서명 가능)
          const firstSigner = targets.flatMap((t) => t.signatures ?? []).map((s) => s.signer).find(Boolean)
          if (firstSigner) { setSignerName((v) => v || firstSigner); setSigned(true) }
          // ② 부가정보 — Inspection.tsx '보기'와 동일한 resolveExtra 폴백 매칭(any-id → 점검일 → 학교 사진 병합)
          const ids = new Set(targets.map((t) => t.id).filter((x): x is string => !!x))
          const date = targets
            .map((t) => String(t.submitted_at || t.signed_at || t.signatures?.[0]?.signed_at || '').slice(0, 10))
            .find(Boolean) || ''
          api<{ doc: Record<string, InspExtra[]> }>('/ops/docs/inspection-extras')
            .then((r) => {
              if (!alive) return
              const extra = resolveExtra(r.doc?.[sid], ids, date)
              if (!extra) return
              setRecvLines(extra.approval_lines ?? [])
              // 사진대지 — 앱 사진(라벨 키: 급식/통학/시설/미화/당직 = PARTDEF label과 동일)을 슬롯에 프리필
              if (extra.photos && Object.keys(extra.photos).length) setPhotos((p) => ({ ...extra.photos, ...p }))
              if (extra.etc) setEtc((v) => v || extra.etc)
              if (extra.info?.place) setPlace((v) => v || extra.info.place)
              if (extra.info?.accType) setAccType((v) => (v === ACC_TYPES[0] ? extra.info.accType : v))
              if (extra.info?.inspectDate) setInspectDate(extra.info.inspectDate)
              if (extra.signer) { setSignerName((v) => v || extra.signer); setSigned(true) }
            })
            .catch(() => { /* 부가정보 없으면 기본 폼 */ })
        }
        if (resumeAll) {
          // 점검표 단위 이어서 작성 — 공정별 최신 작성중 점검을 모두 프리필하고 그 점검들에 이어서 기록 [052]
          const latestDraft = new Map<string, PrevInsp>()
          for (const insp of list) if (insp.status === 'draft' && insp.id) latestDraft.set(insp.part, insp)
          const drafts = [...latestDraft.values()]
          if (drafts.length) {
            prefill(drafts)
            loadReceived(drafts)
            const ids: Record<string, string> = {}
            for (const dr of drafts) {
              const def = PARTDEF.find((x) => x.key === dr.part)
              if (def && dr.id) ids[def.label] = dr.id
            }
            setDraftIds((p) => ({ ...ids, ...p }))
            setResumeParts(drafts.map((dr) => dr.part))
          }
        } else if (editIds.length) {
          // 점검표 수정 — 상태와 무관하게 지정 점검들을 프리필하고, 저장 시 같은 점검에 덮어쓰기 [068]
          const targets = list.filter((x) => x.id && editIds.includes(x.id))
          if (targets.length) {
            prefill(targets)
            loadReceived(targets)
            // 전송완료(success) 건 기록 — 저장 시 상태 보존 + 저장 후 재전송 확인 흐름 [F-2]
            setEduSuccessIds(targets
              .filter((t) => t.eduoffice_submit_status === 'success' && t.id)
              .map((t) => t.id as string))
            const ids: Record<string, string> = {}
            for (const t of targets) {
              const def = PARTDEF.find((x) => x.key === t.part)
              if (def && t.id) ids[def.label] = t.id
            }
            setDraftIds((p) => ({ ...ids, ...p }))
            setResumeParts(targets.map((t) => t.part))
          }
        } else if (resumeId) {
          const target = list.find((x) => x.id === resumeId)
          if (target) { prefill([target]); loadReceived([target]) }
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

  /* 점검대상 자동 선택: 인원이 있는 파트만 (수동 추가 가능 — 0709 회의)
     resumeall이면 작성중 공정을 함께 선택 [052] */
  useEffect(() => {
    if (!ledger) return
    const e: Record<string, boolean> = {}
    for (const d of PARTDEF) {
      e[d.label] = partParam
        ? d.key === partParam
        : editIds.length
          ? resumeParts.includes(d.key) // 수정 모드: 해당 점검표에 포함된 공정만 선택 [068]
          : (counts[d.key] ?? 0) > 0 || (resumeAll && resumeParts.includes(d.key))
    }
    setEnabled(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, ledger, resumeParts])

  /* 자동 해당없음 */
  const { ex } = useMemo(() => autoExcl(feat, counts), [feat, counts]) // reasons는 [072]에서 배너 상세 제거로 미사용
  const totalExcl = useMemo(() => Object.values(ex).reduce((a, o) => a + Object.keys(o).length, 0), [ex])

  const activeDefs = PARTDEF.filter((d) => d.q && enabled[d.label])

  function effAnswer(label: string, no: number): Ans | undefined {
    const v = answers[`${label}-${no}`]
    if (v === null) return undefined // 명시적 해제 — 자동 해당없음도 무시 [048]
    return v ?? (ex[label]?.[no] ? '해당없음' : undefined)
  }
  function carriedFor(code: string): string {
    const cv = CARRY_VALUE[code]
    return cv ? prevVals[code] || cv.v : ''
  }
  // [047] 지난 점검값을 미리 채우지 않음 — 추천 버튼으로 직접 선택(재클릭 시 해제)
  function effRemark(code: string): string {
    return remarks[code] ?? ''
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
  // 학교 이메일 — 대장 응답에 없으면 학교 목록에서 폴백 [062]
  const schoolMail = ledger?.school.email || schools.find((s) => s.id === sid)?.email || ''
  const mailSteps = approval.length
    ? approval.map((s) => (s.name ? `${s.title} ${s.name}` : s.title))
    : ['업무담당', '행정실장', '교장']
  const photoNames = PARTDEF.filter((d) => enabled[d.label]).flatMap((d) =>
    (photos[d.label] ?? []).filter((s) => s.name).map((s) => s.name),
  )
  const mailSubject = `[한국산업안전협회] ${schoolName} 종사자 안전·보건 점검표 송부 (${inspectDate})`
  const mailText = useMemo(() => {
    const lines = [
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

  /* 수신된 주서명 이미지 경로 — 현장앱 제출분의 첫 image_ref (표시 + 메일 PDF) [서명·사진 출력 수정] */
  const mainRecvSigRef = useMemo(
    () => Object.values(recvSigs).flat().map((s) => s.image_ref || '').find(Boolean) || '',
    [recvSigs],
  )

  /* [062] 메일 첨부 PDF용 — 현재 입력 상태를 양식 데이터(SheetData)로 조립 */
  function buildSheet(): SheetData {
    return {
      schoolName,
      date: inspectDate,
      approval: approval.length ? approval : undefined, // [104] 대장 결재선 → 메일 PDF 결재란
      parts: activeDefs.map((d) => ({
        part: d.key,
        items: d.q!.map((question, i) => {
          const code = `${d.label}-${i + 1}`
          const a = effAnswer(d.label, i + 1)
          const exl = ex[d.label] || {}
          const remark = exl[i + 1] && answers[code] === undefined ? `자동 해당없음 — ${exl[i + 1]}` : effRemark(code)
          return { code, label: question.split('||')[0], result: a ? RES_API[a] : null, remark }
        }),
        // 수신된 서명(이미지 경로 포함)이 있으면 그대로 — 없으면 웹 입력 서명 [서명·사진 출력 수정]
        signatures: recvSigs[d.key]?.length
          ? recvSigs[d.key]
          : signed && signerName.trim() ? [{ signer: signerName.trim(), signed_at: today }] : [],
      })),
      extra: {
        ids: [],
        info: {
          org: '(주)한국산업안전협회', dept: '(주)한국산업안전협회', role: '대표', writer: '(주)한국산업안전협회',
          writeDate: today, inspectDate, place, accType,
        },
        targets: PARTDEF.filter((d) => enabled[d.label]).map((d) => d.key),
        etc,
        photos,
        signer: signed ? signerName.trim() : '',
        approval_lines: recvLines.length ? recvLines : undefined, // 현장앱 결재선 서명 → 메일 PDF에도 출력
      },
    }
  }

  /* ===================== 제출: POST /inspections → 항목 결과 → sign → submit (파트당 1건) ===================== */
  function setStatus(label: string, st: PartStatus['st'], note: string) {
    setStatuses((p) => ({ ...p, [label]: { st, note } }))
  }

  /* [057] 부가정보 저장 — 기본정보·점검대상·기타의견·사진대지·확인자를 점검표 단위로 함께 보존 (양식 보기용)
     [G-6] strokesRef: 이번 서명에서 백엔드가 저장한 스트로크 JSON 참조 — 없으면 기존 항목 값 보존
     (백엔드 sign이 이미 기록한 sign_strokes_ref를 웹 재저장이 덮어쓰며 지우지 않게). */
  async function saveExtras(ids: string[], strokesRef = '') {
    if (ids.length === 0) return
    try {
      const cur = await api<{ doc: Record<string, InspExtra[]> }>('/ops/docs/inspection-extras').catch(() => ({ doc: {} as Record<string, InspExtra[]> }))
      const doc = cur.doc && typeof cur.doc === 'object' ? cur.doc : {}
      const list = Array.isArray(doc[sid]) ? doc[sid] : []
      const idx = list.findIndex((e) => Array.isArray(e.ids) && e.ids.some((id) => ids.includes(id)))
      const keepStrokesRef = strokesRef || (idx >= 0 ? list[idx].sign_strokes_ref || '' : '')
      const entry: InspExtra = {
        ids,
        info: {
          org: '(주)한국산업안전협회', dept: '(주)한국산업안전협회', role: '대표', writer: '(주)한국산업안전협회',
          writeDate: today, inspectDate, place, accType,
        },
        targets: PARTDEF.filter((d) => enabled[d.label]).map((d) => d.key),
        etc,
        photos,
        signer: signed ? signerName.trim() : '',
        // 현장앱 결재선(서명 이미지 경로) 보존 — 웹에서 재저장해도 수신 서명이 유실되지 않게 [서명·사진 출력 수정]
        ...(recvLines.length ? { approval_lines: recvLines } : {}),
        // 서명 원본 스트로크 참조 보존/기록 — 교육청 봇이 웹 서명도 획 재생 [G-6]
        ...(keepStrokesRef ? { sign_strokes_ref: keepStrokesRef } : {}),
      }
      if (idx >= 0) list[idx] = entry
      else list.push(entry)
      doc[sid] = list
      await api('/ops/docs/inspection-extras', { method: 'PUT', body: JSON.stringify({ doc }) })
    } catch { /* 부가정보 저장 실패는 본 저장을 막지 않음 */ }
  }

  /* [047] 임시저장 — 서명·제출 없이 지금까지의 입력을 '작성중' 점검으로 저장 (점검 현황 → 이어서 작성으로 재개) */
  async function saveDraft() {
    if (!ledger || busy) return
    if (!activeDefs.length) { setSubmitErr('점검대상 파트가 없습니다. 점검대상을 선택하세요.'); return }
    setBusy(true)
    setSubmitErr('')
    setDraftNote('')
    const usedIds: string[] = []
    try {
      for (const d of activeDefs) {
        const q = d.q!
        const exl = ex[d.label] || {}
        const items = q.map((question, i) => ({ code: `${d.label}-${i + 1}`, label: question.split('||')[0] }))
        const existingId = resumeId && d.key === partParam ? resumeId : draftIds[d.label]
        const created = existingId
          ? { id: existingId }
          : await api<{ id: string }>('/inspections', {
            method: 'POST',
            body: JSON.stringify({ school_id: sid, part: d.key, is_private_school: ledger.school.is_private, items }),
          })
        if (!existingId) setDraftIds((p) => ({ ...p, [d.label]: created.id }))
        usedIds.push(created.id)
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
        }
        setStatus(d.label, 'done', `임시저장 ${done}건 (작성중)`)
      }
      await saveExtras(usedIds) // 기타의견·사진대지 등 부가정보 함께 저장 [057]
      setDraftNote('임시저장 완료 — 안전점검 탭의 점검 현황에서 [이어서 작성]으로 다시 열 수 있습니다.')
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : '임시저장에 실패했습니다.')
    }
    setBusy(false)
  }

  async function submitAll() {
    if (!ledger || busy) return
    if (!activeDefs.length) {
      setSubmitErr('점검대상 파트가 없습니다. 점검대상을 선택하세요.')
      setProg({ done: 0, total: 0, label: '', phase: 'err', msg: '점검대상 파트가 없습니다 — 점검대상을 먼저 선택하세요' })
      return
    }
    if (!signerName.trim() || !signed) {
      setSubmitErr('확인자(담당자) 성명을 입력하고 서명해 주세요.')
      setProg({ done: 0, total: 0, label: '', phase: 'err', msg: '확인자(담당자) 성명 입력 + 서명 후 업로드하세요' })
      return
    }
    setBusy(true)
    setSubmitErr('')
    setDraftNote('')
    setProg({ done: 0, total: activeDefs.length, label: '', phase: 'run', msg: '전송을 준비합니다…' })
    let okAll = true
    const usedIds: string[] = []
    let strokesRefOut = '' // [G-6] 백엔드가 저장한 서명 스트로크 참조 — saveExtras에 보존 전달
    for (const d of activeDefs) {
      const q = d.q!
      const exl = ex[d.label] || {}
      try {
        setProg((p) => (p ? { ...p, label: d.name, msg: '점검 생성 · 결과 기록 · 서명' } : p))
        setStatus(d.label, 'run', '점검 생성')
        const items = q.map((question, i) => ({ code: `${d.label}-${i + 1}`, label: question.split('||')[0] }))
        // 이어서 작성/임시저장분이 있으면 그 점검에 이어서 기록, 아니면 새로 생성
        const existingId = resumeId && d.key === partParam ? resumeId : draftIds[d.label]
        const created = existingId
          ? { id: existingId }
          : await api<{ id: string }>('/inspections', {
            method: 'POST',
            body: JSON.stringify({
              school_id: sid,
              part: d.key,
              is_private_school: ledger.school.is_private,
              items,
            }),
          })
        if (!existingId) setDraftIds((p) => ({ ...p, [d.label]: created.id }))
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
        if (eduSuccessIds.includes(created.id)) {
          // 이미 교육청 전송완료(success)된 점검의 수정 — 재서명·재제출을 건너뛰어
          // 상태(submitted)·전송상태(success)·기존 서명을 보존하고 항목만 갱신한다.
          // 재전송 여부는 저장 완료 후 확인창에서 명시적으로 결정(request-eduoffice) [F-2].
          usedIds.push(created.id)
          setStatus(d.label, 'done', '수정 저장 완료 (교육청 전송완료 건)')
        } else {
          setStatus(d.label, 'run', '서명')
          // [G-6] 서명패드로 그린 서명이 있으면 PNG(b64)+스트로크를 함께 전송 —
          // 백엔드가 앱(field/sync)과 같은 규약으로 저장(sign_<iid>.png / .strokes.json).
          // 이름만 서명(그림 없음)은 기존 그대로 image_ref '' 텍스트 서명.
          const signRes = await api<{ status: string; image_ref?: string; sign_strokes_ref?: string }>(`/inspections/${created.id}/sign`, {
            method: 'POST',
            body: JSON.stringify({
              signer: signerName.trim(),
              image_ref: '',
              ...(signImage ? { sign_image_b64: signImage.split(',')[1] || '' } : {}),
              ...(signStrokes ? { sign_strokes: signStrokes } : {}),
            }),
          })
          if (signRes.sign_strokes_ref) strokesRefOut = signRes.sign_strokes_ref
          const sub = await api<{ status: string; eduoffice: string | null }>(`/inspections/${created.id}/submit`, { method: 'POST' })
          usedIds.push(created.id)
          setStatus(d.label, 'done', sub.eduoffice === 'pending' ? '제출 완료 · 교육청 전송 대기' : '제출 완료')
        }
      } catch (e) {
        okAll = false
        setStatus(d.label, 'err', e instanceof Error ? e.message : '제출 실패')
      }
      setProg((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    await saveExtras(usedIds, strokesRefOut) // 기타의견·사진대지·확인자 등 부가정보 함께 저장 [057]
    setBusy(false)
    if (okAll) {
      // 전송완료(success) 건이 포함된 수정 저장 — 교육청 재전송(기존 건 수정) 여부 확인 [F-2]
      const affected = usedIds.filter((id) => eduSuccessIds.includes(id))
      let resent = false
      if (affected.length && window.confirm('이미 교육청에 전송된 점검입니다. 수정 내용을 교육청에 재전송(기존 건 수정)할까요?')) {
        try {
          for (const id of affected) {
            await api(`/inspections/${id}/request-eduoffice`, { method: 'POST' })
          }
          resent = true
          setDraftNote('재전송 대기 등록 — 봇이 기존 교육청 건을 수정합니다')
        } catch (e) {
          setSubmitErr(e instanceof Error ? `재전송 등록 실패: ${e.message}` : '재전송 등록에 실패했습니다. 점검 현황 상세에서 [교육청 재전송(수정)]으로 다시 시도하세요.')
        }
      }
      setProg((p) => (p ? {
        ...p,
        phase: 'done',
        msg: affected.length
          ? (resent ? '수정 저장 + 교육청 재전송 대기 등록 완료' : '수정 저장 완료 (교육청 재전송 안 함)')
          : '전남교육청 전송 대기 등록 완료',
      } : p))
      setDoneAll(true)
      setPdfIds(usedIds) // 제출 완료 → [PDF 변환] 활성(백엔드 아카이브 report.pdf)
      window.setTimeout(() => { setProg(null); setMailOpen(true) }, 1400) // 완료 잠깐 보여주고 자동 사라짐 → 메일창
    } else {
      setProg((p) => (p ? { ...p, phase: 'err', msg: '일부 파트 전송 실패 — 상태 확인 후 다시 시도하세요' } : p))
      setSubmitErr('일부 파트 제출에 실패했습니다. 상태를 확인하세요.')
    }
  }

  // [비고 연속성] 선택한 과거 방문의 비고를 현재 폼에 적용 — 기본은 빈 칸만 채움.
  function applyPastRemarks() {
    const v = pastVisits[histPick]
    if (!v) return
    const next = { ...remarks }
    let applied = 0
    for (const [code, rem] of Object.entries(v.remarks)) {
      if (!histOverwrite && (next[code] ?? '').toString().trim()) continue
      if (next[code] !== rem) { next[code] = rem; applied++ }
    }
    setRemarks(next)
    setHistOpen(false)
    setSubmitErr('')
    setDraftNote(`지난 비고 불러옴 — ${v.date} 방문 기준 ${applied}칸 적용${histOverwrite ? ' (기존 입력 덮어씀)' : ' (빈 칸만 채움)'}`)
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
        <button className="btn btn-ghost" disabled={busy || !ledger} onClick={() => { void saveDraft() }}>임시저장</button>
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
          {/* [072] 자동 해당없음 상세(사유별 항목 나열)는 배너에서 제거 — 요약 문구만 표시. 사유는 각 항목 행의 비고에서 확인 가능 */}
          {!totalExcl && (
            <div className="insf-auto-d">
              {featMissing
                ? '학교 특징 정보가 아직 저장되지 않아 자동 해당없음 규칙이 적용되지 않습니다. 학교 카드에서 특징을 저장하면 반영됩니다.'
                : `${schoolName || '이 학교'}은 점검표의 모든 설비·시설을 보유하고 있어 전 항목이 점검 대상입니다.`}
            </div>
          )}
        </div>
        {sid && <Link className="insf-auto-go" to={`/schools/${sid}`}>대장 →</Link>}
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
          <div className="r" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>종사자 현황에 따라 자동 선택 · 없는 파트도 추가할 수 있습니다</span>
            {pastVisits.length > 0 && (
              <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 12 }}
                title="이 학교의 과거 점검 비고를 골라서 현재 폼에 채웁니다"
                onClick={() => { setHistPick(0); setHistOverwrite(false); setHistOpen(true) }}>
                🕘 지난 비고 불러오기 ({pastVisits.length}회)
              </button>
            )}
          </div>
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
                  {d.name}
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
                  const sugg = REMARK_SUGGEST[code] // 비고 추천문구 원탭 칩(시설-5·6 승강기) — 결과값은 그대로
                  // 같은 버튼 재클릭 시 선택 해제 [047] — 자동 해당없음 항목은 null(명시적 해제)로 빈 상태 유지 [048]
                  const toggle = (v: Ans) => setAnswers((p) => {
                    const next = { ...p }
                    if (a === v) {
                      if (why) next[code] = null // 자동값 있는 항목: 해제 상태를 명시적으로 기억
                      else delete next[code]
                    } else next[code] = v
                    return next
                  })
                  return (
                    <tr key={code} className={(isAuto ? 'insf-auto' : '') + (a === '미흡' ? ' insf-bad' : '')} >
                      <td className="q">
                        <span className="insf-no">{String(no).padStart(2, '0')}</span>{main}
                        {sub && <span className="insf-subq">{sub}</span>}
                        {/* 자동 해당없음 대상 항목은 수동 선택·해제 후에도 안내 유지 [049] */}
                        {why && <span className="insf-autotag">자동 해당없음 · {why}</span>}
                      </td>
                      <td className="c"><input type="radio" name={code} checked={a === '양호'} onChange={() => {}} onClick={() => toggle('양호')} /></td>
                      <td className="c"><input type="radio" name={code} checked={a === '미흡'} onChange={() => {}} onClick={() => toggle('미흡')} /></td>
                      <td className="c"><input type="radio" name={code} checked={a === '해당없음'} onChange={() => {}} onClick={() => toggle('해당없음')} /></td>
                      <td className="insf-memo">
                        {cv ? (
                          <>
                            <input value={remark} placeholder="보완계획"
                              onChange={(e) => setRemarks((p) => ({ ...p, [code]: e.target.value }))} />
                            <span className="insf-carrytag" title={`지난 점검값 ${carried}${prevVals[code] ? ' (기록)' : ' (기본)'}`}>추천</span>
                            <div className="insf-sugg">
                              {cv.opts.map((o) => (
                                <button key={o} type="button" className={'insf-sg' + (o === remark ? ' on' : '')}
                                  onClick={() => setRemarks((p) => ({ ...p, [code]: p[code] === o ? '' : o }))}>{o}</button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <input placeholder="보완계획" value={remarks[code] ?? ''} onChange={(e) => setRemarks((p) => ({ ...p, [code]: e.target.value }))} />
                            {/* 비고 추천문구 칩 — 결과값(양호/미흡/해당없음)은 건드리지 않고 비고칸만 원탭 입력·재탭 해제 [테스터 요청 #5] */}
                            {sugg && (
                              <>
                                <span className="insf-carrytag" title="비고 추천문구 — 탭하면 비고칸에 채워집니다">추천</span>
                                <div className="insf-sugg">
                                  {sugg.map((o) => (
                                    <button key={o} type="button" className={'insf-sg' + (o === remark ? ' on' : '')}
                                      onClick={() => setRemarks((p) => ({ ...p, [code]: p[code] === o ? '' : o }))}>{o}</button>
                                  ))}
                                </div>
                              </>
                            )}
                          </>
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
        {/* 선택 공정 + (앱 수신 등으로) 사진이 실려 있는 공정 — 라벨이 달라도 사진이 숨지 않게 [서명·사진 출력 수정] */}
        {PARTDEF.filter((d) => enabled[d.label] || (photos[d.label] ?? []).some((s) => s.dataUrl || s.name || s.caption)).map((d) => {
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
                    {/* 업로드됨: 클릭=다운로드(교체·삭제는 우상단 버튼) · 빈칸: 클릭=업로드 [H-1] */}
                    {s.dataUrl ? (
                      <div className="insf-ph" style={{ position: 'relative', cursor: 'pointer' }}
                        title="클릭하면 사진을 다운로드합니다"
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href = s.dataUrl
                          a.download = s.name || `${d.name}_사진${String(i + 1).padStart(2, '0')}.jpg`
                          a.click()
                        }}>
                        <img src={s.dataUrl} alt={s.name} />
                        <span style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}
                          onClick={(e) => e.stopPropagation()}>
                          <label title="사진 교체" style={{ cursor: 'pointer', background: 'rgba(22,22,42,.62)', color: '#fff', borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>
                            교체
                            <input type="file" accept="image/*" hidden onChange={(e) => onPickPhoto(d.label, i, e)} />
                          </label>
                          <button type="button" title="사진 삭제"
                            style={{ cursor: 'pointer', background: 'rgba(192,57,43,.85)', color: '#fff', border: 'none', borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                            onClick={() => patchSlot(d.label, i, { dataUrl: '', name: '' })}>
                            ✕
                          </button>
                        </span>
                      </div>
                    ) : (
                      <label className="insf-ph">
                        {'+ 사진 추가'}
                        <input type="file" accept="image/*" hidden onChange={(e) => onPickPhoto(d.label, i, e)} />
                      </label>
                    )}
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
              onChange={(e) => { setSignerName(e.target.value); setSigned(false); setSignImage(''); setSignStrokes(null) }} />
          </label>
          <label className="field">
            <span>서명</span>
            {/* [G-6] 클릭 → 서명패드(직접 그리기). 그린 서명은 썸네일로 표시, 이름만 서명도 패드에서 선택 가능 */}
            <div
              className={'insf-signbox' + (signed ? ' signed' : '')}
              onClick={() => {
                if (!signerName.trim()) { setSubmitErr('담당자 성명을 먼저 입력하세요.'); return }
                setSubmitErr('')
                setPadOpen(true)
              }}
              title={signed ? '클릭하면 다시 서명합니다' : '클릭하여 서명패드 열기'}
            >
              {signImage
                ? <img src={signImage} alt="서명" style={{ maxHeight: 40, maxWidth: 170, objectFit: 'contain', verticalAlign: 'middle' }} />
                : signed ? `${signerName.trim()} ✓` : '클릭하여 서명하기'}
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {signed
                ? (signImage ? '손글씨 서명 완료 — 클릭하면 다시 그립니다' : '이름 서명 완료 — 클릭하면 손글씨로 서명할 수 있습니다')
                : '서명패드에서 직접 그리거나, 이름만으로도 서명할 수 있습니다'}
            </span>
          </label>
        </div>
        {/* 수신된 서명 — 현장앱이 제출한 손글씨 서명(주서명·결재선)을 그대로 표시 [서명·사진 출력 수정] */}
        {(mainRecvSigRef || recvLines.length > 0) && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line-2, #eee)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>수신된 서명 <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>현장앱 제출분 — 저장 시 그대로 유지됩니다</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
              {mainRecvSigRef && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <SignImage refPath={mainRecvSigRef} />
                  <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>확인자(담당자){signerName ? ` · ${signerName}` : ''}</span>
                </div>
              )}
              {recvLines.map((ln, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  {ln.image_ref
                    ? <SignImage refPath={ln.image_ref} />
                    : <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>{ln.signer ? '(서명)' : '(미서명)'}</span>}
                  <span style={{ fontSize: 12, color: 'var(--muted, #888)' }}>{ln.title || ln.signer || '확인자'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* [G-6] 서명패드 모달 — 마우스/터치로 서명 그리기 → 적용 시 PNG+스트로크 보관(저장 시 전송) */}
      {padOpen && (
        <SignaturePadModal
          signer={signerName.trim()}
          onApply={(png, strokes) => { setSignImage(png); setSignStrokes(strokes); setSigned(true); setPadOpen(false) }}
          onNameOnly={() => { setSignImage(''); setSignStrokes(null); setSigned(true); setPadOpen(false) }}
          onClose={() => setPadOpen(false)}
        />
      )}

      {/* [062] 학교 메일 전송 모달 — 점검표 PDF 자동 첨부 + 학교 이메일 자동 입력 */}
      {mailOpen && (
        <InspectionMailModal
          sheet={buildSheet()}
          to={schoolMail}
          subject={mailSubject}
          body={mailText}
          onClose={() => setMailOpen(false)}
        />
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
          {draftNote && !submitErr && (
            <div className="insf-msg" style={{ color: 'var(--ok-ink)', fontWeight: 700, marginTop: 4 }}>{draftNote}</div>
          )}
          {(submitErr || doneAll) && (
            <div className={doneAll && !submitErr ? 'insf-msg' : 'insf-err'} style={doneAll && !submitErr ? { color: 'var(--ok-ink)', fontWeight: 700, marginTop: 4 } : undefined}>
              {submitErr || '전 파트 제출 완료 — [✉ 메일] 버튼으로 점검표 PDF를 학교에 송부하세요.'}
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
          <button className="btn" disabled={!ledger} onClick={() => setMailOpen(true)}>✉ 메일</button>
          <button className="btn" disabled={!pdfTargetId || pdfBusy}
            title={pdfTargetId ? '완성된 안전점검표 PDF(결재란·항목·사진대지·서명 포함) 다운로드' : 'PDF 변환은 제출 후 가능합니다'}
            onClick={() => void downloadFormPdf()}>
            {pdfBusy ? 'PDF 생성 중…' : '▤ PDF 변환'}
          </button>
          {/* 임시저장 버튼은 상단 헤더에만 — 하단 중복 버튼 제거 [061] */}
          {/* 업로드 버튼 자체가 진행형 — 게이지·성공·실패를 버튼에 내장(팝업 제거) [G-8 웹] */}
          {(() => {
            const phase = prog?.phase
            const pct = prog ? (phase === 'done' ? 100 : Math.round((prog.done / Math.max(1, prog.total)) * 100)) : 0
            const isRun = phase === 'run'
            const isDone = phase === 'done'
            const isErr = phase === 'err'
            return (
              <button
                className="btn btn-primary"
                disabled={(!isErr && busy) || !ledger}
                onClick={isErr ? () => setProg(null) : submitAll}
                title={isErr ? (prog?.msg || '실패 — 눌러서 초기화 후 다시 시도') : isRun ? prog?.msg : undefined}
                style={{
                  position: 'relative', overflow: 'hidden', minWidth: 168,
                  ...(isDone ? { background: 'var(--ok-ink,#1b7a44)', borderColor: 'var(--ok-ink,#1b7a44)' } : {}),
                  ...(isErr ? { background: 'var(--red-ink,#c0392b)', borderColor: 'var(--red-ink,#c0392b)' } : {}),
                }}>
                <style>{`@keyframes uplspin{to{transform:rotate(360deg)}}`}</style>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, position: 'relative', zIndex: 1 }}>
                  {isRun && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ animation: 'uplspin 1s linear infinite', flex: 'none' }}><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
                  )}
                  {isDone && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                  {isErr && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flex: 'none' }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                  )}
                  {isRun ? `업로드 중 ${prog!.done}/${prog!.total}${prog!.label ? ` · ${prog!.label}` : ''}`
                    : isDone ? '전송 대기 등록 완료'
                    : isErr ? '실패 · 다시 시도'
                    : '전남교육청 업로드'}
                </span>
                {isRun && (
                  <span style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${pct}%`, background: 'rgba(255,255,255,.85)', borderRadius: 99, transition: 'width .35s ease', zIndex: 0 }} />
                )}
              </button>
            )
          })()}
        </div>
      </div>

      {/* [비고 연속성] 지난 비고 불러오기 — 방문(날짜) 선택 + 빈 칸만/덮어쓰기 */}
      {histOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'grid', placeItems: 'center', background: 'rgba(22,22,42,.34)', backdropFilter: 'blur(2px)' }}
          onClick={() => setHistOpen(false)}>
          <div style={{ width: 460, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto', background: 'var(--card,#fff)', borderRadius: 16, boxShadow: '0 24px 64px rgba(22,22,42,.30)', padding: '20px 22px' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 4 }}>🕘 지난 비고 불러오기</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              이 학교의 과거 점검에서 비고(보완계획)를 가져와 현재 폼에 채웁니다. 어느 방문까지 거슬러 갈지 선택하세요.
            </div>
            {pastVisits.map((v, i) => (
              <label key={v.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid ' + (i === histPick ? 'var(--violet,#7C5CFB)' : 'var(--line,#e7e9f2)'),
                background: i === histPick ? 'var(--violet-soft,#efeaff)' : 'transparent', marginBottom: 6 }}>
                <input type="radio" name="histpick" checked={i === histPick} onChange={() => setHistPick(i)} style={{ accentColor: 'var(--violet)' }} />
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{v.date}</b>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                    {v.parts.map((p) => PARTDEF.find((d) => d.label === p || d.key === p)?.name ?? p).join(' · ')}
                  </span>
                </div>
                <span className="pillx doing" style={{ flex: 'none' }}>비고 {v.count}칸</span>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, margin: '10px 2px 14px' }}>
              <input type="checkbox" checked={histOverwrite} onChange={(e) => setHistOverwrite(e.target.checked)} style={{ accentColor: 'var(--violet)' }} />
              이미 입력한 비고도 덮어쓰기 <span className="muted">(기본: 빈 칸만 채움)</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setHistOpen(false)}>취소</button>
              <button className="btn btn-primary" onClick={applyPastRemarks}>불러오기</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
