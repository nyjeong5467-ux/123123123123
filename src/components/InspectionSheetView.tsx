// 종사자 안전·보건 점검표 — 실물 양식 보기 [054]
// 점검표 1장(학교×점검일, 공정별 점검 묶음)을 제출 PDF와 같은 서식으로 표시.
// [인쇄 / PDF 저장]으로 브라우저 인쇄 → PDF 생성 가능. 조회 전용(수정은 이어서 작성에서).
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { PARTDEF, type InspExtra } from '../pages/InspectionForm'
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
  extra?: InspExtra // 부가정보 — 기본정보·점검대상·기타의견·사진대지·확인자 [057]
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
  const extra = sheet.extra
  const info = extra?.info
  // 점검대상 체크 — 부가정보(당직 등 점검표 없는 공정 포함)가 있으면 그것을, 없으면 저장된 공정 기준
  const targets = extra?.targets?.length ? new Set(extra.targets) : included
  const finalSigner = extra?.signer || signer

  // document.body 포탈 — 앱 레이아웃(오버플로·포지셔닝) 영향 없이 인쇄 시 양식만 출력되게 [054]
  return createPortal(
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
                <td className="sign">{finalSigner}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 기본정보 */}
        <div className="inss-sec"><i />기본정보</div>
        <div className="inss-info">
          <label><span>학교(기관)명</span><div className="v">{sheet.schoolName}</div></label>
          <label><span>소속명</span><div className="v">{info?.org || ''}</div></label>
          <label><span>부서명</span><div className="v">{info?.dept || ''}</div></label>
          <label><span>직책</span><div className="v">{info?.role || ''}</div></label>
          <label><span>작성자</span><div className="v">{info?.writer || finalSigner || sheet.manager || ''}</div></label>
          <label><span>작성일</span><div className="v">{info?.writeDate || signedAt || sheet.date}</div></label>
          <label><span>점검일</span><div className="v">{info?.inspectDate || sheet.date}</div></label>
          <label><span>점검장소</span><div className="v">{info?.place || ''}</div></label>
          <label><span>재해형태</span><div className="v">{info?.accType || ''}</div></label>
        </div>

        {/* 점검대상 */}
        <div className="inss-sec"><i />점검대상</div>
        <div className="inss-targets">
          {PART_ORDER.map((k) => (
            <span key={k} className="tg">
              <i className={'bx' + (targets.has(k) ? ' on' : '')}>{targets.has(k) ? '✓' : ''}</i>
              {PART_NAME[k]}
            </span>
          ))}
        </div>

        {/* 공정별 점검표 — 표준 문항 전체를 그리고, 저장된 결과를 코드로 매칭해 표시 [056]
            (과거 기록에 일부 항목만 저장돼 있어도 양식은 항상 전 문항으로 보임) */}
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
          // 표준 문항 코드와 다른 과거 기록(구형식 코드 GS-01 등)은 표 하단에 이어 표시 — 저장값 유실 없이
          for (const it of p.items) {
            if (!rows.some((r) => r.code === it.code)) {
              rows.push({ code: it.code, main: it.label, sub: undefined, result: it.result ?? null, remark: it.remark ?? '' })
            }
          }
          return (
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
                  {rows.map((r, i) => {
                    const col = r.result != null ? RES_COL[r.result] : undefined
                    return (
                      <tr key={r.code}>
                        <td className="q">{i + 1}. {r.main}{r.sub && <div className="sub">{r.sub}</div>}</td>
                        <td className="c">{col === 0 ? '✓' : ''}</td>
                        <td className="c">{col === 1 ? '✓' : ''}</td>
                        <td className="c">{col === 2 ? '✓' : ''}</td>
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

        {/* 기타 의견 [057] */}
        <div className="inss-sec"><i />기타 의견</div>
        <div className="inss-etc">{extra?.etc || ''}</div>

        {/* 사진대지 [057] */}
        <div className="inss-sec"><i />사진대지</div>
        {(() => {
          const groups = ordered
            .map((p) => {
              const def = PARTDEF.find((d) => d.key === p.part)
              const slots = (def && extra?.photos?.[def.label]) || []
              return { key: p.part, name: PART_NAME[p.part] || p.part, slots: slots.filter((s) => s.name || s.dataUrl || s.caption) }
            })
            .filter((g) => g.slots.length > 0)
          if (groups.length === 0) return <div className="inss-empty">등록된 사진이 없습니다.</div>
          return groups.map((g) => (
            <div key={g.key} className="inss-photogrp">
              <div className="t">{g.name}</div>
              <div className="inss-photos">
                {g.slots.map((s, i) => (
                  <figure key={i} className="inss-photo">
                    {s.dataUrl ? <img src={s.dataUrl} alt={s.caption || s.name} /> : <div className="ph">{s.name || '사진'}</div>}
                    <figcaption>{s.caption || s.name || ''}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))
        })()}

        {/* 확인자 [057] */}
        <div className="inss-sec"><i />확인자</div>
        <div className="inss-signer">
          <span className="lab">확인자(담당자)</span>
          <span className="nm">{finalSigner || ''}</span>
          <span className="st">{finalSigner ? '(서명)' : '(미서명)'}</span>
          {signedAt && <span className="dt">서명일 {signedAt}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
