// 홈 팝업 공지 — 경영 대시보드 '팝업 공지' 탭에서 관리, 홈 진입 시 노출.
// 저장소는 org_docs KV 'home-popups'(읽기=로그인 계정 전체, 저장=hq_admin·executive — 백엔드 게이트).
// version 은 내용 수정 때마다 올라가며, '오늘 하루 열지 않기'는 id+version 단위라
// 내용을 고치면 이미 숨긴 사람에게도 다시 뜬다(다시 알리기).

export const POPUP_DOC_KEY = 'home-popups'

export type HomePopupItem = {
  id: string
  title: string
  body: string
  image?: string        // data:image/jpeg;base64,… (업로드 시 축소)
  link_url?: string
  link_label?: string
  active: boolean
  start?: string        // YYYY-MM-DD (비면 즉시)
  end?: string          // YYYY-MM-DD (비면 계속)
  version: number
  updated_at?: string
  updated_by?: string
}

export type HomePopupDoc = { items: HomePopupItem[] }

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function normalizeDoc(raw: unknown): HomePopupDoc {
  const items = (raw as HomePopupDoc | null)?.items
  return { items: Array.isArray(items) ? items.filter((i) => i && typeof i.id === 'string') : [] }
}

/** 켜져 있고 기간 안인 팝업인지 */
export function isLive(it: HomePopupItem, today = todayStr()): boolean {
  if (!it.active) return false
  if (it.start && today < it.start) return false
  if (it.end && today > it.end) return false
  return true
}

export function popupStatus(it: HomePopupItem, today = todayStr()): 'on' | 'off' | 'scheduled' | 'ended' {
  if (!it.active) return 'off'
  if (it.start && today < it.start) return 'scheduled'
  if (it.end && today > it.end) return 'ended'
  return 'on'
}

/** 안전한 이미지 src 만 허용(data:image/* 또는 http(s)) */
export function safeImage(src?: string): string {
  if (!src) return ''
  return /^data:image\/(jpeg|png|webp|gif);base64,/.test(src) || /^https?:\/\//.test(src) ? src : ''
}

export function safeLink(url?: string): string {
  if (!url) return ''
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('/') && !u.startsWith('//')) return u   // 플랫폼 내부 경로
  return ''
}

// ── 숨김 상태(브라우저별) ──
const HIDE_KEY = 'sp-popup-hide-today'   // localStorage {date, keys[]}
const CLOSE_KEY = 'sp-popup-closed'      // sessionStorage keys[] — 이번 접속 동안만

export const itemKey = (it: HomePopupItem) => `${it.id}:${it.version}`

function readJson<T>(store: Storage | undefined, key: string, fallback: T): T {
  try {
    const v = store?.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(store: Storage | undefined, key: string, value: unknown): void {
  try { store?.setItem(key, JSON.stringify(value)) } catch { /* 사생활 모드 등 — 무시 */ }
}

const ls = () => (typeof window !== 'undefined' ? window.localStorage : undefined)
const ss = () => (typeof window !== 'undefined' ? window.sessionStorage : undefined)

const NEVER_KEY = 'home-popups.never.v1' // [다시 보지 않기] — id:version 단위로 영구 숨김(관리자가 수정해 version 이 오르면 다시 뜸)

export function hiddenKeys(today = todayStr()): Set<string> {
  const out = new Set<string>(readJson<string[]>(ss(), CLOSE_KEY, []))
  const h = readJson<{ date?: string; keys?: string[] }>(ls(), HIDE_KEY, {})
  if (h.date === today) (h.keys || []).forEach((k) => out.add(k))
  readJson<string[]>(ls(), NEVER_KEY, []).forEach((k) => out.add(k))
  return out
}

/** [다시 보지 않기] — 이 브라우저에서 영구 숨김 */
export function hideForever(keys: string[]): void {
  const prev = readJson<string[]>(ls(), NEVER_KEY, [])
  writeJson(ls(), NEVER_KEY, Array.from(new Set([...prev, ...keys])))
}

export function hideToday(keys: string[], today = todayStr()): void {
  const h = readJson<{ date?: string; keys?: string[] }>(ls(), HIDE_KEY, {})
  const prev = h.date === today ? h.keys || [] : []
  writeJson(ls(), HIDE_KEY, { date: today, keys: Array.from(new Set([...prev, ...keys])) })
}

export function closeForSession(keys: string[]): void {
  const prev = readJson<string[]>(ss(), CLOSE_KEY, [])
  writeJson(ss(), CLOSE_KEY, Array.from(new Set([...prev, ...keys])))
}

/** 업로드 이미지 → 가로 최대 maxW 로 축소한 JPEG data URL(홈 로딩 부담·문서 크기 제한) */
export function shrinkImage(file: File, maxW = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      reject(new Error('JPG·PNG·WEBP·GIF 이미지만 올릴 수 있습니다.'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('이미지 처리 실패')); return }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(cv.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없습니다.')) }
    img.src = url
  })
}
