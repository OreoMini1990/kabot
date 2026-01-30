# 채팅 로그 DB 및 통계 기능 통합 테스트 실행 스크립트 (PowerShell)

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "채팅 로그 DB 및 통계 기능 테스트 시작" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 서버 디렉토리로 이동
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $scriptPath ".."
Set-Location $serverPath

# Node.js가 설치되어 있는지 확인
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
    exit 1
}

# .env 파일 확인
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env 파일이 없습니다." -ForegroundColor Yellow
    Write-Host "   Supabase 설정을 확인하세요." -ForegroundColor Yellow
    Write-Host ""
}

# 테스트 실행
Write-Host "테스트 스크립트 실행 중..." -ForegroundColor Blue
Write-Host ""

node test/test-chat-logging.js

$TEST_EXIT_CODE = $LASTEXITCODE

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

if ($TEST_EXIT_CODE -eq 0) {
    Write-Host "✅ 테스트 완료" -ForegroundColor Green
} else {
    Write-Host "❌ 테스트 실패 (종료 코드: $TEST_EXIT_CODE)" -ForegroundColor Red
    exit $TEST_EXIT_CODE
}















