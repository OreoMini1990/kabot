# Bridge APK Test and Debugging Script

param(
    [switch]$Build,
    [switch]$Install,
    [switch]$Logs,
    [switch]$Test,
    [switch]$All
)

$ErrorActionPreference = "Stop"

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) {
    $scriptDir = $PWD.Path
}

# Find ADB path
$adbPath = if (Get-Command adb -ErrorAction SilentlyContinue) {
    "adb"
} else {
    $env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
    $adbPath = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
    if (-not (Test-Path $adbPath)) {
        Write-Host "ADB not found. Please install Android SDK or add to PATH." -ForegroundColor Red
        exit 1
    }
    $adbPath
}

Write-Host "ADB Path: $adbPath" -ForegroundColor Cyan

# Check device connection
$devices = & $adbPath devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if (-not $devices) {
    Write-Host "No Android device connected." -ForegroundColor Red
    exit 1
}

Write-Host "Connected devices:" -ForegroundColor Green
$devices | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# Build
if ($Build -or $All) {
    Write-Host "`n[1/5] Building APK..." -ForegroundColor Yellow
    Push-Location "$scriptDir"
    try {
        if (Test-Path "gradlew.bat") {
            & .\gradlew.bat assembleDebug
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Build failed" -ForegroundColor Red
                exit 1
            }
            Write-Host "Build completed" -ForegroundColor Green
        } else {
            Write-Host "gradlew.bat not found." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

# Install
if ($Install -or $All) {
    Write-Host "`n[2/5] Installing APK..." -ForegroundColor Yellow
    $apkPath = Join-Path $scriptDir "app\build\outputs\apk\debug\app-debug.apk"
    if (-not (Test-Path $apkPath)) {
        Write-Host "APK file not found: $apkPath" -ForegroundColor Red
        exit 1
    }
    
    & $adbPath install -r $apkPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installation failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "Installation completed" -ForegroundColor Green
}

# View logs
if ($Logs -or $All) {
    Write-Host "`n[3/5] Viewing logs..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop viewing logs." -ForegroundColor Gray
    Write-Host "Filtered logs:" -ForegroundColor Cyan
    Write-Host "  - BridgeForegroundService" -ForegroundColor Gray
    Write-Host "  - RemoteInputSender" -ForegroundColor Gray
    Write-Host "  - KakaoNotificationListener" -ForegroundColor Gray
    Write-Host ""
    
    & $adbPath logcat -c
    & $adbPath logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|KakaoNotificationListener|NotificationActionCache"
}

# Test
if ($Test -or $All) {
    Write-Host "`n[4/5] Running tests..." -ForegroundColor Yellow
    
    # Check service status
    Write-Host "`n[Test 1] Service Status Check" -ForegroundColor Cyan
    $serviceRunning = & $adbPath shell "dumpsys activity services | grep -i 'BridgeForegroundService'"
    if ($serviceRunning) {
        Write-Host "  [OK] Service is running" -ForegroundColor Green
    } else {
        Write-Host "  [X] Service is stopped" -ForegroundColor Red
        Write-Host "  -> Please press 'Start Service' button in the app." -ForegroundColor Yellow
    }
    
    # Check notification permission
    Write-Host "`n[Test 2] Notification Access Permission Check" -ForegroundColor Cyan
    $notificationPermission = & $adbPath shell "settings get secure enabled_notification_listeners" | Out-String
    if ($notificationPermission -match "com.goodhabit.kakaobridge") {
        Write-Host "  [OK] Notification access permission granted" -ForegroundColor Green
    } else {
        Write-Host "  [X] Notification access permission required" -ForegroundColor Red
        Write-Host "  -> Please press 'Set Notification Access Permission' button in the app." -ForegroundColor Yellow
    }
    
    # Check WebSocket connection (from logs)
    Write-Host "`n[Test 3] WebSocket Connection Check" -ForegroundColor Cyan
    Write-Host "  -> Check logs for 'WebSocket connected' or 'Connecting to WebSocket' messages." -ForegroundColor Gray
    
    # Message sending test
    Write-Host "`n[Test 4] Message Sending Test" -ForegroundColor Cyan
    Write-Host "  -> Send test message from server and check logs." -ForegroundColor Gray
    Write-Host "  -> Check logs for 'Message sent successfully' or 'Waiting for notification' messages." -ForegroundColor Gray
    
    Write-Host "`nTest completed. To view logs: .\test-bridge.ps1 -Logs" -ForegroundColor Green
}

# All tests
if ($All) {
    Write-Host "`n[5/5] All tests completed" -ForegroundColor Green
    Write-Host "`nNext Steps:" -ForegroundColor Yellow
    Write-Host "  1. Open app and set permissions" -ForegroundColor Gray
    Write-Host "  2. Press 'Start Service' button" -ForegroundColor Gray
    Write-Host "  3. Send test message from server" -ForegroundColor Gray
    Write-Host "  4. Check logs: .\test-bridge.ps1 -Logs" -ForegroundColor Gray
}

# Help
if (-not ($Build -or $Install -or $Logs -or $Test -or $All)) {
    Write-Host "Bridge APK Test and Debugging Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-bridge.ps1 -Build      # Build APK" -ForegroundColor Gray
    Write-Host "  .\test-bridge.ps1 -Install     # Install APK" -ForegroundColor Gray
    Write-Host "  .\test-bridge.ps1 -Logs        # View logs (realtime)" -ForegroundColor Gray
    Write-Host "  .\test-bridge.ps1 -Test        # Run tests" -ForegroundColor Gray
    Write-Host "  .\test-bridge.ps1 -All         # Run all (build+install+test)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  .\test-bridge.ps1 -All         # Run entire process" -ForegroundColor Gray
    Write-Host "  .\test-bridge.ps1 -Logs        # View logs only" -ForegroundColor Gray
}
