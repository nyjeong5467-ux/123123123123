// 기기 목록 탭 — GET /ops/devices 로 받은 기기(앱 설치 단말) 표. 라벨·메모를 인라인으로 고쳐 PUT /ops/devices/{id} 로 저장한다.
// 저장되면 라벨 스토어(data.ts)가 갱신되어 미니맵 핀·일일 표·이벤트 표의 기기 표시가 즉시 바뀐다.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Check, Copy, MapPin, MapPinOff, Pencil, Smartphone, X } from 'lucide-react'
import {
  type DeviceRow, describeError, fetchDevices, fmtDateTime, isNotFound, kindLabel, n0, shortDevice, useAsync,
} from './data'
import { type Acc, type PanelProps, Head, KindChip, Msg, Reload, RowCount, SearchBox, Th, Who, useSort } from './panels'

const DEV_ACC: Acc<DeviceRow> = {
  label: (d) => d.label || '',
  id: (d) => d.device_id,
  user: (d) => d.last_name || d.last_login_id || '',
  last: (d) => d.last_at || d.last_seen || '',
  first: (d) => d.first_seen || '',
  events: (d) => d.events_total || 0,
  consent: (d) => (d.consent_agreed === true ? 2 : d.consent_agreed === false ? 0 : 1),
}

// 클립보드 복사(권한 없는 환경은 숨은 textarea 로 폴백)
async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true } catch { /* 폴백 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}
function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t) }, [done])
  return (
    <span className="act-devid" title={id}>
      <code>{shortDevice(id)}</code>
      <button type="button" className="act-copy" onClick={async (e) => { e.stopPropagation(); if (await copyText(id)) setDone(true) }} title="기기 ID 복사">
        {done ? <Check size={12} /> : <Copy size={12} />}{done ? ' 복사됨' : ''}
      </button>
    </span>
  )
}

export function ConsentChip({ v }: { v: boolean | null | undefined }) {
  if (v === true) return <span className="act-onsite yes sm"><MapPin size={11} /> 동의</span>
  if (v === false) return <span className="act-onsite no sm"><MapPinOff size={11} /> 미동의</span>
  return <span className="act-onsite na sm">미응답</span>
}

// 한 행(읽기 전용) — 기기 라벨·메모 기능은 제거(11-16, 사용자 이름으로 충분).
function DeviceTr({ d, openUser }: { d: DeviceRow; onSaved?: (row: Partial<DeviceRow>) => void; openUser: (login_id: string, name: string) => void }) {
  return (
    <tr>
      <td><CopyId id={d.device_id} /></td>
      <td>{d.last_login_id ? <Who name={d.last_name || d.last_login_id} sub={d.last_login_id} onClick={() => openUser(d.last_login_id as string, d.last_name || d.last_login_id || '')} /> : <span className="muted">—</span>}</td>
      <td className="act-last">
        <b>{fmtDateTime(d.last_at || d.last_seen)}</b>
        <span>{d.last_kind ? <KindChip k={d.last_kind} /> : kindLabel(null)}{d.last_school_name ? ` · ${d.last_school_name}` : ''}</span>
      </td>
      <td className="act-time"><span className="muted">첫</span> {fmtDateTime(d.first_seen)}<br /><span className="muted">끝</span> {fmtDateTime(d.last_seen)}</td>
      <td className="num">{n0(d.events_total || 0)}</td>
      <td className="c"><ConsentChip v={d.consent_agreed} /></td>
    </tr>
  )
}

export function DevicesPanel({ st, setSt, open }: PanelProps) {
  const q = st.q || ''
  const { data, loading, error, reload } = useAsync(() => fetchDevices(), [])
  const [patch, setPatch] = useState<Record<string, Partial<DeviceRow>>>({})   // 저장 결과를 재조회 없이 덧씌움
  useEffect(() => { setPatch({}) }, [data])
  const rowsAll = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (data || []).map((d) => ({ ...d, ...(patch[d.device_id] || {}) })).filter((d) =>
      !k || (d.label || '').toLowerCase().includes(k) || d.device_id.toLowerCase().includes(k) || (d.last_name || '').toLowerCase().includes(k) || (d.last_login_id || '').toLowerCase().includes(k) || (d.note || '').toLowerCase().includes(k))
  }, [data, patch, q])
  const { rows, s } = useSort(rowsAll, DEV_ACC, { key: 'last', dir: 'desc' })
  const labeled = rowsAll.filter((d) => d.label).length
  const notReady = error != null && isNotFound(error)
  const openUser = (login_id: string, name: string) => open({ kind: 'user', login_id, name })

  return (
    <div>
      <Head icon={<Smartphone size={17} />} title="기기 목록"><span className="muted" style={{ fontSize: 12 }}>앱을 쓴 단말 목록 · 마지막 사용자·활동·위치 동의</span></Head>
      <div className="act-tools">
        <div className="bws-tools" style={{ margin: 0 }}><Reload onClick={reload} loading={loading} /></div>
        <SearchBox value={q} onChange={(v) => setSt({ q: v })} placeholder="기기 ID·사용자 검색" />
      </div>
      {loading && <Msg kind="load">불러오는 중…</Msg>}
      {!loading && error != null && <Msg kind="err">{notReady ? '기기 목록 API(/ops/devices)가 아직 준비되지 않았습니다(404). 백엔드 배포 후 다시 확인해 주세요.' : describeError(error)}</Msg>}
      {!loading && !error && rowsAll.length === 0 && <Msg kind="empty">{q ? '검색 결과가 없습니다.' : '등록된 기기가 없습니다. 현장 앱이 활동을 보내면 자동으로 쌓입니다.'}</Msg>}
      {!loading && !error && rowsAll.length > 0 && (
        <div className="act-card" style={{ padding: 0 }}>
          <div className="act-tablebar"><RowCount n={rows.length} unit="대"  /><span className="muted" style={{ fontSize: 12 }}>사용자 이름을 누르면 사용자 탭이 열립니다</span></div>
          <div className="twrap">
            <table className="tbl act-table act-devtable">
              <thead><tr>
                <Th k="id" label="기기 ID" s={s} />
                <Th k="user" label="마지막 사용자" s={s} />
                <Th k="last" label="마지막 활동" s={s} />
                <Th k="first" label="첫 / 마지막 사용" s={s} />
                <Th k="events" label="이벤트" s={s} num />
                <Th k="consent" label="위치 동의" s={s} c />

              </tr></thead>
              <tbody>
                {rows.map((d) => <DeviceTr key={d.device_id} d={d} openUser={openUser} onSaved={(row) => setPatch((p) => ({ ...p, [d.device_id]: { ...(p[d.device_id] || {}), ...row } }))} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
