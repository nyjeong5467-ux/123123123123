// 근골격계 공정별 작업사진 — 본사(HQ) 조회. 현장 앱(app-field)이 /field/musculo-photos로
// 올린 사진을 학교×작업영역×공정별 갤러리로 표시 + 원본 다운로드.
// 데이터: 인덱스 = /ops/docs/musculo-photos, 원본 = /files/musculo/download?path=<ref>.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Download, School as SchoolIcon } from 'lucide-react'
import { api, getToken } from '../lib/api'

type School = { id: string; name: string; manager?: string; school_level?: string }
type Photo = { ref: string; name: string; ts?: string; by?: string; cid?: string }
// school_id → area → process → Photo[]
type PhotoDoc = Record<string, Record<string, Record<string, Photo[]>>>

// 앱(process_photos_screen.dart)과 동일한 프리셋(표시용). ※ 시설관리는 잠정.
const AREAS: { name: string; processes: { name: string; hazards: string[] }[] }[] = [
  {
    name: '급식실',
    processes: [
      { name: '검수', hazards: ['허리굽힘', '중량물', '넘어짐', '충돌', '끼임'] },
      { name: '전처리', hazards: ['반복동작', '절단', '베임', '찔림', '감전'] },
      { name: '조리', hazards: ['허리굽힘', '반복동작', '중량물', '화상', '끼임'] },
      { name: '배식', hazards: ['중량물', '허리굽힘', '반복동작'] },
      { name: '청소·세척', hazards: ['허리굽힘', '반복동작', '끼임', '유해물질접촉'] },
    ],
  },
  {
    name: '시설관리',
    processes: [
      { name: '예초작업', hazards: ['반복동작', '진동', '소음', '이물비산', '끼임'] },
      { name: '제설작업', hazards: ['허리굽힘', '중량물', '미끄러짐', '한랭'] },
      { name: '시설점검·수리', hazards: ['허리굽힘', '사다리추락', '감전', '끼임'] },
      { name: '소독·방역', hazards: ['유해물질접촉', '반복동작', '호흡기부담'] },
    ],
  },
]
const DOC_KEY = 'musculo-photos'

function downloadUrl(ref: string): string {
  return `/api/v1/files/musculo/download?path=${encodeURIComponent(ref)}`
}

// api.ts는 JSON 전용이라(수정 금지) 이미지 blob은 토큰 실어 자체 fetch → objectURL.
async function fetchBlobUrl(ref: string): Promise<string> {
  const res = await fetch(downloadUrl(ref), {
    headers: { Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': 'true' },
  })
  if (!res.ok) throw new Error(String(res.status))
  return URL.createObjectURL(await res.blob())
}

function Thumb({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    let made = ''
    fetchBlobUrl(photo.ref)
      .then((u) => { if (alive) { made = u; setUrl(u) } else URL.revokeObjectURL(u) })
      .catch(() => alive && setErr(true))
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [photo.ref])

  return (
    <div style={{ width: 132 }}>
      {/* 브라우저 네비게이션은 Bearer 토큰을 못 실어 401 → 이미 받아둔 blob objectURL을 열기/다운로드. 로드 전엔 링크 비활성. */}
      <a href={url || undefined} download={url ? photo.name : undefined} target="_blank" rel="noreferrer" title="원본 열기/다운로드"
        style={{ display: 'block', width: 132, height: 132, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--card-2)' }}>
        {err ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', fontSize: 11 }}>불러오기 실패</div>
        ) : url ? (
          <img src={url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', fontSize: 11 }}>불러오는 중…</div>
        )}
      </a>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--muted)' }}>
        <Download size={11} />
        <a href={url || undefined} download={url ? photo.name : undefined} target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(photo.ts || '').slice(0, 10) || photo.name}
        </a>
      </div>
    </div>
  )
}

export function MusculoPhotos() {
  const [schools, setSchools] = useState<School[]>([])
  const [doc, setDoc] = useState<PhotoDoc>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<string>('') // school_id
  const [area, setArea] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      api<School[]>('/schools').catch(() => [] as School[]),
      api<{ doc: PhotoDoc }>(`/ops/docs/${DOC_KEY}`).catch(() => ({ doc: {} as PhotoDoc })),
    ]).then(([s, d]) => {
      if (!alive) return
      setSchools(Array.isArray(s) ? s : [])
      setDoc(d.doc && typeof d.doc === 'object' ? d.doc : {})
      setLoading(false)
    }).catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const nameOf = useMemo(() => {
    const m = new Map(schools.map((s) => [s.id, s]))
    return (id: string) => m.get(id)
  }, [schools])

  // 사진이 있는 학교 목록(인덱스 키 기준)
  const withPhotos = useMemo(() => {
    return Object.keys(doc).map((id) => {
      let total = 0
      const areas = doc[id] || {}
      for (const a of Object.keys(areas)) for (const p of Object.keys(areas[a])) total += (areas[a][p] || []).length
      return { id, total, school: nameOf(id) }
    }).sort((a, b) => b.total - a.total)
  }, [doc, nameOf])

  const selAreas = sel ? (doc[sel] || {}) : {}
  const areaName = AREAS[area].name

  return (
    <div className="page rv">
      <div className="breadcrumb">
        <Link to="/">홈</Link> / <Link to="/musculo">근골격계</Link> / <b>공정별 작업사진</b>
      </div>
      <div className="bar">
        <h2><Camera size={20} /> 공정별 작업사진</h2>
        <div className="sp" />
        <span className="pillx doing" style={{ whiteSpace: 'normal' }}>
          현장 앱에서 올린 급식실·시설관리 공정별 부담작업·유해위험요인 사진
        </span>
      </div>

      {loading && <div className="tstate">불러오는 중…</div>}
      {!loading && error && <div className="tstate">오류: {error}</div>}

      {!loading && !error && !sel && (
        <div className="ledger">
          <div className="lh">
            <h2><SchoolIcon size={18} /> 사진이 등록된 학교</h2>
            <span className="pillx doing">{withPhotos.length}개교</span>
          </div>
          <div className="twrap">
            <table className="tbl">
              <thead><tr><th>학교</th><th>담당자</th><th className="c">사진 수</th><th /></tr></thead>
              <tbody>
                {withPhotos.map((r) => (
                  <tr key={r.id} onClick={() => { setSel(r.id); setArea(0) }} style={{ cursor: 'pointer' }}>
                    <td><b>{r.school?.name || r.id}</b></td>
                    <td>{r.school?.manager || '—'}</td>
                    <td className="c">{r.total}장</td>
                    <td className="c">›</td>
                  </tr>
                ))}
                {withPhotos.length === 0 && (
                  <tr><td colSpan={4}><div className="tstate">아직 등록된 작업사진이 없습니다. 현장 앱(근골격계 → 공정별 작업사진)에서 촬영·업로드하세요.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && sel && (
        <>
          <div className="rkh-schoolhead">
            <button className="rkh-back" onClick={() => setSel('')}><ArrowLeft size={14} /> 학교 목록</button>
            <span className="rkh-schoolname">{nameOf(sel)?.name || sel}</span>
            <span className="rkh-schoolmgr">담당자 {nameOf(sel)?.manager || '—'}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, margin: '12px 0 4px' }}>
            {AREAS.map((a, i) => (
              <button key={a.name} className={'btn ' + (i === area ? 'btn-primary' : '')} onClick={() => setArea(i)}>
                {a.name}
              </button>
            ))}
          </div>

          {AREAS[area].processes.map((p) => {
            const photos = (selAreas[areaName]?.[p.name] || []) as Photo[]
            return (
              <div className="ledger" key={p.name} style={{ marginTop: 12 }}>
                <div className="lh">
                  <h2 style={{ fontSize: 15 }}>{p.name}</h2>
                  <span className="pillx doing">{photos.length}장</span>
                  <div className="sp" />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {p.hazards.map((h) => (
                      <span key={h} className="pillx" style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}>{h}</span>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '14px 18px' }}>
                  {photos.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>등록된 사진 없음</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {photos.map((ph, i) => <Thumb key={ph.cid || ph.ref || i} photo={ph} />)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
