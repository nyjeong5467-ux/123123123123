// 정렬 가능한 <th>. col이 sortAccessors에 있으면 클릭 정렬(오름차↑→내림차↓→해제),
// 없으면 일반 <th>로 렌더. className(예: 'c')은 그대로 전달.
import type { ReactNode } from 'react'
import type { TableQuery } from '../../lib/useTableQuery'

export function SortableTh<T>({
  q,
  col,
  children,
  className = '',
}: {
  q: TableQuery<T>
  col: string
  children: ReactNode
  className?: string
}) {
  if (!q.sortableKeys.includes(col)) {
    return <th className={className || undefined}>{children}</th>
  }
  const active = q.sort?.key === col
  const caret = active ? (q.sort!.dir === 'asc' ? '▲' : '▼') : '↕'
  const cls = [className, 'sortth', active ? 'active' : ''].filter(Boolean).join(' ')
  return (
    <th className={cls} onClick={() => q.toggleSort(col)}>
      {children}
      <span className="caret">{caret}</span>
    </th>
  )
}
