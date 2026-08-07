// 청취조사에 의한 유해·위험요인 조사표 (개인별) — 위험성평가 사전조사 2단계 (0806 요청).
// 좌측: 부서별 종사자 명단(학교 대장 연동 + 수동 추가) · 우측: 개인별 조사표.
// 양식(실물 기준): 실시방법(고정 문구) · 수행자·근로자·실시일 · 경험담 1~3(서술 + 원인·판단) ·
//                  근로자 의견(유해·위험 경험의 원인과 판단) · 수행자 의견(개선에 대한 조건).
// 작년 작성분(hearing_prev)을 프리필하고, 저장은 부모 조사표 문서(PUT /risk/survey)에 hearing으로 실림.
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/* ===================== 데이터 모델 (sections.hearing) ===================== */
export type HearingExp = { text: string; cause: string } // 경험담 서술 + (원인·판단)
export type HearingSheet = {
  part: string
  worker_name: string
  surveyor: string
  date: string
  exps: HearingExp[] // 경험담 1~3
  worker_opinion: string // 근로자 의견 — 유해·위험 경험의 원인과 판단
  improve_cond: string // 수행자 의견 — 개선에 대한 조건
  done: boolean
}
export type HearingDoc = Record<string, HearingSheet>

const PARTS: [string, string, string][] = [
  // [part, 부서 라벨, 기본 호칭]
  ['catering', '급식', '조리'], ['facility', '시설', '시설'], ['cleaning', '미화', '미화'],
  ['commute', '통학', '통학'], ['night_duty', '당직', '당직'],
]
const METHOD_TEXT = '위험성평가 수행자가 현장 근로자와 면담을 통해 직접 경험한 유해·위험요인을 찾음'

function emptyExps(): HearingExp[] {
  return [{ text: '', cause: '' }, { text: '', cause: '' }, { text: '', cause: '' }]
}
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ===================== 대장 연동 ===================== */
type Worker = { part: string; count: number }
type Ledger = { workers: Worker[] }

/* ===================== 스타일 ===================== */
const WRAP: CSSProperties = { display: 'grid', gridTemplateColumns: '250px 1fr', gap: 18, alignItems: 'start' }
const LIST: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--card)', overflow: 'hidden' }
const GRP: CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--muted)', padding: '10px 14px 4px', letterSpacing: '0.02em' }
const PERSON: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 14, background: 'var(--card)' }
const SEC_H: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 10 }
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const TA: CSSProperties = { height: 'auto', minHeight: 64, padding: '9px 12px', resize: 'vertical', lineHeight: 1.6, width: '100%', fontFamily: 'inherit' }
const FIELD_ROW: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }

export function HearingSurvey(p: {
  sid: string
  value: HearingDoc | undefined
  prev: HearingDoc | undefined
  onChange: (doc: HearingDoc) => void
  onSave: () => void
  busy: boolean
  msg: string
  onNext?: () => void // 다음 탭으로 이동 (하단 우측 버튼)
}) {
  const { sid, value, prev } = p
  const { user } = useAuth()
  const defaultSurveyor = user ? (user.login === 'admin' ? '관리자' : user.login) : ''

  // 대장에서 부서별 인원수 → 명단 생성 기반
  const [ledger, setLedger] = useState<Ledger | null>(null)
  useEffect(() => {
    if (!sid) return
    let alive = true
    api<Ledger>(`/schools/${sid}/ledger`)
      .then((d) => { if (alive) setLedger(d) })
      .catch(() => { if (alive) setLedger({ workers: [] }) })
    return () => { alive = false }
  }, [sid])

  // 올해 문서 초기화: 대장 명단 × 작년 작성분 프리필 (실시일=오늘, 수행자=로그인 사용자, 완료=해제)
  useEffect(() => {
    if (value || !ledger) return
    const init: HearingDoc = {}
    for (const [part, , job] of PARTS) {
      const count = ledger.workers.find((w) => w.part === part)?.count ?? 0
      for (let i = 1; i <= count; i++) {
        const key = `${part}-${i}`
        const pv = prev?.[key]
        init[key] = pv
          ? { ...pv, exps: pv.exps.map((e) => ({ ...e })), date: todayYmd(), surveyor: defaultSurveyor || pv.surveyor, done: false }
          : { part, worker_name: `${job}${i}`, surveyor: defaultSurveyor, date: todayYmd(), exps: emptyExps(), worker_opinion: '', improve_cond: '', done: false }
      }
    }
    // 작년 문서에만 있는 인원(퇴사자 등)은 프리필하지 않음 — 필요 시 수동 추가
    p.onChange(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ledger, prev])

  const doc = value ?? {}
  const keys = Object.keys(doc)
  const [sel, setSel] = useState('')
  const selKey = sel && doc[sel] ? sel : keys[0] ?? ''
  const sheet = doc[selKey]

  const doneCount = keys.filter((k) => doc[k].done).length
  const grouped = useMemo(
    () => PARTS.map(([part, label]) => ({ part, label, items: keys.filter((k) => doc[k].part === part) })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys.join(','), doc],
  )

  function patchSheet(next: Partial<HearingSheet>) {
    if (!selKey) return
    p.onChange({ ...doc, [selKey]: { ...doc[selKey], ...next } })
  }
  function addPerson(part: string, job: string) {
    let n = 1
    while (doc[`${part}-x${n}`]) n++
    const key = `${part}-x${n}`
    p.onChange({
      ...doc,
      [key]: { part, worker_name: `${job}(추가)`, surveyor: defaultSurveyor, date: todayYmd(), exps: emptyExps(), worker_opinion: '', improve_cond: '', done: false },
    })
    setSel(key)
  }

  const prevSheet = prev?.[selKey]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800 }}>청취조사에 의한 유해·위험요인 조사표</span>
        <span style={HINT}>모든 작업(부서) × 종사자 개인별 작성</span>
        <span style={{ marginLeft: 'auto', ...HINT }}>
          작성 완료 <b style={{ color: doneCount === keys.length && keys.length > 0 ? 'var(--ok-ink)' : 'var(--ink)' }}>{doneCount}</b> / {keys.length}명
        </span>
      </div>

      <div style={WRAP}>
        {/* ── 좌측: 부서별 종사자 명단 ── */}
        <div style={LIST}>
          {grouped.length === 0 && <div style={{ padding: 16, ...HINT }}>학교 대장에 종사자 구성이 없습니다.</div>}
          {grouped.map((g) => {
            const gDone = g.items.filter((k) => doc[k].done).length
            const job = PARTS.find(([pt]) => pt === g.part)?.[2] ?? g.part
            return (
              <div key={g.part}>
                <div style={GRP}>{g.label} · {gDone}/{g.items.length}</div>
                {g.items.map((k) => {
                  const active = k === selKey
                  return (
                    <div
                      key={k}
                      style={{ ...PERSON, background: active ? 'var(--violet-soft)' : 'transparent', color: active ? 'var(--violet-d)' : 'var(--ink)' }}
                      onClick={() => setSel(k)}
                    >
                      {doc[k].done
                        ? <CheckCircle2 size={15} style={{ color: 'var(--ok-ink)' }} />
                        : <UserRound size={15} style={{ color: 'var(--muted)' }} />}
                      <span style={{ flex: 1 }}>{doc[k].worker_name}</span>
                      {prev?.[k] && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--amber-ink)', background: 'var(--amber-soft)', borderRadius: 999, padding: '1px 6px' }}>작년</span>}
                    </div>
                  )
                })}
                <div style={{ padding: '2px 14px 8px' }}>
                  <button className="btn" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => addPerson(g.part, job)}>
                    <Plus size={11} /> 인원 추가
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 우측: 개인별 조사표 ── */}
        {sheet ? (
          <div>
            <div style={{ ...SEC, marginTop: 0, background: 'var(--card-2)' }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                <b style={{ minWidth: 64 }}>실시방법</b>
                <span style={{ color: 'var(--ink-2)' }}>{METHOD_TEXT}</span>
              </div>
              <div style={{ ...FIELD_ROW, marginTop: 10 }}>
                <label className="field"><span>수행자 성명</span>
                  <input className="input" value={sheet.surveyor} onChange={(e) => patchSheet({ surveyor: e.target.value })} /></label>
                <label className="field"><span>근로자 성명</span>
                  <input className="input" value={sheet.worker_name} onChange={(e) => patchSheet({ worker_name: e.target.value })} /></label>
                <label className="field"><span>실시일</span>
                  <input className="input" type="date" value={sheet.date} onChange={(e) => patchSheet({ date: e.target.value })} /></label>
              </div>
              {prevSheet && (
                <div style={{ marginTop: 8, ...HINT }}>
                  작년 작성분이 미리 채워져 있습니다 — 올해 면담 내용으로 검토·수정하세요.
                </div>
              )}
            </div>

            {/* 경험담 1~3 */}
            {sheet.exps.map((exp, i) => (
              <div style={SEC} key={i}>
                <div style={SEC_H}>
                  경험담 {i + 1}
                  {i === 0 && <span style={HINT}>※ 육하원칙(누가·언제·어디서·무엇을·어떻게·왜)에 따라 작성</span>}
                </div>
                <textarea
                  className="input" style={TA} value={exp.text}
                  placeholder="예) 급식실 후문 계단에서 내려오다가 미끄러져서 넘어질 뻔 함"
                  onChange={(e) => patchSheet({ exps: sheet.exps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...HINT, marginBottom: 4 }}>원인·판단 (괄호 내용 — 왜 위험했는지, 무엇이 없었는지)</div>
                  <input
                    className="input" style={{ width: '100%' }} value={exp.cause}
                    placeholder="예) 보호구 미지참 및 착용 X, 급식실 계단 미끄럼방지조치·안전난간 X"
                    onChange={(e) => patchSheet({ exps: sheet.exps.map((x, j) => (j === i ? { ...x, cause: e.target.value } : x)) })}
                  />
                </div>
              </div>
            ))}

            {/* 의견 — 원인과 판단 / 개선 조건 */}
            <div style={SEC}>
              <div style={SEC_H}>유해·위험 경험의 원인과 판단 <span style={HINT}>근로자 의견</span></div>
              <textarea
                className="input" style={TA} value={sheet.worker_opinion}
                placeholder="예) 급식실 계단 미끄럼방지조치 필요"
                onChange={(e) => patchSheet({ worker_opinion: e.target.value })}
              />
              <div style={{ ...SEC_H, marginTop: 12 }}>개선에 대한 조건 <span style={HINT}>수행자 의견</span></div>
              <textarea
                className="input" style={TA} value={sheet.improve_cond}
                placeholder="예) 안전난간 설치 필요"
                onChange={(e) => patchSheet({ improve_cond: e.target.value })}
              />
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-primary" onClick={p.onSave} disabled={!sid || p.busy}>
                {p.busy ? '저장 중…' : '저장'}
              </button>
              <button
                className="btn"
                style={sheet.done ? { background: 'var(--ok-soft)', color: 'var(--ok-ink)', fontWeight: 800 } : undefined}
                onClick={() => patchSheet({ done: !sheet.done })}
              >
                <CheckCircle2 size={14} /> {sheet.done ? '작성 완료됨 (해제)' : `${sheet.worker_name} 작성 완료`}
              </button>
              {p.msg && <span style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>{p.msg}</span>}
              {p.onNext && (
                <button className="btn" style={{ marginLeft: 'auto', fontWeight: 800 }} onClick={p.onNext}>다음 →</button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ ...SEC, marginTop: 0, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
            좌측 명단에서 종사자를 선택하세요.
          </div>
        )}
      </div>
    </div>
  )
}
