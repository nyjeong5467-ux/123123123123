// [065][066] 근골격계 보고서 작성중 초안 감지 — MusculoReport의 localStorage 초안(mur:draft:v2:{sid})에
// 의미 있는 입력(명단 성명·부담작업·위험요인·사진·개선계획 등)이 있으면 이어서 작성 가능으로 판정.
// 홈 오늘의 할 일·근골격계 탭 스트립이 공용 사용. (보고서 화면은 초안을 자동 저장·복원하므로
// /musculo/report?school={sid} 진입만으로 이어서 작성된다)
export function hasMusDraft(sid?: string): boolean {
  if (!sid) return false
  try {
    const raw = localStorage.getItem('mur:draft:v2:' + sid)
    if (!raw) return false
    const d = JSON.parse(raw) as {
      ab?: Record<string, unknown>; hz?: Record<string, unknown>; caps?: Record<string, string>
      roster?: { n?: string }[]; plan?: unknown[]; shots?: Record<string, { name?: string }[]>
    }
    if (Array.isArray(d.roster) && d.roster.some((p) => (p?.n || '').trim())) return true
    if (Array.isArray(d.plan) && d.plan.length > 0) return true
    if (d.ab && Object.keys(d.ab).length > 0) return true
    if (d.hz && Object.keys(d.hz).length > 0) return true
    if (d.caps && Object.values(d.caps).some((v) => (v || '').trim())) return true
    if (d.shots && Object.values(d.shots).some((l) => Array.isArray(l) && l.some((s) => s?.name))) return true
    return false
  } catch {
    return false
  }
}
