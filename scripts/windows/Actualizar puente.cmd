@echo off
title FOS Scout Lab - Actualizar el puente
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" actualizar
echo.
pause
