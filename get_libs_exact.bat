\
@echo off
REM Descarga librerías locales (requiere PowerShell)
powershell -ExecutionPolicy Bypass -File "%~dp0get_libs_exact.ps1"
pause
