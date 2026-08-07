// ① 학교 현황 (보고서 PART 1) — 정기 위험성평가 결과보고서의 1-1 학교 현황 · 1-2 재해발생 현황 (0806 요청).
// 학교명·학교장·소재지·현업종사원수는 학교 목록·대장에서 자동 프리필(수정 가능).
// 저장은 부모 조사표 문서(PUT /risk/survey)에 report_info로 실림 — 백엔드 계약 변경 없음.
import { type CSSProperties, useEffect, useState } from 'react'
import { api } from '../../lib/api'

export type AccYearRow = { year: string; workers: string; disease: string; injury: string; death: string }
export type ReportInfoData = {
  report_ym: string // 보고서 작성 연월 (표지)
  principal: string // 학교장
  address: string // 소재지
  worker_total: string // 현업종사원 수
  industry: string // 업종
  members: string // 위험성평가 구성원
  period: string // 평가 기간
  assessors: string // 평가자
  acc_years: AccYearRow[] // 재해발생 현황 (최근 3년)
}

type SchoolLite = { id: string; name: string; principal?: string; address?: string }
type Ledger = { worker_total: number }

const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 14, background: 'var(--card)' }
const SEC_H: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 10 }
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }
const LBL: CSSProperties = { background: 'var(--card-2)', padding: '9px 14px', fontSize: 12.5, fontWeight: 800, borderBottom: '1px solid var(--line-2)', display: 'flex', alignItems: 'center' }
const VAL: CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--line-2)' }
const TH: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', padding: '7px 6px', textAlign: 'center', borderBottom: '1px solid var(--line)' }
const TD: CSSProperties = { padding: '4px 4px', textAlign: 'center' }
const IN_C: CSSProperties = { width: '100%', textAlign: 'center', padding: '6px 6px', fontSize: 12.5 }

function currentYear(): number {
  return new Date().getFullYear()
}
export function emptyReportInfo(): ReportInfoData {
  const y = currentYear()
  return {
    report_ym: `${y}. ${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    principal: '', address: '', worker_total: '', industry: '교육서비스업',
    members: '관리감독자, 산업안전보건 담당자, 현업종사원',
    period: `${y}년 4월 ~ 6월`,
    assessors: '관리감독자, 업무 담당자(행정,급식), 한국산업안전협회',
    acc_years: [String(y - 1), String(y - 2), String(y - 3)].map((year) => ({ year, workers: '', disease: '0', injury: '0', death: '0' })),
  }
}

export function ReportInfo(p: {
  sid: string
  school: SchoolLite | undefined
  value: ReportInfoData | undefined
  onChange: (v: ReportInfoData) => void
  onSave: () => void
  busy: boolean
  msg: string
  onNext?: () => void // 다음 탭으로 이동 (하단 우측 버튼)
}) {
  const { sid, school, value } = p

  // 대장 연동 — 현업종사원 수 프리필
  const [ledger, setLedger] = useState<Ledger | null>(null)
  useEffect(() => {
    if (!sid) return
    let alive = true
    api<Ledger>(`/schools/${sid}/ledger`)
      .then((d) => { if (alive) setLedger(d) })
      .catch(() => { if (alive) setLedger(null) })
    return () => { alive = false }
  }, [sid])

  // 초기화: 학교 목록·대장 값으로 프리필 (이후 수정 가능)
  useEffect(() => {
    if (value) return
    const init = emptyReportInfo()
    if (school?.principal) init.principal = school.principal
    if (school?.address) init.address = school.address
    if (ledger) {
      init.worker_total = String(ledger.worker_total)
      init.acc_years = init.acc_years.map((r) => ({ ...r, workers: String(ledger.worker_total) }))
    }
    p.onChange(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, school, ledger])

  const v = value ?? emptyReportInfo()
  const patch = (next: Partial<ReportInfoData>) => p.onChange({ ...v, ...next })

  const FIELDS: [string, keyof ReportInfoData, string][] = [
    ['학교장', 'principal', '학교장 성명'],
    ['소재지', 'address', '학교 주소'],
    ['현업종사원 수', 'worker_total', '예) 8명'],
    ['업종', 'industry', ''],
    ['위험성평가 구성원', 'members', ''],
    ['평가 기간', 'period', ''],
    ['평가자', 'assessors', ''],
    ['보고서 작성 연월', 'report_ym', '예) 2026. 06'],
  ]

  return (
    <div>
      <div style={HINT}>
        보고서 표지·PART 1에 들어가는 내용입니다. 학교장·소재지·종사원 수는 학교 정보·대장에서 자동으로 채워지며 수정할 수 있습니다.
      </div>

      {/* 1-1 학교 현황 */}
      <div style={SEC}>
        <div style={SEC_H}>1-1 학교 현황</div>
        <div style={GRID}>
          <div style={LBL}>학교명</div>
          <div style={{ ...VAL, display: 'flex', alignItems: 'center', padding: '9px 14px', fontSize: 13, fontWeight: 700 }}>
            {school?.name ?? '—'} <span style={{ ...HINT, marginLeft: 8 }}>(선택된 학교 자동)</span>
          </div>
          {FIELDS.map(([label, key, ph]) => (
            <FragmentRow key={key} label={label} value={String(v[key] ?? '')} placeholder={ph} onChange={(s) => patch({ [key]: s } as Partial<ReportInfoData>)} />
          ))}
        </div>
      </div>

      {/* 1-2 재해발생 현황 */}
      <div style={SEC}>
        <div style={SEC_H}>1-2 재해발생 현황 <span style={HINT}>최근 3년 · 재해율(%) = 계 ÷ 현업종사원 수 × 100 (자동 계산)</span></div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 110 }}>구분(년도)</th>
              <th style={{ ...TH, width: 130 }}>현업종사원 수</th>
              <th style={TH}>질병</th>
              <th style={TH}>부상</th>
              <th style={TH}>사망</th>
              <th style={{ ...TH, width: 70 }}>계</th>
              <th style={{ ...TH, width: 90 }}>재해율(%)</th>
            </tr>
          </thead>
          <tbody>
            {v.acc_years.map((r, i) => {
              const total = (Number(r.disease) || 0) + (Number(r.injury) || 0) + (Number(r.death) || 0)
              const workers = Number(r.workers) || 0
              const rate = workers > 0 ? Math.round((total / workers) * 1000) / 10 : 0
              const set = (next: Partial<AccYearRow>) => patch({ acc_years: v.acc_years.map((x, j) => (j === i ? { ...x, ...next } : x)) })
              return (
                <tr key={i}>
                  <td style={TD}><input className="input" style={{ ...IN_C, fontWeight: 800 }} value={r.year} onChange={(e) => set({ year: e.target.value })} /></td>
                  <td style={TD}><input className="input" style={IN_C} value={r.workers} onChange={(e) => set({ workers: e.target.value })} /></td>
                  <td style={TD}><input className="input" style={IN_C} value={r.disease} onChange={(e) => set({ disease: e.target.value })} /></td>
                  <td style={TD}><input className="input" style={IN_C} value={r.injury} onChange={(e) => set({ injury: e.target.value })} /></td>
                  <td style={TD}><input className="input" style={IN_C} value={r.death} onChange={(e) => set({ death: e.target.value })} /></td>
                  <td style={{ ...TD, fontSize: 13, fontWeight: 800 }}>{total}</td>
                  <td style={{ ...TD, fontSize: 13, fontWeight: 800, color: total > 0 ? 'var(--red-ink)' : 'var(--ok-ink)' }}>{rate}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ ...HINT, marginTop: 6 }}>※ 산재 등록 이력이 있으면 산업재해 메뉴의 데이터를 참고해 입력하세요.</div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={p.onSave} disabled={!sid || p.busy}>{p.busy ? '저장 중…' : '저장'}</button>
        {p.msg && <span style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>{p.msg}</span>}
        {p.onNext && (
          <button className="btn" style={{ marginLeft: 'auto', fontWeight: 800 }} onClick={p.onNext}>다음 →</button>
        )}
      </div>
    </div>
  )
}

function FragmentRow(p: { label: string; value: string; placeholder: string; onChange: (s: string) => void }) {
  return (
    <>
      <div style={LBL}>{p.label}</div>
      <div style={VAL}>
        <input className="input" style={{ width: '100%', fontSize: 12.5 }} value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} />
      </div>
    </>
  )
}
