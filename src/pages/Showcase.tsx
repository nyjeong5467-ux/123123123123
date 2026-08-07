import { type ReactNode } from 'react'
import { Download, Plus, Search, Upload } from 'lucide-react'
import { Button, Card, Chip, PageHeader, Progress, StatBlock } from '../components/ui'

const S = {
  done: <Chip tone="ok" pip>완료</Chip>,
  doing: <Chip tone="outline">진행중</Chip>,
  late: <Chip tone="warn" pip>지연</Chip>,
  todo: <Chip tone="muted">예정</Chip>,
  na: <Chip tone="muted">해당없음</Chip>,
} as const

type Row = {
  n: number; name: string; workers: string; sub: string
  safety: keyof typeof S; risk: keyof typeof S; musc: keyof typeof S; comp: keyof typeof S
  pct: number; pctTone?: 'warn' | 'danger'; note: ReactNode; danger?: boolean
}

const ROWS: Row[] = [
  { n: 1, name: '○○초등학교', workers: '조3·시1·미1·통2·당1', sub: '급식 3 / 계 8명', safety: 'done', risk: 'doing', musc: 'todo', comp: 'doing', pct: 92, note: <span className="muted">엘리베이터 有 · 화상 산재(3월)</span> },
  { n: 2, name: '△△중학교', workers: '조5·시2·미2·통0·당1', sub: '급식 5 / 계 10명', safety: 'late', risk: 'done', musc: 'todo', comp: 'todo', pct: 64, pctTone: 'warn', note: <Chip tone="danger">점검 마감 D+3</Chip>, danger: true },
  { n: 3, name: '□□고등학교', workers: '조7·시2·미3·통0·당2', sub: '급식 7 / 계 14명', safety: 'done', risk: 'done', musc: 'doing', comp: 'done', pct: 88, note: <span className="muted">사립 · 교육청 업로드 제외</span> },
  { n: 4, name: '○○남초등학교', workers: '조2·시1·미1·통1·당1', sub: '급식 2 / 계 6명', safety: 'done', risk: 'todo', musc: 'na', comp: 'todo', pct: 81, note: <span className="muted">통학차량 1대</span> },
  { n: 5, name: '△△여자중학교', workers: '조4·시1·미2·통0·당1', sub: '급식 4 / 계 8명', safety: 'late', risk: 'doing', musc: 'todo', comp: 'todo', pct: 48, pctTone: 'danger', note: <Chip tone="danger">진도율 저조 · 점검 지연</Chip>, danger: true },
  { n: 6, name: '□□공업고등학교', workers: '조6·시3·미2·통0·당2', sub: '급식 6 / 계 13명', safety: 'done', risk: 'done', musc: 'done', comp: 'doing', pct: 95, note: <span className="muted">실습실 위험설비 多</span> },
]

const RAMP = ['#0d0e10', '#202427', '#2d3438', '#3d454b', '#5a636a', '#939ca2', '#c4ccd1', '#e4e9ed', '#f5f6f7']

export function Showcase() {
  return (
    <>
      <PageHeader
        crumb={<>홈 / <b>이력관리 대장</b></>}
        title="이력관리 대장 · 메인 대시보드"
        sub={<>담당 학교 현황 한눈 조회 · 5대 업무 상태·진도 자동 계산 · <b>점검자 개인 시점</b> (2025 회계연도 · 2025.03~2026.02)</>}
        actions={
          <>
            <Button><Upload size={15} /> 엑셀 일괄 업로드</Button>
            <Button><Download size={15} /> 계약서용 다운</Button>
            <Button variant="primary"><Plus size={16} /> 학교 등록</Button>
          </>
        }
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatBlock label="담당 학교" value="62" unit="교" delta="초 38 · 중 16 · 고 8" />
        <StatBlock label="이번 달 점검 완료" value={<>48<small> / 62</small></>} delta="진행률 77.4%" deltaTone="up" tone="accent" />
        <StatBlock label="지연 (마감 초과)" value="5" unit="교" delta="즉시 조치 필요" deltaTone="down" tone="danger" />
        <StatBlock label="평균 교육 진도율" value="78" unit="%" delta="상반기 · 미수료 41명" />
        <StatBlock label="교육청 전송 대기" value="9" unit="건" delta="서명완료 → 봇 전송 대기" />
      </div>

      <Card
        title="담당 학교 리스트"
        tag="행 클릭 시 학교 상세"
        tools={
          <>
            <div className="search">
              <Search size={15} />
              <input className="input" placeholder="학교·담당조사원 검색" />
            </div>
            <select className="select" style={{ width: 120 }}>
              <option>전체 (62)</option>
              <option>지연 5</option>
            </select>
          </>
        }
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>학교명</th>
                <th>담당조사원</th>
                <th>현업종사자 (조·시·미·통·당 / 계)</th>
                <th className="num">안전점검</th>
                <th className="num">위험성평가</th>
                <th className="num">근골격계</th>
                <th className="num">이행점검</th>
                <th style={{ width: 168 }}>교육 진도율</th>
                <th>특이사항</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.n} className={r.danger ? 'row-danger' : undefined}>
                  <td className="num muted">{r.n}</td>
                  <td className="school-name">{r.name}</td>
                  <td>J-07A 조사원</td>
                  <td>
                    <div className="cell-stack">
                      <b>{r.workers}</b>
                      <span className="sub">{r.sub}</span>
                    </div>
                  </td>
                  <td className="num">{S[r.safety]}</td>
                  <td className="num">{S[r.risk]}</td>
                  <td className="num">{S[r.musc]}</td>
                  <td className="num">{S[r.comp]}</td>
                  <td><Progress value={r.pct} tone={r.pctTone} /></td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ===== 디자인 시스템 레퍼런스 ===== */}
      <div className="section-title">디자인 시스템 · 컴포넌트 (cipherdigital.com 언어)</div>
      <Card>
        <div className="card-body" style={{ display: 'grid', gap: 'var(--s4)' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Buttons</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary">＋ Primary</Button>
              <Button>Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" sm>Small</Button>
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Status Chips</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Chip tone="ok" pip>완료</Chip>
              <Chip tone="outline">진행중</Chip>
              <Chip tone="warn" pip>지연</Chip>
              <Chip tone="muted">예정</Chip>
              <Chip tone="info" pip>전송완료</Chip>
              <Chip tone="danger">마감초과</Chip>
            </div>
          </div>
          <div style={{ maxWidth: 420 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Progress</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Progress value={92} />
              <Progress value={64} tone="warn" />
              <Progress value={41} tone="danger" />
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Neutral ramp + Accent (hypergreen #abd233)</div>
            <div className="swatches">
              {RAMP.map((c) => (
                <div className="swatch" key={c}>
                  <div className="chipc" style={{ background: c }} />
                  <div className="nm">{c}</div>
                </div>
              ))}
              <div className="swatch">
                <div className="chipc" style={{ background: 'var(--accent)' }} />
                <div className="nm">#abd233</div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
