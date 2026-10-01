// 종사자 안전·보건 점검표 — 실물 양식 보기 [054]
// 점검표 1장(학교×점검일, 공정별 점검 묶음)을 제출 PDF와 같은 서식으로 표시.
// [인쇄 / PDF 저장]으로 브라우저 인쇄 → PDF 생성 가능. 조회 전용(수정은 이어서 작성에서).
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { PARTDEF } from '../pages/InspectionForm'
import type { InspExtra } from '../lib/inspExtra'
import { SignImage, waitForSheetImages } from './SignImage'
import '../styles/inspectsheet.css'
import { normalizeApproval, primaryIdx, titleFor } from '../lib/approval' // [118] [123] 확인자 공용 규칙(학교/기관 구분·주확인자=담당자)

// 기존 사용처(Inspection.tsx 등) 호환 재수출 — SignImage 본체는 components/SignImage.tsx로 이동.
export { SignImage } from './SignImage'

export type SheetItem = { code: string; label: string; result?: string | null; remark?: string | null }
export type SheetPart = {
  part: string
  items: SheetItem[]
  // image_ref: 손글씨 서명 이미지 저장경로(01_안전점검/YYYY-MM/sign_*.png). 없으면 텍스트 서명. [054]
  signatures: { signer: string; signed_at?: string | null; image_ref?: string | null; image_data?: string | null }[] // image_data: 웹 서명패드 PNG(dataURL, 제출 전 메일 PDF용) [120]
}
export type SheetData = {
  schoolName: string
  manager?: string
  date: string // 점검일 ('' = 작성중)
  parts: SheetPart[]
  extra?: InspExtra // 부가정보 — 기본정보·점검대상·기타의견·사진대지·확인자 [057]
  approval?: { title: string; name: string }[] // [104] 대장 결재선 — 결재란 칸 구성 (없으면 담당자 1칸)
}

const PART_NAME: Record<string, string> = {
  catering: '급식종사자', night_duty: '당직업무', commute: '통학보조', facility: '시설관리', cleaning: '미화원',
}
const PART_ORDER = ['catering', 'night_duty', 'commute', 'facility', 'cleaning']
// 저장값 → 표시 컬럼 (구 시드 ok/fix 값도 방어적으로 수용)
const RES_COL: Record<string, 0 | 1 | 2> = { good: 0, ok: 0, poor: 1, fix: 1, na: 2 }

// 양식 본문 — 오버레이 보기와 메일 PDF 캡처([062])가 공용으로 사용
export function InspectionSheetBody({ sheet }: { sheet: SheetData }) {
  const signer = sheet.parts.flatMap((p) => p.signatures).find((s) => s.signer)?.signer || ''
  const signedAt = sheet.parts
    .flatMap((p) => p.signatures)
    .map((s) => (s.signed_at || '').slice(0, 10))
    .find(Boolean) || ''
  // 손글씨 서명 이미지 저장경로 — 있으면 이미지로, 없으면 '(서명)' 텍스트로 표시. [054]
  const signImageRef = sheet.parts
    .flatMap((p) => p.signatures)
    .map((s) => s.image_ref || '')
    .find(Boolean) || ''
  const included = new Set(sheet.parts.map((p) => p.part))
  const ordered = PART_ORDER.filter((k) => included.has(k)).map((k) => sheet.parts.find((p) => p.part === k)!)
  const extra = sheet.extra
  const info = extra?.info
  // 점검대상 체크 — 부가정보(당직 등 점검표 없는 공정 포함)가 있으면 그것을, 없으면 저장된 공정 기준
  const targets = extra?.targets?.length ? new Set(extra.targets) : included
  const finalSigner = extra?.signer || signer
  // 현장앱 다중 결재란(있으면 우선) — {직책, 서명자, 서명이미지 저장경로}
  const approvalLines = extra?.approval_lines ?? []

  // [120] 결재란 — 결재선 전 단계 칸(안전담당자·행정실장·교장). 서명한 확인자는 해당 직책 칸에 서명(손글씨 이미지 우선, 없으면 성명),
  // 미서명 칸은 수기 결재용 공란. 주서명(확인자·담당자)은 기본 확인자 칸(안전담당자)에, 현장앱/웹 추가 확인자(approval_lines)는 직책이 같은 칸에.
  const line = normalizeApproval(sheet.approval, { name: sheet.schoolName }) // [123] 학교: 담당자·행정실장·교장 / 기관: 담당자·팀장·과장
  const primary = primaryIdx(line)
  const mainSig = sheet.parts.flatMap((p) => p.signatures).find((s) => s.signer || s.image_ref || s.image_data)
  type Cell = { title: string; name: string; imageRef?: string | null; imageData?: string | null }
  const cells: Cell[] = line.map((st) => ({ title: st.title, name: '' }))
  if (finalSigner || signImageRef || mainSig?.image_data) {
    cells[primary] = { ...cells[primary], name: finalSigner, imageRef: signImageRef || null, imageData: mainSig?.image_data || null }
  }
  for (const ln0 of approvalLines) {
    if (!ln0.signer && !ln0.image_ref && !ln0.image_data) continue
    const ln = { ...ln0, title: titleFor({ name: sheet.schoolName }, ln0.title || '') } // [126] 기관: 행정실장→팀장·교장→과장
    const k = cells.findIndex((c, i) => c.title === ln.title && !(c.name || c.imageRef || c.imageData) && !(i === primary && finalSigner))
    const cell = { title: ln.title || '확인자', name: ln.signer || '', imageRef: ln.image_ref || null, imageData: ln.image_data || null }
    if (k >= 0) cells[k] = cell
    else if (!cells.some((c) => c.title === cell.title && c.name === cell.name)) cells.push(cell) // 결재선 밖 서명도 유실 없이 칸 추가
  }
  const photoSlots = ordered.flatMap((p) => {
    const def = PARTDEF.find((d) => d.key === p.part)
    return ((def && extra?.photos?.[def.label]) || []).filter((s) => s.name || s.dataUrl || s.caption)
  })

  return (
      <div className="inss-page">
        {/* 제목 + 결재란 */}
        <div className="inss-head" data-brk>
          <h1>종사자 안전·보건 점검표</h1>
          <table className="inss-approve">
            <tbody>
              <tr>
                <td className="lab" rowSpan={2}><span>결</span><span>재</span></td>
                {cells.map((c, i) => <td className="t" key={i}>{c.title}</td>)}
              </tr>
              <tr>
                {cells.map((c, i) => (
                  <td className="sign" key={i}>
                    {c.imageRef
                      ? <SignImage refPath={c.imageRef} />
                      : c.imageData
                        ? <img src={c.imageData} alt="서명" className="sgimg" />
                        : c.name && <span className="sg">{c.name}</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기본정보 */}
        <div className="inss-sec" data-brk><i />기본정보</div>
        <div className="inss-info" data-brk>
          <label><span>학교(기관)명</span><div className="v">{sheet.schoolName}</div></label>
          <label><span>소속명</span><div className="v">{info?.org || ''}</div></label>
          <label><span>부서명</span><div className="v">{info?.dept || ''}</div></label>
          <label><span>직책</span><div className="v">{info?.role || ''}</div></label>
          <label><span>작성자</span><div className="v">{info?.writer || sheet.manager || ''}</div></label>
          <label><span>작성일</span><div className="v">{info?.writeDate || signedAt || sheet.date}</div></label>
          <label><span>점검일</span><div className="v">{info?.inspectDate || sheet.date}</div></label>
          <label><span>점검장소</span><div className="v">{info?.place || ''}</div></label>
          <label><span>재해형태</span><div className="v">{info?.accType || ''}</div></label>
        </div>

        {/* 점검대상 */}
        <div className="inss-sec" data-brk><i />점검대상</div>
        <div className="inss-targets" data-brk>
          {PART_ORDER.map((k) => (
            <span key={k} className="tg">
              <i className={'bx' + (targets.has(k) ? ' on' : '')}>{targets.has(k) && <CheckMark white />}</i>
              {PART_NAME[k]}
            </span>
          ))}
        </div>

        {/* 공정별 점검표 — 표준 문항 전체를 그리고, 저장된 결과를 코드로 매칭해 표시 [056] */}
        {ordered.map((p) => {
          const def = PARTDEF.find((d) => d.key === p.part)
          const saved = new Map(p.items.map((it) => [it.code, it]))
          const rows = def?.q
            ? def.q.map((question, i) => {
                const [main, sub] = question.split('||')
                const code = `${def.label}-${i + 1}`
                const it = saved.get(code)
                return { code, main, sub, result: it?.result ?? null, remark: it?.remark ?? '' }
              })
            : p.items.map((it) => ({ code: it.code, main: it.label, sub: undefined as string | undefined, result: it.result ?? null, remark: it.remark ?? '' }))
          for (const it of p.items) {
            if (!rows.some((r) => r.code === it.code)) {
              rows.push({ code: it.code, main: it.label, sub: undefined, result: it.result ?? null, remark: it.remark ?? '' })
            }
          }
          return (
            <div key={p.part} className="inss-part">
              {/* 섹션 제목·표 머리·첫 행은 한 덩어리(페이지 분리 시 제목만 남지 않게) */}
              <div className="inss-sec" data-brk><i />{PART_NAME[p.part] || p.part}</div>
              <table className="inss-tbl">
                <colgroup><col className="q" /><col className="c" /><col className="c" /><col className="c" /><col className="r" /></colgroup>
                <thead>
                  <tr>
                    <th>점검항목</th>
                    <th>양호</th>
                    <th>미흡</th>
                    <th>해당없음</th>
                    <th>비고(보완계획)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const col = r.result != null ? RES_COL[r.result] : undefined
                    return (
                      <tr key={r.code} data-brk={i > 0 ? '' : undefined}>
                        <td className="q">{i + 1}. {r.main}{r.sub && <div className="sub">{r.sub}</div>}</td>
                        <td className="c">{col === 0 && <CheckMark />}</td>
                        <td className="c">{col === 1 && <CheckMark />}</td>
                        <td className="c">{col === 2 && <CheckMark />}</td>
                        <td className="r"><div className="memo">{r.remark || ''}</div></td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="q" style={{ textAlign: 'center', color: '#888' }}>점검 항목이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* 기타 의견 */}
        <div className="inss-sec" data-brk><i />기타 의견</div>
        <div className="inss-etc">{extra?.etc || ''}</div>

        {/* 사진대지 — 실물 양식처럼 2열 사진 박스 + 설명 박스 */}
        <div className="inss-sec" data-brk><i />사진대지</div>
        {photoSlots.length === 0
          ? <div className="inss-empty">등록된 사진이 없습니다.</div>
          : (
            <div className="inss-photos">
              {photoSlots.map((sl, i) => (
                <figure key={i} className="inss-photo" data-brk={i % 2 === 0 ? '' : undefined}>
                  <div className="img">
                    {sl.dataUrl ? <img src={sl.dataUrl} alt={sl.caption || sl.name} /> : <span className="ph">{sl.name || '사진'}</span>}
                  </div>
                  <figcaption>{sl.caption || ''}</figcaption>
                </figure>
              ))}
            </div>
          )}
        {/* [120] 하단 확인자 섹션 제거 — 서명은 상단 결재란에 표기 */}
      </div>
  )
}

// [120] 체크 표시 — 실물 양식과 같은 가는 선 체크(SVG, 인쇄·PDF 캡처 모두 선명)
function CheckMark({ white }: { white?: boolean }) {
  return (
    <svg className="inss-ck" viewBox="0 0 16 16" width={white ? 12 : 17} height={white ? 12 : 17} aria-hidden>
      <path d="M3 8.4 6.4 11.6 13 4.6" fill="none" stroke={white ? '#fff' : '#333'} strokeWidth={white ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function InspectionSheetView({ sheet, onClose }: { sheet: SheetData; onClose: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // 서명 이미지(비동기 fetch)가 아직 로딩 중일 때 바로 인쇄하면 서명 칸이 비어 출력됨 — 로드 완료 후 인쇄.
  async function printSheet() {
    if (bodyRef.current) await waitForSheetImages(bodyRef.current)
    window.print()
  }
  // document.body 포탈 — 앱 레이아웃(오버플로·포지셔닝) 영향 없이 인쇄 시 양식만 출력되게 [054]
  return createPortal(
    <div className="inss-overlay" role="dialog" aria-label="종사자 안전·보건 점검표">
      {/* [120] 인쇄 용지 A4 세로 고정 — 번들된 다른 인쇄 CSS(riskreport 가로)보다 우선 */}
      <style>{'@media print { @page { size: A4 portrait; margin: 12mm 12mm } }'}</style>
      <div className="inss-bar">
        <b>종사자 안전·보건 점검표 — {sheet.schoolName}{sheet.date ? ` · ${sheet.date}` : ' · 작성중'}</b>
        <div className="sp" />
        <button className="btn btn-primary" onClick={() => { void printSheet() }}><Printer size={14} /> 인쇄 / PDF 저장</button>
        <button className="btn btn-ghost" onClick={onClose}><X size={14} /> 닫기</button>
      </div>
      <div ref={bodyRef}>
        <InspectionSheetBody sheet={sheet} />
      </div>
    </div>,
    document.body,
  )
}
