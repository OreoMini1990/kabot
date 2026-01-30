# PowerShell 스크립트: 네이버 카페 API 이미지 업로드 테스트
# 
# 사용법:
#   .\test_naver_cafe_image.ps1
# 
# 또는 환경변수를 직접 설정:
#   $env:NAVER_ACCESS_TOKEN="your_token"
#   $env:NAVER_CAFE_CLUBID="28339939"
#   $env:NAVER_CAFE_MENUID="1"
#   node test/test_naver_cafe_image.js

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "네이버 카페 API 이미지 업로드 테스트 (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# .env 파일에서 환경변수 로드
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Write-Host "✅ .env 파일 발견: $envFile" -ForegroundColor Green
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
            Write-Host "   로드: $key" -ForegroundColor Gray
        }
    }
    Write-Host ""
} else {
    Write-Host "⚠️ .env 파일을 찾을 수 없습니다: $envFile" -ForegroundColor Yellow
    Write-Host ""
}

# 환경변수 확인
$accessToken = $env:NAVER_ACCESS_TOKEN
$clubid = $env:NAVER_CAFE_CLUBID
$menuid = $env:NAVER_CAFE_MENUID
$encodingMode = $env:NAVER_MULTIPART_ENCODING_MODE

# 인코딩 모드 확인 및 안내
if (-not $encodingMode) {
    Write-Host "⚠️ NAVER_MULTIPART_ENCODING_MODE 환경변수가 설정되지 않았습니다. 기본값 'raw' 사용" -ForegroundColor Yellow
    Write-Host "   사용 가능한 모드: raw, double_ms949, euckr_bytes" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "✅ 인코딩 모드: $encodingMode" -ForegroundColor Green
    Write-Host ""
}

if (-not $accessToken) {
    Write-Host "❌ NAVER_ACCESS_TOKEN 환경변수가 설정되지 않았습니다." -ForegroundColor Red
    Write-Host ""
    Write-Host "설정 방법:" -ForegroundColor Yellow
    Write-Host "  1. .env 파일 생성: server\.env" -ForegroundColor White
    Write-Host "     NAVER_ACCESS_TOKEN=your_token_here" -ForegroundColor White
    Write-Host "     NAVER_CAFE_CLUBID=28339939" -ForegroundColor White
    Write-Host "     NAVER_CAFE_MENUID=1" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. 또는 PowerShell에서 직접 설정:" -ForegroundColor White
    Write-Host "     `$env:NAVER_ACCESS_TOKEN='your_token_here'" -ForegroundColor White
    Write-Host "     `$env:NAVER_CAFE_CLUBID='28339939'" -ForegroundColor White
    Write-Host "     `$env:NAVER_CAFE_MENUID='1'" -ForegroundColor White
    Write-Host ""
    exit 1
}

if (-not $clubid -or -not $menuid) {
    Write-Host "❌ NAVER_CAFE_CLUBID 또는 NAVER_CAFE_MENUID 환경변수가 설정되지 않았습니다." -ForegroundColor Red
    exit 1
}

Write-Host "✅ 환경변수 확인 완료" -ForegroundColor Green
Write-Host "   CLUB_ID: $clubid" -ForegroundColor White
Write-Host "   MENU_ID: $menuid" -ForegroundColor White
Write-Host "   ACCESS_TOKEN: $($accessToken.Substring(0, [Math]::Min(20, $accessToken.Length)))..." -ForegroundColor White
Write-Host ""

# Node.js 스크립트 실행
$scriptPath = Join-Path $PSScriptRoot "test_naver_cafe_image.js"
Write-Host "Node.js 스크립트 실행: $scriptPath" -ForegroundColor Cyan
Write-Host ""

node $scriptPath
