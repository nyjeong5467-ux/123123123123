// [172] 홈 공지사항 — 상세 창(본문 줄바꿈 그대로·첨부) · 전체 공지 보기 창.
//       필독 고정/해제·삭제 버튼은 본사 관리자·경영진(canManage)에게만 보인다.
//       (실서버에서도 POST/PUT/DELETE /notices 를 같은 권한으로 막아야 함 — docs/notice-view.md)
import { Paperclip, Pin, PinOff, Trash2 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import '../../styles/notice.css'

export type NoticeLite = { id: string; title: string; body?: string; files?: { name: string }[]; pinned?: boolean; created_at?: string }

/** 본문 첫 줄 미리보기(줄바꿈은 공백으로) */
export const noticePreview = (n: NoticeLite) => (n.body || '').replace(/\s+/g, ' ').trim()

export function NoticeDetailModal({ notice, canManage, busy, onClose, onTogglePin, onDelete }: {
  notice: NoticeLite
  canManage: boolean
  busy?: boolean
  onClose: () => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const files = notice.files ?? []
  return (
    <Modal width={640} onClose={onClose}
      title={<><span className={'nt-pin' + (notice.pinned ? '' : ' g')}>{notice.pinned ? '필독' : '안내'}</span>{notice.title}</>}
      footer={<>
        {canManage && (
          <button className="btn btn-ghost nt-del" disabled={busy}
            onClick={() => { if (window.confirm(`공지 "${notice.title}"을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) onDelete() }}>
            <Trash2 size={14} /> 삭제
          </button>
        )}
        <span style={{ flex: 1 }} />
        {canManage && (
          <button className="btn btn-ghost" disabled={busy} onClick={onTogglePin}>
            {notice.pinned ? <><PinOff size={14} /> 필독 해제</> : <><Pin size={14} /> 필독 고정</>}
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <div className="nt-detail">
        {notice.created_at && <div className="nt-date">작성일 {notice.created_at.slice(0, 10)}</div>}
        <div className="nt-body">{notice.body?.trim() ? notice.body : <span className="muted">내용이 없습니다.</span>}</div>
        <div>
          <div className="nt-lab">첨부파일</div>
          {files.length === 0
            ? <div className="nt-file muted"><Paperclip size={13} /> 첨부파일 없음</div>
            : files.map((f, i) => <div key={i} className="nt-file"><Paperclip size={13} /> {f.name}</div>)}
        </div>
      </div>
    </Modal>
  )
}

export function NoticeAllModal({ notices, onClose, onOpen }: { notices: NoticeLite[]; onClose: () => void; onOpen: (n: NoticeLite) => void }) {
  return (
    <Modal width={640} title={`전체 공지 (${notices.length}건)`} onClose={onClose}>
      <div className="nt-all">
        {notices.map((n) => (
          <button key={n.id} className="nt-row" onClick={() => onOpen(n)}>
            <span className={'nt-pin' + (n.pinned ? '' : ' g')}>{n.pinned ? '필독' : '안내'}</span>
            <span className="nt-main">
              <b>{n.title}</b>
              {noticePreview(n) && <small>{noticePreview(n)}</small>}
            </span>
            <span className="nt-d">{(n.created_at || '').slice(5, 10)}</span>
          </button>
        ))}
        {notices.length === 0 && <div className="tstate">등록된 공지가 없습니다.</div>}
      </div>
    </Modal>
  )
}
