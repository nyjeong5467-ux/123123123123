# 2026-11-16 수정이력

총 8건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 23:52 — feat(activity): 지도에 학교 완료 핀(이름·학교·시각), '지도 이력' 탭(날짜별 완료 지점 지도·표, 최근 60일)

- 커밋: `a43a3d3` · 작성: Jong-Myeong Kim
- 바뀐 파일 5개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`
  - (추가) `src/features/activity/history.tsx`
  - (수정) `src/pages/Activity.tsx`
  - (수정) `src/styles/activity.css`

## 23:36 — feat(activity): 실시간 위치 지도(오늘 30초 자동 갱신, 이동 경로 선, 갱신 시각 표시)

- 커밋: `9b6138b` · 작성: Jong-Myeong Kim
- 바뀐 파일 2개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`

## 23:29 — feat(activity): 활동 종류 '접속 확인' 추가, 지도 안내 문구(10분 간격·15분 무소식이면 종료)

- 커밋: `1df8f44` · 작성: Jong-Myeong Kim
- 바뀐 파일 2개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`

## 23:21 — feat(activity): 미니맵 접속 중(파랑)·종료(회색) 핀과 이름 표시, 위치 동의 인원 요약

- 커밋: `b1c5594` · 작성: Jong-Myeong Kim
- 바뀐 파일 3개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`
  - (수정) `src/styles/activity.css`

## 22:56 — feat(activity): 기기 라벨 제거(핀=사용자 이름, 기기 목록 읽기 전용), 이벤트 원장·사용자 탭 요약 보기(앱 실행·종료·학교 완료) + 모든 활동 보기 토글

- 커밋: `0dd88c9` · 작성: Jong-Myeong Kim
- 바뀐 파일 4개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`
  - (수정) `src/features/activity/devices.tsx`
  - (수정) `src/features/activity/panels.tsx`

## 22:46 — feat(web): 활동 현황(관리자)·사진 썸네일 로딩·법령 검색 리뉴얼·공지 본문 모달·팝업 다시 보지 않기·사진 드래그 첨부

- 커밋: `662a6fa` · 작성: Jong-Myeong Kim
- 바뀐 파일 23개:
  - (수정) `package-lock.json`
  - (수정) `package.json`
  - (수정) `src/App.tsx`
  - (수정) `src/components/AppShell.tsx`
  - (수정) `src/components/InspectionMailModal.tsx`
  - (추가) `src/components/InspectionPhotos.tsx`
  - (수정) `src/components/InspectionSheetView.tsx`
  - (추가) `src/features/activity/MiniMap.tsx`
  - (추가) `src/features/activity/data.ts`
  - (추가) `src/features/activity/devices.tsx`
  - (추가) `src/features/activity/panels.tsx`
  - (수정) `src/lib/inspExtra.ts`
  - (추가) `src/lib/media.ts`
  - (추가) `src/pages/Activity.tsx`
  - (수정) `src/pages/Home.tsx`
  - (수정) `src/pages/Inspection.tsx`
  - (수정) `src/pages/InspectionForm.tsx`
  - (수정) `src/pages/LawSearch.tsx`
  - (추가) `src/styles/activity.css`
  - (수정) `src/styles/inspectform.css`
  - (수정) `src/styles/inspectsheet.css`
  - (수정) `src/styles/law.css`
  - (추가) `src/styles/photos.css`

## 22:46 — feat(web): 홈 팝업 공지(캐러셀·오늘 하루 열지 않기·콘솔 '팝업 공지' 탭), 텔레그램 연동 카드 — 10-30 작업분(11-16 배포)

- 커밋: `1fe7325` · 작성: Jong-Myeong Kim
- 바뀐 파일 7개:
  - (추가) `src/components/HomePopup.tsx`
  - (추가) `src/components/TelegramLinkCard.tsx`
  - (추가) `src/features/console/ConsolePopup.tsx`
  - (추가) `src/lib/homePopups.ts`
  - (수정) `src/pages/Dashboard.tsx`
  - (수정) `src/pages/MyPage.tsx`
  - (추가) `src/styles/homepopup.css`

## 14:12 — feat(law): 법령 검색 페이지(/law) + 점검표 비고 [법령] 근거 추천 힌트

- 커밋: `8cc97c3` · 작성: Jong-Myeong Kim
- 바뀐 파일 6개:
  - (수정) `src/App.tsx`
  - (수정) `src/components/AppShell.tsx`
  - (추가) `src/components/LawHint.tsx`
  - (수정) `src/pages/InspectionForm.tsx`
  - (추가) `src/pages/LawSearch.tsx`
  - (추가) `src/styles/law.css`
