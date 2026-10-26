@echo off
setlocal enabledelayedexpansion
title PDFStudio Launcher

echo ================================================================
echo               PDFStudio Enterprise PDF Platform
echo                      Windows Launcher
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. Check & start PostgreSQL container
echo [1/5] Checking PostgreSQL Database...
docker start pdfstudio-postgres >nul 2>&1
if %errorlevel% neq 0 (
    echo       Starting PostgreSQL via docker compose...
    docker compose up -d postgres
) else (
    echo       PostgreSQL container is running.
)

:: 2. Launch Public API
echo [2/5] Starting Public API (http://localhost:5000)...
start "PDFStudio - Public API (Port 5000)" cmd /k "title PDFStudio - Public API (5000) && cd /d "%~dp0" && set ASPNETCORE_ENVIRONMENT=Development && dotnet run --project src/PDFStudio.PublicApi --urls http://localhost:5000"

:: 3. Launch Private API
echo [3/5] Starting Private API (http://localhost:5001)...
start "PDFStudio - Private API (Port 5001)" cmd /k "title PDFStudio - Private API (5001) && cd /d "%~dp0" && set ASPNETCORE_ENVIRONMENT=Development && dotnet run --project src/PDFStudio.PrivateApi --urls http://localhost:5001"

:: 4. Launch Background Worker
echo [4/5] Starting Background Worker...
start "PDFStudio - Worker" cmd /k "title PDFStudio - Worker && cd /d "%~dp0src\PDFStudio.Worker" && set DOTNET_ENVIRONMENT=Development && dotnet run"

:: 5. Launch Angular Web Frontend
echo [5/5] Starting Angular Web Frontend (http://localhost:4200)...
start "PDFStudio - Web UI (Port 4200)" cmd /k "title PDFStudio - Web UI (4200) && cd /d "%~dp0src\PDFStudio.Web" && npm start"

echo.
echo ================================================================
echo All PDFStudio services have been launched in separate windows!
echo Opening browser at http://localhost:4200 ...
echo ================================================================
echo.

timeout /t 6 >nul
start http://localhost:4200

echo To stop all services later, run stop.bat.
pause

