import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plug, RefreshCw, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'

type School = { id: string; name: string }
type Invoice = {
  id: string
  school_id: string
  business_reg_no: string
  issue_date: string
  amount: number
  status: string
  ecount_ref: string | null
}
type EcountSettings = {
  com_code: string
  user_id: string
  api_cert_key: string
  zone: string
  test_mode: boolean
  default_issue_day: number
  memo: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  issued: { label: '발행', cls: 'ok' },
  failed: { label: '실패', cls: 'late' },
  draft: { label: '초안', cls: 'todo' },
}

const BILL_FILTERS: FilterDef<Invoice>[] = [
  {
    key: 'status',
    label: '상태',
    options: [
      { value: 'issued', label: '발행' },
      { value: 'failed', label: '실패' },
      { value: 'draft', label: '초안' },
    ],
    accessor: (r) => r.status,
  },
]
const BILL_SEARCH = [(r: Invoice) => r.business_reg_no, (r: Invoice) => r.ecount_ref ?? '']
const BILL_SORTS = {
  issue: (r: Invoice) => r.issue_date,
  amount: (r: Invoice) => r.amount,
  status: (r: Invoice) => r.status,
}

// CSV 일괄 발행 행: 학교명,사업자번호,금액,발행일(YYYY-MM-DD). 헤더 행 자동 제외.
type BulkRow = { school: string; bizNo: string; amount: number; date: string }
function parseBulkCsv(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [school = '', bizNo = '', amount = '', date = ''] = l.split(',')
      return { school: school.trim(), bizNo: bizNo.trim(), amount: Number(amount.trim()), date: date.trim() }
    })
    .filter((r) => r.school && !/^(학교|school)/i.test(r.school) && !Number.isNaN(r.amount))
}

export function Billing() {
  const [tab, setTab] = useState<'invoices' | 'settings'>('invoices')
  const [schools, setSchools] = useState<School[]>([])
  const [sid, setSid] = useState('')          // ''=전체 학교
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')      // 발행 폼/검증 오류
  const [listErr, setListErr] = useState('')  // 발행 내역 로드 오류
  const [reload, setReload] = useState(0)

  const [bizNo, setBizNo] = useState('')
  const [amount, setAmount] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryBusy, setRetryBusy] = useState('')

  // 이카운트 연동 설정
  const [settings, setSettings] = useState<EcountSettings | null>(null)
  const [setBusy, setSetBusy] = useState(false)
  const [setMsg, setSetMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [testBusy, setTestBusy] = useState(false)

  // CSV 일괄 발행
  const csvRef = useRef<HTMLInputElement>(null)
  const [bulkLog, setBulkLog] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const schoolName = useMemo(() => {
    const m = new Map(schools.map((s) => [s.id, s.name]))
    return (id: string) => m.get(id) || id.slice(0, 8)
  }, [schools])

  const BILL_EXPORT: ExportColumn<Invoice>[] = useMemo(() => [
    { header: '학교', value: (r) => schoolName(r.school_id) },
    { header: '발행일', value: (r) => r.issue_date },
    { header: '사업자번호', value: (r) => r.business_reg_no },
    { header: '금액', value: (r) => r.amount },
    { header: '상태', value: (r) => STATUS[r.status]?.label || r.status },
    { header: '참조번호', value: (r) => r.ecount_ref ?? '' },
  ], [schoolName])

  const q = useTableQuery(invoices, {
    searchFields: BILL_SEARCH,
    filters: BILL_FILTERS,
    sortAccessors: BILL_SORTS,
    searchPlaceholder: '사업자번호·참조번호',
    dateField: (r) => r.issue_date,
    dateLabel: '발행일',
  })
  const [detail, setDetail] = useState<Invoice | null>(null)

  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((d) => { if (alive) setSchools(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '오류') })
    api<{ settings: EcountSettings }>('/billing/settings')
      .then((d) => { if (alive) setSettings(d.settings) })
      .catch(() => { if (alive) setSettings(null) })
    return () => { alive = false }
  }, [])

  // 발행 내역: 학교 미선택=테넌트 전체
  useEffect(() => {
    let alive = true
    setLoading(true)
    setListErr('')
    api<Invoice[]>(sid ? `/invoices?school_id=${sid}` : '/invoices')
      .then((d) => { if (alive) { setInvoices(d); setLoading(false) } })
      .catch((e) => { if (alive) { setListErr(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [sid, reload])

  // 학교 선택 시 사업자번호·발행일 프리필(최근 발행분 + 설정 기본 발행일)
  useEffect(() => {
    if (!sid) return
    const last = invoices.filter((v) => v.school_id === sid).sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0]
    if (last && !bizNo) setBizNo(last.business_reg_no)
    if (!issueDate && settings?.default_issue_day) {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth(), settings.default_issue_day)
      if (d < now) d.setMonth(d.getMonth() + 1)
      setIssueDate(d.toISOString().slice(0, 10))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid])

  async function issue() {
    setError('')
    if (!sid) { setError('학교를 선택하세요.'); return }
    if (!bizNo.trim()) { setError('사업자번호를 입력하세요.'); return }
    if (!amount.trim() || Number.isNaN(Number(amount))) { setError('금액을 입력하세요.'); return }
    if (!issueDate) { setError('발행일을 선택하세요.'); return }
    setSubmitting(true)
    try {
      await api('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          school_id: sid,
          business_reg_no: bizNo.trim(),
          amount: Number(amount),
          issue_date: issueDate,
        }),
      })
      setBizNo(''); setAmount(''); setIssueDate('')
      setReload((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '발행 실패')
    } finally {
      setSubmitting(false)
    }
  }

  async function retryInvoice(iv: Invoice) {
    setRetryBusy(iv.id)
    try {
      await api(`/invoices/${iv.id}/retry`, { method: 'POST' })
      setReload((n) => n + 1)
      if (detail?.id === iv.id) setDetail(null)
    } catch (e) {
      setListErr(e instanceof Error ? e.message : '재발행 실패')
    } finally {
      setRetryBusy('')
    }
  }

  async function bulkIssue(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBulkBusy(true)
    setBulkLog([])
    try {
      const rows = parseBulkCsv(await f.text())
      if (!rows.length) { setBulkLog(['CSV에서 발행 행을 찾지 못했습니다. 형식: 학교명,사업자번호,금액,발행일(YYYY-MM-DD)']); return }
      const byName = new Map(schools.map((s) => [s.name, s.id]))
      const log: string[] = []
      for (const r of rows) {
        const schoolId = byName.get(r.school)
        if (!schoolId) { log.push(`✕ ${r.school} — 등록된 학교가 아님`); continue }
        try {
          const inv = await api<Invoice>('/invoices', {
            method: 'POST',
            body: JSON.stringify({ school_id: schoolId, business_reg_no: r.bizNo, amount: r.amount, issue_date: r.date }),
          })
          const st = STATUS[inv.status]?.label || inv.status
          log.push(`✓ ${r.school} · ${r.amount.toLocaleString()}원 → ${st}${inv.ecount_ref ? ` (${inv.ecount_ref})` : ''}`)
        } catch (e) {
          log.push(`✕ ${r.school} — ${e instanceof Error ? e.message : '발행 실패'}`)
        }
      }
      setBulkLog(log)
      setReload((n) => n + 1)
    } finally {
      setBulkBusy(false)
    }
  }

  async function saveSettings() {
    if (!settings) return
    setSetBusy(true)
    setSetMsg(null)
    setTestResult(null)
    try {
      const d = await api<{ settings: EcountSettings }>('/billing/settings', {
        method: 'PUT', body: JSON.stringify({ settings }),
      })
      setSettings(d.settings)
      setSetMsg({ ok: true, text: '연동 설정을 저장했습니다.' })
    } catch (e) {
      setSetMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setSetBusy(false)
    }
  }

  async function testConnection() {
    setTestBusy(true)
    setTestResult(null)
    try {
      const d = await api<{ ok: boolean; message: string }>('/billing/settings/test', { method: 'POST' })
      setTestResult({ ok: d.ok, text: d.message })
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : '연동 테스트 실패' })
    } finally {
      setTestBusy(false)
    }
  }

  const configured = !!settings?.com_code && !!settings?.api_cert_key
  const failedCount = invoices.filter((v) => v.status === 'failed').length

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>세금계산서</b></div>
      <div className="bar">
        <h2>세금계산서</h2>
        <div className="sp" />
        <div className="tabs">
          <button className={'tab' + (tab === 'invoices' ? ' active' : '')} onClick={() => setTab('invoices')}>
            발행 내역<span className="n">{invoices.length}</span>
          </button>
          <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>
            <Plug size={13} /> 이카운트 연동 설정
          </button>
        </div>
      </div>

      {tab === 'invoices' && (
        <>
          {!configured && settings !== null && (
            <div className="tstate" style={{ marginBottom: 16 }}>
              이카운트 연동이 아직 설정되지 않아 <b>테스트 모드(스텁 발행)</b>로 동작합니다.{' '}
              <button className="btn btn-ghost" style={{ marginLeft: 6 }} onClick={() => setTab('settings')}>
                <Plug size={13} /> 연동 설정 하러 가기
              </button>
            </div>
          )}

          <div className="ledger" style={{ marginBottom: 24 }}>
            <div className="lh">
              <h2><FileText size={18} /> 발행</h2>
              <div className="sp" />
              <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={(e) => { void bulkIssue(e.target.files); e.target.value = '' }} />
              <button className="btn btn-ghost" onClick={() => csvRef.current?.click()} disabled={bulkBusy}>
                <Upload size={14} /> {bulkBusy ? '일괄 발행 중…' : 'CSV 일괄 발행'}
              </button>
            </div>
            <div className="card-body" style={{ padding: '20px 26px' }}>
              <div className="formrow">
                <label className="field" style={{ minWidth: 200 }}>
                  <span>학교</span>
                  <select className="select" value={sid} onChange={(e) => setSid(e.target.value)}>
                    <option value="">전체 학교(내역 조회)</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>사업자번호</span>
                  <input className="input" value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="000-00-00000" />
                </label>
                <label className="field">
                  <span>금액</span>
                  <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </label>
                <label className="field">
                  <span>발행일</span>
                  <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </label>
                <button className="btn btn-primary" onClick={issue} disabled={submitting || !sid}>
                  <FileText size={15} /> {submitting ? '발행 중…' : '발행'}
                </button>
              </div>
              {error && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
              {bulkLog.length > 0 && (
                <div className="codebox" style={{ marginTop: 14 }}>
                  {bulkLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
              <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
                CSV 일괄 발행 형식: 학교명,사업자번호,금액,발행일(YYYY-MM-DD) — 학교마다 발행일이 다른 경우(20/25/30일, 섬지역 분기)에 사용하세요.
              </div>
            </div>
          </div>

          <div className="ledger">
            <div className="lh">
              <h2>발행 내역{sid ? ` — ${schoolName(sid)}` : ' — 전체'}</h2>
              {failedCount > 0 && <span className="pillx late" style={{ marginLeft: 8 }}>실패 {failedCount}건</span>}
              <div className="sp" />
              <FilterBar q={q} /><ExportButton q={q} columns={BILL_EXPORT} filename="세금계산서" />
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>학교</th>
                    <SortableTh q={q} col="issue">발행일</SortableTh>
                    <th>사업자번호</th>
                    <SortableTh q={q} col="amount" className="c">금액</SortableTh>
                    <SortableTh q={q} col="status" className="c">상태</SortableTh>
                    <th>참조번호</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {!listErr && q.view.map((iv) => {
                    const st = STATUS[iv.status] || { label: iv.status, cls: 'todo' }
                    return (
                      <tr key={iv.id} onClick={() => setDetail(iv)}>
                        <td>{schoolName(iv.school_id)}</td>
                        <td><b>{iv.issue_date}</b></td>
                        <td>{iv.business_reg_no}</td>
                        <td className="c">{iv.amount.toLocaleString()}원</td>
                        <td className="c"><span className={'pillx ' + st.cls}>{st.label}</span></td>
                        <td>{iv.ecount_ref || '—'}</td>
                        <td className="c">
                          {iv.status !== 'issued' && (
                            <button className="btn btn-ghost" disabled={retryBusy === iv.id}
                              onClick={(e) => { e.stopPropagation(); void retryInvoice(iv) }}>
                              <RefreshCw size={13} /> {retryBusy === iv.id ? '재발행…' : '재발행'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {loading && <tr><td colSpan={7}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && listErr && <tr><td colSpan={7}><div className="tstate">오류: {listErr}</div></td></tr>}
                  {!loading && !listErr && q.view.length === 0 && (
                    <tr><td colSpan={7}><div className="tstate">{invoices.length === 0 ? '발행된 세금계산서가 없습니다. 위 양식 또는 CSV 일괄 발행으로 발행하세요.' : '조건에 맞는 세금계산서가 없습니다.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination q={q} />
          </div>
        </>
      )}

      {tab === 'settings' && (
        <div className="ledger" style={{ maxWidth: 720 }}>
          <div className="lh">
            <h2><Plug size={18} /> 이카운트(ERP) 연동 설정</h2>
            <div className="sp" />
            {settings && (
              <span className={'pillx ' + (configured ? 'ok' : 'todo')}>
                {configured ? '설정됨' : '미설정'}
              </span>
            )}
          </div>
          <div className="card-body" style={{ padding: '20px 26px' }}>
            {settings === null && <div className="tstate">설정을 불러오지 못했습니다. (본사 관리자 권한 필요)</div>}
            {settings && (
              <>
                <div className="formrow">
                  <label className="field">
                    <span>회사코드</span>
                    <input className="input" value={settings.com_code}
                      onChange={(e) => setSettings({ ...settings, com_code: e.target.value })} placeholder="이카운트 회사코드" />
                  </label>
                  <label className="field">
                    <span>사용자 ID</span>
                    <input className="input" value={settings.user_id}
                      onChange={(e) => setSettings({ ...settings, user_id: e.target.value })} placeholder="이카운트 로그인 ID" />
                  </label>
                  <label className="field">
                    <span>Zone</span>
                    <select className="select" value={settings.zone}
                      onChange={(e) => setSettings({ ...settings, zone: e.target.value })}>
                      <option value="KR">KR (국내)</option>
                      <option value="CN">CN</option>
                      <option value="VN">VN</option>
                    </select>
                  </label>
                </div>
                <div className="formrow" style={{ marginTop: 12 }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span>API 인증키</span>
                    <input className="input" type="password" value={settings.api_cert_key}
                      onChange={(e) => setSettings({ ...settings, api_cert_key: e.target.value })}
                      placeholder="이카운트 오픈 API 인증키" autoComplete="new-password" />
                  </label>
                  <label className="field">
                    <span>기본 발행일</span>
                    <select className="select" value={settings.default_issue_day}
                      onChange={(e) => setSettings({ ...settings, default_issue_day: Number(e.target.value) })}>
                      {[20, 25, 30].map((d) => <option key={d} value={d}>매월 {d}일</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ alignSelf: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={settings.test_mode}
                        onChange={(e) => setSettings({ ...settings, test_mode: e.target.checked })} />
                      테스트 모드(실 발행 안 함)
                    </span>
                  </label>
                </div>
                <label className="field" style={{ marginTop: 12, display: 'block' }}>
                  <span>운영 메모</span>
                  <input className="input" value={settings.memo}
                    onChange={(e) => setSettings({ ...settings, memo: e.target.value })}
                    placeholder="예) 섬지역 약 30개교는 분기/2개월 단위 발행" />
                </label>

                <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={saveSettings} disabled={setBusy}>
                    {setBusy ? '저장 중…' : '설정 저장'}
                  </button>
                  <button className="btn btn-ghost" onClick={testConnection} disabled={testBusy}>
                    <Plug size={14} /> {testBusy ? '확인 중…' : '연동 테스트'}
                  </button>
                  {setMsg && (
                    <span className={'pillx ' + (setMsg.ok ? 'ok' : 'late')}>{setMsg.text}</span>
                  )}
                </div>
                {testResult && (
                  <div className="tstate" style={{ marginTop: 14, color: testResult.ok ? 'var(--ink-2)' : 'var(--red-ink)' }}>
                    {testResult.ok ? '✓ ' : '✕ '}{testResult.text}
                  </div>
                )}
                <div className="muted" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.7 }}>
                  이카운트는 오픈 API를 제공하며(개발팀 확인), 인증키는 이카운트 관리자 페이지에서 발급합니다.
                  신규 학교의 사업자등록번호 등은 협회가 엑셀로 제공 → 「CSV 일괄 발행」으로 반영하세요.
                  현재 서버 게이트웨이는 개발 스텁이며, 실 이카운트 어댑터 연결 시 이 설정이 그대로 사용됩니다.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detail && (
        <Modal
          title="세금계산서 상세"
          onClose={() => setDetail(null)}
          footer={
            <>
              {detail.status !== 'issued' && (
                <button className="btn btn-ghost" disabled={retryBusy === detail.id} onClick={() => void retryInvoice(detail)}>
                  <RefreshCw size={13} /> 재발행
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setDetail(null)}>닫기</button>
            </>
          }
        >
          <div className="kv"><b>학교</b><span>{schoolName(detail.school_id)}</span></div>
          <div className="kv"><b>발행일</b><span>{detail.issue_date}</span></div>
          <div className="kv"><b>사업자번호</b><span>{detail.business_reg_no}</span></div>
          <div className="kv"><b>금액</b><span>{detail.amount.toLocaleString()}원</span></div>
          <div className="kv"><b>상태</b><span>{STATUS[detail.status]?.label || detail.status}</span></div>
          <div className="kv"><b>E-Count 참조번호</b><span>{detail.ecount_ref || '—'}</span></div>
        </Modal>
      )}
    </div>
  )
}
