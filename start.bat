@echo off
chcp 65001 >nul
rem ============================================================
rem  web-hq 개발 서버 일괄 실행
rem  - 백엔드(mock) : node --watch mock-server.mjs (수정 시 자동 재시작)
rem  - 프론트(vite) : npm run dev (수정 시 자동 반영/HMR)
rem  창 2개가 열립니다. 종료하려면 두 창을 닫으세요.
rem ============================================================
cd /d "%~dp0"

if not exist node_modules (
  echo [setup] node_modules not found. Running npm install...
  call npm install
)

start "web-hq backend (mock:3001)" cmd /k "node --watch mock-server.mjs"
start "web-hq frontend (vite:5173)" cmd /k "npm run dev"

echo Waiting for servers...
timeout /t 4 >nul
start http://localhost:5173
