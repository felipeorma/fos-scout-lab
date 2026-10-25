@echo off
title FOS Scout Lab - Desinstalar el puente
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" desinstalar
echo.
pause
