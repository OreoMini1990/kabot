# kakao_poller.py를 Termux로 전송하는 PowerShell 스크립트

param(
    [string]$TermuxPath = "/data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py"
)

# ADB 경로 찾기
$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { 
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" 
} elseif (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe") {
    "$env:ANDROID_HOME\platform-tools\adb.exe"
} else { 
    "adb" 
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Termux 파일 전송 스크립트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ADB 확인
try {
    $adbVersion = & $adbPath version 2>&1
    Write-Host "✅ ADB 발견: $adbPath" -ForegroundColor Green
} catch {
    Write-Host "❌ ADB를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "   다음 위치를 확인하세요:" -ForegroundColor Yellow
    Write-Host "   - $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -ForegroundColor White
    Write-Host "   - $env:ANDROID_HOME\platform-tools\adb.exe" -ForegroundColor White
    Write-Host "   - 또는 PATH에 'adb' 추가" -ForegroundColor White
    exit 1
}

# 기기 연결 확인
Write-Host "기기 연결 확인 중..." -ForegroundColor Yellow
$devices = & $adbPath devices | Select-String -Pattern "device$"
if (-not $devices) {
    Write-Host "❌ 연결된 기기가 없습니다." -ForegroundColor Red
    Write-Host ""
    Write-Host "다음 명령으로 확인하세요:" -ForegroundColor Yellow
    Write-Host "   $adbPath devices" -ForegroundColor White
    Write-Host ""
    Write-Host "USB 디버깅이 활성화되어 있는지 확인하세요." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 기기 연결 확인: $($devices.Count)개" -ForegroundColor Green
Write-Host ""

# 소스 파일 확인
$sourceFile = "client\kakao_poller.py"
if (-not (Test-Path $sourceFile)) {
    Write-Host "❌ 소스 파일을 찾을 수 없습니다: $sourceFile" -ForegroundColor Red
    Write-Host "   현재 디렉토리: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 소스 파일 확인: $sourceFile" -ForegroundColor Green
$fileSize = (Get-Item $sourceFile).Length
Write-Host "   파일 크기: $([math]::Round($fileSize / 1KB, 2)) KB" -ForegroundColor Gray
Write-Host ""

# 전송할 경로 확인
Write-Host "전송 경로: $TermuxPath" -ForegroundColor Cyan
Write-Host ""

# 사용자 확인
$confirm = Read-Host "전송을 계속하시겠습니까? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "취소되었습니다." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "파일 전송 중..." -ForegroundColor Yellow

# 파일 전송
& $adbPath push $sourceFile $TermuxPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 파일 전송 완료!" -ForegroundColor Green
    
    # 권한 설정
    Write-Host "권한 설정 중..." -ForegroundColor Yellow
    & $adbPath shell "chmod 755 $TermuxPath"
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ 완료!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Termux에서 실행하세요:" -ForegroundColor Cyan
    Write-Host "   cd ~/kakkaobot/client" -ForegroundColor White
    Write-Host "   python kakao_poller.py" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ 파일 전송 실패" -ForegroundColor Red
    Write-Host ""
    Write-Host "가능한 해결 방법:" -ForegroundColor Yellow
    Write-Host "1. Termux 경로 확인:" -ForegroundColor White
    Write-Host "   adb shell 'ls -la /data/data/com.termux/files/home/'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. 경로를 직접 지정:" -ForegroundColor White
    Write-Host "   .\deploy-to-termux.ps1 -TermuxPath '/data/data/com.termux/files/home/kakao_poller.py'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. sdcard를 통해 전송:" -ForegroundColor White
    Write-Host "   adb push client\kakao_poller.py /sdcard/" -ForegroundColor Gray
    Write-Host "   (그 다음 Termux에서 복사)" -ForegroundColor Gray
    exit 1
}

