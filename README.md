# web-hq — 본사 경영 ERP 대시보드 (React + TypeScript + Vite)

Windows PC 웹. 경영자/본사관리자용. 전체 학교·조사원 관리, **외근 세션코드 발급**, 불만이력(관리자전용)·근태·방문.
```
src/
  features/  ledger ops inspection risk compliance education billing
  shared/    api ui store
```
참고 화면: `docs/05-mockup/01_ledger_main`,`02_school_detail`,`03_ops_dashboard`,`06_risk_assessment`.

## 실행 방법 (공동연구원용)

이 리포는 **프론트엔드만** 포함합니다. 최신 main 을 받은 뒤 아래 방법 A로 실행하세요.

```bash
# 최신 코드 받기 (히스토리가 교체됐으므로 pull 이 꼬이면 reset 사용)
git fetch origin
git reset --hard origin/main
npm install
```

### 방법 A — 목업 서버 (기본, 기존 방식)

터미널 2개로 실행합니다. 백엔드·인터넷 연결 없이 전체 화면이 동작합니다.

```bash
# 터미널 1: 가짜 백엔드 (Node 18+, 의존성 없음)
node mock-server.mjs

# 터미널 2: 프론트
npm run dev
```

- http://localhost:5173 접속 → 로그인은 **아무 값이나 입력해도 통과**됩니다.
- 데이터는 메모리 샘플이라 서버를 재시작하면 초기화됩니다.
- 새 화면(교육청 전송·세션코드 관리·직원 이력·근무표 등)까지 목업에 반영돼 있습니다.

### 방법 B — 라이브 API (실데이터 확인용, 선택)

```bash
# PowerShell:
$env:VITE_API_TARGET = "https://hanguksafe.kr"; npm run dev
# macOS/Linux:
VITE_API_TARGET=https://hanguksafe.kr npm run dev
```

- 발급받은 계정으로 로그인하면 hanguksafe.kr 운영 화면·실데이터가 그대로 보입니다.
- ⚠️ **실제 운영 데이터**입니다. 저장/삭제 테스트는 데모용 학교·계정에서만 해주세요.
