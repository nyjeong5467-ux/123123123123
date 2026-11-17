// 지도 이력 탭 — 날짜별 '학교 완료 지점'을 지도와 표로 보관·조회(11-16). 오늘 실시간 지도는 일일 현황에 두고,
// 지난 날짜는 여기서 본다(서버는 삭제하지 않음). 왼쪽 날짜 목록(최근 60일, 완료 건수) → 오른쪽 지도·표.
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { History } from 'lucide-react'
import { type Completion, addDays, kindLabel, describeError, fetchCompletions, fmtMDw, todayKst, useAsync } from './data'
import { Head, Msg, Reload, type PanelProps } from './panels'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export function HistoryPanel({ st, setSt, open }: PanelProps) {
  const today = todayKst()
  const to = today
  const from = addDays(today, -59)
  const { data, loading, error, reload } = useAsync(() => fetchCompletions(from, to), [from, to])
  const all = useMemo(() => data || [], [data])
  const days = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of all) m.set(c.date, (m.get(c.date) || 0) + 1)
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [all])
  // 기본 선택: 어제(있으면) → 가장 최근 날짜
  const yesterday = addDays(today, -1)
  const sel = st.date || (days.find(([d]) => d === yesterday)?.[0]) || days[0]?.[0] || yesterday
  const rows = useMemo(() => all.filter((c) => c.date === sel).sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1)), [all, sel])

  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  // 지도 상자는 불러오기가 끝난 뒤에야 그려진다 → loading 이 바뀔 때 다시 시도(11-17: 지도가 안 뜨던 원인)
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    const map = L.map(boxRef.current, { center: [34.87, 126.99], zoom: 8, scrollWheelZoom: false })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
    map.on('focus', () => map.scrollWheelZoom.enable()); map.on('blur', () => map.scrollWheelZoom.disable())
    layerRef.current = L.layerGroup().addTo(map); mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [loading, error])
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pts: L.LatLngExpression[] = []
    for (const c of rows) {
      if (c.lat == null || c.lng == null) continue
      const ic = L.divIcon({ className: 'act-pin-wrap', iconSize: [0, 0], iconAnchor: [9, 9],
        html: `<span class="act-pin"><span class="act-pin-dot done">✓</span><span class="act-pin-tag done">${esc(c.name)} · ${esc(c.school_name || '학교')} ${esc(c.at_hm || '')}</span></span>` })
      L.marker([c.lat, c.lng], { icon: ic })
        .bindPopup(`<b>${esc(c.school_name || '')}</b><br/>${esc(c.name)} · ${kindLabel(c.kind)} ${esc(c.at_hm || '')}${c.count > 1 ? ` (${c.count}건)` : ''}${c.onsite === true ? '<br/>현장 작성' : c.onsite === false ? '<br/>현장 외' : ''}`)
        .addTo(layer)
      pts.push([c.lat, c.lng])
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 14 })
    else map.setView([34.87, 126.99], 8)
    setTimeout(() => map.invalidateSize(), 120)
  }, [rows, loading])

  const noXY = rows.filter((c) => c.lat == null).length
  return (
    <div>
      <Head icon={<History size={17} />} title="지도 이력"><span className="muted" style={{ fontSize: 12 }}>날짜별 학교 완료 지점(저장·교육청 전송 요청 위치) · 최근 60일 · 서버에 계속 보관</span></Head>
      <div className="act-tools"><span className="muted" style={{ fontSize: 12 }}>오늘 실시간 위치는 '일일 현황' 지도에서 봅니다.</span><Reload onClick={reload} loading={loading} /></div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{describeError(error)}</Msg>}
      {!loading && !error && (
        <div className="act-hist">
          <div className="act-hist-days">
            {days.length === 0 && <Msg kind="empty">완료 기록이 없습니다.</Msg>}
            {days.map(([d, n]) => (
              <button key={d} type="button" className={d === sel ? 'on' : ''} onClick={() => setSt({ date: d })}>
                <span>{fmtMDw(d)}{d === today ? ' · 오늘' : ''}</span><span>{n}곳</span>
              </button>
            ))}
          </div>
          <div>
            <div className="act-map-head" style={{ marginBottom: 6 }}><b>{fmtMDw(sel)} 학교 완료 지점</b><span className="muted">{rows.length}곳{noXY ? ` · 위치 없음 ${noXY}곳` : ''}</span></div>
            <div ref={boxRef} className="act-hist-map" />
            <table className="act-ev" style={{ marginTop: 10 }}>
              <thead><tr><th>시각</th><th>사용자</th><th>학교</th><th>종류</th><th>현장</th></tr></thead>
              <tbody>
                {rows.map((c: Completion) => (
                  <tr key={`${c.login_id}-${c.school_id}-${c.kind}`}>
                    <td className="tm">{c.at_hm || '—'}</td>
                    <td><button type="button" className="act-link" onClick={() => open({ kind: 'user', login_id: c.login_id, name: c.name, date: sel })}>{c.name}</button></td>
                    <td>{c.school_name || '—'}</td>
                    <td>{kindLabel(c.kind)}{c.count > 1 ? ` (${c.count}건)` : ''}</td>
                    <td>{c.lat == null ? '위치 없음' : c.loc_src === 'school' ? '학교 위치(앱 위치 없음)' : c.onsite === true ? '현장' : c.onsite === false ? '현장 외' : '미판정'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
