// 홈 팝업 공지 — 여러 건이면 좌우로 넘기고, 하단에 [닫기]·[오늘 하루 열지 않기].
// 홈(Home.tsx)은 isLive·hiddenKeys 로 거른 목록을, 콘솔 미리보기는 preview 로 저장 없이 띄운다.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  POPUP_DOC_KEY, closeForSession, hiddenKeys, hideForever, hideToday, isLive, itemKey, normalizeDoc,
  safeImage, safeLink, todayStr, type HomePopupItem,
} from '../lib/homePopups'
import '../styles/homepopup.css'

/** 홈에 붙이는 진입점 — 노출할 팝업을 읽어 거른 뒤 있으면 띄운다(실패 시 조용히 없음). */
export function HomePopupGate() {
  const [items, setItems] = useState<HomePopupItem[]>([])
  useEffect(() => {
    let alive = true
    api<{ doc: unknown }>(`/ops/docs/${POPUP_DOC_KEY}`)
      .then((r) => {
        if (!alive) return
        const today = todayStr()
        const hidden = hiddenKeys(today)
        setItems(normalizeDoc(r?.doc).items.filter((it) => isLive(it, today) && !hidden.has(itemKey(it))))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  if (items.length === 0) return null
  return <HomePopup items={items} onClose={() => setItems([])} />
}

export function HomePopup({
  items, preview = false, onClose,
}: {
  items: HomePopupItem[]
  preview?: boolean
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()
  const n = items.length
  const it = items[Math.min(idx, n - 1)]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + n) % n)
      else if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!it) return null

  function never() {
    if (!preview) hideForever(items.map(itemKey))
    onClose()
  }
  function close() {
    if (!preview) closeForSession(items.map(itemKey))
    onClose()
  }
  function skipToday() {
    if (!preview) hideToday(items.map(itemKey))
    onClose()
  }

  const img = safeImage(it.image)
  const link = safeLink(it.link_url)
  const openLink = () => {
    if (!link) return
    if (link.startsWith('/')) { onClose(); nav(link) } else window.open(link, '_blank', 'noopener,noreferrer')
  }

  return createPortal(
    <div className="hpop-backdrop" role="dialog" aria-modal="true" aria-label="공지 팝업">
      <div className="hpop">
        {preview && <div className="hpop-preview">미리보기 — 숨김 설정은 저장되지 않습니다</div>}
        <div className="hpop-card">
          {img && (
            <img
              className={'hpop-img' + (link ? ' link' : '')}
              src={img}
              alt={it.title}
              onClick={openLink}
            />
          )}
          {(it.title || it.body || link) && (
            <div className="hpop-text">
              {it.title && <h3>{it.title}</h3>}
              {it.body && <p>{it.body}</p>}
              {link && (
                <button className="btn btn-primary hpop-link" onClick={openLink}>
                  {it.link_label?.trim() || '자세히 보기'} <ExternalLink size={14} />
                </button>
              )}
            </div>
          )}
          {n > 1 && (
            <>
              <button className="hpop-nav prev" aria-label="이전" onClick={() => setIdx((i) => (i - 1 + n) % n)}>
                <ChevronLeft size={22} />
              </button>
              <button className="hpop-nav next" aria-label="다음" onClick={() => setIdx((i) => (i + 1) % n)}>
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>
        <div className="hpop-bar">
          {n > 1 && <span className="hpop-count">{Math.min(idx, n - 1) + 1} / {n}</span>}
          <div className="sp" />
          <button className="hpop-btn" onClick={never} title="확인했습니다 — 이 공지를 다시 띄우지 않습니다">다시 보지 않기</button>
          <button className="hpop-btn" onClick={skipToday}>오늘 하루 열지 않기</button>
          <button className="hpop-btn strong" onClick={close}>닫기 <X size={14} /></button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
