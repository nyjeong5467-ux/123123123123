# 학교·기관 연락 이력 · 본사 전달 — [167]

경영 현황의 '불만 이력'을 **학교·기관 연락 이력**으로 넓히고, 관리자가 [보내기]한 건만 담당 점검자 홈에 전달한다.

| 화면 | 내용 |
|---|---|
| 경영 대시보드 › 경영 현황 › 학교·기관 연락 이력 | 구분(불만·요청·문의·전달)·유형·점검자(학교·날짜로 그날 담당 자동) 등록. 행을 누르면 처리 창: 조치 내용(관리자만), 담당자에게 보내기(전달할 내용만 전달), 완료 처리, 등록 취소, 수정 기록 |
| 홈 › 내 현장 메모 | 맨 위 '본사 전달'. 문의·전달은 [확인]하면 사라짐, 요청·불만은 [확인] → [조치 완료](한 줄 조치 내용)하면 사라짐. '지난 본사 전달 보기(최근 30일)' |
| 경영 대시보드 › 직원 이력 › 점검자 상세 › 불만·요청 탭 | 구분 '불만'이고 점검자가 그 사람인 건(읽기 전용). 전체·미처리, 목록 이름 옆 건수 배지 |

## 상태

접수 → 전달됨 → 확인함 → 조치 완료 → 완료 / 등록 취소

- 문의·전달: 점검자 [확인] = 완료
- 요청: 점검자 [조치 완료] = 완료(자동)
- 불만: 점검자 [조치 완료] = '조치 완료' → 관리자가 [완료 처리]
- 다시 보내기: 점검자 홈에 다시 표시(이전 확인은 무시)
- 기록은 지우지 않는다. 잘못 등록한 건은 '등록 취소'로 흐리게 남기고, 구분·유형·점검자·조치 내용·보내기 변경은 수정 기록에 남는다.

## 저장 (새 API 없음)

```jsonc
// POST/GET /complaints — 접수 원장(학교·날짜·원문) 그대로
// org 문서 contact-meta (관리자만 씀)
{ "<complaint_id>": { "kind": "complaint|request|info", "type": "태도", "inspector": "김조사", "inspector_login": "insp01",
  "school_id": "s01", "school_name": "한빛초등학교", "date": "2026-11-08", "note": "관리자 조치 내용",
  "send": { "to_login": "insp01", "to_name": "김조사", "text": "전달할 내용", "ts": "…", "by": "관리자" },
  "closed": "done|canceled", "closed_ts": "…", "log": [{ "ts": "…", "by": "…", "what": "보내기 → 김조사" }] } }
// org 문서 contact-acks-{login} (점검자 본인만 씀 — 홈 방문계획 visit-plans-{login}과 같은 방식)
{ "<complaint_id>": { "sent_ts": "<send.ts>", "ack_ts": "…", "act": { "text": "조치 내용", "ts": "…" } } }
```

## 백엔드 담당자 참고

- 불만 원문·조치 내용은 민감 정보 → 실서버에서 `contact-meta`는 **본사 관리자·경영진만 읽기/쓰기**, 점검자는 자기에게 온 전달(`send.to_login` = 본인)만 받도록 전용 조회(예: `GET /contacts/inbox`)를 두는 것을 권장.
- `contact-acks-{login}`은 본인만 쓰기, 관리자 읽기.
- 전용 API로 옮기면 화면 수정은 `src/features/contact/contactData.ts`의 조회·저장 부분만 바꾸면 된다.

## 파일

- `src/features/contact/contactData.ts` — 구분·유형·상태 규칙, 저장, 그날 담당 점검자 찾기
- `src/features/contact/ContactModal.tsx` — 처리 창(관리자)
- `src/features/contact/HqInbox.tsx` — 홈 본사 전달
- `src/features/contact/StaffComplaints.tsx` — 직원 이력 불만·요청 탭
- `src/features/console/ConsoleOverview.tsx` — 연락 이력 표·등록
- `src/features/console/ConsoleStaffHistory.tsx` — 탭·배지 연결, `src/pages/Home.tsx` — 내 현장 메모 연결
- `src/styles/contact.css` — 접두사 `ct-`
