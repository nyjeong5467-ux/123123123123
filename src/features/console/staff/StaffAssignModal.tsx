// [148] 점검자 담당학교 변경 — 기존 점검자를 고르면 그 점검자의 담당 학교가 뜨고,
//       학교마다 새 점검자를 지정해 한 번에 저장한다(학교 일부만 옮기기·여러 명에게 나눠 주기 가능).
// 저장: PUT /schools/:id (학교 정보 수정과 같은 필드 + manager=새 점검자 이름)
//       + 학교의 '점검자 이력'(GET/PUT /schools/:id/manager-history)에 변경일 기준으로 자동 기록(실패해도 변경은 유지).
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, Search, X } from 'lucide-react'
import { api } from '../../../lib/api'
import { type SchoolLite, todayStr, addDays } from './staffData'

type Props = {
  schools: SchoolLite[]
  inspectors: string[] // 점검자 이름(계정 기준)
  initialFrom?: string
  onClose: () => void
  onSaved: (msg: string) => void
}
const NONE = '__none__' // 점검자 미배정

// 학교 정보 수정(SchoolFormModal)과 같은 필드만 보낸다 — 목록 값 그대로 + manager 만 교체
const PUT_FIELDS = ['name', 'email', 'address', 'is_private', 'education_count', 'school_level', 'principal', 'supervisor',
  'inspection_agency', 'contracted', 'region', 'office', 'org_kind'] as const

type MgrRow = { start: string; end: string; name: string; note?: string }

export default function StaffAssignModal({ schools, inspectors, initialFrom, onClose, onSaved }: Props) {
  // 점검자별 담당 학교
  const byMgr = useMemo(() => {
    const m = new Map<string, SchoolLite[]>()
    for (const s of schools) {
      const k = (s.manager || '').trim() || NONE
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return m
  }, [schools])
  const names = useMemo(() => {
    const s = new Set<string>(inspectors)
    for (const k of byMgr.keys()) if (k !== NONE) s.add(k)
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [inspectors, byMgr])

  const [from, setFrom] = useState<string>(initialFrom && names.includes(initialFrom) ? initialFrom : '')
  const [q, setQ] = useState('')
  const [schoolQ, setSchoolQ] = useState('')
  const [to, setTo] = useState<Record<string, string>>({}) // school_id → 새 점검자 이름
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState('')
  const [eff, setEff] = useState(todayStr())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const list = (from ? byMgr.get(from) : undefined) ?? []
  const shown = list.filter((s) => !schoolQ.trim() || (s.name + ' ' + (s.region || '')).includes(schoolQ.trim()))
  const changes = Object.entries(to).filter(([, v]) => v && v !== from)
  const pickFrom = (n: string) => { setFrom(n); setTo({}); setChecked(new Set()); setSchoolQ(''); setErr('') }

  function applyBulk() {
    if (!bulk || !checked.size) return
    setTo((m) => { const n = { ...m }; checked.forEach((id) => { n[id] = bulk }); return n })
  }

  async function save() {
    if (!changes.length) { setErr('변경할 학교의 새 점검자를 지정하세요.'); return }
    setBusy(true); setErr('')
    let ok = 0; const fails: string[] = []
    for (const [sid, newName] of changes) {
      const s = schools.find((x) => x.id === sid)
      if (!s) continue
      const body: Record<string, unknown> = {}
      for (const f of PUT_FIELDS) if (s[f] !== undefined) body[f] = s[f]
      body.manager = newName
      try {
        await api(`/schools/${sid}`, { method: 'PUT', body: JSON.stringify(body) })
        ok++
        // 점검자 이력 자동 기록(보조) — 진행 중 행 종료(변경일 전날) + 새 행 추가
        try {
          const h = await api<unknown>(`/schools/${sid}/manager-history`)
          const rows: MgrRow[] = Array.isArray(h) ? h as MgrRow[] : Array.isArray((h as { items?: unknown })?.items) ? (h as { items: MgrRow[] }).items : []
          const next = rows.map((r) => (!r.end ? { ...r, end: addDays(eff, -1) } : r))
          next.push({ start: eff, end: '', name: newName, note: `담당 변경(${from} → ${newName})` })
          await api(`/schools/${sid}/manager-history`, { method: 'PUT', body: JSON.stringify({ items: next }) })
        } catch { /* 이력 기록 실패는 무시 */ }
      } catch (e) {
        fails.push(`${s.name}(${e instanceof Error ? e.message : '실패'})`)
      }
    }
    setBusy(false)
    if (fails.length) { setErr(`${ok}개 변경, ${fails.length}개 실패: ${fails.join(', ')}`); if (!ok) return }
    const dest = [...new Set(changes.map(([, v]) => v))].join(', ')
    onSaved(`${from} 담당 학교 ${ok}개 → ${dest} 변경 완료`)
  }

  const filteredNames = names.filter((n) => !q.trim() || n.includes(q.trim()))

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sf-assign" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>점검자 담당학교 변경</h3>
          <button className="modal-x" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="modal-body sf-assign-body">
          {/* 좌: 기존 담당 점검자 */}
          <div className="sf-assign-left">
            <div className="sf-assign-cap">① 기존 담당 점검자</div>
            <div className="lsearch sf-mini-search"><Search size={14} />
              <input className="input" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="sf-assign-names">
              {filteredNames.map((n) => (
                <button key={n} className={'sf-name' + (from === n ? ' on' : '')} onClick={() => pickFrom(n)}>
                  <span>{n}</span><span className="pillx todo">{byMgr.get(n)?.length ?? 0}개</span>
                </button>
              ))}
              {byMgr.has(NONE) && (
                <button className={'sf-name' + (from === NONE ? ' on' : '')} onClick={() => pickFrom(NONE)}>
                  <span className="muted">점검자 미배정</span><span className="pillx todo">{byMgr.get(NONE)!.length}개</span>
                </button>
              )}
            </div>
          </div>

          {/* 우: 학교별 새 점검자 */}
          <div className="sf-assign-right">
            {!from && <div className="tstate">왼쪽에서 기존 담당 점검자를 선택하면 담당 학교 목록이 표시됩니다.</div>}
            {from && (
              <>
                <div className="sf-assign-tools">
                  <div className="sf-assign-cap">② {from === NONE ? '미배정' : from} 담당 학교 {list.length}개 — 학교마다 새 점검자 지정</div>
                  <div className="sp" />
                  <div className="lsearch sf-mini-search"><Search size={14} />
                    <input className="input" placeholder="학교·지역 검색" value={schoolQ} onChange={(e) => setSchoolQ(e.target.value)} />
                  </div>
                </div>
                <div className="sf-assign-bulk">
                  <span className="muted">선택한 {checked.size}개 학교를</span>
                  <select className="select" value={bulk} onChange={(e) => setBulk(e.target.value)}>
                    <option value="">점검자 선택</option>
                    {names.filter((n) => n !== from).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button className="btn btn-ghost" disabled={!bulk || !checked.size} onClick={applyBulk}>에게 일괄 지정</button>
                  <div className="sp" />
                  {changes.length > 0 && <button className="btn btn-ghost" onClick={() => setTo({})}>지정 초기화</button>}
                </div>
                <div className="twrap sf-assign-table">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox" aria-label="전체 선택"
                            checked={shown.length > 0 && shown.every((s) => checked.has(s.id))}
                            onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((s) => s.id)) : new Set())} />
                        </th>
                        <th>학교(기관)</th><th style={{ width: 120 }}>지역</th>
                        <th style={{ width: 70 }}>현재</th><th style={{ width: 28 }} /><th style={{ width: 170 }}>새 점검자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((s) => {
                        const v = to[s.id] || ''
                        return (
                          <tr key={s.id} className={v && v !== from ? 'sf-changed' : ''}>
                            <td><input type="checkbox" checked={checked.has(s.id)}
                              onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n })} /></td>
                            <td><b>{s.name}</b>{s.school_level && <span className="muted" style={{ marginLeft: 6, fontSize: 11.5 }}>{s.school_level}</span>}</td>
                            <td className="muted">{s.region || '—'}</td>
                            <td>{from === NONE ? <span className="muted">없음</span> : from}</td>
                            <td><ArrowRight size={14} className="muted" /></td>
                            <td>
                              <select className="select" value={v} onChange={(e) => setTo((m) => ({ ...m, [s.id]: e.target.value }))}>
                                <option value="">변경 안 함</option>
                                {names.filter((n) => n !== from).map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                      {shown.length === 0 && <tr><td colSpan={6}><div className="tstate">담당 학교가 없습니다.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-foot sf-assign-foot">
          <label className="sf-eff">변경일 <input className="input" type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></label>
          <span className="muted" style={{ fontSize: 12 }}>학교의 &lsquo;점검자 이력&rsquo;에 변경일 기준으로 자동 기록됩니다.</span>
          <div className="sp" />
          {err && <span className="pillx late" style={{ whiteSpace: 'normal' }}>{err}</span>}
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy || !changes.length} onClick={() => void save()}>
            <Check size={15} /> {busy ? '저장 중…' : `변경 ${changes.length}건 저장`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
