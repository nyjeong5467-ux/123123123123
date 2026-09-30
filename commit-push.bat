@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
rem ============================================================
rem  작업 반영: 변경 파일 전부 커밋 -> GitHub main 푸시
rem  [124] 한글 커밋 메시지 입력 수정
rem   - cmd의 set /p 는 UTF-8 모드에서 한글 입력이 빈 값이 되어 "메시지가 비어 있어 중단" 발생
rem     -> PowerShell 입력창으로 받아 UTF-8 파일로 커밋 (git commit -F)
rem   - commit-msg.txt 가 있으면 그 내용을 메시지로 제안 (Y 누르면 그대로 사용, 커밋 후 자동 삭제)
rem ============================================================

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

rem 줄바꿈 경고 숨김 - 이 PC에서만 적용, 내용 변경 없음
"!GIT!" config core.safecrlf false >nul 2>&1

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

set "MSGFILE=%TEMP%\webhq-commit-msg.txt"
if exist "%MSGFILE%" del "%MSGFILE%" >nul 2>&1
set "USED_PRESET="

rem ---- 1) 준비된 메시지 파일(commit-msg.txt)이 있으면 제안 ----
if exist "commit-msg.txt" (
  echo === 준비된 커밋 메시지 - commit-msg.txt ===
  type "commit-msg.txt"
  echo.
  choice /c YN /m "이 메시지로 커밋할까요? N = 직접 입력"
  if !errorlevel!==1 (
    copy /y "commit-msg.txt" "%MSGFILE%" >nul
    set "USED_PRESET=1"
  )
)

rem ---- 2) 직접 입력 - PowerShell 입력창이라 한글 입력 가능 ----
if not exist "%MSGFILE%" (
  powershell -NoProfile -Command "$m = Read-Host '커밋 메시지(무엇을 고쳤는지 한 줄)'; if ($m.Trim()) { [IO.File]::WriteAllText($env:MSGFILE, $m.Trim(), (New-Object Text.UTF8Encoding $false)) }"
)
if not exist "%MSGFILE%" (
  echo 메시지가 비어 있어 중단합니다. 아무것도 변경하지 않았습니다.
  pause
  exit /b 1
)

"!GIT!" add -A
"!GIT!" -c i18n.commitEncoding=utf-8 commit -F "%MSGFILE%"
if errorlevel 1 (
  echo 커밋 실패 - 위 메시지를 확인하세요.
  pause
  exit /b 1
)
del "%MSGFILE%" >nul 2>&1
if defined USED_PRESET del "commit-msg.txt" >nul 2>&1

echo 커밋 완료. GitHub로 올리는 중...
"!GIT!" push origin main
if errorlevel 1 (
  echo.
  echo 푸시 실패 ^(커밋은 됐습니다^). 먼저 start.bat 에서 최신 받기 Y 후 다시 실행하세요.
  pause
  exit /b 1
)
echo.
"!GIT!" log -1 --format="  올라간 버전: %%h %%s"
echo 완료! GitHub에 올라갔습니다.
pause
