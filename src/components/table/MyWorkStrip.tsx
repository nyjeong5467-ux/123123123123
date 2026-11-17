// [066] 업무 탭 공용 "내 작업" 스트립 — 안전점검 [059]와 동일한 형태.
// 작성중(진행중) 건을 카드로 보여주고 [이어서 작성]으로 재개. 표시할 건이 없으면 렌더하지 않음.
// [176] hideKey 를 주면 카드 오른쪽 위 X로 목록에서 숨기기(안전점검 [160]과 동일) — 작성물은 지우지 않고 이 목록에서만 뺀다.
//       계정별·브라우저 저장. 진행 상태(detail)가 바뀌면 다시 나타난다.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import '../../styles/inspecthier.css'

export type MyWorkItem = {
  key: string
  school: string
  detail: string // 카드 부제 (공정·반기·진행도 등)
  onResume: () => void
}

const readHidden = (k?: string): string[] => {
  if (!k) return []
  try { return JSON.parse(localStorage.getItem(k) || '[]') as string[] } catch { return [] }
}

export function MyWorkStrip(p: { title: string; items: MyWorkItem[]; mineOnly: boolean; hideKey?: string; hideNote?: string }) {
  const [hidden, setHidden] = useState<string[]>(() => readHidden(p.hideKey))
  useEffect(() => { setHidden(readHidden(p.hideKey)) }, [p.hideKey])
  const hid = (it: MyWorkItem) => `${it.key}|${it.detail}`
  const hide = (it: MyWorkItem) => setHidden((h) => {
    const next = [...h.filter((x) => x !== hid(it)), hid(it)].slice(-200)
    try { if (p.hideKey) localStorage.setItem(p.hideKey, JSON.stringify(next)) } catch { /* 저장 실패 무시 */ }
    return next
  })
  const items = p.hideKey ? p.items.filter((it) => !hidden.includes(hid(it))) : p.items
  if (items.length === 0) return null
  return (
    <div className="inh-mywork">
      <div className="inh-mywork-head">
        <b>{p.title}</b>
        <span className="pillx doing">작성중 {items.length}건</span>
        {p.mineOnly && <span className="inh-mywork-note">담당 학교 기준</span>}
      </div>
      <div className="inh-mywork-cards">
        {items.map((it) => (
          <div key={it.key} className="inh-mywork-card">
            {p.hideKey && (
              <button className="inh-mywork-x" aria-label="목록에서 숨기기"
                title={p.hideNote || '이 목록에서 숨기기 — 작성한 내용은 삭제되지 않으며 아래 목록에서 계속 열 수 있습니다'}
                onClick={() => hide(it)}>
                <X size={13} />
              </button>
            )}
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
