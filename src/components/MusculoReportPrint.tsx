// 근골격계부담작업 유해요인조사 결과보고서 — 인쇄용 (A4 세로) [105]
// 실물 양식(관기초등학교 완성본 PDF) 기준 재현: 표지(결재란) → 조사 개요 → 부담작업 체크리스트(파트별)
// → 조사 대상 공정 선정 산정표 → 유해요인 기본조사표(작업별) → 증상조사 결과 → 작업환경 개선계획서.
// 데이터는 보고서 작성 화면(1~6단계)의 입력을 그대로 사용 — 별도 작성 없음. 결재란은 대장 결재선 연동([104] 규칙).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { api } from '../lib/api'
import '../styles/riskreport.css'
import '../styles/musculoprint.css'

export type MpShot = { name: string; url?: string; cap?: string }
export type MpAnswers = { q2?: number; q3?: number; q4?: number }
export type MpPerson = {
  n: string; a: number; g: string; d: string; st: string
  res: string[] | null
  form?: { pain: number; parts: Record<string, MpAnswers> } | null
}
export type MpPlanRow = { src: string; part: string; target: string; problem: string; measure: string; due: string; owner: string }
export type MpPart = { key: string; name: string; jobs: string[] }

const BODY = ['목', '어깨', '팔/팔꿈치', '손/손목/손가락', '허리', '다리/발']
const JD: Record<string, string> = { 정상: 'ok', 관리대상자: 'mg', 통증호소자: 'pn' }
// 판정 — 공단 엑셀 수식과 동일 기준 (MusculoReport judge/overall과 같은 규칙)
function judge(a?: MpAnswers | null): string {
  if (!a || !a.q2 || !a.q3 || !a.q4) return '정상'
  const pain = a.q2 >= 3 && a.q4 >= 3 && a.q3 >= 3
  const mgmt = (a.q2 >= 3 || a.q4 >= 3) && a.q3 >= 2
  return pain ? '통증호소자' : mgmt ? '관리대상자' : '정상'
}
function overall(res: (string | null)[] | null): string | null {
  if (!res || res.some((r) => r === null)) return null
  if (res.includes('통증호소자')) return '통증호소자'
  if (res.includes('관리대상자')) return '관리대상자'
  return '정상'
}

const SCALE_A = ['매우 쉬움', '쉬움', '약간 힘듦', '힘듦', '매우 힘듦']
const SCALE_B = ['아주 가끔(2개월마다 1~2회)', '가끔(하루 또는 주 2~3일)', '자주(1일 4시간)', '계속(1일 4시간 이상)', '초과근무 시간(1일 8시간 이상)']

export function MusculoReportPrint(p: {
  sid: string
  schoolName: string
  date: string
  ho: [number, string][]
  parts: MpPart[]
  chk: Record<string, number[]>
  ab: Record<string, [number, number]>
  hz: Record<string, string[]>
  caps: Record<string, string>
  shots: Record<string, MpShot[]>
  cutN: Record<string, number>
  roster: MpPerson[]
  plan: MpPlanRow[]
  onClose: () => void
}) {
  const year = (p.date || '').slice(0, 4) || String(new Date().getFullYear())
  const month = (p.date || '').slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, '0')

  // [104] 결재란 — 대장 결재선 기준 칸 구성 (미조회 시 기본 3칸)
  const [appr, setAppr] = useState<{ title: string; name: string }[]>([
    { title: '담 당', name: '' }, { title: '행정실장', name: '' }, { title: '교 장', name: '' },
  ])
  useEffect(() => {
    if (!p.sid) return
    let alive = true
    api<{ steps: { title: string; name: string }[] }>(`/schools/${p.sid}/approval-line`)
      .then((r) => { if (alive && r?.steps?.length) setAppr(r.steps) })
      .catch(() => { /* 기본 3칸 유지 */ })
    return () => { alive = false }
  }, [p.sid])

  const active = p.parts.filter((pt) => (p.chk[pt.key] || []).some(Boolean))
  const hoOf = (pt: MpPart) => p.ho.filter((_, i) => (p.chk[pt.key] || [])[i]).map(([no]) => `제${no}호`).join(', ')
  // 작업의 세트 키 목록 (첫 세트는 원 키, 이후 #n — [095] 구조)
  const cutKeys = (k: string) => Array.from({ length: p.cutN[k] ?? 1 }, (_, c) => (c === 0 ? k : `${k}#${c}`))
  const jobHasData = (k: string) => cutKeys(k).some((kc) => (p.hz[kc]?.length || p.caps[kc] || p.shots[kc]?.length))

  // [107] 기본조사표 대상 작업 목록 (목차 페이지 번호 계산과 본문 렌더 공용)
  const basicJobs = active.flatMap((pt) => pt.jobs
    .filter((j) => { const k = `${pt.key}-${j}`; const [A, B] = p.ab[k] || [3, 3]; return A * B >= 12 || jobHasData(k) })
    .map((j) => ({ pt, j })))
  // [108] 페이지 번호 — 원본 페이지(목차~6장)가 -4-까지 표기하므로 데이터 섹션은 5부터 이어짐
  let pgSeq = 4
  const pgNum = () => <div className="mp-pgnum">- {++pgSeq} -</div>

  const approveTable = (
    <table className="rr-approve" style={{ top: 40, right: 46 }}>
      <tbody>
        <tr><td className="g" rowSpan={2}>결재</td>{appr.map((s) => <th key={s.title}>{s.title}</th>)}</tr>
        <tr>{appr.map((_, i) => <td key={i} />)}</tr>
      </tbody>
    </table>
  )

  return createPortal(
    <div className="rr-overlay">
      <style>{'@media print { @page { size: A4 portrait; margin: 0 } }'}</style>
      <div className="rr-toolbar">
        <b>근골격계 유해요인조사 보고서 — 인쇄 미리보기</b>
        <span style={{ fontSize: 12, opacity: 0.75 }}>인쇄 대화상자에서 "PDF로 저장"을 선택하면 보고서 파일이 만들어집니다</span>
        <span className="sp" />
        <button className="print" onClick={() => window.print()}><Printer size={14} style={{ verticalAlign: -2 }} /> 인쇄 / PDF 저장</button>
        <button className="close" onClick={p.onClose}><X size={14} style={{ verticalAlign: -2 }} /> 닫기</button>
      </div>

      {/* ═══ 표지 ═══ */}
      <div className="mp-page mp-cover">
        {approveTable}
        <div className="mp-cover-body">
          <span className="mp-badge">{year} 정기조사</span>
          <div className="mp-title">근골격계부담작업<br />유해요인조사</div>
          {/* [106] 완성본 표지 삽화 — public/musculo-cover.jpg (인쇄 시 함께 출력) */}
          <img className="mp-cover-art" src="/musculo-cover.jpg" alt="학교 현업종사자 안전 일러스트" />
          <div className="mp-cover-ym">{year}년 {month}월</div>
          <div className="mp-cover-school">{p.schoolName}</div>
        </div>
      </div>

      {/* ═══ 목차 · 1~6장 — 완성본 PDF 페이지 그대로 (public/musculo-p2~p6.jpg) [108] */}
      {[2, 3, 4, 5, 6].map((n) => (
        <div className="mp-page mp-imgpage" key={'orig' + n}>
          <img src={`/musculo-p${n}.jpg`} alt={`보고서 ${n}페이지`} />
        </div>
      ))}

      {/* ═══ 부담작업 체크리스트 — 파트별 ═══ */}
      {p.parts.map((pt) => (
        <div className="mp-page" key={'chk' + pt.key}>
          <div className="mp-h1">근골격계부담작업 체크리스트 — {pt.name}</div>
          <table className="mp-tbl">
            <tbody>
              <tr>
                <th style={{ width: 90 }}>사업장명</th><td>{p.schoolName}</td>
                <th style={{ width: 90 }}>조사일자</th><td>{p.date || '—'}</td>
              </tr>
              <tr>
                <th>공 정 명</th><td>{pt.name}</td>
                <th>조 사 자</th><td>한국산업안전협회</td>
              </tr>
              <tr><th>단위작업</th><td colSpan={3}>{pt.jobs.join(' · ')}</td></tr>
            </tbody>
          </table>
          <table className="mp-tbl" style={{ marginTop: 10 }}>
            <thead>
              <tr><th style={{ width: 54 }}>구분</th><th>부담작업 기준</th><th style={{ width: 60 }}>해당</th></tr>
            </thead>
            <tbody>
              {p.ho.map(([no, text], i) => (
                <tr key={no}>
                  <td className="c b">제{no}호</td>
                  <td dangerouslySetInnerHTML={{ __html: text }} />
                  <td className={'c b ' + ((p.chk[pt.key] || [])[i] ? 'mp-on' : 'mp-off')}>{(p.chk[pt.key] || [])[i] ? '○' : '×'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mp-note">
            판정 결과 — {(p.chk[pt.key] || []).some(Boolean)
              ? `부담작업 해당 (${hoOf(pt)}) → 작업조건 조사 대상`
              : '부담작업 해당 없음'}
          </div>
          {pgNum()}
        </div>
      ))}

      {/* ═══ 조사 대상 공정 선정 산정표 ═══ */}
      <div className="mp-page">
        <div className="mp-h1">조사 대상 공정 선정 — 작업부하·작업빈도 산정표 (근로자 면담)</div>
        <p className="mp-p">근로자 면담과 현장 관찰을 통해 공정별 작업부하와 작업빈도를 평가하였으며, 총점수(A×B)가 높은 작업을 유해요인 기본조사 대상으로 선정한다.</p>
        <table className="mp-tbl">
          <thead>
            <tr><th style={{ width: 110 }}>공정</th><th>작업내용</th><th style={{ width: 90 }}>작업 부하(A)</th><th style={{ width: 90 }}>작업 빈도(B)</th><th style={{ width: 90 }}>총점수(A×B)</th><th style={{ width: 110 }}>유해요인조사</th></tr>
          </thead>
          <tbody>
            {active.length === 0 && <tr><td colSpan={6} className="c">부담작업 해당 공정이 없습니다.</td></tr>}
            {active.flatMap((pt) => pt.jobs.map((j, ji) => {
              const k = `${pt.key}-${j}`
              const [A, B] = p.ab[k] || [3, 3]
              const t = A * B
              return (
                <tr key={k}>
                  {ji === 0 && <td className="c b" rowSpan={pt.jobs.length}>{pt.name}</td>}
                  <td>{j}</td>
                  <td className="c">{A} <small>({SCALE_A[A - 1] || ''})</small></td>
                  <td className="c">{B} <small>({(SCALE_B[B - 1] || '').split('(')[0]})</small></td>
                  <td className="c b">{t}</td>
                  <td className="c">{t >= 12 ? '√' : ''}</td>
                </tr>
              )
            }))}
          </tbody>
        </table>
        <div className="mp-note">작업 부하(A): 매우 쉬움 1 ~ 매우 힘듦 5 · 작업 빈도(B): 아주 가끔 1 ~ 초과근무 시간 5 · 총점 12점 이상 작업을 조사 대상(√)으로 선정</div>
        {pgNum()}
      </div>

      {/* ═══ 유해요인 기본조사표 — 대상 작업별 ═══ */}
      {basicJobs.map(({ pt, j }) => {
        const k = `${pt.key}-${j}`
        const [A, B] = p.ab[k] || [3, 3]
        return (
          <div className="mp-page" key={'basic' + k}>
            <div className="mp-h1">유해요인 기본조사표 — {j}</div>
            <table className="mp-tbl">
              <tbody>
                <tr>
                  <th style={{ width: 100 }}>조사구분</th><td>■ 정기조사 &nbsp; □ 수시조사(질환자 발생 · 신규 작업/설비 · 작업환경 변경)</td>
                </tr>
                <tr><th>조사일자</th><td>{p.date || '—'} &nbsp;&nbsp;&nbsp; <b>조사자</b> &nbsp; 한국산업안전협회</td></tr>
                <tr><th>작업공정명</th><td>{pt.name}</td></tr>
                <tr><th>작 업 명</th><td className="b">{j}</td></tr>
              </tbody>
            </table>

            <div className="mp-h2">가. 작업장 상황 조사</div>
            <table className="mp-tbl">
              <tbody>
                {['작업설비', '작업량', '작업속도', '업무변화'].map((lab) => (
                  <tr key={lab}><th style={{ width: 100 }}>{lab}</th><td>■ 변화 없음 &nbsp; □ 변화 있음 / 줄음 / 늘어남 (언제부터: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
                ))}
              </tbody>
            </table>

            <div className="mp-h2">나. 작업조건 조사 (근로자 면담)</div>
            <table className="mp-tbl">
              <thead>
                <tr><th>작업내용</th><th style={{ width: 110 }}>작업 부하(A)</th><th style={{ width: 110 }}>작업 빈도(B)</th><th style={{ width: 100 }}>총점수(A×B)</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{j}</td>
                  <td className="c">{A} ({SCALE_A[A - 1] || ''})</td>
                  <td className="c">{B} ({(SCALE_B[B - 1] || '').split('(')[0]})</td>
                  <td className="c b">{A * B}</td>
                </tr>
              </tbody>
            </table>

            <div className="mp-h2">다. 유해요인평가 (부담작업 {hoOf(pt) || '—'})</div>
            {cutKeys(k).map((kc, ci) => {
              const shotList = (p.shots[kc] || []).filter((s) => s.url)
              const on = p.hz[kc] || []
              const cap = p.caps[kc] || ''
              if (!shotList.length && !on.length && !cap) return null
              return (
                <div key={kc} className="mp-cut">
                  {shotList.length > 0 && (
                    <div className="mp-shots">
                      {shotList.map((s, i) => (
                        <figure key={i}>
                          <img src={s.url} alt={s.name} />
                          {(s.cap || s.name) && <figcaption>{s.cap || s.name}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  )}
                  <table className="mp-tbl">
                    <tbody>
                      <tr><th style={{ width: 100 }}>단위작업명</th><td>{j}{cutKeys(k).length > 1 ? ` (${ci + 1})` : ''}</td></tr>
                      <tr><th>유해요인</th><td>{on.length ? on.join(', ') : '—'}</td></tr>
                      <tr><th>발생 원인</th><td>{cap || '—'}</td></tr>
                    </tbody>
                  </table>
                </div>
              )
            })}
            {!jobHasData(k) && <div className="mp-note">작성된 유해요인평가(사진·요인·설명)가 없습니다 — 보고서 작성 3단계에서 입력하세요.</div>}
            {pgNum()}
          </div>
        )
      })}

      {/* ═══ 증상조사 결과 ═══ */}
      <div className="mp-page">
        <div className="mp-h1">근골격계질환 증상조사표 (결과)</div>
        <table className="mp-tbl mp-sym">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th><th style={{ width: 76 }}>성명</th><th style={{ width: 40 }}>연령</th>
              <th style={{ width: 52 }}>성별</th><th>부서 · 작업</th>
              {BODY.map((b) => <th key={b}>{b}</th>)}
              <th>전체</th>
            </tr>
          </thead>
          <tbody>
            {p.roster.length === 0 && <tr><td colSpan={6 + BODY.length} className="c">작성된 증상조사표가 없습니다.</td></tr>}
            {p.roster.map((ps, i) => {
              const per: (string | null)[] = ps.st === 'done' && ps.form
                ? BODY.map((b) => (ps.form!.pain === 2 ? judge(ps.form!.parts[b]) : '정상'))
                : BODY.map((_, j) => ps.res?.[j] ?? null)
              const ov = overall(per)
              return (
                <tr key={i}>
                  <td className="c">{i + 1}</td>
                  <td className="b">{ps.n || '—'}</td>
                  <td className="c">{ps.a || '—'}</td>
                  <td className="c">{ps.g === '남' ? '남(1)' : ps.g === '여' ? '여(2)' : '—'}</td>
                  <td>{ps.d || '—'}</td>
                  {per.map((r, j) => <td className={'c ' + (r ? 'mp-' + JD[r] : '')} key={j}>{r ?? '—'}</td>)}
                  <td className={'c b ' + (ov ? 'mp-' + JD[ov] : '')}>{ov ?? '미작성'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mp-note">
          판정 기준 — <b>관리대상자</b>: 통증기간 1주일 이상(또는 1달 1회 이상 발생)이면서 통증강도 '중간' 이상 ·{' '}
          <b>통증호소자</b>: 통증기간 1주일 이상 <i>그리고</i> 1달 1회 이상 발생 <i>그리고</i> '심한' 이상.
          본 평가 결과는 의학적 관리나 법률적 판단 등의 기준 및 근거자료로 사용되기 힘듦을 알려드립니다.
        </div>
        {pgNum()}
      </div>

      {/* ═══ 작업환경 개선계획서 ═══ */}
      <div className="mp-page">
        <div className="mp-h1">작업환경 개선계획서</div>
        <table className="mp-tbl mp-plan">
          <thead>
            <tr>
              <th style={{ width: 70 }}>공정명</th><th style={{ width: 90 }}>작업명</th>
              <th>문제점 (유해요인 원인)</th><th>개선방안</th>
              <th style={{ width: 66 }}>추진일정</th><th style={{ width: 60 }}>담당</th>
            </tr>
          </thead>
          <tbody>
            {p.plan.length === 0 && <tr><td colSpan={6} className="c">작성된 개선계획이 없습니다 — 보고서 작성 6단계에서 입력하세요.</td></tr>}
            {p.plan.map((r, i) => (
              <tr key={i}>
                <td className="c">{r.part || r.src || '—'}</td>
                <td>{r.target || '—'}</td>
                <td>{r.problem || '—'}</td>
                <td>{r.measure || '—'}</td>
                <td className="c">{r.due || '즉시'}</td>
                <td className="c">{r.owner || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mp-note">본 보고서는 학교안전 통합 플랫폼에서 작성한 근골격계 유해요인조사 데이터로 자동 생성되었습니다. — {year}년 {month}월 · {p.schoolName} · 한국산업안전협회</div>
        {pgNum()}
      </div>
    </div>,
    document.body,
  )
}
