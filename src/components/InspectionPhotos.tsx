// 안전점검 사진대지 공용 표시 부품 — 썸네일 격자(접기/펼치기·스켈레톤·지연 로드) + 원본 라이트박스.
// 사진 바이너리는 더 이상 inspection-extras 문서에 base64 로 실리지 않고 GET /files/img 로 따로 받는다(lib/media.ts).
// 전환기 호환: 슬롯에 dataUrl 이 있으면 그대로, path 가 있으면 인증 fetch, 둘 다 없으면 "사진 없음" 자리표시.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { slotHasImage, type PhotoSlot } from '../lib/inspExtra'
import { useAuthImage } from '../lib/media'
import '../styles/photos.css'

export const THUMB_W = 320 // 목록·카드 썸네일 폭(백엔드 /files/img?w=)

/** 썸네일 요청 경로 — 백엔드가 thumb 경로를 따로 주면 그것을, 아니면 원본 path 에 w=320 리사이즈 요청. */
export function thumbPath(s: PhotoSlot): string {
  const t = s.thumb && !s.thumb.startsWith('data:') ? s.thumb : ''
  return t || s.path || ''
}

/** 화면 진입 감지 — 격자가 길어도 보이는 칸부터 받는다(loading="lazy" 는 blob: 에 효과가 없어 직접 관찰). */
function useInView<T extends Element>(eager: boolean) {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(eager)
  useEffect(() => {
    if (seen || !ref.current) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return { ref, seen }
}

type ImgProps = {
  slot: PhotoSlot
  /** 썸네일 폭. 생략하면 원본. */
  w?: number
  alt?: string
  className?: string
  style?: CSSProperties
  /** true 면 화면에 들어올 때까지 요청 보류(기본 true). 인쇄·PDF 캡처처럼 전부 즉시 필요한 곳은 false. */
  lazy?: boolean
  title?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  /** 자리표시 문구(사진 없음) */
  emptyText?: string
}

/**
 * 슬롯 1장 — dataUrl(구형) 이면 바로 <img>, path 면 인증 fetch 후 blob: <img>.
 * 로딩 중엔 스켈레톤 + `.st-loading` 마커(SignImage.waitForSheetImages 가 인쇄·캡처 전 대기하는 선택자).
 */
export function SlotImage({ slot, w, alt, className, style, lazy = true, title, onClick, emptyText = '사진 없음' }: ImgProps) {
  const { ref, seen } = useInView<HTMLSpanElement>(!lazy)
  const direct = slot.dataUrl || (w && slot.thumb?.startsWith('data:') ? slot.thumb : '')
  const path = direct ? '' : (w ? thumbPath(slot) : slot.path || '')
  const img = useAuthImage(path || null, { w: path && w ? w : undefined, enabled: seen && !!path })
  const cls = ['ph-img', className].filter(Boolean).join(' ')
  const label = alt ?? (slot.caption || slot.name || '사진')

  if (direct) {
    return <img className={cls} style={style} src={direct} alt={label} title={title} loading={lazy ? 'lazy' : undefined} onClick={onClick} />
  }
  if (!slotHasImage(slot)) {
    return <span ref={ref} className={cls + ' ph-empty'} style={style} title={slot.name || undefined}>{emptyText}</span>
  }
  if (img.url) {
    return <img className={cls} style={style} src={img.url} alt={label} title={title} loading={lazy ? 'lazy' : undefined} onClick={onClick} />
  }
  if (img.error) {
    return <span ref={ref} className={cls + ' ph-empty ph-err'} style={style} title={img.error}>불러오기 실패</span>
  }
  // 아직 화면 밖(seen=false) 이거나 수신 중 — 스켈레톤. 화면 밖 칸은 캡처 대기 마커를 달지 않는다.
  return <span ref={ref} className={cls + ' ph-skel' + (seen ? ' st-loading' : '')} style={style} aria-busy aria-label="사진 불러오는 중" />
}

export type PhotoGroup = { label: string; slots: PhotoSlot[] }

/**
 * 썸네일 격자 — 라벨(공정)별 묶음. 전체 장수가 collapseAt 를 넘으면 앞 몇 장만 보이고 [N장 더 보기] 로 펼친다.
 * 클릭 → onOpen(slot, 기본 파일명) — 호출측이 PhotoLightbox 로 원본 표시.
 */
export function PhotoGrid({
  groups, loading = false, collapseAt = 10, previewCount = 8, size = 104, onOpen,
}: {
  groups: PhotoGroup[]
  loading?: boolean
  collapseAt?: number
  previewCount?: number
  size?: number
  onOpen?: (slot: PhotoSlot, fallbackName: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const flat = groups.flatMap((g) => g.slots.filter(slotHasImage).map((s, i) => ({ g: g.label, s, i })))
  const total = flat.length
  const collapsed = !expanded && total > collapseAt
  const tile: CSSProperties = { width: size, height: size }

  if (loading && total === 0) {
    return (
      <div className="ph-grid" aria-busy>
        {Array.from({ length: 4 }).map((_, i) => <span key={i} className="ph-img ph-skel" style={tile} />)}
      </div>
    )
  }
  if (total === 0) return null

  // 접힌 상태: 라벨 구분 없이 앞 previewCount 장만 한 줄로. 펼치면 라벨별 묶음.
  if (collapsed) {
    const shown = flat.slice(0, previewCount)
    return (
      <div className="ph-wrap">
        <div className="ph-grid">
          {shown.map(({ g, s, i }) => (
            <PhotoTile key={`${g}:${i}`} slot={s} size={size} label={g} onOpen={() => onOpen?.(s, `${g}_사진${String(i + 1).padStart(2, '0')}.jpg`)} />
          ))}
          <button type="button" className="ph-more" style={tile} onClick={() => setExpanded(true)} title="사진 전체 펼치기">
            +{total - shown.length}장<small>더 보기</small>
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="ph-wrap">
      {groups.map((g) => {
        const slots = g.slots.filter(slotHasImage)
        if (!slots.length) return null
        return (
          <div key={g.label} className="ph-group">
            <div className="ph-glabel">{g.label} <span>{slots.length}장</span></div>
            <div className="ph-grid">
              {slots.map((s, i) => (
                <PhotoTile key={i} slot={s} size={size} onOpen={() => onOpen?.(s, `${g.label}_사진${String(i + 1).padStart(2, '0')}.jpg`)} />
              ))}
            </div>
          </div>
        )
      })}
      {total > collapseAt && (
        <button type="button" className="ph-fold" onClick={() => setExpanded(false)}>접기</button>
      )}
    </div>
  )
}

function PhotoTile({ slot, size, label, onOpen }: { slot: PhotoSlot; size: number; label?: string; onOpen: () => void }) {
  const cap = slot.caption || slot.name
  return (
    <figure className="ph-tile" style={{ width: size }}>
      <SlotImage
        slot={slot}
        w={THUMB_W}
        className="ph-thumb"
        style={{ width: size, height: size }}
        title={(cap || '사진') + ' — 클릭하면 원본 보기'}
        onClick={onOpen}
      />
      {(cap || label) && <figcaption title={cap}>{label ? <b>{label}</b> : null}{label && cap ? ' · ' : ''}{cap}</figcaption>}
    </figure>
  )
}

/**
 * 원본 라이트박스 — 썸네일 클릭 시 원본(/files/img?p=path, w 없음)을 받아 표시. [다운로드] 는 받은 blob: 을 그대로 저장.
 * 구형 dataUrl 슬롯도 같은 창으로.
 */
export function PhotoLightbox({ slot, fileName, onClose }: { slot: PhotoSlot; fileName?: string; onClose: () => void }) {
  const img = useAuthImage(slot.dataUrl ? null : slot.path || null, { enabled: true })
  const src = slot.dataUrl || img.url
  const name = slot.name || fileName || '사진.jpg'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  function download() {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = name
    a.click()
  }
  return createPortal(
    <div className="ph-lightbox" role="dialog" aria-label="사진 원본" onClick={onClose}>
      <div className="ph-lbbar" onClick={(e) => e.stopPropagation()}>
        <b title={slot.caption || name}>{slot.caption || name}</b>
        {slot.caption && slot.name && <span className="ph-lbname">{slot.name}</span>}
        <div className="sp" />
        <button type="button" className="btn btn-ghost" disabled={!src} onClick={download} title="원본 다운로드"><Download size={14} /> 다운로드</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}><X size={14} /> 닫기</button>
      </div>
      <div className="ph-lbbody" onClick={(e) => e.stopPropagation()}>
        {src
          ? <img src={src} alt={slot.caption || name} />
          : img.error
            ? <span className="ph-lbmsg">원본을 불러오지 못했습니다 ({img.error})</span>
            : <span className="ph-lbmsg ph-skel-text">원본 불러오는 중…</span>}
      </div>
    </div>,
    document.body,
  )
}
