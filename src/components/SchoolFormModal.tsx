import { useState } from 'react'
import { Modal } from './Modal'
import { api } from '../lib/api'

type School = {
  id: string
  name: string
  email?: string
  address?: string
  is_private?: boolean
  education_count?: number | null
  school_level?: string
  principal?: string
  supervisor?: string
  manager?: string
  inspection_agency?: string
}

const LEVELS = ['유', '초', '중', '고', '기타']

export function SchoolFormModal({
  onClose, onSaved, school,
}: {
  onClose: () => void
  onSaved: () => void
  school?: School | null
}) {
  const [name, setName] = useState(school?.name ?? '')
  const [email, setEmail] = useState(school?.email ?? '')
  const [address, setAddress] = useState(school?.address ?? '')
  const [isPrivate, setIsPrivate] = useState(school?.is_private ?? false)
  const [educationCount, setEducationCount] = useState(
    school?.education_count != null ? String(school.education_count) : '',
  )
  const [schoolLevel, setSchoolLevel] = useState(school?.school_level ?? '')
  const [principal, setPrincipal] = useState(school?.principal ?? '')
  const [supervisor, setSupervisor] = useState(school?.supervisor ?? '')
  const [manager, setManager] = useState(school?.manager ?? '')
  const [inspectionAgency, setInspectionAgency] = useState(school?.inspection_agency ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('학교명을 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      name: name.trim(),
      email,
      address,
      is_private: isPrivate,
      education_count: educationCount === '' ? null : Number(educationCount),
      school_level: schoolLevel,
      principal,
      supervisor,
      manager,
      inspection_agency: inspectionAgency,
    })
    try {
      if (school) {
        await api(`/schools/${school.id}`, { method: 'PUT', body })
      } else {
        await api('/schools', { method: 'POST', body })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={school ? '학교 수정' : '학교 등록'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>저장</button>
        </>
      )}
    >
      {error && <div className="login-err">{error}</div>}
      <label className="field">
        <span>학교명</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="학교명"
          required
        />
      </label>
      <label className="field">
        <span>구분</span>
        <select className="select" value={schoolLevel} onChange={(e) => setSchoolLevel(e.target.value)}>
          <option value="">선택</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label className="field">
        <span>학교(기관)장</span>
        <input className="input" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="학교(기관)장" />
      </label>
      <label className="field">
        <span>관리감독자</span>
        <input className="input" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="관리감독자" />
      </label>
      <label className="field">
        <span>담당자</span>
        <input className="input" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="담당자" />
      </label>
      <label className="field">
        <span>안전점검기관</span>
        <input className="input" value={inspectionAgency} onChange={(e) => setInspectionAgency(e.target.value)} placeholder="안전점검기관명" />
      </label>
      <label className="field">
        <span>이메일</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="school@example.com"
        />
      </label>
      <label className="field">
        <span>주소</span>
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="주소"
        />
      </label>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span>사립학교</span>
      </label>
      <label className="field">
        <span>교육생 수</span>
        <input
          className="input"
          type="number"
          value={educationCount}
          onChange={(e) => setEducationCount(e.target.value)}
          placeholder="0"
        />
      </label>
    </Modal>
  )
}
