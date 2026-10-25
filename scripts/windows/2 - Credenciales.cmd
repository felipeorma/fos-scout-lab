@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\fos-puente.ps1" credenciales
echo Rellena el archivo, guardalo y despues abre "3 - Reiniciar puente".
pause
