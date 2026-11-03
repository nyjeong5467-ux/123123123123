// [148] 점검자 이력서 — 보기 + 편집(모달). 저장: /ops/docs/staff-resumes (점검자 단위 병합 저장)
import { useRef, useState } from 'react'
import { FileUp, Plus, Trash2, Wand2 } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { DOC_ACCEPT, extractDocument } from '../../../lib/docText'
import { type Resume, type ResumeRow, RESUME_SECTIONS, patchDoc, tenure, todayStr } from './staffData'
import { type ParsedResume, applyParsed, parseResume } from './resumeParse'

export function ResumeView({ r }: { r?: Resume }) {
  const empty = !r || (!r.position && !r.hire_date && RESUME_SECTIONS.every((s) => !(r[s.key]?.length)) && !r.memo)
  if (empty) return <div className="tstate">등록된 이력서가 없습니다. 오른쪽 위 &lsquo;이력서 편집&rsquo;으로 학력·경력·자격을 입력하세요.</div>
  return (
    <div className="sf-resume">
      <div className="sf-resume-basic">
        <div><span>직위</span><b>{r!.position || '—'}</b></div>
        <div><span>입사일</span><b>{r!.hire_date || '—'}{tenure(r!.hire_date) && <small> (근속 {tenure(r!.hire_date)})</small>}</b></div>
        <div><span>이메일</span><b>{r!.email || '—'}</b></div>
        {r!.phone && <div><span>연락처</span><b>{r!.phone}</b></div>}
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
  // [152] 이력서 파일 자동 인식
  const fileRef = useRef<HTMLInputElement>(null)
  const [imp, setImp] = useState<{ file: string; parsed: ParsedResume; text: string; pick: Record<string, boolean> } | null>(null)
  const [impBusy, setImpBusy] = useState(false)
  const [impErr, setImpErr] = useState('')
  const [impMsg, setImpMsg] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  async function onFile(f: File | undefined) {
    if (!f) return
    setImpBusy(true); setImpErr(''); setImpMsg(''); setImp(null); setShowRaw(false)
    try {
      const doc = await extractDocument(f)
      const parsed = parseResume(doc.blocks)
      const pick: Record<string, boolean> = {
        email: !!parsed.email, phone: !!parsed.phone, position: !!parsed.position && !d.position,
        education: parsed.education.length > 0, career: parsed.career.length > 0, certs: parsed.certs.length > 0, trainings: parsed.trainings.length > 0,
      }
      setImp({ file: f.name, parsed, text: doc.text, pick })
      if (!Object.values(pick).some(Boolean)) setImpErr('자동으로 인식한 항목이 없습니다. 원문을 확인해 직접 입력해 주세요.')
    } catch (e) {
      setImpErr(e instanceof Error ? e.message : '파일을 읽지 못했습니다')
    } finally {
      setImpBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  function applyImport() {
    if (!imp) return
    setD((x) => applyParsed(x, imp.parsed, imp.pick))
    const n = Object.entries(imp.pick).filter(([, v]) => v).length
    setImpMsg(`${imp.file} 내용 ${n}개 항목을 아래에 채웠습니다. 확인 후 저장하세요.`)
    setImp(null)
  }
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
      <div className="sf-import">
        <input ref={fileRef} type="file" accept={DOC_ACCEPT} style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
        <button className="btn btn-ghost" disabled={impBusy} onClick={() => fileRef.current?.click()}><FileUp size={15} /> {impBusy ? '읽는 중…' : '이력서 파일 불러오기'}</button>
        <span className="muted">한글(HWP·HWPX)·워드(DOCX)·TXT 이력서를 올리면 학력·경력·자격·교육·연락처를 자동으로 찾아 채웁니다.</span>
      </div>
      {impErr && <div className="pillx late sf-imp-msg">{impErr}</div>}
      {impMsg && <div className="pillx ok sf-imp-msg">{impMsg}</div>}
      {imp && (
        <div className="sf-imp">
          <div className="sf-imp-head"><Wand2 size={15} /> <b>{imp.file}</b> 인식 결과 — 반영할 항목을 고르세요
            {imp.parsed.name && imp.parsed.name !== name && <span className="pillx warn">파일의 성명 &lsquo;{imp.parsed.name}&rsquo; ≠ {name}</span>}
          </div>
          <div className="sf-imp-list">
            {([['email', '이메일', imp.parsed.email], ['phone', '연락처', imp.parsed.phone], ['position', '직위', imp.parsed.position]] as const).map(([k, l, v]) => v ? (
              <label key={k}><input type="checkbox" checked={!!imp.pick[k]} onChange={(e) => setImp({ ...imp, pick: { ...imp.pick, [k]: e.target.checked } })} /> <b>{l}</b> {v}</label>
            ) : null)}
            {RESUME_SECTIONS.map((sec) => imp.parsed[sec.key].length > 0 && (
              <label key={sec.key} className="sec">
                <input type="checkbox" checked={!!imp.pick[sec.key]} onChange={(e) => setImp({ ...imp, pick: { ...imp.pick, [sec.key]: e.target.checked } })} />
                <b>{sec.label} {imp.parsed[sec.key].length}건</b>
                <span className="muted">(기존 {rows(sec.key).length}건을 교체)</span>
                <ul>{imp.parsed[sec.key].map((x, i) => <li key={i}><span>{x.period || '—'}</span> {x.title}{x.detail && <em> · {x.detail}</em>}</li>)}</ul>
              </label>
            ))}
          </div>
          <div className="sf-imp-foot">
            <button className="sf-link" onClick={() => setShowRaw((v) => !v)}>{showRaw ? '원문 닫기' : '읽어 온 원문 보기'}</button>
            <div className="sp" />
            <button className="btn btn-ghost" onClick={() => setImp(null)}>취소</button>
            <button className="btn btn-primary" disabled={!Object.values(imp.pick).some(Boolean)} onClick={applyImport}>선택 항목 적용</button>
          </div>
          {showRaw && <pre className="sf-imp-raw">{imp.text}</pre>}
        </div>
      )}
      <div className="sf-edit-basic">
        <label className="field"><span>직위</span><input className="input" value={d.position ?? ''} onChange={(e) => setD({ ...d, position: e.target.value })} placeholder="예: 선임 점검자" /></label>
        <label className="field"><span>입사일</span><input className="input" type="date" value={d.hire_date ?? ''} onChange={(e) => setD({ ...d, hire_date: e.target.value })} /></label>
        <label className="field"><span>이메일</span><input className="input" value={d.email ?? ''} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
        <label className="field"><span>연락처</span><input className="input" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="계정·권한 탭 번호가 우선 표시" /></label>
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
