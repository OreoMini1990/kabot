# 실시간 디버깅 스크립트

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Bridge APK 실시간 디버깅" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ADB 경로
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adbPath = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"

Write-Host "[1] 서비스 상태 확인..." -ForegroundColor Yellow
$serviceStatus = & $adbPath shell "dumpsys activity services | grep -i 'BridgeForegroundService'" 2>&1
if ($serviceStatus) {
    Write-Host "  [OK] BridgeForegroundService 실행 중" -ForegroundColor Green
} else {
    Write-Host "  [X] BridgeForegroundService 실행 안 됨" -ForegroundColor Red
    Write-Host "  -> 앱에서 '서비스 시작' 버튼을 눌러주세요" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[2] 로그 초기화..." -ForegroundColor Yellow
& $adbPath logcat -c
Start-Sleep -Seconds 1

Write-Host "`n[3] 실시간 로그 모니터링 시작..." -ForegroundColor Yellow
Write-Host "  -> 이제 카카오톡에서 테스트 메시지를 보내거나" -ForegroundColor Cyan
Write-Host "  -> 서버에서 응답을 생성하면 로그가 표시됩니다" -ForegroundColor Cyan
Write-Host "  -> Ctrl+C로 중지" -ForegroundColor Gray
Write-Host ""

# 필터 패턴
$patterns = @(
    "BridgeForegroundService",
    "BridgeWebSocketClient",
    "RemoteInputSender",
    "KakaoNotificationListener",
    "WebSocket",
    "roomKey",
    "MESSAGE RECEIVED",
    "send\(\)",
    "Message sent",
    "No cached replyAction"
)

# 로그 모니터링
& $adbPath logcat | ForEach-Object {
    $line = $_
    foreach ($pattern in $patterns) {
        if ($line -match $pattern) {
            Write-Host $line -ForegroundColor Gray
            break
        }
    }
}





