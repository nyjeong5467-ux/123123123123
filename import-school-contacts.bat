@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem ============================================================
rem  [132] 학교 담당자 이메일 일괄 등록 (1회성 관리 도구)
rem  - 엑셀 "한국산업안전협회 계약 학교 목록"의 이메일을
rem    각 학교 이력대장 - 학교 정보 - 학교 담당자의 담당자 이메일에 저장
rem  - 미리보기 - 결과표 CSV - 백업 - y 확인 후 저장 - 반영 확인
rem  - 기본: 비어 있는 학교만 채움.  다른 값도 교체: import-school-contacts.bat --overwrite
rem  - 되돌리기: import-school-contacts.bat --restore "tools\school-contacts-backup-....json"
rem ============================================================
node tools\import-school-contacts.mjs %*
echo.
pause
