# 2026-11-10 수정이력

총 2건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 18:20 — [171] 경영 대시보드 홈페이지·콘텐츠 탭 — 자료실 화면 임베드(자료실 메뉴·폴더 목록) 제거, 공지 관리·홈페이지 정보 관리만 남김(자료실은 왼쪽 메뉴 '자료실')

- 커밋: `769c592` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleContent.tsx`

## 18:13 — [170] 직원 이력 지연 개선 — 탭 진입 시 전체 점검자 오늘 기록·방문계획 일괄 조회 제거, 누른 점검자 기록만 조회(근태 월별 현장 출석 캐시, 오늘 수행률은 누른 점검자만), /history/authors는 화면 표시 후 뒤에서 조회

- 커밋: `3ab5316` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `docs/staff-management.md`
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (수정) `src/features/console/staff/staffData.ts`
