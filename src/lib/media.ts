// 보호 이미지(안전점검 사진 등) 로더 — 인증 헤더(Bearer)를 실어 fetch → blob → objectURL.
// api.ts 는 JSON 전용(수정 금지)이므로 바이너리는 여기서 직접 받는다. (SignImage·MusculoPhotos 와 같은 패턴을
// 캐시·중복 제거·해제까지 묶어 공용화.) Service Worker 없이 fetch+blob 만 사용.
//
// 백엔드 계약(2026-11 사진 분리):
//   GET /files/img?p=<path>&w=320  → 썸네일(긴 변 320px)   · 1년 캐시 + ETag
//   GET /files/img?p=<path>        → 원본
//   GET /inspections/{iid}/media   → { photos:[{part,index,path,thumb,caption,name,bytes,w,h}], signs:[{role,path}], docs:[{name,path}] }
//
// 캐시 키 = path + '|' + (w ?? '') → objectURL. 같은 키의 동시 요청은 한 번만 fetch(single-flight).
// 사용처(훅)가 모두 사라지면 유예 시간 뒤 revoke — 모달을 닫고 바로 다시 열 때는 재요청 없이 즉시 표시.
import { useEffect, useState } from 'react'
import { getToken } from './api'

const BASE = '/api/v1'
const RELEASE_GRACE_MS = 60_000 // 참조 0 이후 revoke 까지 유예
const MAX_ENTRIES = 240 // 상한 초과 시 참조 없는 오래된 항목부터 정리

type Entry = {
  url: string // objectURL ('' = 아직 수신 전)
  blob: Blob | null
  promise: Promise<string> | null // 진행 중 fetch(single-flight)
  refs: number // 현재 화면에 붙어 있는 사용처 수
  lastUsed: number
  timer: ReturnType<typeof setTimeout> | null
}
const cache = new Map<string, Entry>()

function keyOf(path: string, w?: number) {
  return `${path}|${w ?? ''}`
}

/** 이미지 요청 URL — <img src> 로 직접 쓰면 Bearer 를 못 실어 401 이므로 fetch 전용. */
export function imgUrl(path: string, w?: number): string {
  const q = new URLSearchParams({ p: path })
  if (w) q.set('w', String(w))
  return `${BASE}/files/img?${q.toString()}`
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' }
  const t = getToken()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

/** 보호 이미지 blob 수신(캐시 사용). 실패 시 throw. */
export async function fetchImageBlob(path: string, w?: number): Promise<Blob> {
  const e = cache.get(keyOf(path, w))
  if (e?.blob) { e.lastUsed = Date.now(); return e.blob }
  await acquire(path, w) // 캐시에 적재
  release(path, w)
  const got = cache.get(keyOf(path, w))
  if (!got?.blob) throw new Error('이미지 수신 실패')
  return got.blob
}

/** 보호 이미지 → data: URL. PDF 캡처·메일 첨부 등 기존 dataUrl 기반 함수에 넘기는 어댑터. (원본 해상도) */
export async function fetchImageDataUrl(path: string, w?: number): Promise<string> {
  const blob = await fetchImageBlob(path, w)
  return blobToDataUrl(blob)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error ?? new Error('dataUrl 변환 실패'))
    r.readAsDataURL(blob)
  })
}

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return
  const idle = [...cache.entries()]
    .filter(([, e]) => e.refs === 0 && !e.promise)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  for (const [k, e] of idle) {
    if (cache.size <= MAX_ENTRIES) break
    if (e.timer) clearTimeout(e.timer)
    if (e.url) URL.revokeObjectURL(e.url)
    cache.delete(k)
  }
}

/** 참조 +1 하며 objectURL 확보(없으면 fetch). 사용 후 반드시 release(). */
export function acquire(path: string, w?: number): Promise<string> {
  const k = keyOf(path, w)
  let e = cache.get(k)
  if (!e) {
    e = { url: '', blob: null, promise: null, refs: 0, lastUsed: Date.now(), timer: null }
    cache.set(k, e)
    evictIfNeeded()
  }
  e.refs += 1
  e.lastUsed = Date.now()
  if (e.timer) { clearTimeout(e.timer); e.timer = null }
  if (e.url) return Promise.resolve(e.url)
  if (e.promise) return e.promise
  const entry = e
  entry.promise = (async () => {
    try {
      const res = await fetch(imgUrl(path, w), { headers: authHeaders() })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const blob = await res.blob()
      // 수신 중 참조가 모두 사라졌어도 캐시엔 남겨 두고(유예 후 정리) 다음 표시를 빠르게.
      entry.blob = blob
      entry.url = URL.createObjectURL(blob)
      if (entry.refs === 0) scheduleRelease(k, entry)
      return entry.url
    } catch (err) {
      cache.delete(k) // 실패는 캐시하지 않음 — 다음 표시 때 재시도
      throw err
    } finally {
      entry.promise = null
    }
  })()
  return entry.promise
}

function scheduleRelease(k: string, e: Entry) {
  if (e.timer) clearTimeout(e.timer)
  e.timer = setTimeout(() => {
    const cur = cache.get(k)
    if (!cur || cur.refs > 0 || cur.promise) return
    if (cur.url) URL.revokeObjectURL(cur.url)
    cache.delete(k)
  }, RELEASE_GRACE_MS)
}

/** 참조 -1. 0이 되면 유예 후 objectURL 해제. */
export function release(path: string, w?: number) {
  const k = keyOf(path, w)
  const e = cache.get(k)
  if (!e) return
  e.refs = Math.max(0, e.refs - 1)
  e.lastUsed = Date.now()
  if (e.refs === 0 && !e.promise) scheduleRelease(k, e)
}

export type AuthImageState = { url: string; loading: boolean; error: string }

/**
 * 인증 이미지 훅 — path 의 이미지를 blob: URL 로 돌려준다.
 *   w: 썸네일 폭(320 등). 생략 시 원본.
 *   enabled: false 면 요청하지 않음(화면에 들어올 때까지 지연 — IntersectionObserver 와 조합).
 * 언마운트·path 변경 시 참조를 돌려주어 화면에서 사라진 이미지는 유예 후 해제된다.
 */
export function useAuthImage(path: string | undefined | null, opts: { w?: number; enabled?: boolean } = {}): AuthImageState {
  const { w, enabled = true } = opts
  const [st, setSt] = useState<AuthImageState>(() => {
    const e = path ? cache.get(keyOf(path, w)) : undefined
    return e?.url ? { url: e.url, loading: false, error: '' } : { url: '', loading: !!path && enabled, error: '' }
  })
  useEffect(() => {
    if (!path || !enabled) {
      setSt((s) => (s.url || s.loading || s.error ? { url: '', loading: false, error: '' } : s))
      return
    }
    let alive = true
    const hit = cache.get(keyOf(path, w))
    setSt(hit?.url ? { url: hit.url, loading: false, error: '' } : { url: '', loading: true, error: '' })
    acquire(path, w)
      .then((u) => { if (alive) setSt({ url: u, loading: false, error: '' }) })
      .catch((err) => { if (alive) setSt({ url: '', loading: false, error: err instanceof Error ? err.message : '오류' }) })
    return () => { alive = false; release(path, w) }
  }, [path, w, enabled])
  return st
}

/** 캐시 전부 해제(로그아웃 등). */
export function clearImageCache() {
  for (const e of cache.values()) {
    if (e.timer) clearTimeout(e.timer)
    if (e.url) URL.revokeObjectURL(e.url)
  }
  cache.clear()
}

// ===== /inspections/{iid}/media — 점검 1건의 사진·서명·문서 경로 목록 =====
export type MediaPhoto = { part: string; index: number; path: string; thumb?: string; caption?: string; name?: string; bytes?: number; w?: number; h?: number }
export type InspectionMedia = {
  photos: MediaPhoto[]
  signs: { role: string; path: string }[]
  docs: { name: string; path: string }[]
}

const mediaCache = new Map<string, Promise<InspectionMedia>>()
/** 점검 1건의 미디어 목록(지연 조회). 실패는 throw — 호출측에서 폴백. 세션 중 메모이즈. */
export function fetchInspectionMedia(iid: string, fresh = false): Promise<InspectionMedia> {
  if (!fresh) {
    const hit = mediaCache.get(iid)
    if (hit) return hit
  }
  const p = (async () => {
    const res = await fetch(`${BASE}/inspections/${encodeURIComponent(iid)}/media`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const d = (await res.json()) as Partial<InspectionMedia>
    return { photos: d.photos ?? [], signs: d.signs ?? [], docs: d.docs ?? [] }
  })()
  mediaCache.set(iid, p)
  p.catch(() => mediaCache.delete(iid))
  return p
}
