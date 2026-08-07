import { useState } from 'react'
import { Modal } from './Modal'
import { api } from '../lib/api'

export function MsdsFormModal({
  schoolId, onClose, onSaved,
}: {
  schoolId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [area, setArea] = useState('')
  const [substances, setSubstances] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!area.trim()) {
      setError('구역을 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    const body = JSON.stringify({
      area: area.trim(),
      substances: substances.split(',').map((s) => s.trim()).filter(Boolean),
    })
    try {
      await api(`/schools/${schoolId}/msds`, { method: 'POST', body })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="MSDS 등록"
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
        <span>구역</span>
        <input
          className="input"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="급식실 / 시설창고 / 미화"
          required
        />
      </label>
      <label className="field">
        <span>취급 화학물질</span>
        <input
          className="input"
          value={substances}
          onChange={(e) => setSubstances(e.target.value)}
          placeholder="락스, 세제, 락카 (쉼표로 구분)"
        />
      </label>
    </Modal>
  )
}
