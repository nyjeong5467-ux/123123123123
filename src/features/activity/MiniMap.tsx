// 일일 현황 미니맵 — 그날 각 사용자가 마지막으로 있던 위치를 핀으로 표시(GET /ops/activity/positions?date=).
// Leaflet + OpenStreetMap 타일(계정·키 불필요). 기본 마커 이미지 대신 divIcon(HTML 핀) 을 써서 번들러 이미지 경로 문제를 피하고
// 핀 옆에 라벨(기기 라벨 → 사용자 이름)을 바로 보여준다. 핀 클릭 → 시각·활동 종류·학교·거리/정확도·현장 여부 + 사용자 탭 열기.
// 전남 기본 중심(34.87, 126.99 · 줌 8), 핀이 있으면 fitBounds. 접힘 260px / 펼침 520px.
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertTriangle, Map as MapIcon, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import {
  type Completion, type Position, type Track, describeError, deviceLabelOf, fetchCompletions, fetchConsents, fetchPositionsLive, fetchTracks, fmtDist, fmtMDw, hm, isNotFound, kindLabel, shortDevice,
  todayKst, useAsync, useDeviceLabels,
} from './data'

const DEFAULT_CENTER: L.LatLngExpression = [34.87, 126.99]
const DEFAULT_ZOOM = 8
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'

const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

// 핀 라벨: 기기 라벨이 있으면 라벨(예: "홍길동 태블릿"), 없으면 사용자 이름
function pinLabel(p: Position): string {
  return p.name || p.login_id // 기기 라벨 제거(11-16)
}

export type MiniMapProps = {
  date: string
  peopleCount?: number                                    // 그날 활동 인원(위치 없는 인원 수 안내용)
  onOpenUser?: (login_id: string, name: string) => void   // 팝업의 '사용자 탭' 버튼
}

export function MiniMap({ date, peopleCount, onOpenUser }: MiniMapProps) {
  const [expanded, setExpanded] = useState(false)
  // 실시간: 오늘이면 30초마다 위치·경로를 다시 받는다(캐시 없음). 지도 맞춤은 날짜가 바뀔 때 한 번만.
  const [tick, setTick] = useState(0)
  const { data, loading, error, reload } = useAsync(() => fetchPositionsLive(date), [date, tick])
  const trackQ = useAsync(() => fetchTracks(date).catch(() => [] as Track[]), [date, tick])
  const doneQ = useAsync(() => fetchCompletions(date, date).catch(() => [] as Completion[]), [date, tick])
  const fittedRef = useRef('')
  useEffect(() => {
    if (date !== todayKst()) return
    const t = setInterval(() => setTick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [date])
  const [updatedAt, setUpdatedAt] = useState('')
  useEffect(() => { if (data) setUpdatedAt(new Date().toTimeString().slice(0, 8)) }, [data])
  const consQ = useAsync(() => fetchConsents().catch(() => null), [])
  const labelVer = useDeviceLabels()
  const positions = useMemo(() => (data?.positions || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)), [data])

  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const openRef = useRef(onOpenUser)
  openRef.current = onOpenUser

  // 지도 생성/해제(1회)
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    const map = L.map(boxRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
    // 지도를 클릭(포커스)하면 휠 줌 허용, 밖으로 나가면 다시 잠금 — 페이지 스크롤 가로채기 방지
    map.on('focus', () => map.scrollWheelZoom.enable())
    map.on('blur', () => map.scrollWheelZoom.disable())
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [])

  // 핀 갱신(위치 자료·라벨 바뀔 때)
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    // 이동 경로(선) — 접속 중이면 파랑, 아니면 회색
    const live = new Set(positions.filter((p) => p.status === 'online').map((p) => p.login_id))
    for (const t of trackQ.data || []) {
      if (t.points.length < 2) continue
      L.polyline(t.points.map((q) => [q[0], q[1]] as L.LatLngExpression), {
        color: live.has(t.login_id) ? '#2f6bf2' : '#9aa3b2', weight: 3, opacity: 0.6,
      }).bindTooltip(`${t.name} 이동 경로 · ${t.points[0][2]} → ${t.points[t.points.length - 1][2]}`).addTo(layer)
    }
    // 학교 완료 핀(초록 ✓) — 이름 · 학교 · 시각
    for (const c of doneQ.data || []) {
      if (c.lat == null || c.lng == null) continue
      const ic = L.divIcon({ className: 'act-pin-wrap', iconSize: [0, 0], iconAnchor: [9, 9],
        html: `<span class="act-pin"><span class="act-pin-dot done">✓</span><span class="act-pin-tag done">${esc(c.name)} · ${esc(c.school_name || '학교')} ${esc(c.at_hm || '')}</span></span>` })
      L.marker([c.lat, c.lng], { icon: ic, zIndexOffset: -100 })
        .bindPopup(`<b>${esc(c.school_name || '')}</b><br/>${esc(c.name)} · ${kindLabel(c.kind)} ${esc(c.at_hm || '')}${c.count > 1 ? ` (${c.count}건)` : ''}`)
        .addTo(layer)
    }
    if (positions.length === 0) { if (fittedRef.current !== date) { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); fittedRef.current = date } return }
    const pts: L.LatLngExpression[] = []
    for (const p of positions) {
      const label = pinLabel(p)
      const cls = p.status === 'online' ? 'live' : 'off' // 접속 중=파랑, 종료=회색
      const icon = L.divIcon({
        className: 'act-pin-wrap',
        html: `<span class="act-pin"><span class="act-pin-dot ${cls}"></span><span class="act-pin-tag">${esc(label)}</span></span>`,
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
      })
      const m = L.marker([p.lat, p.lng], { icon, title: label, riseOnHover: true })
      // 팝업: DOM 으로 만들어 버튼에 핸들러를 붙인다
      const el = document.createElement('div')
      el.className = 'act-pop'
      const dist = p.distance_m != null ? `거리 ${fmtDist(p.distance_m)}` : p.accuracy_m != null ? `정확도 ±${Math.round(p.accuracy_m)} m` : ''
      const st = p.status === 'online' ? `<span class="act-onsite yes sm" style="background:#e8f0ff;color:#2f6bf2">접속 중</span>` : `<span class="act-onsite na sm">종료${p.last_hm ? ' ' + esc(p.last_hm) : ''}</span>`
      const onsite = st + ' ' + (p.onsite === true ? '<span class="act-onsite yes sm">현장</span>' : p.onsite === false ? '<span class="act-onsite no sm">현장 외</span>' : '<span class="act-onsite na sm">미판정</span>')
      el.innerHTML =
        `<b>${esc(label)}</b>` +
        `<small>${esc(p.name || p.login_id)} · ${esc(p.login_id)}${p.device_id ? ` · 기기 ${esc(shortDevice(p.device_id))}` : ''}</small>` +
        `<div class="row"><b>${esc(hm(p.at_hm, p.at))}</b> <span class="act-kind k-${esc(p.kind || 'custom')}">${esc(kindLabel(p.kind))}</span></div>` +
        `<div class="row">${p.school_name ? esc(p.school_name) : '<span class="muted">학교 없음</span>'}</div>` +
        `<div class="row">${onsite}${dist ? ` <span class="muted">${esc(dist)}</span>` : ''}</div>`
      if (openRef.current) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'act-detail'
        btn.textContent = '사용자 탭 열기 ›'
        btn.addEventListener('click', () => openRef.current?.(p.login_id, p.name || p.login_id))
        el.appendChild(btn)
      }
      m.bindPopup(el, { closeButton: true, maxWidth: 260 })
      m.addTo(layer)
      pts.push([p.lat, p.lng])
    }
    if (fittedRef.current !== date) { map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 14 }); fittedRef.current = date }
  }, [positions, labelVer, trackQ.data, doneQ.data, date])

  // 접힘/펼침 → 크기 재계산 후 다시 맞춤(CSS 전환 뒤)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = setTimeout(() => {
      map.invalidateSize()
      if (positions.length) map.fitBounds(L.latLngBounds(positions.map((p) => [p.lat, p.lng] as L.LatLngExpression)), { padding: [36, 36], maxZoom: 14 })
    }, 230)
    return () => clearTimeout(t)
  }, [expanded, positions])

  const notReady = error != null && isNotFound(error)
  const isToday = date === todayKst()
  const missing = peopleCount != null ? Math.max(0, peopleCount - positions.length) : null

  return (
    <div className={'act-card act-map-card' + (expanded ? ' expanded' : '')}>
      <div className="act-map-head">
        <b><MapIcon size={14} /> {isToday ? '실시간 위치' : `${fmtMDw(date)} 위치`}</b>
        {isToday && updatedAt && <span className="muted" title="30초마다 자동 갱신">● {updatedAt} 갱신</span>}
        {!loading && !error && <span className="muted">핀 {positions.length}개{missing != null && missing > 0 ? ` · 위치 기록 없음 ${missing}명` : ''}</span>}
        {loading && <span className="muted act-msg spin" style={{ padding: 0 }}><RefreshCw size={12} /> 불러오는 중…</span>}
        <span className="act-map-legend"><i className="live" /> 접속 중 {positions.filter((p) => p.status === 'online').length} <i className="off" /> 종료 {positions.filter((p) => p.status !== 'online').length} <i className="done" /> 학교 완료 {(doneQ.data || []).filter((c) => c.lat != null).length}</span>
        {(() => {
          const raw = consQ.data as unknown
          const rows = Array.isArray(raw) ? raw : ((raw as { consents?: { name?: string; login_id: string; agreed: boolean }[] } | null)?.consents || [])
          if (!rows.length) return null
          const yes = rows.filter((r) => r.agreed), no = rows.filter((r) => !r.agreed)
          return <span className="muted" title={`미동의: ${no.map((r) => r.name || r.login_id).join(', ')}`}>위치 동의 <b style={{ color: 'var(--ok-ink)' }}>{yes.length}명</b>{yes.length ? ` (${yes.map((r) => r.name || r.login_id).join(', ')})` : ''} · 미동의 {no.length}명</span>
        })()}
        <div className="sp" />
        <button type="button" className="act-ibtn" onClick={reload} disabled={loading} title="다시 불러오기"><RefreshCw size={14} className={loading ? 'act-spin' : ''} /></button>
        <button type="button" className="act-ibtn" onClick={() => setExpanded((e) => !e)} title={expanded ? '접기' : '펼치기'}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
      </div>
      <div className="act-map-body">
        <div ref={boxRef} className="act-map" />
        {!loading && error != null && (
          <div className="act-map-overlay">
            <AlertTriangle size={14} />
            {notReady ? '위치 API(/ops/activity/positions)가 아직 준비되지 않았습니다(404). 백엔드 배포 후 표시됩니다.' : describeError(error)}
          </div>
        )}
        {!loading && !error && positions.length === 0 && (
          <div className="act-map-overlay">{isToday ? '오늘 위치 기록이 없습니다' : '이 날짜에는 위치 기록이 없습니다'} — 위치는 동의한 사용자의 앱을 켜 둔 동안 1분마다(100m 이동 시 즉시) 기록됩니다. 3분 넘게 소식이 없으면 종료(회색)로 표시합니다.</div>
        )}
      </div>
    </div>
  )
}
