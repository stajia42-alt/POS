@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURAR_GEMINI_GRATIS.ps1"
pause
