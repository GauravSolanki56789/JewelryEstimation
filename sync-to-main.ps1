# Sync this server to main server
# Usage: .\sync-to-main.ps1

Write-Host "🔄 Syncing to Main Server..." -ForegroundColor Cyan
Write-Host ""

# Get main server IP from .env or prompt
$mainServerIP = $env:MAIN_SERVER_IP
if (-not $mainServerIP) {
    $mainServerIP = Read-Host "Enter Main Server IP address"
}

# Get passwords
$localPassword = $env:DB_PASSWORD
if (-not $localPassword) {
    $localPassword = Read-Host "Enter local PostgreSQL password" -AsSecureString
    $localPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($localPassword))
}

$mainPassword = Read-Host "Enter Main Server PostgreSQL password" -AsSecureString
$mainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($mainPassword))

# Set environment variables
$env:SOURCE_DB_HOST="localhost"
$env:SOURCE_DB_USER="postgres"
$env:SOURCE_DB_PASSWORD=$localPassword
$env:SOURCE_DB_NAME="jewelry_master"
$env:DEST_DB_HOST=$mainServerIP
$env:DEST_DB_USER="postgres"
$env:DEST_DB_PASSWORD=$mainPassword
$env:DEST_DB_NAME="jewelry_master"
$env:TENANT_CODE="jpjewellery"

Write-Host "Starting sync..." -ForegroundColor Yellow
npm run sync-db

Write-Host ""
Write-Host "✅ Sync complete!" -ForegroundColor Green

