@echo off
title Prometheus Elegance - Servidor Local
echo ========================================================
echo   Iniciando o Servidor Local da Prometheus Elegance...
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
