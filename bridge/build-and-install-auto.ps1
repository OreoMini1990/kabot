# KakaoBridge Build and Install Script (Automated)
# Usage: .\build-and-install-auto.ps1 [-DebugBuild] [-Release] [-DeviceId "device_id"]

[CmdletBinding()]
param(
    [switch]$Release,
    [switch]$DebugBuild,
    [string]$DeviceId = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KakaoBridge Build and Install Script (Automated)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Gradle wrapper
$gradlewExists = (Test-Path "gradlew.bat") -or (Test-Path "gradlew")
if (-not $gradlewExists) {
    Write-Host "[ERROR] Gradle wrapper (gradlew.bat or gradlew) not found" -ForegroundColor Red
    Write-Host "[INFO] Run this script from bridge directory" -ForegroundColor Yellow
    exit 1
}

$gradleCmd = if (Test-Path "gradlew.bat") { ".\gradlew.bat" } else { ".\gradlew" }

# 2. Determine build type
# Release 빌드는 서명이 필요하므로, 자동화 모드에서는 Debug를 기본값으로 사용
$requestedBuildType = if ($DebugBuild.IsPresent) { 
    "Debug" 
} elseif ($Release.IsPresent) { 
    "Release"
} else { 
    "Debug"  # Default to Debug for development/automation
}

$buildType = $requestedBuildType
Write-Host "[1/4] Requested build type: $requestedBuildType" -ForegroundColor Cyan

# Release 빌드는 서명이 필요하므로, 서명 키가 없으면 Debug로 전환
if ($buildType -eq "Release") {
    Write-Host "[INFO] Checking if Release APK is signed..." -ForegroundColor Cyan
    # Release 빌드 후 서명 여부 확인
}

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
$isUnsignedRelease = $false

if (-not (Test-Path $apkPath) -and $buildType -eq "Release") {
    $unsignedPath = "app\build\outputs\apk\$($buildType.ToLower())\app-$($buildType.ToLower())-unsigned.apk"
    if (Test-Path $unsignedPath) {
        $apkPath = $unsignedPath
        $isUnsignedRelease = $true
        Write-Host "[WARN] Release APK is unsigned. Unsigned Release APKs cannot be installed." -ForegroundColor Yellow
        Write-Host "[INFO] Switching to Debug build for installation..." -ForegroundColor Cyan
        # Debug APK로 전환
        $buildType = "Debug"
        $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
        if (-not (Test-Path $apkPath)) {
            Write-Host "[FAIL] Debug APK not found. Building Debug APK..." -ForegroundColor Yellow
            & $gradleCmd assembleDebug
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[FAIL] Debug build failed" -ForegroundColor Red
                exit 1
            }
        }
    }
}

if (-not (Test-Path $apkPath)) {
    Write-Host "[FAIL] APK file not found: $apkPath" -ForegroundColor Red
    $altApks = Get-ChildItem -Path "app\build\outputs\apk\$($buildType.ToLower())\" -Filter "*.apk" -ErrorAction SilentlyContinue
    if ($altApks) {
        $apkPath = $altApks[0].FullName
        Write-Host "[INFO] Using alternative APK: $apkPath" -ForegroundColor Cyan
    } else {
        exit 1
    }
}

Write-Host "[INFO] Final build type: $buildType" -ForegroundColor Green

Write-Host "[INFO] APK path: $apkPath" -ForegroundColor Cyan
$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "[INFO] APK size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# 5. Find ADB path
$adbPath = $null
$possibleAdbPaths = @(
    "adb",
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

foreach ($path in $possibleAdbPaths) {
    if ($path -eq "adb") {
        $test = Get-Command adb -ErrorAction SilentlyContinue
        if ($test) {
            $adbPath = "adb"
            break
        }
    } elseif (Test-Path $path) {
        $adbPath = $path
        break
    }
}

if (-not $adbPath) {
    Write-Host "[FAIL] ADB not found" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Using ADB: $adbPath" -ForegroundColor Cyan

# 6. Check ADB connection (automated - no user input)
Write-Host "[3/4] Checking ADB connection..." -ForegroundColor Yellow
try {
    # Wait for ADB daemon to start
    Start-Sleep -Seconds 2
    $devices = & $adbPath devices 2>&1 | Select-String -Pattern "device$"
    if (-not $devices) {
        Write-Host "[WARN] No device connected" -ForegroundColor Yellow
        Write-Host "[AUTO] Continuing anyway (automated mode)..." -ForegroundColor Cyan
    } else {
        $deviceCount = ($devices | Measure-Object).Count
        Write-Host "[OK] Connected devices: $deviceCount" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] ADB check failed: $_" -ForegroundColor Yellow
    Write-Host "[AUTO] Continuing anyway (automated mode)..." -ForegroundColor Cyan
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

