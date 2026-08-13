// 수시 위험성평가 — 사고성 산업재해 발생 시 프로세스 (0806 요청).
// 산업재해 발생 → ① 산업재해조사표 → ② 재해 재발방지계획 → ③ 수시위험성평가(평가표+감소대책) → ④ 교육일지 → 완료.
// 학교 컨텍스트(위험성평가 > 학교 선택)에 사고 건별 카드 + 4단계 스텝 에디터로 표시.
// 산업재해 모듈의 사고 기록(kind=accident)에서 "수시평가 시작"으로 케이스를 생성해 연동.
// 저장은 조사표 문서(PUT /risk/survey)의 adhoc_cases — 백엔드 계약 변경 없음. 실물 양식 4종 기반 핵심 필드 입력.
import { type CSSProperties, useEffect, useState } from 'react'
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, Plus, Siren, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'

/* ===================== 데이터 모델 (sections.adhoc_cases) ===================== */
export type AdhocInvest = {
  worker_name: string; job: string; hire_date: string; employ_type: string
  injury_type: string; injury_part: string; rest_days: string
  occur_dt: string; occur_place: string; work_type: string
  situation: string; cause: string; prevention: string
  writer: string; write_date: string; done: boolean
}
export type AdhocPrevent = { overview: string; causes: string; measures: string; done: boolean }
export type AdhocRow = { id: string; task: string; situation: string; likelihood: number; severity: number; reduction: string }
export type AdhocReduce = { task: string; accident_type: string; measure: string; result: string; result_date: string; education: string }
export type AdhocAssess = { rows: AdhocRow[]; reduce: AdhocReduce; done: boolean }
export type AdhocEdu = {
  date: string; time: string; place: string; instructor_title: string; instructor_name: string
  subject: string; content: string; materials: string; photo: string
  target_cnt: string; attend_cnt: string; absent_cnt: string; absent_reason: string
  attendees: { name: string; signed: boolean }[]
  done: boolean
}
export type AdhocCase = {
  id: string
  accident_id?: string
  title: string
  part: string
  created: string
  invest: AdhocInvest
  prevent: AdhocPrevent
  assess: AdhocAssess
  edu: AdhocEdu
}

type Accident = { id: string; school_id: string; kind: string; date: string; summary: string; detail: string }

const PARTS: [string, string][] = [
  ['catering', '급식'], ['facility', '시설'], ['cleaning', '미화'], ['commute', '통학'], ['night_duty', '당직'],
]
const STEPS = ['① 산업재해조사표', '② 재해 재발방지계획', '③ 수시위험성평가', '④ 교육일지'] as const

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function newCase(acc?: Accident): AdhocCase {
  return {
    id: rid(),
    accident_id: acc?.id,
    title: acc ? `${acc.date} ${acc.summary}` : '수시 위험성평가 (수동 등록)',
    part: 'catering',
    created: today(),
    invest: {
      worker_name: '', job: '', hire_date: '', employ_type: '상용',
      injury_type: '', injury_part: '', rest_days: '',
      occur_dt: acc?.date ?? '', occur_place: '', work_type: '',
      situation: acc?.detail || acc?.summary || '', cause: '', prevention: '',
      writer: '', write_date: today(), done: false,
    },
    prevent: { overview: '', causes: '', measures: '', done: false },
    assess: { rows: [], reduce: { task: '', accident_type: '', measure: '', result: '', result_date: '', education: '한국산업안전협회 담당자' }, done: false },
    edu: {
      date: '', time: '', place: '', instructor_title: '한국산업안전협회', instructor_name: '',
      subject: '', content: '1) 위험성평가 결과 공유 및 허용불가 위험성 항목에 대한 개선대책 및 숙지교육\n2) 재해사례 전파 및 안전작업방법 교육',
      materials: '수시위험성평가표, 재발방지계획서', photo: '',
      target_cnt: '', attend_cnt: '', absent_cnt: '', absent_reason: '',
      attendees: [], done: false,
    },
  }
}
export function caseStepDone(c: AdhocCase): boolean[] {
  return [c.invest.done, c.prevent.done, c.assess.done, c.edu.done]
}

/* ===================== 스타일 ===================== */
const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 12, background: 'var(--card)' }
const SEC_H: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 10, flexWrap: 'wrap' }
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const ROW: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }
const TA: CSSProperties = { height: 'auto', minHeight: 60, padding: '9px 12px', resize: 'vertical', lineHeight: 1.6, width: '100%', fontFamily: 'inherit' }
const F_W: CSSProperties = { minWidth: 150 }

function Field(p: { label: string; children: React.ReactNode; w?: number }) {
  return (
    <label className="field" style={{ ...F_W, ...(p.w ? { width: p.w, minWidth: p.w } : {}) }}>
      <span>{p.label}</span>
      {p.children}
    </label>
  )
}

/* ===================== 메인 섹션 (학교 컨텍스트용) ===================== */
export function AdhocSection(p: {
  sid: string
  schoolName: string
  cases: AdhocCase[] | undefined
  onChange: (cases: AdhocCase[]) => void
  onSave: () => void
  busy: boolean
  initialCaseId?: string // [081] 작성물 리스트에서 수시 행 클릭 시 해당 케이스 에디터 바로 열기
}) {
  const cases = p.cases ?? []
  const [selId, setSelId] = useState('')
  const selCase = cases.find((c) => c.id === selId) ?? null

  // [081] 케이스 목록 로드 완료 시 직행 대상 케이스 자동 선택
  useEffect(() => {
    if (p.initialCaseId && cases.some((c) => c.id === p.initialCaseId)) setSelId(p.initialCaseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.initialCaseId, cases.length])

  // 이 학교의 사고성 산재 목록 (수시평가 대상)
  const [accidents, setAccidents] = useState<Accident[]>([])
  useEffect(() => {
    if (!p.sid) return
    let alive = true
    api<Accident[]>('/accidents')
      .then((list) => {
        if (alive) setAccidents((Array.isArray(list) ? list : []).filter((a) => a.school_id === p.sid && a.kind === 'accident'))
      })
      .catch(() => { if (alive) setAccidents([]) })
    return () => { alive = false }
  }, [p.sid])

  function patchCase(next: Partial<AdhocCase>) {
    if (!selCase) return
    p.onChange(cases.map((c) => (c.id === selCase.id ? { ...c, ...next } : c)))
  }
  function startFromAccident(acc: Accident) {
    const c = newCase(acc)
    p.onChange([...cases, c])
    setSelId(c.id)
  }
  function startManual() {
    const c = newCase()
    p.onChange([...cases, c])
    setSelId(c.id)
  }

  const linkedAccidentIds = new Set(cases.map((c) => c.accident_id).filter(Boolean))
  const pendingAccidents = accidents.filter((a) => !linkedAccidentIds.has(a.id))

  /* ── 케이스 편집 화면 (2단 그리드에서 전체 폭 사용) ── */
  if (selCase) {
    return (
      <div className="ledger" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
        <div className="lh">
          <button className="rkh-back" onClick={() => setSelId('')}><ArrowLeft size={14} /> 수시평가 목록</button>
          <h2 style={{ marginLeft: 6 }}><Siren size={17} /> 수시 위험성평가 · {selCase.title}</h2>
          <div className="sp" />
          <button className="btn btn-primary" onClick={p.onSave} disabled={p.busy}>{p.busy ? '저장 중…' : '저장'}</button>
        </div>
        <div style={{ padding: '4px 24px 20px' }}>
          <CaseEditor schoolName={p.schoolName} c={selCase} patch={patchCase} />
        </div>
      </div>
    )
  }

  /* ── 목록 화면 ── */
  return (
    <div className="ledger" style={{ marginBottom: 0 }}>
      <div className="lh">
        <h2><Siren size={17} /> 수시 위험성평가 <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginLeft: 6 }}>사고성 산업재해 발생 시 실시</span></h2>
        {pendingAccidents.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, background: 'var(--red-soft)', color: 'var(--red-ink)', borderRadius: 999, padding: '3px 10px' }}>
            미착수 {pendingAccidents.length}건
          </span>
        )}
        <div className="sp" />
        <button className="btn btn-ghost" onClick={startManual}><Plus size={13} /> 수동 등록</button>
      </div>
      <div style={{ padding: '0 24px 18px' }}>
        <div style={{ ...HINT, padding: '8px 0 12px' }}>
          프로세스: 산업재해 발생 → ① 산업재해조사표 → ② 재해 재발방지계획 → ③ 수시위험성평가 → ④ 수시위험성평가 교육 → <b style={{ color: 'var(--ok-ink)' }}>완료</b>
        </div>

        {/* 미착수 산재 알림 */}
        {pendingAccidents.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--red-soft)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
            <Siren size={15} style={{ color: 'var(--red-ink)', flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{a.date} · {a.summary}</b>
              <div style={{ ...HINT }}>사고성 산업재해 — 수시 위험성평가를 실시해야 합니다</div>
            </div>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => startFromAccident(a)}>수시평가 시작</button>
          </div>
        ))}

        {/* 진행 중/완료 케이스 목록 */}
        {cases.length === 0 && pendingAccidents.length === 0 && (
          <div className="tstate">사고성 산업재해가 등록되면 여기서 수시 위험성평가를 진행합니다.</div>
        )}
        {cases.map((c) => {
          const done = caseStepDone(c)
          const doneCnt = done.filter(Boolean).length
          const finished = doneCnt === 4
          return (
            <div
              key={c.id}
              className="hm-clickable"
              role="button"
              tabIndex={0}
              onClick={() => setSelId(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 12, padding: '11px 14px', marginBottom: 8, cursor: 'pointer', background: 'var(--card-2)' }}
            >
              <span style={{ flex: '0 0 auto', width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 999, background: finished ? 'var(--ok-soft)' : 'var(--amber-soft)', color: finished ? 'var(--ok-ink)' : 'var(--amber-ink)' }}>
                {finished ? <CheckCircle2 size={16} /> : <Siren size={15} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>{c.title}</b>
                <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                  {STEPS.map((s, i) => (
                    <span key={s} className={'pillx ' + (done[i] ? 'ok' : 'todo')} style={{ fontSize: 10.5 }}>{s}</span>
                  ))}
                </div>
              </div>
              <span className={'pillx ' + (finished ? 'ok' : 'warn')}>{finished ? '완료' : `진행 ${doneCnt}/4`}</span>
              <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ===================== 케이스 에디터 (4단계) ===================== */
function CaseEditor(p: { schoolName: string; c: AdhocCase; patch: (next: Partial<AdhocCase>) => void }) {
  const { c } = p
  const done = caseStepDone(c)
  const firstOpen = done.findIndex((d) => !d)
  const [step, setStep] = useState(firstOpen === -1 ? 3 : firstOpen)

  const iv = c.invest
  const pv = c.prevent
  const as = c.assess
  const ed = c.edu
  const setIv = (n: Partial<AdhocInvest>) => p.patch({ invest: { ...iv, ...n } })
  const setPv = (n: Partial<AdhocPrevent>) => p.patch({ prevent: { ...pv, ...n } })
  const setAs = (n: Partial<AdhocAssess>) => p.patch({ assess: { ...as, ...n } })
  const setEd = (n: Partial<AdhocEdu>) => p.patch({ edu: { ...ed, ...n } })

  function doneBtn(isDone: boolean, label: string, toggle: () => void) {
    return (
      <button className="btn" style={isDone ? { background: 'var(--ok-soft)', color: 'var(--ok-ink)', fontWeight: 800 } : undefined} onClick={toggle}>
        <CheckCircle2 size={14} /> {isDone ? `${label} 완료됨 (해제)` : `${label} 완료`}
      </button>
    )
  }

  return (
    <div>
      {/* 스텝퍼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {STEPS.map((s, i) => (
          <button
            key={s}
            className="btn"
            onClick={() => setStep(i)}
            style={{
              borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: 800,
              background: step === i ? 'var(--violet)' : done[i] ? 'var(--ok-soft)' : 'var(--card)',
              color: step === i ? '#fff' : done[i] ? 'var(--ok-ink)' : 'var(--ink-2)',
              border: '1px solid ' + (step === i ? 'var(--violet)' : 'var(--line)'),
            }}
          >
            {done[i] && step !== i ? '✓ ' : ''}{s}
          </button>
        ))}
        <Field label="관련 공정" w={120}>
          <select className="select" value={c.part} onChange={(e) => p.patch({ part: e.target.value })}>
            {PARTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>

      {/* ── ① 산업재해조사표 ── */}
      {step === 0 && (
        <>
          <div style={SEC}>
            <div style={SEC_H}>재해 정보 <span style={HINT}>산업안전보건법 시행규칙 별지 제30호서식 핵심 항목 — 제출용 원본은 고용노동부 서식으로 작성</span></div>
            <div style={ROW}>
              <Field label="재해자 성명"><input className="input" value={iv.worker_name} onChange={(e) => setIv({ worker_name: e.target.value })} /></Field>
              <Field label="직업(직종)"><input className="input" placeholder="예) 조리실무사" value={iv.job} onChange={(e) => setIv({ job: e.target.value })} /></Field>
              <Field label="입사일"><input className="input" type="date" value={iv.hire_date} onChange={(e) => setIv({ hire_date: e.target.value })} /></Field>
              <Field label="고용형태" w={110}>
                <select className="select" value={iv.employ_type} onChange={(e) => setIv({ employ_type: e.target.value })}>
                  {['상용', '임시', '일용', '무급가족종사자', '자영업자', '그 밖의 사항'].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="상해종류(질병명)"><input className="input" placeholder="예) 2도 화상" value={iv.injury_type} onChange={(e) => setIv({ injury_type: e.target.value })} /></Field>
              <Field label="상해부위"><input className="input" placeholder="예) 오른쪽 팔" value={iv.injury_part} onChange={(e) => setIv({ injury_part: e.target.value })} /></Field>
              <Field label="휴업예상일수" w={110}><input className="input" placeholder="예) 14" value={iv.rest_days} onChange={(e) => setIv({ rest_days: e.target.value })} /></Field>
            </div>
          </div>
          <div style={SEC}>
            <div style={SEC_H}>재해 발생 개요 및 원인</div>
            <div style={ROW}>
              <Field label="발생일시"><input className="input" type="datetime-local" value={iv.occur_dt.includes('T') ? iv.occur_dt : ''} placeholder={iv.occur_dt} onChange={(e) => setIv({ occur_dt: e.target.value })} /></Field>
              <Field label="발생장소"><input className="input" placeholder="예) 학교급식실" value={iv.occur_place} onChange={(e) => setIv({ occur_place: e.target.value })} /></Field>
              <Field label="재해관련 작업유형" w={260}><input className="input" placeholder="예) 급식 배식작업을 위해 조리대 청소를 하던 중" value={iv.work_type} onChange={(e) => setIv({ work_type: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ ...HINT, marginBottom: 4 }}>재해발생 당시 상황</div>
              <textarea className="input" style={TA} value={iv.situation} onChange={(e) => setIv({ situation: e.target.value })} />
              <div style={{ ...HINT, margin: '10px 0 4px' }}>재해발생 원인</div>
              <textarea className="input" style={{ ...TA, minHeight: 48 }} placeholder="예) 무의식적인 행동 및 부주의, 국솥을 가장자리에 잘 못 놓음" value={iv.cause} onChange={(e) => setIv({ cause: e.target.value })} />
              <div style={{ ...HINT, margin: '10px 0 4px' }}>재발방지 계획 (조사표 Ⅳ항 — 번호를 붙여 작성)</div>
              <textarea className="input" style={TA} placeholder={'1. 올바른 급식기구 사용법 숙지 및 화상 대처 방법에 대해 지속적 교육 실시\n2. 청소작업 전 고무장갑·토시·미끄럼방지 장화·긴 앞치마 등 보호구 올바른 착용 및 점검'} value={iv.prevention} onChange={(e) => setIv({ prevention: e.target.value })} />
            </div>
            <div style={{ ...ROW, marginTop: 10 }}>
              <Field label="작성자 성명"><input className="input" value={iv.writer} onChange={(e) => setIv({ writer: e.target.value })} /></Field>
              <Field label="작성일"><input className="input" type="date" value={iv.write_date} onChange={(e) => setIv({ write_date: e.target.value })} /></Field>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>{doneBtn(iv.done, '① 조사표 작성', () => setIv({ done: !iv.done }))}</div>
        </>
      )}

      {/* ── ② 재해 재발방지계획 ── */}
      {step === 1 && (
        <>
          <div style={SEC}>
            <div style={SEC_H}>재해 개요</div>
            <div style={ROW}>
              <Field label="기관명"><input className="input" value={p.schoolName} readOnly /></Field>
              <Field label="재해일시"><input className="input" value={iv.occur_dt} readOnly /></Field>
              <Field label="재해자"><input className="input" value={iv.worker_name} readOnly /></Field>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => setPv({ overview: iv.situation })}>조사표 상황 가져오기</button>
            </div>
            <div style={{ ...HINT, margin: '10px 0 4px' }}>재해발생개요</div>
            <textarea className="input" style={TA} value={pv.overview} onChange={(e) => setPv({ overview: e.target.value })} />
          </div>
          <div style={SEC}>
            <div style={SEC_H}>재해 발생원인 분석 및 재발 방지 대책</div>
            <div style={{ ...HINT, marginBottom: 4 }}>재해 발생원인 (번호를 붙여 작성)</div>
            <textarea className="input" style={TA} placeholder={'1) 조리대 가장자리 등 불안정한 위치에 조리기구 적치\n2) 고온 조리기구 취급 작업을 안전하게 마무리하지 않은 채 바닥의 세제를 줍는 작업 실시'} value={pv.causes} onChange={(e) => setPv({ causes: e.target.value })} />
            <div style={{ ...HINT, margin: '10px 0 4px' }}>재발 방지 대책</div>
            <textarea className="input" style={TA} placeholder={'1) 고온 조리기구 적치 시 전도 위험이 낮은 안전한 위치 확보\n2) 작업 전환 시 기존 작업을 안전하게 마무리한 후 다음 작업 실시\n3) 화상 관련 재해사례 전파 및 올바른 조리기구 취급요령에 대한 지속적인 교육 실시'} value={pv.measures} onChange={(e) => setPv({ measures: e.target.value })} />
          </div>
          <div style={{ marginTop: 12 }}>{doneBtn(pv.done, '② 재발방지계획 작성', () => setPv({ done: !pv.done }))}</div>
        </>
      )}

      {/* ── ③ 수시위험성평가 ── */}
      {step === 2 && (
        <>
          <div style={SEC}>
            <div style={SEC_H}>
              [수시평가] 위험성평가표
              <span style={HINT}>사고 관련 작업 중심 — 위험성 = 가능성 × 중대성, 8점 이상 허용 불가(감소대책 필수)</span>
            </div>
            {as.rows.length === 0 && <div style={HINT}>행을 추가해 사고 작업의 유해·위험요인을 평가하세요. 정기평가표의 해당 공정 내용을 참고하면 좋습니다.</div>}
            {as.rows.map((r) => {
              const score = r.likelihood * r.severity
              const high = score >= 8
              return (
                <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px dashed var(--line-2)' }}>
                  <input className="input" style={{ width: 130 }} placeholder="세부작업명" value={r.task}
                    onChange={(e) => setAs({ rows: as.rows.map((x) => x.id === r.id ? { ...x, task: e.target.value } : x) })} />
                  <textarea className="input" style={{ ...TA, minHeight: 40, flex: 1 }} placeholder="위험발생 상황 및 결과"
                    value={r.situation} onChange={(e) => setAs({ rows: as.rows.map((x) => x.id === r.id ? { ...x, situation: e.target.value } : x) })} />
                  <select className="select" style={{ width: 56 }} value={r.likelihood} onChange={(e) => setAs({ rows: as.rows.map((x) => x.id === r.id ? { ...x, likelihood: Number(e.target.value) } : x) })}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select className="select" style={{ width: 56 }} value={r.severity} onChange={(e) => setAs({ rows: as.rows.map((x) => x.id === r.id ? { ...x, severity: Number(e.target.value) } : x) })}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ width: 62, textAlign: 'center', borderRadius: 10, padding: '8px 0', fontWeight: 800, fontSize: 12.5, background: high ? 'var(--amber-soft)' : 'var(--ok-soft)', color: high ? 'var(--amber-ink)' : 'var(--ok-ink)' }}>{score}</span>
                  <textarea className="input" style={{ ...TA, minHeight: 40, flex: 1 }} placeholder="위험성 감소대책"
                    value={r.reduction} onChange={(e) => setAs({ rows: as.rows.map((x) => x.id === r.id ? { ...x, reduction: e.target.value } : x) })} />
                  <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setAs({ rows: as.rows.filter((x) => x.id !== r.id) })}><Trash2 size={13} /></button>
                </div>
              )
            })}
            <button className="btn" style={{ marginTop: 10, fontSize: 12 }}
              onClick={() => setAs({ rows: [...as.rows, { id: rid(), task: '', situation: '', likelihood: 3, severity: 3, reduction: '' }] })}>
              <Plus size={13} /> 행 추가
            </button>
          </div>
          <div style={SEC}>
            <div style={SEC_H}>위험성 감소대책 실행 <span style={HINT}>수시 보고서 3-3 — 감소대책의 실행(교육)</span></div>
            <div style={ROW}>
              <Field label="감소대책 수립 단위작업명"><input className="input" placeholder="예) 청소 작업" value={as.reduce.task} onChange={(e) => setAs({ reduce: { ...as.reduce, task: e.target.value } })} /></Field>
              <Field label="재해 형태"><input className="input" placeholder="예) 화상" value={as.reduce.accident_type} onChange={(e) => setAs({ reduce: { ...as.reduce, accident_type: e.target.value } })} /></Field>
              <Field label="조치결과"><input className="input" placeholder="예) 교육 실시 완료" value={as.reduce.result} onChange={(e) => setAs({ reduce: { ...as.reduce, result: e.target.value } })} /></Field>
              <Field label="조치일자"><input className="input" type="date" value={as.reduce.result_date} onChange={(e) => setAs({ reduce: { ...as.reduce, result_date: e.target.value } })} /></Field>
              <Field label="교육"><input className="input" value={as.reduce.education} onChange={(e) => setAs({ reduce: { ...as.reduce, education: e.target.value } })} /></Field>
            </div>
            <div style={{ ...HINT, margin: '10px 0 4px' }}>감소대책 (위험성평가표 감소대책보다 구체적으로 제시 — 번호를 붙여 작성)</div>
            <textarea className="input" style={TA} placeholder={'1. 고온 조리기구 적치 시 전도 위험이 낮은 안전한 위치 확보\n2. 작업 전환 시 기존 작업을 안전하게 마무리한 후 다음 작업 실시'} value={as.reduce.measure} onChange={(e) => setAs({ reduce: { ...as.reduce, measure: e.target.value } })} />
          </div>
          <div style={{ marginTop: 12 }}>{doneBtn(as.done, '③ 수시평가 작성', () => setAs({ done: !as.done }))}</div>
        </>
      )}

      {/* ── ④ 교육일지 ── */}
      {step === 3 && (
        <>
          <div style={SEC}>
            <div style={SEC_H}>안전보건교육일지 <span style={HINT}>교육구분: 기타 교육 (수시 위험성평가 교육)</span></div>
            <div style={ROW}>
              <Field label="교육일"><input className="input" type="date" value={ed.date} onChange={(e) => setEd({ date: e.target.value })} /></Field>
              <Field label="교육시간"><input className="input" placeholder="예) 14:00 ~ 14:30" value={ed.time} onChange={(e) => setEd({ time: e.target.value })} /></Field>
              <Field label="교육 실시 장소"><input className="input" placeholder="예) 급식실" value={ed.place} onChange={(e) => setEd({ place: e.target.value })} /></Field>
              <Field label="강사 직위/직책"><input className="input" value={ed.instructor_title} onChange={(e) => setEd({ instructor_title: e.target.value })} /></Field>
              <Field label="강사 성명"><input className="input" value={ed.instructor_name} onChange={(e) => setEd({ instructor_name: e.target.value })} /></Field>
            </div>
            <div style={{ ...ROW, marginTop: 8 }}>
              <Field label="교육 대상자 수" w={110}><input className="input" value={ed.target_cnt} onChange={(e) => setEd({ target_cnt: e.target.value })} /></Field>
              <Field label="교육 실시자 수" w={110}><input className="input" value={ed.attend_cnt} onChange={(e) => setEd({ attend_cnt: e.target.value })} /></Field>
              <Field label="미실시자 수" w={110}><input className="input" value={ed.absent_cnt} onChange={(e) => setEd({ absent_cnt: e.target.value })} /></Field>
              <Field label="교육 미실시 사유" w={240}><input className="input" placeholder="예) 재해자 복직 후 실시 예정" value={ed.absent_reason} onChange={(e) => setEd({ absent_reason: e.target.value })} /></Field>
            </div>
            <div style={{ ...HINT, margin: '10px 0 4px' }}>교육주제</div>
            <input className="input" style={{ width: '100%' }} placeholder="예) 화상 관련 재해사례 및 올바른 조리기구 취급요령" value={ed.subject} onChange={(e) => setEd({ subject: e.target.value })} />
            <div style={{ ...HINT, margin: '10px 0 4px' }}>교육내용</div>
            <textarea className="input" style={TA} value={ed.content} onChange={(e) => setEd({ content: e.target.value })} />
            <div style={{ ...ROW, marginTop: 8 }}>
              <Field label="교육자료" w={320}><input className="input" value={ed.materials} onChange={(e) => setEd({ materials: e.target.value })} /></Field>
              <div>
                <div style={{ ...HINT, marginBottom: 4 }}>교육사진 (파일명 메타)</div>
                {ed.photo ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-d)', background: 'var(--violet-soft)', borderRadius: 8, padding: '6px 10px' }}>
                    {ed.photo} <button className="btn" style={{ marginLeft: 6, fontSize: 10.5, padding: '2px 8px' }} onClick={() => setEd({ photo: '' })}>제거</button>
                  </span>
                ) : (
                  <button className="btn" onClick={() => {
                    const inp = document.createElement('input')
                    inp.type = 'file'; inp.accept = 'image/*'
                    inp.onchange = () => setEd({ photo: inp.files?.[0]?.name ?? '' })
                    inp.click()
                  }}><Camera size={13} /> 사진 첨부</button>
                )}
              </div>
            </div>
          </div>
          <div style={SEC}>
            <div style={SEC_H}>참석자 명단 <span style={HINT}>서명은 출력물에 자필로 받습니다</span></div>
            {ed.attendees.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                <span style={{ width: 24, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>{i + 1}</span>
                <input className="input" style={{ width: 180 }} placeholder="이름" value={a.name}
                  onChange={(e) => setEd({ attendees: ed.attendees.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={a.signed} onChange={() => setEd({ attendees: ed.attendees.map((x, j) => j === i ? { ...x, signed: !x.signed } : x) })} /> 서명(지면) 완료
                </label>
                <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setEd({ attendees: ed.attendees.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setEd({ attendees: [...ed.attendees, { name: '', signed: false }] })}>
              <Plus size={13} /> 참석자 추가
            </button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            {doneBtn(ed.done, '④ 교육 실시', () => setEd({ done: !ed.done }))}
            {ed.done && <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ok-ink)' }}>교육까지 완료 — 수시 위험성평가가 마무리되었습니다.</span>}
          </div>
        </>
      )}
    </div>
  )
}
