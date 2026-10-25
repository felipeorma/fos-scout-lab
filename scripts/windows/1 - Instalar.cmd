@echo off
title FOS Scout Lab - Instalar el puente
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" instalar
echo.
pause
