@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "LOG=commit-push-log.txt"
echo ==== 실행 시작 ==== > "%LOG%"

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
  echo git 실행 파일을 찾지 못했습니다. >> "%LOG%"
  echo git 실행 파일을 찾지 못했습니다. 로그: %LOG%
  pause
  exit /b 1
)
echo git = !GIT! >> "%LOG%"

echo [067]~[074] 작업분을 커밋하고 GitHub에 푸시합니다...
"!GIT!" add -A >> "%LOG%" 2>&1
"!GIT!" -c i18n.commitEncoding=utf-8 commit -F commit-msg-067-074.txt >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 커밋 실패 또는 커밋할 변경 없음 - 아래 로그 확인
  type "%LOG%"
  pause
  exit /b 1
)
echo 커밋 완료. 푸시 중...
"!GIT!" push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 푸시 실패 - 아래 로그 확인 ^(커밋은 완료됨^)
  type "%LOG%"
  pause
  exit /b 1
)
echo 완료! GitHub에 업로드되었습니다.
type "%LOG%"
pause
