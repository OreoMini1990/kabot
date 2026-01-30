# WebSocket 연결 문제 해결 스크립트

Write-Host "=== WebSocket 연결 문제 해결 ===" -ForegroundColor Cyan

# 1. 서버 프로세스 확인
Write-Host "`n[1] 서버 프로세스 확인:" -ForegroundColor Yellow
$pm2Process = pm2 list | Select-String "labbot-node"
if ($pm2Process) {
    Write-Host "✓ PM2 프로세스 발견" -ForegroundColor Green
    pm2 list
} else {
    Write-Host "✗ PM2 프로세스 없음" -ForegroundColor Red
    Write-Host "서버를 시작하세요: pm2 start server/server.js --name labbot-node" -ForegroundColor Yellow
}

# 2. 포트 5002 확인
Write-Host "`n[2] 포트 5002 확인:" -ForegroundColor Yellow
$portCheck = netstat -ano | Select-String ":5002"
if ($portCheck) {
    Write-Host "✓ 포트 5002 사용 중" -ForegroundColor Green
    $portCheck | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "✗ 포트 5002 사용 안 함" -ForegroundColor Red
    Write-Host "서버가 실행 중이 아닐 수 있습니다." -ForegroundColor Yellow
}

# 3. 서버 로그 확인
Write-Host "`n[3] 서버 로그 확인 (최근 20줄):" -ForegroundColor Yellow
try {
    pm2 logs labbot-node --lines 20 --nostream 2>&1 | Select-Object -Last 20
} catch {
    Write-Host "로그 확인 실패: $_" -ForegroundColor Red
}

# 4. WebSocket 연결 테스트
Write-Host "`n[4] WebSocket 연결 테스트:" -ForegroundColor Yellow
$wsUrl = "ws://192.168.0.15:5002/ws"
Write-Host "WebSocket URL: $wsUrl"

# PowerShell로 WebSocket 테스트 (간단한 HTTP 요청으로 확인)
try {
    $response = Invoke-WebRequest -Uri "http://192.168.0.15:5002" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ HTTP 서버 응답: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "✗ HTTP 서버 연결 실패: $_" -ForegroundColor Red
    Write-Host "서버가 실행 중이 아니거나 방화벽 문제일 수 있습니다." -ForegroundColor Yellow
}

# 5. 서버 재시작 제안
Write-Host "`n[5] 해결 방법:" -ForegroundColor Yellow
Write-Host "1. 서버 재시작:" -ForegroundColor Cyan
Write-Host "   pm2 restart labbot-node" -ForegroundColor White
Write-Host "`n2. 서버 로그 확인:" -ForegroundColor Cyan
Write-Host "   pm2 logs labbot-node" -ForegroundColor White
Write-Host "`n3. 서버 시작 (중지된 경우):" -ForegroundColor Cyan
Write-Host "   cd server" -ForegroundColor White
Write-Host "   pm2 start server.js --name labbot-node" -ForegroundColor White
Write-Host "`n4. 환경변수 확인:" -ForegroundColor Cyan
Write-Host "   .env 파일의 PORT, SERVER_URL 확인" -ForegroundColor White

Write-Host "`n=== 확인 완료 ===" -ForegroundColor Green

















