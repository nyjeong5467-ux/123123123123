// 학교 스코프 picker — 담당학교 / 전체학교(소속) / 모든학교(admin) 탭 + 검색.
// 근무표(Schedule)·홈(Home) 공용. scopeName=기준 인물(담당학교), scopeAffil=기준 소속(전체학교).
// onPick(학교) 로 선택을 상위에 알린다(상위가 세션/일정에 편입).
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

export type PickSchool = { id: string; name: string; manager?: string; agency?: string }

export function SchoolScopePicker({
  schools, scopeName, scopeAffil, isHq, excludeIds = [], onPick, autoFocus, maxHeight = 220,
}: {
  schools: PickSchool[]
  scopeName: string     // 담당학교 기준 인물(로그인/대상 이름)
  scopeAffil: string    // 전체학교 기준 소속
  isHq: boolean         // admin 이면 '모든 학교' 탭 노출
  excludeIds?: string[] // 이미 담긴 학교(목록에서 제외)
  onPick: (s: PickSchool) => void
  autoFocus?: boolean
  maxHeight?: number
}) {
  const [tab, setTab] = useState<'mine' | 'affil' | 'all'>('mine')
  const [q, setQ] = useState('')
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds])

  const counts = useMemo(() => ({
    mine: schools.filter((s) => s.manager && s.manager === scopeName).length,
    affil: scopeAffil ? schools.filter((s) => s.agency === scopeAffil).length : schools.length,
    all: schools.length,
  }), [schools, scopeName, scopeAffil])

  const pool = useMemo(() => {
    if (tab === 'mine') return schools.filter((s) => s.manager && s.manager === scopeName)
    if (tab === 'affil') return scopeAffil ? schools.filter((s) => s.agency === scopeAffil) : schools
    return schools
  }, [schools, tab, scopeName, scopeAffil])

  const list = useMemo(() => {
    const query = q.trim()
    const arr = (query ? pool.filter((s) => s.name.includes(query)) : pool).filter((s) => !exclude.has(s.id))
    return [...arr].sort((a, b) => a.name.localeCompare(b.name, 'ko')).slice(0, 80)
  }, [pool, q, exclude])

  const tabs = [
    { key: 'mine' as const, label: '담당학교', n: counts.mine },
    { key: 'affil' as const, label: '전체학교', n: counts.affil },
    ...(isHq ? [{ key: 'all' as const, label: '모든 학교', n: counts.all }] : []),
  ]

  return (
    <div>
      <div role="tablist" aria-label="학교 범위" style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const on = tab === t.key
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on}
              onClick={() => { setTab(t.key); setQ('') }}
              style={{
                border: '1px solid ' + (on ? 'var(--violet, #7c5cfb)' : 'var(--line, #e5e7eb)'),
                background: on ? 'var(--violet, #7c5cfb)' : 'transparent',
                color: on ? '#fff' : 'var(--muted, #6b7280)',
                borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              {t.label} <span style={{ fontWeight: 400, opacity: 0.85 }}>{t.n}</span>
            </button>
          )
        })}
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 9, top: 11, color: 'var(--muted)' }} />
        <input className="input" style={{ paddingLeft: 30 }} value={q} autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)} placeholder="학교명 검색" />
      </div>
      <div style={{ maxHeight, overflowY: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8, marginTop: 6 }}>
        {list.length === 0 ? (
          <div className="muted" style={{ padding: '10px 12px', fontSize: 12 }}>
            {q.trim()
              ? '검색 결과가 없습니다 — 다른 탭을 사용하세요.'
              : tab === 'mine'
                ? '담당 학교가 없습니다 — 「전체학교」 탭을 사용하세요.'
                : '표시할 학교가 없습니다.'}
          </div>
        ) : list.map((s) => (
          <button key={s.id} type="button" onClick={() => onPick(s)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent',
              padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, borderBottom: '1px solid var(--line, #f0f0f0)',
            }}>
            {s.name}
          </button>
        ))}
        {!q.trim() && pool.length > 80 && (
          <div className="muted" style={{ padding: '6px 12px', fontSize: 11 }}>… {pool.length}교 중 80교 표시. 검색으로 좁히세요.</div>
        )}
      </div>
    </div>
  )
}

export default SchoolScopePicker
