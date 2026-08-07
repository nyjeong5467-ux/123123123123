// 유해위험정보 검토 (부서별) — 위험성평가 사전조사 1단계 (0806 요청, 3-1 양식 디지털화).
// 부서(작업)별로 기계·기구/유해화학물질(MSDS)/그 밖의 유해위험정보를 체크.
// 작년 작성분(prev)을 올해 양식에 프리필하고, 작년 대비 달라진 항목에 '변경'·'신규' 배지 표시.
// 저장은 부모(Risk.tsx)의 조사표 문서(PUT /risk/survey sections)에 dept_info로 실림 — 백엔드 계약 변경 없음.
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'

/* ===================== 데이터 모델 (sections.dept_info) ===================== */
export type DeptEquip = { name: string; qty: number }
export type DeptChem = { name: string; handled: boolean }
export type DeptEtc = {
  acc3y_accident: number // 최근 3년 사고성 재해(협착·추락·전도 등)
  acc3y_other: number //    〃    기타(업무상 질병·장해 등)
  env_measure: boolean // 작업환경측정 대상
  permit: boolean // 작업허가 대상 작업
  permit_types: string[]
  contractor: boolean // 도급업체
  contractor_types: string[]
  contractor_etc: string
  vulnerable: boolean // 취약계층 근로자
  vulnerable_types: string[]
  reviewed: boolean // 부서 검토 완료
}
export type DeptInfo = { equips: DeptEquip[]; chems: DeptChem[]; etc: DeptEtc }
export type DeptInfoDoc = Record<string, DeptInfo>

export const DEPT_PARTS: [string, string][] = [
  ['catering', '급식'], ['facility', '시설'], ['cleaning', '미화'], ['commute', '통학'], ['night_duty', '당직'],
]
const PERMIT_TYPES = ['고소작업', '정전작업', '밀폐공간']
const CONTRACTOR_TYPES = ['생산', '청소', '경비', '포장']
const VULNERABLE_TYPES = ['60세 이상의 장년근로자', '장애근로자', '위험 질병 유소견자']

export function emptyDeptEtc(): DeptEtc {
  return {
    acc3y_accident: 0, acc3y_other: 0, env_measure: false,
    permit: false, permit_types: [], contractor: false, contractor_types: [], contractor_etc: '',
    vulnerable: false, vulnerable_types: [], reviewed: false,
  }
}
export function emptyDeptInfo(): DeptInfo {
  return { equips: [], chems: [], etc: emptyDeptEtc() }
}
function deepCopyDoc(doc: DeptInfoDoc): DeptInfoDoc {
  return JSON.parse(JSON.stringify(doc)) as DeptInfoDoc
}

/* ===================== 대장 연동 타입 (MSDS 제안·산재 자동 집계용) ===================== */
type Msds = { area: string; substances: string[] }
type LedgerAccident = { date: string; part: string | null }
type Ledger = { msds: Msds[]; accidents: LedgerAccident[] }

// 대장 MSDS의 구역(area) → 부서 매핑. 매칭 키워드가 없으면 null(전 부서 공통으로 제안).
const AREA_PART_KEYWORDS: Record<string, string[]> = {
  catering: ['급식', '조리', '주방'],
  facility: ['시설', '창고', '기계', '보일러', '공구'],
  cleaning: ['미화', '청소', '화장실'],
  commute: ['통학', '차량'],
  night_duty: ['당직', '숙직'],
}
function areaToPart(area: string): string | null {
  for (const [k, kws] of Object.entries(AREA_PART_KEYWORDS)) {
    if (kws.some((w) => area.includes(w))) return k
  }
  return null
}

/* ===================== 스타일 ===================== */
const SEC: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 14, background: 'var(--card)' }
const SEC_H: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 10 }
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }
const BADGE: CSSProperties = { fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '1px 7px', background: 'var(--amber-soft)', color: 'var(--amber-ink)' }
const BADGE_NEW: CSSProperties = { ...BADGE, background: 'var(--violet-soft)', color: 'var(--violet-d)' }
const HINT: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }
const CHECK: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }
const IN_SM: CSSProperties = { width: 64, textAlign: 'center' }

/* ===================== 변경 비교 헬퍼 ===================== */
function equipBadge(row: DeptEquip, prevList: DeptEquip[] | undefined): 'new' | 'changed' | null {
  if (!prevList) return null
  const p = prevList.find((x) => x.name === row.name)
  if (!p) return 'new'
  return p.qty !== row.qty ? 'changed' : null
}
function chemBadge(row: DeptChem, prevList: DeptChem[] | undefined): 'new' | 'changed' | null {
  if (!prevList) return null
  const p = prevList.find((x) => x.name === row.name)
  if (!p) return 'new'
  return p.handled !== row.handled ? 'changed' : null
}
function etcChanged(cur: DeptEtc, prev: DeptEtc | undefined): boolean {
  if (!prev) return false
  const pick = (e: DeptEtc) => JSON.stringify({ ...e, reviewed: false })
  return pick(cur) !== pick(prev)
}
function countChanges(cur: DeptInfo, prev: DeptInfo | undefined): number {
  if (!prev) return 0
  let n = 0
  cur.equips.forEach((r) => { if (equipBadge(r, prev.equips)) n++ })
  prev.equips.forEach((r) => { if (!cur.equips.find((x) => x.name === r.name)) n++ }) // 삭제분
  cur.chems.forEach((r) => { if (chemBadge(r, prev.chems)) n++ })
  prev.chems.forEach((r) => { if (!cur.chems.find((x) => x.name === r.name)) n++ })
  if (etcChanged(cur.etc, prev.etc)) n++
  return n
}

/* ===================== 컴포넌트 ===================== */
export function DeptHazardInfo(p: {
  sid: string
  value: DeptInfoDoc | undefined
  prev: DeptInfoDoc | undefined
  onChange: (doc: DeptInfoDoc) => void
  onSave: () => void
  busy: boolean
  msg: string
  onNext?: () => void // 다음 탭으로 이동 (하단 우측 버튼)
}) {
  const { sid, value, prev } = p
  const [part, setPart] = useState(DEPT_PARTS[0][0])

  // 올해 문서가 없으면 작년 문서를 깊은 복사로 프리필 (없으면 빈 양식)
  useEffect(() => {
    if (value) return
    const init: DeptInfoDoc = prev ? deepCopyDoc(prev) : {}
    DEPT_PARTS.forEach(([k]) => { if (!init[k]) init[k] = emptyDeptInfo() })
    Object.values(init).forEach((d) => { d.etc.reviewed = false }) // 검토 여부는 올해 새로 체크
    p.onChange(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prev])

  // 대장 연동 — 부서별 근로자수 · MSDS 물질 제안 · 산재 자동 집계
  const [ledger, setLedger] = useState<Ledger | null>(null)
  useEffect(() => {
    if (!sid) return
    let alive = true
    api<Ledger>(`/schools/${sid}/ledger`)
      .then((d) => { if (alive) setLedger(d) })
      .catch(() => { if (alive) setLedger(null) })
    return () => { alive = false }
  }, [sid])

  const doc = value ?? {}
  const cur = doc[part] ?? emptyDeptInfo()
  const curPrev = prev?.[part]
  const partLabel = DEPT_PARTS.find(([k]) => k === part)?.[1] ?? part
  const reviewedCount = DEPT_PARTS.filter(([k]) => doc[k]?.etc.reviewed).length

  // 대장 MSDS 물질 중 "이 부서 구역"에 해당하면서 목록에 없는 것 → 추가 제안 (부서별로 다르게 표시)
  // 구역을 부서로 매핑할 수 없는 MSDS는 전 부서 공통으로 제안.
  const msdsSuggest = useMemo(() => {
    if (!ledger) return []
    const have = new Set(cur.chems.map((c) => c.name))
    const out: { name: string; area: string }[] = []
    for (const m of ledger.msds) {
      const mapped = areaToPart(m.area)
      if (mapped !== null && mapped !== part) continue
      for (const s of m.substances) {
        if (!have.has(s) && !out.find((x) => x.name === s)) out.push({ name: s, area: m.area })
      }
    }
    return out
  }, [ledger, cur.chems, part])

  // 대장 산재기록(최근 3년) 부서별 자동 집계
  const autoAcc = useMemo(() => {
    if (!ledger) return null
    const limit = new Date()
    limit.setFullYear(limit.getFullYear() - 3)
    const cut = limit.toISOString().slice(0, 10)
    return ledger.accidents.filter((a) => a.part === part && (a.date || '') >= cut).length
  }, [ledger, part])

  function patch(next: Partial<DeptInfo>) {
    p.onChange({ ...doc, [part]: { ...cur, ...next } })
  }
  function patchEtc(next: Partial<DeptEtc>) {
    patch({ etc: { ...cur.etc, ...next } })
  }
  function toggleIn(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  }

  const changeCount = countChanges(cur, curPrev)

  return (
    <div>
      {/* 부서 탭 + 진행률 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {DEPT_PARTS.map(([k, label]) => {
          const reviewed = !!doc[k]?.etc.reviewed
          const active = part === k
          return (
            <button
              key={k}
              onClick={() => setPart(k)}
              className="btn"
              style={{
                borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 800,
                background: active ? 'var(--violet)' : 'var(--card)',
                color: active ? '#fff' : reviewed ? 'var(--ok-ink)' : 'var(--ink-2)',
                border: '1px solid ' + (active ? 'var(--violet)' : 'var(--line)'),
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              {reviewed && <BadgeCheck size={13} />}
              {label}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', ...HINT }}>
          검토 완료 {reviewedCount} / {DEPT_PARTS.length}부서
          {curPrev && <> · 작년 대비 변경 <b style={{ color: changeCount ? 'var(--amber-ink)' : 'var(--ok-ink)' }}>{changeCount}건</b></>}
        </span>
      </div>
      <div style={HINT}>
        {partLabel} 부서
        {curPrev ? ' · 작년 작성분이 미리 채워져 있습니다 — 달라진 항목만 수정하세요' : ' · 작년 작성분 없음 (신규 작성)'}
      </div>

      {/* ── 기계·기구 및 설비 ── */}
      <div style={SEC}>
        <div style={SEC_H}>기계·기구 및 설비 <span style={HINT}>명칭·수량</span></div>
        {cur.equips.length === 0 && <div style={HINT}>등록된 기계·기구가 없습니다 (없으면 그대로 두세요)</div>}
        {cur.equips.map((row, i) => {
          const b = equipBadge(row, curPrev?.equips)
          return (
            <div style={ROW} key={i}>
              <input
                className="input" style={{ flex: 1 }} value={row.name} placeholder="기계·기구·설비명"
                onChange={(e) => patch({ equips: cur.equips.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })}
              />
              <input
                className="input" style={IN_SM} type="number" min={0} value={row.qty}
                onChange={(e) => patch({ equips: cur.equips.map((r, j) => (j === i ? { ...r, qty: Number(e.target.value) } : r)) })}
              />
              {b === 'changed' && <span style={BADGE}>변경</span>}
              {b === 'new' && <span style={BADGE_NEW}>신규</span>}
              <button className="btn" style={{ padding: '4px 8px' }} title="행 삭제"
                onClick={() => patch({ equips: cur.equips.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
        <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => patch({ equips: [...cur.equips, { name: '', qty: 1 }] })}>
          <Plus size={13} /> 행 추가
        </button>
      </div>

      {/* ── 유해화학물질 (MSDS) ── */}
      <div style={SEC}>
        <div style={SEC_H}>
          유해화학물질 <span style={HINT}>화학물질명 · 취급여부 — 「산업안전보건법」 제110·114조 MSDS 작성·게시 대상</span>
        </div>
        {cur.chems.length === 0 && <div style={HINT}>등록된 화학물질이 없습니다 (없으면 그대로 두세요)</div>}
        {cur.chems.map((row, i) => {
          const b = chemBadge(row, curPrev?.chems)
          return (
            <div style={ROW} key={i}>
              <input
                className="input" style={{ flex: 1 }} value={row.name} placeholder="화학물질명"
                onChange={(e) => patch({ chems: cur.chems.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })}
              />
              <label style={CHECK}>
                <input type="checkbox" checked={row.handled}
                  onChange={() => patch({ chems: cur.chems.map((r, j) => (j === i ? { ...r, handled: !r.handled } : r)) })} />
                취급
              </label>
              {b === 'changed' && <span style={BADGE}>변경</span>}
              {b === 'new' && <span style={BADGE_NEW}>신규</span>}
              <button className="btn" style={{ padding: '4px 8px' }} title="행 삭제"
                onClick={() => patch({ chems: cur.chems.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
        <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => patch({ chems: [...cur.chems, { name: '', handled: true }] })}>
          <Plus size={13} /> 행 추가
        </button>
        {msdsSuggest.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--amber-soft)', borderRadius: 10, fontSize: 12 }}>
            <b style={{ color: 'var(--amber-ink)' }}>{partLabel} 구역 대장 MSDS에 등록되어 있으나 목록에 없는 물질:</b>{' '}
            {msdsSuggest.map((s) => (
              <button key={s.name} className="btn" style={{ margin: '2px 3px', padding: '2px 9px', fontSize: 11.5 }}
                title={`대장 MSDS 구역: ${s.area}`}
                onClick={() => patch({ chems: [...cur.chems, { name: s.name, handled: true }] })}>
                + {s.name} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({s.area})</span>
              </button>
            ))}
            <div style={{ marginTop: 4, ...HINT }}>
              「산업안전보건법」 제114조에 따라 취급 화학물질은 MSDS를 게시·비치해야 합니다 — 실제 취급 시 목록에 추가하세요.
            </div>
          </div>
        )}
      </div>

      {/* ── 그 밖의 유해·위험 정보 ── */}
      <div style={SEC}>
        <div style={SEC_H}>
          그 밖의 유해·위험 정보
          {etcChanged(cur.etc, curPrev?.etc) && <span style={BADGE}>변경</span>}
        </div>

        <div style={{ ...ROW, gap: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 190 }}>최근 3년간 재해발생 현황 (총 건수)</span>
          <label style={CHECK}>사고성 <input className="input" style={IN_SM} type="number" min={0} value={cur.etc.acc3y_accident}
            onChange={(e) => patchEtc({ acc3y_accident: Number(e.target.value) })} /> 건</label>
          <label style={CHECK}>기타(질병·장해) <input className="input" style={IN_SM} type="number" min={0} value={cur.etc.acc3y_other}
            onChange={(e) => patchEtc({ acc3y_other: Number(e.target.value) })} /> 건</label>
          {autoAcc != null && autoAcc !== cur.etc.acc3y_accident && (
            <button className="btn" style={{ fontSize: 11.5 }} onClick={() => patchEtc({ acc3y_accident: autoAcc })}>
              대장 산재기록 자동 집계 {autoAcc}건 반영
            </button>
          )}
        </div>

        <div style={{ ...ROW, gap: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 190 }}>작업환경 측정 대상 유무</span>
          <label style={CHECK}><input type="radio" checked={cur.etc.env_measure} onChange={() => patchEtc({ env_measure: true })} /> 해당</label>
          <label style={CHECK}><input type="radio" checked={!cur.etc.env_measure} onChange={() => patchEtc({ env_measure: false })} /> 해당없음</label>
        </div>

        <div style={{ ...ROW, gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 190, paddingTop: 2 }}>작업허가 대상 작업의 종류</span>
          <div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={CHECK}><input type="radio" checked={cur.etc.permit} onChange={() => patchEtc({ permit: true })} /> 해당</label>
              <label style={CHECK}><input type="radio" checked={!cur.etc.permit} onChange={() => patchEtc({ permit: false, permit_types: [] })} /> 해당없음</label>
            </div>
            {cur.etc.permit && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {PERMIT_TYPES.map((v) => (
                  <label key={v} style={CHECK}>
                    <input type="checkbox" checked={cur.etc.permit_types.includes(v)} onChange={() => patchEtc({ permit_types: toggleIn(cur.etc.permit_types, v) })} /> {v}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...ROW, gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 190, paddingTop: 2 }}>도급업체 유무 및 종류</span>
          <div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={CHECK}><input type="radio" checked={cur.etc.contractor} onChange={() => patchEtc({ contractor: true })} /> 해당</label>
              <label style={CHECK}><input type="radio" checked={!cur.etc.contractor} onChange={() => patchEtc({ contractor: false, contractor_types: [], contractor_etc: '' })} /> 해당없음</label>
            </div>
            {cur.etc.contractor && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {CONTRACTOR_TYPES.map((v) => (
                  <label key={v} style={CHECK}>
                    <input type="checkbox" checked={cur.etc.contractor_types.includes(v)} onChange={() => patchEtc({ contractor_types: toggleIn(cur.etc.contractor_types, v) })} /> {v}
                  </label>
                ))}
                <label style={CHECK}>기타 <input className="input" style={{ width: 120 }} value={cur.etc.contractor_etc} placeholder="예) 통학"
                  onChange={(e) => patchEtc({ contractor_etc: e.target.value })} /></label>
              </div>
            )}
          </div>
        </div>

        <div style={{ ...ROW, gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 190, paddingTop: 2 }}>취약계층 근로자 유무 및 현황</span>
          <div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={CHECK}><input type="radio" checked={cur.etc.vulnerable} onChange={() => patchEtc({ vulnerable: true })} /> 해당</label>
              <label style={CHECK}><input type="radio" checked={!cur.etc.vulnerable} onChange={() => patchEtc({ vulnerable: false, vulnerable_types: [] })} /> 해당없음</label>
            </div>
            {cur.etc.vulnerable && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {VULNERABLE_TYPES.map((v) => (
                  <label key={v} style={CHECK}>
                    <input type="checkbox" checked={cur.etc.vulnerable_types.includes(v)} onChange={() => patchEtc({ vulnerable_types: toggleIn(cur.etc.vulnerable_types, v) })} /> {v}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 저장 · 검토 완료 ── */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" onClick={p.onSave} disabled={!sid || p.busy}>
          {p.busy ? '저장 중…' : '저장'}
        </button>
        <button
          className="btn"
          style={cur.etc.reviewed ? { background: 'var(--ok-soft)', color: 'var(--ok-ink)', fontWeight: 800 } : undefined}
          onClick={() => patchEtc({ reviewed: !cur.etc.reviewed })}
        >
          <BadgeCheck size={14} /> {cur.etc.reviewed ? `${partLabel} 검토 완료됨 (해제)` : `${partLabel} 검토 완료`}
        </button>
        {p.msg && <span style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>{p.msg}</span>}
        {p.onNext && (
          <button className="btn" style={{ marginLeft: 'auto', fontWeight: 800 }} onClick={p.onNext}>다음 →</button>
        )}
      </div>
    </div>
  )
}
