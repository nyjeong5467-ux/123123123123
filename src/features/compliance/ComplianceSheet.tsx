// 중대재해예방 의무이행사항 점검 조사지 — 이행점검 핵심 양식 (0806 요청, 실물 조사지 기반).
// 내용 컬럼: 점검자가 직접 작성(표준 문구 기본값 프리필) · 결과 컬럼: 학교 행정선생님 면담 후 체크.
// 반기(상·하반기)당 1부, 작성 완료 후 학교 메일로 제출. 저장은 /ops/docs/compliance-sheets 문서(페이지에서 처리).
import { type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import '../../styles/riskreport.css'

/* ===================== 데이터 모델 ===================== */
export type OX = '' | 'O' | 'X'
export type CxSheet = {
  notice_date: string // 교육청 공문 접수일
  interviewee: string // 면담 대상 (행정선생님)
  interview_date: string // 면담일
  // 1. 성명 확인
  name_edu: string; name_admin: string; name_safety: string
  // 2. 관리감독자 교육 (예산포함)
  edu_note: string; edu_remote: string; edu_group: string
  // 3. 위험성평가
  risk_note: string; risk_approved: OX
  // 4. 예산집행실적 (단위: 천원)
  budget_note: string; budget_basis: string
  budget_improve: string; budget_consign: string; budget_super: string
  // 5. 산업재해
  acc_note: string; acc_happened: OX; acc_date: string
  // 6. 홈페이지 게시판
  board_note: string; board_ok: OX
  // 7. 중대재해 발생대비 매뉴얼 교육
  manual_note: string; manual_date: string
  // 8. 안전보건관리계획서 징구 및 계상 (지체발주 시)
  plan_note: string; plan_doc: OX; plan_cost: OX
  // 9. 안전보건협의체
  council_note: string; council_target: '' | '해당' | '미해당'; council_ok: OX
  // 10. 보호구 지급대상 작성 여부
  ppe_note: string; ppe_admin: OX; ppe_cafeteria: OX
  // 11. 안전보건경영방침
  policy_note: string; policy_posted: OX
  status: 'draft' | 'submitted'
  submitted_date: string
}
export type CxDoc = Record<string, Record<string, CxSheet>> // school_id → period(2026_h1) → sheet

export function periodLabel(key: string): string {
  const [y, h] = key.split('_')
  return `${y}년 ${h === 'h1' ? '상반기' : '하반기'}`
}
export function emptySheet(): CxSheet {
  return {
    notice_date: '', interviewee: '', interview_date: '',
    name_edu: '', name_admin: '', name_safety: '',
    edu_note: '연간 16시간 (온라인 8시간, 집합교육 8시간)', edu_remote: '', edu_group: '',
    risk_note: '위험성평가 실시계획 내부결재 필요.\n결과보고서는 6월 제출 후 내부결재 필요.', risk_approved: '',
    budget_note: '<예산 목록>\n1. 안전보건개선비: 500\n2. 안전보건위탁비용: 2,220\n3. 관리감독자교육비: 110', budget_basis: '4월 30일 기준',
    budget_improve: '', budget_consign: '', budget_super: '',
    acc_note: '산업재해 발생 여부 확인 (1~6월)', acc_happened: '', acc_date: '',
    board_note: '홈페이지에 안전보건에 대한 종사자의 의견을 청취하는 절차 마련 여부', board_ok: '',
    manual_note: '기준: 반기당 1회 (총 2회)', manual_date: '',
    plan_note: '1. 도급·용역·위탁 시 업체로부터 "안전보건관리계획서" 징구\n   (대상: 금액 상관 없는 모든 도급·용역·위탁 업체)\n2. 2천만원 이상 공사 안전보건관리비 편성 및 정산내역 계상', plan_doc: '', plan_cost: '',
    council_note: '대상: 1회 30일 초과 도급사업 또는 연간 총 작업일수 60일 초과', council_target: '', council_ok: '',
    ppe_note: '보호구 지급대상 작성 여부', ppe_admin: '', ppe_cafeteria: '',
    policy_note: '출력 게시 필요', policy_posted: '',
    status: 'draft', submitted_date: '',
  }
}
// 결과 컬럼 기입 여부(면담 진행도) — 주요 체크 8개 기준
export function sheetProgress(s: CxSheet): { done: number; total: number } {
  const checks = [s.risk_approved, s.acc_happened, s.board_ok, s.plan_doc, s.plan_cost, s.council_ok, s.ppe_admin && s.ppe_cafeteria ? 'O' : '', s.policy_posted]
  return { done: checks.filter(Boolean).length, total: checks.length }
}

/* ===================== 스타일 ===================== */
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const TH: CSSProperties = { fontSize: 12, fontWeight: 800, color: 'var(--muted)', padding: '8px 10px', borderBottom: '1px solid var(--line)', textAlign: 'center', background: 'var(--card-2)' }
const TD_ITEM: CSSProperties = { width: 150, padding: '10px 12px', fontSize: 12.5, fontWeight: 800, verticalAlign: 'top', borderBottom: '1px solid var(--line-2)', background: 'var(--card-2)' }
const TD: CSSProperties = { padding: '8px 10px', verticalAlign: 'top', borderBottom: '1px solid var(--line-2)' }
const TA: CSSProperties = { height: 'auto', minHeight: 52, padding: '8px 11px', resize: 'vertical', lineHeight: 1.6, width: '100%', fontFamily: 'inherit', fontSize: 12.5 }
const RES_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '2px 0', fontSize: 12.5 }
const IN_SM: CSSProperties = { width: 110, fontSize: 12.5 }

function OXToggle(p: { value: OX; onChange: (v: OX) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {(['O', 'X'] as const).map((v) => (
        <button
          key={v}
          className="btn"
          style={{
            padding: '3px 12px', fontSize: 12.5, fontWeight: 800, borderRadius: 999,
            background: p.value === v ? (v === 'O' ? 'var(--ok-soft)' : 'var(--red-soft)') : 'var(--card)',
            color: p.value === v ? (v === 'O' ? 'var(--ok-ink)' : 'var(--red-ink)') : 'var(--muted)',
            border: '1px solid ' + (p.value === v ? (v === 'O' ? 'var(--ok-ink)' : 'var(--red-ink)') : 'var(--line)'),
          }}
          onClick={() => p.onChange(p.value === v ? '' : v)}
        >
          {v}
        </button>
      ))}
    </span>
  )
}

/* ===================== 조사지 작성 폼 ===================== */
export function ComplianceSheetForm(p: { sheet: CxSheet; onChange: (s: CxSheet) => void }) {
  const s = p.sheet
  const set = (n: Partial<CxSheet>) => p.onChange({ ...s, ...n })

  function row(item: string, contentField: keyof CxSheet, result: ReactNode) {
    return (
      <tr>
        <td style={TD_ITEM}>{item}</td>
        <td style={TD}>
          <textarea className="input" style={TA} value={String(s[contentField] ?? '')} onChange={(e) => set({ [contentField]: e.target.value } as Partial<CxSheet>)} />
        </td>
        <td style={{ ...TD, width: 340 }}>{result}</td>
      </tr>
    )
  }

  return (
    <div>
      {/* 면담 정보 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '4px 0 12px' }}>
        <label className="field"><span>교육청 공문 접수일</span>
          <input className="input" type="date" value={s.notice_date} onChange={(e) => set({ notice_date: e.target.value })} /></label>
        <label className="field"><span>면담 대상 (행정선생님)</span>
          <input className="input" placeholder="예) 행정실 김선생님" value={s.interviewee} onChange={(e) => set({ interviewee: e.target.value })} /></label>
        <label className="field"><span>면담일</span>
          <input className="input" type="date" value={s.interview_date} onChange={(e) => set({ interview_date: e.target.value })} /></label>
        <span style={{ ...HINT, color: 'var(--amber-ink)' }}>
          ※ 결과 컬럼은 종사자가 아닌 <b>학교 행정선생님과 면담 후</b> 체크·작성합니다.
        </span>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 150 }}>항목</th>
              <th style={TH}>내용 <span style={{ fontWeight: 600 }}>(점검자 작성)</span></th>
              <th style={{ ...TH, width: 340 }}>결과 <span style={{ fontWeight: 600 }}>(행정선생님 면담 후)</span></th>
            </tr>
          </thead>
          <tbody>
            {/* 1. 성명 확인 */}
            <tr>
              <td style={TD_ITEM}>성명 확인</td>
              <td style={TD}><span style={HINT}>교육·행정·안전 담당 성명 확인</span></td>
              <td style={{ ...TD, width: 340 }}>
                <div style={RES_ROW}>교육선생님 <input className="input" style={IN_SM} value={s.name_edu} onChange={(e) => set({ name_edu: e.target.value })} /></div>
                <div style={RES_ROW}>행정실장님 <input className="input" style={IN_SM} value={s.name_admin} onChange={(e) => set({ name_admin: e.target.value })} /></div>
                <div style={RES_ROW}>안전담당자님 <input className="input" style={IN_SM} value={s.name_safety} onChange={(e) => set({ name_safety: e.target.value })} /></div>
              </td>
            </tr>
            {row('관리감독자 교육\n(예산포함)' as string, 'edu_note', (
              <>
                <div style={RES_ROW}>원격교육 <input className="input" style={{ width: 80, fontSize: 12.5 }} placeholder="4" value={s.edu_remote} onChange={(e) => set({ edu_remote: e.target.value })} /> 월</div>
                <div style={RES_ROW}>집합교육 <input className="input" style={{ width: 80, fontSize: 12.5 }} placeholder="5" value={s.edu_group} onChange={(e) => set({ edu_group: e.target.value })} /> 월</div>
              </>
            ))}
            {row('위험성평가', 'risk_note', (
              <div style={RES_ROW}>실시계획 내부결재 <OXToggle value={s.risk_approved} onChange={(v) => set({ risk_approved: v })} /></div>
            ))}
            {row('예산집행실적\n(단위:천원)', 'budget_note', (
              <>
                <div style={RES_ROW}>&lt;사용금액 <input className="input" style={{ width: 110, fontSize: 12 }} value={s.budget_basis} onChange={(e) => set({ budget_basis: e.target.value })} /> 기준&gt;</div>
                <div style={RES_ROW}>1. 개선비 <input className="input" style={IN_SM} placeholder="90,610" value={s.budget_improve} onChange={(e) => set({ budget_improve: e.target.value })} /></div>
                <div style={RES_ROW}>2. 위탁비용 <input className="input" style={IN_SM} placeholder="370" value={s.budget_consign} onChange={(e) => set({ budget_consign: e.target.value })} /></div>
                <div style={RES_ROW}>3. 관리감독자 <input className="input" style={IN_SM} value={s.budget_super} onChange={(e) => set({ budget_super: e.target.value })} /></div>
              </>
            ))}
            {row('산업재해 (1~6월)', 'acc_note', (
              <>
                <div style={RES_ROW}>산업재해 발생 <OXToggle value={s.acc_happened} onChange={(v) => set({ acc_happened: v })} /></div>
                {s.acc_happened === 'O' && (
                  <div style={RES_ROW}>산업재해조사표 발생일 <input className="input" type="date" style={{ width: 150, fontSize: 12.5 }} value={s.acc_date} onChange={(e) => set({ acc_date: e.target.value })} /></div>
                )}
              </>
            ))}
            {row('홈페이지 게시판', 'board_note', (
              <div style={RES_ROW}>의견함 마련 <OXToggle value={s.board_ok} onChange={(v) => set({ board_ok: v })} /></div>
            ))}
            {row('중대재해 발생대비\n매뉴얼 교육', 'manual_note', (
              <div style={RES_ROW}>교육일 <input className="input" type="date" style={{ width: 150, fontSize: 12.5 }} value={s.manual_date} onChange={(e) => set({ manual_date: e.target.value })} /></div>
            ))}
            {row('안전보건관리계획서\n징구 및 계상\n(지체발주 시)', 'plan_note', (
              <>
                <div style={RES_ROW}>1. 안전보건관리계획서 <OXToggle value={s.plan_doc} onChange={(v) => set({ plan_doc: v })} /></div>
                <div style={RES_ROW}>2. 2천만원 이상 공사 <OXToggle value={s.plan_cost} onChange={(v) => set({ plan_cost: v })} /></div>
              </>
            ))}
            {row('안전보건협의체', 'council_note', (
              <>
                <div style={RES_ROW}>
                  대상 여부
                  <select className="select" style={{ width: 110, fontSize: 12.5 }} value={s.council_target} onChange={(e) => set({ council_target: e.target.value as CxSheet['council_target'] })}>
                    <option value="">선택</option><option value="해당">해당</option><option value="미해당">미해당</option>
                  </select>
                </div>
                <div style={RES_ROW}>협의체 운영 <OXToggle value={s.council_ok} onChange={(v) => set({ council_ok: v })} /></div>
              </>
            ))}
            {row('보호구 지급대장\n작성 여부', 'ppe_note', (
              <>
                <div style={RES_ROW}>행정실 <OXToggle value={s.ppe_admin} onChange={(v) => set({ ppe_admin: v })} /></div>
                <div style={RES_ROW}>급식실 <OXToggle value={s.ppe_cafeteria} onChange={(v) => set({ ppe_cafeteria: v })} /></div>
              </>
            ))}
            {row('안전보건경영방침', 'policy_note', (
              <div style={RES_ROW}>게시 <OXToggle value={s.policy_posted} onChange={(v) => set({ policy_posted: v })} /></div>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ===================== 인쇄 미리보기 (A4 세로 1쪽) ===================== */
const P_TH: CSSProperties = { border: '1px solid #444', background: '#eef0f5', fontSize: 11, fontWeight: 800, padding: '5px 8px', textAlign: 'center' }
const P_TD: CSSProperties = { border: '1px solid #444', fontSize: 10.5, padding: '5px 8px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }
const P_IT: CSSProperties = { ...P_TD, fontWeight: 800, textAlign: 'center', verticalAlign: 'middle', width: 96 }

export function ComplianceSheetPrint(p: { schoolName: string; periodKey: string; sheet: CxSheet; onClose: () => void }) {
  const s = p.sheet
  const ox = (v: OX) => (v ? `( ${v} )` : '( O , X )')
  return createPortal(
    <div className="rr-overlay">
      <style>{'@media print { @page { size: A4 portrait; margin: 0 } }'}</style>
      <div className="rr-toolbar">
        <b>중대재해예방 의무이행사항 점검 조사지 — 인쇄 미리보기</b>
        <span style={{ fontSize: 12, opacity: 0.75 }}>인쇄 대화상자에서 "PDF로 저장" 선택 시 메일 첨부용 파일이 만들어집니다</span>
        <span className="sp" />
        <button className="print" onClick={() => window.print()}><Printer size={14} style={{ verticalAlign: -2 }} /> 인쇄 / PDF 저장</button>
        <button className="close" onClick={p.onClose}><X size={14} style={{ verticalAlign: -2 }} /> 닫기</button>
      </div>
      <div className="rr-page" style={{ width: 794, minHeight: 1123, padding: '44px 46px' }}>
        <div style={{ textAlign: 'center', fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
          {periodLabel(p.periodKey)} 중대재해예방 의무이행사항 점검 조사지
        </div>
        <div style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>( {p.schoolName} )</div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr><th style={{ ...P_TH, width: 96 }}>항 목</th><th style={P_TH}>내 용</th><th style={{ ...P_TH, width: 190 }}>결 과</th></tr>
          </thead>
          <tbody>
            <tr><td style={P_IT}>성명 확인</td><td style={P_TD}>교육·행정·안전 담당 성명 확인</td>
              <td style={P_TD}>교육선생님: {s.name_edu}{'\n'}행정실장님: {s.name_admin}{'\n'}안전담당자님: {s.name_safety}</td></tr>
            <tr><td style={P_IT}>관리감독자 교육{'\n'}(예산포함)</td><td style={P_TD}>{s.edu_note}</td>
              <td style={P_TD}>원격교육: {s.edu_remote || '　'} 월{'\n'}집합교육: {s.edu_group || '　'} 월</td></tr>
            <tr><td style={P_IT}>위험성평가</td><td style={P_TD}>{s.risk_note}</td>
              <td style={P_TD}>실시계획 내부결재 {ox(s.risk_approved)}</td></tr>
            <tr><td style={P_IT}>예산집행실적{'\n'}(단위:천원)</td><td style={P_TD}>{s.budget_note}</td>
              <td style={P_TD}>&lt;사용금액 {s.budget_basis} 기준&gt;{'\n'}1. 개선비: {s.budget_improve}{'\n'}2. 위탁비용: {s.budget_consign}{'\n'}3. 관리감독자: {s.budget_super}</td></tr>
            <tr><td style={P_IT}>산업재해 (1~6월)</td><td style={P_TD}>{s.acc_note}</td>
              <td style={P_TD}>산업재해발생 {ox(s.acc_happened)}{'\n'}산업재해조사표 발생일: {s.acc_date}</td></tr>
            <tr><td style={P_IT}>홈페이지 게시판</td><td style={P_TD}>{s.board_note}</td>
              <td style={P_TD}>의견함 마련 {ox(s.board_ok)}</td></tr>
            <tr><td style={P_IT}>중대재해 발생대비{'\n'}매뉴얼 교육</td><td style={P_TD}>{s.manual_note}</td>
              <td style={P_TD}>교육일: {s.manual_date}</td></tr>
            <tr><td style={P_IT}>안전보건관리계획서{'\n'}징구 및 계상{'\n'}(지체발주 시)</td><td style={P_TD}>{s.plan_note}</td>
              <td style={P_TD}>1. 안전보건관리계획서 {ox(s.plan_doc)}{'\n'}2. 2천만원 이상 공사 {ox(s.plan_cost)}</td></tr>
            <tr><td style={P_IT}>안전보건협의체</td><td style={P_TD}>{s.council_note}</td>
              <td style={P_TD}>대상 여부: {s.council_target || '—'}{'\n'}협의체 운영 {ox(s.council_ok)}</td></tr>
            <tr><td style={P_IT}>보호구 지급대장{'\n'}작성 여부</td><td style={P_TD}>{s.ppe_note}</td>
              <td style={P_TD}>행정실 {ox(s.ppe_admin)}{'\n'}급식실 {ox(s.ppe_cafeteria)}</td></tr>
            <tr><td style={P_IT}>안전보건경영방침</td><td style={P_TD}>{s.policy_note}</td>
              <td style={P_TD}>게시 {ox(s.policy_posted)}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: 10.5, fontWeight: 700 }}>
          면담: {s.interviewee || '　'} (행정선생님) · 면담일: {s.interview_date || '　'} · 교육청 공문 접수일: {s.notice_date || '　'}
        </div>
      </div>
    </div>,
    document.body,
  )
}
