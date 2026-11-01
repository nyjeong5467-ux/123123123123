# 2026-11-01 수정이력

총 9건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 22:46 — [156] 직원 이력 — 아래 업무 기록 목록도 위에서 고른 날짜(기본 오늘)에 작성한 문서만 표시(업무 종류 필터 유지)

- 커밋: `(이번 업로드)` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`

## 22:43 — [155] 직원 이력 — '금일 업무'와 '업무 기록' 탭을 하나로: 날짜별 할 업무 옆에 해당 업무 기록(제목·날짜·상태)을 나란히, 아래 업무 기록 전체(선택 날짜 강조·날짜 누르면 그날 비교)

- 커밋: `40dd153` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/features/console/staff/staffData.ts`
  - (수정) `src/styles/staff.css`

## 22:39 — [154] 직원 이력 — 조사원 상세 탭에서 '이력서' 탭 제거(이력서 내용은 머리 정보·이력서 편집으로 확인)

- 커밋: `9f4eb3e` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`

## 20:41 — [153] 직원 이력 — 조사원 상세에 '담당 학교' 탭 추가(학교·구분·지역·계약·이 조사원의 최근 업무·기록 수, 검색), 머리의 '담당 학교 N개' 누르면 이동

- 커밋: `f4da22e` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/styles/staff.css`

## 20:36 — [152] 이력서 편집 — 한글(HWP·HWPX)·워드(DOCX)·TXT 이력서 파일 자동 인식(학력·경력·자격·교육·연락처·이메일) 후 미리보기·선택 적용 · 최종 학력 표시 기준 개선

- 커밋: `58fd214` · 작성: nabong
- 바뀐 파일 7개:
  - (수정) `docs/staff-management.md`
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/features/console/staff/StaffResume.tsx`
  - (추가) `src/features/console/staff/resumeParse.ts`
  - (수정) `src/features/console/staff/staffData.ts`
  - (추가) `src/lib/docText.ts`
  - (수정) `src/styles/staff.css`

## 20:24 — [151] 직원 이력 — 조사원 머리 정보에 입사일(근속)·총 경력(이전+현)·전화번호·이메일·대학·전공·이전 근무 표시

- 커밋: `4ea6307` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/features/console/staff/staffData.ts`
  - (수정) `src/styles/staff.css`

## 20:18 — [150] 직원 이력 — 조사원 상세의 요약 카드(금일 수행률·연차·이력서) 제거, 수행률은 '금일 업무' 탭 라벨·머리에 표시

- 커밋: `f5273d2` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`

## 20:16 — [149] 직원 이력 — 상단 요약 카드(오늘 계획 있는 조사원·전체 수행률·완료 인원·미수행 업무) 제거

- 커밋: `de64b52` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`

## 20:06 — [148] 경영대시보드 직원 이력 개편 — 조사원 정보·이력서, 금일 업무 수행률(방문계획 대비 실제 기록), 근태 관리(현장 출석 자동·휴가·연차), 조사원 담당학교 변경 버튼(학교별 새 조사원 지정·조사원 이력 자동 기록)

- 커밋: `131ab31` · 작성: nabong
- 바뀐 파일 8개:
  - (추가) `docs/staff-management.md`
  - (수정) `src/components/Modal.tsx`
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (추가) `src/features/console/staff/StaffAssignModal.tsx`
  - (추가) `src/features/console/staff/StaffAttendance.tsx`
  - (추가) `src/features/console/staff/StaffResume.tsx`
  - (추가) `src/features/console/staff/staffData.ts`
  - (추가) `src/styles/staff.css`
