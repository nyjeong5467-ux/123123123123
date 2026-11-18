# 2026-11-18 수정이력

총 8건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 22:01 — [190] 안전관리 도우미(챗봇): 안전점검·위험성평가·근골격계·교육 진도표·이행점검 화면 오른쪽 아래 동그라미 버튼 → 대화 창. 위험 상황 질문에 위험 요약·개선 대책·점검 포인트·관련 법령 답변(주제 3개 초안: 미끄러짐·추락·화상), 그 외 질문은 관련 조문 찾기. AI 백엔드 연결 자리(CHAT_ENDPOINT) 마련

- 커밋: `(이번 업로드)` · 작성: nabong
- 바뀐 파일 4개:
  - (수정) `src/components/AppShell.tsx`
  - (추가) `src/components/LawDock.tsx`
  - (추가) `src/lib/safetyTopics.ts`
  - (추가) `src/styles/lawdock.css`

## 21:38 — [189] 메일함: 미연동·조회 실패여도 받은편지함 빈 화면(표) 표시, 연동하러 가기 버튼 제거

- 커밋: `06b6fe4` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/pages/Mail.tsx`
  - (수정) `src/styles/mail.css`

## 21:34 — [188] 홈페이지 콘텐츠: 홈페이지 정보 관리 카드 삭제(읽는 화면 없어 미사용, 저장값은 서버 그대로)

- 커밋: `bd49643` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleContent.tsx`

## 21:29 — [187] 설정: 문서 저장소 칸 삭제(시스템 관리 › 시스템의 저장소 현황은 유지)

- 커밋: `d23d9fe` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/pages/SettingsPage.tsx`

## 21:26 — [186] 시스템: 이메일 연동 요약 카드 삭제(메일 설정·메일함은 그대로)

- 커밋: `12b93fb` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/features/console/ConsoleSystem.tsx`

## 21:21 — [182~185] 경영 현황: 프로그램 다운로드를 시스템 관리로 이동, 우측 편집형 경영 콘텐츠 삭제, 임원 방문 등록을 창으로 변경, 연락 이력 버튼 이름 이력 등록

- 커밋: `b9c20b5` · 작성: nabong
- 바뀐 파일 3개:
  - (수정) `src/features/console/ConsoleOverview.tsx`
  - (수정) `src/features/console/ConsoleSystem.tsx`
  - (추가) `src/features/console/ReleasePanel.tsx`

## 21:04 — [181] 산업재해: 외부 데이터 연동을 시스템 관리로 이동, 필터바 삭제·산재 등록 버튼 이동, 산재 검색(등록 버튼 옆) 추가

- 커밋: `b500b60` · 작성: nabong
- 바뀐 파일 4개:
  - (추가) `src/features/console/AccidentFeedPanel.tsx`
  - (수정) `src/features/console/ConsoleSystem.tsx`
  - (수정) `src/pages/Accidents.tsx`
  - (수정) `src/styles/accidents.css`

## 20:49 — [180] 메일함 — '보낸 업무 메일' → '보낸편지함', 연동 설정 버튼 대신 계정 표시(이름 | 소속 직책 / 메일 주소, 누르면 설정), 제목 옆 주소 표시 제거, 최근 N통 선택 칸 제거(새로고침 유지)

- 커밋: `1ab16ee` · 작성: nabong
- 바뀐 파일 2개:
  - (수정) `src/pages/Mail.tsx`
  - (추가) `src/styles/mail.css`
