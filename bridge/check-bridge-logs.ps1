# Bridge APK 로그 확인 스크립트 (간단 버전)
# Usage: .\check-bridge-logs.ps1

$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    Write-Host "[FAIL] ADB not found: $adbPath" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bridge APK 로그 확인" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] RemoteInputSender 로그 (알림 리플라이):" -ForegroundColor Yellow
& $adbPath logcat -d -t 500 2>&1 | Select-String "RemoteInputSender" | Select-Object -First 30
Write-Host ""

Write-Host "[2] BridgeForegroundService 로그 (메시지 전송):" -ForegroundColor Yellow
& $adbPath logcat -d -t 500 2>&1 | Select-String "BridgeForegroundService.*Step 1|BridgeForegroundService.*SUCCESS|BridgeForegroundService.*WaitingNotification" | Select-Object -First 20
Write-Host ""

Write-Host "[3] KakaoNotificationListener 로그 (알림 수신):" -ForegroundColor Yellow
& $adbPath logcat -d -t 500 2>&1 | Select-String "KakaoNotificationListener.*roomKey" | Select-Object -First 20
Write-Host ""

Write-Host "[4] FALLBACK 로그 (접근성 전환):" -ForegroundColor Yellow
& $adbPath logcat -d -t 500 2>&1 | Select-String "FALLBACK.*AccessibilitySender" | Select-Object -First 10
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "실시간 로그 모니터링:" -ForegroundColor Yellow
Write-Host "  $adbPath logcat -s RemoteInputSender:D BridgeForegroundService:D KakaoNotificationListener:D" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan

