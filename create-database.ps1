# PowerShell script to find PostgreSQL and create database
# Make sure you're in the project directory: cd D:\JewelryEstimation

Write-Host "Searching for PostgreSQL installation..." -ForegroundColor Cyan

# Common PostgreSQL installation paths
$possiblePaths = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\17\bin\psql.exe"
)

$psqlPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $psqlPath = $path
        Write-Host "Found PostgreSQL at: $path" -ForegroundColor Green
        break
    }
}

if (-not $psqlPath) {
    Write-Host "Could not find psql.exe automatically" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please provide the full path to psql.exe" -ForegroundColor Yellow
    Write-Host "Common locations:" -ForegroundColor Yellow
    Write-Host "  - C:\Program Files\PostgreSQL\18\bin\psql.exe" -ForegroundColor Gray
    Write-Host "  - C:\Program Files\PostgreSQL\17\bin\psql.exe" -ForegroundColor Gray
    Write-Host ""
    $psqlPath = Read-Host "Enter full path to psql.exe"
    
    if (-not (Test-Path $psqlPath)) {
        Write-Host "File not found at: $psqlPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Creating database..." -ForegroundColor Cyan

# Get port
$port = Read-Host "Enter PostgreSQL port [5432 or 5433]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = "5432" }

# Get password
$password = Read-Host "Enter PostgreSQL password for user 'postgres'" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $passwordPlain

# Create database
Write-Host ""
Write-Host "Creating database 'jewelry_master'..." -ForegroundColor Yellow
& $psqlPath -U postgres -p $port -c "CREATE DATABASE jewelry_master;"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Database 'jewelry_master' created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Make sure .env file is created (run .\create-env.ps1 if not done)" -ForegroundColor Yellow
    Write-Host "2. Run: npm run setup-db" -ForegroundColor Yellow
    Write-Host "3. Start server: npm start" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Failed to create database. Check your password and port." -ForegroundColor Red
    Write-Host "You can also create it manually using pgAdmin (GUI tool)" -ForegroundColor Yellow
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD

