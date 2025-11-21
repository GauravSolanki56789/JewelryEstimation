# Quick setup script - Run this first!
# This will navigate to the correct directory and help you set up the database

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Jewelry Estimation - Database Setup  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to project directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Green
Write-Host ""

# Check if we're in the right place
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project directory: D:\JewelryEstimation" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "Choose an option:" -ForegroundColor Yellow
Write-Host "1. Create .env file (database configuration)" -ForegroundColor White
Write-Host "2. Create database (jewelry_master)" -ForegroundColor White
Write-Host "3. Run database setup (after creating database)" -ForegroundColor White
Write-Host "4. Do all steps (recommended for first time)" -ForegroundColor Green
Write-Host ""

$choice = Read-Host "Enter choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host "Creating .env file..." -ForegroundColor Cyan
        & ".\create-env.ps1"
    }
    "2" {
        Write-Host "Creating database..." -ForegroundColor Cyan
        & ".\create-database.ps1"
    }
    "3" {
        Write-Host "Running database setup..." -ForegroundColor Cyan
        npm run setup-db
    }
    "4" {
        Write-Host "Running full setup..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Step 1: Creating .env file..." -ForegroundColor Yellow
        & ".\create-env.ps1"
        Write-Host ""
        Write-Host "Step 2: Creating database..." -ForegroundColor Yellow
        & ".\create-database.ps1"
        Write-Host ""
        Write-Host "Step 3: Running database setup..." -ForegroundColor Yellow
        npm run setup-db
        Write-Host ""
        Write-Host "Setup complete! You can now run: npm start" -ForegroundColor Green
    }
    default {
        Write-Host "Invalid choice!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

