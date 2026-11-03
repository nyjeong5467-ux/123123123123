// [정기평가] 위험성평가표 (3-2) + 위험성 감소대책 (3-3 불안전한 행동 · 3-4 불안전한 상태) — 3단계 (0806 요청).
// 공정(부서)별로 점검자가 빈 표에 행을 추가해 작성. 1·2단계(유해위험정보·청취조사) 내용을 참고 패널로 제공.
// 위험성 = 가능성(빈도) × 중대성(강도) 자동 계산. 8점 이상 행은 강조되고 감소대책(3-3/3-4) 작성 대상.
// 사진(개선 전·후)은 프로젝트 관례(0709 회의)에 따라 파일명 메타만 저장.
// 저장은 부모 조사표 문서(PUT /risk/survey)에 assess/reduce_behavior/reduce_state로 실림 — 백엔드 계약 변경 없음.
import { type CSSProperties, useMemo } from 'react'
import { Camera, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { DeptInfoDoc } from './DeptHazardInfo'
import type { HearingDoc } from './HearingSurvey'

/* ===================== 데이터 모델 ===================== */
export type AssessRow = {
  id: string
  task: string // 세부작업명
  factor_class: string // 위험분류
  legal_basis: string // 법적근거
  situation: string // 위험발생 상황 및 결과
  measure_current: string // 현재의 안전보건조치
  likelihood: number // 가능성(빈도) 1~5
  severity: number // 중대성(강도) 1~5
  reduction: string // 위험성 감소대책
  after_risk: string // 개선후 위험성
  plan_date: string // 개선예정일
  done_date: string // 완료일
  owner: string // 담당자
}
export type BehaviorRow = {
  id: string
  task: string // 감소대책 수립 단위작업명
  accident_type: string // 재해 형태
  measure: string // 감소대책 (구체적으로)
  result: string // 조치결과
  result_date: string // 조치일자
  education: string // 교육
  note: string // 비고
}
export type StateRow = {
  id: string
  task: string // 감소대책 수립 단위작업 명
  accident_type: string // 사고 유형
  detail: string // 감소대책 상세내용
  result: string // 조치결과
  due: string // 조치기한
  owner: string // 조치담당자
  done_date: string // 조치완료일
  photo_before: string // 개선 전 사진 (파일명 메타)
  photo_after: string // 개선 후 사진 (파일명 메타)
}
export type AssessDoc = Record<string, AssessRow[]>
export type BehaviorDoc = Record<string, BehaviorRow[]>
export type StateDoc = Record<string, StateRow[]>

export const ASSESS_PARTS: [string, string][] = [
  ['catering', '급식'], ['facility', '시설'], ['cleaning', '미화'], ['commute', '통학'], ['night_duty', '당직'],
]
const FACTOR_CLASSES = ['기계적 요인', '전기적 요인', '화학(물질)적 요인', '작업환경 요인', '작업특성 요인', '기타']

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}
export function emptyAssessRow(): AssessRow {
  return { id: rid(), task: '', factor_class: FACTOR_CLASSES[0], legal_basis: '산업안전보건기준에 관한 규칙 제조', situation: '', measure_current: '', likelihood: 2, severity: 3, reduction: '', after_risk: '', plan_date: '', done_date: '', owner: '' }
}

// 위험성 크기 → 라벨·색 (실물 양식: ≤6 낮음 · 8 보통 · 9~12 약간 높음 · 그 이상 높음)
export function riskLabel(score: number): { label: string; cls: 'ok' | 'mid' | 'warn' | 'bad' } {
  if (score >= 15) return { label: '높음', cls: 'bad' }
  if (score >= 9) return { label: '약간 높음', cls: 'warn' }
  if (score >= 8) return { label: '보통', cls: 'mid' }
  return { label: '낮음', cls: 'ok' }
}
const RISK_COLORS: Record<string, { bg: string; ink: string }> = {
  ok: { bg: 'var(--ok-soft)', ink: 'var(--ok-ink)' },
  mid: { bg: 'var(--info-soft)', ink: 'var(--info-ink)' },
  warn: { bg: 'var(--amber-soft)', ink: 'var(--amber-ink)' },
  bad: { bg: 'var(--red-soft)', ink: 'var(--red-ink)' },
}

/* ===================== 스타일 ===================== */
const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 14, background: 'var(--card)' }
const SEC_H: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 10, flexWrap: 'wrap' }
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const TH: CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--muted)', padding: '6px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' }
const TD: CSSProperties = { padding: '4px 4px', verticalAlign: 'top' }
const IN: CSSProperties = { width: '100%', minHeight: 34, padding: '6px 8px', fontSize: 12 }
const TAREA: CSSProperties = { ...IN, height: 'auto', minHeight: 52, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }
const SEL_N: CSSProperties = { width: 52, textAlign: 'center', padding: '6px 4px', fontSize: 12 }

function NumSel(p: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="select" style={SEL_N} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

/* ===================== 컴포넌트 ===================== */
export function AssessmentTable(p: {
  sid: string
  part: string
  onPart: (part: string) => void
  assess: AssessDoc | undefined
  behavior: BehaviorDoc | undefined
  state: StateDoc | undefined
  deptInfo: DeptInfoDoc | undefined // 1단계 참고
  hearing: HearingDoc | undefined //   2단계 참고
  onChange: (next: { assess?: AssessDoc; behavior?: BehaviorDoc; state?: StateDoc }) => void
  onSave: () => void
  busy: boolean
  msg: string
  onNext?: () => void // 다음 탭으로 이동 (하단 우측 버튼)
}) {
  const { part } = p
  const partLabel = ASSESS_PARTS.find(([k]) => k === part)?.[1] ?? part
  const rows = p.assess?.[part] ?? []
  const bRows = p.behavior?.[part] ?? []
  const sRows = p.state?.[part] ?? []

  const highRows = rows.filter((r) => r.likelihood * r.severity >= 8)

  // 1·2단계 참고 자료
  const refInfo = p.deptInfo?.[part]
  const refHearing = useMemo(
    () => Object.values(p.hearing ?? {}).filter((h) => h.part === part && h.exps.some((e) => e.text.trim())),
    [p.hearing, part],
  )

  function setRows(next: AssessRow[]) {
    p.onChange({ assess: { ...(p.assess ?? {}), [part]: next } })
  }
  function patchRow(id: string, next: Partial<AssessRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }
  function setB(next: BehaviorRow[]) {
    p.onChange({ behavior: { ...(p.behavior ?? {}), [part]: next } })
  }
  function setS(next: StateRow[]) {
    p.onChange({ state: { ...(p.state ?? {}), [part]: next } })
  }

  function pickPhoto(cb: (name: string) => void) {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.onchange = () => cb(inp.files?.[0]?.name ?? '')
    inp.click()
  }

  return (
    <div>
      {/* 공정(부서) 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {ASSESS_PARTS.map(([k, label]) => {
          const active = part === k
          const n = p.assess?.[k]?.length ?? 0
          return (
            <button key={k} onClick={() => p.onPart(k)} className="btn"
              style={{
                borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 800,
                background: active ? 'var(--violet)' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink-2)',
                border: '1px solid ' + (active ? 'var(--violet)' : 'var(--line)'),
              }}>
              {label}{n > 0 && ` · ${n}`}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', ...HINT }}>공정명: {partLabel} · 위험성 = 가능성(빈도) × 중대성(강도), 8점 이상은 감소대책 작성 대상</span>
      </div>

      {/* 1·2단계 참고 패널 */}
      {(refInfo || refHearing.length > 0) && (
        <details style={{ marginTop: 8, border: '1px dashed var(--line)', borderRadius: 12, padding: '8px 12px', background: 'var(--card-2)' }}>
          <summary style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', color: 'var(--violet-d)' }}>
            참고 — 이 공정의 유해위험정보·청취조사 내용 보기 (작성 근거)
          </summary>
          <div style={{ fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
            {refInfo && refInfo.equips.length > 0 && (
              <div><b>기계·기구:</b> {refInfo.equips.map((e) => `${e.name}(${e.qty})`).join(', ')}</div>
            )}
            {refInfo && refInfo.chems.length > 0 && (
              <div><b>화학물질:</b> {refInfo.chems.map((c) => c.name).join(', ')}</div>
            )}
            {refHearing.map((h, i) => (
              <div key={i}><b>청취({h.worker_name}):</b> {h.exps.filter((e) => e.text.trim()).map((e) => e.text + (e.cause ? ` (${e.cause})` : '')).join(' / ')}</div>
            ))}
          </div>
        </details>
      )}

      {/* ── 3-2 위험성평가표 ── */}
      <div style={SEC}>
        <div style={SEC_H}>
          [정기평가] 위험성평가표
          <span style={HINT}>점검자가 직접 작성 — 행 추가로 세부작업별 입력</span>
          {highRows.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: 'var(--amber-ink)', background: 'var(--amber-soft)', borderRadius: 999, padding: '3px 10px' }}>
              <TriangleAlert size={12} /> 위험성 8점 이상 {highRows.length}건 → 아래 감소대책(3-3·3-4) 작성 필요
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1560 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 34 }}>연번</th>
                <th style={{ ...TH, width: 120 }}>세부작업명</th>
                <th style={{ ...TH, width: 130 }}>위험분류</th>
                <th style={{ ...TH, width: 150 }}>법적근거</th>
                <th style={TH}>위험발생 상황 및 결과</th>
                <th style={TH}>현재의 안전보건조치</th>
                <th style={{ ...TH, width: 56 }}>가능성<br />(빈도)</th>
                <th style={{ ...TH, width: 56 }}>중대성<br />(강도)</th>
                <th style={{ ...TH, width: 72 }}>위험성</th>
                <th style={TH}>위험성 감소대책</th>
                <th style={{ ...TH, width: 64 }}>개선후<br />위험성</th>
                <th style={{ ...TH, width: 108 }}>개선예정일</th>
                <th style={{ ...TH, width: 108 }}>완료일</th>
                <th style={{ ...TH, width: 84 }}>담당자</th>
                <th style={{ ...TH, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={15} style={{ ...TD, textAlign: 'center', padding: 22, ...HINT }}>
                  작성된 행이 없습니다 — 아래 "행 추가"를 눌러 청취조사·유해위험정보 내용을 바탕으로 작성하세요.
                </td></tr>
              )}
              {rows.map((r, i) => {
                const score = r.likelihood * r.severity
                const lb = riskLabel(score)
                const col = RISK_COLORS[lb.cls]
                const high = score >= 8
                return (
                  <tr key={r.id} style={high ? { background: 'color-mix(in srgb, var(--amber-soft) 45%, transparent)' } : undefined}>
                    <td style={{ ...TD, textAlign: 'center', fontSize: 12, fontWeight: 800, paddingTop: 12 }}>{i + 1}</td>
                    <td style={TD}><textarea className="input" style={TAREA} value={r.task} placeholder="예) 조리작업" onChange={(e) => patchRow(r.id, { task: e.target.value })} /></td>
                    <td style={TD}>
                      <select className="select" style={{ ...IN, fontSize: 11.5 }} value={r.factor_class} onChange={(e) => patchRow(r.id, { factor_class: e.target.value })}>
                        {FACTOR_CLASSES.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td style={TD}><textarea className="input" style={TAREA} value={r.legal_basis} onChange={(e) => patchRow(r.id, { legal_basis: e.target.value })} /></td>
                    <td style={TD}><textarea className="input" style={TAREA} value={r.situation} placeholder="예) 뜨거운 국물·식용유·물에 의한 화상 위험" onChange={(e) => patchRow(r.id, { situation: e.target.value })} /></td>
                    <td style={TD}><textarea className="input" style={TAREA} value={r.measure_current} placeholder="예) 앞치마·고무장갑·미끄럼방지장화 착용 후 작업" onChange={(e) => patchRow(r.id, { measure_current: e.target.value })} /></td>
                    <td style={{ ...TD, textAlign: 'center' }}><NumSel value={r.likelihood} onChange={(n) => patchRow(r.id, { likelihood: n })} /></td>
                    <td style={{ ...TD, textAlign: 'center' }}><NumSel value={r.severity} onChange={(n) => patchRow(r.id, { severity: n })} /></td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <div style={{ background: col.bg, color: col.ink, borderRadius: 10, padding: '6px 4px', fontWeight: 800, fontSize: 13 }}>
                        {score}
                        <div style={{ fontSize: 9.5, fontWeight: 800 }}>{lb.label}</div>
                      </div>
                    </td>
                    <td style={TD}><textarea className="input" style={TAREA} value={r.reduction} placeholder="예) 고무장갑 등이 흘러내리지 않도록 수시 확인" onChange={(e) => patchRow(r.id, { reduction: e.target.value })} /></td>
                    <td style={TD}><input className="input" style={{ ...IN, textAlign: 'center' }} value={r.after_risk} placeholder="4" onChange={(e) => patchRow(r.id, { after_risk: e.target.value })} /></td>
                    <td style={TD}><input className="input" style={IN} type="date" value={r.plan_date} onChange={(e) => patchRow(r.id, { plan_date: e.target.value })} /></td>
                    <td style={TD}><input className="input" style={IN} type="date" value={r.done_date} onChange={(e) => patchRow(r.id, { done_date: e.target.value })} /></td>
                    <td style={TD}><input className="input" style={IN} value={r.owner} placeholder="담당자" onChange={(e) => patchRow(r.id, { owner: e.target.value })} /></td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <button className="btn" style={{ padding: '4px 7px' }} title="행 삭제" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setRows([...rows, emptyAssessRow()])}>
          <Plus size={13} /> 행 추가
        </button>
      </div>

      {/* ── 3-3 위험성 감소대책 (불안전한 행동) ── */}
      <div style={SEC}>
        <div style={SEC_H}>
          3-3 위험성 감소대책 (불안전한 행동)
          <span style={HINT}>3-2 평가표 내 위험성 크기 8점 이상인 불안전한 행동 항목 — 작업별로 작성</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 130 }}>감소대책 수립<br />단위작업명</th>
                <th style={{ ...TH, width: 100 }}>재해 형태</th>
                <th style={TH}>감소대책 (위험성평가표 감소대책보다 구체적으로 제시)</th>
                <th style={{ ...TH, width: 90 }}>조치결과</th>
                <th style={{ ...TH, width: 108 }}>조치일자</th>
                <th style={{ ...TH, width: 130 }}>교육</th>
                <th style={{ ...TH, width: 90 }}>비고</th>
                <th style={{ ...TH, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {bRows.length === 0 && (
                <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 18, ...HINT }}>
                  {highRows.length > 0 ? '8점 이상 항목이 있습니다 — 행을 추가해 작성하세요.' : '작성된 감소대책이 없습니다.'}
                </td></tr>
              )}
              {bRows.map((r) => (
                <tr key={r.id}>
                  <td style={TD}><textarea className="input" style={TAREA} value={r.task} placeholder="예) 조리/청소/이동 작업" onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, task: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.accident_type} placeholder="예) 화상" onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, accident_type: e.target.value } : x))} /></td>
                  <td style={TD}><textarea className="input" style={TAREA} value={r.measure} placeholder="예) 과열된 조리기구·물·식용유 등에 화상 사고가 발생하지 않도록 보호구 착용 및 수시 확인" onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, measure: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.result} placeholder="예) 교육 실시" onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, result: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} type="date" value={r.result_date} onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, result_date: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.education} placeholder="예) 한국산업안전협회 담당자" onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, education: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.note} onChange={(e) => setB(bRows.map((x) => x.id === r.id ? { ...x, note: e.target.value } : x))} /></td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <button className="btn" style={{ padding: '4px 7px' }} onClick={() => setB(bRows.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setB([...bRows, { id: rid(), task: '', accident_type: '', measure: '', result: '', result_date: '', education: '', note: '' }])}>
          <Plus size={13} /> 행 추가
        </button>
      </div>

      {/* ── 3-4 위험성 감소대책 (불안전한 상태) ── */}
      <div style={SEC}>
        <div style={SEC_H}>
          3-4 위험성 감소대책 (불안전한 상태)
          <span style={HINT}>8점 이상(또는 개선필요항목)인 불안전한 상태 개선 항목 — 개선 전·후 사진 포함</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 130 }}>감소대책 수립<br />단위작업 명</th>
                <th style={{ ...TH, width: 100 }}>사고 유형</th>
                <th style={TH}>위험성 감소대책 상세내용</th>
                <th style={{ ...TH, width: 90 }}>조치결과</th>
                <th style={{ ...TH, width: 108 }}>조치기한</th>
                <th style={{ ...TH, width: 90 }}>조치담당자</th>
                <th style={{ ...TH, width: 108 }}>조치완료일</th>
                <th style={{ ...TH, width: 120 }}>개선 전 사진</th>
                <th style={{ ...TH, width: 120 }}>개선 후 사진</th>
                <th style={{ ...TH, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {sRows.length === 0 && (
                <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', padding: 18, ...HINT }}>
                  {highRows.length > 0 ? '8점 이상 항목이 있습니다 — 행을 추가해 작성하세요.' : '작성된 감소대책이 없습니다.'}
                </td></tr>
              )}
              {sRows.map((r) => (
                <tr key={r.id}>
                  <td style={TD}><textarea className="input" style={TAREA} value={r.task} placeholder="예) 이동 작업" onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, task: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.accident_type} placeholder="예) 넘어짐" onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, accident_type: e.target.value } : x))} /></td>
                  <td style={TD}><textarea className="input" style={TAREA} value={r.detail} placeholder="예) 소독발판 바닥 파인부분 보수, 미끄럼방지 조치" onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, detail: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.result} onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, result: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} type="date" value={r.due} onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, due: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} value={r.owner} onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, owner: e.target.value } : x))} /></td>
                  <td style={TD}><input className="input" style={IN} type="date" value={r.done_date} onChange={(e) => setS(sRows.map((x) => x.id === r.id ? { ...x, done_date: e.target.value } : x))} /></td>
                  {(['photo_before', 'photo_after'] as const).map((f) => (
                    <td style={{ ...TD, textAlign: 'center' }} key={f}>
                      {r[f] ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet-d)', background: 'var(--violet-soft)', borderRadius: 8, padding: '5px 6px', wordBreak: 'break-all' }}>
                          {r[f]}
                          <div>
                            <button className="btn" style={{ marginTop: 4, fontSize: 10.5, padding: '2px 8px' }} onClick={() => setS(sRows.map((x) => x.id === r.id ? { ...x, [f]: '' } : x))}>제거</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn" style={{ fontSize: 11.5 }} onClick={() => pickPhoto((name) => { if (name) setS(sRows.map((x) => x.id === r.id ? { ...x, [f]: name } : x)) })}>
                          <Camera size={13} /> 사진 첨부
                        </button>
                      )}
                    </td>
                  ))}
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <button className="btn" style={{ padding: '4px 7px' }} onClick={() => setS(sRows.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ ...HINT, marginTop: 6 }}>※ 사진은 파일명만 기록됩니다 (실파일 업로드는 백엔드 연동 시 — 0709 회의 결정과 동일한 방식).</div>
        <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setS([...sRows, { id: rid(), task: '', accident_type: '', detail: '', result: '', due: '', owner: '', done_date: '', photo_before: '', photo_after: '' }])}>
          <Plus size={13} /> 행 추가
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={p.onSave} disabled={!p.sid || p.busy}>{p.busy ? '저장 중…' : '저장'}</button>
        {p.msg && <span style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>{p.msg}</span>}
        {p.onNext && (
          <button className="btn" style={{ marginLeft: 'auto', fontWeight: 800 }} onClick={p.onNext}>다음 →</button>
        )}
      </div>
    </div>
  )
}
