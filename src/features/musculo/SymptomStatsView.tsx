// 근골격계 증상조사표 통계 뷰 — 요약 카드 + 분포 표(부위/부서/라인/작업/작업기간/성별·연령·부담).
// MusculoStats(엑셀 입력 페이지)와 MusculoReport(공단 엑셀 미리보기 단계)에서 공용으로 렌더.
// workers를 받아 자체 임계값 상태로 computeStats를 호출하는 순수 표시 컴포넌트(백엔드 무관).
import { useMemo, useState } from 'react'
import {
  DEFAULT_CUR_THRESH, DEFAULT_PREV_THRESH, PARTS, VERDICTS, computeStats,
  type Thresh, type Verdict, type Worker,
} from './symptomStats'

const VCLS: Record<Verdict, string> = { 정상: 'ok', 관리대상자: 'doing', 통증호소자: 'poor' }
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)

export function SymptomStatsView({ workers }: { workers: Worker[] }) {
  const [curThresh, setCurThresh] = useState<Thresh>(DEFAULT_CUR_THRESH)
  const [prevThresh, setPrevThresh] = useState<Thresh>(DEFAULT_PREV_THRESH)
  const stats = useMemo(() => computeStats(workers, { curThresh, prevThresh }), [workers, curThresh, prevThresh])

  return (
    <>
      {/* ── 요약 카드 ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <SummaryCard label="응답자" value={`${stats.total}명`} sub={stats.age.n ? `평균 ${stats.age.mean.toFixed(1)}세 (±${stats.age.sd.toFixed(1)})` : ''} />
        {VERDICTS.map((v) => (
          <SummaryCard key={v} label={v} value={`${stats.overall[v]}명`} sub={`${pct(stats.overall[v], stats.total)}%`} tone={VCLS[v]} />
        ))}
      </div>

      {/* ── 부위별 분포 ── */}
      <StatTable title="통증부위별 분포 (전체 판정 기준)" rows={[
        ...PARTS.map((p) => ({ label: p.label, counts: stats.byPart[p.key] })),
        { label: '전체', counts: stats.byPart.all, bold: true },
      ]} total={stats.total} />

      {/* ── 부서별 / 라인별 / 작업별 ── */}
      {stats.byDept.length > 0 && (
        <StatTable title="부서별 분포" firstCol="부서" rows={stats.byDept.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
      )}
      {stats.byLine.length > 0 && (
        <StatTable title="라인별 분포" firstCol="라인" rows={stats.byLine.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
      )}
      {stats.byJob.length > 0 && (
        <StatTable title="작업별 분포" firstCol="작업" rows={stats.byJob.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
      )}

      {/* ── 작업기간 그룹 (임계값 설정) ── */}
      <div className="ledger" style={{ marginBottom: 14 }}>
        <div className="lh" style={{ gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15 }}>작업기간 그룹 설정 (년)</h2>
          <div className="sp" />
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>현재</span>
          <ThreshInput t={curThresh} onChange={setCurThresh} />
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginLeft: 8 }}>이전</span>
          <ThreshInput t={prevThresh} onChange={setPrevThresh} />
        </div>
        <div style={{ padding: '0 18px 12px', fontSize: 11.5, color: 'var(--muted)' }}>
          경계값 3개로 4구간(미만 / 사이 / 사이 / 이상)을 나눕니다. 기본값은 엑셀과 동일(현재 1·3·3, 이전 1·2·3).
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <StatTable title="현재 작업기간별 분포" firstCol="현재 작업기간" rows={stats.byCurPeriod.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
        </div>
        <div style={{ flex: '1 1 320px' }}>
          <StatTable title="이전 작업기간별 분포" firstCol="이전 작업기간" rows={stats.byPrevPeriod.map((d) => ({ label: d.key, counts: d.counts }))} total={stats.total} />
        </div>
      </div>

      {/* ── 성별 / 연령대 / 부담 ── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <StatTable title="성별 분포" firstCol="성별" rows={[
            { label: '남자', counts: stats.bySex.남 },
            { label: '여자', counts: stats.bySex.여 },
            ...(stats.bySex.미상.정상 + stats.bySex.미상.관리대상자 + stats.bySex.미상.통증호소자 > 0 ? [{ label: '미상', counts: stats.bySex.미상 }] : []),
          ]} total={stats.total} />
        </div>
        {stats.byAgeBand.length > 0 && (
          <div style={{ flex: '1 1 300px' }}>
            <StatTable title="연령대별 분포" firstCol="연령대" rows={stats.byAgeBand.map((b) => ({ label: b.key, counts: b.counts }))} total={stats.total} />
          </div>
        )}
        {stats.byBurden.length > 0 && (
          <div style={{ flex: '1 1 300px' }}>
            <StatTable title="육체적 부담정도별 분포" firstCol="부담정도" rows={stats.byBurden.map((b) => ({ label: b.label, counts: b.counts }))} total={stats.total} />
          </div>
        )}
      </div>
    </>
  )
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ flex: '1 1 150px', padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--line)', borderLeft: tone ? `4px solid var(--${tone === 'ok' ? 'ok' : tone === 'doing' ? 'amber' : 'red'}-ink)` : '4px solid var(--line)', borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function StatTable({ title, rows, total, firstCol = '구분' }: { title: string; firstCol?: string; total: number; rows: { label: string; counts: Record<Verdict, number>; bold?: boolean }[] }) {
  return (
    <div className="ledger" style={{ marginBottom: 14 }}>
      <div className="lh"><h2 style={{ fontSize: 15 }}>{title}</h2></div>
      <div className="twrap">
        <table className="tbl">
          <thead><tr><th>{firstCol}</th>{VERDICTS.map((v) => <th key={v} className="c">{v}</th>)}<th className="c">합계</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const t = r.counts.정상 + r.counts.관리대상자 + r.counts.통증호소자
              return (
                <tr key={i} style={r.bold ? { fontWeight: 800, background: 'var(--card-2)' } : undefined}>
                  <td>{r.label}</td>
                  {VERDICTS.map((v) => (
                    <td key={v} className="c">{r.counts[v]}{r.counts[v] > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({pct(r.counts[v], t)}%)</span>}</td>
                  ))}
                  <td className="c"><b>{t}</b></td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={5}><div className="tstate">데이터 없음</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ThreshInput({ t, onChange }: { t: Thresh; onChange: (t: Thresh) => void }) {
  const set = (i: number, v: string) => {
    const nt = [...t] as Thresh
    const n = Number(v)
    nt[i] = Number.isFinite(n) ? n : 0
    onChange(nt)
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <input key={i} className="input" type="number" value={t[i]} onChange={(e) => set(i, e.target.value)}
          style={{ width: 54, fontSize: 12.5, padding: '4px 6px' }} />
      ))}
    </span>
  )
}
