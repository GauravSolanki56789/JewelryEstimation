# Force clean script - Use this if regular clean doesn't work

Write-Host "FORCE CLEANING - This will kill ALL Node/Electron processes!" -ForegroundColor Red
Write-Host "Press Ctrl+C to cancel, or any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Kill ALL Node processes
Write-Host "Killing all Node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill ALL Electron processes
Write-Host "Killing all Electron processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*electron*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill app-builder
Write-Host "Killing app-builder processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*app-builder*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Wait
Start-Sleep -Seconds 5

# Try to remove dist
Write-Host "Attempting to remove dist folder..." -ForegroundColor Yellow
if (Test-Path "dist") {
    try {
        # Rename first (sometimes works when delete doesn't)
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        Rename-Item -Path "dist" -NewName "dist_old_$timestamp" -ErrorAction Stop
        Start-Sleep -Seconds 2
        Remove-Item -Path "dist_old_$timestamp" -Recurse -Force -ErrorAction Stop
        Write-Host "Dist folder removed!" -ForegroundColor Green
    } catch {
        Write-Host "Still locked. Please:" -ForegroundColor Red
        Write-Host "1. Open Task Manager (Ctrl+Shift+Esc)" -ForegroundColor Yellow
        Write-Host "2. End ALL 'Node.js' and 'Electron' processes" -ForegroundColor Yellow
        Write-Host "3. Close File Explorer windows showing dist folder" -ForegroundColor Yellow
        Write-Host "4. Close VS Code if dist files are open" -ForegroundColor Yellow
        Write-Host "5. Run this script again" -ForegroundColor Yellow
    }
} else {
    Write-Host "Dist folder doesn't exist - already clean!" -ForegroundColor Green
}

Write-Host "Done! Now run: npm run build:win" -ForegroundColor Cyan

