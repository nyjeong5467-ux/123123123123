// 근골격계 증상조사표 통계 — 본사(HQ). 기존 엑셀(00_보호해제_수식유지.xlsx)의 분류·집계를
// 웹으로 이식. 학교별 종사자 증상조사표를 입력/붙여넣기 → KOSHA 기준 통계 산출.
// 저장: /ops/docs/musculo-symptom (school_id → { workers, updated }). 순수 웹(백엔드 무변경).
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ClipboardList, FileSpreadsheet, Plus, Save, Smartphone, Trash2, Upload } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { Modal } from '../components/Modal'
import {
  BURDEN_OPTS, DEFAULT_CUR_THRESH, DEFAULT_PREV_THRESH, DURATION_OPTS, FREQUENCY_OPTS, INTENSITY_OPTS, PARTS,
  classifyWorker, parsePastedData,
  type PartAnswer, type PartKey, type Thresh, type Verdict, type Worker,
} from '../features/musculo/symptomStats'

type School = { id: string; name: string; manager?: string }
type Doc = Record<string, { workers: Worker[]; updated?: string; curThresh?: Thresh; prevThresh?: Thresh }>
const DOC_KEY = 'musculo-symptom'

const VCLS: Record<Verdict, string> = { 정상: 'ok', 관리대상자: 'doing', 통증호소자: 'poor' }
function VBadge({ v }: { v: Verdict }) {
  return <span className={'pillx ' + VCLS[v]}>{v}</span>
}

// 부위별 헤더 옅은 색(엑셀형 그룹 구분).
const PART_TINT = ['#eef3ff', '#eefcf3', '#fff4ec', '#f3eeff', '#fdeff5', '#eef9ff']

function newWorker(): Worker {
  return { id: 'w-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: '', parts: {} }
}

export function MusculoStats() {
  const [schools, setSchools] = useState<School[]>([])
  const [doc, setDoc] = useState<Doc>({})
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [edit, setEdit] = useState<Worker | null>(null) // 편집 중 종사자(사본)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [curThresh, setCurThresh] = useState<Thresh>(DEFAULT_CUR_THRESH)
  const [prevThresh, setPrevThresh] = useState<Thresh>(DEFAULT_PREV_THRESH)

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<{ doc: Doc }>(`/ops/docs/${DOC_KEY}`).catch(() => ({ doc: {} as Doc })),
    ]).then(([s, d]) => {
      if (!alive) return
      setSchools(Array.isArray(s) ? s : [])
      setDoc(d.doc && typeof d.doc === 'object' ? d.doc : {})
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const workers = sel ? (doc[sel]?.workers ?? []) : []

  // 학교 전환 시 저장된 작업기간 임계값 로드(없으면 기본값=엑셀값)
  useEffect(() => {
    if (!sel) return
    setCurThresh(doc[sel]?.curThresh ?? DEFAULT_CUR_THRESH)
    setPrevThresh(doc[sel]?.prevThresh ?? DEFAULT_PREV_THRESH)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  function setWorkers(next: Worker[]) {
    if (!sel) return
    setDoc((d) => ({ ...d, [sel]: { workers: next, updated: d[sel]?.updated } }))
    setMsg('')
  }

  async function save() {
    if (!sel) return
    setBusy(true); setMsg('')
    const next: Doc = { ...doc, [sel]: { workers, updated: new Date().toISOString(), curThresh, prevThresh } }
    try {
      await api(`/ops/docs/${DOC_KEY}`, { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setDoc(next); setMsg('저장되었습니다.')
    } catch (e) {
      setMsg(e instanceof Error ? '저장 실패: ' + e.message : '저장 실패')
    } finally { setBusy(false) }
  }

  function commitEdit() {
    if (!edit) return
    const exists = workers.some((w) => w.id === edit.id)
    setWorkers(exists ? workers.map((w) => (w.id === edit.id ? edit : w)) : [...workers, edit])
    setEdit(null)
  }
  function removeWorker(id: string) { setWorkers(workers.filter((w) => w.id !== id)) }

  function doPaste() {
    const parsed = parsePastedData(pasteText)
    if (!parsed.length) { setMsg('붙여넣은 데이터에서 종사자를 찾지 못했습니다.'); return }
    setWorkers([...workers, ...parsed])
    setPasteOpen(false); setPasteText('')
    setMsg(`${parsed.length}명 불러왔습니다. (검토 후 저장하세요)`)
  }

  // ── 현장 앱 제출분(네이티브 증상시트) 가져오기 — answers(부위별 3문항) → Worker 변환 ──
  // 멱등: 기존 field- 가져오기 행을 제거 후 재추가(재가져오기 시 중복 없음). 검토 후 저장 필요.
  type FieldSheet = {
    id: string; person_name: string
    marks?: (number | null)[]
    answers?: (PartAnswer | null)[]
  }
  async function importField() {
    if (!sel || busy) return
    setBusy(true); setMsg('')
    try {
      const surveys = await api<{ id: string }[]>(`/musculo?school_id=${sel}`)
      const sheets: FieldSheet[] = []
      for (const sv of Array.isArray(surveys) ? surveys : []) {
        const list = await api<FieldSheet[]>(`/musculo/${sv.id}/sheets`).catch(() => [] as FieldSheet[])
        sheets.push(...list)
      }
      const imported: Worker[] = sheets.map((sh) => {
        const parts: Partial<Record<PartKey, PartAnswer>> = {}
        PARTS.forEach((p, i) => {
          const a = sh.answers?.[i]
          if (a && (a.duration != null || a.intensity != null || a.frequency != null)) parts[p.key] = a
        })
        return { id: `field-${sh.id}`, name: sh.person_name, parts }
      })
      if (!imported.length) { setMsg('현장 제출 증상조사표가 없습니다.'); return }
      setWorkers([...workers.filter((w) => !w.id.startsWith('field-')), ...imported])
      const withAns = imported.filter((w) => Object.keys(w.parts).length > 0).length
      setMsg(`현장 제출 ${imported.length}명 불러왔습니다 (3문항 응답 ${withAns}명). 검토 후 저장하세요.`)
    } catch (e) {
      setMsg(e instanceof Error ? '가져오기 실패: ' + e.message : '가져오기 실패')
    } finally { setBusy(false) }
  }

  // ── 인라인 그리드 편집 ──
  const num = (s: string): number | undefined => {
    const t = s.trim(); if (t === '') return undefined
    const n = Number(t); return Number.isFinite(n) ? n : undefined
  }
  function patch(id: string, p: Partial<Worker>) {
    setWorkers(workers.map((w) => (w.id === id ? { ...w, ...p } : w)))
  }
  function patchPart(id: string, key: PartKey, field: keyof PartAnswer, v: number | undefined) {
    setWorkers(workers.map((w) => {
      if (w.id !== id) return w
      const cur: PartAnswer = { ...(w.parts[key] || {}) }
      if (v == null) delete cur[field]; else cur[field] = v
      const parts = { ...w.parts }
      if (Object.keys(cur).length) parts[key] = cur; else delete parts[key]
      return { ...w, parts }
    }))
  }

  // ── 원본 공단 양식(.xlsx) 내려받기 — 판정·통계 자동 계산본 ──
  // api.ts는 JSON 전용이라 바이너리는 토큰 실어 직접 fetch → blob 다운로드.
  async function downloadExcel() {
    if (!sel || busy) return
    setBusy(true); setMsg('')
    const school = schools.find((s) => s.id === sel)
    try {
      const res = await fetch('/api/v1/musculo/symptom-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          school_name: school?.name || '', workers,
          cur_thresh: curThresh, prev_thresh: prevThresh,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const a = document.createElement('a')
      a.href = url; a.download = `${school?.name || '근골격계'}_증상조사표_통계_${ymd}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setMsg('엑셀을 내려받았습니다 — 열면 공단 양식에 판정·통계가 자동 계산됩니다.')
    } catch (e) {
      setMsg(e instanceof Error ? '엑셀 내보내기 실패: ' + e.message : '엑셀 내보내기 실패')
    } finally { setBusy(false) }
  }

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / <Link to="/musculo">근골격계</Link> / <b>증상조사표 엑셀 입력</b>
      </div>
      <div className="bar">
        <h2><ClipboardList size={20} /> 증상조사표 엑셀 입력</h2>
        <div className="sp" />
        <span className="pillx doing" style={{ whiteSpace: 'normal' }}>
          KOSHA 「근골격계부담작업 유해요인조사 지침」 기준 · 통증호소자/관리대상자 자동 분류 · 통계는 보고서 「공단 엑셀 미리보기」 단계에서 확인
        </span>
      </div>

      {loading ? <div className="tstate">불러오는 중…</div> : (
        <>
          <div className="ledger" style={{ marginBottom: 14 }}>
            <div className="lh" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label className="field" style={{ minWidth: 260 }}>
                <span>학교</span>
                <select className="select" value={sel} onChange={(e) => setSel(e.target.value)}>
                  <option value="">학교 선택…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{doc[s.id]?.workers?.length ? ` · ${doc[s.id].workers.length}명` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sp" />
              {sel && (
                <>
                  <button className="btn" onClick={() => setEdit(newWorker())}><Plus size={14} /> 종사자 추가</button>
                  <button className="btn" onClick={() => setPasteOpen(true)}><Upload size={14} /> 엑셀 붙여넣기</button>
                  <button className="btn" onClick={() => void importField()} disabled={busy} title="현장 앱에서 제출한 증상조사표(부위별 3문항)를 가져옵니다">
                    <Smartphone size={14} /> 현장 제출 불러오기
                  </button>
                  <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? '저장 중…' : '저장'}</button>
                  <button className="btn" onClick={() => void downloadExcel()} disabled={busy || workers.length === 0}
                    title="공단 원본 양식에 채워 내려받기 (열면 판정·통계 자동 계산)"
                    style={{ background: 'var(--ok-soft, #e7f6ee)', color: 'var(--ok-ink, #1b7a44)', fontWeight: 800 }}>
                    <FileSpreadsheet size={14} /> 엑셀 다운로드
                  </button>
                </>
              )}
              {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes('실패') ? 'var(--red-ink)' : 'var(--ok-ink)' }}>{msg}</span>}
            </div>
          </div>

          {!sel ? (
            <div className="tstate">학교를 선택하면 해당 학교의 증상조사표를 입력·조회할 수 있습니다.</div>
          ) : (
            <>
              {/* ── 증상조사표 입력 그리드 (엑셀형·인라인 편집) ── */}
              <MSGridStyle />
              <div className="ledger" style={{ marginTop: 14 }}>
                <div className="lh" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ fontSize: 15 }}><Activity size={16} /> 증상조사표 입력 (엑셀형)</h2>
                  <span className="pillx doing">{workers.length}명</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>셀을 클릭해 바로 입력 · 통증기간(2번)·강도(3번)·빈도(4번)만 넣어도 판정됩니다 · 오른쪽 판정은 자동</span>
                  <div className="sp" />
                  <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setWorkers([...workers, newWorker()])}><Plus size={13} /> 행 추가</button>
                </div>
                <div className="msgrid-wrap">
                  <table className="msgrid">
                    <thead>
                      <tr>
                        <th className="stick c" style={{ left: 0, width: 34, minWidth: 34 }} rowSpan={2}>#</th>
                        <th className="stick" style={{ left: 34, width: 96, minWidth: 96 }} rowSpan={2}>성명</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 46 }}>연령</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 52 }}>성별</th>
                        <th rowSpan={2} style={{ minWidth: 92 }}>부서</th>
                        <th rowSpan={2} style={{ minWidth: 74 }}>라인</th>
                        <th rowSpan={2} style={{ minWidth: 84 }}>작업</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 56 }}>결혼</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 56 }}>현재<br />기간(년)</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 48 }}>근무<br />(h)</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 56 }}>이전<br />기간(년)</th>
                        <th className="c" rowSpan={2} style={{ minWidth: 66 }}>부담<br />정도</th>
                        {PARTS.map((p, i) => (
                          <th key={p.key} className="c grp" colSpan={3} style={{ background: PART_TINT[i] }}>{p.label}</th>
                        ))}
                        <th className="c vgrp" colSpan={PARTS.length + 1}>판정 (자동)</th>
                        <th rowSpan={2} style={{ minWidth: 40 }} />
                      </tr>
                      <tr>
                        {PARTS.map((p, i) => (
                          <Fragment key={p.key}>
                            <th className="c sub" title="통증기간(2번)" style={{ background: PART_TINT[i] }}>기간</th>
                            <th className="c sub" title="통증강도(3번)" style={{ background: PART_TINT[i] }}>강도</th>
                            <th className="c sub" title="통증빈도(4번)" style={{ background: PART_TINT[i] }}>빈도</th>
                          </Fragment>
                        ))}
                        {PARTS.map((p) => <th key={p.key + 'v'} className="c sub" style={{ fontSize: 10 }}>{p.label}</th>)}
                        <th className="c sub">전체</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w, ri) => {
                        const { byPart, overall } = classifyWorker(w)
                        return (
                          <tr key={w.id}>
                            <td className="stick c idx" style={{ left: 0 }}>{ri + 1}</td>
                            <td className="stick" style={{ left: 34 }}>
                              <input value={w.name} placeholder="성명" onChange={(e) => patch(w.id, { name: e.target.value })} />
                            </td>
                            <td><input className="ta-c" type="number" value={w.age ?? ''} onChange={(e) => patch(w.id, { age: num(e.target.value) })} /></td>
                            <td>
                              <select value={w.sex ?? ''} onChange={(e) => patch(w.id, { sex: e.target.value === '' ? undefined : Number(e.target.value) as 1 | 2 })}>
                                <option value="">—</option><option value="1">남</option><option value="2">여</option>
                              </select>
                            </td>
                            <td><input value={w.dept ?? ''} onChange={(e) => patch(w.id, { dept: e.target.value })} /></td>
                            <td><input value={w.line ?? ''} onChange={(e) => patch(w.id, { line: e.target.value })} /></td>
                            <td><input value={w.job ?? ''} onChange={(e) => patch(w.id, { job: e.target.value })} /></td>
                            <td>
                              <select value={w.married ?? ''} onChange={(e) => patch(w.id, { married: e.target.value === '' ? undefined : Number(e.target.value) as 1 | 2 })}>
                                <option value="">—</option><option value="1">기혼</option><option value="2">미혼</option>
                              </select>
                            </td>
                            <td><input className="ta-c" type="number" value={w.curYears ?? ''} onChange={(e) => patch(w.id, { curYears: num(e.target.value) })} /></td>
                            <td><input className="ta-c" type="number" value={w.workHours ?? ''} onChange={(e) => patch(w.id, { workHours: num(e.target.value) })} /></td>
                            <td><input className="ta-c" type="number" value={w.prevYears ?? ''} onChange={(e) => patch(w.id, { prevYears: num(e.target.value) })} /></td>
                            <td>
                              <select value={w.burden ?? ''} title={w.burden ? BURDEN_OPTS[w.burden - 1] : ''} onChange={(e) => patch(w.id, { burden: e.target.value === '' ? undefined : Number(e.target.value) })}>
                                <option value="">—</option>{BURDEN_OPTS.map((o, i) => <option key={i} value={i + 1}>{i + 1}. {o}</option>)}
                              </select>
                            </td>
                            {PARTS.map((p) => {
                              const a = w.parts[p.key] ?? {}
                              return (
                                <GCells key={p.key} a={a}
                                  onDur={(v) => patchPart(w.id, p.key, 'duration', v)}
                                  onInt={(v) => patchPart(w.id, p.key, 'intensity', v)}
                                  onFreq={(v) => patchPart(w.id, p.key, 'frequency', v)} />
                              )
                            })}
                            {PARTS.map((p) => (
                              <td key={p.key + 'v'} className="c">
                                <span title={byPart[p.key]} className="dot" style={{ background: byPart[p.key] === '통증호소자' ? 'var(--red-ink, #c0392b)' : byPart[p.key] === '관리대상자' ? 'var(--amber-ink, #b7791f)' : 'var(--line-2, #d9dee6)' }} />
                              </td>
                            ))}
                            <td className="c"><VBadge v={overall} /></td>
                            <td className="c">
                              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 6px' }} title="삭제" onClick={() => removeWorker(w.id)}><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        )
                      })}
                      {workers.length === 0 && <tr><td colSpan={12 + PARTS.length * 4 + 2}><div className="tstate">「행 추가」·「엑셀 붙여넣기」·「현장 제출 불러오기」로 종사자를 넣으세요.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 16px 4px', fontSize: 11.5, color: 'var(--muted)' }}>
                  <span className="dot" style={{ background: 'var(--red-ink, #c0392b)' }} /> 통증호소자
                  <span className="dot" style={{ background: 'var(--amber-ink, #b7791f)', marginLeft: 12 }} /> 관리대상자
                  <span className="dot" style={{ background: 'var(--line-2, #d9dee6)', marginLeft: 12 }} /> 정상
                  <span style={{ marginLeft: 16 }}>· 기간/강도/빈도 코드는 셀의 드롭다운에서 선택(숫자가 클수록 심함).</span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── 종사자 편집 모달 ── */}
      {edit && (
        <Modal title={workers.some((w) => w.id === edit.id) ? '종사자 편집' : '종사자 추가'}
          onClose={() => setEdit(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>취소</button><button className="btn btn-primary" onClick={commitEdit} disabled={!edit.name.trim()}>확인</button></>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            <L label="성명"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></L>
            <L label="연령"><input className="input" type="number" value={edit.age ?? ''} onChange={(e) => setEdit({ ...edit, age: e.target.value === '' ? undefined : Number(e.target.value) })} /></L>
            <L label="성별"><select className="select" value={edit.sex ?? ''} onChange={(e) => setEdit({ ...edit, sex: e.target.value === '' ? undefined : Number(e.target.value) as 1 | 2 })}><option value="">—</option><option value="1">남</option><option value="2">여</option></select></L>
            <L label="부서"><input className="input" value={edit.dept ?? ''} onChange={(e) => setEdit({ ...edit, dept: e.target.value })} /></L>
            <L label="라인"><input className="input" value={edit.line ?? ''} onChange={(e) => setEdit({ ...edit, line: e.target.value })} /></L>
            <L label="작업"><input className="input" value={edit.job ?? ''} onChange={(e) => setEdit({ ...edit, job: e.target.value })} /></L>
            <L label="현재 작업기간(년)"><input className="input" type="number" value={edit.curYears ?? ''} onChange={(e) => setEdit({ ...edit, curYears: e.target.value === '' ? undefined : Number(e.target.value) })} /></L>
            <L label="육체적 부담정도"><select className="select" value={edit.burden ?? ''} onChange={(e) => setEdit({ ...edit, burden: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">—</option>{BURDEN_OPTS.map((o, i) => <option key={i} value={i + 1}>{o}</option>)}</select></L>
          </div>

          <div style={{ marginTop: 16, fontSize: 12.5, fontWeight: 800, color: 'var(--muted)' }}>부위별 증상 (통증 없으면 비워두세요)</div>
          <div className="twrap" style={{ marginTop: 6 }}>
            <table className="tbl">
              <thead><tr><th>부위</th><th>통증기간(2번)</th><th>통증강도(3번)</th><th>통증빈도(4번)</th><th className="c">판정</th></tr></thead>
              <tbody>
                {PARTS.map((p) => {
                  const a = edit.parts[p.key] ?? {}
                  const setA = (patch: Partial<{ duration: number; intensity: number; frequency: number }>) => {
                    const merged = { ...a, ...patch }
                    const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null)) as typeof a
                    setEdit({ ...edit, parts: { ...edit.parts, [p.key]: cleaned } })
                  }
                  const { byPart } = classifyWorker(edit)
                  return (
                    <tr key={p.key}>
                      <td><b>{p.label}</b></td>
                      <td><PartSelect opts={DURATION_OPTS} value={a.duration} onChange={(v) => setA({ duration: v })} /></td>
                      <td><PartSelect opts={INTENSITY_OPTS} value={a.intensity} onChange={(v) => setA({ intensity: v })} /></td>
                      <td><PartSelect opts={FREQUENCY_OPTS} value={a.frequency} onChange={(v) => setA({ frequency: v })} /></td>
                      <td className="c"><VBadge v={byPart[p.key as PartKey]} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* ── 엑셀 붙여넣기 모달 ── */}
      {pasteOpen && (
        <Modal title="엑셀 데이터 붙여넣기"
          onClose={() => setPasteOpen(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setPasteOpen(false)}>취소</button><button className="btn btn-primary" onClick={doPaste}>불러오기</button></>}
        >
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
            엑셀 <b>'데이터' 시트</b>에서 종사자 데이터 행을 <b>A열(순번)부터 다리 부위(BA열)까지</b> 선택해 복사한 뒤 아래에 붙여넣으세요.
            성명·성별·부서·작업과 부위별 문항2·3·4(기간·강도·빈도)를 자동 인식합니다.
            (A열/B열 어디서 시작하든 자동 보정 · 헤더행 자동 제외)
          </div>
          <textarea className="input" style={{ width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: 12 }}
            placeholder="여기에 붙여넣기 (탭 구분)" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
        </Modal>
      )}
    </div>
  )
}

// 부위 1개 = 기간/강도/빈도 3셀(엑셀형 인라인 드롭다운).
function GCells({ a, onDur, onInt, onFreq }: {
  a: PartAnswer
  onDur: (v?: number) => void; onInt: (v?: number) => void; onFreq: (v?: number) => void
}) {
  return (
    <>
      <td><GSel opts={DURATION_OPTS} value={a.duration} onChange={onDur} /></td>
      <td><GSel opts={INTENSITY_OPTS} value={a.intensity} onChange={onInt} /></td>
      <td><GSel opts={FREQUENCY_OPTS} value={a.frequency} onChange={onFreq} /></td>
    </>
  )
}
function GSel({ opts, value, onChange }: { opts: string[]; value?: number; onChange: (v?: number) => void }) {
  return (
    <select className="pcell" value={value ?? ''} title={value ? `${value}. ${opts[value - 1]}` : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}>
      <option value="">·</option>
      {opts.map((o, i) => <option key={i} value={i + 1}>{i + 1}. {o}</option>)}
    </select>
  )
}

// 엑셀형 편집 그리드 전용 스코프 스타일.
function MSGridStyle() {
  return (
    <style>{`
.msgrid-wrap { overflow-x: auto; border-top: 1px solid var(--line); border-radius: 0 0 4px 4px; }
.msgrid { border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.msgrid th, .msgrid td { border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); padding: 0; white-space: nowrap; }
.msgrid thead th { background: var(--card-2, #f5f3fb); font-weight: 800; font-size: 11px; padding: 5px 6px; text-align: center; line-height: 1.2; }
.msgrid thead th.sub { font-size: 10.5px; font-weight: 700; color: var(--muted, #6b7280); }
.msgrid thead th.vgrp { background: #efeaff; color: var(--violet, #7C5CFB); }
.msgrid .c { text-align: center; }
.msgrid td { height: 30px; }
.msgrid .stick { position: sticky; z-index: 1; background: var(--card, #fff); }
.msgrid thead th.stick { z-index: 2; background: var(--card-2, #f5f3fb); }
.msgrid td.stick { box-shadow: 1px 0 0 var(--line); }
.msgrid .idx { color: var(--muted, #6b7280); font-size: 11px; }
.msgrid input, .msgrid select { width: 100%; box-sizing: border-box; border: 1px solid transparent; background: transparent; padding: 4px 6px; font-size: 12.5px; border-radius: 6px; color: inherit; font-family: inherit; }
.msgrid input.ta-c { text-align: center; }
.msgrid input:hover, .msgrid select:hover { background: var(--card-2, #f5f3fb); }
.msgrid input:focus, .msgrid select:focus { border-color: var(--violet, #7C5CFB); background: var(--card, #fff); outline: none; box-shadow: 0 0 0 2px rgba(124,92,251,.18); }
.msgrid select.pcell { min-width: 44px; padding: 4px 2px; text-align: center; }
.msgrid tbody tr:nth-child(even) td:not(.stick) { background: rgba(124,92,251,.045); }
.msgrid tbody tr:hover td:not(.stick) { background: var(--card-2, #f5f3fb); }
.msgrid .dot { display: inline-block; width: 11px; height: 11px; border-radius: 999px; vertical-align: -1px; }
`}</style>
  )
}

function PartSelect({ opts, value, onChange }: { opts: string[]; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <select className="select" style={{ minWidth: 130, fontSize: 12.5 }} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}>
      <option value="">없음</option>
      {opts.map((o, i) => <option key={i} value={i + 1}>{i + 1}. {o}</option>)}
    </select>
  )
}

function L({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
