export function Placeholder({
  title, desc, points, api,
}: {
  title: string
  desc: string
  points: string[]
  api: string
}) {
  return (
    <div className="page rv">
      <div className="breadcrumb">홈 / <b>{title}</b></div>
      <div className="bar"><h2>{title}</h2></div>
      <div className="card" style={{ padding: '28px 30px', maxWidth: 720 }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>{desc}</p>
        <ul style={{ margin: '18px 0 0', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 2 }}>
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <div style={{ marginTop: 18, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--muted)' }}>
          연동 API · {api}
        </div>
        <span className="pillx doing" style={{ marginTop: 18, display: 'inline-block' }}>
          Phase 3 — 다음 차례 구현 (백엔드 준비 완료)
        </span>
      </div>
    </div>
  )
}
