import { useState } from 'react'
import { Modal } from './Modal'
import { api } from '../lib/api'

export function HistoryFormModal({
  schoolId, onClose, onSaved,
}: {
  schoolId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [month, setMonth] = useState('')
  const [content, setContent] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!month) {
      setError('해당 월을 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      month,
      content,
      memo,
    })
    try {
      await api(`/schools/${schoolId}/histories`, { method: 'POST', body })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="진행 이력 등록"
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
        <span>해당 월</span>
        <input
          className="input"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>진행 내용</span>
        <textarea
          className="input"
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <label className="field">
        <span>메모</span>
        <input
          className="input"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
    </Modal>
  )
}
