// 경영 콘솔 — 교육청 전송 탭: 안전점검 자동 대기 큐 + 기타 업무 일반 큐(전송/재전송) + 알림 설정.
// 안전점검: 제출 시 자동 pending(GET /eduoffice/jobs) — 본사 봇(run_real.py)이 폴링.
// 기타(근골·위험성평가·교육): 앱/웹 '교육청 업로드' 버튼이 일반 큐에 enqueue → run_queue.py 폴링.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloudUpload, Info, RefreshCw, Send, Terminal } from 'lucide-react'
import { api } from '../../lib/api'
import ConsoleNotify from './ConsoleNotify'

type InspJob = {
  job_id: string
  school_name: string
  part: string
  submitted_at: string | null
}

type QueueJob = {
  job_id: string
  module: string
  record_id: string
  school_id: string
  school_name: string
  status: 'pending' | 'success' | 'failed' | 'not_required'
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
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ij, qj] = await Promise.all([
        api<InspJob[]>('/eduoffice/jobs').catch(() => []),
        api<QueueJob[]>('/eduoffice/queue').catch(() => []),
      ])
      setInsp(Array.isArray(ij) ? ij : [])
      setQueue(Array.isArray(qj) ? qj : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const kpi = useMemo(() => {
    const pend = insp.length + queue.filter((j) => j.status === 'pending').length
    const ok = queue.filter((j) => j.status === 'success').length
    const fail = queue.filter((j) => j.status === 'failed').length
    return { pend, ok, fail }
  }, [insp, queue])

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
      setMsg(`${j.school_name} 재전송 대기 등록 — 봇 폴러가 처리합니다`)
      await load()
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '재전송 실패')
    } finally {
      setBusy('')
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
          <span className="pillx na">제출 시 자동 대기</span>
          <button className="btn btn-ghost" onClick={() => void load()}><RefreshCw size={14} /> 새로고침</button>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th>학교</th><th>공정</th><th>제출일</th><th>상태</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="tstate">불러오는 중…</td></tr>
              ) : insp.length === 0 ? (
                <tr><td colSpan={4} className="tstate">전송 대기 중인 안전점검이 없습니다.</td></tr>
              ) : insp.map((j) => (
                <tr key={j.job_id}>
                  <td><b>{j.school_name}</b></td>
                  <td>{j.part}</td>
                  <td>{fmt(j.submitted_at)}</td>
                  <td><span className="pillx todo">대기</span></td>
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
          </select>
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
                  <tr key={j.job_id} style={j.status === 'failed' ? { background: 'var(--red-soft, #fde7e8)' } : undefined}>
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
                      {(j.status === 'failed' || j.status === 'success') && (
                        <button className="btn btn-ghost" style={{ height: 28 }}
                          disabled={busy === j.job_id} onClick={() => void resend(j)}>
                          <RefreshCw size={12} /> {busy === j.job_id ? '등록 중…' : '재전송'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
            봇은 교육청 계정(.env.local)이 있는 본사 PC에서만 동작합니다 — 웹에서 직접 전송하지 않습니다.
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <ConsoleNotify />
    </div>
  )
}
