// [063] 업무 탭 공용 학교 검색 패널 — 학교 탭의 검색 영역([020][025])과 동일한 확정형 UX.
// 학교명·지역명 입력 + 학교급 세그먼트 + [조회] 버튼. 입력 즉시가 아니라 [조회]/Enter로 확정,
// X는 해당 조건 즉시 해제. 스타일은 schoolhub.css의 shub-search 블록을 재사용.
import { useState } from 'react'
import { X } from 'lucide-react'
import '../../styles/schoolhub.css'

const LEVELS = ['유', '초', '중', '고', '기타']

export type WorkSearch = { name: string; region: string; level: string }

export function WorkSearchPanel(p: {
  onSearch: (s: WorkSearch) => void
  onClear: (field: 'name' | 'region') => void
}) {
  const [nameQ, setNameQ] = useState('')
  const [regionQ, setRegionQ] = useState('')
  const [levelQ, setLevelQ] = useState('')

  const go = () => p.onSearch({ name: nameQ.trim(), region: regionQ.trim(), level: levelQ })

  return (
    <div className="shub-search">
      <div className="shub-field">
        <span className="lab">학교명</span>
        <div className="in">
          <input
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go() }}
          />
          {nameQ && (
            <button
              className="shub-search-clear"
              onClick={() => { setNameQ(''); p.onClear('name') }}
              aria-label="학교명 지우기"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="shub-field">
        <span className="lab">지역명</span>
        <div className="in">
          <input
            value={regionQ}
            onChange={(e) => setRegionQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go() }}
          />
          {regionQ && (
            <button
              className="shub-search-clear"
              onClick={() => { setRegionQ(''); p.onClear('region') }}
              aria-label="지역명 지우기"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="shub-seg" role="group" aria-label="학교급 선택">
        <button className={levelQ === '' ? 'on' : ''} onClick={() => setLevelQ('')}>전체</button>
        {LEVELS.map((l) => (
          <button key={l} className={levelQ === l ? 'on' : ''} onClick={() => setLevelQ(l)}>{l}</button>
        ))}
      </div>
      <button className="btn btn-primary shub-go" onClick={go}>조회</button>
    </div>
  )
}
