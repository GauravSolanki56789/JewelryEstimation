# PowerShell script to clean build folder and rebuild

Write-Host "Cleaning build folder..." -ForegroundColor Yellow

# Kill ALL processes that might lock files
$processes = @("electron", "node", "app-builder", "JP Jewellery")
foreach ($proc in $processes) {
    Get-Process | Where-Object {$_.ProcessName -like "*$proc*"} | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Wait longer for processes to fully terminate
Start-Sleep -Seconds 3

# Remove dist folder with multiple attempts
if (Test-Path "dist") {
    Write-Host "Removing dist folder..." -ForegroundColor Yellow
    
    # Try to unlock files first
    $distPath = Resolve-Path "dist" -ErrorAction SilentlyContinue
    if ($distPath) {
        # Force close any handles (if handle.exe is available)
        $handleExe = "C:\Sysinternals\handle.exe"
        if (Test-Path $handleExe) {
            & $handleExe -p dist -accepteula | Out-Null
        }
    }
    
    # Multiple deletion attempts
    $maxAttempts = 5
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        try {
            Remove-Item -Path "dist" -Recurse -Force -ErrorAction Stop
            Write-Host "Dist folder removed successfully!" -ForegroundColor Green
            break
        } catch {
            $attempt++
            if ($attempt -lt $maxAttempts) {
                Write-Host "Attempt $attempt failed, waiting and retrying..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
                # Kill processes again
                Get-Process | Where-Object {$_.ProcessName -like "*electron*" -or $_.ProcessName -like "*node*"} | Stop-Process -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
            } else {
                Write-Host "Failed to remove dist folder. Please:" -ForegroundColor Red
                Write-Host "1. Close all Electron/Node processes manually" -ForegroundColor Red
                Write-Host "2. Close File Explorer if dist folder is open" -ForegroundColor Red
                Write-Host "3. Close VS Code if dist files are open" -ForegroundColor Red
                Write-Host "4. Restart PowerShell and try again" -ForegroundColor Red
                exit 1
            }
        }
    }
}

Write-Host "Build folder cleaned!" -ForegroundColor Green

