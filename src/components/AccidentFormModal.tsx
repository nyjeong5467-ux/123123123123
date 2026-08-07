import { useState } from 'react'
import { Modal } from './Modal'
import { api } from '../lib/api'

export function AccidentFormModal({
  schoolId, onClose, onSaved,
}: {
  schoolId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [part, setPart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!date) {
      setError('발생일을 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      date,
      description,
      part: part || null,
    })
    try {
      await api(`/schools/${schoolId}/accidents`, { method: 'POST', body })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="산재 등록"
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
        <span>발생일</span>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>내용</span>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="field">
        <span>관련 파트</span>
        <select
          className="select"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        >
          <option value="">선택 안 함</option>
          <option value="catering">급식</option>
          <option value="facility">시설</option>
          <option value="cleaning">미화</option>
          <option value="commute">통학</option>
          <option value="night_duty">당직</option>
        </select>
      </label>
      <div className="muted" style={{ fontSize: 12 }}>산재 등록 시 수시 위험성평가 대상이 됩니다.</div>
    </Modal>
  )
}
