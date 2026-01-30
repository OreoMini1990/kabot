# 서버 상태 확인 스크립트

Write-Host "=== 서버 상태 확인 ===" -ForegroundColor Cyan

# 1. PM2 프로세스 확인
Write-Host "`n[1] PM2 프로세스 확인:" -ForegroundColor Yellow
pm2 list

# 2. 서버 로그 확인 (최근 50줄)
Write-Host "`n[2] 서버 로그 (최근 50줄):" -ForegroundColor Yellow
pm2 logs labbot-node --lines 50 --nostream

# 3. WebSocket 연결 확인
Write-Host "`n[3] WebSocket 연결 확인:" -ForegroundColor Yellow
$wsUrl = "ws://192.168.0.15:5002/ws"
Write-Host "WebSocket URL: $wsUrl"
Write-Host "서버가 실행 중인지 확인하세요."

# 4. 포트 확인
Write-Host "`n[4] 포트 5002 확인:" -ForegroundColor Yellow
netstat -ano | findstr :5002

# 5. 환경변수 확인
Write-Host "`n[5] 환경변수 확인:" -ForegroundColor Yellow
Write-Host "NAVER_CLIENT_ID: $env:NAVER_CLIENT_ID"
Write-Host "NAVER_CLIENT_SECRET: $env:NAVER_CLIENT_SECRET"

Write-Host "`n=== 확인 완료 ===" -ForegroundColor Green

















