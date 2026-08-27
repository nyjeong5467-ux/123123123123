// 세금계산서 관리 — 이카운트 없이 독립 운영(경리박사 스타일).
// 담당 직원/수동 상태/품목/공급자정보는 범용 doc store(/ops/docs/billing-extras)에 저장(백엔드 무변경).
// 인보이스 자체는 /invoices(발행·조회·CSV). 세액(10%)·합계는 자동 계산.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plug, Printer, Upload, Users } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'

type School = { id: string; name: string }
type Account = { name: string; role: string; login_id: string }
type Invoice = {
  id: string; school_id: string; business_reg_no: string
  issue_date: string; amount: number; status: string; ecount_ref: string | null
}
type Extra = { staff?: string; pstatus?: string; item?: string; memo?: string; issuer?: string }
type Supplier = {
  name?: string; bizNo?: string; ceo?: string; addr?: string
  bizType?: string; bizItem?: string; tel?: string
}
// 인보이스id -> Extra, '_supplier' -> 기본 공급자, '_supplierPresets' -> 자주 쓰는 발행자 목록
type ExtrasDoc = Record<string, Extra | Supplier | Supplier[]>
type EcountSettings = {
  com_code: string; user_id: string; api_cert_key: string; zone: string
  test_mode: boolean; default_issue_day: number; memo: string
}

// 수동 상태(이카운트 비의존)
const PSTATUS: Record<string, { label: string; cls: string }> = {
  unissued: { label: '미발행', cls: 'todo' },
  issued: { label: '발행완료', cls: 'ok' },
  paid: { label: '입금완료', cls: 'doing' },
}
const PSTATUS_ORDER = ['unissued', 'issued', 'paid']
const won = (n: number) => n.toLocaleString('ko-KR')
const vat = (amount: number) => Math.round(amount * 0.1)

type Row = Invoice & { schoolName: string; ex: Extra; tax: number; total: number; ym: string }

function parseBulkCsv(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [school = '', bizNo = '', amount = '', date = ''] = l.split(',')
    return { school: school.trim(), bizNo: bizNo.trim(), amount: Number(amount.trim()), date: date.trim() }
  }).filter((r) => r.school && !/^(학교|school)/i.test(r.school) && !Number.isNaN(r.amount))
}

export function Billing({ embedded = false }: { embedded?: boolean } = {}) {
  const [tab, setTab] = useState<'invoices' | 'settings'>('invoices')
  const [schools, setSchools] = useState<School[]>([])
  const [staffNames, setStaffNames] = useState<string[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [extras, setExtras] = useState<ExtrasDoc>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [listErr, setListErr] = useState('')
  const [reload, setReload] = useState(0)
  const [saveMsg, setSaveMsg] = useState('')

  // 발행 폼
  const [sid, setSid] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [amount, setAmount] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 필터
  const [fStaff, setFStaff] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [search, setSearch] = useState('')

  // 이카운트 설정 + 공급자(발행자)
  const [settings, setSettings] = useState<EcountSettings | null>(null)
  const [supplier, setSupplier] = useState<Supplier>({})   // 기본 발행자(공급자)
  const [presets, setPresets] = useState<Supplier[]>([])    // 자주 쓰는 발행자 프리셋
  const [setBusy, setSetBusy] = useState(false)
  const [setMsg, setSetMsg] = useState('')
  const [pvIssuer, setPvIssuer] = useState('')             // 미리보기/인쇄 시 선택된 발행자(프리셋 상호, ''=기본)

  const csvRef = useRef<HTMLInputElement>(null)
  const [bulkLog, setBulkLog] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [preview, setPreview] = useState<Row | null>(null)

  const schoolName = useMemo(() => {
    const m = new Map(schools.map((s) => [s.id, s.name]))
    return (id: string) => m.get(id) || id.slice(0, 8)
  }, [schools])

  useEffect(() => {
    let alive = true
    api<School[]>('/schools').then((d) => { if (alive) setSchools(d) }).catch(() => {})
    api<Account[]>('/users').then((d) => { if (alive) setStaffNames(d.filter((u) => u.name).map((u) => u.name)) }).catch(() => {})
    api<{ settings: EcountSettings }>('/billing/settings').then((d) => { if (alive) setSettings(d.settings) }).catch(() => { if (alive) setSettings(null) })
    api<{ doc: ExtrasDoc | null }>('/ops/docs/billing-extras').then((d) => {
      if (alive) {
        const doc = d.doc || {}
        setExtras(doc)
        setSupplier((doc._supplier as Supplier) || {})
        setPresets((doc._supplierPresets as Supplier[]) || [])
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true); setListErr('')
    api<Invoice[]>('/invoices').then((d) => { if (alive) { setInvoices(d); setLoading(false) } })
      .catch((e) => { if (alive) { setListErr(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [reload])

  // 인보이스 + extras 병합
  const rows: Row[] = useMemo(() => invoices.map((iv) => {
    const ex = (extras[iv.id] as Extra) || {}
    return { ...iv, schoolName: schoolName(iv.school_id), ex, tax: vat(iv.amount), total: iv.amount + vat(iv.amount), ym: (iv.issue_date || '').slice(0, 7) }
  }), [invoices, extras, schoolName])

  const months = useMemo(() => Array.from(new Set(rows.map((r) => r.ym).filter(Boolean))).sort().reverse(), [rows])

  const view = useMemo(() => rows.filter((r) => {
    const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
    if (fStaff && (r.ex.staff || '') !== fStaff) return false
    if (fStatus && ps !== fStatus) return false
    if (fMonth && r.ym !== fMonth) return false
    const q = search.trim().toLowerCase()
    if (q && !(`${r.schoolName} ${r.business_reg_no} ${r.ex.item || ''}`.toLowerCase().includes(q))) return false
    return true
  }).sort((a, b) => b.issue_date.localeCompare(a.issue_date)), [rows, fStaff, fStatus, fMonth, search])

  const kpi = useMemo(() => {
    const supply = view.reduce((s, r) => s + r.amount, 0)
    const tax = view.reduce((s, r) => s + r.tax, 0)
    return { count: view.length, supply, tax, total: supply + tax }
  }, [view])

  // 담당 직원별 집계
  const byStaff = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const r of view) {
      const k = r.ex.staff || '(미지정)'
      const cur = m.get(k) || { count: 0, total: 0 }
      cur.count++; cur.total += r.total; m.set(k, cur)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [view])

  async function saveExtras(next: ExtrasDoc) {
    setExtras(next)
    try {
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setSaveMsg('저장됨'); setTimeout(() => setSaveMsg(''), 1500)
    } catch (e) { setSaveMsg(e instanceof Error ? e.message : '저장 실패') }
  }
  function patchExtra(id: string, patch: Partial<Extra>) {
    const next: ExtrasDoc = { ...extras, [id]: { ...((extras[id] as Extra) || {}), ...patch } }
    void saveExtras(next)
  }

  async function issue() {
    setError('')
    if (!sid) { setError('학교를 선택하세요.'); return }
    if (!bizNo.trim()) { setError('사업자번호를 입력하세요.'); return }
    if (!amount.trim() || Number.isNaN(Number(amount))) { setError('금액(공급가액)을 입력하세요.'); return }
    if (!issueDate) { setError('발행일(작성일자)을 선택하세요.'); return }
    setSubmitting(true)
    try {
      await api('/invoices', { method: 'POST', body: JSON.stringify({ school_id: sid, business_reg_no: bizNo.trim(), amount: Number(amount), issue_date: issueDate }) })
      setBizNo(''); setAmount(''); setIssueDate(''); setReload((n) => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : '발행 실패') }
    finally { setSubmitting(false) }
  }

  async function bulkIssue(files: FileList | null) {
    const f = files?.[0]; if (!f) return
    setBulkBusy(true); setBulkLog([])
    try {
      const csv = parseBulkCsv(await f.text())
      if (!csv.length) { setBulkLog(['CSV 행 없음. 형식: 학교명,사업자번호,공급가액,발행일(YYYY-MM-DD)']); return }
      const byName = new Map(schools.map((s) => [s.name, s.id]))
      const log: string[] = []
      for (const r of csv) {
        const schoolId = byName.get(r.school)
        if (!schoolId) { log.push(`✕ ${r.school} — 미등록 학교`); continue }
        try {
          await api('/invoices', { method: 'POST', body: JSON.stringify({ school_id: schoolId, business_reg_no: r.bizNo, amount: r.amount, issue_date: r.date }) })
          log.push(`✓ ${r.school} · 공급가액 ${won(r.amount)}원 (세액 ${won(vat(r.amount))}, 합계 ${won(r.amount + vat(r.amount))})`)
        } catch (e) { log.push(`✕ ${r.school} — ${e instanceof Error ? e.message : '실패'}`) }
      }
      setBulkLog(log); setReload((n) => n + 1)
    } finally { setBulkBusy(false) }
  }

  async function saveSupplier() {
    setSetBusy(true); setSetMsg('')
    try {
      const next = { ...extras, _supplier: supplier }
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setExtras(next); setSetMsg('기본 발행자(공급자) 정보를 저장했습니다.')
    } catch (e) { setSetMsg(e instanceof Error ? e.message : '저장 실패') }
    finally { setSetBusy(false) }
  }

  // 자주 쓰는 발행자(프리셋) 저장/적용
  async function savePresets(next: Supplier[]) {
    setPresets(next)
    try {
      const doc = { ...extras, _supplierPresets: next }
      await api('/ops/docs/billing-extras', { method: 'PUT', body: JSON.stringify({ doc }) })
      setExtras(doc); setSetMsg('발행자 프리셋을 저장했습니다.'); setTimeout(() => setSetMsg(''), 1500)
    } catch (e) { setSetMsg(e instanceof Error ? e.message : '저장 실패') }
  }
  function addPreset() {
    const name = (supplier.name || '').trim()
    if (!name) { setSetMsg('상호를 입력한 뒤 프리셋으로 추가하세요.'); return }
    const others = presets.filter((p) => (p.name || '') !== name)
    void savePresets([...others, { ...supplier }])
  }
  function removePreset(name: string) { void savePresets(presets.filter((p) => (p.name || '') !== name)) }
  // 발행자 이름(상호) → Supplier. 빈값이면 기본 공급자.
  const resolveIssuer = (name?: string): Supplier =>
    (name ? (presets.find((p) => (p.name || '') === name) || supplier) : supplier)

  function printInvoice(r: Row, iss: Supplier) {
    const sup = iss || {}
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>세금계산서 ${r.schoolName}</title>
<style>
 body{font-family:'Malgun Gothic',sans-serif;padding:24px;color:#111}
 h1{text-align:center;font-size:22px;letter-spacing:8px;margin:0 0 6px;border:3px solid #c0392b;color:#c0392b;padding:8px}
 .sub{text-align:center;color:#888;font-size:12px;margin-bottom:14px}
 table{border-collapse:collapse;width:100%;font-size:12.5px}
 td,th{border:1px solid #333;padding:6px 8px;vertical-align:middle}
 .lbl{background:#f4eefe;font-weight:700;text-align:center;width:60px}
 .r{text-align:right}.c{text-align:center}
 .party{width:50%}
 .amt{font-size:15px;font-weight:800;text-align:right}
</style></head><body>
<h1>세 금 계 산 서</h1><div class="sub">(공급받는자 보관용)</div>
<table>
 <tr>
  <td class="lbl">공급자</td>
  <td class="party">
   등록번호 : <b>${sup.bizNo || ''}</b><br>상호 : <b>${sup.name || '한국산업안전협회'}</b> &nbsp; 성명 : ${sup.ceo || ''}<br>
   사업장 : ${sup.addr || ''}<br>업태 : ${sup.bizType || ''} &nbsp; 종목 : ${sup.bizItem || ''} &nbsp; 연락처 : ${sup.tel || ''}
  </td>
  <td class="lbl">공급받는자</td>
  <td class="party">
   등록번호 : <b>${r.business_reg_no || ''}</b><br>상호 : <b>${r.schoolName}</b><br>담당 직원 : ${r.ex.staff || '-'}
  </td>
 </tr>
 <tr>
  <td class="lbl">작성일자</td><td class="c">${r.issue_date}</td>
  <td class="lbl">품목</td><td>${r.ex.item || '안전관리 용역'}</td>
 </tr>
 <tr>
  <td class="lbl">공급가액</td><td class="r">${won(r.amount)} 원</td>
  <td class="lbl">세액</td><td class="r">${won(r.tax)} 원</td>
 </tr>
 <tr><td class="lbl">합계금액</td><td class="amt" colspan="3">${won(r.total)} 원</td></tr>
</table>
<p style="margin-top:10px;font-size:11px;color:#888">상태: ${(PSTATUS[r.ex.pstatus || (r.status==='issued'?'issued':'unissued')]||{}).label} · 발행 시스템: 학교안전 플랫폼</p>
</body></html>`
    const w = window.open('', '_blank', 'width=780,height=680')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 300)
  }

  const configured = !!settings?.com_code && !!settings?.api_cert_key

  return (
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>세금계산서</b></div>}
      <div className="bar">
        {!embedded && <h2>세금계산서</h2>}
        <div className="sp" />
        {saveMsg && <span className="pillx ok" style={{ marginRight: 8 }}>{saveMsg}</span>}
        <div className="tabs">
          <button className={'tab' + (tab === 'invoices' ? ' active' : '')} onClick={() => setTab('invoices')}>세금계산서<span className="n">{invoices.length}</span></button>
          <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}><Plug size={13} /> 설정(공급자·연동)</button>
        </div>
      </div>

      {tab === 'invoices' && (
        <>
          {/* KPI */}
          <div className="kpis">
            <div className="kpi"><div className="l">건수</div><div className="v">{kpi.count}<small> 건</small></div><div className="d">현재 조건</div></div>
            <div className="kpi"><div className="l">공급가액</div><div className="v">{won(kpi.supply)}<small> 원</small></div></div>
            <div className="kpi"><div className="l">세액(10%)</div><div className="v">{won(kpi.tax)}<small> 원</small></div></div>
            <div className="kpi"><div className="l">합계금액</div><div className="v" style={{ color: 'var(--violet)' }}>{won(kpi.total)}<small> 원</small></div></div>
          </div>

          {/* 발행 폼 */}
          <div className="ledger" style={{ marginBottom: 20 }}>
            <div className="lh">
              <h2><FileText size={18} /> 세금계산서 발행</h2>
              <div className="sp" />
              <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { void bulkIssue(e.target.files); e.target.value = '' }} />
              <button className="btn btn-ghost" onClick={() => csvRef.current?.click()} disabled={bulkBusy}><Upload size={14} /> {bulkBusy ? '일괄 발행 중…' : 'CSV 일괄 발행'}</button>
            </div>
            <div className="card-body" style={{ padding: '18px 24px' }}>
              <div className="formrow">
                <label className="field" style={{ minWidth: 200 }}><span>공급받는자(학교)</span>
                  <select className="select" value={sid} onChange={(e) => { setSid(e.target.value); const last = invoices.filter((v) => v.school_id === e.target.value).sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0]; if (last) setBizNo(last.business_reg_no) }}>
                    <option value="">학교 선택</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>사업자번호</span><input className="input" value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="000-00-00000" /></label>
                <label className="field"><span>공급가액</span><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>
                <label className="field"><span>세액(자동)</span><input className="input" value={amount ? won(vat(Number(amount))) : ''} readOnly tabIndex={-1} style={{ background: 'var(--bg-soft,#f6f4fb)' }} /></label>
                <label className="field"><span>작성일자</span><input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
                <button className="btn btn-primary" onClick={issue} disabled={submitting || !sid}><FileText size={15} /> {submitting ? '발행 중…' : '발행'}</button>
              </div>
              {amount && !Number.isNaN(Number(amount)) && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>합계금액 <b style={{ color: 'var(--violet)' }}>{won(Number(amount) + vat(Number(amount)))}원</b> (공급가액 {won(Number(amount))} + 세액 {won(vat(Number(amount)))})</div>}
              {error && <div className="muted" style={{ color: 'var(--red-ink)', marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
              {bulkLog.length > 0 && <div className="codebox" style={{ marginTop: 12 }}>{bulkLog.map((l, i) => <div key={i}>{l}</div>)}</div>}
            </div>
          </div>

          {/* 담당 직원별 집계 */}
          {byStaff.length > 0 && (
            <div className="ledger" style={{ marginBottom: 20 }}>
              <div className="lh"><h2><Users size={16} /> 담당 직원별 집계</h2></div>
              <div className="twrap"><table className="tbl">
                <thead><tr><th>담당 직원</th><th className="c">건수</th><th className="c">합계금액</th></tr></thead>
                <tbody>{byStaff.map(([n, v]) => (
                  <tr key={n} style={{ cursor: 'pointer' }} onClick={() => setFStaff(n === '(미지정)' ? '' : n)}>
                    <td><b>{n}</b></td><td className="c">{v.count}건</td><td className="c">{won(v.total)}원</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}

          {/* 세금계산서 목록 */}
          <div className="ledger">
            <div className="lh">
              <h2>세금계산서 목록</h2>
              <div className="sp" />
              <div className="lbar" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input className="input" style={{ height: 34, width: 150 }} placeholder="학교·사번·품목" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="lselect" value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">월 전체</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                <select className="lselect" value={fStaff} onChange={(e) => setFStaff(e.target.value)}><option value="">담당 전체</option>{staffNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                <select className="lselect" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">상태 전체</option>{PSTATUS_ORDER.map((s) => <option key={s} value={s}>{PSTATUS[s].label}</option>)}</select>
              </div>
            </div>
            <div className="twrap">
              <table className="tbl">
                <thead><tr>
                  <th>작성일자</th><th>공급받는자</th><th>사업자번호</th><th>품목</th>
                  <th className="c">공급가액</th><th className="c">세액</th><th className="c">합계</th>
                  <th style={{ width: 120 }}>담당 직원</th><th style={{ width: 120 }}>상태</th><th style={{ width: 70 }}></th>
                </tr></thead>
                <tbody>
                  {!listErr && view.map((r) => {
                    const ps = r.ex.pstatus || (r.status === 'issued' ? 'issued' : 'unissued')
                    return (
                      <tr key={r.id}>
                        <td><b>{r.issue_date}</b></td>
                        <td>{r.schoolName}</td>
                        <td>{r.business_reg_no}</td>
                        <td>
                          <input className="input" style={{ height: 30, fontSize: 12, minWidth: 90 }} value={r.ex.item || ''} placeholder="안전관리 용역"
                            onChange={(e) => patchExtra(r.id, { item: e.target.value })} />
                        </td>
                        <td className="c">{won(r.amount)}</td>
                        <td className="c">{won(r.tax)}</td>
                        <td className="c"><b style={{ color: 'var(--violet)' }}>{won(r.total)}</b></td>
                        <td>
                          <select className="select" style={{ height: 30, padding: '2px 6px', fontSize: 12 }} value={r.ex.staff || ''} onChange={(e) => patchExtra(r.id, { staff: e.target.value })}>
                            <option value="">(미지정)</option>
                            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="select" style={{ height: 30, padding: '2px 6px', fontSize: 12 }} value={ps} onChange={(e) => patchExtra(r.id, { pstatus: e.target.value })}>
                            {PSTATUS_ORDER.map((s) => <option key={s} value={s}>{PSTATUS[s].label}</option>)}
                          </select>
                        </td>
                        <td className="c">
                          <button className="btn btn-ghost" style={{ height: 30, padding: '0 8px' }} onClick={() => { setPreview(r); setPvIssuer(r.ex.issuer || '') }} title="미리보기/인쇄"><Printer size={13} /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {loading && <tr><td colSpan={10}><div className="tstate">불러오는 중…</div></td></tr>}
                  {!loading && listErr && <tr><td colSpan={10}><div className="tstate">오류: {listErr}</div></td></tr>}
                  {!loading && !listErr && view.length === 0 && <tr><td colSpan={10}><div className="tstate">{invoices.length === 0 ? '발행된 세금계산서가 없습니다. 위 양식/CSV로 발행하세요.' : '조건에 맞는 항목이 없습니다.'}</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'settings' && (
        <>
          <div className="ledger" style={{ maxWidth: 760, marginBottom: 20 }}>
            <div className="lh"><h2><FileText size={18} /> 공급자 정보 (세금계산서 발행처)</h2>
              <div className="sp" />{setMsg && <span className="pillx ok">{setMsg}</span>}
            </div>
            <div className="card-body" style={{ padding: '20px 26px' }}>
              <div className="formrow">
                <label className="field"><span>등록번호(사업자)</span><input className="input" value={supplier.bizNo || ''} onChange={(e) => setSupplier({ ...supplier, bizNo: e.target.value })} placeholder="000-00-00000" /></label>
                <label className="field"><span>상호</span><input className="input" value={supplier.name || ''} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} placeholder="한국산업안전협회" /></label>
                <label className="field"><span>대표자(성명)</span><input className="input" value={supplier.ceo || ''} onChange={(e) => setSupplier({ ...supplier, ceo: e.target.value })} /></label>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <label className="field" style={{ flex: 1 }}><span>사업장 주소</span><input className="input" value={supplier.addr || ''} onChange={(e) => setSupplier({ ...supplier, addr: e.target.value })} /></label>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <label className="field"><span>업태</span><input className="input" value={supplier.bizType || ''} onChange={(e) => setSupplier({ ...supplier, bizType: e.target.value })} placeholder="서비스" /></label>
                <label className="field"><span>종목</span><input className="input" value={supplier.bizItem || ''} onChange={(e) => setSupplier({ ...supplier, bizItem: e.target.value })} placeholder="안전관리" /></label>
                <label className="field"><span>연락처</span><input className="input" value={supplier.tel || ''} onChange={(e) => setSupplier({ ...supplier, tel: e.target.value })} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={saveSupplier} disabled={setBusy}>{setBusy ? '저장 중…' : '기본 발행자로 저장'}</button>
                <button className="btn btn-ghost" onClick={addPreset} disabled={setBusy}><Users size={14} /> 자주 쓰는 발행자로 추가</button>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>이 정보가 세금계산서 미리보기/인쇄의 '공급자(발행자)' 칸 기본값으로 표시됩니다. 아래 프리셋으로 여러 발행자를 등록해 발행 시 한 번에 바꿀 수 있습니다.</div>
            </div>
          </div>

          {/* 자주 쓰는 발행자 프리셋 (경리박사 스타일 — 클릭 한 번에 발행자 세팅) */}
          <div className="ledger" style={{ maxWidth: 760, marginBottom: 20 }}>
            <div className="lh"><h2><Users size={18} /> 자주 쓰는 발행자 (프리셋)</h2></div>
            <div className="card-body" style={{ padding: '16px 26px' }}>
              {presets.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>등록된 발행자 프리셋이 없습니다. 위 공급자 정보를 입력하고 <b>‘자주 쓰는 발행자로 추가’</b>를 누르세요. 소속(발행처)이 여러 곳일 때(예: 한국산업안전협회 / 타 소속) 각각 등록해 두면 발행 시 한 번에 선택됩니다.</div>}
              {presets.length > 0 && (
                <div className="twrap"><table className="tbl">
                  <thead><tr><th>상호</th><th>등록번호</th><th>대표자</th><th style={{ width: 150 }}></th></tr></thead>
                  <tbody>{presets.map((p) => (
                    <tr key={p.name}>
                      <td><b>{p.name}</b></td>
                      <td>{p.bizNo || '—'}</td>
                      <td>{p.ceo || '—'}</td>
                      <td className="c" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} onClick={() => { setSupplier({ ...p }); setSetMsg(`‘${p.name}’ 불러옴 — 수정 후 저장하세요.`) }} title="이 발행자를 편집기로 불러오기">불러오기</button>
                        <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px', marginLeft: 6 }} onClick={() => removePreset(p.name || '')} title="프리셋 삭제">삭제</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          </div>

          <div className="ledger" style={{ maxWidth: 760 }}>
            <div className="lh"><h2><Plug size={18} /> 이카운트 연동 (선택)</h2><div className="sp" />
              {settings && <span className={'pillx ' + (configured ? 'ok' : 'todo')}>{configured ? '설정됨' : '미사용'}</span>}
            </div>
            <div className="card-body" style={{ padding: '20px 26px' }}>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                이카운트(ERP) 없이도 위 화면에서 세금계산서를 발행·관리·인쇄할 수 있습니다.
                이카운트로 실제 전자세금계산서를 발행하려는 경우에만 연동 설정을 사용하세요.
                {settings === null && ' (설정을 불러오지 못했습니다 — 본사 관리자 권한 필요)'}
              </div>
            </div>
          </div>
        </>
      )}

      {preview && (
        <Modal
          title={`세금계산서 미리보기 · ${preview.schoolName}`}
          onClose={() => setPreview(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>닫기</button>
            <button className="btn btn-primary" onClick={() => printInvoice(preview, resolveIssuer(pvIssuer))}><Printer size={15} /> 인쇄</button>
          </>}
        >
          {/* 발행자(공급자) 선택 — 발행 시 임의 변경 + 자주 쓰는 발행자 한 번에 */}
          <label className="field" style={{ marginBottom: 12, display: 'block' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)' }}>발행자(공급자)</span>
            <select className="select" value={pvIssuer}
              onChange={(e) => { setPvIssuer(e.target.value); patchExtra(preview.id, { issuer: e.target.value }) }}>
              <option value="">기본 발행자 — {supplier?.name || '한국산업안전협회'}</option>
              {presets.map((p) => <option key={p.name} value={p.name}>{p.name}{p.bizNo ? ` (${p.bizNo})` : ''}</option>)}
            </select>
          </label>
          <div style={{ border: '2px solid var(--red-ink,#c0392b)', borderRadius: 8, padding: 14 }}>
            <div style={{ textAlign: 'center', fontWeight: 800, letterSpacing: 6, color: 'var(--red-ink,#c0392b)', fontSize: 17 }}>세 금 계 산 서</div>
            <div className="formrow" style={{ marginTop: 12, gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: 'var(--violet)' }}>공급자</div>
                등록번호 {resolveIssuer(pvIssuer)?.bizNo || '—'}<br />
                상호 {resolveIssuer(pvIssuer)?.name || '한국산업안전협회'} / {resolveIssuer(pvIssuer)?.ceo || '—'}<br />
                {resolveIssuer(pvIssuer)?.addr || ''}
              </div>
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: 'var(--violet)' }}>공급받는자</div>
                등록번호 {preview.business_reg_no}<br />상호 {preview.schoolName}<br />담당 {preview.ex.staff || '-'}
              </div>
            </div>
            <table className="tbl" style={{ marginTop: 12 }}>
              <tbody>
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>작성일자</td><td>{preview.issue_date}</td><td className="c" style={{ background: 'var(--violet-soft)' }}>품목</td><td>{preview.ex.item || '안전관리 용역'}</td></tr>
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>공급가액</td><td className="c">{won(preview.amount)}원</td><td className="c" style={{ background: 'var(--violet-soft)' }}>세액</td><td className="c">{won(preview.tax)}원</td></tr>
                <tr><td className="c" style={{ background: 'var(--violet-soft)' }}>합계금액</td><td className="c" colSpan={3}><b style={{ color: 'var(--violet)', fontSize: 15 }}>{won(preview.total)}원</b></td></tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
