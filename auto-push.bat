@echo off
chcp 65001 >nul
cd /d "%~dp0"
title web-hq auto-push
rem [135] 자동 올리기만 따로 켜기 (start.bat 을 쓰면 자동으로 함께 켜집니다)
node tools\auto-push.mjs
pause
