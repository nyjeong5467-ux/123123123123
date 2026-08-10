// [066] 업무 탭 공용 "내 작업" 스트립 — 안전점검 [059]와 동일한 형태.
// 작성중(진행중) 건을 카드로 보여주고 [이어서 작성]으로 재개. 표시할 건이 없으면 렌더하지 않음.
import '../../styles/inspecthier.css'

export type MyWorkItem = {
  key: string
  school: string
  detail: string // 카드 부제 (공정·반기·진행도 등)
  onResume: () => void
}

export function MyWorkStrip(p: { title: string; items: MyWorkItem[]; mineOnly: boolean }) {
  if (p.items.length === 0) return null
  return (
    <div className="inh-mywork">
      <div className="inh-mywork-head">
        <b>{p.title}</b>
        <span className="pillx doing">작성중 {p.items.length}건</span>
        {p.mineOnly && <span className="inh-mywork-note">담당 학교 기준</span>}
      </div>
      <div className="inh-mywork-cards">
        {p.items.map((it) => (
          <div key={it.key} className="inh-mywork-card">
            <div className="inh-mywork-info">
              <div className="t">{it.school}</div>
              <div className="p">{it.detail}</div>
            </div>
            <button className="btn btn-primary inh-mywork-btn" onClick={it.onResume}>
              이어서 작성
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
