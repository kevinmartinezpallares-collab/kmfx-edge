@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_windows_launcher.ps1" %*
exit /b %ERRORLEVEL%
