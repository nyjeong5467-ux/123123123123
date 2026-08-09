// 학교 허브 상단 — 이번 달 법정업무 축약 배너.
// 홈의 "연간 법정업무 운영 공지"(CycleHero, /ops/docs/annual-cycle 문서)를 읽기 전용으로
// 요약: 업무 칩(안전점검·위험성평가·근골격계·이행점검)을 누르면 담당 학교 완료율 도넛 표시,
// [연간 일정]을 누르면 12개월 미니 간트. 일정 데이터는 홈과 동일 문서(조회 전용).
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'
import { AY_MONTH_NO, CYCLE_DOC_DEFAULT, migrateCycleDoc, type CycleDoc } from './CycleHero'

const TONE_CLS: Record<string, string> = { rf: 'doing', mg: 'warn', cd: 'muted', edu: 'muted' }

// 완료율 집계 대상 업무 (학교 목록 배지와 동일 기준)
export type WorkKey = 'insp' | 'risk' | 'mus' | 'comp'
export type WorkStats = { total: number; scopeLabel: string } & Record<WorkKey, number>
const WORK_META: Record<WorkKey, { label: string; desc: string }> = {
  insp: { label: '안전점검', desc: '이번 달 점검 완료 기준' },
  risk: { label: '위험성평가', desc: '정기 위험성평가 완료 기준' },
  mus: { label: '근골격계', desc: '증상조사표 검수 대기 없음 기준' },
  comp: { label: '이행점검', desc: '당기(반기) 조사지 제출 완료 기준' },
}
const ROW_TO_KEY: Record<string, WorkKey | undefined> = { risk: 'risk', musculo: 'mus', compliance: 'comp' }

// 소형 도넛 게이지 — 트랙은 라인 토큰, 진행 아크는 보라(브랜드), 중앙 숫자는 잉크 토큰
function Donut({ pct }: { pct: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <svg width={104} height={104} viewBox="0 0 104 104" role="img" aria-label={`완료율 ${clamped}%`}>
      <circle cx={52} cy={52} r={R} fill="none" stroke="var(--line)" strokeWidth={11} />
      <circle
        cx={52} cy={52} r={R} fill="none" stroke="var(--violet)" strokeWidth={11}
        strokeDasharray={`${(clamped / 100) * C} ${C}`} strokeLinecap="round" transform="rotate(-90 52 52)"
      />
      <text x={52} y={58} textAnchor="middle" fontSize={21} fontWeight={800} fill="var(--ink)">{clamped}%</text>
    </svg>
  )
}

export function CycleBanner({ inspUnvisited, workStats }: { inspUnvisited: number | null; workStats: WorkStats | null }) {
  const [doc, setDoc] = useState<CycleDoc>(CYCLE_DOC_DEFAULT)
  const [open, setOpen] = useState(false)
  const [selWork, setSelWork] = useState<WorkKey | null>(null)

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

  // 업무 칩 — 4대 업무는 클릭 가능(완료율 도넛), 교육은 정보 표시만.
  // 문구는 주황(주의)일 때만 이름 옆에 표시하고, 그 외에는 업무 이름만 (툴팁에 상세 유지)
  const chips = useMemo(() => {
    const out: { key: WorkKey | null; name: string; label: string; cls: string; tip: string }[] = [
      {
        key: 'insp', name: '안전점검',
        label: inspUnvisited ? `미방문 ${inspUnvisited}교` : '',
        cls: inspUnvisited ? 'warn' : 'ok',
        tip: `매월 진행${inspUnvisited ? ` · 이번 달 미방문 ${inspUnvisited}교` : ' · 이번 달 전 학교 완료'}`,
      },
    ]
    for (const row of doc.rows) {
      const key = ROW_TO_KEY[row.id] ?? null
      const bar = row.bars.find((b) => b.s <= curIdx && curIdx <= b.e)
      const cls = bar ? (TONE_CLS[row.tone] ?? 'muted') : 'muted'
      const detail = row.id === 'edu'
        ? '수시 진행'
        : bar
          ? (bar.e === curIdx && bar.mark ? `${bar.label} → ${bar.mark}` : bar.label)
          : '이번 달 일정 없음'
      out.push({ key, name: row.name, label: cls === 'warn' ? detail : '', cls, tip: detail })
    }
    return out
  }, [doc, curIdx, inspUnvisited])

  const sel = selWork && WORK_META[selWork]
  const done = selWork && workStats ? workStats[selWork] : 0
  const pct = workStats && workStats.total > 0 ? Math.round((done / workStats.total) * 100) : 0

  return (
    <div className="shub-cycle">
      <div className="shub-cycle-head">
        <span className="shub-cycle-title"><CalendarRange size={15} /> {curMonth}월 법정업무</span>
        {chips.map((c) =>
          c.key ? (
            <button
              key={c.name}
              className={'shub-w ' + c.cls + (selWork === c.key ? ' on' : '')}
              title={`${c.tip} — 클릭하면 완료율 표시`}
              onClick={() => setSelWork((s) => (s === c.key ? null : c.key))}
            >
              <i />{c.name}{c.label ? ` · ${c.label}` : ''}
            </button>
          ) : (
            <span key={c.name} className={'shub-w ' + c.cls} title={c.tip}><i />{c.name}{c.label ? ` · ${c.label}` : ''}</span>
          ),
        )}
        <span className="sp" />
        <button className="shub-cycle-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          연간 일정 {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {sel && (
        <div className="shub-cycle-donut">
          {workStats ? (
            <>
              <Donut pct={pct} />
              <div className="txt">
                <b>{sel.label} 완료율</b>
                <span className="n">{workStats.scopeLabel} {done} / {workStats.total}교 완료</span>
                <span className="d">{sel.desc} · 학교 목록의 업무 바로가기 배지와 동일 집계</span>
              </div>
            </>
          ) : (
            <div className="shub-cycle-wait">학교별 업무 상태를 집계하는 중…</div>
          )}
        </div>
      )}

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
