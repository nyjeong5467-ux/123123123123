# 2026-10-22 수정이력

총 11건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 21:20 — [147] 날짜별 수정이력 폴더(docs/수정이력/&lt;날짜&gt;/) — 업로드할 때마다 그날 작업 자동 정리 · 지난 기록 전체 정리

- 커밋: `(이번 업로드)` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `tools/auto-push.mjs`
  - (추가) `tools/changelog-by-date.mjs`

## 20:46 — [146] 홈 산재 알림 — 산재내역 항목에 학교명과 함께 개요(예: 실습실 절단 사고) 표시, 구분(사고성/질병성) 추가

- 커밋: `15c1071` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/styles/home.css`

## 20:42 — [145] 국내재해사례 — KOSHA 재해사례의 다운로드(CSV) 버튼 제거

- 커밋: `ae62960` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/pages/Accidents.tsx`

## 20:40 — [144] 국내재해사례 — 산재 관련 뉴스의 다운로드(CSV) 버튼 제거

- 커밋: `935a518` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/pages/Accidents.tsx`

## 20:35 — [143] 산재 관련 뉴스 — 저장·누적 없이 최근 3개월(90일)만 표시, 지난 기사 자동 제외 (보관 원칙 문서화)

- 커밋: `869183c` · 작성: nabong
- 바뀐 파일 5개:
  - (수정) `dev-backend.mjs`
  - (수정) `docs/accident-feed-api.md`
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/pages/Home.tsx`

## 20:30 — [142] 산재 관련 뉴스·홈 산재 알림 — 같은 주제(급식실 폐암 등) 기사 1행으로 묶기(이슈 라벨·관련 N건 펼치기, 전남 소식 별도)

- 커밋: `3659a3d` · 작성: nabong
- 바뀐 파일 5개:
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/styles/accidents.css`
  - (수정) `src/styles/home.css`

## 20:25 — [141] 산재 관련 뉴스 — 약 10건 높이 스크롤(머리글 고정)·최신 보도 순 · 같은 사건 기사 묶기 강화(제목 유사+3일 이내)·'외 N건' 펼쳐 보기 · 언론사 주소 표기 정리

- 커밋: `d407a2d` · 작성: nabong
- 바뀐 파일 4개:
  - (수정) `dev-backend.mjs`
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/styles/accidents.css`

## 20:19 — [140] 산업재해 탭 이름 정리 — '회사 산재 내역'→'산재내역'(학교·기관 실제 발생 산재), '국내재해사례 (KOSHA)'→'국내재해사례' · 국내재해사례 탭에 산재 관련 뉴스(학교 업무·전남 관련) + KOSHA 재해사례 함께 표시(출처 선택·CSV) · 홈 '회사 산재' 표시→'산재'

- 커밋: `c5bd01f` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/pages/Home.tsx`

## 20:14 — [139] 산재 알림 안내 문서(docs/accident-feed-api.md) — 실서버 적용 상태·로컬 KOSHA 인증키·뉴스 출처 안내 추가

- 커밋: `3070025` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `docs/accident-feed-api.md`

## 20:12 — [138] 산재 알림 지역 필터 — 전남 기사 우선·다른 지역(대전·경기 등) 기사 제외 · 전남 검색어 추가

- 커밋: `c7647e4` · 작성: nabong
- 바뀐 파일 4개:
  - (수정) `dev-backend.mjs`
  - (수정) `docs/accident-feed-api.md`
  - (수정) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Home.tsx`

## 20:04 — [137] 홈 산재 알림 실시간 피드 — 산재 관련 뉴스(구글 뉴스 RSS, 같은 사건 기사 묶음) + KOSHA 국내재해사례, 학교 업무 관련만 추출·10분 갱신 · 임시 백엔드 뉴스/KOSHA 경로 · 백엔드 API 안내(docs/accident-feed-api.md)

- 커밋: `5f99d00` · 작성: nabong
- 바뀐 파일 6개:
  - (수정) `.gitignore`
  - (수정) `dev-backend.mjs`
  - (추가) `docs/accident-feed-api.md`
  - (추가) `src/lib/accidentRelevance.ts`
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/styles/home.css`
