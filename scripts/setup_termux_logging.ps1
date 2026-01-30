# Termux에서 Python 스크립트 로그를 파일로 저장하도록 설정
# 사용법: .\scripts\setup_termux_logging.ps1

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Termux 로깅 설정" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

# ADB 경로 확인
$adbPath = "adb"
if (-not (Get-Command $adbPath -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ADB를 찾을 수 없습니다." -ForegroundColor Red
    exit 1
}

$termuxLogPath = "/data/data/com.termux/files/home/kakkaobot/client_logs.log"

Write-Host "`n[설정] Termux에서 로그 파일 설정..." -ForegroundColor Yellow

# Termux에서 로그 디렉토리 생성 및 권한 설정
& $adbPath shell "su -c 'mkdir -p /data/data/com.termux/files/home/kakkaobot && touch $termuxLogPath && chmod 666 $termuxLogPath'"

Write-Host "✅ 로그 파일 설정 완료: $termuxLogPath" -ForegroundColor Green

Write-Host "`n[사용법]" -ForegroundColor Yellow
Write-Host "Termux에서 Python 스크립트를 실행할 때:" -ForegroundColor Gray
Write-Host "  python a.py 2>&1 | tee client_logs.log" -ForegroundColor Cyan
Write-Host "또는 백그라운드로 실행:" -ForegroundColor Gray
Write-Host "  nohup python a.py > client_logs.log 2>&1 &" -ForegroundColor Cyan

Write-Host "`n[로그 확인]" -ForegroundColor Yellow
Write-Host "  .\scripts\fetch_termux_logs.ps1" -ForegroundColor Cyan










