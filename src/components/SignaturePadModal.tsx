// [G-6] 웹 서명패드 — 마우스/터치(포인터)로 서명을 그려 PNG(dataURL) + 원본 스트로크로 반환.
// 스트로크 스키마 {w,h,strokes:[[{x,y,t}...]]} 는 현장앱과 동일(좌표 소수1자리, t=첫 점 기준 ms) —
// 백엔드가 sign_<iid>.strokes.json 으로 저장하고 교육청 봇이 획 순서 그대로 재생한다.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'

export type SignStrokePoint = { x: number; y: number; t: number }
export type SignStrokes = { w: number; h: number; strokes: SignStrokePoint[][] }

const W = 480
const H = 220

export function SignaturePadModal({ signer, onApply, onNameOnly, onClose }: {
  signer?: string
  onApply: (pngDataUrl: string, strokes: SignStrokes) => void
  onNameOnly?: () => void // 기존 이름만 서명(그리기 생략) 경로 유지
  onClose: () => void
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<SignStrokePoint[][]>([])
  const drawingRef = useRef(false)
  const t0Ref = useRef(0)
  const [hasInk, setHasInk] = useState(false)

  function paintBase(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
  }

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    // 고해상도(레티나) 대응 — 내부 픽셀은 dpr 배율, 좌표계는 480×220 논리 공간으로 고정
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    paintBase(ctx)
  }, [])

  function pos(e: RPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = cvRef.current!.getBoundingClientRect()
    // CSS 축소 표시(모바일 maxWidth)돼도 캔버스 논리 좌표(480×220)로 환산
    const x = ((e.clientX - rect.left) * W) / rect.width
    const y = ((e.clientY - rect.top) * H) / rect.height
    const r1 = (v: number) => Math.round(v * 10) / 10 // 소수 1자리 — 앱 스키마와 동일
    return { x: r1(Math.max(0, Math.min(W, x))), y: r1(Math.max(0, Math.min(H, y))) }
  }
  const tNow = () => Math.max(0, Math.round(performance.now() - t0Ref.current))

  function down(e: RPointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    cvRef.current?.setPointerCapture(e.pointerId)
    drawingRef.current = true
    if (strokesRef.current.length === 0) t0Ref.current = performance.now()
    const p = pos(e)
    strokesRef.current.push([{ ...p, t: tNow() }])
    const ctx = cvRef.current?.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + 0.1, p.y + 0.1) // 탭(점 서명)도 보이게 미세 선분
      ctx.stroke()
    }
    setHasInk(true)
  }
  function move(e: RPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    e.preventDefault()
    const cur = strokesRef.current[strokesRef.current.length - 1]
    if (!cur) return
    const p = pos(e)
    const last = cur[cur.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) return
    cur.push({ ...p, t: tNow() })
    const ctx = cvRef.current?.getContext('2d')
    if (ctx) {
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }
  function up() { drawingRef.current = false }

  function clear() {
    strokesRef.current = []
    drawingRef.current = false
    setHasInk(false)
    const ctx = cvRef.current?.getContext('2d')
    if (ctx) paintBase(ctx)
  }

  function apply() {
    const cv = cvRef.current
    if (!cv || strokesRef.current.length === 0) return
    onApply(cv.toDataURL('image/png'), {
      w: W, h: H, strokes: strokesRef.current.map((s) => s.map((p) => ({ ...p }))),
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 220, display: 'grid', placeItems: 'center', background: 'rgba(22,22,42,.34)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--card,#fff)', borderRadius: 16, boxShadow: '0 24px 64px rgba(22,22,42,.30)', padding: '16px 18px 14px', maxWidth: '94vw' }}
        onClick={(e: RMouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink,#20232e)' }}>
            서명하기{signer ? ` — ${signer}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted,#7a8090)' }}>마우스 또는 터치로 서명을 그려주세요</div>
        </div>
        <canvas
          ref={cvRef}
          style={{ width: W, height: H, maxWidth: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair', background: '#fff', border: '1.5px dashed var(--line,#d9dbe8)', borderRadius: 12 }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={clear} disabled={!hasInk}>지우기</button>
          <div style={{ flex: 1 }} />
          {onNameOnly && (
            <button type="button" className="btn btn-ghost" onClick={onNameOnly} title="서명 그리기를 생략하고 이름만으로 서명 처리합니다">
              이름만 서명
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" disabled={!hasInk} onClick={apply}>적용</button>
        </div>
      </div>
    </div>
  )
}
