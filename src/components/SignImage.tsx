// 손글씨 서명 이미지 — 보호 파일이라 토큰 실어 자체 fetch → objectURL로 <img> 표시.
// api.ts는 JSON 전용(수정 금지)이므로 여기서 직접 fetch. (MusculoPhotos와 동일 패턴) [054]
// InspectionSheetView에서 분리 — 작성/수정 화면(InspectionForm)도 순환 의존 없이 재사용.
import { useEffect, useState } from 'react'
import { getToken } from '../lib/api'

export function SignImage({ refPath }: { refPath: string }) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    let made = ''
    fetch(`/api/v1/files/inspection/download?path=${encodeURIComponent(refPath)}`, {
      headers: { Authorization: `Bearer ${getToken()}`, 'ngrok-skip-browser-warning': 'true' },
    })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.blob() })
      .then((b) => { const u = URL.createObjectURL(b); if (alive) { made = u; setUrl(u) } else URL.revokeObjectURL(u) })
      .catch(() => { if (alive) setErr(true) })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [refPath])
  // 이미지 로드 실패 시엔 서명은 있으므로 '(서명)' 텍스트로 폴백.
  if (err) return <span className="st">(서명)</span>
  // st-loading 마커 — PDF/인쇄 캡처가 "서명 아직 로딩 중" 상태를 감지해 기다릴 수 있게 [서명·사진 출력 수정]
  if (!url) return <span className="st st-loading">불러오는 중…</span>
  return (
    <img
      src={url}
      alt="서명"
      style={{ maxHeight: 48, maxWidth: 200, objectFit: 'contain', alignSelf: 'center' }}
    />
  )
}

// 캡처/인쇄 전 이미지 로드 대기 — SignImage(비동기 fetch→blob)와 사진 <img>가 전부 그려질 때까지 폴링.
// html2canvas·window.print가 이미지 로드 전에 찍혀 서명·사진 칸이 비던 경합 방지. [서명·사진 출력 수정]
export async function waitForSheetImages(el: HTMLElement, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now()
  for (;;) {
    const loading = el.querySelectorAll('.st-loading').length
    const pending = Array.from(el.querySelectorAll('img')).filter((im) => !(im.complete && im.naturalWidth > 0))
    if (loading === 0 && pending.length === 0) return
    if (Date.now() - t0 > timeoutMs) return // 타임아웃 — 남은 건 텍스트 폴백으로 출력
    await new Promise((r) => setTimeout(r, 120))
  }
}
