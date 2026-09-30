@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem ============================================================
rem  [122] 결재선 점검자 이름 리셋 (1회성 관리 도구)
rem  - 학교 이력관리대장 결재선 성명 중 협회 점검자(계정) 이름만 비움
rem  - 미리보기 → 전체 백업(tools\approval-backup-*.json) → y 확인 후 적용
rem  - 되돌리기: reset-approval.bat --restore "tools\approval-backup-....json"
rem ============================================================
node tools\reset-approval-inspectors.mjs %*
echo.
pause
