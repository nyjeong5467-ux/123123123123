# 2026-11-08 수정이력

총 6건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 19:29 — [169] 경영 현황 — 상단 지표 카드 6개(계약 학교·세금계산서 발행액·발행 실패·불만 접수·산재 이력·시스템 계정) 삭제, 카드 전용 조회(/invoices·/accidents·/ops/dashboard) 제거

- 커밋: `(이번 업로드)` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleOverview.tsx`

## 19:26 — [168] 학교·기관 연락 이력 — 입력 칸 대신 [＋ 등록] 창(학교·기관 이름 검색·담당 점검자 자동·전화 받은 사람), 구분·유형 직접 추가, 전달 칸 [보내기](요청·문의전달만, 불만은 보내지 않음), 보내기 창(받는 점검자=점검자 자동·보낸 사람·연락처), 점검자 홈에 보낸 사람·연락처 표시, 상단 검색·필터·내보내기 제거, '관련 점검자'→'점검자', 문의·전달 유형 '담당자 변경' 삭제

- 커밋: `53043b6` · 작성: nabong
- 바뀐 파일 9개:
  - (수정) `docs/contact-history.md`
  - (수정) `src/features/console/ConsoleOverview.tsx`
  - (수정) `src/features/contact/ContactModal.tsx`
  - (추가) `src/features/contact/ContactRegisterModal.tsx`
  - (추가) `src/features/contact/ContactSendModal.tsx`
  - (수정) `src/features/contact/HqInbox.tsx`
  - (수정) `src/features/contact/StaffComplaints.tsx`
  - (수정) `src/features/contact/contactData.ts`
  - (수정) `src/styles/contact.css`

## 18:49 — [167] 경영 현황 불만 이력 → 학교·기관 연락 이력(구분 불만·요청·문의전달, 유형, 관련 점검자 자동, 처리 창: 조치 내용·담당자에게 보내기·완료 처리·등록 취소·수정 기록, 삭제 없음, 상단 검색·필터·내보내기 제거), 홈 내 현장 메모 본사 전달(확인·조치 완료·지난 본사 전달 보기), 직원 이력 불만·요청 탭(전체·미처리, 이름 옆 건수)

- 커밋: `94b93b7` · 작성: nabong
- 바뀐 파일 9개:
  - (추가) `docs/contact-history.md`
  - (수정) `src/features/console/ConsoleOverview.tsx`
  - (수정) `src/features/console/ConsoleStaffHistory.tsx`
  - (추가) `src/features/contact/ContactModal.tsx`
  - (추가) `src/features/contact/HqInbox.tsx`
  - (추가) `src/features/contact/StaffComplaints.tsx`
  - (추가) `src/features/contact/contactData.ts`
  - (수정) `src/pages/Home.tsx`
  - (추가) `src/styles/contact.css`

## 17:14 — [166] KOSHA 재해사례 — 재해 유형 칩 삭제, 업종 대신 학교·기관 직종(급식·조리·당직·경비·통학·운전·시설관리·미화·사무·행정·도서관·수련·연수시설)으로 조회, 대상(전체·학교·기관) 칩, 직종·재해 유형 드롭다운, 건설·제조 사례 제외, 직종·재해 유형 배지, 공단 전체 사례 보기 링크

- 커밋: `c30156b` · 작성: nabong
- 바뀐 파일 4개:
  - (추가) `docs/kosha-jobs.md`
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/styles/accidents.css`

## 17:02 — [165] KOSHA 재해사례 — 업종(건설업·제조업) 대신 재해 유형(떨어짐·넘어짐·끼임·깔림·부딪힘·베임·화상·감전·질식·화재폭발·근골격계)으로 분류·조회, 유형 배지 표시

- 커밋: `d398daf` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/styles/accidents.css`

## 16:53 — [164] 자료실 개편 — 흰 검색 카드(검색·많이 찾는 자료·필독), 자료실 메뉴(공통~지원 폴더×세부 항목·건수·N), 세부 항목 칩, 파일 형식 배지(확장자 자동), 버전 관리(최신본·이전 버전), 받은 수, 자료 올리기(세부 항목 추가·설명·필독·새 버전), 현장 앱 APK는 지원 폴더로

- 커밋: `42b6e8c` · 작성: nabong
- 바뀐 파일 3개:
  - (추가) `docs/resources.md`
  - (수정) `src/pages/Resources.tsx`
  - (추가) `src/styles/resources.css`
