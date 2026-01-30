# Termux 클라이언트 로그 수집 스크립트
# 사용법: .\scripts\fetch_termux_logs.ps1

param(
    [string]$LogFile = "termux_client.log",
    [int]$Lines = 100,
    [switch]$Follow,
    [switch]$Clear
)

$ErrorActionPreference = "Stop"

# ADB 경로 확인
$adbPath = "adb"
if (-not (Get-Command $adbPath -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ADB를 찾을 수 없습니다. Android SDK Platform Tools가 설치되어 있는지 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Termux 클라이언트 로그 수집" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

# 1. Termux에서 로그 파일 확인
Write-Host "`n[1단계] Termux 로그 파일 확인 중..." -ForegroundColor Yellow

$termuxLogPath = "/data/data/com.termux/files/home/kakkaobot/client_logs.log"
$localLogPath = "client_logs.log"

# 로그 파일이 있는지 확인
$logExists = & $adbPath shell "test -f $termuxLogPath && echo 'EXISTS' || echo 'NOT_EXISTS'"
if ($logExists -eq "NOT_EXISTS") {
    Write-Host "⚠️  로그 파일이 없습니다. Termux에서 Python 스크립트가 로그를 파일로 저장하도록 설정되어 있는지 확인하세요." -ForegroundColor Yellow
    Write-Host "   또는 직접 로그 확인:" -ForegroundColor Yellow
    Write-Host "   adb shell su -c 'tail -f $termuxLogPath'" -ForegroundColor Gray
} else {
    Write-Host "✅ 로그 파일 발견: $termuxLogPath" -ForegroundColor Green
    
    if ($Clear) {
        Write-Host "`n[2단계] 로그 파일 초기화 중..." -ForegroundColor Yellow
        & $adbPath shell "su -c 'echo \"\" > $termuxLogPath'"
        Write-Host "✅ 로그 파일 초기화 완료" -ForegroundColor Green
        return
    }
    
    Write-Host "`n[2단계] 로그 파일 다운로드 중..." -ForegroundColor Yellow
    & $adbPath pull "$termuxLogPath" "$localLogPath"
    
    if (Test-Path $localLogPath) {
        Write-Host "✅ 로그 파일 다운로드 완료: $localLogPath" -ForegroundColor Green
        
        if ($Follow) {
            Write-Host "`n[3단계] 실시간 로그 모니터링 (Ctrl+C로 종료)..." -ForegroundColor Yellow
            Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
            & $adbPath shell "su -c 'tail -f $termuxLogPath'"
        } else {
            Write-Host "`n[3단계] 최근 $Lines 줄 로그:" -ForegroundColor Yellow
            Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
            Get-Content $localLogPath -Tail $Lines
        }
    } else {
        Write-Host "❌ 로그 파일 다운로드 실패" -ForegroundColor Red
    }
}

# 2. Python 프로세스 직접 확인 (대안)
Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "[대안] Python 프로세스 로그 확인:" -ForegroundColor Yellow
Write-Host "  adb shell su -c 'ps aux | grep python'" -ForegroundColor Gray
Write-Host "  adb shell su -c 'logcat -d | grep -i python | tail -50'" -ForegroundColor Gray










