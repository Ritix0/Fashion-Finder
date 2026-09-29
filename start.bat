@echo off
chcp 65001 > nul
title Fashion Finder

echo ===================================================
echo     Запуск Fashion Finder (Google Image Search)
echo ===================================================
echo.
echo Открытие Microsoft Edge: http://localhost:8080/index.html
echo Для завершения закройте это окно.
echo.

node "%~dp0server.js" --open
pause
