# 직원 이력(점검자 관리) — [148]

경영 대시보드 › **직원 이력** 탭. 점검자를 누르면 아래 4가지를 한 화면에서 본다.

| 구역 | 내용 | 데이터 |
|---|---|---|
| 기본 정보 | 이름·아이디·소속·부서·연락처·담당 학교 | `/users`, `staff-registry`(계정·권한 탭), `/schools`(manager = 점검자 이름) |
| 금일 업무 | 오늘 할 업무(학교 × 업무) 대비 실제 수행 → **수행률 %** | 계획: `visit-plans-{login}` → 없으면 `schedules` / 수행: `GET /history` |
| 이력서 | 직위·입사일(근속)·이메일·학력·경력·자격·교육 이수·비고 | `staff-resumes` (신규) |
| 근태 관리 | 월 달력 — 현장 출석(자동)·내근·출장·반차·연차·병가·결근, 출석률·연차 잔여 | `staff-attendance` (신규) + `GET /history` |
| 업무 기록 | 기존 직원 이력 표(날짜·업무·학교·상태) | `GET /history` |

[170] 지연 줄이기: 탭을 열 때 전체 점검자의 기록을 한꺼번에 부르지 않는다. **누른 점검자의 기록만** 조회한다.
- 근태 달력: 그 점검자·그 달의 `/history`만 조회(같은 점검자·같은 달을 다시 열면 화면 안 캐시로 바로 표시, 이번 달은 1분 뒤 새로 조회)
- 오늘 수행률: 누른 점검자만 계산해 목록 배지에 표시(한 번 본 사람은 다시 부르지 않음)
- `/history/authors`(계정 없는 작성자·작성자 미상)는 화면을 띄운 뒤 뒤에서 불러와 합침
- 백엔드 참고: `/history?author_id=…&date_from=…&date_to=…`를 서버에서 작성자·기간으로 걸러 주면(인덱스) 더 빨라진다.

## 규칙

- **오늘 할 업무**: 홈 캘린더 방문계획(학교별 업무 선택)이 기준. 업무를 고르지 않은 학교는 "업무 미지정" 1건으로 보고 그 학교 기록이 하나라도 있으면 수행.
  방문계획이 없으면 근무표(근무 종합관리표)의 오늘 학교를 기준으로 한다.
- **수행 여부**: 오늘 날짜의 `/history` 기록 중 같은 학교(school_id 또는 학교명)·같은 업무가 있으면 수행(작성 중 포함). 계획에 없는 기록은 "계획 외 수행"으로 따로 보여 주고 수행률에는 넣지 않는다.
- **현장 출석(자동)**: 그날 점검자 이름으로 된 업무 기록이 1건이라도 있으면 출석. 학교에 나가 점검을 기록하면 자동 체크된다.
- **수기 근태**: 날짜를 눌러 내근 출근·출장·반차(연차 0.5)·연차(1)·병가·결근 지정. 내근·출장·반차는 출석으로 센다.
- **출석률** = 출석일 ÷ 근무일(평일 − 공휴일, 이번 달은 오늘까지).
- **연차 잔여** = 부여일수(기본 15일, 점검자별 수정 가능) − 올해 사용(연차 1 + 반차 0.5).

## 이력서 파일 자동 인식 [152]

이력서 편집 › **이력서 파일 불러오기** — 한글(HWP·HWPX)·워드(DOCX)·TXT 파일을 브라우저에서 바로 읽어(서버 전송 없음) 항목을 찾는다.

- 읽기: `src/lib/docText.ts` — HWP 5.0(OLE 복합문서 → 본문 압축 해제 → 문단·표 셀), HWPX·DOCX(ZIP → XML), TXT. 외부 라이브러리 없음(브라우저 내장 압축 해제).
- 인식: `src/features/console/staff/resumeParse.ts` — 구역 제목(학력·경력·자격·교육), 표 머리글(기간·학교명·전공·회사명·직위·담당업무·자격증명·발급기관 등), 날짜 모양으로 행을 항목으로 바꿈. 이메일·휴대폰 번호·성명도 찾는다.
- 인식 결과는 미리보기로 보여 주고, 고른 항목만 '선택 항목 적용' → 확인 후 '저장'. 구역은 기존 행을 교체한다.
- 미지원: PDF·스캔 이미지(OCR), 암호·배포용 한글 문서(배포용은 미리보기 텍스트만).

## 점검자 담당학교 변경

직원 이력 상단 **점검자 담당학교 변경** 버튼 → ① 기존 담당 점검자 선택 → ② 그 점검자의 담당 학교 목록에서 학교마다 새 점검자 지정(체크 후 일괄 지정 가능) → 변경일 지정 → 저장.

- 저장: `PUT /schools/:id` (학교 정보 수정과 같은 필드, `manager`만 새 점검자 이름)
- 학교의 **점검자 이력**(`/schools/:id/manager-history`)에 변경일 기준으로 자동 기록(진행 중 행은 변경일 전날로 종료, 새 행 추가)

## 저장 문서 (org 문서 `/ops/docs/:key`)

```jsonc
// staff-resumes
{ "insp01": { "position": "선임 점검자", "hire_date": "2022-03-02", "email": "…",
  "education": [{ "period": "2010.03~2014.02", "title": "○○대학교", "detail": "건축공학 학사" }],
  "career": [], "certs": [], "trainings": [], "memo": "", "updated_at": "2026-11-01" } }

// staff-attendance
{ "insp01": { "annual_leave": 15,
  "days": { "2026-11-11": { "type": "trip", "note": "교육청 회의" } } } }
// type: office(내근) | trip(출장) | half(반차) | leave(연차) | sick(병가) | absent(결근)
```

저장은 점검자 단위 병합(저장 직전 최신본을 다시 읽어 그 점검자 항목만 교체)이라 여러 관리자가 동시에 다른 점검자를 고쳐도 서로 덮어쓰지 않는다.

## 백엔드 담당자 참고

- 새 API 없이 동작한다(기존 `/ops/docs/:key`, `/schools/:id`, `/schools/:id/manager-history`, `/history`).
- 이력서·근태는 개인정보이므로 실서버에서는 `staff-resumes`·`staff-attendance` 문서를 **본사 관리자·경영진만 읽기/쓰기** 가능하도록 권한을 거는 것을 권장한다.
  (전용 API로 옮길 경우 응답 형식만 위와 같으면 화면 수정은 `src/features/console/staff/staffData.ts`의 `getDoc/patchDoc`만 바꾸면 된다.)
- 현장 앱에서 출근 체크(GPS 등)를 추가하면 `staff-attendance`에 `office`/`trip`으로 기록하거나, 별도 출근 기록을 `loadFieldDates`에 합치면 된다.

## 파일

- `src/features/console/ConsoleStaffHistory.tsx` — 목록·상세·금일 업무·업무 기록
- `src/features/console/staff/staffData.ts` — 데이터·계산 규칙(단일 소스)
- `src/features/console/staff/StaffAssignModal.tsx` — 담당학교 변경
- `src/features/console/staff/StaffAttendance.tsx` — 근태 달력
- `src/features/console/staff/StaffResume.tsx` — 이력서 보기·편집·파일 불러오기
- `src/features/console/staff/resumeParse.ts` — 이력서 자동 인식 규칙
- `src/lib/docText.ts` — HWP·HWPX·DOCX·TXT 텍스트·표 추출
- `src/styles/staff.css` — 화면 스타일(접두사 `sf-`)
- `src/components/Modal.tsx` — `width` 옵션 추가(넓은 모달)
