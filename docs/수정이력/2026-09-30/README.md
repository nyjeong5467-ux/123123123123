# 2026-09-30 수정이력

총 4건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 21:33 — feat(web): 소속(기관)별 화면 격리 + 'admin' 슈퍼계정

- 커밋: `720bbad` · 작성: suwonsaram-hub
- 바뀐 파일 11개:
  - (수정) `src/components/SchoolScopePicker.tsx`
  - (추가) `src/lib/affiliationScope.ts`
  - (수정) `src/pages/Compliance.tsx`
  - (수정) `src/pages/Education.tsx`
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/pages/Inspection.tsx`
  - (수정) `src/pages/Musculo.tsx`
  - (수정) `src/pages/Risk.tsx`
  - (수정) `src/pages/Schedule.tsx`
  - (수정) `src/pages/SchoolStatus.tsx`
  - (수정) `src/pages/SchoolsHub.tsx`

## 20:57 — fix(web/home): 홈 방문계획 계정별 분리 + 학교 등록 담당/전체(소속)/모든 탭 스코프

- 커밋: `4e671b5` · 작성: suwonsaram-hub
- 바뀐 파일 2개:
  - (추가) `src/components/SchoolScopePicker.tsx`
  - (수정) `src/pages/Home.tsx`

## 20:31 — [125] 포인트 색 보라(#7C5CFB) → 네이비 블루(#2B4C9B) 전환 · 다크모드 블루(#4D7BD8) · 점검표 양식 강조색 통일

- 커밋: `7628944` · 작성: nabong
- 바뀐 파일 11개:
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/pages/Billing.tsx`
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/pages/InspectionForm.tsx`
  - (수정) `src/pages/MusculoStats.tsx`
  - (수정) `src/pages/Schedule.tsx`
  - (수정) `src/styles/components.css`
  - (수정) `src/styles/home.css`
  - (수정) `src/styles/inspectsheet.css`
  - (수정) `src/styles/riskreport.css`
  - (수정) `src/styles/tokens.css`

## 19:19 — [121]~[124] 점검표 보기=PDF 서식 통일 · 확인자 용어 통일(학교: 담당자·행정실장·교장 / 기관: 담당자·팀장·과장) · 결재선 점검자 이름 리셋 도구 · 임시 백엔드(dev-backend, 점검표 PDF) · start.bat 개편 · commit-push 한글 메시지 수정

- 커밋: `66c454d` · 작성: nabong
- 바뀐 파일 12개:
  - (수정) `.gitignore`
  - (수정) `commit-push.bat`
  - (추가) `dev-backend.mjs`
  - (추가) `reset-approval.bat`
  - (수정) `src/components/InspectionSheetView.tsx`
  - (수정) `src/lib/approval.ts`
  - (수정) `src/pages/Inspection.tsx`
  - (수정) `src/pages/InspectionForm.tsx`
  - (수정) `src/pages/SchoolDetail.tsx`
  - (수정) `src/styles/inspectsheet.css`
  - (수정) `start.bat`
  - (추가) `tools/reset-approval-inspectors.mjs`
