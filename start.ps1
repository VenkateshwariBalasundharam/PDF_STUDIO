# PDFStudio PowerShell Launcher
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "              PDFStudio Enterprise Platform" -ForegroundColor Cyan
Write-Host "                   Windows Launcher" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

# 1. PostgreSQL Docker container
Write-Host "[1/5] Checking PostgreSQL Database..." -ForegroundColor Yellow
docker start pdfstudio-postgres 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      Starting PostgreSQL via docker compose..." -ForegroundColor DarkGray
    docker compose up -d postgres
} else {
    Write-Host "      PostgreSQL container is running." -ForegroundColor Green
}

# 2. Public API
Write-Host "[2/5] Starting Public API (http://localhost:5000)..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k title PDFStudio - Public API (5000) && cd /d `"$root`" && set ASPNETCORE_ENVIRONMENT=Development && dotnet run --project src/PDFStudio.PublicApi --urls http://localhost:5000"

# 3. Private API
Write-Host "[3/5] Starting Private API (http://localhost:5001)..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k title PDFStudio - Private API (5001) && cd /d `"$root`" && set ASPNETCORE_ENVIRONMENT=Development && dotnet run --project src/PDFStudio.PrivateApi --urls http://localhost:5001"

# 4. Background Worker
Write-Host "[4/5] Starting Background Worker..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k title PDFStudio - Worker && cd /d `"$root\src\PDFStudio.Worker`" && set DOTNET_ENVIRONMENT=Development && dotnet run"

# 5. Angular Web Frontend
Write-Host "[5/5] Starting Angular Web Frontend (http://localhost:4200)..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k title PDFStudio - Web UI (4200) && cd /d `"$root\src\PDFStudio.Web`" && npm start"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "All PDFStudio services launched in separate windows!" -ForegroundColor Green
Write-Host "Opening browser at http://localhost:4200 ..." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 6
Start-Process "http://localhost:4200"

