import { useState } from 'react'
import { Modal } from '../components/Modal'
import { api } from '../lib/api'

const PARTS: { key: string; label: string }[] = [
  { key: 'catering', label: '급식' },
  { key: 'facility', label: '시설' },
  { key: 'cleaning', label: '미화' },
  { key: 'commute', label: '통학' },
  { key: 'night_duty', label: '당직' },
]

type Row = { part: string; count: number; contact: string; is_nutrition_teacher: boolean }

export function WorkersEditor({
  schoolId, initial, onClose, onSaved,
}: {
  schoolId: string
  initial: { part: string; count: number; contact: string; is_nutrition_teacher: boolean }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    PARTS.map((p) => {
      const found = initial.find((i) => i.part === p.key)
      return {
        part: p.key,
        count: found?.count ?? 0,
        contact: found?.contact ?? '',
        is_nutrition_teacher: found?.is_nutrition_teacher ?? false,
      }
    })
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function patch(part: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.part === part ? { ...r, ...p } : r)))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const workers = rows
        .filter((r) => Number(r.count) > 0)
        .map((r) => ({
          part: r.part,
          count: Number(r.count),
          contact: r.contact,
          is_nutrition_teacher: r.is_nutrition_teacher,
        }))
      await api(`/schools/${schoolId}/workers`, {
        method: 'PUT',
        body: JSON.stringify({ workers }),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="현업종사자 편집"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>저장</button>
        </>
      }
    >
      {error && <div className="login-err">{error}</div>}
      <table className="tbl">
        <thead>
          <tr>
            <th>파트</th>
            <th className="c">인원</th>
            <th>연락처</th>
            <th className="c">영양교사</th>
          </tr>
        </thead>
        <tbody>
          {PARTS.map((p) => {
            const row = rows.find((r) => r.part === p.key)!
            return (
              <tr key={p.key}>
                <td><b>{p.label}</b></td>
                <td className="c">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={row.count}
                    onChange={(e) => patch(p.key, { count: Number(e.target.value) })}
                    disabled={busy}
                    style={{ width: 80 }}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="text"
                    value={row.contact}
                    onChange={(e) => patch(p.key, { contact: e.target.value })}
                    disabled={busy}
                  />
                </td>
                <td className="c">
                  <input
                    type="checkbox"
                    checked={row.is_nutrition_teacher}
                    onChange={(e) => patch(p.key, { is_nutrition_teacher: e.target.checked })}
                    disabled={busy}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Modal>
  )
}
