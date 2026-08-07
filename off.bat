@echo off
chcp 65001 >nul
rem ============================================================
rem  web-hq 개발 서버 일괄 종료 (start.bat 짝꿍)
rem  - 서버 창을 그냥 닫아서 node 프로세스만 남았을 때 실행하세요.
rem  - 1) start.bat이 연 창 제목으로 종료
rem  - 2) 그래도 남으면 포트 3001(mock)·5173(vite) 점유 프로세스를 찾아 종료
rem ============================================================
echo [off] web-hq 서버 종료 중...

rem 1) start.bat이 연 창 제목 기준 종료 (하위 프로세스 포함 /t)
taskkill /f /t /fi "WINDOWTITLE eq web-hq backend (mock:3001)*" >nul 2>&1
taskkill /f /t /fi "WINDOWTITLE eq web-hq frontend (vite:5173)*" >nul 2>&1

rem 2) 창 없이 남은 프로세스는 포트 기준으로 종료
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /f /t /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /t /pid %%p >nul 2>&1

echo [off] 완료. 남아있는 서버 확인:
netstat -ano | findstr ":3001 :5173" | findstr "LISTENING"
if errorlevel 1 echo   (없음 - 모두 종료되었습니다)
pause
