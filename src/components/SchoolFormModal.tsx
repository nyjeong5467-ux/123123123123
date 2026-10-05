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
  contracted?: boolean
  region?: string
  office?: string
  org_kind?: string
}

const LEVELS = ['유', '초', '중', '고', '기타']
const ORG_KINDS = ['공립', '사립', '직속기관', '교육지원청']
const OFFICES = ['본사', '목포', '광주']

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
  // 학교·기관 마스터(2026-10): 계약 여부·지역·사무소·설립 구분 — 미계약도 등록해 검색은 되게
  const [contracted, setContracted] = useState(school?.contracted ?? true)
  const [region, setRegion] = useState(school?.region ?? '')
  const [office, setOffice] = useState(school?.office ?? '')
  const [orgKind, setOrgKind] = useState(school?.org_kind ?? '')
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
      contracted,
      region: region.trim(),
      office,
      org_kind: orgKind,
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
        <span>설립 구분</span>
        <select className="select" value={orgKind} onChange={(e) => { setOrgKind(e.target.value); if (e.target.value === '사립') setIsPrivate(true) }}>
          <option value="">선택</option>
          {ORG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label className="field">
        <span>지역(시·군)</span>
        <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 강진군 — 같은 이름 학교 구분" />
      </label>
      <label className="field">
        <span>담당 사무소</span>
        <select className="select" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="">선택</option>
          {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={contracted} onChange={(e) => setContracted(e.target.checked)} />
        <span>올해 계약 (해제하면 미계약 — 검색만 되고 업무 대상에서 제외)</span>
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
        <span>조사원</span>
        <input className="input" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="조사원" />
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
