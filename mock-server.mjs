// ============================================================================
// web-hq 가짜 백엔드 (mock server) — 디자인 작업용
//
// 실행:  node mock-server.mjs      (Node 18+ · 의존성 없음)
// 포트:  3001 (vite.config.ts proxy가 이 포트로 /api 요청을 넘김)
//
// - 로그인: 아무 테넌트/아이디/비밀번호나 입력해도 통과
// - 데이터는 전부 메모리 → 서버 재시작하면 초기 샘플로 리셋
// - 프론트 소스(api.ts, auth.tsx, vite proxy)는 전혀 건드리지 않음
// ============================================================================
import http from 'node:http'
import crypto from 'node:crypto'
import { REAL_SCHOOLS } from './mock-schools.mjs'

const PORT = 3001
const uid = () => crypto.randomBytes(6).toString('hex')

// ---- 날짜 헬퍼: 오늘 기준 상대 날짜로 데이터가 항상 "살아있게" ----
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString()

// ============================================================================
// 샘플 데이터
// ============================================================================
const PARTS = ['catering', 'facility', 'cleaning', 'commute', 'night_duty']

const schools = [
  { id: 's01', name: '한빛초등학교', school_level: '초', manager: '김소현', principal: '박교장', supervisor: '이감독', address: '서울시 강남구 한빛로 12', email: 'hanbit@sen.go.kr', is_private: false, education_count: 6, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'admin' },
  { id: 's02', name: '푸른중학교', school_level: '중', manager: '이재훤', principal: '최교장', supervisor: '정감독', address: '서울시 서초구 푸른길 45', email: 'pureun@sen.go.kr', is_private: false, education_count: 8, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp01' },
  { id: 's03', name: '세종고등학교', school_level: '고', manager: '정원형', principal: '김교장', supervisor: '오감독', address: '서울시 송파구 세종대로 8', email: 'sejong@sen.go.kr', is_private: true, education_count: 10, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp02' },
  { id: 's04', name: '샛별유치원', school_level: '유', manager: '이지현', principal: '한원장', supervisor: '', address: '서울시 강동구 샛별길 3', email: 'satbyul@sen.go.kr', is_private: true, education_count: 3, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'admin' },
  { id: 's05', name: '동산초등학교', school_level: '초', manager: '이숙현', principal: '유교장', supervisor: '문감독', address: '경기도 성남시 동산로 77', email: 'dongsan@goe.go.kr', is_private: false, education_count: 5, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp03' },
  { id: 's06', name: '해솔중학교', school_level: '중', manager: '신하정', principal: '임교장', supervisor: '서감독', address: '경기도 고양시 해솔길 21', email: 'haesol@goe.go.kr', is_private: false, education_count: 7, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'admin' },
  { id: 's07', name: '미래공업고등학교', school_level: '고', manager: '송연섭', principal: '장교장', supervisor: '권감독', address: '인천시 남동구 미래로 102', email: 'mirae@ice.go.kr', is_private: false, education_count: 12, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp01' },
  { id: 's08', name: '가온초등학교', school_level: '초', manager: '박건민', principal: '신교장', supervisor: '홍감독', address: '서울시 마포구 가온길 55', email: 'gaon@sen.go.kr', is_private: false, education_count: 6, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp02' },
  { id: 's09', name: '늘봄여자중학교', school_level: '중', manager: '오은서', principal: '조교장', supervisor: '배감독', address: '서울시 은평구 늘봄로 9', email: 'neulbom@sen.go.kr', is_private: true, education_count: 8, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp03' },
  { id: 's10', name: '한마음고등학교', school_level: '고', manager: '이경록', principal: '윤교장', supervisor: '남감독', address: '경기도 부천시 한마음로 31', email: 'hanmaum@goe.go.kr', is_private: false, education_count: 9, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'admin' },
  { id: 's11', name: '초록유치원', school_level: '유', manager: '박영진', principal: '강원장', supervisor: '', address: '서울시 노원구 초록길 17', email: 'chorok@sen.go.kr', is_private: true, education_count: 2, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'insp02' },
  { id: 's12', name: '바다초등학교', school_level: '초', manager: '김주향', principal: '전교장', supervisor: '심감독', address: '인천시 연수구 바다로 88', email: 'bada@ice.go.kr', is_private: false, education_count: 5, inspection_agency: '한국산업안전협회', assigned_inspector_id: 'admin' },
]

// 학교별 종사자 구성(대장) — 일부 학교는 인원대조 불일치(headcount_mismatch)
function makeWorkers(counts) {
  return PARTS.map((part, i) => ({ id: uid(), part, count: counts[i] ?? 0, contact: '010-1234-56' + pad(i), is_nutrition_teacher: part === 'catering' && i === 0 }))
    .filter((w) => w.count > 0)
}
const LEDGER_BASE = {
  s01: [3, 1, 1, 2, 1], s02: [5, 2, 2, 0, 1], s03: [7, 2, 3, 0, 2], s04: [2, 0, 1, 1, 0],
  s05: [2, 1, 1, 1, 1], s06: [4, 1, 2, 0, 1], s07: [6, 3, 2, 0, 2], s08: [3, 1, 1, 1, 1],
  s09: [4, 1, 2, 0, 1], s10: [5, 2, 2, 0, 2], s11: [1, 0, 1, 1, 0], s12: [2, 1, 1, 1, 1],
}
const MISMATCH = new Set(['s02', 's09'])
const ledgers = {}
for (const s of schools) {
  const workers = makeWorkers(LEDGER_BASE[s.id])
  ledgers[s.id] = {
    school: { id: s.id, name: s.name, is_private: s.is_private, education_count: s.education_count, special_notes: s.id === 's07' ? '실습실 위험설비 다수 · 통학차량 1대' : '', address: s.address },
    workers,
    worker_total: workers.reduce((a, w) => a + w.count, 0),
    education_count: s.education_count,
    headcount_mismatch: MISMATCH.has(s.id),
    msds: s.id === 's01' || s.id === 's03' ? [{ id: uid(), area: '급식실', substances: ['차아염소산나트륨', '세척제A'] }, { id: uid(), area: '시설창고', substances: ['방청유'] }] : [],
    accidents: s.id === 's01' ? [{ id: uid(), date: daysAgo(40), description: '급식실 화상 사고', part: 'catering' }] : [],
    histories: [{ id: uid(), month: daysAgo(30).slice(0, 7), content: '정기 방문 점검', memo: '' }],
  }
}

// ---- 한국산업안전협회 계약 학교 771건 (mock-schools.mjs — 엑셀 원본) ----
// 데모 학교(s01~s12) 뒤에 추가. 대장(종사자) 데이터는 원본에 없어 빈 대장으로 시작.
for (const s of REAL_SCHOOLS) {
  schools.push(s)
  ledgers[s.id] = {
    school: { id: s.id, name: s.name, is_private: s.is_private, education_count: s.education_count, special_notes: '', address: s.address },
    workers: [],
    worker_total: 0,
    education_count: s.education_count,
    headcount_mismatch: false,
    msds: [],
    accidents: [],
    histories: [],
  }
}

// 5대 업무 이력
const inspections = [
  { id: 'i01', school_id: 's01', part: 'catering', status: 'submitted', eduoffice_submit_status: 'submitted', items: [{ code: 'GS-01', label: '가스밸브 잠금 상태', result: 'ok', remark: '', photos: [] }, { code: 'GS-02', label: '후드 청결 상태', result: 'fix', remark: '기름때 누적', photos: [] }], signatures: [{ signer: '김담당', signed_at: iso(9), image_ref: '' }], followups: [{ id: uid(), item_code: 'GS-02', description: '후드 청소 조치', status: 'open' }], signed_at: iso(9), submitted_at: iso(8) },
  { id: 'i02', school_id: 's01', part: 'facility', status: 'signed', eduoffice_submit_status: 'none', items: [{ code: 'SI-01', label: '사다리 상태 점검', result: 'ok', remark: '', photos: [] }], signatures: [{ signer: '김담당', signed_at: iso(2), image_ref: '' }], followups: [], signed_at: iso(2), submitted_at: null },
  { id: 'i03', school_id: 's02', part: 'catering', status: 'submitted', eduoffice_submit_status: 'submitted', items: [{ code: 'GS-01', label: '가스밸브 잠금 상태', result: 'ok', remark: '', photos: [] }], signatures: [{ signer: '이담당', signed_at: iso(35), image_ref: '' }], followups: [], signed_at: iso(35), submitted_at: iso(34) },
  { id: 'i04', school_id: 's03', part: 'cleaning', status: 'draft', eduoffice_submit_status: 'none', items: [], signatures: [], followups: [], signed_at: null, submitted_at: null },
  { id: 'i05', school_id: 's05', part: 'catering', status: 'submitted', eduoffice_submit_status: 'submitted', items: [], signatures: [{ signer: '이담당', signed_at: iso(15), image_ref: '' }], followups: [], signed_at: iso(15), submitted_at: iso(14) },
  { id: 'i06', school_id: 's07', part: 'facility', status: 'submitted', eduoffice_submit_status: 'submitted', items: [], signatures: [{ signer: '최담당', signed_at: iso(21), image_ref: '' }], followups: [], signed_at: iso(21), submitted_at: iso(20) },
  { id: 'i07', school_id: 's10', part: 'night_duty', status: 'signed', eduoffice_submit_status: 'none', items: [], signatures: [{ signer: '이담당', signed_at: iso(5), image_ref: '' }], followups: [], signed_at: iso(5), submitted_at: null },
]

const mkRiskItem = (i) => ({
  id: 'ri' + i, task_name: ['배식대 이동', '사다리 고소작업', '바닥 물청소', '중량물 운반'][i % 4],
  hazard_factor: ['미끄러짐', '떨어짐', '넘어짐', '요통'][i % 4], legal_basis: '산업안전보건기준에 관한 규칙 제3조',
  situation: '작업 중 위험 상황 관찰됨', likelihood: (i % 3) + 1, severity: (i % 3) + 2, risk_score: ((i % 3) + 1) * ((i % 3) + 2),
  is_unsafe: i % 3 === 0, unsafe_type: i % 3 === 0 ? '불안전한 상태' : null, measure: '보호구 착용 및 작업 전 점검',
})
const risks = [
  { id: 'r01', school_id: 's01', process: 'catering', status: 'completed', count: 4, unsafe_count: 2, created_at: iso(20), category: 'regular', accident_id: null, source: null, origin: null, items: [0, 1, 2, 3].map(mkRiskItem) },
  { id: 'r02', school_id: 's02', process: 'facility', status: 'in_progress', count: 3, unsafe_count: 1, created_at: iso(6), category: 'regular', accident_id: null, source: null, origin: null, items: [0, 1, 2].map(mkRiskItem) },
  { id: 'r03', school_id: 's03', process: 'cleaning', status: 'completed', count: 2, unsafe_count: 0, created_at: iso(45), category: 'regular', accident_id: null, source: null, origin: null, items: [1, 2].map(mkRiskItem) },
  { id: 'r04', school_id: 's07', process: 'facility', status: 'completed', count: 4, unsafe_count: 1, created_at: iso(12), category: 'regular', accident_id: null, source: null, origin: null, items: [0, 1, 2, 3].map(mkRiskItem) },
]

const compliances = [
  { id: 'c01', school_id: 's01', period: 'may', status: 'submitted', items: [{ code: 'CP-01', label: '안전보건 목표 수립', fulfilled: true, remark: '', auto: false }, { code: 'CP-02', label: '전담조직 구성', fulfilled: true, remark: '', auto: true }], snapshot: {}, created_at: iso(60) },
  { id: 'c02', school_id: 's02', period: 'may', status: 'draft', items: [{ code: 'CP-01', label: '안전보건 목표 수립', fulfilled: false, remark: '작성 중', auto: false }], snapshot: {}, created_at: iso(10) },
  { id: 'c03', school_id: 's07', period: 'may', status: 'submitted', items: [], snapshot: {}, created_at: iso(50) },
]

const musculos = [
  { id: 'm01', school_id: 's01', has_burden: true, basic_surveys: 8, sheets: 8, needs_review: 2, created_at: iso(25) },
  { id: 'm02', school_id: 's03', has_burden: true, basic_surveys: 14, sheets: 12, needs_review: 0, created_at: iso(90) },
  { id: 'm03', school_id: 's06', has_burden: false, basic_surveys: 8, sheets: 8, needs_review: 0, created_at: iso(70) },
]
const sheetsBySurvey = {
  m01: [
    { id: 'sh1', person_name: '조리1', image_ref: 'omr_001.jpg', confidence: 0.97, review_status: 'auto' },
    { id: 'sh2', person_name: '조리2', image_ref: 'omr_002.jpg', confidence: 0.71, review_status: 'needs_review' },
    { id: 'sh3', person_name: '미화1', image_ref: 'omr_003.jpg', confidence: 0.68, review_status: 'needs_review' },
    { id: 'sh4', person_name: '시설1', image_ref: 'omr_004.jpg', confidence: 0.99, review_status: 'confirmed' },
  ],
  m02: [{ id: 'sh5', person_name: '조리1', image_ref: 'omr_101.jpg', confidence: 0.95, review_status: 'confirmed' }],
  m03: [],
}

const eduBySchool = {}
for (const s of schools) {
  const total = ledgers[s.id].worker_total
  const completed = Math.max(0, Math.round(total * (0.4 + (s.id.charCodeAt(2) % 6) * 0.1)))
  eduBySchool[s.id] = {
    progress: { total, completed_count: Math.min(completed, total), avg_progress: Math.min(1, 0.35 + (s.id.charCodeAt(2) % 7) * 0.1) },
    sessions: s.id === 's01' || s.id === 's02' ? [
      { id: uid(), school_id: s.id, date: daysAgo(12), kind: '정기안전교육', accident_type: '넘어짐', headcount: 6, created_at: iso(12) },
      { id: uid(), school_id: s.id, date: daysAgo(42), kind: '채용시 안전교육', accident_type: '끼임', headcount: 2, created_at: iso(42) },
    ] : [],
    records: ledgers[s.id].workers.flatMap((w, i) => Array.from({ length: w.count }, (_, k) => ({
      id: uid(), person_name: `${{ catering: '조리', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직' }[w.part]}${k + 1}`,
      job: w.part, progress: Math.min(1, ((i + k) % 5) * 0.25), completed: ((i + k) % 5) * 0.25 >= 1,
    }))),
    supervisors: s.id === 's01' ? [{ id: uid(), date: daysAgo(30), name: '이감독', completed: true }] : [],
  }
}

const accidents = [
  { id: 'a01', school_id: 's01', school_name: '한빛초등학교', school_masked: 'H초등학교', kind: 'accident', date: daysAgo(40), summary: '급식실 화상 사고', detail: '배식 중 국솥 접촉으로 손목 화상(2도).', status: 'closed', files: [{ name: '산재조사표_0614.pdf' }], links: { risk_id: 'r01' }, created_at: iso(40) },
  { id: 'a02', school_id: 's09', school_name: '늘봄여자중학교', school_masked: 'N중학교', kind: 'disease', date: daysAgo(15), summary: '조리실무사 손목 통증(근골격계)', detail: '반복 세척 작업으로 인한 손목 통증 호소.', status: 'open', files: [], links: {}, created_at: iso(15) },
  { id: 'a03', school_id: 's07', school_name: '미래공업고등학교', school_masked: 'M고등학교', kind: 'accident', date: daysAgo(7), summary: '실습실 절단 사고(경미)', detail: '실습 준비 중 판재에 손가락 베임.', status: 'doing', files: [{ name: '현장사진_01.jpg' }], links: {}, created_at: iso(7) },
]

const notices = [
  { id: 'n01', title: '7월 정기 안전점검 일정 안내', body: '7월 마지막 주까지 전체 학교 정기점검을 완료해 주세요.', files: [], pinned: true, created_at: iso(3) },
  { id: 'n02', title: '근골격계 유해요인조사 OMR 제출 안내', body: '하반기 조사 대상 학교는 OMR 스캔본을 업로드해 주세요.', files: [{ name: 'OMR_양식.pdf' }], pinned: false, created_at: iso(9) },
  { id: 'n03', title: '중대재해 이행점검(상반기) 결과 송부', body: '상반기 이행점검 결과를 각 교육지원청에 송부했습니다.', files: [], pinned: false, created_at: iso(20) },
]

const visits = [
  { id: uid(), school_id: 's01', date: daysAgo(0), visitor: '김조사', purpose: '정기 점검' },
  { id: uid(), school_id: 's05', date: daysAgo(0), visitor: '박조사', purpose: '근골격계 조사' },
  { id: uid(), school_id: 's02', date: daysAgo(2), visitor: '김조사', purpose: '정기 점검' },
  { id: uid(), school_id: 's03', date: daysAgo(4), visitor: '이조사', purpose: '위험성평가' },
  { id: uid(), school_id: 's07', date: daysAgo(6), visitor: '박조사', purpose: '정기 점검' },
  { id: uid(), school_id: 's08', date: daysAgo(8), visitor: '김조사', purpose: '교육 지원' },
  { id: uid(), school_id: 's10', date: daysAgo(11), visitor: '이조사', purpose: '정기 점검' },
  { id: uid(), school_id: 's12', date: daysAgo(13), visitor: '박조사', purpose: '방문 상담' },
]

const complaints = [
  { id: uid(), school_id: 's02', date: daysAgo(5), content: '급식실 환기 불량 개선 요청', status: 'doing' },
  { id: uid(), school_id: 's06', date: daysAgo(12), content: '점검 일정 변경 요청', status: 'resolved' },
  { id: uid(), school_id: 's09', date: daysAgo(1), content: '조리실 바닥 미끄럼 민원', status: 'open' },
]

const users = [
  { id: 'u01', login_id: 'admin', name: '관리자', role: 'hq_admin', modules: [] },
  { id: 'u02', login_id: 'ceo', name: '대표', role: 'executive', modules: [] },
  { id: 'u03', login_id: 'insp01', name: '김조사', role: 'field_inspector', modules: ['inspection', 'risk'] },
  { id: 'u04', login_id: 'insp02', name: '이조사', role: 'field_inspector', modules: ['inspection', 'musculo'] },
  { id: 'u05', login_id: 'insp03', name: '박조사', role: 'field_inspector', modules: ['inspection'] },
]

const invoices = [
  { id: 'v01', school_id: 's01', business_reg_no: '123-45-67890', issue_date: daysAgo(20), amount: 550000, status: 'issued', ecount_ref: 'EC-2026-0101' },
  { id: 'v02', school_id: 's03', business_reg_no: '234-56-78901', issue_date: daysAgo(20), amount: 880000, status: 'issued', ecount_ref: 'EC-2026-0102' },
  { id: 'v03', school_id: 's09', business_reg_no: '345-67-89012', issue_date: daysAgo(3), amount: 660000, status: 'failed', ecount_ref: null },
]

const resources = [
  { id: 're1', title: '안전점검표 양식.hwp', category: '양식', size: '48 KB', date: daysAgo(30), content: '' },
  { id: 're2', title: '위험성평가 실시 지침(2026).pdf', category: '지침', size: '1.2 MB', date: daysAgo(25), content: '' },
  { id: 're3', title: '근골격계 부담작업 고시.pdf', category: '지침', size: '640 KB', date: daysAgo(18), content: '' },
  { id: 're4', title: '교육 이수증 증빙(샘플).pdf', category: '증빙', size: '210 KB', date: daysAgo(10), content: '' },
]

const mailInbox = Array.from({ length: 25 }, (_, i) => ({
  uid: 'mail-' + (100 - i),
  subject: ['[교육청] 안전점검 결과 회신', '세금계산서 발행 확인 요청', '근골격계 조사 일정 문의', '[협회] 7월 정기회의 안내', '방문 일정 조율 요청'][i % 5] + (i < 5 ? '' : ` (${i})`),
  sender: ['edu@sen.go.kr', 'bill@school.kr', 'manager@school.kr', 'hq@safety.or.kr', 'staff@school.kr'][i % 5],
  date: iso(i),
}))

// 서버 저장 문서(org_docs) · 설정류
// visit-plans: (26-07)월 점검계획표(담당자 김소현)의 주간 패턴을 이번 주 월요일 기준
// 3주에 배치해 홈 캘린더·오늘의 할 일·이번 주 방문 예정에 실제 담당 학교가 표시되게 함.
// 계획표의 사무실/순천/연차/제헌절 칸(학교 아님)은 제외. [027] 담당 학교 48교와 동일 목록.
const PLAN_WEEKS = [
  // 1주차 (계획표 7/6~7/10): 월~금
  [['r037', 'r048', 'r041'], ['r025', 'r026', 'r027', 'r028'], ['r051', 'r075', 'r063'], ['r053', 'r076', 'r029', 'r065'], ['r068', 'r067', 'r740', 'r040']],
  // 2주차 (7/13~7/17 — 금요일 제헌절 휴무)
  [['r073', 'r077', 'r058', 'r046'], ['r165', 'r164', 'r194', 'r195'], ['r093', 'r057', 'r066'], ['r190', 'r187', 'r189', 'r191'], []],
  // 3주차 (7/20~7/24)
  [['r094', 'r102', 'r104', 'r103'], ['r739', 'r035', 'r033'], ['r089'], ['r188', 'r192', 'r193', 'r769'], ['r039', 'r145', 'r143']],
]
const planSeed = {}
{
  const t = new Date()
  const monday = new Date(t)
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7)) // 이번 주 월요일 (일요일이면 지난 월요일)
  let pid = 0
  const nameById = (id) => schools.find((s) => s.id === id)?.name || id
  PLAN_WEEKS.forEach((week, w) =>
    week.forEach((day, d) => {
      if (day.length === 0) return
      const dt = new Date(monday)
      dt.setDate(monday.getDate() + w * 7 + d)
      planSeed[ymd(dt)] = day.map((id) => ({ id: 'kp' + ++pid, name: nameById(id), school_id: id }))
    }),
  )
}
const docs = {
  'visit-plans': planSeed,
}
const store = {
  mail: { address: 'hq@safety.or.kr', provider: 'naver', host: 'imap.naver.com', port: 993, has_password: true },
  billing: { com_code: '123456', user_id: 'safety_hq', api_cert_key: '', zone: 'CA', test_mode: true, default_issue_day: 25, memo: '' },
  feed: { endpoint: 'https://apis.data.go.kr/accident-feed', items_path: 'response.body.items', map: { date: 'occurDt', description: 'accSummary' }, has_service_key: true },
  approval: {}, features: {}, notes: {}, managerHistory: {},
  // risk survey by school — s01에는 작년(2025) 부서별 유해위험정보(dept_info_prev)를 시드 (프리필·변경비교 시연용)
  surveys: {
    s01: {
      // 작성 중 샘플 — 업무 탭 "작성된 보고서" 리스트 확인용 (④ 평가표 2행 작성 상태)
      assess: {
        catering: [
          { id: 'ar01', task: '국솥 조리 작업', factor_class: '화상', legal_basis: '', situation: '끓는 국물 튐으로 인한 화상', measure_current: '앞치마·장갑 착용', likelihood: 3, severity: 3, reduction: '국솥 주변 미끄럼방지 매트, 보호구 착용 점검', after_risk: '', plan_date: '', done_date: '', owner: '김담당' },
          { id: 'ar02', task: '식자재 운반', factor_class: '근골격계', legal_basis: '', situation: '무거운 식자재 반복 운반', measure_current: '2인 1조 운반', likelihood: 2, severity: 3, reduction: '운반 대차 사용', after_risk: '', plan_date: '', done_date: '', owner: '김담당' },
        ],
      },
      dept_info_prev: {
        catering: {
          equips: [{ name: '국솥(회전식)', qty: 2 }, { name: '오븐', qty: 1 }, { name: '식기세척기', qty: 1 }, { name: '야채절단기', qty: 1 }, { name: '튀김기', qty: 1 }],
          chems: [{ name: '차아염소산나트륨(락스)', handled: true }, { name: '세척제(주방용)', handled: true }, { name: '오븐클리너', handled: true }],
          etc: { acc3y_accident: 1, acc3y_other: 0, env_measure: false, permit: false, permit_types: [], contractor: false, contractor_types: [], contractor_etc: '', vulnerable: true, vulnerable_types: ['60세 이상의 장년근로자'], reviewed: false },
        },
        facility: {
          equips: [{ name: '사다리', qty: 3 }, { name: '예초기', qty: 3 }, { name: '잔디깎기', qty: 1 }, { name: '전동(기계) 톱', qty: 2 }, { name: '전동(기계) 전정기', qty: 2 }, { name: '송풍기', qty: 1 }, { name: '콤프레샤(공기압축기)', qty: 2 }, { name: '용접기', qty: 1 }, { name: '핸드 그라인더', qty: 1 }, { name: '핸드 드릴', qty: 1 }, { name: '컷팅기', qty: 1 }, { name: '고압 세척기', qty: 1 }],
          chems: [{ name: '휘발유', handled: true }, { name: '엔진오일', handled: true }, { name: '경유', handled: true }, { name: '등유', handled: true }, { name: '윤활제(WD-40)', handled: true }, { name: '페인트', handled: true }, { name: '락카', handled: true }, { name: '스프레이그리스', handled: true }, { name: '부탄가스', handled: true }, { name: '접착제(오공)', handled: true }, { name: '스티커 제거제', handled: true }, { name: '스프레이 접착제', handled: true }, { name: '실리콘', handled: true }, { name: '녹 제거제', handled: true }],
          etc: { acc3y_accident: 1, acc3y_other: 0, env_measure: false, permit: false, permit_types: [], contractor: false, contractor_types: [], contractor_etc: '', vulnerable: true, vulnerable_types: ['60세 이상의 장년근로자'], reviewed: false },
        },
        cleaning: {
          equips: [{ name: '진공청소기', qty: 2 }, { name: '고압 세척기', qty: 1 }],
          chems: [{ name: '락스', handled: true }, { name: '바닥 세정제', handled: true }],
          etc: { acc3y_accident: 0, acc3y_other: 0, env_measure: false, permit: false, permit_types: [], contractor: false, contractor_types: [], contractor_etc: '', vulnerable: false, vulnerable_types: [], reviewed: false },
        },
        commute: {
          equips: [],
          chems: [],
          etc: { acc3y_accident: 0, acc3y_other: 0, env_measure: false, permit: false, permit_types: [], contractor: true, contractor_types: [], contractor_etc: '통학', vulnerable: false, vulnerable_types: [], reviewed: false },
        },
        night_duty: {
          equips: [],
          chems: [],
          etc: { acc3y_accident: 0, acc3y_other: 0, env_measure: false, permit: false, permit_types: [], contractor: false, contractor_types: [], contractor_etc: '', vulnerable: true, vulnerable_types: ['60세 이상의 장년근로자'], reviewed: false },
        },
      },
      // 작년(2025) 청취조사 개인별 조사표 — 실물 양식 샘플(급식 1번 근로자)
      hearing_prev: {
        'catering-1': {
          part: 'catering', worker_name: '김복자', surveyor: '김주장', date: '2025-06-07',
          exps: [
            { text: '급식실 후문 계단에서 내려오다가 미끄러져서 넘어질 뻔 함', cause: '보호구 미지참 및 착용 X, 급식실 계단 미끄럼방지조치·안전난간 X' },
            { text: '', cause: '' },
            { text: '', cause: '' },
          ],
          worker_opinion: '급식실 계단 미끄럼방지조치 필요',
          improve_cond: '안전난간 설치 필요',
          done: true,
        },
        'catering-2': {
          part: 'catering', worker_name: '박정순', surveyor: '김주장', date: '2025-06-07',
          exps: [
            { text: '국솥에서 배식통으로 국을 옮기다가 뜨거운 국물이 튀어 화상을 입을 뻔 함', cause: '내열장갑 노후, 이동 동선에 미끄럼 주의 표시 없음' },
            { text: '', cause: '' },
            { text: '', cause: '' },
          ],
          worker_opinion: '내열장갑 교체 주기 관리 필요',
          improve_cond: '이동 동선 미끄럼 방지 매트 설치',
          done: true,
        },
      },
    },
  },
}

// ============================================================================
// 라우팅
// ============================================================================
const routes = []
const on = (method, pattern, handler) => routes.push({ method, pattern, handler })
const schoolById = (id) => schools.find((s) => s.id === id)

// ---- 인증 ----
on('POST', '/auth/login', () => ({ access_token: 'mock-access-' + uid(), refresh_token: 'mock-refresh-' + uid() }))
on('POST', '/auth/refresh', () => ({ access_token: 'mock-access-' + uid(), refresh_token: 'mock-refresh-' + uid() }))
on('GET', '/auth/me', () => ({ role: 'hq_admin', modules: [] }))
on('POST', '/auth/change-password', () => ({ ok: true }))

// ---- 학교 ----
on('GET', '/schools', () => schools)
on('POST', '/schools', (p, q, body) => { const s = { id: 's' + uid(), is_private: false, education_count: null, ...body }; schools.push(s); ledgers[s.id] = { school: { id: s.id, name: s.name, is_private: !!s.is_private, education_count: s.education_count ?? null, special_notes: '', address: s.address || '' }, workers: [], worker_total: 0, education_count: s.education_count ?? null, headcount_mismatch: false, msds: [], accidents: [], histories: [] }; return s })
on('DELETE', '/schools/:id', (p) => { const i = schools.findIndex((s) => s.id === p.id); if (i >= 0) schools.splice(i, 1); return null })
on('PUT', '/schools/:id', (p, q, body) => {
  const s = schools.find((x) => x.id === p.id)
  if (!s) return null
  Object.assign(s, body || {})
  const led = ledgers[p.id]
  if (led) {
    led.school = { ...led.school, name: s.name, is_private: !!s.is_private, education_count: s.education_count ?? null, address: s.address || '' }
    led.education_count = s.education_count ?? null
  }
  return s
})
on('PUT', '/schools/:id/workers', (p, q, body) => {
  const led = ledgers[p.id]
  if (!led) return null
  const workers = (body?.workers || []).map((w) => ({ id: uid(), part: w.part, count: Number(w.count) || 0, contact: w.contact || '', is_nutrition_teacher: !!w.is_nutrition_teacher }))
  led.workers = workers
  led.worker_total = workers.reduce((a, w) => a + w.count, 0)
  return { ok: true }
})
on('GET', '/schools/:id/ledger', (p) => ledgers[p.id] || { school: { id: p.id, name: '알 수 없음', is_private: false, education_count: null, special_notes: '', address: '' }, workers: [], worker_total: 0, education_count: null, headcount_mismatch: false, msds: [], accidents: [], histories: [] })
on('GET', '/schools/:id/approval-line', (p) => ({ steps: store.approval[p.id] || [{ title: '담당자', name: schoolById(p.id)?.manager || '' }, { title: '행정실장', name: '' }, { title: '교장', name: schoolById(p.id)?.principal || '' }] }))
on('PUT', '/schools/:id/approval-line', (p, q, body) => { store.approval[p.id] = body?.steps || []; return { ok: true, steps: store.approval[p.id] } })
on('GET', '/schools/:id/features', (p) => ({ features: store.features[p.id] || { elevator: true, shuttle_bus: p.id === 's01' } }))
on('PUT', '/schools/:id/features', (p, q, body) => { store.features[p.id] = body?.features || {}; return { ok: true } })
on('GET', '/schools/:id/notes', (p) => ({ items: store.notes[p.id] || [{ date: daysAgo(14), text: '급식실 후드 교체 예정(8월)' }] }))
on('PUT', '/schools/:id/notes', (p, q, body) => { store.notes[p.id] = body?.items || []; return { ok: true } })
on('GET', '/schools/:id/manager-history', (p) => ({ items: store.managerHistory[p.id] || [{ start: '2024-03-01', end: '2025-02-28', name: '전임자', note: '' }, { start: '2025-03-01', end: '', name: schoolById(p.id)?.manager || '현담당', note: '현임' }] }))
on('PUT', '/schools/:id/manager-history', (p, q, body) => { store.managerHistory[p.id] = body?.items || []; return { ok: true } })

// ---- 안전점검 ----
on('GET', '/inspections', (p, q) => inspections.filter((i) => !q.school_id || i.school_id === q.school_id))
on('POST', '/inspections', (p, q, body) => { const it = { id: 'i' + uid(), school_id: body?.school_id || '', part: body?.part || 'catering', status: 'draft', eduoffice_submit_status: 'none', items: [], signatures: [], followups: [], signed_at: null, submitted_at: null }; inspections.push(it); return it })
on('PUT', '/inspections/:id/items/:code', (p, q, body) => { const it = inspections.find((i) => i.id === p.id); if (it) { const ex = it.items.find((x) => x.code === p.code); if (ex) Object.assign(ex, body); else it.items.push({ code: p.code, label: body?.label || p.code, result: body?.result ?? null, remark: body?.remark || '', photos: [] }) } return { ok: true } })
on('POST', '/inspections/:id/followups', (p, q, body) => { const it = inspections.find((i) => i.id === p.id); const f = { id: uid(), item_code: body?.item_code || '', description: body?.description || '', status: 'open' }; it?.followups.push(f); return f })
on('POST', '/inspections/:id/sign', (p, q, body) => { const it = inspections.find((i) => i.id === p.id); if (it) { it.status = 'signed'; it.signed_at = new Date().toISOString(); it.signatures.push({ signer: body?.signer || '관리자', signed_at: it.signed_at, image_ref: '' }) } return { ok: true } })
on('POST', '/inspections/:id/submit', (p) => { const it = inspections.find((i) => i.id === p.id); if (it) { it.status = 'submitted'; it.submitted_at = new Date().toISOString(); it.eduoffice_submit_status = 'submitted' } return { status: 'submitted', eduoffice: schoolById(it?.school_id)?.is_private ? null : '서울시교육청' } })

// ---- 위험성평가 ----
on('GET', '/risk', (p, q) => risks.filter((r) => !q.school_id || r.school_id === q.school_id).map(({ items, ...rest }) => ({ ...rest })))
on('GET', '/risk/survey', (p, q) => ({ school_id: q.school_id || '', sections: store.surveys[q.school_id] || {}, updated_at: iso(2) }))
on('PUT', '/risk/survey', (p, q, body) => { store.surveys[body?.school_id] = body?.sections || {}; return { ok: true, updated_at: new Date().toISOString() } })
on('POST', '/risk/master', () => ({ ok: true }))
on('POST', '/risk/generate', (p, q, body) => { const r = { id: 'r' + uid(), school_id: body?.school_id || '', process: body?.process || 'catering', status: 'in_progress', count: 3, unsafe_count: 0, created_at: new Date().toISOString(), category: body?.category || 'regular', accident_id: body?.accident_id || null, source: null, origin: null, items: [0, 1, 2].map(mkRiskItem) }; risks.push(r); return r })
on('GET', '/risk/:id', (p) => risks.find((r) => r.id === p.id) || null)
on('PUT', '/risk/:id/items/:iid/scores', (p, q, body) => { const it = risks.find((r) => r.id === p.id)?.items.find((x) => x.id === p.iid); if (it) { Object.assign(it, body); it.risk_score = (it.likelihood || 1) * (it.severity || 1) } return { ok: true } })
on('PUT', '/risk/:id/items/:iid/unsafe', (p, q, body) => { const r = risks.find((x) => x.id === p.id); const it = r?.items.find((x) => x.id === p.iid); if (it) { Object.assign(it, body); r.unsafe_count = r.items.filter((x) => x.is_unsafe).length } return { ok: true } })
on('POST', '/risk/:id/complete', (p) => { const r = risks.find((x) => x.id === p.id); if (r) r.status = 'completed'; return { ok: true } })

// ---- 이행점검 ----
on('GET', '/compliance', (p, q) => compliances.filter((c) => !q.school_id || c.school_id === q.school_id))
on('POST', '/compliance', (p, q, body) => { const c = { id: 'c' + uid(), school_id: body?.school_id || '', period: body?.period || 'may', status: 'draft', items: [{ code: 'CP-01', label: '안전보건 목표 수립', fulfilled: false, remark: '', auto: false }, { code: 'CP-02', label: '전담조직 구성', fulfilled: false, remark: '', auto: true }], snapshot: {}, created_at: new Date().toISOString() }; compliances.push(c); return c })
on('PUT', '/compliance/:id/items/:code', (p, q, body) => { const it = compliances.find((c) => c.id === p.id)?.items.find((x) => x.code === p.code); if (it) Object.assign(it, body); return { ok: true } })
on('POST', '/compliance/:id/submit', (p) => { const c = compliances.find((x) => x.id === p.id); if (c) c.status = 'submitted'; return { status: 'submitted' } })

// ---- 근골격계 ----
on('GET', '/musculo', (p, q) => musculos.filter((m) => !q.school_id || m.school_id === q.school_id))
on('POST', '/musculo', (p, q, body) => { const m = { id: 'm' + uid(), school_id: body?.school_id || '', has_burden: false, basic_surveys: 0, sheets: 0, needs_review: 0, created_at: new Date().toISOString() }; musculos.push(m); sheetsBySurvey[m.id] = []; return m })
on('POST', '/musculo/:id/burden', (p, q, body) => { const m = musculos.find((x) => x.id === p.id); const clauses = Array.isArray(body?.burden_clauses) ? body.burden_clauses : [1, 4]; if (m) m.has_burden = clauses.length > 0; return { has_burden: clauses.length > 0, burden_clauses: clauses } })
on('POST', '/musculo/:id/basic-survey', (p, q, body) => { const m = musculos.find((x) => x.id === p.id); if (m) m.basic_surveys += 1; return { id: uid(), score: 12 } })
on('GET', '/musculo/:id/sheets', (p) => sheetsBySurvey[p.id] || [])
on('POST', '/musculo/:id/sheets', (p, q, body) => { const sh = { id: uid(), person_name: body?.person_name || '무명', image_ref: body?.image_ref || '', confidence: 0.8, review_status: 'needs_review' }; (sheetsBySurvey[p.id] ||= []).push(sh); const m = musculos.find((x) => x.id === p.id); if (m) { m.sheets += 1; m.needs_review += 1 } return sh })
on('POST', '/musculo/:id/sheets/:sid/confirm', (p) => { const sh = (sheetsBySurvey[p.id] || []).find((x) => x.id === p.sid); if (sh) sh.review_status = 'confirmed'; const m = musculos.find((x) => x.id === p.id); if (m) m.needs_review = Math.max(0, m.needs_review - 1); return { ok: true } })
on('GET', '/musculo/:id/stats', (p) => ({ total: 8, done: 5, review: 2, todo: 1, pain: 3, managed: 2, normal: 3 }))

// ---- 교육 ----
on('GET', '/education/:sid/progress', (p) => eduBySchool[p.sid]?.progress || { total: 0, completed_count: 0, avg_progress: 0 })
on('GET', '/education/:sid/sessions', (p) => eduBySchool[p.sid]?.sessions || [])
on('POST', '/education/:sid/sessions', (p, q, body) => { const s = { id: uid(), school_id: p.sid, date: body?.date || daysAgo(0), kind: body?.kind || '정기안전교육', accident_type: body?.accident_type || '기타', headcount: body?.headcount || 0, created_at: new Date().toISOString() }; (eduBySchool[p.sid]?.sessions || []).push(s); return s })
on('GET', '/education/:sid/records', (p) => eduBySchool[p.sid]?.records || [])
on('GET', '/education/:sid/supervisors', (p) => eduBySchool[p.sid]?.supervisors || [])
on('POST', '/education/:sid/supervisors', (p, q, body) => { const r = { id: uid(), date: body?.date || daysAgo(0), name: body?.name || '', completed: !!body?.completed }; (eduBySchool[p.sid]?.supervisors || []).push(r); return r })
on('PUT', '/education/supervisors/:id', (p, q, body) => { for (const k of Object.keys(eduBySchool)) { const r = eduBySchool[k].supervisors.find((x) => x.id === p.id); if (r) { Object.assign(r, body); return r } } return { ok: true } })
on('DELETE', '/education/supervisors/:id', (p) => { for (const k of Object.keys(eduBySchool)) { const a = eduBySchool[k].supervisors; const i = a.findIndex((x) => x.id === p.id); if (i >= 0) a.splice(i, 1) } return null })
on('POST', '/education/import', (p, q, body) => ({ ingested: (body?.rows || []).length || 5, unmatched: [] }))
on('POST', '/education/ingest', (p, q, body) => ({ ingested: (body?.rows || []).length || 5 }))

// ---- 산업재해 ----
on('GET', '/accidents', () => accidents)
on('POST', '/accidents', (p, q, body) => { const sc = schoolById(body?.school_id); const a = { id: 'a' + uid(), school_id: body?.school_id || '', school_name: sc?.name || '', school_masked: (sc?.name?.[0] || 'X') + '학교', kind: body?.kind || 'accident', date: body?.date || daysAgo(0), summary: body?.summary || '', detail: body?.detail || '', status: 'open', files: body?.files || [], links: {}, created_at: new Date().toISOString() }; accidents.unshift(a); return a })
on('POST', '/accidents/:id/generate', (p, q, body) => { const a = accidents.find((x) => x.id === p.id); if (!a) return null; if (body?.target === 'musculo') { const m = { id: 'm' + uid(), school_id: a.school_id, has_burden: false, basic_surveys: 0, sheets: 0, needs_review: 0, created_at: new Date().toISOString() }; musculos.push(m); sheetsBySurvey[m.id] = []; a.links = { ...a.links, musculo_id: m.id } } else { const r = { id: 'r' + uid(), school_id: a.school_id, process: 'catering', status: 'in_progress', count: 3, unsafe_count: 0, created_at: new Date().toISOString(), category: 'adhoc', accident_id: a.id, source: 'accident', origin: a.summary, items: [0, 1, 2].map(mkRiskItem) }; risks.push(r); a.links = { ...a.links, risk_id: r.id } } return a })
on('GET', '/accidents/feed-settings', () => ({ settings: store.feed }))
on('PUT', '/accidents/feed-settings', (p, q, body) => { Object.assign(store.feed, body?.settings || body || {}); store.feed.has_service_key = true; return { settings: store.feed } })
on('POST', '/accidents/feed-sync', () => ({ created: 2, duplicates: 1, unmatched: ['알수없음중학교'], fetched: 4 }))
on('POST', '/accidents/import', (p, q, body) => ({ created: (body?.rows || []).length || 3, duplicates: 0, unmatched: [] }))

// ---- 홈·운영 ----
on('GET', '/notices', () => notices)
on('POST', '/notices', (p, q, body) => { const n = { id: 'n' + uid(), title: body?.title || '', body: body?.body || '', files: body?.files || [], pinned: !!body?.pinned, created_at: new Date().toISOString() }; notices.unshift(n); return n })
on('PUT', '/notices/:id', (p, q, body) => { const n = notices.find((x) => x.id === p.id); if (n) Object.assign(n, body); return n })
on('DELETE', '/notices/:id', (p) => { const i = notices.findIndex((x) => x.id === p.id); if (i >= 0) notices.splice(i, 1); return null })
on('GET', '/visits', () => visits)
on('POST', '/visits', (p, q, body) => { const v = { id: uid(), school_id: body?.school_id || '', date: body?.date || daysAgo(0), visitor: body?.visitor || '', purpose: body?.purpose || '' }; visits.push(v); return v })
on('GET', '/complaints', () => complaints)
on('POST', '/complaints', (p, q, body) => { const c = { id: uid(), school_id: body?.school_id || '', date: body?.date || daysAgo(0), content: body?.content || '', status: 'open' }; complaints.unshift(c); return c })
on('GET', '/ops/alerts', () => [
  { kind: 'headcount', school_id: 's02', school_name: '푸른중학교', message: '대장 인원과 교육 명단 인원이 일치하지 않습니다 (10 vs 9)' },
  { kind: 'accident', school_id: 's07', school_name: '미래공업고등학교', message: '신규 산재 접수 — 실습실 절단 사고(경미)' },
  { kind: 'omr_review', school_id: 's01', school_name: '한빛초등학교', message: '증상조사표 2건 인식 검수가 필요합니다' },
])
on('GET', '/ops/dashboard', () => ({ '관리 학교': schools.length, '이번 달 방문': visits.filter((v) => v.date.slice(0, 7) === daysAgo(0).slice(0, 7)).length, '미처리 민원': complaints.filter((c) => c.status === 'open' || c.status === 'doing').length, '진행 중 점검': inspections.filter((i) => i.status !== 'submitted').length }))
on('GET', '/ops/docs/:key', (p) => ({ doc: docs[p.key] || {} }))
on('PUT', '/ops/docs/:key', (p, q, body) => { docs[p.key] = body?.doc || {}; return { ok: true } })

// ---- 본사: 계정·발행·자료실·세션·메일·저장소 ----
on('GET', '/users', () => users)
on('POST', '/users', (p, q, body) => { const u = { id: 'u' + uid(), login_id: body?.login_id || '', name: body?.name || '', role: body?.role || 'field_inspector', modules: body?.modules || [] }; users.push(u); return u })
on('PUT', '/users/:id', (p, q, body) => { const u = users.find((x) => x.id === p.id); if (u) Object.assign(u, body); return u })
on('POST', '/users/:id/reset-password', () => ({ ok: true, temp_password: 'temp-' + uid().slice(0, 6) }))
on('GET', '/invoices', (p, q) => invoices.filter((v) => !q.school_id || v.school_id === q.school_id))
on('POST', '/invoices', (p, q, body) => { const v = { id: 'v' + uid(), school_id: body?.school_id || '', business_reg_no: body?.business_reg_no || '', issue_date: body?.issue_date || daysAgo(0), amount: body?.amount || 0, status: 'issued', ecount_ref: 'EC-' + uid().slice(0, 8).toUpperCase() }; invoices.unshift(v); return v })
on('POST', '/invoices/:id/retry', (p) => { const v = invoices.find((x) => x.id === p.id); if (v) { v.status = 'issued'; v.ecount_ref = 'EC-' + uid().slice(0, 8).toUpperCase() } return { ok: true } })
on('GET', '/billing/settings', () => ({ settings: { ...store.billing, api_cert_key: '' } }))
on('PUT', '/billing/settings', (p, q, body) => { Object.assign(store.billing, body?.settings || body || {}); return { settings: { ...store.billing, api_cert_key: '' } } })
on('POST', '/billing/settings/test', () => ({ ok: true, message: '이카운트 연결 성공 (테스트 모드)' }))
on('GET', '/resources', () => resources.map(({ content, ...r }) => r))
on('POST', '/resources', (p, q, body) => { const r = { id: 're' + uid(), title: body?.title || '', category: body?.category || '기타', size: body?.size || '0 KB', date: daysAgo(0), content: body?.content || '' }; resources.unshift(r); return { ...r, content: undefined } })
on('GET', '/resources/:id', (p) => resources.find((r) => r.id === p.id) || null)
on('DELETE', '/resources/:id', (p) => { const i = resources.findIndex((r) => r.id === p.id); if (i >= 0) resources.splice(i, 1); return { ok: true } })
on('POST', '/field/session', (p, q, body) => ({ session_id: uid(), code: (uid().slice(0, 4) + '-' + uid().slice(0, 4)).toUpperCase() }))
on('GET', '/mail/settings', () => ({ settings: store.mail }))
on('PUT', '/mail/settings', (p, q, body) => { Object.assign(store.mail, body?.settings || body || {}); store.mail.has_password = true; return { settings: store.mail } })
on('POST', '/mail/test', () => ({ ok: true, message: 'IMAP 접속 성공 (mock)' }))
on('GET', '/mail/inbox', (p, q) => mailInbox.slice(0, Number(q.limit) || 15))
on('GET', '/mail/message', (p, q) => { const r = mailInbox.find((m) => m.uid === q.uid) || mailInbox[0]; return { ...r, to: 'hq@safety.or.kr', body: '안녕하세요.\n\n' + r.subject + ' 관련하여 회신드립니다.\n자세한 내용은 첨부 문서를 확인해 주세요.\n\n감사합니다.', attachments: ['첨부문서.pdf'] } })
on('GET', '/files/info', () => ({ root: '/srv/safety-docs', modules: { inspection: { dir: 'inspection', files: 128, bytes: 34_500_000 }, risk: { dir: 'risk', files: 56, bytes: 12_000_000 }, musculo: { dir: 'musculo', files: 210, bytes: 88_000_000 }, education: { dir: 'education', files: 74, bytes: 9_100_000 }, compliance: { dir: 'compliance', files: 22, bytes: 4_400_000 } } }))

// ============================================================================
// HTTP 서버 (라우트 매칭 + JSON 응답)
// ============================================================================
function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue
    const rp = r.pattern.split('/').filter(Boolean)
    const pp = pathname.split('/').filter(Boolean)
    if (rp.length !== pp.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(pp[i])
      else if (rp[i] !== pp[i]) { ok = false; break }
    }
    if (ok) return { handler: r.handler, params }
  }
  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const q = Object.fromEntries(url.searchParams)
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/'

  // CORS (프록시 없이 직접 붙는 경우 대비)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  let body = null
  if (req.method === 'POST' || req.method === 'PUT') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    try { body = JSON.parse(Buffer.concat(chunks).toString() || 'null') } catch { body = null }
  }

  const m = match(req.method, path)
  if (!m) {
    console.log(`  404 ${req.method} ${path}`)
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: { message: `mock: 미구현 경로 ${req.method} ${path}` } }))
  }
  try {
    const out = m.handler(m.params, q, body)
    console.log(`  ${req.method} ${path}`)
    if (out === null && req.method === 'DELETE') { res.writeHead(204); return res.end() }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(out))
  } catch (e) {
    console.error(`  500 ${req.method} ${path}`, e)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: String(e) } }))
  }
})

server.listen(PORT, () => {
  console.log('')
  console.log('  ┌──────────────────────────────────────────────┐')
  console.log('  │  web-hq 가짜 백엔드 실행 중                  │')
  console.log(`  │  http://localhost:${PORT}                        │`)
  console.log('  │                                              │')
  console.log('  │  다른 터미널에서 npm run dev 실행 후         │')
  console.log('  │  로그인: 아무 값이나 입력해도 통과됩니다     │')
  console.log('  └──────────────────────────────────────────────┘')
  console.log('')
})
