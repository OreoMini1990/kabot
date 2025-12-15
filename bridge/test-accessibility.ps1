# 접근성 기반 전송 기능 테스트 스크립트
# Usage: .\test-accessibility.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "접근성 기반 전송 기능 테스트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. APK 빌드
Write-Host "[1/3] APK 빌드 중..." -ForegroundColor Yellow
& .\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] 빌드 실패" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 빌드 완료" -ForegroundColor Green
Write-Host ""

# 2. APK 설치
Write-Host "[2/3] APK 설치 중..." -ForegroundColor Yellow
$apkPath = "app\build\outputs\apk\debug\app-debug.apk"
$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") {
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
} else {
    "adb"
}

& $adbPath install -r $apkPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] 설치 실패" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 설치 완료" -ForegroundColor Green
Write-Host ""

# 3. 테스트 안내
Write-Host "[3/3] 테스트 안내" -ForegroundColor Yellow
Write-Host ""
Write-Host "다음 단계를 수행하세요:" -ForegroundColor Cyan
Write-Host "1. 앱 실행" -ForegroundColor White
Write-Host "2. 설정 > 접근성 > 설치된 서비스 > KakaoBridge 서비스 활성화" -ForegroundColor White
Write-Host "3. 기능 플래그 확인:" -ForegroundColor White
Write-Host "   - 접근성 기반 전송: 활성화 (기본값: 비활성화)" -ForegroundColor Gray
Write-Host "   - RemoteInput 기반 전송: 활성화 (기본값: 활성화)" -ForegroundColor Gray
Write-Host "4. 서비스 시작" -ForegroundColor White
Write-Host "5. 카카오톡에서 테스트 메시지 전송" -ForegroundColor White
Write-Host ""
Write-Host "기능 플래그 변경 방법:" -ForegroundColor Cyan
Write-Host "  FeatureFlags.setAccessibilitySendEnabled(context, true)" -ForegroundColor Gray
Write-Host "  FeatureFlags.setRemoteInputSendEnabled(context, false)" -ForegroundColor Gray
Write-Host ""

