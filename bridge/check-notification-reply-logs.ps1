# Bridge APK 알림 리플라이 로그 확인 스크립트
# Usage: .\check-notification-reply-logs.ps1

$ErrorActionPreference = "Continue"

# ADB 경로 찾기
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

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bridge APK 알림 리플라이 로그 확인" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "관련 로그 태그:" -ForegroundColor Yellow
Write-Host "  - RemoteInputSender: 알림 리플라이 시도/성공/실패" -ForegroundColor White
Write-Host "  - BridgeForegroundService: 메시지 전송 처리" -ForegroundColor White
Write-Host "  - KakaoNotificationListener: 알림 수신 및 캐시" -ForegroundColor White
Write-Host ""
Write-Host "로그 필터링 키워드:" -ForegroundColor Yellow
Write-Host "  - '알림 리플라이'" -ForegroundColor White
Write-Host "  - 'RemoteInputSender'" -ForegroundColor White
Write-Host "  - 'WaitingNotification'" -ForegroundColor White
Write-Host "  - 'PendingIntent'" -ForegroundColor White
Write-Host "  - 'roomKey'" -ForegroundColor White
Write-Host "  - 'FALLBACK'" -ForegroundColor White
Write-Host ""
Write-Host "로그를 보려면 아래 명령어를 실행하세요:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 전체 Bridge 관련 로그:" -ForegroundColor Cyan
Write-Host "   $adbPath logcat | Select-String 'RemoteInputSender|BridgeForegroundService|KakaoNotificationListener'" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 알림 리플라이 관련 로그만:" -ForegroundColor Cyan
Write-Host "   $adbPath logcat | Select-String '알림 리플라이|RemoteInputSender|PendingIntent|WaitingNotification'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. roomKey 매칭 관련 로그:" -ForegroundColor Cyan
Write-Host "   $adbPath logcat | Select-String 'roomKey|캐시|Cache'" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 실시간 로그 모니터링 (최근 100줄):" -ForegroundColor Cyan
Write-Host "   $adbPath logcat -t 100 | Select-String 'RemoteInputSender|BridgeForegroundService'" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "최근 로그 확인 중..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 최근 로그 확인
$recentLogs = & $adbPath logcat -d -t 200 2>&1 | Select-String -Pattern "RemoteInputSender|BridgeForegroundService|KakaoNotificationListener|알림 리플라이|WaitingNotification|PendingIntent" -Context 0,2

if ($recentLogs) {
    Write-Host "발견된 관련 로그:" -ForegroundColor Green
    Write-Host ""
    $recentLogs | ForEach-Object {
        $line = $_.Line
        if ($line -match "알림 리플라이|RemoteInputSender|PendingIntent") {
            Write-Host $line -ForegroundColor Cyan
        } elseif ($line -match "WaitingNotification|FALLBACK") {
            Write-Host $line -ForegroundColor Yellow
        } elseif ($line -match "✓✓✓|SUCCESS|성공") {
            Write-Host $line -ForegroundColor Green
        } elseif ($line -match "✗|FAIL|실패|WARN") {
            Write-Host $line -ForegroundColor Red
        } else {
            Write-Host $line -ForegroundColor Gray
        }
    }
} else {
    Write-Host "[INFO] 관련 로그가 발견되지 않았습니다." -ForegroundColor Yellow
    Write-Host "[INFO] 메시지를 전송해보고 다시 확인해보세요." -ForegroundColor Yellow
}

Write-Host ""

