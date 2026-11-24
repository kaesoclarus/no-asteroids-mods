@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0NoAsteroidsBackup.ps1" list
pause
