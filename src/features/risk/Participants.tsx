// ⑤ 위험성평가 참여자 (보고서 3-5) — 시작회의·평가결과 교육 참여자 서명지 (0806 요청).
// 산업안전보건법 제36조 2항 — 근로자 참여 기록. 청취조사 명단에서 한 번에 불러올 수 있음.
// 서명은 지면 서명 전제(시스템에는 일시·서명 여부만 기록). 저장은 조사표 문서(PUT /risk/survey)의 participants.
import { type CSSProperties } from 'react'
import { Plus, Trash2, UsersRound } from 'lucide-react'
import type { HearingDoc } from './HearingSurvey'

export type ParticipantRow = {
  id: string
  part: string // 소속공정(부서)
  name: string // 성명
  kickoff_date: string // 시작회의 일시
  kickoff_signed: boolean // 시작회의 서명
  result_date: string // 결과 교육 일시
  result_signed: boolean // 결과 교육 서명
  note: string // 비고
}

const PART_LABEL: Record<string, string> = { catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직' }
const PARTS = Object.entries(PART_LABEL)

const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 14, background: 'var(--card)' }
const TH: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', padding: '7px 6px', textAlign: 'center', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }
const TD: CSSProperties = { padding: '4px 4px', textAlign: 'center', verticalAlign: 'middle' }
const IN: CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 12.5 }

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function Participants(p: {
  sid: string
  value: ParticipantRow[] | undefined
  hearing: HearingDoc | undefined
  hearingPrev: HearingDoc | undefined // ③ 탭 미방문 시 작년 명단으로 폴백
  onChange: (rows: ParticipantRow[]) => void
  onSave: () => void
  busy: boolean
  msg: string
}) {
  const rows = p.value ?? []
  const set = (next: ParticipantRow[]) => p.onChange(next)

  function importFromHearing() {
    // 올해 청취조사 명단 우선, 없으면 작년 명단으로 폴백
    const src = Object.values(p.hearing ?? {}).length > 0 ? p.hearing : p.hearingPrev
    const existing = new Set(rows.map((r) => r.part + '|' + r.name))
    const add: ParticipantRow[] = []
    for (const sheet of Object.values(src ?? {})) {
      const key = sheet.part + '|' + sheet.worker_name
      if (existing.has(key)) continue
      existing.add(key)
      add.push({ id: rid(), part: sheet.part, name: sheet.worker_name, kickoff_date: '', kickoff_signed: false, result_date: '', result_signed: false, note: '' })
    }
    if (add.length) set([...rows, ...add])
  }

  const signedKickoff = rows.filter((r) => r.kickoff_signed).length
  const signedResult = rows.filter((r) => r.result_signed).length

  return (
    <div>
      <div style={HINT}>
        「산업안전보건법」 제36조 2항에 따라 위험성평가 전 과정에 근로자를 참여시키고 그 기록을 남깁니다.
        시작회의(위험성평가 교육)·평가결과 교육(공유) 참여 일시를 기록하세요 — 서명은 출력물에 자필로 받습니다.
      </div>

      <div style={SEC}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>3-5 위험성평가 참여자 명단</span>
          <button className="btn" style={{ fontSize: 12 }} onClick={importFromHearing}>
            <UsersRound size={13} /> 청취조사 명단 불러오기
          </button>
          <span style={{ marginLeft: 'auto', ...HINT }}>
            {rows.length}명 · 시작회의 서명 {signedKickoff} · 결과교육 서명 {signedResult}
          </span>
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 44 }}>구분</th>
              <th style={{ ...TH, width: 110 }}>소속공정(부서)</th>
              <th style={{ ...TH, width: 130 }}>성명</th>
              <th style={{ ...TH, width: 150 }}>시작회의 일시</th>
              <th style={{ ...TH, width: 64 }}>서명</th>
              <th style={{ ...TH, width: 150 }}>결과 교육 일시</th>
              <th style={{ ...TH, width: 64 }}>서명</th>
              <th style={TH}>비고</th>
              <th style={{ ...TH, width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ ...TD, padding: 20, ...HINT }}>
                참여자가 없습니다 — "청취조사 명단 불러오기" 또는 "행 추가"로 등록하세요.
              </td></tr>
            )}
            {rows.map((r, i) => {
              const patch = (next: Partial<ParticipantRow>) => set(rows.map((x) => (x.id === r.id ? { ...x, ...next } : x)))
              return (
                <tr key={r.id}>
                  <td style={{ ...TD, fontSize: 12.5, fontWeight: 800 }}>{i + 1}</td>
                  <td style={TD}>
                    <select className="select" style={IN} value={r.part} onChange={(e) => patch({ part: e.target.value })}>
                      {PARTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </td>
                  <td style={TD}><input className="input" style={IN} value={r.name} onChange={(e) => patch({ name: e.target.value })} /></td>
                  <td style={TD}><input className="input" style={IN} type="datetime-local" value={r.kickoff_date} onChange={(e) => patch({ kickoff_date: e.target.value })} /></td>
                  <td style={TD}>
                    <input type="checkbox" checked={r.kickoff_signed} onChange={() => patch({ kickoff_signed: !r.kickoff_signed })} title="시작회의 서명(지면) 완료" />
                  </td>
                  <td style={TD}><input className="input" style={IN} type="datetime-local" value={r.result_date} onChange={(e) => patch({ result_date: e.target.value })} /></td>
                  <td style={TD}>
                    <input type="checkbox" checked={r.result_signed} onChange={() => patch({ result_signed: !r.result_signed })} title="결과 교육 서명(지면) 완료" />
                  </td>
                  <td style={TD}><input className="input" style={IN} value={r.note} onChange={(e) => patch({ note: e.target.value })} /></td>
                  <td style={TD}>
                    <button className="btn" style={{ padding: '4px 7px' }} onClick={() => set(rows.filter((x) => x.id !== r.id))}><Trash2 size={13} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button className="btn" style={{ marginTop: 10, fontSize: 12 }}
          onClick={() => set([...rows, { id: rid(), part: 'catering', name: '', kickoff_date: '', kickoff_signed: false, result_date: '', result_signed: false, note: '' }])}>
          <Plus size={13} /> 행 추가
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={p.onSave} disabled={!p.sid || p.busy}>{p.busy ? '저장 중…' : '저장'}</button>
        {p.msg && <span style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>{p.msg}</span>}
      </div>
    </div>
  )
}
