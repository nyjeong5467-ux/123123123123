// 학교 허브 상단 — 이번 달 법정업무 축약 배너.
// 홈의 "연간 법정업무 운영 공지"(CycleHero, /ops/docs/annual-cycle 문서)를 읽기 전용으로
// 요약: 접힌 상태는 이번 달에 걸친 업무 칩 한 줄, 펼치면 12개월 미니 간트.
// 일정 편집은 홈에서만 (여기서는 조회 전용 — "홈에서 편집" 링크 제공).
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import { AY_MONTH_NO, CYCLE_DOC_DEFAULT, migrateCycleDoc, type CycleDoc } from './CycleHero'

const TONE_CLS: Record<string, string> = { rf: 'doing', mg: 'warn', cd: 'muted', edu: 'muted' }

export function CycleBanner({ inspUnvisited }: { inspUnvisited: number | null }) {
  const [doc, setDoc] = useState<CycleDoc>(CYCLE_DOC_DEFAULT)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ doc: Record<string, unknown> }>('/ops/docs/annual-cycle')
      .then((r) => { if (alive) setDoc(migrateCycleDoc(r.doc)) })
      .catch(() => {}) // 문서 없으면 기본값 유지
    return () => { alive = false }
  }, [])

  const now = new Date()
  const curMonth = now.getMonth() + 1
  const curIdx = AY_MONTH_NO.indexOf(curMonth)
  const ay = curMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1

  // 이번 달에 걸쳐 있는 업무 → 요약 칩 (안전점검은 매월이라 별도 고정 칩)
  const chips = useMemo(
    () =>
      doc.rows
        .map((row) => {
          const bar = row.bars.find((b) => b.s <= curIdx && curIdx <= b.e)
          if (!bar) return null
          const endsNow = bar.e === curIdx && bar.mark // 이번 달이 제출월/마감월
          return {
            key: row.id,
            name: row.name,
            label: endsNow ? `${bar.label} → ${bar.mark}` : row.id === 'edu' ? '수시 진행' : bar.label,
            cls: TONE_CLS[row.tone] ?? 'muted',
          }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    [doc, curIdx],
  )

  return (
    <div className="shub-cycle">
      <button className="shub-cycle-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="shub-cycle-title"><CalendarRange size={15} /> {curMonth}월 법정업무</span>
        <span className={'shub-w ' + (inspUnvisited ? 'warn' : 'ok')}>
          <i />안전점검 매월 진행{inspUnvisited ? ` · 미방문 ${inspUnvisited}교` : ''}
        </span>
        {chips.map((c) => (
          <span key={c.key} className={'shub-w ' + c.cls}><i />{c.name} · {c.label}</span>
        ))}
        <span className="sp" />
        <span className="shub-cycle-more">
          {open ? '접기' : '연간 일정'} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="shub-cycle-body">
          <div className="shub-cycle-months">
            <span />
            {AY_MONTH_NO.map((m) => (
              <span key={m} className={m === curMonth ? 'cur' : ''}>{m}월</span>
            ))}
          </div>
          {/* 안전점검 — 매월 반복 (고정 행) */}
          <div className="shub-cycle-row">
            <span className="nm">안전점검</span>
            <div className="grid">
              <div className="bar doing" style={{ gridColumn: '1 / 13' }}>{doc.inspSub}</div>
            </div>
          </div>
          {doc.rows.map((row) => (
            <div className="shub-cycle-row" key={row.id}>
              <span className="nm">{row.name}</span>
              <div className="grid">
                {row.bars.map((b) => (
                  <div key={b.id} className={'bar ' + (TONE_CLS[row.tone] ?? 'muted')} style={{ gridColumn: `${b.s + 1} / ${b.e + 2}` }}>
                    {b.label}{b.mark ? ` · ${b.mark}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="shub-cycle-foot">
            {ay}학년도 ({ay}.03 ~ {ay + 1}.02) · 안전점검은 매월 반복, 나머지 업무는 착수월·제출월 기준
          </div>
        </div>
      )}
    </div>
  )
}
