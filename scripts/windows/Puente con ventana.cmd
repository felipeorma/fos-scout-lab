@echo off
title FOS Scout Lab - Puente (cierra esta ventana para pararlo)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" ventana
echo.
pause
