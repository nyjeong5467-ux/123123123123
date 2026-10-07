@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title web-hq start
rem ============================================================
rem  web-hq 개발 서버 실행 (2026-09-30 개편)
rem  1) 이 bat이 있는 폴더의 코드를 실행 - 경로/커밋을 화면에 표시
rem  2) GitHub에 새 커밋이 있으면 받을지 물어봄 - fast-forward만, 로컬 수정 보존
rem  3) 예전 서버가 5173/3001 포트를 잡고 있으면 먼저 종료 - 옛 화면이 뜨는 주원인
rem  4) vite --strictPort --force : 포트 우회 금지 + 캐시 새로 빌드
rem  5) 백엔드는 dev-backend.mjs - 목업 + 점검표 PDF 등 보강 경로
rem  6) 파일 감시 polling 모드 : 저장하면 즉시 HMR 반영, Shift+F5로 전체 새로고침
rem  종료는 off.bat
rem ============================================================
cd /d "%~dp0"

rem ---- git 찾기 (update.bat / commit-push.bat과 동일) ----
set "GIT="
where git >nul 2>nul && set "GIT=git"
if not defined GIT if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT=%ProgramFiles%\Git\cmd\git.exe"
if not defined GIT if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" set "GIT=%ProgramFiles(x86)%\Git\cmd\git.exe"
if not defined GIT if exist "%LocalAppData%\Programs\Git\cmd\git.exe" set "GIT=%LocalAppData%\Programs\Git\cmd\git.exe"
if not defined GIT (
  for /d %%D in ("%LocalAppData%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
)

echo ============================================================
echo  web-hq 개발 서버 시작
echo  실행 폴더 : %CD%
if defined GIT "%GIT%" log -1 --date=short --format="  현재 코드 : %%h %%cd %%s"
echo ============================================================

rem ---- [1/4] GitHub 최신 확인 ----
if defined GIT (
  echo [1/4] GitHub 최신 코드 확인 중...
  set "BEHIND=0"
  set "GIT_TERMINAL_PROMPT=0"
  "%GIT%" fetch -q origin 2>nul
  for /f %%n in ('"%GIT%" rev-list --count HEAD..origin/main 2^>nul') do set "BEHIND=%%n"
  if not "!BEHIND!"=="0" (
    echo.
    echo   GitHub에 아직 받지 않은 커밋이 !BEHIND!개 있습니다:
    "%GIT%" log --oneline HEAD..origin/main
    echo.
    choice /c YN /t 15 /d N /m "  지금 받을까요? 15초 후 자동 N"
    if !errorlevel!==1 (
      "%GIT%" merge --ff-only origin/main
      if !errorlevel! neq 0 (
        echo.
        echo   [주의] 자동으로 받지 못했습니다. 로컬 커밋이 GitHub와 갈라졌거나
        echo          받을 파일을 로컬에서 수정 중입니다. 지금 버전으로 계속 실행합니다.
        echo          정리 방법: commit-push.bat 으로 올린 뒤 update.bat 실행
        echo.
      ) else (
        "%GIT%" diff --quiet ORIG_HEAD HEAD -- package.json package-lock.json || call npm install
        "%GIT%" log -1 --date=short --format="  받은 후 코드 : %%h %%cd %%s"
      )
    )
  ) else (
    echo   최신 상태입니다.
  )
) else (
  echo [1/4] git이 없어 GitHub 확인을 건너뜁니다.
)

rem ---- [2/4] 의존성 ----
if not exist "node_modules\vite" (
  echo [2/4] node_modules 없음 - npm install 실행...
  call npm install
) else (
  echo [2/4] 의존성 OK
)

rem ---- [3/4] 예전 서버 정리 - 다른 폴더/이전 실행분이 포트를 잡고 있으면 옛 화면이 뜸 ----
echo [3/4] 이전 서버 정리 중 - 포트 5173, 3001...
taskkill /f /t /fi "WINDOWTITLE eq web-hq backend (mock:3001)*" >nul 2>&1
taskkill /f /t /fi "WINDOWTITLE eq web-hq frontend (vite:5173)*" >nul 2>&1
taskkill /f /t /fi "WINDOWTITLE eq web-hq auto-push*" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":5173 " ^| findstr "LISTENING"') do taskkill /f /t /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":3001 " ^| findstr "LISTENING"') do taskkill /f /t /pid %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":3002 " ^| findstr "LISTENING"') do taskkill /f /t /pid %%p >nul 2>&1
timeout /t 1 /nobreak >nul
netstat -ano | findstr /c:":5173 " /c:":3001 " | findstr "LISTENING" >nul && (
  echo   [주의] 포트가 아직 사용 중입니다. off.bat 실행 후 다시 시도하세요.
)

rem ---- [4/4] 서버 실행 ----
rem  CHOKIDAR_USEPOLLING : Windows/바탕화면 경로에서 저장 이벤트 누락 방지 - 저장 즉시 반영
set "CHOKIDAR_USEPOLLING=true"
set "CHOKIDAR_INTERVAL=300"
echo [4/4] 서버 실행...
rem  dev-backend.mjs = 목업(3002) + 보강 경로(PDF 등)를 3001에서 제공. 없으면 기존 목업만 실행
set "BACKEND=mock-server.mjs"
if exist "dev-backend.mjs" set "BACKEND=dev-backend.mjs"
echo   백엔드: %BACKEND%
start "web-hq backend (mock:3001)" cmd /k "node --watch %BACKEND%"
start "web-hq frontend (vite:5173)" cmd /k "npm run dev -- --strictPort --force"
rem  [135] 자동 올리기 - Claude가 수정 후 push-request.txt 를 남기면 이 PC의 git 로그인으로 커밋+푸시 (최소화 창)
if exist "tools\auto-push.mjs" start "web-hq auto-push" /min cmd /k "node tools\auto-push.mjs"

set "READY="
for /l %%i in (1,1,40) do if not defined READY (
  timeout /t 1 /nobreak >nul
  netstat -ano | findstr /c:":5173 " | findstr "LISTENING" >nul && set "READY=1"
)
if not defined READY (
  echo   [주의] 40초 안에 프론트 서버가 뜨지 않았습니다. frontend 창의 오류를 확인하세요.
  pause
  exit /b 1
)

start "" http://localhost:5173
echo.
echo ============================================================
echo  준비 완료: http://localhost:5173
echo  - 파일 저장 시 자동 반영, 안 보이면 Shift+F5
echo  - 끝낼 때 off.bat / 동료에게 공유는 commit-push.bat
echo ============================================================
timeout /t 8 >nul
