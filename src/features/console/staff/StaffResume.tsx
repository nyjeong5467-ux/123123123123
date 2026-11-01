// [148] 조사원 이력서 — 보기 + 편집(모달). 저장: /ops/docs/staff-resumes (조사원 단위 병합 저장)
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { type Resume, type ResumeRow, RESUME_SECTIONS, patchDoc, tenure, todayStr } from './staffData'

export function ResumeView({ r }: { r?: Resume }) {
  const empty = !r || (!r.position && !r.hire_date && RESUME_SECTIONS.every((s) => !(r[s.key]?.length)) && !r.memo)
  if (empty) return <div className="tstate">등록된 이력서가 없습니다. 오른쪽 위 &lsquo;이력서 편집&rsquo;으로 학력·경력·자격을 입력하세요.</div>
  return (
    <div className="sf-resume">
      <div className="sf-resume-basic">
        <div><span>직위</span><b>{r!.position || '—'}</b></div>
        <div><span>입사일</span><b>{r!.hire_date || '—'}{tenure(r!.hire_date) && <small> (근속 {tenure(r!.hire_date)})</small>}</b></div>
        <div><span>이메일</span><b>{r!.email || '—'}</b></div>
        <div><span>최종 수정</span><b>{r!.updated_at ? r!.updated_at.slice(0, 10) : '—'}</b></div>
      </div>
      <div className="sf-resume-grid">
        {RESUME_SECTIONS.map((s) => (
          <section key={s.key} className="sf-resume-sec">
            <h4>{s.label} <span className="muted">{r![s.key]?.length || 0}</span></h4>
            {(r![s.key] ?? []).length === 0 ? <div className="muted sf-none">없음</div> : (
              <ul>
                {(r![s.key] ?? []).map((x, i) => (
                  <li key={i}><span className="p">{x.period || '—'}</span><b>{x.title}</b>{x.detail && <span className="d">{x.detail}</span>}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {r!.memo && <div className="sf-resume-memo"><b>비고</b><p>{r!.memo}</p></div>}
    </div>
  )
}

export function ResumeEditModal({ login, name, resume, onClose, onSaved }: {
  login: string; name: string; resume?: Resume; onClose: () => void; onSaved: (r: Resume) => void
}) {
  const [d, setD] = useState<Resume>(() => JSON.parse(JSON.stringify(resume || {})) as Resume)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  type SecKey = (typeof RESUME_SECTIONS)[number]['key']
  const rows = (k: SecKey) => d[k] ?? []
  const setRows = (k: SecKey, v: ResumeRow[]) => setD((x) => ({ ...x, [k]: v }))

  async function save() {
    setBusy(true); setErr('')
    const clean: Resume = { ...d, updated_at: todayStr() }
    for (const s of RESUME_SECTIONS) clean[s.key] = (d[s.key] ?? []).filter((x) => x.title.trim() || x.period.trim())
    try {
      await patchDoc('staff-resumes', login, clean)
      onSaved(clean)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패'); setBusy(false)
    }
  }

  return (
    <Modal title={`이력서 편집 — ${name}`} onClose={onClose} width={900}
      footer={<>
        {err && <span className="pillx late">{err}</span>}
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <div className="sf-edit-basic">
        <label className="field"><span>직위</span><input className="input" value={d.position ?? ''} onChange={(e) => setD({ ...d, position: e.target.value })} placeholder="예: 선임 조사원" /></label>
        <label className="field"><span>입사일</span><input className="input" type="date" value={d.hire_date ?? ''} onChange={(e) => setD({ ...d, hire_date: e.target.value })} /></label>
        <label className="field"><span>이메일</span><input className="input" value={d.email ?? ''} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
      </div>
      {RESUME_SECTIONS.map((s) => (
        <div key={s.key} className="sf-edit-sec">
          <div className="sf-edit-head">
            <b>{s.label}</b>
            <button className="btn btn-ghost sf-xs" onClick={() => setRows(s.key, [...rows(s.key), { period: '', title: '', detail: '' }])}><Plus size={13} /> 추가</button>
          </div>
          {rows(s.key).map((x, i) => (
            <div key={i} className="sf-edit-row">
              <input className="input" placeholder={s.period} value={x.period} onChange={(e) => setRows(s.key, rows(s.key).map((y, j) => (j === i ? { ...y, period: e.target.value } : y)))} />
              <input className="input" placeholder={s.title} value={x.title} onChange={(e) => setRows(s.key, rows(s.key).map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
              <input className="input" placeholder={s.detail} value={x.detail ?? ''} onChange={(e) => setRows(s.key, rows(s.key).map((y, j) => (j === i ? { ...y, detail: e.target.value } : y)))} />
              <button className="btn btn-ghost sf-xs" aria-label="삭제" onClick={() => setRows(s.key, rows(s.key).filter((_, j) => j !== i))}><Trash2 size={13} /></button>
            </div>
          ))}
          {rows(s.key).length === 0 && <div className="muted sf-none">없음 — &lsquo;추가&rsquo;로 입력</div>}
        </div>
      ))}
      <label className="field"><span>비고</span>
        <textarea className="input" rows={3} value={d.memo ?? ''} onChange={(e) => setD({ ...d, memo: e.target.value })} />
      </label>
    </Modal>
  )
}
