// 일일 현황 미니맵 — 그날 각 사용자가 마지막으로 있던 위치를 핀으로 표시(GET /ops/activity/positions?date=).
// Leaflet + OpenStreetMap 타일(계정·키 불필요). 기본 마커 이미지 대신 divIcon(HTML 핀) 을 써서 번들러 이미지 경로 문제를 피하고
// 핀 옆에 라벨(기기 라벨 → 사용자 이름)을 바로 보여준다. 핀 클릭 → 시각·활동 종류·학교·거리/정확도·현장 여부 + 사용자 탭 열기.
// 전남 기본 중심(34.87, 126.99 · 줌 8), 핀이 있으면 fitBounds. 접힘 260px / 펼침 520px.
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertTriangle, Map as MapIcon, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import {
  type Position, describeError, deviceLabelOf, fetchPositions, fmtDist, fmtMDw, hm, isNotFound, kindLabel, shortDevice,
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
  const { data, loading, error, reload } = useAsync(() => fetchPositions(date), [date])
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
    if (positions.length === 0) { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); return }
    const pts: L.LatLngExpression[] = []
    for (const p of positions) {
      const label = pinLabel(p)
      const cls = p.onsite === true ? 'yes' : p.onsite === false ? 'no' : 'na'
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
      const onsite = p.onsite === true ? '<span class="act-onsite yes sm">현장</span>' : p.onsite === false ? '<span class="act-onsite no sm">현장 외</span>' : '<span class="act-onsite na sm">미판정</span>'
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
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 14 })
  }, [positions, labelVer])

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
        <b><MapIcon size={14} /> {isToday ? '오늘' : fmtMDw(date)} 마지막 위치</b>
        {!loading && !error && <span className="muted">핀 {positions.length}개{missing != null && missing > 0 ? ` · 위치 기록 없음 ${missing}명` : ''}</span>}
        {loading && <span className="muted act-msg spin" style={{ padding: 0 }}><RefreshCw size={12} /> 불러오는 중…</span>}
        <span className="act-map-legend"><i className="yes" /> 현장 <i className="no" /> 현장 외 <i className="na" /> 미판정</span>
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
          <div className="act-map-overlay">{isToday ? '오늘 위치 기록이 없습니다' : '이 날짜에는 위치 기록이 없습니다'} — 위치는 동의한 사용자의 저장·제출 시점에만 기록됩니다.</div>
        )}
      </div>
    </div>
  )
}
