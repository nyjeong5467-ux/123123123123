// 종사자 안전·보건 점검표 — 실물 양식 보기 [054]
// 점검표 1장(학교×점검일, 공정별 점검 묶음)을 제출 PDF와 같은 서식으로 표시.
// [인쇄 / PDF 저장]으로 브라우저 인쇄 → PDF 생성 가능. 조회 전용(수정은 이어서 작성에서).
import { Printer, X } from 'lucide-react'
import '../styles/inspectsheet.css'

export type SheetItem = { code: string; label: string; result?: string | null; remark?: string | null }
export type SheetPart = {
  part: string
  items: SheetItem[]
  signatures: { signer: string; signed_at?: string | null }[]
}
export type SheetData = {
  schoolName: string
  manager?: string
  date: string // 점검일 ('' = 작성중)
  parts: SheetPart[]
}

const PART_NAME: Record<string, string> = {
  catering: '급식종사자', night_duty: '당직업무', commute: '통학보조', facility: '시설관리', cleaning: '미화원',
}
const PART_ORDER = ['catering', 'night_duty', 'commute', 'facility', 'cleaning']
// 저장값 → 표시 컬럼 (구 시드 ok/fix 값도 방어적으로 수용)
const RES_COL: Record<string, 0 | 1 | 2> = { good: 0, ok: 0, poor: 1, fix: 1, na: 2 }

export function InspectionSheetView({ sheet, onClose }: { sheet: SheetData; onClose: () => void }) {
  const signer = sheet.parts.flatMap((p) => p.signatures).find((s) => s.signer)?.signer || ''
  const signedAt = sheet.parts
    .flatMap((p) => p.signatures)
    .map((s) => (s.signed_at || '').slice(0, 10))
    .find(Boolean) || ''
  const included = new Set(sheet.parts.map((p) => p.part))
  const ordered = PART_ORDER.filter((k) => included.has(k)).map((k) => sheet.parts.find((p) => p.part === k)!)

  return (
    <div className="inss-overlay" role="dialog" aria-label="종사자 안전·보건 점검표">
      <div className="inss-bar">
        <b>종사자 안전·보건 점검표 — {sheet.schoolName}{sheet.date ? ` · ${sheet.date}` : ' · 작성중'}</b>
        <div className="sp" />
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} /> 인쇄 / PDF 저장</button>
        <button className="btn btn-ghost" onClick={onClose}><X size={14} /> 닫기</button>
      </div>

      <div className="inss-page">
        {/* 제목 + 결재란 */}
        <div className="inss-head">
          <h1>종사자 안전·보건 점검표</h1>
          <table className="inss-approve">
            <tbody>
              <tr>
                <td className="lab" rowSpan={2}>결<br />재</td>
                <td className="t">담당자</td>
              </tr>
              <tr>
                <td className="sign">{signer}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기본정보 */}
        <div className="inss-sec"><i />기본정보</div>
        <div className="inss-info">
          <label><span>학교(기관)명</span><div className="v">{sheet.schoolName}</div></label>
          <label><span>소속명</span><div className="v" /></label>
          <label><span>부서명</span><div className="v" /></label>
          <label><span>직책</span><div className="v" /></label>
          <label><span>작성자</span><div className="v">{signer || sheet.manager || ''}</div></label>
          <label><span>작성일</span><div className="v">{signedAt || sheet.date}</div></label>
          <label><span>점검일</span><div className="v">{sheet.date}</div></label>
          <label><span>점검장소</span><div className="v" /></label>
          <label><span>재해형태</span><div className="v" /></label>
        </div>

        {/* 점검대상 */}
        <div className="inss-sec"><i />점검대상</div>
        <div className="inss-targets">
          {PART_ORDER.map((k) => (
            <span key={k} className="tg">
              <i className={'bx' + (included.has(k) ? ' on' : '')}>{included.has(k) ? '✓' : ''}</i>
              {PART_NAME[k]}
            </span>
          ))}
        </div>

        {/* 공정별 점검표 */}
        {ordered.map((p) => (
          <div key={p.part} className="inss-part">
            <div className="inss-sec"><i />{PART_NAME[p.part] || p.part}</div>
            <table className="inss-tbl">
              <thead>
                <tr>
                  <th className="q">점검항목</th>
                  <th className="c">양호</th>
                  <th className="c">미흡</th>
                  <th className="c">해당없음</th>
                  <th className="r">비고(보완계획)</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((it, i) => {
                  const col = it.result != null ? RES_COL[it.result] : undefined
                  return (
                    <tr key={it.code}>
                      <td className="q">{i + 1}. {it.label}</td>
                      <td className="c">{col === 0 ? '✓' : ''}</td>
                      <td className="c">{col === 1 ? '✓' : ''}</td>
                      <td className="c">{col === 2 ? '✓' : ''}</td>
                      <td className="r"><div className="memo">{it.remark || ''}</div></td>
                    </tr>
                  )
                })}
                {p.items.length === 0 && (
                  <tr><td colSpan={5} className="q" style={{ textAlign: 'center', color: '#888' }}>점검 항목이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
