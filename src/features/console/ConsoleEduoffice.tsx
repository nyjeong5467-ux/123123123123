// 경영 콘솔 — 교육청 전송 탭: 안전점검 자동 대기 큐 + 기타 업무 일반 큐(전송/재전송) + 알림 설정.
// 안전점검: 제출 시 자동 pending(GET /eduoffice/jobs) — 본사 봇(run_real.py)이 폴링.
// 기타(근골·위험성평가·교육): 앱/웹 '교육청 업로드' 버튼이 일반 큐에 enqueue → run_queue.py 폴링.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CheckCircle2, CloudUpload, Info, KeyRound, Plus, RefreshCw, Send, Terminal, Trash2, X, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import ConsoleNotify from './ConsoleNotify'

type InspJob = {
  job_id: string
  inspection_id: string
  school_name: string
  part: string
  submitted_at: string | null
}

// 교육청 로그인 계정 — 봇은 첫 번째(기본) 계정으로 로그인해 전송. 비번은 마스킹.
// affiliation은 저장 호환용으로만 유지(서버가 빈 비번=기존 유지 매칭에 사용) — UI에는 노출하지 않음.
type CredAcct = { affiliation: string; base_url: string; login_id: string; has_password?: boolean; password?: string }

type QueueJob = {
  job_id: string
  module: string
  record_id: string
  school_id: string
  school_name: string
  status: 'pending' | 'success' | 'failed' | 'not_required' | 'cancelled'
  signer: string
  updated_at: string
  proof_url: string
  message: string
}

const MODULE_LABEL: Record<string, string> = {
  risk: '위험성평가',
  musculo: '근골격계',
  education: '교육',
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'todo' },
  success: { label: '전송완료', cls: 'ok' },
  failed: { label: '실패', cls: 'late' },
  not_required: { label: '해당없음', cls: 'na' },
  cancelled: { label: '취소됨', cls: 'na' },
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts.slice(0, 16).replace('T', ' ')
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ConsoleEduoffice() {
  const [insp, setInsp] = useState<InspJob[]>([])
  const [queue, setQueue] = useState<QueueJob[]>([])
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState('')
  const [fModule, setFModule] = useState('')
  const [busy, setBusy] = useState('')
  const [cancelBusy, setCancelBusy] = useState('')
  const [inspCancelBusy, setInspCancelBusy] = useState('')
  const [inspMsg, setInspMsg] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [creds, setCreds] = useState<CredAcct[]>([])
  const [credBusy, setCredBusy] = useState(false)
  const [credMsg, setCredMsg] = useState('')
  // 개별 전송/재전송 인라인 게이지 — 버튼을 누른 행의 job_id를 추적(여러 행 동시 추적 가능).
  // enqueue는 (module,record_id) 멱등이라 클릭한 행의 job_id가 그대로 pending으로 재등장한다.
  const [watched, setWatched] = useState<Set<string>>(() => new Set())
  const collapseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ij, qj, cr] = await Promise.all([
        api<InspJob[]>('/eduoffice/jobs').catch(() => []),
        api<QueueJob[]>('/eduoffice/queue').catch(() => []),
        api<{ accounts: CredAcct[] }>('/eduoffice/credentials').catch(() => ({ accounts: [] as CredAcct[] })),
      ])
      setInsp(Array.isArray(ij) ? ij : [])
      setQueue(Array.isArray(qj) ? qj : [])
      setCreds((cr.accounts || []).map((a) => ({ ...a, password: '' }))) // 입력 비번은 빈값=기존 유지
    } finally {
      setLoading(false)
    }
  }, [])

  // 큐만 가볍게 재조회(폴링용) — insp/creds는 갱신하지 않아 화면 깜빡임을 줄인다.
  const refreshQueue = useCallback(async () => {
    try {
      const qj = await api<QueueJob[]>('/eduoffice/queue')
      setQueue(Array.isArray(qj) ? qj : [])
    } catch { /* 일시 오류는 직전 상태 유지 */ }
  }, [])

  // 안전점검 대기 큐만 가볍게 재조회 — 영구 취소 후 목록 갱신용(전체 load 깜빡임 방지).
  const refreshInsp = useCallback(async () => {
    try {
      const ij = await api<InspJob[]>('/eduoffice/jobs')
      setInsp(Array.isArray(ij) ? ij : [])
    } catch { /* 일시 오류는 직전 상태 유지 */ }
  }, [])

  // 안전점검 영구 취소 — 봇 대기열에서 제거 + 앱 재동기화로도 재등록 안 됨(새 제출만 재진입).
  async function cancelInspJob(j: InspJob) {
    if (inspCancelBusy) return
    if (!window.confirm('이 건을 교육청 전송 대상에서 영구 제외합니다. 이후 앱 재동기화로도 다시 올라오지 않습니다(새로 제출한 건만 다시 등록됨). 취소할까요?')) return
    setInspCancelBusy(j.inspection_id)
    setInspMsg('')
    try {
      await api<{ ok: boolean; id: string; cancelled_at: string }>(
        `/eduoffice/jobs/${j.inspection_id}/cancel`, { method: 'POST' },
      )
      await refreshInsp()
      setInspMsg('영구 취소됨')
      setTimeout(() => setInspMsg(''), 3000)
    } catch (e) {
      setInspMsg(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setInspCancelBusy('')
    }
  }

  useEffect(() => { void load() }, [load])

  // 대기(pending) 건이 남아 있는 동안 2초마다 큐 폴링 → 게이지바가 완료율을 실시간 반영.
  // 대기 0이 되면 effect 정리로 인터벌 해제(중복 인터벌 없음).
  const pendingCount = useMemo(() => queue.filter((j) => j.status === 'pending').length, [queue])
  useEffect(() => {
    if (pendingCount === 0) return
    const id = setInterval(() => { void refreshQueue() }, 2000)
    return () => clearInterval(id)
  }, [pendingCount, refreshQueue])

  // 인라인 게이지 추적 해제(예약된 자동 접힘 타이머도 함께 정리).
  const unwatch = useCallback((id: string) => {
    const t = collapseTimers.current[id]
    if (t) { clearTimeout(t); delete collapseTimers.current[id] }
    setWatched((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id); return next
    })
  }, [])

  // 추적 중인 행: 성공/취소 등 정상 종료 → 6초 뒤 자동 접힘. 실패는 닫기/재전송 전까지 유지.
  // 재전송으로 다시 pending이 되면 예약된 접힘을 취소해 게이지를 계속 보여준다.
  useEffect(() => {
    for (const id of watched) {
      const job = queue.find((q) => q.job_id === id)
      const st = job?.status
      if (st === 'pending' || st === 'failed') {
        const t = collapseTimers.current[id]
        if (t) { clearTimeout(t); delete collapseTimers.current[id] }
      } else if (!collapseTimers.current[id]) {
        collapseTimers.current[id] = setTimeout(() => {
          delete collapseTimers.current[id]
          unwatch(id)
        }, 6000)
      }
    }
  }, [queue, watched, unwatch])

  // 언마운트 시 남은 타이머 정리.
  useEffect(() => () => {
    Object.values(collapseTimers.current).forEach(clearTimeout)
  }, [])

  function patchCred(i: number, patch: Partial<CredAcct>) {
    setCreds((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function addCred() {
    setCreds((prev) => [...prev, { affiliation: '', base_url: 'https://jhs.jne.go.kr', login_id: '', has_password: false, password: '' }])
  }
  function removeCred(i: number) {
    setCreds((prev) => prev.filter((_, idx) => idx !== i))
  }
  async function saveCreds() {
    setCredBusy(true); setCredMsg('')
    try {
      const accounts = creds.map((c) => ({
        // 기존 계정은 서버에서 받은 affiliation을 그대로 보존(빈 비번=기존 비번 유지 매칭용), 새 행은 ''
        affiliation: (c.affiliation || '').trim(),
        base_url: c.base_url.trim(),
        login_id: c.login_id.trim(),
        password: (c.password || '').trim(), // 빈값이면 백엔드가 기존 비번 유지
      }))
      await api('/eduoffice/credentials', { method: 'PUT', body: JSON.stringify({ accounts }) })
      setCredMsg('교육청 계정을 저장했습니다.')
      await load() // has_password 갱신
      setTimeout(() => setCredMsg(''), 2500)
    } catch (e) {
      setCredMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setCredBusy(false)
    }
  }

  const kpi = useMemo(() => {
    const pend = insp.length + queue.filter((j) => j.status === 'pending').length
    const ok = queue.filter((j) => j.status === 'success').length
    const fail = queue.filter((j) => j.status === 'failed').length
    return { pend, ok, fail }
  }, [insp, queue])

  // 전송 진행 게이지 — 현재 보고 있는 업무(fModule) 범위 기준(상태필터 fStatus는 무시하고
  // 그 업무의 대기/완료/실패 분포를 그대로 반영). 진행률 = (전체 - 대기) / 전체.
  const gauge = useMemo(() => {
    const scope = queue.filter((j) => !fModule || j.module === fModule)
    const total = scope.length
    const pend = scope.filter((j) => j.status === 'pending').length
    const fail = scope.filter((j) => j.status === 'failed').length
    const ok = total - pend - fail // success + not_required
    const done = total - pend      // 처리중/완료(실패 포함)
    const pct = total ? Math.round((done / total) * 100) : 0
    const okPct = total ? (ok / total) * 100 : 0
    const failPct = total ? (fail / total) * 100 : 0
    return { total, pend, fail, ok, done, pct, okPct, failPct }
  }, [queue, fModule])

  const filtered = useMemo(
    () => queue.filter((j) =>
      (!fStatus || j.status === fStatus) && (!fModule || j.module === fModule)),
    [queue, fStatus, fModule],
  )

  async function resend(j: QueueJob) {
    setBusy(j.job_id)
    setMsg('')
    try {
      await api('/eduoffice/queue/enqueue', {
        method: 'POST',
        body: JSON.stringify({
          module: j.module, record_id: j.record_id,
          school_id: j.school_id, school_name: j.school_name, signer: j.signer,
        }),
      })
      // 클릭한 행 바로 아래 인라인 게이지 표시 시작(멱등 job_id 그대로 추적).
      setWatched((prev) => new Set(prev).add(j.job_id))
      setMsg(`${j.school_name} 재전송 대기 등록 — 봇 폴러가 처리합니다`)
      await load()
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '재전송 실패')
    } finally {
      setBusy('')
    }
  }

  // 전송 취소 — 대기(pending)/실패(failed) 건을 교육청 대기열에서 제거.
  // 이미 제출완료(success)면 백엔드가 ok:false + 안내 메시지를 반환 → 성공으로 처리하지 않고 알림만.
  async function cancelJob(j: QueueJob) {
    if (cancelBusy) return
    if (!window.confirm('이 전송 작업을 취소할까요? (교육청 대기열에서 제거됩니다)')) return
    setCancelBusy(j.job_id)
    setMsg('')
    try {
      const res = await api<{ ok: boolean; job_id?: string; status: string; message?: string; proof_url?: string }>(
        '/eduoffice/queue/cancel', { method: 'POST', body: JSON.stringify({ job_id: j.job_id }) },
      )
      if (res.ok) {
        setMsg('전송 취소됨')
        await refreshQueue()
        setTimeout(() => setMsg(''), 3000)
      } else {
        // 이미 제출 완료 등 봇으로 취소 불가 — 성공으로 처리하지 않음
        window.alert(res.message || '이미 교육청에 제출 완료된 건이라 취소할 수 없습니다.')
        await refreshQueue()
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setCancelBusy('')
    }
  }

  // 현재 업무 범위의 실패 건을 일괄 재전송(배치 enqueue) → 폴링이 게이지를 채운다.
  async function resendAllFailed() {
    const targets = queue.filter((j) => (!fModule || j.module === fModule) && j.status === 'failed')
    if (!targets.length) return
    setBatchBusy(true); setMsg('')
    try {
      for (const j of targets) {
        await api('/eduoffice/queue/enqueue', {
          method: 'POST',
          body: JSON.stringify({
            module: j.module, record_id: j.record_id,
            school_id: j.school_id, school_name: j.school_name, signer: j.signer,
          }),
        })
      }
      setMsg(`${targets.length}건 재전송 대기 등록 — 봇 폴러가 처리합니다`)
      await refreshQueue()
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '재전송 실패')
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div>
      {/* KPI */}
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="l">전송 대기</div>
          <div className="v">{kpi.pend}<small> 건</small></div>
          <div className="d">봇 폴러가 순차 처리</div>
        </div>
        <div className="kpi">
          <div className="l">전송 완료</div>
          <div className="v" style={{ color: 'var(--ok-ink, var(--ok))' }}>{kpi.ok}<small> 건</small></div>
          <div className="d">교육청 반영 완료</div>
        </div>
        <div className="kpi">
          <div className="l">전송 실패</div>
          <div className="v" style={{ color: kpi.fail ? 'var(--red)' : undefined }}>{kpi.fail}<small> 건</small></div>
          <div className="d">{kpi.fail ? '재전송 필요' : '이상 없음'}</div>
        </div>
      </div>

      {/* 안전점검 자동 전송 대기 */}
      <div className="ledger" style={{ marginBottom: 20 }}>
        <div className="lh">
          <h2><Send size={18} /> 안전점검 전송 대기</h2>
          <div className="sp" />
          {inspMsg && <span className="pillx ok">{inspMsg}</span>}
          <span className="pillx na">제출 시 자동 대기</span>
          <button className="btn btn-ghost" onClick={() => void load()}><RefreshCw size={14} /> 새로고침</button>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th>학교</th><th>공정</th><th>제출일</th><th>상태</th><th>작업</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="tstate">불러오는 중…</td></tr>
              ) : insp.length === 0 ? (
                <tr><td colSpan={5} className="tstate">전송 대기 중인 안전점검이 없습니다.</td></tr>
              ) : insp.map((j) => (
                <tr key={j.job_id}>
                  <td><b>{j.school_name}</b></td>
                  <td>{j.part}</td>
                  <td>{fmt(j.submitted_at)}</td>
                  <td><span className="pillx todo">대기</span></td>
                  <td>
                    <button className="btn btn-danger" style={{ height: 28 }}
                      disabled={inspCancelBusy === j.inspection_id}
                      onClick={() => void cancelInspJob(j)}>
                      <Ban size={12} /> {inspCancelBusy === j.inspection_id ? '취소 중…' : '영구 취소'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기타 업무 전송 큐 */}
      <div className="ledger" style={{ marginBottom: 20 }}>
        <div className="lh">
          <h2><CloudUpload size={18} /> 기타 업무 전송 큐</h2>
          <div className="sp" />
          {msg && <span className="pillx ok">{msg}</span>}
          <select className="input" style={{ width: 130, height: 34 }} value={fModule}
            onChange={(e) => setFModule(e.target.value)}>
            <option value="">전체 업무</option>
            <option value="risk">위험성평가</option>
            <option value="musculo">근골격계</option>
            <option value="education">교육</option>
          </select>
          <select className="input" style={{ width: 120, height: 34 }} value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}>
            <option value="">전체 상태</option>
            <option value="pending">대기</option>
            <option value="success">전송완료</option>
            <option value="failed">실패</option>
            <option value="cancelled">취소됨</option>
          </select>
        </div>

        {/* 전송/재전송 버튼 + 바로 아래 업로드 진행 게이지바 */}
        <div className="eduoffice-send">
          <div className="send-actions">
            <button
              className="btn btn-primary"
              onClick={() => void resendAllFailed()}
              disabled={batchBusy || gauge.fail === 0}
            >
              <Send size={14} /> {batchBusy ? '등록 중…' : `실패 전체 재전송${gauge.fail ? ` (${gauge.fail})` : ''}`}
            </button>
            <button className="btn btn-ghost" onClick={() => void refreshQueue()}>
              <RefreshCw size={14} /> 새로고침
            </button>
            {pendingCount > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                <span className="gauge-live-dot" /> 2초마다 자동 갱신 중
              </span>
            )}
          </div>

          {gauge.total > 0 && (gauge.pend > 0 || gauge.fail > 0) && (
            <div className="gauge" aria-live="polite">
              <div
                className="gauge-track"
                role="progressbar"
                aria-valuenow={gauge.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`교육청 전송 진행률 ${gauge.pct}%`}
              >
                <div className="gauge-fill" style={{ width: `${gauge.okPct}%` }} />
                <div className="gauge-fail" style={{ width: `${gauge.failPct}%` }} />
              </div>
              <div className="gauge-meta">
                <span>
                  대기 <b>{gauge.pend}</b> · 처리중/완료 <b>{gauge.done}</b>
                  {gauge.fail > 0 && <> · <b style={{ color: 'var(--red-ink, var(--red))' }}>실패 {gauge.fail}</b></>}
                </span>
                <span className="gauge-pct">{gauge.pct}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr><th>업무</th><th>학교</th><th>담당자</th><th>상태</th><th>최근</th><th>작업</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="tstate">불러오는 중…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="tstate">
                  큐에 작업이 없습니다 — 앱/웹에서 [교육청 업로드]로 전송하세요.
                </td></tr>
              ) : filtered.map((j) => {
                const st = STATUS[j.status] ?? STATUS.pending
                return (
                  <Fragment key={j.job_id}>
                  <tr style={j.status === 'failed' ? { background: 'var(--red-soft, #fde7e8)' } : undefined}>
                    <td>{MODULE_LABEL[j.module] ?? j.module}</td>
                    <td><b>{j.school_name}</b></td>
                    <td>{j.signer || '—'}</td>
                    <td>
                      <span className={'pillx ' + st.cls}>{st.label}</span>
                      {j.status === 'failed' && j.message && (
                        <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{j.message}</span>
                      )}
                    </td>
                    <td>{fmt(j.updated_at)}</td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {(j.status === 'failed' || j.status === 'success') && (
                          <button className="btn btn-ghost" style={{ height: 28 }}
                            disabled={busy === j.job_id} onClick={() => void resend(j)}>
                            <RefreshCw size={12} /> {busy === j.job_id ? '등록 중…' : '재전송'}
                          </button>
                        )}
                        {(j.status === 'pending' || j.status === 'failed') && (
                          <button className="btn btn-danger" style={{ height: 28 }}
                            disabled={cancelBusy === j.job_id} onClick={() => void cancelJob(j)}>
                            <Ban size={12} /> {cancelBusy === j.job_id ? '취소 중…' : '취소'}
                          </button>
                        )}
                        {j.status === 'success' && (
                          <span className="pillx na" title="이미 교육청에 제출 완료 — 봇으로 삭제할 수 없어 교육청 사이트에서 담당자가 직접 삭제해야 합니다.">
                            교육청 직접 삭제 필요
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* 전송/재전송 버튼을 누른 행 바로 아래 인라인 업로드 게이지 */}
                  {watched.has(j.job_id) && (
                    <tr className="row-gauge">
                      <td colSpan={6}>
                        {j.status === 'pending' ? (
                          <div className="inline-gauge" aria-live="polite">
                            <div className="inline-gauge-track">
                              <div className="inline-gauge-bar" />
                            </div>
                            <div className="inline-gauge-meta">
                              <span><span className="gauge-live-dot" /> 교육청 전송 대기 중 · 봇이 순차 처리</span>
                            </div>
                          </div>
                        ) : j.status === 'failed' ? (
                          <div className="inline-gauge" aria-live="polite">
                            <div className="inline-gauge-track fail">
                              <div className="inline-gauge-bar static" />
                            </div>
                            <div className="inline-gauge-meta">
                              <span className="fail-ink">
                                <XCircle size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                                전송 실패{j.message ? `: ${j.message}` : ''} — [재전송]으로 다시 시도하세요
                              </span>
                              <button className="btn btn-ghost inline-gauge-dismiss" onClick={() => unwatch(j.job_id)}>
                                <X size={12} /> 닫기
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-gauge" aria-live="polite">
                            <div className={'inline-gauge-track ' + (j.status === 'success' ? 'ok' : 'na')}>
                              <div className="inline-gauge-bar static" />
                            </div>
                            <div className="inline-gauge-meta">
                              {j.status === 'success' ? (
                                <span className="ok-ink">
                                  <CheckCircle2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                                  전송 완료 — 교육청 반영됨
                                </span>
                              ) : (
                                <span>전송 취소됨</span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 교육청 로그인 계정 */}
      <div className="ledger" style={{ marginBottom: 20 }}>
        <div className="lh">
          <h2><KeyRound size={18} /> 교육청 로그인 계정</h2>
          <div className="sp" />
          {credMsg && <span className="pillx ok">{credMsg}</span>}
          <button className="btn btn-ghost" onClick={addCred}><Plus size={14} /> 계정 추가</button>
          <button className="btn btn-primary" onClick={() => void saveCreds()} disabled={credBusy}>{credBusy ? '저장 중…' : '저장'}</button>
        </div>
        <div className="card-body" style={{ padding: '16px 26px' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.7 }}>
            교육청 사이트 로그인 계정을 등록하면 봇이 이 계정으로 자동 로그인해 전송합니다.
            <b> 모든 학교 업로드에 기본(첫 번째) 계정이 사용됩니다.</b>{' '}
            비밀번호는 저장 후 <b>마스킹</b>되며, 빈칸으로 저장하면 기존 비밀번호가 유지됩니다.
          </div>
          {creds.length === 0 && (
            <div className="tstate">등록된 교육청 계정이 없습니다. [계정 추가]로 계정을 등록하세요. (미등록 시 봇은 .env.local 기본 계정을 사용합니다)</div>
          )}
          {creds.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '52px 1.4fr 1fr 1fr 42px', gap: 8, marginBottom: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
                <span /><span>사이트 주소</span><span>아이디</span><span>비밀번호</span><span />
              </div>
              {creds.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1.4fr 1fr 1fr 42px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  {i === 0
                    ? <span className="pillx ok" style={{ justifySelf: 'start' }}>기본</span>
                    : <span className="muted" style={{ fontSize: 12, justifySelf: 'center' }}>{i + 1}</span>}
                  <input className="input" placeholder="https://jhs.jne.go.kr" value={c.base_url} onChange={(e) => patchCred(i, { base_url: e.target.value })} />
                  <input className="input" placeholder="아이디" value={c.login_id} onChange={(e) => patchCred(i, { login_id: e.target.value })} />
                  <input className="input" type="password" autoComplete="new-password"
                    placeholder={c.has_password ? '변경 시에만 입력' : '비밀번호'}
                    value={c.password || ''} onChange={(e) => patchCred(i, { password: e.target.value })} />
                  <button className="btn btn-ghost" title="삭제" style={{ padding: 0, width: 42 }} onClick={() => removeCred(i)}><Trash2 size={15} /></button>
                </div>
              ))}
            </>
          )}
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            모든 학교 업로드에 <b>기본(첫 번째) 계정</b>이 사용됩니다. 저장 후 본사 PC의 봇 폴러를 재실행하면 반영됩니다.
          </div>
        </div>
      </div>

      {/* 봇 실행 안내 */}
      <div className="ledger" style={{ marginBottom: 20 }}>
        <div className="lh"><h2><Terminal size={18} /> 봇 폴러 실행 안내</h2></div>
        <div className="card-body" style={{ padding: '16px 26px', fontSize: 13.5, lineHeight: 1.9 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>본사 PC(교육청 계정 로그인 가능한 PC)에서 <b>bot-agent</b> 폴러를 실행하면 대기 건을 자동 전송합니다.</li>
            <li>안전점검: <code>python run_real.py --job-id &lt;점검ID&gt;</code> (또는 폴링 모드)</li>
            <li>기타 업무(근골·위험성평가): <code>python run_queue.py</code></li>
            <li><b>실전송 전 반드시</b> <code>--dry-run</code>으로 저장 직전까지 확인하세요(교육청 서버에 저장되지 않음).</li>
          </ul>
          <div className="pillx na" style={{ marginTop: 12 }}>
            <Info size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            봇은 본사 PC에서 동작하며, 위 <b>교육청 로그인 계정</b>의 기본(첫 번째) 계정으로 전송합니다(미등록 시 .env.local 기본 계정 사용).
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <ConsoleNotify />
    </div>
  )
}
