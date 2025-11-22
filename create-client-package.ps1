# PowerShell script to create client package (Windows)

Write-Host "Creating client package..." -ForegroundColor Green

# Create client directory
New-Item -ItemType Directory -Force -Path "JewelryEstimation-Client" | Out-Null
New-Item -ItemType Directory -Force -Path "JewelryEstimation-Client\public" | Out-Null
New-Item -ItemType Directory -Force -Path "JewelryEstimation-Client\config" | Out-Null

# Copy necessary files
Write-Host "Copying files..." -ForegroundColor Yellow
Copy-Item "public\index.html" -Destination "JewelryEstimation-Client\public\" -Force
Copy-Item "server.js" -Destination "JewelryEstimation-Client\" -Force
Copy-Item "config\database.js" -Destination "JewelryEstimation-Client\config\" -Force
Copy-Item "package.json" -Destination "JewelryEstimation-Client\" -Force
if (Test-Path ".env.example") {
    Copy-Item ".env.example" -Destination "JewelryEstimation-Client\" -Force
}

# Remove admin.html if exists
if (Test-Path "JewelryEstimation-Client\public\admin.html") {
    Remove-Item "JewelryEstimation-Client\public\admin.html" -Force
    Write-Host "Removed admin.html" -ForegroundColor Yellow
}

Write-Host "✅ Client package created in JewelryEstimation-Client\" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. cd JewelryEstimation-Client"
Write-Host "2. npm install"
Write-Host "3. npm run build"

