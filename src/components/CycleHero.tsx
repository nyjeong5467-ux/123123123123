// 연간 법정업무 운영 공지 히어로 + 완전 인터랙티브 에디터.
// 편집 모드: 문구 인라인 수정 · 바 드래그 이동/양끝 리사이즈(월 스냅) · 구간 추가/삭제 ·
// 업무 행 추가/삭제 · 색상 · 이행현황 자동/수동. 저장 = /ops/docs/annual-cycle (Home이 주입).
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'

/* ===================== 데이터 모델 (org_docs 'annual-cycle' v2) ===================== */
export type CycleBar = { id: string; s: number; e: number; label: string; mark: string } // s/e=학년도 인덱스 0(3월)~11(익2월), 포함
export type CycleRow = {
  id: string
  name: string
  sub: string
  tone: 'rf' | 'mg' | 'cd' | 'edu'
  auto: boolean      // true=첫 구간 기준 이행현황·기한알림 자동 계산
  status: string     // auto=false일 때 표시할 상태 문구
  bars: CycleBar[]
}
export type CycleDoc = { tagline: string; inspSub: string; rows: CycleRow[] }

const TONES: CycleRow['tone'][] = ['rf', 'mg', 'cd', 'edu']
export const AY_MONTH_NO = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]  // 학년도 인덱스 → 달력 월

function rid(): string {
  return Math.random().toString(36).slice(2, 9)
}

export const CYCLE_DOC_DEFAULT: CycleDoc = {
  tagline: '안전점검은 매월 반복 · 나머지 업무는 착수월과 제출월이 정해져 있습니다',
  inspSub: '매월 1회 · 전 학교',
  rows: [
    { id: 'risk', name: '위험성평가', sub: '연 1회 · 청취조사 → 보고서', tone: 'rf', auto: true, status: '',
      bars: [{ id: 'b1', s: 1, e: 3, label: '착수 · 청취조사', mark: '제출' }] },
    { id: 'musculo', name: '근골격계', sub: '유해요인조사 → 보고서', tone: 'mg', auto: true, status: '',
      bars: [{ id: 'b2', s: 5, e: 7, label: '착수 · 증상조사', mark: '제출' }] },
    { id: 'compliance', name: '이행점검', sub: '교육청 공지 시 · 반기 1회', tone: 'cd', auto: false, status: '공지 시 시행',
      bars: [
        { id: 'b3', s: 0, e: 5, label: '상반기 1회', mark: '공지 하달' },
        { id: 'b4', s: 6, e: 11, label: '하반기 1회', mark: '공지 대기' },
      ] },
    { id: 'edu', name: '안전보건교육', sub: '별도 공지 없음', tone: 'edu', auto: false, status: '진도표에서 확인',
      bars: [{ id: 'b5', s: 0, e: 11, label: '학교별 자체 일정에 따라 수시 진행 · 교육 진도표에서 관리', mark: '' }] },
  ],
}

// 서버 문서 → v2 도큐먼트(구버전 {riskStart..} / 빈 문서 마이그레이션)
export function migrateCycleDoc(doc: Record<string, unknown> | null | undefined): CycleDoc {
  if (!doc || Object.keys(doc).length === 0) return structuredClone(CYCLE_DOC_DEFAULT)
  if (Array.isArray(doc.rows)) {
    return { ...structuredClone(CYCLE_DOC_DEFAULT), ...(doc as unknown as CycleDoc) }
  }
  const out = structuredClone(CYCLE_DOC_DEFAULT)
  if (typeof doc.tagline === 'string') out.tagline = doc.tagline
  const ay = (m: unknown, fb: number) => (typeof m === 'number' ? (m + 9) % 12 : fb)
  out.rows[0].bars[0].s = ay(doc.riskStart, 1)
  out.rows[0].bars[0].e = ay(doc.riskSubmit, 3)
  out.rows[1].bars[0].s = ay(doc.musStart, 5)
  out.rows[1].bars[0].e = ay(doc.musSubmit, 7)
  return out
}

// 자동 이행현황(첫 구간 기준): 착수 전 → 진행 중 → 제출 마감 → 완료
export function autoStatus(row: CycleRow, curAyIdx: number): { label: string; cls: string } {
  const b = row.bars[0]
  if (!b) return { label: '—', cls: '' }
  const sM = AY_MONTH_NO[b.s], eM = AY_MONTH_NO[b.e]
  if (curAyIdx < b.s) return { label: `착수 전 · ${sM}월`, cls: '' }
  if (curAyIdx < b.e) return { label: `진행 중 · ${eM}월 제출`, cls: 'warn' }
  if (curAyIdx === b.e) return { label: `이번 달 제출 마감`, cls: 'bad' }
  return { label: `${eM}월 제출 완료`, cls: 'ok' }
}

/* ===================== 컴포넌트 ===================== */
type Seg = { cls: string; label: string }
type Props = {
  ay: number
  monthLabels: string[]      // 학년도 순서 12개(3월~2월)
  monthEn: string[]
  curAyIdx: number
  inspSegs: Seg[]            // 안전점검 월 세그먼트(자동)
  inspNum: ReactNode         // 안전점검 우측 이행현황(자동 JSX)
  nowlineLeft: string
  doc: CycleDoc
  onSave: (doc: CycleDoc) => Promise<void>
}

type Drag = { rowId: string; barId: string; mode: 'move' | 'l' | 'r'; startX: number; orig: CycleBar }

export function CycleHero(p: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CycleDoc>(p.doc)
  const [selBar, setSelBar] = useState<{ rowId: string; barId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const trackW = useRef(0)
  const drag = useRef<Drag | null>(null)
  const moved = useRef(false)

  const doc = editing ? draft : p.doc

  function startEdit() {
    setDraft(structuredClone(p.doc))
    setSelBar(null)
    setErr('')
    setEditing(true)
  }

  async function save() {
    setBusy(true)
    setErr('')
    try {
      await p.onSave(draft)
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  /* ---- 드래프트 조작 ---- */
  function patchRow(rowId: string, patch: Partial<CycleRow>) {
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }))
  }
  function patchBar(rowId: string, barId: string, patch: Partial<CycleBar>) {
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => r.id !== rowId ? r : {
        ...r, bars: r.bars.map((b) => (b.id === barId ? { ...b, ...patch } : b)),
      }),
    }))
  }
  function addRow() {
    const row: CycleRow = {
      id: rid(), name: '새 업무', sub: '설명 입력', tone: TONES[draft.rows.length % 4],
      auto: false, status: '상태 입력',
      bars: [{ id: rid(), s: 2, e: 4, label: '기간 입력', mark: '' }],
    }
    setDraft((d) => ({ ...d, rows: [...d.rows, row] }))
  }
  function removeRow(rowId: string) {
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== rowId) }))
    if (selBar?.rowId === rowId) setSelBar(null)
  }
  function addBar(rowId: string) {
    const row = draft.rows.find((r) => r.id === rowId)
    if (!row) return
    // 빈 자리(마지막 바 뒤) 우선, 없으면 앞쪽
    const lastEnd = Math.max(-1, ...row.bars.map((b) => b.e))
    const s = lastEnd + 2 <= 10 ? lastEnd + 2 : 0
    const bar: CycleBar = { id: rid(), s, e: Math.min(s + 2, 11), label: '기간', mark: '' }
    patchRow(rowId, { bars: [...row.bars, bar] })
    setSelBar({ rowId, barId: bar.id })
  }
  function removeBar(rowId: string, barId: string) {
    const row = draft.rows.find((r) => r.id === rowId)
    if (!row) return
    patchRow(rowId, { bars: row.bars.filter((b) => b.id !== barId) })
    setSelBar(null)
  }

  /* ---- 바 드래그(이동/리사이즈, 월 스냅) ---- */
  function onBarPointerDown(ev: PointerEvent, rowId: string, bar: CycleBar, mode: Drag['mode']) {
    if (!editing) return
    ev.preventDefault()
    ev.stopPropagation()
    const track = (ev.currentTarget as HTMLElement).closest('.hm-gtrack') as HTMLElement | null
    trackW.current = track ? track.getBoundingClientRect().width : 0
    drag.current = { rowId, barId: bar.id, mode, startX: ev.clientX, orig: { ...bar } }
    moved.current = false
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
  }
  function onBarPointerMove(ev: PointerEvent) {
    const d = drag.current
    if (!d || !trackW.current) return
    const colW = trackW.current / 12
    const dCols = Math.round((ev.clientX - d.startX) / colW)
    if (dCols !== 0) moved.current = true
    const { orig } = d
    if (d.mode === 'move') {
      const len = orig.e - orig.s
      const s = Math.max(0, Math.min(11 - len, orig.s + dCols))
      patchBar(d.rowId, d.barId, { s, e: s + len })
    } else if (d.mode === 'l') {
      const s = Math.max(0, Math.min(orig.e, orig.s + dCols))
      patchBar(d.rowId, d.barId, { s })
    } else {
      const e = Math.max(orig.s, Math.min(11, orig.e + dCols))
      patchBar(d.rowId, d.barId, { e })
    }
  }
  function onBarPointerUp(ev: PointerEvent, rowId: string, barId: string) {
    if (drag.current) {
      ;(ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId)
      drag.current = null
    }
    if (!moved.current) setSelBar((cur) => (cur?.barId === barId ? null : { rowId, barId }))
  }

  const selected = selBar
    ? doc.rows.find((r) => r.id === selBar.rowId)?.bars.find((b) => b.id === selBar.barId)
    : null

  return (
    <div className={'hm-card hm-cyc' + (editing ? ' editing' : '')}>
      <div className="hm-strip" />
      <div className="hm-cyc-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{p.ay}학년도 법정업무 운영 공지</h2>
          {editing ? (
            <input className="input hm-edit-inline" value={draft.tagline}
              onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} placeholder="안내 문구" />
          ) : (
            <div className="hm-tagline">{doc.tagline}</div>
          )}
        </div>
        {!editing && (
          <div className="hm-legend">
            <span><i className="sw-done" />완료</span>
            <span><i className="sw-now" />이번 달</span>
            <span><i className="sw-plan" />예정</span>
            <span><i className="sw-cd" />공지 시 시행</span>
          </div>
        )}
        <div className="hm-editbar">
          {editing ? (
            <>
              {err && <span style={{ color: 'var(--red-ink)', fontSize: 12, fontWeight: 600 }}>{err}</span>}
              <button className="btn btn-ghost hm-btn-sm" disabled={busy} onClick={() => setEditing(false)}>
                <X size={13} /> 취소
              </button>
              <button className="btn btn-primary hm-btn-sm" disabled={busy} onClick={() => void save()}>
                <Check size={13} /> {busy ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost hm-btn-sm" onClick={startEdit}><Pencil size={12} /> 편집</button>
          )}
        </div>
      </div>

      {editing && (
        <div className="hm-edit-hint">
          바를 <b>끌어서 이동</b>, 양끝을 <b>끌어서 기간 조절</b>(월 단위) · 바를 <b>클릭</b>하면 문구를 수정할 수 있습니다.
        </div>
      )}

      <div className="hm-gantt">
        <div className="hm-gline hd">
          <div />
          {p.monthLabels.map((mo, i) => (
            <div key={mo} className={'hm-mth' + (i === p.curAyIdx ? ' now' : '')}>
              {mo}
              <em>{p.monthEn[i]}</em>
            </div>
          ))}
          <div className="hm-gnum-hd">이행 현황</div>
        </div>

        {/* 안전점검 — 매월 자동(방문 실적 연동), 설명만 편집 */}
        <div className="hm-gline hm-grow">
          <div className="hm-glab">
            안전점검
            {editing
              ? <input className="input hm-edit-sub" value={draft.inspSub}
                  onChange={(e) => setDraft({ ...draft, inspSub: e.target.value })} />
              : <em>{doc.inspSub}</em>}
          </div>
          <div className="hm-gtrack">
            {p.inspSegs.map((sg, i) => (
              <div key={i} className={'hm-seg ' + sg.cls}>{sg.label}</div>
            ))}
          </div>
          {p.inspNum}
        </div>

        {/* 편집 가능한 업무 행들 */}
        {doc.rows.map((row) => {
          const st = row.auto ? autoStatus(row, p.curAyIdx) : { label: row.status, cls: '' }
          return (
            <div className="hm-gline hm-grow" key={row.id}>
              <div className="hm-glab">
                {editing ? (
                  <>
                    <span className="hm-edit-namerow">
                      <input className="input hm-edit-name" value={row.name}
                        onChange={(e) => patchRow(row.id, { name: e.target.value })} />
                      <button className="hm-tinybtn danger" title="업무 행 삭제" onClick={() => removeRow(row.id)}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                    <input className="input hm-edit-sub" value={row.sub}
                      onChange={(e) => patchRow(row.id, { sub: e.target.value })} />
                    <span className="hm-tonebar">
                      {TONES.map((t) => (
                        <button key={t} className={'hm-tone sw-' + t + (row.tone === t ? ' on' : '')}
                          title="색상" onClick={() => patchRow(row.id, { tone: t })} />
                      ))}
                      <button className="hm-tinybtn" title="구간 추가" onClick={() => addBar(row.id)}>
                        <Plus size={12} />
                      </button>
                    </span>
                  </>
                ) : (
                  <>{row.name}<em>{row.sub}</em></>
                )}
              </div>
              <div className="hm-gtrack">
                {row.bars.map((b) => (
                  <div
                    key={b.id}
                    className={'hm-bar2 ' + row.tone
                      + (editing ? ' draggable' : '')
                      + (selBar?.barId === b.id ? ' sel' : '')}
                    style={{ gridColumn: `${b.s + 1} / ${b.e + 2}` }}
                    onPointerDown={(e) => onBarPointerDown(e, row.id, b, 'move')}
                    onPointerMove={onBarPointerMove}
                    onPointerUp={(e) => onBarPointerUp(e, row.id, b.id)}
                  >
                    {editing && (
                      <span className="hm-hdl l" onPointerDown={(e) => onBarPointerDown(e, row.id, b, 'l')}
                        onPointerMove={onBarPointerMove} onPointerUp={(e) => onBarPointerUp(e, row.id, b.id)}>
                        <GripVertical size={11} />
                      </span>
                    )}
                    {row.auto && b === row.bars[0]
                      ? <>{AY_MONTH_NO[b.s]}월 {b.label}<span className="hm-mk">{AY_MONTH_NO[b.e]}월 {b.mark || '제출'}</span></>
                      : <>{b.label}{b.mark && <span className="hm-mk">{b.mark}</span>}</>}
                    {editing && (
                      <span className="hm-hdl r" onPointerDown={(e) => onBarPointerDown(e, row.id, b, 'r')}
                        onPointerMove={onBarPointerMove} onPointerUp={(e) => onBarPointerUp(e, row.id, b.id)}>
                        <GripVertical size={11} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="hm-gnum">
                <div className="n off">—</div>
                {editing && !row.auto ? (
                  <input className="input hm-edit-status" value={row.status}
                    onChange={(e) => patchRow(row.id, { status: e.target.value })} />
                ) : (
                  <div className={'s' + (st.cls ? ' ' + st.cls : '')}>{st.label}</div>
                )}
                {editing && (
                  <label className="hm-autolab" title="첫 구간 기준으로 이행현황·기한알림 자동 계산">
                    <input type="checkbox" checked={row.auto}
                      onChange={(e) => patchRow(row.id, { auto: e.target.checked })} /> 자동
                  </label>
                )}
              </div>
            </div>
          )
        })}

        {!editing && <div className="hm-nowline" style={{ left: p.nowlineLeft }} />}
      </div>

      {editing && (
        <div className="hm-edit-foot">
          <button className="btn btn-ghost hm-btn-sm" onClick={addRow}><Plus size={13} /> 업무 행 추가</button>
          {selected && selBar && (
            <span className="hm-barform">
              <b>선택 구간</b>
              <span className="pillx doing">{AY_MONTH_NO[selected.s]}월 ~ {AY_MONTH_NO[selected.e]}월</span>
              <input className="input" style={{ width: 240 }} placeholder="바 문구" value={selected.label}
                onChange={(e) => patchBar(selBar.rowId, selBar.barId, { label: e.target.value })} />
              <input className="input" style={{ width: 150 }} placeholder="우측 표기(제출 등)" value={selected.mark}
                onChange={(e) => patchBar(selBar.rowId, selBar.barId, { mark: e.target.value })} />
              <button className="hm-tinybtn danger" title="구간 삭제"
                onClick={() => removeBar(selBar.rowId, selBar.barId)}>
                <Trash2 size={12} />
              </button>
            </span>
          )}
          {!selected && <span className="muted" style={{ fontSize: 11.5 }}>바를 클릭하면 여기서 문구를 수정합니다.</span>}
        </div>
      )}
    </div>
  )
}
