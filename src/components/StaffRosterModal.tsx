// 현업종사자 명단 업로드(2026-10-22) — 학교에서 받은 엑셀/CSV를 그대로 받아 반영한다.
// 파일은 백엔드가 파싱한다(POST /schools/staff/parse): 열 이름을 자동 매핑하고 현업업무로
// 파트(급식·시설·미화·통학·당직)를 추론 → 화면에서 확인한 뒤 [반영](POST .../import).
// 반영하면 파트별 인원수(현업종사자 집계)가 명단 기준으로 자동 재계산된다.
import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '../lib/api'

export type StaffRow = {
  school: string; name: string; job: string; part: string
  contact: string; birth: string; senior: boolean
  is_nutrition_teacher: boolean; note: string; memo: string; manager: string; seq: number
}
type ParseOut = {
  headers: string[]; mapping: Record<string, string>; rows: StaffRow[]
  skipped: number; count: number; schools: string[]; unmapped_parts: number
}
type ImportOut = {
  schools: number; staff: number; unmatched: Record<string, number>
  education_names_filled?: number
}

const PART_LABEL: Record<string, string> = {
  catering: '급식', facility: '시설', cleaning: '미화', commute: '통학', night_duty: '당직',
}
const FIELD_LABEL: Record<string, string> = {
  school: '학교명', name: '성명', birth: '생년월일', contact: '연락처', job: '현업업무',
  part: '파트', note: '특이사항', memo: '교육메모', manager: '담당자', senior: '60세 이상',
}

export function StaffRosterModal({
  schoolId, schoolName, onClose, onSaved,
}: {
  schoolId?: string        // 지정 시 단일 학교 모드(학교명 열 없어도 됨)
  schoolName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParseOut | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<ImportOut | null>(null)
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [fillEdu, setFillEdu] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function parseFile(f: File) {
    setBusy(true); setErr(''); setParsed(null); setDone(null)
    try {
      const b64: string = await new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result || '').split(',').pop() || '')
        fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'))
        fr.readAsDataURL(f)
      })
      setFileName(f.name)
      setParsed(await api<ParseOut>('/schools/staff/parse', {
        method: 'POST', body: JSON.stringify({ filename: f.name, content_b64: b64 }),
      }))
    } catch (e) { setErr(e instanceof Error ? e.message : '분석 실패') }
    finally { setBusy(false) }
  }

  async function parseText() {
    if (!text.trim()) { setErr('엑셀에서 표를 복사해 붙여넣으세요.'); return }
    setBusy(true); setErr(''); setParsed(null); setDone(null)
    try {
      setFileName('')
      setParsed(await api<ParseOut>('/schools/staff/parse', {
        method: 'POST', body: JSON.stringify({ text }),
      }))
    } catch (e) { setErr(e instanceof Error ? e.message : '분석 실패') }
    finally { setBusy(false) }
  }

  async function apply() {
    if (!parsed || !parsed.rows.length) return
    setBusy(true); setErr('')
    try {
      const out = await api<ImportOut>('/schools/staff/import', {
        method: 'POST',
        body: JSON.stringify({
          rows: parsed.rows, mode,
          ...(schoolId ? { school_id: schoolId } : {}),
          fill_education_names: fillEdu,
        }),
      })
      setDone(out)
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : '반영 실패') }
    finally { setBusy(false) }
  }

  const mapped = parsed ? Object.values(parsed.mapping) : []
  const noSchoolCol = !schoolId && parsed !== null && !mapped.includes('school')
  const preview = parsed?.rows.slice(0, 8) ?? []

  return (
    <Modal
      title={`현업종사자 명단 업로드${schoolName ? ` · ${schoolName}` : ' (전 학교)'}`}
      wide
      onClose={onClose}
      footer={
        done ? <button className="btn btn-primary" onClick={onClose}>닫기</button> : (
          <>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
            <button className="btn btn-primary" disabled={busy || !parsed?.rows.length || noSchoolCol}
              onClick={() => void apply()}>
              {busy ? '반영 중…' : `반영${parsed?.rows.length ? ` (${parsed.rows.length}명)` : ''}`}
            </button>
          </>
        )
      }
    >
      {err && <div className="login-err" style={{ marginBottom: 12 }}>{err}</div>}

      {done ? (
        <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--ok-ink)' }}>
            <CheckCircle2 size={18} /> 반영 완료
          </div>
          <div style={{ marginTop: 8 }}>
            학교 <b>{done.schools}곳</b> · 명단 <b>{done.staff}명</b> 저장했습니다.
            파트별 인원수(현업종사자)가 명단 기준으로 다시 계산됐습니다.
            {typeof done.education_names_filled === 'number' && done.education_names_filled > 0 && (
              <> 교육진도표 성명 <b>{done.education_names_filled}건</b>도 채웠습니다.</>
            )}
          </div>
          {Object.keys(done.unmatched || {}).length > 0 && (
            <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
              <AlertCircle size={13} style={{ verticalAlign: '-2px' }} /> 등록되지 않은 학교라 건너뛴 행:{' '}
              {Object.entries(done.unmatched).map(([n, c]) => `${n}(${c}명)`).join(', ')}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 1) 파일 또는 붙여넣기 */}
          <div className="formrow" style={{ alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.target.value = '' }} />
            <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet size={15} /> 엑셀/CSV 파일 선택
            </button>
            {fileName && <span className="pillx doing">{fileName}</span>}
            <div className="sp" style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>또는 엑셀에서 표를 복사해 아래에 붙여넣기</span>
          </div>
          <textarea className="input" rows={4} value={text} disabled={busy}
            onChange={(e) => setText(e.target.value)} style={{ marginTop: 10, width: '100%', boxSizing: 'border-box' }}
            placeholder={'학교명\t성명\t생년월일\t휴대폰 번호\t현업업무\t특이사항\t담당자'} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" disabled={busy || !text.trim()} onClick={() => void parseText()}>
              <Upload size={14} /> 붙여넣은 표 분석
            </button>
            <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              열 이름(학교명·성명·생년월일·휴대폰·현업업무·특이사항·담당자)을 자동으로 찾습니다.
              파트(급식·시설·미화·통학·당직)는 현업업무로 추론합니다.
            </span>
          </div>

          {/* 2) 미리보기 */}
          {parsed && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span className="pillx ok">{parsed.count}명 인식</span>
                {!schoolId && <span className="pillx doing">학교 {parsed.schools.length}곳</span>}
                {parsed.skipped > 0 && <span className="pillx na">건너뜀 {parsed.skipped}행(성명 없음·합계)</span>}
                {parsed.unmapped_parts > 0 && <span className="pillx warn">파트 미분류 {parsed.unmapped_parts}명 — 저장되지 않음</span>}
                <div className="sp" style={{ flex: 1 }} />
                <span className="muted" style={{ fontSize: 12 }}>
                  인식한 열: {mapped.map((f) => FIELD_LABEL[f] || f).join(' · ') || '없음'}
                </span>
              </div>
              {noSchoolCol && (
                <div className="login-err" style={{ marginBottom: 10 }}>
                  전 학교 업로드는 <b>학교명 열</b>이 필요합니다. 학교 상세 화면에서 올리면 학교명 없이도 반영됩니다.
                </div>
              )}
              <div className="twrap" style={{ maxHeight: 240, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr>
                    {!schoolId && <th>학교</th>}
                    <th>성명</th><th>파트</th><th>현업업무</th><th>연락처</th><th>생년월일</th><th className="c">60세</th><th>특이사항</th>
                  </tr></thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        {!schoolId && <td>{r.school || <span className="muted">—</span>}</td>}
                        <td><b>{r.name}</b></td>
                        <td>{r.part ? <span className="pillx doing">{PART_LABEL[r.part]}</span> : <span className="pillx warn">미분류</span>}</td>
                        <td>{r.job || '—'}</td>
                        <td className="muted">{r.contact || '—'}</td>
                        <td className="muted">{r.birth || '—'}</td>
                        <td className="c">{r.senior ? 'O' : '—'}</td>
                        <td className="muted">{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > preview.length && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  … 외 {parsed.rows.length - preview.length}명 (전부 반영됩니다)
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5 }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 기존 명단 교체
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> 기존 명단에 추가
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={fillEdu} onChange={(e) => setFillEdu(e.target.checked)} />
                  교육진도표의 ‘수강생 N’ 성명도 이 명단으로 채우기
                </label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.7 }}>
                연락처·생년월일은 저장 후 화면에서 <b>기본 마스킹(***)</b> 되며, [개인정보 표시]를 켠 로그인 계정만 원문을 봅니다.
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
