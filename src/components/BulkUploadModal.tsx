import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { api } from '../lib/api'

type Row = { name: string; email: string; address: string }

function parseRows(text: string): Row[] {
  return text
    .split('\n')
    .map((line) => {
      const [name = '', email = '', address = ''] = line.split(',')
      return { name: name.trim(), email: email.trim(), address: address.trim() }
    })
    .filter((r) => r.name)
}

export function BulkUploadModal({
  onClose, onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ingested, setIngested] = useState<number | null>(null)

  const rows = useMemo(() => parseRows(text), [text])

  async function upload() {
    if (rows.length === 0) {
      setError('등록할 학교가 없습니다.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api<{ ingested: number }>('/schools/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
      setIngested(res.ingested)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="학교 엑셀/일괄 등록"
      wide
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={upload} disabled={busy}>업로드</button>
        </>
      )}
    >
      {error && <div className="login-err">{error}</div>}
      <p className="muted">한 줄에 학교 하나 — 학교명,이메일,주소 (이메일·주소 생략 가능)</p>
      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'한양고등학교,hy@example.com,서울시 성동구\n행당중학교'}
      />
      <p className="muted">파싱된 학교: {rows.length}건</p>
      {ingested != null && <p className="muted">{ingested}건 등록되었습니다.</p>}
    </Modal>
  )
}
