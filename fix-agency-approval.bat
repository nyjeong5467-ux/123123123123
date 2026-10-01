@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem ============================================================
rem  [126] 기관 확인자 직책 변환 (1회성 관리 도구)
rem  - 학교가 아닌 기관(교육청·교육지원청·연수원·도서관 등)의 저장된 확인자를
rem    담당자-행정실장-교장 -> 담당자-팀장-과장 으로 변환
rem  - 미리보기 -> 백업(tools\approval-backup-*.json) -> y 확인 후 적용
rem  - 되돌리기: reset-approval.bat --restore "tools\approval-backup-....json"
rem ============================================================
node tools\reset-approval-inspectors.mjs --fix-agency %*
echo.
pause
