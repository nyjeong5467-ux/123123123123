# 2026-10-07 수정이력

총 5건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 22:06 — [136] 안전점검 작성된 점검표 삭제 권한 — 내 담당 학교만 삭제 가능(다른 조사원 담당 학교는 삭제 버튼 비활성) · 임시 백엔드 /auth/me에 로그인 ID·이름 보강

- 커밋: `b29888a` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `dev-backend.mjs`
  - (수정) `src/pages/Inspection.tsx`

## 21:08 — [135] 자동 올리기(auto-push) 추가 — 수정분을 이 PC의 git으로 자동 커밋·푸시 (start.bat 연동)

- 커밋: `d677d22` · 작성: nabong
- 바뀐 파일 5개:
  - (수정) `.gitignore`
  - (추가) `auto-push.bat`
  - (수정) `off.bat`
  - (수정) `start.bat`
  - (추가) `tools/auto-push.mjs`

## 20:55 — [134] 점검표 점검대상 칩·섹션 제목의 '수동 추가' 표기 제거

- 커밋: `e656e3c` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/pages/InspectionForm.tsx`

## 19:28 — [133] 임시 백엔드 — 시작 시 학교 담당자 이메일 자동 채움(로컬 목업)

- 커밋: `7d9b274` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `dev-backend.mjs`

## 19:24 — [132] 학교 담당자 이메일 일괄 등록 도구(import-school-contacts) · 임시 백엔드 담당자 연락처 저장 경로

- 커밋: `2d08d14` · 작성: nabong
- 바뀐 파일 4개:
  - (수정) `.gitignore`
  - (수정) `dev-backend.mjs`
  - (추가) `import-school-contacts.bat`
  - (추가) `tools/import-school-contacts.mjs`
