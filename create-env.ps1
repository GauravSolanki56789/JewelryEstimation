# PowerShell script to create .env file
Write-Host "Creating .env file for Database Configuration" -ForegroundColor Cyan
Write-Host ""

$dbHost = Read-Host "Database Host [localhost]"
if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }

$dbPort = Read-Host "Database Port [5432 or 5433]"
if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5432" }

$dbUser = Read-Host "Database User [postgres]"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "postgres" }

$dbPassword = Read-Host "Database Password (required)" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))

$dbName = Read-Host "Master Database Name [jewelry_master]"
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "jewelry_master" }

$serverPort = Read-Host "Server Port [3000]"
if ([string]::IsNullOrWhiteSpace($serverPort)) { $serverPort = "3000" }

$envContent = @"
DB_HOST=$dbHost
DB_PORT=$dbPort
DB_USER=$dbUser
DB_PASSWORD=$dbPasswordPlain
DB_NAME=$dbName
PORT=$serverPort
"@

$envContent | Out-File -FilePath ".env" -Encoding ASCII

Write-Host ""
Write-Host ".env file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create the master database (see instructions below)"
Write-Host "2. Run: npm run setup-db"
Write-Host "3. Start server: npm start"
Write-Host ""

