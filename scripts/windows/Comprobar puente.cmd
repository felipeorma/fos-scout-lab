@echo off
title FOS Scout Lab - Comprobar el puente
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" comprobar
echo.
pause
