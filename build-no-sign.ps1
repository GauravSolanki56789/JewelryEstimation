# Build script that completely skips code signing
# IMPORTANT: Run PowerShell as Administrator to avoid symbolic link errors!

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Installer (Code Signing Disabled)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  WARNING: Not running as Administrator!" -ForegroundColor Yellow
    Write-Host "   Symbolic link creation may fail." -ForegroundColor Yellow
    Write-Host "   Solution: Right-click PowerShell → Run as Administrator" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Press any key to continue anyway, or Ctrl+C to cancel..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
}

# Set environment variables to disable code signing
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""
$env:WIN_CSC_KEY_PASSWORD = ""

Write-Host "✓ Code signing disabled" -ForegroundColor Green
Write-Host "✓ Building installer..." -ForegroundColor Green
Write-Host ""

# Build
& electron-builder --win

