import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({
  title, onClose, children, footer, wide,
}: {
  title: ReactNode   // 문자열 또는 <>제목 <InfoTip>…</InfoTip></> 형태 허용
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  // document.body 로 포털 렌더 — 조상 요소의 transform/overflow 에 갇혀 모달이
  // 화면 밖(문서 중앙)에 뜨던 버그 방지(항상 뷰포트 정중앙 고정).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={wide ? { maxWidth: 640 } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
