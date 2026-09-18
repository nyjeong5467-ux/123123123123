// 공용 도움말 툴팁 — 작은 ⓘ 아이콘에 마우스를 올리거나(포커스/탭) 하면 설명 말풍선을 보여준다.
// 긴 안내 문구를 카드에서 걷어내 헤더 옆 ⓘ 로 옮기는 용도(화면 정돈).
// 말풍선은 document.body 로 포털 렌더 → 조상 카드의 overflow:hidden 에 잘리지 않고,
// 위치는 아이콘 기준으로 계산(뷰포트 가장자리 자동 보정).
import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

const BUBBLE_W = 300

export function InfoTip({
  children, label = '도움말', size = 15,
}: {
  children: ReactNode
  label?: string
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  function place() {
    const b = btnRef.current?.getBoundingClientRect()
    if (!b) return
    const m = 8
    let left = b.left + b.width / 2 - BUBBLE_W / 2
    left = Math.max(m, Math.min(left, window.innerWidth - BUBBLE_W - m))
    const above = b.top > 200 // 위 공간이 넉넉하면 위로, 아니면 아래로
    setPos({ top: above ? b.top - m : b.bottom + m, left, above })
  }
  function show() { place(); setOpen(true) }
  function hide() { setOpen(false) }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? hide() : show() }}
      >
        <Info size={size} />
      </button>
      {open && pos && createPortal(
        <div
          id={id}
          role="tooltip"
          className="infotip-bubble"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.above ? 'translateY(-100%)' : undefined,
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
