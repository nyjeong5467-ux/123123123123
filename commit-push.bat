@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
rem 작업 반영: 변경 파일 전부 커밋 → GitHub main 푸시. 커밋 메시지는 실행 시 입력.

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
  echo [commit-push] git을 찾지 못했습니다. Git 설치 후 다시 실행하세요.
  pause
  exit /b 1
)

echo === 변경된 파일 ===
"!GIT!" status --short
"!GIT!" diff --quiet && "!GIT!" diff --cached --quiet && (
  for /f %%n in ('"!GIT!" ls-files --others --exclude-standard ^| find /c /v ""') do if %%n==0 (
    echo 변경 사항이 없습니다.
    pause
    exit /b 0
  )
)
echo.
set "MSG="
set /p MSG=커밋 메시지(무엇을 고쳤는지 한 줄):
if "!MSG!"=="" (
  echo 메시지가 비어 있어 중단합니다.
  pause
  exit /b 1
)

"!GIT!" add -A
"!GIT!" -c i18n.commitEncoding=utf-8 commit -m "!MSG!"
if errorlevel 1 (
  echo 커밋 실패 - 위 메시지를 확인하세요.
  pause
  exit /b 1
)
echo 커밋 완료. GitHub로 올리는 중...
"!GIT!" push origin main
if errorlevel 1 (
  echo.
  echo 푸시 실패 ^(커밋은 됐습니다^). 먼저 update.bat 로 최신 코드를 받은 뒤 다시 실행하세요.
  pause
  exit /b 1
)
echo 완료! GitHub에 올라갔습니다.
pause
