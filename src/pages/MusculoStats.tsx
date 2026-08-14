// 근골격계 증상조사표 통계 — 본사(HQ). 기존 엑셀(00_보호해제_수식유지.xlsx)의 분류·집계를
// 웹으로 이식. 학교별 종사자 증상조사표를 입력/붙여넣기 → KOSHA 기준 통계 산출.
// 저장: /ops/docs/musculo-symptom (school_id → { workers, updated }). 순수 웹(백엔드 무변경).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ClipboardList, Plus, Save, Smartphone, Trash2, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import {
  BURDEN_OPTS, DEFAULT_CUR_THRESH, DEFAULT_PREV_THRESH, DURATION_OPTS, FREQUENCY_OPTS, INTENSITY_OPTS, PARTS, VERDICTS,
  classifyWorker, computeStats, parsePastedData,
  type PartAnswer, type PartKey, type Thresh, type Verdict, type Worker,
} from '../features/musculo/symptomStats'

type School = { id: string; name: string; manager?: string }
type Doc = Record<string, { workers: Worker[]; updated?: string; curThresh?: Thresh; prevThresh?: Thresh }>
const DOC_KEY = 'musculo-symptom'

const VCLS: Record<Verdict, string> = { 정상: 'ok', 관리대상자: 'doing', 통증호소자: 'poor' }
function VBadge({ v }: { v: Verdict }) {
  return <span className={'pillx ' + VCLS[v]}>{v}</span>
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)

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
  const stats = useMemo(() => computeStats(workers, { curThresh, prevThresh }), [workers, curThresh, prevThresh])

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

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / <Link to="/musculo">근골격계</Link> / <b>증상조사표 통계</b>
      </div>
      <div className="bar">
        <h2><ClipboardList size={20} /> 증상조사표 통계</h2>
        <div className="sp" />
        <span className="pillx doing" style={{ whiteSpace: 'normal' }}>
          KOSHA 「근골격계부담작업 유해요인조사 지침」 기준 · 통증호소자/관리대상자 자동 분류
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
                </>
              )}
              {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes('실패') ? 'var(--red-ink)' : 'var(--ok-ink)' }}>{msg}</span>}
            </div>
          </div>

          {!sel ? (
            <div className="tstate">학교를 선택하면 해당 학교의 증상조사표를 입력·조회할 수 있습니다.</div>
          ) : (
            <>
              {/* ── 요약 카드 ── */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <SummaryCard label="응답자" value={`${stats.total}명`} sub={stats.age.n ? `평균 ${stats.age.mean.toFixed(1)}세 (±${stats.age.sd.toFixed(1)})` : ''} />
                {VERDICTS.map((v) => (
                  <SummaryCard key={v} label={v} value={`${stats.overall[v]}명`} sub={`${pct(stats.overall[v], stats.total)}%`} tone={VCLS[v]} />
                ))}
              </div>

              {/* ── 부위별 분포 ── */}
              <StatTable title="통증부위별 분포 (전체 판정 기준)" rows={[
                ...PARTS.map((p) => ({ label: p.label, counts: stats.byPart[p.key] })),
                { label: '전체', counts: stats.byPart.all, bold: true },
              ]} total={stats.total} />

              {/* ── 부서별 / 라인별 / 작업별 ── */}
              {stats.byDept.length > 0 && (
                <StatTable title="부서별 분포" firstCol="부서" rows={stats.byDept.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
              )}
              {stats.byLine.length > 0 && (
                <StatTable title="라인별 분포" firstCol="라인" rows={stats.byLine.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
              )}
              {stats.byJob.length > 0 && (
                <StatTable title="작업별 분포" firstCol="작업" rows={stats.byJob.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
              )}

              {/* ── 작업기간 그룹 (임계값 설정) ── */}
              <div className="ledger" style={{ marginBottom: 14 }}>
                <div className="lh" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 15 }}>작업기간 그룹 설정 (년)</h2>
                  <div className="sp" />
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>현재</span>
                  <ThreshInput t={curThresh} onChange={setCurThresh} />
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginLeft: 8 }}>이전</span>
                  <ThreshInput t={prevThresh} onChange={setPrevThresh} />
                </div>
                <div style={{ padding: '0 18px 12px', fontSize: 11.5, color: 'var(--muted)' }}>
                  경계값 3개로 4구간(미만 / 사이 / 사이 / 이상)을 나눕니다. 기본값은 엑셀과 동일(현재 1·3·3, 이전 1·2·3).
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <StatTable title="현재 작업기간별 분포" firstCol="현재 작업기간" rows={stats.byCurPeriod.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
                </div>
                <div style={{ flex: '1 1 320px' }}>
                  <StatTable title="이전 작업기간별 분포" firstCol="이전 작업기간" rows={stats.byPrevPeriod.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
                </div>
              </div>

              {/* ── 성별 / 연령대 / 부담 ── */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <StatTable title="성별 분포" firstCol="성별" rows={[
                    { label: '남자', counts: stats.bySex.남 },
                    { label: '여자', counts: stats.bySex.여 },
                    ...(stats.bySex.미상.정상 + stats.bySex.미상.관리대상자 + stats.bySex.미상.통증호소자 > 0 ? [{ label: '미상', counts: stats.bySex.미상 }] : []),
                  ]} total={stats.total} />
                </div>
                {stats.byAgeBand.length > 0 && (
                  <div style={{ flex: '1 1 300px' }}>
                    <StatTable title="연령대별 분포" firstCol="연령대" rows={stats.byAgeBand.map((b) => ({ label: b.key, counts: b.counts }))} total={stats.total} />
                  </div>
                )}
                {stats.byBurden.length > 0 && (
                  <div style={{ flex: '1 1 300px' }}>
                    <StatTable title="육체적 부담정도별 분포" firstCol="부담정도" rows={stats.byBurden.map((b) => ({ label: b.label, counts: b.counts }))} total={stats.total} />
                  </div>
                )}
              </div>

              {/* ── 종사자 목록 ── */}
              <div className="ledger" style={{ marginTop: 14 }}>
                <div className="lh"><h2 style={{ fontSize: 15 }}><Activity size={16} /> 종사자 목록</h2><span className="pillx doing">{workers.length}명</span></div>
                <div className="twrap">
                  <table className="tbl">
                    <thead><tr>
                      <th>성명</th><th className="c">성별</th><th className="c">연령</th><th>부서</th><th>작업</th>
                      {PARTS.map((p) => <th key={p.key} className="c" style={{ fontSize: 11 }}>{p.label}</th>)}
                      <th className="c">전체</th><th />
                    </tr></thead>
                    <tbody>
                      {workers.map((w) => {
                        const { byPart, overall } = classifyWorker(w)
                        return (
                          <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(JSON.parse(JSON.stringify(w)) as Worker)}>
                            <td><b>{w.name || '(무명)'}</b></td>
                            <td className="c">{w.sex === 1 ? '남' : w.sex === 2 ? '여' : '—'}</td>
                            <td className="c">{w.age ?? '—'}</td>
                            <td>{w.dept || '—'}</td>
                            <td>{w.job || '—'}</td>
                            {PARTS.map((p) => (
                              <td key={p.key} className="c">
                                <span title={byPart[p.key]} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: byPart[p.key] === '통증호소자' ? 'var(--red-ink)' : byPart[p.key] === '관리대상자' ? 'var(--amber-ink)' : 'var(--line-2)' }} />
                              </td>
                            ))}
                            <td className="c"><VBadge v={overall} /></td>
                            <td className="c" onClick={(e) => e.stopPropagation()}>
                              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => removeWorker(w.id)}><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        )
                      })}
                      {workers.length === 0 && <tr><td colSpan={13}><div className="tstate">종사자를 추가하거나 엑셀에서 붙여넣으세요.</div></td></tr>}
                    </tbody>
                  </table>
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

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ flex: '1 1 150px', padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--line)', borderLeft: tone ? `4px solid var(--${tone === 'ok' ? 'ok' : tone === 'doing' ? 'amber' : 'red'}-ink)` : '4px solid var(--line)', borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function StatTable({ title, rows, total, firstCol = '구분' }: { title: string; firstCol?: string; total: number; rows: { label: string; counts: Record<Verdict, number>; bold?: boolean }[] }) {
  return (
    <div className="ledger" style={{ marginBottom: 14 }}>
      <div className="lh"><h2 style={{ fontSize: 15 }}>{title}</h2></div>
      <div className="twrap">
        <table className="tbl">
          <thead><tr><th>{firstCol}</th>{VERDICTS.map((v) => <th key={v} className="c">{v}</th>)}<th className="c">합계</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const t = r.counts.정상 + r.counts.관리대상자 + r.counts.통증호소자
              return (
                <tr key={i} style={r.bold ? { fontWeight: 800, background: 'var(--card-2)' } : undefined}>
                  <td>{r.label}</td>
                  {VERDICTS.map((v) => (
                    <td key={v} className="c">{r.counts[v]}{r.counts[v] > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({pct(r.counts[v], t)}%)</span>}</td>
                  ))}
                  <td className="c"><b>{t}</b></td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={5}><div className="tstate">데이터 없음</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
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

function ThreshInput({ t, onChange }: { t: Thresh; onChange: (t: Thresh) => void }) {
  const set = (i: number, v: string) => {
    const nt = [...t] as Thresh
    const n = Number(v)
    nt[i] = Number.isFinite(n) ? n : 0
    onChange(nt)
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <input key={i} className="input" type="number" value={t[i]} onChange={(e) => set(i, e.target.value)}
          style={{ width: 54, fontSize: 12.5, padding: '4px 6px' }} />
      ))}
    </span>
  )
}

function L({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
