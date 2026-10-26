@echo off
title Stop PDFStudio Services

echo ================================================================
echo             Stopping all PDFStudio Services
echo ================================================================
echo.

echo Stopping .NET processes...
taskkill /F /IM PDFStudio.PublicApi.exe >nul 2>&1
taskkill /F /IM PDFStudio.PrivateApi.exe >nul 2>&1
taskkill /F /IM PDFStudio.Worker.exe >nul 2>&1

echo Closing PDFStudio command prompt windows...
taskkill /F /FI "WINDOWTITLE eq PDFStudio*" >nul 2>&1

echo Stopping any running node dev server on port 4200...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4200" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All PDFStudio background services have been stopped.
echo Note: PostgreSQL Docker container is still running in the background.
echo (Run 'docker stop pdfstudio-postgres' if you want to stop the database too).
echo.
pause

