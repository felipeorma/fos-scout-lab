@echo off
title FOS Scout Lab - Reiniciar el puente
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" reiniciar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" comprobar
echo.
pause
