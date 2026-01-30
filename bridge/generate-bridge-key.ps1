# Bridge API Key 생성 스크립트

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bridge API Key 생성기" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 64자리 랜덤 키 생성 (영문 대소문자 + 숫자)
$chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
$key = ""
for ($i = 0; $i -lt 64; $i++) {
    $key += $chars[(Get-Random -Maximum $chars.Length)]
}

Write-Host "생성된 Bridge API Key:" -ForegroundColor Green
Write-Host $key -ForegroundColor Yellow
Write-Host ""

Write-Host "서버 .env 파일에 추가:" -ForegroundColor Cyan
Write-Host "BRIDGE_API_KEY=$key" -ForegroundColor White
Write-Host "BRIDGE_PREVIEW_ENABLED=true" -ForegroundColor White
Write-Host ""

Write-Host "Bridge APK에서 설정:" -ForegroundColor Cyan
Write-Host "SharedPreferences에 다음 값을 저장:" -ForegroundColor White
Write-Host "  bridge_api_key = $key" -ForegroundColor Yellow
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan

