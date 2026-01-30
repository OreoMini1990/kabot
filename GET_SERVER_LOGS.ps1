# 서버 로그 확인 스크립트 (Windows PowerShell)
# SSH로 서버에 접속하여 로그 확인

$SSH_HOST = "192.168.0.15"
$SSH_USER = "root"
$PM2_APP = "kakkaobot-server"

Write-Host "=== 서버 로그 확인 ===" -ForegroundColor Cyan
Write-Host ""

# SSH로 PM2 로그 확인
Write-Host "1. PM2 로그 (최근 50줄):" -ForegroundColor Yellow
$pm2Logs = ssh "${SSH_USER}@${SSH_HOST}" "pm2 logs ${PM2_APP} --lines 50 --nostream 2>&1"
$pm2Logs | Select-Object -Last 50

Write-Host ""
Write-Host "2. PM2 에러 로그 (최근 50줄):" -ForegroundColor Yellow
$pm2ErrorLogs = ssh "${SSH_USER}@${SSH_HOST}" "pm2 logs ${PM2_APP} --err --lines 50 --nostream 2>&1"
$pm2ErrorLogs | Select-Object -Last 50

Write-Host ""
Write-Host "3. 이미지 처리 관련 로그:" -ForegroundColor Yellow
$imageLogs = ssh "${SSH_USER}@${SSH_HOST}" "pm2 logs ${PM2_APP} --lines 200 --nostream 2>&1 | grep -E '이미지 처리|imageProcessor|imageDownloader|Bridge|인증' | tail -n 30"
$imageLogs

Write-Host ""
Write-Host "4. 최근 에러 로그:" -ForegroundColor Yellow
$errorLogs = ssh "${SSH_USER}@${SSH_HOST}" "pm2 logs ${PM2_APP} --lines 200 --nostream 2>&1 | grep -iE 'error|에러|실패|failed' | tail -n 20"
$errorLogs

Write-Host ""
Write-Host "=== 로그 확인 완료 ===" -ForegroundColor Green

