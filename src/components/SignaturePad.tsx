// 손글씨 서명 캔버스 — 포인터(마우스/터치/펜)로 그리고 PNG dataURL로 추출.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type SignaturePadHandle = {
  clear: () => void
  toDataURL: () => string | null // 빈 서명이면 null
  isEmpty: () => boolean
}

export const SignaturePad = forwardRef<SignaturePadHandle, { width?: number; height?: number; onChange?: (empty: boolean) => void }>(
  function SignaturePad({ width = 340, height = 150, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const empty = useRef(true)
    const last = useRef<{ x: number; y: number } | null>(null)

    useEffect(() => {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.strokeStyle = '#16131f'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }, [])

    function pos(e: React.PointerEvent) {
      const r = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function down(e: React.PointerEvent) {
      e.preventDefault()
      drawing.current = true
      last.current = pos(e)
      canvasRef.current!.setPointerCapture(e.pointerId)
    }
    function move(e: React.PointerEvent) {
      if (!drawing.current) return
      const ctx = canvasRef.current!.getContext('2d')!
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(last.current!.x, last.current!.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last.current = p
      if (empty.current) { empty.current = false; onChange?.(false) }
    }
    function up() { drawing.current = false; last.current = null }

    useImperativeHandle(ref, () => ({
      clear: () => {
        const c = canvasRef.current
        if (!c) return
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, c.width, c.height)
        empty.current = true
        onChange?.(true)
      },
      toDataURL: () => (empty.current ? null : canvasRef.current!.toDataURL('image/png')),
      isEmpty: () => empty.current,
    }))

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ border: '1px solid var(--line)', borderRadius: 10, touchAction: 'none', background: '#fff', cursor: 'crosshair', width, height }}
      />
    )
  },
)
