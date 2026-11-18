// 경영 콘솔 — 홈페이지·콘텐츠 탭: 공지 관리(CRUD). [188] 홈페이지 정보 관리(KV) 삭제 — 읽는 화면이 없어 미사용(저장값은 서버 그대로). [171] 자료실 임베드 제거(자료실은 왼쪽 메뉴 '자료실'에서)
// 공지는 기존 /notices API(백엔드 완비).
import { useEffect, useState } from 'react'
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/Modal'

type Notice = {
  id: string
  title: string
  body: string
  pinned: boolean
  created_at?: string
}

export default function ConsoleContent() {
  // ── 공지 관리 ──
  const [notices, setNotices] = useState<Notice[]>([])
  const [nLoading, setNLoading] = useState(true)
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; target: Notice }>(null)
  const [nTitle, setNTitle] = useState('')
  const [nBody, setNBody] = useState('')
  const [nPinned, setNPinned] = useState(false)
  const [nBusy, setNBusy] = useState(false)
  const [nErr, setNErr] = useState('')
  const [delTarget, setDelTarget] = useState<Notice | null>(null)

  function loadNotices() {
    return api<Notice[]>('/notices')
      .then((d) => setNotices(Array.isArray(d) ? d : []))
      .catch(() => setNotices([]))
      .finally(() => setNLoading(false))
  }
  useEffect(() => { void loadNotices() }, [])

  function openCreate() {
    setNTitle(''); setNBody(''); setNPinned(false); setNErr('')
    setModal({ mode: 'create' })
  }
  function openEdit(n: Notice) {
    setNTitle(n.title); setNBody(n.body); setNPinned(n.pinned); setNErr('')
    setModal({ mode: 'edit', target: n })
  }

  async function submitNotice() {
    if (!nTitle.trim()) { setNErr('제목을 입력하세요.'); return }
    setNBusy(true)
    setNErr('')
    try {
      const payload = JSON.stringify({ title: nTitle.trim(), body: nBody.trim(), pinned: nPinned })
      if (modal?.mode === 'edit') {
        await api(`/notices/${modal.target.id}`, { method: 'PUT', body: payload })
      } else {
        await api('/notices', { method: 'POST', body: payload })
      }
      setModal(null)
      await loadNotices()
    } catch (e) {
      setNErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setNBusy(false)
    }
  }

  async function deleteNotice() {
    if (!delTarget) return
    try {
      await api(`/notices/${delTarget.id}`, { method: 'DELETE' })
      setDelTarget(null)
      await loadNotices()
    } catch {
      setDelTarget(null)
    }
  }

  const sorted = [...notices].sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <div>
      {/* ── 공지 관리 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><Megaphone size={18} /> 공지 관리</h2>
          <div className="sp" />
          <span className="pillx na">{notices.length}건</span>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> 공지 등록</button>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 70 }} className="c">필독</th><th>제목</th><th>내용</th><th style={{ width: 110 }}>작성일</th><th style={{ width: 120 }} className="c">작업</th></tr></thead>
            <tbody>
              {sorted.map((n) => (
                <tr key={n.id}>
                  <td className="c">{n.pinned ? <span className="pillx warn"><Pin size={11} /> 필독</span> : <span className="pillx na">일반</span>}</td>
                  <td><b>{n.title}</b></td>
                  <td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</td>
                  <td>{(n.created_at || '').slice(0, 10)}</td>
                  <td className="c">
                    <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} onClick={() => openEdit(n)}><Pencil size={13} /></button>{' '}
                    <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px', color: 'var(--red-ink)' }} onClick={() => setDelTarget(n)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {!nLoading && sorted.length === 0 && (
                <tr><td colSpan={5}><div className="tstate">등록된 공지가 없습니다 — [공지 등록]으로 시작하세요.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 공지 등록/수정 모달 ── */}
      {modal && (
        <Modal
          title={modal.mode === 'edit' ? '공지 수정' : '공지 등록'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={submitNotice} disabled={nBusy}>{nBusy ? '저장 중…' : '저장'}</button>
            </>
          }
        >
          <div className="formrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <label className="field"><span>제목</span>
              <input className="input" value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="공지 제목" />
            </label>
            <label className="field"><span>내용</span>
              <textarea className="input" rows={5} value={nBody} onChange={(e) => setNBody(e.target.value)} placeholder="공지 내용" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} /> 필독(상단 고정)
            </label>
            {nErr && <div style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600 }}>{nErr}</div>}
          </div>
        </Modal>
      )}

      {/* ── 공지 삭제 확인 ── */}
      {delTarget && (
        <Modal
          title="공지 삭제"
          onClose={() => setDelTarget(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDelTarget(null)}>취소</button>
              <button className="btn btn-danger" onClick={deleteNotice}><Trash2 size={14} /> 삭제</button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14 }}><b>{delTarget.title}</b> 공지를 삭제할까요? 되돌릴 수 없습니다.</p>
        </Modal>
      )}
    </div>
  )
}
