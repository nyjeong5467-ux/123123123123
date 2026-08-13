@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "LOG=commit-push-log.txt"
echo ==== commit log ==== > "%LOG%"

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
  echo git not found. See log: %LOG%
  pause
  exit /b 1
)
echo git = !GIT! >> "%LOG%"

echo Commit and push [075]-[102] ...
"!GIT!" add -A >> "%LOG%" 2>&1
"!GIT!" -c i18n.commitEncoding=utf-8 commit -F commit-msg-075-102.txt >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Commit failed or nothing to commit - see log below
  type "%LOG%"
  pause
  exit /b 1
)
echo Commit done. Pushing...
"!GIT!" push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Push failed - see log below ^(commit is done^)
  type "%LOG%"
  pause
  exit /b 1
)
echo Done! Uploaded to GitHub.
type "%LOG%"
pause
