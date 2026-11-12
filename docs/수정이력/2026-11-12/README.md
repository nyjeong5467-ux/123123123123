# 2026-11-12 수정이력

총 3건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 21:56 — [174] 학교 상세 — 맨 위 전체 [편집] 제거, 칸마다 [편집](학교 정보·현업종사자·학교 특징·특이사항·확인자·점검자 이력, MSDS·산재·월별 이력은 [＋ 추가]), 학교 삭제는 학교 정보 편집 안으로, 학교 특징 [저장] 시 12항목 확정 저장·미저장 안내·저장됨 표시(점검표 자동 해당없음 적용), 앱 적용용 규칙표 docs/school-features.md

- 커밋: `(이번 업로드)` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `src/pages/SchoolDetail.tsx`
  - (수정) `src/styles/schoolhub.css`
  - (추가) `docs/school-features.md`

## 21:01 — [173] 종사자 안전보건점검표 기본정보 — 계정·권한의 소속·직급/부서 자동 채움(로그인 아이디 login/login_id 모두 인식, 직급→직책·나머지→부서명), 작성자를 직원 이름으로 바꾸면 그 직원 소속·부서·직책으로 채움(직접 입력값 유지)

- 커밋: `aead381` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/lib/myProfile.ts`
  - (수정) `src/pages/InspectionForm.tsx`

## 18:53 — [172] 홈 공지사항 — 내용 한 줄 미리보기, 클릭 시 상세 창(본문 줄바꿈 그대로·첨부), 전체 공지 보기(6건 초과), 공지 등록·필독 고정/해제·삭제는 본사 관리자·경영진만(점검자는 보기만), 행별 해제·✕ 버튼을 상세 창으로 이동, 등록 창 줄바꿈 안내

- 커밋: `82fe540` · 작성: nabong
- 바뀐 파일 4개:
  - (추가) `docs/notice-view.md`
  - (추가) `src/features/notice/NoticeModals.tsx`
  - (수정) `src/pages/Home.tsx`
  - (추가) `src/styles/notice.css`
