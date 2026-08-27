@echo off
chcp 65001 >nul
rem ============================================================
rem  web-hq 최신 코드 받기 (start.bat 짝꿍)
rem  - GitHub의 최신 main을 받아옵니다. 실행 후 start.bat 하세요.
rem  - 히스토리가 교체된 적이 있어 일반 pull이 꼬일 수 있으므로
rem    fetch + reset --hard 방식을 씁니다.
rem  - 안전장치: 커밋 안 된 변경이 있으면 덮어쓰지 않고 중단합니다.
rem    (변경을 살리려면 commit-push.bat 먼저 실행)
rem ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---- git 찾기 (commit-push.bat과 동일한 탐색) ----
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
if not defined GIT (
  echo [update] git을 찾지 못했습니다. Git 설치 후 다시 실행하세요.
  pause
  exit /b 1
)

rem ---- 원격 이름 (보통 origin) ----
set "REMOTE="
for /f "delims=" %%r in ('"%GIT%" remote') do (
  if /i "%%r"=="origin" set "REMOTE=origin"
  if not defined REMOTE set "REMOTE=%%r"
)
if not defined REMOTE (
  echo [update] 원격 저장소가 설정돼 있지 않습니다.
  pause
  exit /b 1
)

echo [update] 원격(%REMOTE%)에서 최신 코드 확인 중...
"%GIT%" fetch %REMOTE%
if errorlevel 1 (
  echo [update] fetch 실패 - 인터넷 연결 또는 GitHub 접근을 확인하세요.
  pause
  exit /b 1
)

rem ---- 안전장치: 커밋 안 된 변경이 있으면 중단 (새로 만든 잡파일은 무관) ----
set "DIRTY="
for /f "delims=" %%s in ('"%GIT%" status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY (
  echo.
  echo [update] 커밋되지 않은 변경이 있어 중단합니다. 목록:
  "%GIT%" status --short --untracked-files=no
  echo.
  echo   변경을 살리려면 commit-push.bat을 먼저 실행한 뒤 다시 update.bat 하세요.
  echo   변경을 버리고 최신으로 덮어쓰려면 아래에 y 를 입력하세요.
  set /p ANSWER=  덮어쓸까요? ^(y/N^):
  if /i not "!ANSWER!"=="y" (
    echo [update] 중단했습니다. 아무것도 변경하지 않았습니다.
    pause
    exit /b 0
  )
)

echo [update] 최신 main으로 맞추는 중...
"%GIT%" reset --hard %REMOTE%/main
if errorlevel 1 (
  echo [update] 실패 - 위 메시지를 확인하세요.
  pause
  exit /b 1
)

echo [update] 의존성 확인(npm install)...
call npm install

echo.
echo [update] 완료. 이제 start.bat 을 실행하세요.
"%GIT%" log -1 --format="  현재 버전: %%h %%s"
pause
