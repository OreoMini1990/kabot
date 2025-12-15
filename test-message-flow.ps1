# 메시지 플로우 테스트 스크립트

param(
    [switch]$Server,
    [switch]$Client,
    [switch]$Bridge,
    [switch]$All
)

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Message Flow Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ADB 경로
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adbPath = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"

# 서버 테스트
if ($Server -or $All) {
    Write-Host "[1/3] Server Status" -ForegroundColor Yellow
    
    # 서버가 실행 중인지 확인 (포트 5002)
    $serverRunning = Test-NetConnection -ComputerName 211.218.42.222 -Port 5002 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($serverRunning) {
        Write-Host "  [OK] Server is running on port 5002" -ForegroundColor Green
    } else {
        Write-Host "  [X] Server is not accessible on port 5002" -ForegroundColor Red
        Write-Host "  -> Please start server: cd server; node server.js" -ForegroundColor Yellow
    }
}

# 클라이언트 테스트
if ($Client -or $All) {
    Write-Host "`n[2/3] Client Status" -ForegroundColor Yellow
    Write-Host "  -> Check if client is running: cd client; python kakao_poller.py" -ForegroundColor Gray
    Write-Host "  -> Client should be polling KakaoTalk DB and sending to server" -ForegroundColor Gray
}

# Bridge APK 테스트
if ($Bridge -or $All) {
    Write-Host "`n[3/3] Bridge APK Status" -ForegroundColor Yellow
    
    # 서비스 상태
    $serviceStatus = & $adbPath shell "dumpsys activity services | grep -i 'BridgeForegroundService'" 2>&1
    if ($serviceStatus) {
        Write-Host "  [OK] BridgeForegroundService is running" -ForegroundColor Green
    } else {
        Write-Host "  [X] BridgeForegroundService is not running" -ForegroundColor Red
        Write-Host "  -> Please start service in the app" -ForegroundColor Yellow
    }
    
    # WebSocket 연결 확인
    Write-Host "`n  Checking WebSocket connection..." -ForegroundColor Cyan
    & $adbPath logcat -c
    Start-Sleep -Seconds 2
    
    Write-Host "  -> Please send a test message from KakaoTalk now..." -ForegroundColor Yellow
    Write-Host "  -> Monitoring logs for 20 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 20
    
    $logs = & $adbPath logcat -d -t 100 | Select-String -Pattern "BridgeForegroundService|WebSocket|Received|send|roomKey|RemoteInput" | Select-Object -Last 30
    
    if ($logs) {
        Write-Host "`n  Recent logs:" -ForegroundColor Cyan
        $logs | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    } else {
        Write-Host "  [X] No relevant logs found" -ForegroundColor Red
        Write-Host "  -> WebSocket may not be connected" -ForegroundColor Yellow
    }
    
    # 알림 캐시 확인
    Write-Host "`n  Checking notification cache..." -ForegroundColor Cyan
    $notificationLogs = & $adbPath logcat -d -t 200 | Select-String -Pattern "KakaoNotificationListener|roomKey|Available cached" | Select-Object -Last 10
    if ($notificationLogs) {
        Write-Host "  Notification logs:" -ForegroundColor Cyan
        $notificationLogs | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    } else {
        Write-Host "  [X] No notification logs found" -ForegroundColor Red
        Write-Host "  -> No KakaoTalk notifications detected" -ForegroundColor Yellow
    }
}

# 전체 테스트
if ($All) {
    Write-Host "`n================================================" -ForegroundColor Cyan
    Write-Host "Test Complete" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check server logs for '[Bridge 전송]' messages" -ForegroundColor Gray
    Write-Host "  2. Check Bridge APK logs for 'Received WebSocket message'" -ForegroundColor Gray
    Write-Host "  3. Check if roomKey matches between server and notification cache" -ForegroundColor Gray
    Write-Host "  4. Ensure KakaoTalk notification is received before sending reply" -ForegroundColor Gray
}

# 도움말
if (-not ($Server -or $Client -or $Bridge -or $All)) {
    Write-Host "Message Flow Test Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-message-flow.ps1 -Server    # Test server" -ForegroundColor Gray
    Write-Host "  .\test-message-flow.ps1 -Client    # Test client" -ForegroundColor Gray
    Write-Host "  .\test-message-flow.ps1 -Bridge    # Test Bridge APK" -ForegroundColor Gray
    Write-Host "  .\test-message-flow.ps1 -All       # Test all" -ForegroundColor Gray
}

