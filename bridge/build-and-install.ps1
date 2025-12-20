# KakaoBridge Build and Install Script
# Usage: .\build-and-install.ps1

[CmdletBinding()]
param(
    [switch]$Release,
    [switch]$DebugBuild,
    [string]$DeviceId = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KakaoBridge Build and Install Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Gradle wrapper
$gradlewExists = (Test-Path "gradlew.bat") -or (Test-Path "gradlew")
if (-not $gradlewExists) {
    Write-Host "[ERROR] Gradle wrapper (gradlew.bat or gradlew) not found" -ForegroundColor Red
    Write-Host "[INFO] Run this script from bridge directory" -ForegroundColor Yellow
    Write-Host "[INFO] If this is a new project, you may need to initialize Gradle wrapper first" -ForegroundColor Yellow
    Write-Host "[INFO] Try: .\create-gradle-wrapper-simple.ps1" -ForegroundColor Yellow
    exit 1
}

# Determine which gradle wrapper to use
$gradleCmd = if (Test-Path "gradlew.bat") { ".\gradlew.bat" } else { ".\gradlew" }

# 2. Determine build type
# Default to Release if neither DebugBuild nor Release is specified
$buildType = if ($DebugBuild.IsPresent) { 
    "Debug" 
} elseif ($Release.IsPresent) { 
    "Release" 
} else { 
    "Release"  # Default
}
Write-Host "[1/4] Build type: $buildType" -ForegroundColor Green

# 3. Build APK
Write-Host "[2/4] Building APK..." -ForegroundColor Yellow
try {
    if ($buildType -eq "Debug") {
        & $gradleCmd assembleDebug
    } else {
        & $gradleCmd assembleRelease
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    
    Write-Host "[OK] Build completed" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Build failed: $_" -ForegroundColor Red
    exit 1
}

# 4. Check APK file path
$apkPath = "app\build\outputs\apk\$($buildType.ToLower())\app-$($buildType.ToLower()).apk"
# Try unsigned variant for release builds
if (-not (Test-Path $apkPath) -and $buildType -eq "Release") {
    $apkPath = "app\build\outputs\apk\$($buildType.ToLower())\app-$($buildType.ToLower())-unsigned.apk"
}
if (-not (Test-Path $apkPath)) {
    Write-Host "[FAIL] APK file not found: $apkPath" -ForegroundColor Red
    Write-Host "[INFO] Checking for alternative APK files..." -ForegroundColor Yellow
    $altApks = Get-ChildItem -Path "app\build\outputs\apk\$($buildType.ToLower())\" -Filter "*.apk" -ErrorAction SilentlyContinue
    if ($altApks) {
        Write-Host "[INFO] Found APK files:" -ForegroundColor Yellow
        $altApks | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
        $apkPath = $altApks[0].FullName
        Write-Host "[INFO] Using: $apkPath" -ForegroundColor Cyan
    } else {
        exit 1
    }
}

Write-Host "[INFO] APK path: $apkPath" -ForegroundColor Cyan
$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "[INFO] APK size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# 5. Find ADB path
$adbPath = $null
# Try to find ADB in common locations
$possibleAdbPaths = @(
    "adb",  # Try PATH first
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

foreach ($path in $possibleAdbPaths) {
    try {
        if ($path -eq "adb") {
            # Try to use adb from PATH
            $test = Get-Command adb -ErrorAction SilentlyContinue
            if ($test) {
                $adbPath = "adb"
                break
            }
        } elseif (Test-Path $path) {
            $adbPath = $path
            break
        }
    } catch {
        continue
    }
}

if (-not $adbPath) {
    Write-Host "[FAIL] ADB not found. Please install Android SDK Platform Tools." -ForegroundColor Red
    Write-Host "[INFO] Expected locations:" -ForegroundColor Yellow
    foreach ($path in $possibleAdbPaths) {
        if ($path -ne "adb") {
            Write-Host "  - $path" -ForegroundColor Gray
        }
    }
    exit 1
}

Write-Host "[INFO] Using ADB: $adbPath" -ForegroundColor Cyan

# 6. Check ADB connection
Write-Host "[3/4] Checking ADB connection..." -ForegroundColor Yellow
# ADB daemon이 시작 중일 수 있으므로 여러 번 시도
$maxRetries = 3
$retryDelay = 2
$adbWorking = $false

for ($i = 1; $i -le $maxRetries; $i++) {
    $adbCheck = & $adbPath devices 2>&1 | Out-String -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -eq 0 -or $adbCheck -match "daemon") {
        # daemon이 시작 중이면 대기 후 재시도
        if ($adbCheck -match "daemon not running" -and $i -lt $maxRetries) {
            Write-Host "[INFO] ADB daemon starting, waiting ${retryDelay}s..." -ForegroundColor Cyan
            Start-Sleep -Seconds $retryDelay
            continue
        }
        $adbWorking = $true
        break
    }
    if ($i -lt $maxRetries) {
        Write-Host "[INFO] ADB check failed, retrying ($i/$maxRetries)..." -ForegroundColor Yellow
        Start-Sleep -Seconds $retryDelay
    }
}

if (-not $adbWorking) {
    Write-Host "[WARN] ADB may not be working properly, but continuing..." -ForegroundColor Yellow
}

# 디바이스 확인
$devices = & $adbPath devices 2>&1 | Select-String -Pattern "device$" -ErrorAction SilentlyContinue
if (-not $devices) {
    Write-Host "[WARN] No device connected" -ForegroundColor Yellow
    Write-Host "[INFO] Make sure USB debugging is enabled and device is connected" -ForegroundColor Yellow
    Write-Host "[AUTO] Continuing anyway (automated mode)..." -ForegroundColor Cyan
    # 자동화 모드에서는 계속 진행
} else {
    $deviceCount = ($devices | Measure-Object).Count
    Write-Host "[OK] Connected devices: $deviceCount" -ForegroundColor Green
}

# 7. Install APK
Write-Host "[4/4] Installing APK..." -ForegroundColor Yellow
try {
    $installArgs = @("install", "-r", $apkPath)
    if ($DeviceId -and $DeviceId -ne "") {
        $installArgs = @("-s", $DeviceId) + $installArgs
    }
    
    Write-Host "[CMD] $adbPath $($installArgs -join ' ')" -ForegroundColor Gray
    & $adbPath $installArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Installation completed" -ForegroundColor Green
    } else {
        throw "Installation failed (code: $LASTEXITCODE)"
    }
} catch {
    Write-Host "[FAIL] Installation failed: $_" -ForegroundColor Red
    Write-Host "[INFO] Manual install: adb install -r `"$apkPath`"" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Launch KakaoBridge app on Galaxy A16" -ForegroundColor White
Write-Host "2. Grant notification access permission (auto-requested)" -ForegroundColor White
Write-Host "3. Exclude from battery optimization (auto-requested)" -ForegroundColor White
Write-Host "4. Click 'Start Service' button" -ForegroundColor White
Write-Host ""
Write-Host "Test command:" -ForegroundColor Yellow
$testCmd = 'adb shell am broadcast -a com.goodhabit.kakaobridge.SEND -n com.goodhabit.kakaobridge/.BridgeCommandReceiver --es token "LOCAL_DEV_TOKEN" --es roomKey "의운모" --es text "테스트 메시지"'
Write-Host $testCmd -ForegroundColor Gray
Write-Host ""
