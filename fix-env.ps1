# Quick script to fix .env file
Write-Host "=== Fixing .env File ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (Test-Path .env) {
    Write-Host "Current .env file:" -ForegroundColor Yellow
    Get-Content .env
    Write-Host ""
    $overwrite = Read-Host "Overwrite .env file? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit
    }
}

Write-Host "Enter your PostgreSQL credentials:" -ForegroundColor Cyan
Write-Host ""

$dbHost = Read-Host "Database Host [localhost]"
if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }

$dbPort = Read-Host "Database Port [5433 for PostgreSQL 18]"
if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5433" }

$dbUser = Read-Host "Database User [postgres]"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "postgres" }

Write-Host ""
Write-Host "IMPORTANT: Enter the EXACT password you set during PostgreSQL installation" -ForegroundColor Yellow
$dbPassword = Read-Host "Database Password" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))

$dbName = Read-Host "Master Database Name [jewelry_master]"
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "jewelry_master" }

$serverPort = Read-Host "Server Port [3000]"
if ([string]::IsNullOrWhiteSpace($serverPort)) { $serverPort = "3000" }

$envContent = "DB_HOST=$dbHost`nDB_PORT=$dbPort`nDB_USER=$dbUser`nDB_PASSWORD=$dbPasswordPlain`nDB_NAME=$dbName`nPORT=$serverPort"

$envContent | Out-File -FilePath ".env" -Encoding ASCII -NoNewline

Write-Host ""
Write-Host ".env file updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Now run: npm run setup-db" -ForegroundColor Yellow

