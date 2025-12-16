# Bridge APK Install Script
# Usage: .\install-apk.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bridge APK Install Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# APK file path
$apkPath = "app\build\outputs\apk\debug\app-debug.apk"

# Check if APK exists
if (-not (Test-Path $apkPath)) {
    Write-Host "ERROR: APK file not found: $apkPath" -ForegroundColor Red
    Write-Host "Please build first: .\gradlew assembleDebug" -ForegroundColor Yellow
    exit 1
}

Write-Host "OK: APK file found: $apkPath" -ForegroundColor Green
$apkInfo = Get-Item $apkPath
Write-Host "  Size: $([math]::Round($apkInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host "  Modified: $($apkInfo.LastWriteTime)" -ForegroundColor Gray
Write-Host ""

# Find ADB
$adbPaths = @(
    "$env:LOCAL_APPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
    "$env:ProgramFiles(x86)\Android\android-sdk\platform-tools\adb.exe",
    "C:\Android\Sdk\platform-tools\adb.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

$adbPath = $null
foreach ($path in $adbPaths) {
    if (Test-Path $path) {
        $adbPath = $path
        Write-Host "OK: ADB found at: $path" -ForegroundColor Green
        break
    }
}

# Try ADB from PATH
if (-not $adbPath) {
    try {
        $null = Get-Command adb -ErrorAction Stop
        $adbPath = "adb"
        Write-Host "OK: ADB found in PATH" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: ADB not found." -ForegroundColor Red
        Write-Host ""
        Write-Host "Solutions:" -ForegroundColor Yellow
        Write-Host "1. Install Android SDK Platform Tools" -ForegroundColor White
        Write-Host "2. Add ADB to PATH or check these locations:" -ForegroundColor White
        foreach ($path in $adbPaths) {
            Write-Host "   - $path" -ForegroundColor Gray
        }
        Write-Host ""
        $fullPath = Resolve-Path $apkPath
        Write-Host "APK location: $fullPath" -ForegroundColor Cyan
        Write-Host "Manual install: adb install -r $fullPath" -ForegroundColor Cyan
        exit 1
    }
}

Write-Host ""

# Check device connection
Write-Host "Checking device connection..." -ForegroundColor Cyan
$devicesOutput = & $adbPath devices
Write-Host $devicesOutput

$connectedDevices = ($devicesOutput | Select-String "device$").Count
if ($connectedDevices -eq 0) {
    Write-Host ""
    Write-Host "WARNING: No devices connected." -ForegroundColor Yellow
    Write-Host "Please ensure USB debugging is enabled and device is connected." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Installation cancelled" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "Installing APK..." -ForegroundColor Cyan
Write-Host ""

# Install APK
try {
    & $adbPath install -r $apkPath
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "SUCCESS: Installation completed!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Post-installation checklist:" -ForegroundColor Yellow
        Write-Host "1. Enable Notification Listener permission" -ForegroundColor White
        Write-Host "   Settings > Apps > KakaoBridge > Notification Listener" -ForegroundColor Gray
        Write-Host "2. Enable Accessibility Service" -ForegroundColor White
        Write-Host "   Settings > Accessibility > Installed Services > KakaoBridge" -ForegroundColor Gray
        Write-Host "3. Launch app to start service" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "ERROR: Installation failed (exit code: $exitCode)" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Common solutions:" -ForegroundColor Yellow
        Write-Host "1. Check device connection" -ForegroundColor White
        Write-Host "2. Verify USB debugging is enabled" -ForegroundColor White
        Write-Host "3. Check 'Allow USB debugging' popup on device" -ForegroundColor White
        Write-Host "4. Uninstall existing app first: adb uninstall com.goodhabit.kakaobridge" -ForegroundColor White
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR: Installation failed" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
