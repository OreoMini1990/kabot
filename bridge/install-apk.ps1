# KakaoBridge APK 설치 스크립트
# Usage: .\install-apk.ps1 [APK_PATH]

[CmdletBinding()]
param(
    [string]$ApkPath = "app\build\outputs\apk\debug\app-debug.apk"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KakaoBridge APK 설치" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ADB 경로 찾기
$adbPath = $null
$possibleAdbPaths = @(
    "adb",  # PATH에서 먼저 시도
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

foreach ($path in $possibleAdbPaths) {
    try {
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
    } catch {
        continue
    }
}

if (-not $adbPath) {
    Write-Host "[FAIL] ADB를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "[INFO] Android SDK Platform Tools를 설치하거나 PATH에 추가하세요." -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] ADB 경로: $adbPath" -ForegroundColor Cyan

# APK 경로 확인
if (-not (Test-Path $ApkPath)) {
    Write-Host "[FAIL] APK 파일을 찾을 수 없습니다: $ApkPath" -ForegroundColor Red
    exit 1
}

$apkFullPath = Resolve-Path $ApkPath
Write-Host "[INFO] APK 경로: $apkFullPath" -ForegroundColor Cyan
$apkSize = (Get-Item $apkFullPath).Length / 1MB
Write-Host "[INFO] APK 크기: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# 디바이스 연결 확인
Write-Host "[1/2] 디바이스 연결 확인 중..." -ForegroundColor Yellow
try {
    $devices = & $adbPath devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "ADB 실행 실패"
    }
    
    $connectedDevices = & $adbPath devices | Select-String -Pattern "device$" | Measure-Object
    if ($connectedDevices.Count -eq 0) {
        Write-Host "[WARN] 연결된 디바이스가 없습니다." -ForegroundColor Yellow
        Write-Host "[INFO] USB 디버깅이 활성화되어 있고 디바이스가 연결되어 있는지 확인하세요." -ForegroundColor Yellow
        
        $continue = Read-Host "계속 진행하시겠습니까? (y/n)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 0
        }
    } else {
        Write-Host "[OK] 연결된 디바이스: $($connectedDevices.Count)개" -ForegroundColor Green
    }
} catch {
    Write-Host "[FAIL] 디바이스 확인 실패: $_" -ForegroundColor Red
    exit 1
}

# APK 설치
Write-Host "[2/2] APK 설치 중..." -ForegroundColor Yellow
try {
    Write-Host "[CMD] $adbPath install -r `"$apkFullPath`"" -ForegroundColor Gray
    & $adbPath install -r $apkFullPath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] 설치 완료!" -ForegroundColor Green
    } else {
        throw "설치 실패 (코드: $LASTEXITCODE)"
    }
} catch {
    Write-Host "[FAIL] 설치 실패: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "설치 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "1. Galaxy A16에서 KakaoBridge 앱 실행" -ForegroundColor White
Write-Host "2. 알림 접근 권한 설정 (앱에서 자동 요청)" -ForegroundColor White
Write-Host "3. 배터리 최적화 제외 설정 (앱에서 자동 요청)" -ForegroundColor White
Write-Host "4. '서비스 시작' 버튼 클릭" -ForegroundColor White
Write-Host ""

