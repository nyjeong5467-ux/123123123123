# 2026-11-17 수정이력

총 7건 · 최신순 · 한국 시간 기준

[← 날짜 목차](../README.md)

## 21:55 — fix(activity): 지도 이력 지도가 안 뜨던 문제(불러오기 뒤 지도 생성), 완료 종류 '제출'·학교 위치 표시

- 커밋: `69b71c7` · 작성: Jong-Myeong Kim
- 바뀐 파일 3개:
  - (수정) `src/features/activity/MiniMap.tsx`
  - (수정) `src/features/activity/data.ts`
  - (수정) `src/features/activity/history.tsx`

## 21:41 — feat(web): 왼쪽 메뉴 재구성 — 업무(학교·자료실·메일함)·운영·인사·근무·시스템 관리 그룹(접기/펼치기), 경영 대시보드 탭 줄 제거 후 각 메뉴로 바로 진입, 청구·정산 탭은 세금계산서로 통합(예전 주소 유지)

- 커밋: `109035f` · 작성: Jong-Myeong Kim
- 바뀐 파일 4개:
  - (수정) `src/components/AppShell.tsx`
  - (수정) `src/pages/Billing.tsx`
  - (수정) `src/pages/Dashboard.tsx`
  - (수정) `src/styles/components.css`

## 21:37 — merge: 공동연구원 [170]~[178] 반영 — 공지 상세는 공동연구원 구현(전체 보기·관리자만 등록/삭제)으로 통일

- 커밋: `10673c4` · 작성: Jong-Myeong Kim · 병합(동료 작업 합치기)

## 18:27 — [178] 종사자 안전·보건 점검표 확인자 직책 이름 수정 — 직책 옆 ✎(추천 칩·직접 입력·원래대로), '변경됨 · 원래 ○○' 표시, 이 점검표 부가정보(approval_titles)에 저장해 보기·PDF 결재란 칸 제목에 반영, '이 학교 기본값으로도 저장' 체크 시 학교 확인자(approval-line)에도 저장. 교육청 서명 전송은 변경 없음

- 커밋: `b46ad22` · 작성: nabong
- 바뀐 파일 4개:
  - (수정) `src/components/InspectionSheetView.tsx`
  - (수정) `src/lib/inspExtra.ts`
  - (수정) `src/pages/InspectionForm.tsx`
  - (수정) `src/styles/inspectform.css`

## 18:04 — [177] 이행점검 이어서 작성 카드(내 조사지 작업) — 오른쪽 위 X로 목록에서 숨기기(위험성평가·근골격계와 동일, 조사지는 삭제 안 함, 계정별 저장)

- 커밋: `018d84d` · 작성: nabong
- 바뀐 파일 1개:
  - (수정) `src/pages/Compliance.tsx`

## 17:50 — [176] 위험성평가·근골격계 이어서 작성 카드 — 오른쪽 위 X로 목록에서 숨기기(안전점검과 동일, 작성물은 삭제 안 함, 계정별 저장, 위험성평가는 진행 상태가 바뀌면 다시 표시). 공용 MyWorkStrip에 hideKey 옵션 추가. (ErrorBoundary.tsx는 추후 [보기] 개선용 — 현재 미사용)

- 커밋: `6fae228` · 작성: nabong
- 바뀐 파일 4개:
  - (추가) `src/components/ErrorBoundary.tsx`
  - (수정) `src/components/table/MyWorkStrip.tsx`
  - (수정) `src/pages/Musculo.tsx`
  - (수정) `src/pages/Risk.tsx`

## 00:01 — perf(inspection): 점검 상세·양식·작성 화면이 부가정보를 학교 단위로만 받도록

- 커밋: `d7db99b` · 작성: Jong-Myeong Kim
- 바뀐 파일 2개:
  - (수정) `src/pages/Inspection.tsx`
  - (수정) `src/pages/InspectionForm.tsx`
