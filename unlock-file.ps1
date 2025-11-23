# Unlock and delete locked files using Windows handles

Write-Host "Attempting to unlock app.asar file..." -ForegroundColor Yellow

# Method 1: Use openfiles to find what's locking it
$lockedFile = "D:\JewelryEstimation\dist\win-unpacked\resources\app.asar"
if (Test-Path $lockedFile) {
    Write-Host "File exists: $lockedFile" -ForegroundColor Yellow
    
    # Try to get file handle info (requires admin)
    try {
        $handles = openfiles /query /fo csv 2>$null | ConvertFrom-Csv -ErrorAction SilentlyContinue
        if ($handles) {
            $fileHandles = $handles | Where-Object { $_.'Accessed By' -like "*app.asar*" -or $_.'File Name' -like "*app.asar*" }
            if ($fileHandles) {
                Write-Host "Found handles locking the file:" -ForegroundColor Red
                $fileHandles | Format-Table
            }
        }
    } catch {
        Write-Host "Could not query file handles (may need admin rights)" -ForegroundColor Yellow
    }
    
    # Method 2: Try to take ownership and delete
    Write-Host "Attempting to take ownership..." -ForegroundColor Yellow
    try {
        takeown /f $lockedFile /a 2>$null
        icacls $lockedFile /grant administrators:F 2>$null
        Remove-Item $lockedFile -Force -ErrorAction Stop
        Write-Host "File deleted successfully!" -ForegroundColor Green
    } catch {
        Write-Host "Still locked. Trying alternative method..." -ForegroundColor Yellow
        
        # Method 3: Use robocopy to delete (works on locked files)
        $tempDir = ".\temp_delete_$(Get-Date -Format 'yyyyMMddHHmmss')"
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        robocopy $tempDir "dist\win-unpacked\resources" /MIR /R:0 /W:0 2>$null
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        
        # Try delete again
        Start-Sleep -Seconds 1
        if (Test-Path $lockedFile) {
            Remove-Item $lockedFile -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "Done!" -ForegroundColor Green

