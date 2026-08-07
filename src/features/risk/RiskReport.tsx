// 정기 위험성평가 결과보고서 — 인쇄용 출력 (0806 요청).
// ①~⑤ 탭에서 작성한 데이터 + 표지·경영방침·PART 2 고정 텍스트를 실물 보고서(A4 가로) 형태로 조립.
// 브라우저 인쇄(Ctrl+P) → "PDF로 저장"으로 최종 산출물 생성. document.body 포탈로 렌더(인쇄 시 앱 UI 숨김).
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import type { DeptInfoDoc, DeptInfo } from './DeptHazardInfo'
import type { AssessDoc, BehaviorDoc, StateDoc } from './AssessmentTable'
import { riskLabel } from './AssessmentTable'
import type { ReportInfoData } from './ReportInfo'
import { emptyReportInfo } from './ReportInfo'
import type { ParticipantRow } from './Participants'
import '../../styles/riskreport.css'

const PARTS: [string, string][] = [
  ['catering', '급식'], ['facility', '시설관리'], ['cleaning', '미화'], ['commute', '통학'], ['night_duty', '당직'],
]
const pl = (k: string) => PARTS.find(([p]) => p === k)?.[1] ?? k
const bx = (on: boolean) => (on ? '■' : '□')

export type ReportData = {
  report_info?: ReportInfoData
  dept_info?: DeptInfoDoc
  assess?: AssessDoc
  reduce_behavior?: BehaviorDoc
  reduce_state?: StateDoc
  participants?: ParticipantRow[]
}

export function RiskReport(p: { schoolName: string; data: ReportData; onClose: () => void }) {
  const info = p.data.report_info ?? emptyReportInfo()
  const year = info.report_ym.slice(0, 4) || String(new Date().getFullYear())
  const ym = info.report_ym

  const deptParts = PARTS.filter(([k]) => p.data.dept_info?.[k])
  const assessParts = PARTS.filter(([k]) => (p.data.assess?.[k]?.length ?? 0) > 0)
  const behaviorParts = PARTS.filter(([k]) => (p.data.reduce_behavior?.[k]?.length ?? 0) > 0)
  const stateParts = PARTS.filter(([k]) => (p.data.reduce_state?.[k]?.length ?? 0) > 0)
  const participants = p.data.participants ?? []

  return createPortal(
    <div className="rr-overlay">
      <div className="rr-toolbar">
        <b>정기 위험성평가 결과보고서 — 인쇄 미리보기</b>
        <span style={{ fontSize: 12, opacity: 0.75 }}>인쇄 대화상자에서 "PDF로 저장"을 선택하면 보고서 파일이 만들어집니다 (배경 그래픽 인쇄 켜기 권장)</span>
        <span className="sp" />
        <button className="print" onClick={() => window.print()}><Printer size={14} style={{ verticalAlign: -2 }} /> 인쇄 / PDF 저장</button>
        <button className="close" onClick={p.onClose}><X size={14} style={{ verticalAlign: -2 }} /> 닫기</button>
      </div>

      {/* ═══ 표지 ═══ */}
      <div className="rr-page rr-cover">
        <table className="rr-approve">
          <tbody>
            <tr><td className="g" rowSpan={2}>결재</td><th>담 당</th><th>행정실장</th><th>교 장</th></tr>
            <tr><td /><td /><td /></tr>
          </tbody>
        </table>
        <div className="school">{p.schoolName}</div>
        <div><span className="year">{year}</span></div>
        <div className="title">정기 위험성평가<br />결과보고서</div>
        <div className="ym">{ym}</div>
        <div className="wave" />
      </div>

      {/* ═══ 안전보건 경영방침 ═══ */}
      <div className="rr-page">
        <div className="rr-center-title">전라남도교육청 안전보건 경영방침</div>
        <p style={{ fontSize: 13, lineHeight: 2 }}>
          전라남도교육청은 구성원의 안전을 최우선 가치로 하며, 철저한 책임의식과 적극적 의무이행으로 위험요인에 대한
          지속적인 개선을 통해 「무재해 교육현장」을 구축하기 위해 다음 사항을 성실히 수행한다.
        </p>
        <div style={{ fontSize: 13, lineHeight: 2.4, marginTop: 18 }}>
          <div><b>첫&nbsp;&nbsp;째</b>&emsp;모든 교육활동에 있어서 구성원의 안전과 보건 확보를 최우선으로 고려한다.</div>
          <div><b>둘&nbsp;&nbsp;째</b>&emsp;안전·보건 관계 법령 및 제반 규정을 철저하게 준수한다.</div>
          <div><b>셋&nbsp;&nbsp;째</b>&emsp;구성원의 체계적인 안전·보건 교육을 통해 성숙한 안전문화 정착을 추진한다.</div>
          <div><b>넷&nbsp;&nbsp;째</b>&emsp;교육환경의 잠재적인 유해·위험요인을 발굴·제거하고, 교직원의 건강증진 및 근로환경의 지속적인 개선을 위해 적극 노력한다.</div>
          <div><b>다섯째</b>&emsp;구성원의 의견을 경청하여 안전사고 예방 및 개선대책 마련에 반영하도록 노력하고 결정된 사항은 적극적으로 실천한다.</div>
        </div>
      </div>

      {/* ═══ 목차 ═══ */}
      <div className="rr-page">
        <div className="rr-toc">
          <div className="badge">Contents</div>
          <div>
            <div className="part">
              <div className="pt"><span>PART 1&ensp;학교 현황</span><span>01</span></div>
              <div className="it"><span><span className="no">1</span>학교 현황</span><span>01</span></div>
              <div className="it"><span><span className="no">2</span>재해발생 현황</span><span>01</span></div>
            </div>
            <div className="part">
              <div className="pt"><span>PART 2&ensp;위험성평가 개요</span><span>02</span></div>
              <div className="it"><span><span className="no">1</span>위험성평가 실시규정</span><span>02</span></div>
              <div className="it"><span><span className="no">2</span>위험성평가 실시근거</span><span>04</span></div>
            </div>
            <div className="part">
              <div className="pt"><span>PART 3&ensp;위험성평가 실시</span><span>05</span></div>
              <div className="it"><span><span className="no">1</span>유해위험정보</span><span>05</span></div>
              <div className="it"><span><span className="no">2</span>위험성평가표</span><span>06</span></div>
              <div className="it"><span><span className="no">3</span>위험성 감소대책 (불안전한 행동)</span><span>07</span></div>
              <div className="it"><span><span className="no">4</span>위험성 감소대책 (불안전한 상태)</span><span>08</span></div>
              <div className="it"><span><span className="no">5</span>위험성평가 참여자</span><span>09</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PART 1 학교 현황 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 1&ensp;학교 현황</div>
        <div className="rr-h2">1-1 학교 현황</div>
        <table className="rr-tbl rr-kv">
          <tbody>
            <tr><th>학 교 명</th><td>{p.schoolName}</td></tr>
            <tr><th>학 교 장</th><td>{info.principal}</td></tr>
            <tr><th>소 재 지</th><td>{info.address}</td></tr>
            <tr><th>현업종사원 수</th><td>{info.worker_total}명</td></tr>
            <tr><th>업 종</th><td>{info.industry}</td></tr>
            <tr><th>위험성평가 구성원</th><td>{info.members}</td></tr>
            <tr><th>평 가 기 간</th><td>{info.period}</td></tr>
            <tr><th>평 가 자</th><td>{info.assessors}</td></tr>
          </tbody>
        </table>
        <div className="rr-h2" style={{ marginTop: 22 }}>1-2 재해발생 현황</div>
        <table className="rr-tbl">
          <thead>
            <tr>
              <th rowSpan={2}>구분(년도)</th><th rowSpan={2}>현업종사원 수</th>
              <th colSpan={4}>재해자수(명)</th><th rowSpan={2}>재해율(%)</th>
            </tr>
            <tr><th>질병</th><th>부상</th><th>사망</th><th>계</th></tr>
          </thead>
          <tbody>
            {info.acc_years.map((r, i) => {
              const total = (Number(r.disease) || 0) + (Number(r.injury) || 0) + (Number(r.death) || 0)
              const w = Number(r.workers) || 0
              return (
                <tr key={i}>
                  <td className="c"><b>{r.year}</b></td><td className="c">{r.workers}</td>
                  <td className="c">{r.disease}</td><td className="c">{r.injury}</td><td className="c">{r.death}</td>
                  <td className="c">{total}</td><td className="c">{w > 0 ? Math.round((total / w) * 1000) / 10 : 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="pageno">- 1 -</div>
      </div>

      {/* ═══ PART 2 (1/3) 실시규정 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 2&ensp;위험성평가 개요</div>
        <div className="rr-h2">2-1 위험성평가 실시규정</div>
        <div className="rr-2col">
          <div>
            <div className="rr-art"><b>제1조(목적)</b> 이 실시규정은 우리 학교 전체의 유해·위험요인을 파악하고, 그 유해·위험요인별 위험성의 수준을 결정한 후 위험성을 감소시키기 위해 필요한 조치를 마련하여 실시함을 목적으로 한다. 이 규정에서 정하지 않은 사항에 대해서는 고용노동부의 「사업장 위험성평가에 관한 지침」 및 「새로운 위험성평가 안내서」를 적용한다.</div>
            <div className="rr-art"><b>제2조(적용)</b> 이 실시규정은 우리 학교에서 현업종사자가 수행하는 모든 작업, 설비 및 공정의 위험성평가에 대한 범위, 절차, 책임과 권한에 대하여 적용한다.</div>
            <div className="rr-art"><b>제3조(조직의 구성)</b> 위험성평가 실시 담당 조직은 안전보건관리책임자(사업주 또는 공장장), 위험성평가 담당자, 관리감독자, 근로자(각 부서원)로 구성한다.</div>
            <div className="rr-art"><b>제6조(실시시기)</b> ① 최초평가: 처음으로 실시하는 위험성평가 — 전체 사업장의 모든 작업 대상. ② 정기평가: 최초평가 실시일부터 1년이 되는 날 이전까지 실시하고, 이후 매 1년마다 매년 실시(빠진 유해·위험요인, 위험성결정의 적정성, 기존 감소대책의 유지 여부 점검). ③ 수시평가: 해당 작업 개시(재개) 전 — 중대산업사고·산업재해 발생 시, 작업장 변경 시, 건물·기계·기구·설비 정비 또는 보수 작업 시.</div>
            <div className="rr-art"><b>제7조(실시원칙)</b> 사업주(관리감독자)가 실시를 총괄 관리하고, 전담직원 지정 등 체제를 구축하며, 관리감독자가 유해·위험요인을 파악하고 개선조치를 실행한다. 전체 과정에 근로자의 참여를 보장하고, 결과는 게시 등을 통해 전체 근로자에게 알린다.</div>
          </div>
          <div>
            <table className="rr-tbl">
              <thead><tr><th style={{ width: 130 }}>조직</th><th>역할과 책임(권한)</th></tr></thead>
              <tbody>
                <tr><td className="c"><b>안전보건관리책임자</b></td><td>위험성평가의 총괄 관리 · 안전보건방침과 추진목표 문서화·게시 · 조직구성과 역할 부여 · 예산지원 및 산업재해예방 노력</td></tr>
                <tr><td className="c"><b>관리감독자</b></td><td>유해·위험요인을 빠짐없이 파악하고 위험성 결정 · 위험성 감소대책의 수립 및 실행 · 책임과 권한 인지 및 이행</td></tr>
                <tr><td className="c"><b>근로자(작업자)</b></td><td>담당업무 관련 위험성평가 전 과정 참여 · 안전보건수칙 및 감소대책 확인 · 아차사고 사례의 적극적 제보</td></tr>
                <tr><td className="c"><b>위험성평가담당자</b></td><td>위험성평가의 실행 관리 및 지원 · 실시규정 수립·실행 · 안전보건정보 수집 및 기록 유지 · 검토 및 결과 기록·보관</td></tr>
              </tbody>
            </table>
            <div className="rr-note-box">
              <b>제8조(추진절차)</b> 위험성평가는 <span className="em">[1단계] 사전준비 ⇒ [2단계] 유해·위험요인 파악 ⇒ [3단계] 위험성결정 ⇒ [4단계] 위험성 감소대책 수립 및 실행 ⇒ [5단계] 공유·기록</span>의 절차에 따라 실시한다.
              위험성평가는 1회성으로 완료되는 것이 아니므로, 위험성이 허용 가능한 수준이 될 때까지 반복한다.
            </div>
          </div>
        </div>
        <div className="pageno">- 2 -</div>
      </div>

      {/* ═══ PART 2 (2/3) 가능성·중대성 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 2&ensp;위험성평가 개요</div>
        <div className="rr-2col">
          <div>
            <div className="rr-note-box" style={{ marginTop: 0 }}>
              <b>위험성(Risk) = 사고발생의 가능성 × 사고결과의 중대성</b><br />
              ※ 위험성 추정은 가능성(표 3)과 중대성(표 4)을 곱하여 산출한다. <b>제9조(위험성평가의 방법)</b> 우리 학교의 위험성평가 방법은 빈도·강도법을 사용한다.
            </div>
            <div className="rr-h2">&lt;표 3&gt; 가능성(빈도) 등급 1~5단계</div>
            <table className="rr-tbl">
              <thead><tr><th>구분</th><th>가능성</th><th style={{ width: 34 }}>값</th><th>내용</th></tr></thead>
              <tbody>
                <tr><td className="c">최상</td><td className="c">매우높음</td><td className="c">5</td><td>피해가 발생할 가능성이 매우 높음 — 안전대책 미비, 안전수칙·작업표준 없음</td></tr>
                <tr><td className="c">상</td><td className="c">높음</td><td className="c">4</td><td>피해가 발생할 가능성이 높음 — 안전장치 미설치 또는 상당한 불비</td></tr>
                <tr><td className="c">중</td><td className="c">보통</td><td className="c">3</td><td>부주의하면 피해가 발생할 가능성이 있음 — 일부 준수 어려운 점 있음</td></tr>
                <tr><td className="c">하</td><td className="c">낮음</td><td className="c">2</td><td>피해가 발생할 가능성이 낮음 — 안전장치·수칙 정비, 준수 쉬움</td></tr>
                <tr><td className="c">최하</td><td className="c">매우낮음</td><td className="c">1</td><td>피해가 발생할 가능성이 매우 낮음 — 전반적으로 안전조치가 잘 되어 있음</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="rr-h2" style={{ marginTop: 0 }}>&lt;표 4&gt; 중대성(강도) 등급 1~4단계</div>
            <table className="rr-tbl">
              <thead><tr><th>구분</th><th>중대성</th><th style={{ width: 34 }}>값</th><th>기준</th></tr></thead>
              <tbody>
                <tr><td className="c">최대</td><td className="c">사망(장애발생)</td><td className="c">4</td><td>사망 또는 영구적 근로불능, 장애가 남는 부상·질병</td></tr>
                <tr><td className="c">대</td><td className="c">휴업 필요 부상/질병</td><td className="c">3</td><td>휴업을 수반하는 중대한 부상·질병 (복귀 가능)</td></tr>
                <tr><td className="c">중</td><td className="c">휴업 불필요 부상/질병</td><td className="c">2</td><td>응급조치 이상의 치료가 필요하지만 휴업이 수반되지 않는 부상·질병</td></tr>
                <tr><td className="c">소</td><td className="c">비치료</td><td className="c">1</td><td>처치(치료) 후 바로 원래 작업 수행 가능한 경미한 부상·질병</td></tr>
              </tbody>
            </table>
            <div className="rr-h2">&lt;표 5&gt; 위험성 크기(값) 추정</div>
            <table className="rr-tbl">
              <thead><tr><th>가능성＼중대성</th><th>최대(4)</th><th>대(3)</th><th>중(2)</th><th>소(1)</th></tr></thead>
              <tbody>
                <tr><th>최상(5)</th><td className="rr-r">매우높음(20)</td><td className="rr-r">높음(15)</td><td className="rr-o">약간높음(10)</td><td className="rr-g">낮음(5)</td></tr>
                <tr><th>상(4)</th><td className="rr-r">매우높음(16)</td><td className="rr-o">약간높음(12)</td><td className="rr-y">보통(8)</td><td className="rr-g">낮음(4)</td></tr>
                <tr><th>중(3)</th><td className="rr-o">약간높음(12)</td><td className="rr-o">약간높음(9)</td><td className="rr-g">낮음(6)</td><td className="rr-b">매우낮음(3)</td></tr>
                <tr><th>하(2)</th><td className="rr-y">보통(8)</td><td className="rr-g">낮음(6)</td><td className="rr-g">낮음(4)</td><td className="rr-b">매우낮음(2)</td></tr>
                <tr><th>최하(1)</th><td className="rr-g">낮음(4)</td><td className="rr-b">매우낮음(3)</td><td className="rr-b">매우낮음(2)</td><td className="rr-b">매우낮음(1)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="pageno">- 3 -</div>
      </div>

      {/* ═══ PART 2 (3/3) 허용여부·실시근거 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 2&ensp;위험성평가 개요</div>
        <div className="rr-2col">
          <div>
            <div className="rr-h2" style={{ marginTop: 0 }}>&lt;표 6&gt; 곱하기 방법으로 계산된 위험성 크기(값)에 따른 위험성</div>
            <table className="rr-tbl">
              <thead><tr><th>위험성 크기</th><th /><th>허용가능 여부</th><th>개선 방법</th></tr></thead>
              <tbody>
                <tr><td className="c">16~20</td><td className="c">매우 높음</td><td className="c" rowSpan={4}>허용 불가능</td><td><b>즉시 개선</b> — 즉시 작업 중지</td></tr>
                <tr><td className="c">15</td><td className="c">높음</td><td><b>신속하게 개선</b> — 긴급 안전보건대책 수립 필요</td></tr>
                <tr><td className="c">9~12</td><td className="c">약간 높음</td><td><b>가급적 빨리 개선</b></td></tr>
                <tr><td className="c">8</td><td className="c">보통</td><td><b>계획적으로 개선</b> — 안전보건표지 부착, 작업절차서 표기 등 관리적 대책</td></tr>
                <tr><td className="c">4~6</td><td className="c">낮음</td><td className="c" rowSpan={2}>허용 가능</td><td><b>필요에 따라 개선</b> — 안전보건정보 제공 및 주기적인 안전보건교육 실시</td></tr>
                <tr><td className="c">1~3</td><td className="c">매우 낮음</td><td>현재의 안전대책 유지</td></tr>
              </tbody>
            </table>
            <div className="rr-art" style={{ marginTop: 14 }}><b>제10조(위험성의 수준 판단 기준)</b> 위험성 수준과 그 판단 기준은 사업주·위험성평가 담당자·근로자들이 모인 최초·정기 위험성평가 착수회의 등을 통해 결정한다.</div>
            <div className="rr-art"><b>제11조(근로자에 대한 공유)</b> 잘 볼 수 있는 곳에 결과 게시, 안전보건교육 내용에 포함, 작업 전 안전점검회의 시 위험성평가 내용 포함.</div>
            <div className="rr-art"><b>제12조(근로자의 참여 방법)</b> 위험성평가 대상 작업(공정)의 모든 과정에 근로자 1명 이상 참여하도록 한다.</div>
          </div>
          <div>
            <div className="rr-note-box" style={{ marginTop: 0 }}>
              <b>[감소대책 수립 시 주의사항]</b><br />
              1. 새로운 위험성의 유무를 확인하고 감소조치 전의 위험성보다 커지지 않는가를 확인<br />
              2. 작업자의 판단·행동에만 의존하는 대책, 위험성 감소의 근거가 불분명한 조치로 위험성을 낮게 판단하고 있지 않은가를 확인<br />
              3. 작업성·생산성에 지장이 없는지, 품질에 문제가 없는지 등을 의견청취에 의해 작업자에게 확인<br />
              4. 각 단계에서는 현장에서의 노하우, 아이디어를 적극적으로 활용
            </div>
            <div className="rr-art" style={{ marginTop: 14 }}><b>제13조(유의사항)</b> 담당자는 유해·위험요인들이 산업안전보건법 기타 요구사항에 적합한 상태인지를 확인하고 미달 시 위험성 수준이 높은 것부터 우선적으로 감소대책을 반영하여 개선한다.</div>
            <div className="rr-art"><b>제14조(점검 및 개선활동)</b> 이행 점검 결과 미이행 사항이나 추가적 유해·위험요인이 발견된 경우 시정조치를 하며, 차기 위험성평가에 반영한다.</div>
            <div className="rr-art"><b>제15조(기록)</b> 기록은 출력하여 사업주(관리감독자)에게 승인을 받고 3년 이상 보관하며, 연 1회 정도 정기적으로 검토한다.</div>
            <div className="rr-h2">2-2 위험성평가 실시근거</div>
            <div>① 산업안전보건법 제36조(위험성평가)<br />② 사업장 위험성평가에 관한 지침(고용노동부 고시 제2023-19호, 2023. 05. 22)</div>
          </div>
        </div>
        <div className="pageno">- 4 -</div>
      </div>

      {/* ═══ PART 3 · 3-1 유해위험정보 (부서별 1쪽씩) ═══ */}
      {deptParts.map(([k, label]) => (
        <DeptInfoPage key={k} label={label} info={p.data.dept_info![k]} />
      ))}

      {/* ═══ 3-2 위험성평가표 안내 + 부서별 평가표 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 3&ensp;위험성평가 실시</div>
        <div className="rr-h2">3-2 위험성 평가표</div>
        <div className="rr-note-box">
          본 위험성평가의 위험도 산출시<br /><br />
          ① 3대 사고유형인 추락, 끼임, 부딪힘 및 8대 위험요인 중 학교(기관)에서 발생 가능한 <span className="em">추락, 사다리작업(고소)</span>은 높은 위험도로 관리<br />
          ② 과년도 학교 급식실 산재사고는 넘어짐, 화상, 근골격계질환, 절단/베임, 끼임 순으로 조사되어 <span className="em">넘어짐, 화상, 근골격계질환</span>은 높은 위험도로 관리<br />
          ③ 과거 산재사고 발생 이력(항목)은 높은 위험도로 관리
        </div>
        {assessParts.length === 0 && <div style={{ marginTop: 20, color: '#888' }}>작성된 평가표가 없습니다 — ④ 탭에서 공정별 평가표를 작성하세요.</div>}
        <div className="pageno">- 5 -</div>
      </div>
      {assessParts.map(([k, label]) => (
        <div className="rr-page" key={k}>
          <div className="rr-h2" style={{ marginTop: 0 }}>[정기평가] 위험성평가 <span className="note">공정명: {label}</span></div>
          <table className="rr-tbl">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: 26 }}>연번</th><th rowSpan={2}>세부작업명</th>
                <th colSpan={2}>유해위험요인 파악</th>
                <th rowSpan={2}>위험발생 상황 및 결과</th><th rowSpan={2}>현재의 안전보건조치</th>
                <th colSpan={3}>현재위험성</th>
                <th rowSpan={2}>위험성 감소대책</th><th rowSpan={2} style={{ width: 46 }}>개선후 위험성</th>
                <th rowSpan={2} style={{ width: 64 }}>개선 예정일</th><th rowSpan={2} style={{ width: 64 }}>완료일</th><th rowSpan={2} style={{ width: 50 }}>담당자</th>
              </tr>
              <tr><th style={{ width: 74 }}>위험분류</th><th style={{ width: 96 }}>법적근거</th><th style={{ width: 34 }}>가능성</th><th style={{ width: 34 }}>중대성</th><th style={{ width: 54 }}>위험성</th></tr>
            </thead>
            <tbody>
              {(p.data.assess?.[k] ?? []).map((r, i) => {
                const score = r.likelihood * r.severity
                return (
                  <tr key={r.id}>
                    <td className="c">{i + 1}</td><td>{r.task}</td><td className="c">{r.factor_class}</td><td>{r.legal_basis}</td>
                    <td>{r.situation}</td><td>{r.measure_current}</td>
                    <td className="c">{r.likelihood}</td><td className="c">{r.severity}</td>
                    <td className="hl">{score} · {riskLabel(score).label}</td>
                    <td>{r.reduction}</td><td className="c">{r.after_risk}</td>
                    <td className="c">{r.plan_date}</td><td className="c">{r.done_date}</td><td className="c">{r.owner}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="pageno">- 6 -</div>
        </div>
      ))}

      {/* ═══ 3-3 감소대책 (불안전한 행동) ═══ */}
      {behaviorParts.map(([k, label]) => (
        <div className="rr-page" key={k}>
          <div className="rr-h1">PART 3&ensp;위험성평가 실시</div>
          <div className="rr-h2">3-3 위험성 감소대책 (불안전한 행동) <span className="note">(3-2 위험성평가표 내의 위험성크기가 8점 이상인 불안전한 행동 항목)</span></div>
          <table className="rr-tbl">
            <thead>
              <tr><th style={{ width: 110 }}>개선대상<br />공정(작업)명</th><td className="c" style={{ fontWeight: 800 }}>{label}</td><th colSpan={5} style={{ fontSize: 14 }}>위험성 감소대책 (불안전한 행동)</th></tr>
              <tr>
                <th>감소대책 수립<br />단위작업명</th><th style={{ width: 80 }}>재해 형태</th><th>감소대책 (위험성평가표 감소대책보다 구체적으로 제시)</th>
                <th style={{ width: 64 }}>조치결과</th><th style={{ width: 72 }}>조치일자</th><th style={{ width: 90 }}>교육</th><th style={{ width: 56 }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {(p.data.reduce_behavior?.[k] ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="c">{r.task}</td><td className="c">{r.accident_type}</td><td style={{ whiteSpace: 'pre-wrap' }}>{r.measure}</td>
                  <td className="c">{r.result}</td><td className="c">{r.result_date}</td><td className="c">{r.education}</td><td className="c">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pageno">- 7 -</div>
        </div>
      ))}

      {/* ═══ 3-4 감소대책 (불안전한 상태) ═══ */}
      {stateParts.map(([k, label]) => (
        <div className="rr-page" key={k}>
          <div className="rr-h1">PART 3&ensp;위험성평가 실시</div>
          <div className="rr-h2">3-4 위험성 감소대책 (불안전한 상태) <span className="note">(3-2 위험성평가표 내용 중 위험성 크기가 8점 이상(또는 개선필요항목)인 불안전한 상태 개선 항목)</span></div>
          <table className="rr-tbl">
            <thead>
              <tr><th style={{ width: 110 }}>개선대상<br />작업(공정)명</th><td className="c" style={{ fontWeight: 800 }}>{label}</td><th colSpan={7} style={{ fontSize: 14 }}>위험성 감소대책 (불안전한 상태)</th></tr>
              <tr>
                <th>감소대책 수립<br />단위작업 명</th><th style={{ width: 76 }}>사고 유형</th><th>위험성 감소대책 상세내용</th>
                <th style={{ width: 56 }}>조치결과</th><th style={{ width: 68 }}>조치기한</th><th style={{ width: 64 }}>조치담당자</th><th style={{ width: 68 }}>조치완료일</th>
                <th style={{ width: 110 }}>개선 전</th><th style={{ width: 110 }}>개선 후</th>
              </tr>
            </thead>
            <tbody>
              {(p.data.reduce_state?.[k] ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="c">{r.task}</td><td className="c">{r.accident_type}</td><td style={{ whiteSpace: 'pre-wrap' }}>{r.detail}</td>
                  <td className="c">{r.result}</td><td className="c">{r.due}</td><td className="c">{r.owner}</td><td className="c">{r.done_date}</td>
                  <td className="rr-photo-cell">{r.photo_before ? `사진: ${r.photo_before}` : '(개선 전 사진)'}</td>
                  <td className="rr-photo-cell">{r.photo_after ? `사진: ${r.photo_after}` : '(개선 후 사진)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pageno">- 8 -</div>
        </div>
      ))}

      {/* ═══ 3-5 참여자 ═══ */}
      <div className="rr-page">
        <div className="rr-h1">PART 3&ensp;위험성평가 실시</div>
        <div className="rr-h2">3-5 위험성평가 참여자 (시작회의 및 위험성평가 교육·평가결과 교육)</div>
        <p style={{ fontSize: 11, color: '#444' }}>
          본 참여자 서명지는 산업안전보건법 제36조 2항에 따라 우리 학교(기관)의 위험성평가 시 소속된 근로자를 참여시키고,
          작업 시 발생할 수 있는 잠재된 유해·위험요인 및 감소대책 수립·실행에 대하여 근로자의 의견을 충분히 반영하기 위하여 자료로 활용하도록 한다.
        </p>
        <table className="rr-tbl">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 34 }}>구분</th><th rowSpan={2} style={{ width: 110 }}>소속공정(부서)</th><th rowSpan={2} style={{ width: 110 }}>성명</th>
              <th colSpan={2}>시작회의(위험성평가 교육)</th><th colSpan={2}>위험성평가 결과 교육(공유)</th><th rowSpan={2}>비고</th>
            </tr>
            <tr><th style={{ width: 130 }}>일시</th><th style={{ width: 76 }}>서명</th><th style={{ width: 130 }}>일시</th><th style={{ width: 76 }}>서명</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(10, participants.length) }, (_, i) => {
              const r = participants[i]
              return (
                <tr key={i} style={{ height: 34 }}>
                  <td className="c">{i + 1}</td>
                  <td className="c">{r ? pl(r.part) : ''}</td>
                  <td className="c">{r?.name ?? ''}</td>
                  <td className="c">{r?.kickoff_date?.replace('T', ' ') ?? ''}</td>
                  <td className="c">{r?.kickoff_signed ? '(서명)' : ''}</td>
                  <td className="c">{r?.result_date?.replace('T', ' ') ?? ''}</td>
                  <td className="c">{r?.result_signed ? '(서명)' : ''}</td>
                  <td>{r?.note ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="pageno">- 9 -</div>
      </div>
    </div>,
    document.body,
  )
}

/* ── 3-1 유해위험정보 (부서별 1쪽) ── */
function DeptInfoPage(p: { label: string; info: DeptInfo }) {
  const { info } = p
  const rows = Math.max(info.equips.length, info.chems.length, 12)
  return (
    <div className="rr-page">
      <div className="rr-h1">PART 3&ensp;위험성평가 실시</div>
      <div className="rr-h2">3-1 유해위험정보 ({p.label})</div>
      <table className="rr-tbl">
        <thead>
          <tr>
            <th style={{ width: 80 }}>소속 부서</th>
            <th style={{ width: 90 }}>{p.label}</th>
            <th colSpan={4} style={{ fontSize: 14 }}>유 해 위 험 정 보</th>
          </tr>
          <tr>
            <th rowSpan={2}>공정(작업)순서</th>
            <th colSpan={2}>기계·기구 및 설비</th>
            <th colSpan={2}>유해화학물질</th>
            <th rowSpan={2}>그 밖의 유해 위험 정보</th>
          </tr>
          <tr>
            <th>기계·기구 및 설비명</th><th style={{ width: 46 }}>수량</th>
            <th>화학물질명</th><th style={{ width: 70 }}>취급여부(체크)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="c" style={{ fontWeight: 800 }}>{p.label}</td>
            <td style={{ verticalAlign: 'top', padding: 0 }}>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} style={{ borderBottom: '1px dotted #bbb', padding: '2px 8px', minHeight: 19 }}>{info.equips[i]?.name ?? ' '}</div>
              ))}
            </td>
            <td style={{ verticalAlign: 'top', padding: 0 }}>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} style={{ borderBottom: '1px dotted #bbb', padding: '2px 8px', minHeight: 19, textAlign: 'center' }}>{info.equips[i] ? info.equips[i].qty : ' '}</div>
              ))}
            </td>
            <td style={{ verticalAlign: 'top', padding: 0 }}>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} style={{ borderBottom: '1px dotted #bbb', padding: '2px 8px', minHeight: 19 }}>{info.chems[i]?.name ?? ' '}</div>
              ))}
            </td>
            <td style={{ verticalAlign: 'top', padding: 0 }}>
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} style={{ borderBottom: '1px dotted #bbb', padding: '2px 8px', minHeight: 19, textAlign: 'center' }}>{info.chems[i]?.handled ? 'V' : ' '}</div>
              ))}
            </td>
            <td style={{ verticalAlign: 'top', fontSize: 11, lineHeight: 1.9 }}>
              ▶ 최근 3년간 재해발생 현황(총 건수)<br />
              &nbsp;- 사고성(협착, 추락, 전도 등) 재해 : {info.etc.acc3y_accident} 건<br />
              &nbsp;- 기타(업무상 질병, 장해 등) 재해 : {info.etc.acc3y_other} 건<br /><br />
              ▶ 작업환경 측정 대상 유무<br />
              &nbsp;- 해당유무 : {bx(info.etc.env_measure)} 해당&ensp;{bx(!info.etc.env_measure)} 해당없음<br /><br />
              ▶ 작업허가 대상 작업의 종류<br />
              &nbsp;- 해당유무 : {bx(info.etc.permit)} 해당&ensp;{bx(!info.etc.permit)} 해당없음<br />
              &nbsp;- 작업종류 : {['고소작업', '정전작업', '밀폐공간'].map((t) => `${bx(info.etc.permit_types.includes(t))} ${t}`).join('  ')}<br /><br />
              ▶ 도급업체 유무 및 종류<br />
              &nbsp;- 해당유무 : {bx(info.etc.contractor)} 해당&ensp;{bx(!info.etc.contractor)} 해당없음<br />
              &nbsp;- 작업종류 : {['생산', '청소', '경비', '포장'].map((t) => `${bx(info.etc.contractor_types.includes(t))} ${t}`).join('  ')}
              {info.etc.contractor_etc && <> &nbsp;기타: ({info.etc.contractor_etc})</>}<br /><br />
              ▶ 취약계층 근로자 유무 및 현황<br />
              &nbsp;- 해당유무 : {bx(info.etc.vulnerable)} 해당&ensp;{bx(!info.etc.vulnerable)} 해당없음<br />
              &nbsp;- 현황 : {['60세 이상의 장년근로자', '장애근로자', '위험 질병 유소견자'].map((t) => `${bx(info.etc.vulnerable_types.includes(t))} ${t}`).join('  ')}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="pageno">- 5 -</div>
    </div>
  )
}
