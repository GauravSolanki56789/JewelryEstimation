# Script to create a new client/tenant in the database
param(
    [string]$TenantCode = "jpjewellery",
    [string]$TenantName = "JP Jewellery",
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = "123456"
)

Write-Host "Creating tenant: $TenantName" -ForegroundColor Cyan
Write-Host ""

$body = @{
    tenantCode = $TenantCode
    tenantName = $TenantName
    adminUsername = $AdminUsername
    adminPassword = $AdminPassword
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants" -Method POST -Body $body -ContentType "application/json"
    Write-Host "✅ Tenant created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tenant Code: $($response.tenantCode)" -ForegroundColor Yellow
    Write-Host "Database: $($response.databaseName)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Client setup complete!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error creating tenant:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

