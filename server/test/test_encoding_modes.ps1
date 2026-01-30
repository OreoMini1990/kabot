# 네이버 카페 인코딩 모드 테스트 스크립트
# 3가지 인코딩 모드를 순차적으로 테스트

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "네이버 카페 인코딩 모드 테스트 (3가지 모드)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$modes = @("raw", "double_ms949", "euckr_bytes")

foreach ($mode in $modes) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "테스트 모드: $mode" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
    
    $env:NAVER_MULTIPART_ENCODING_MODE = $mode
    
    Write-Host "환경변수 설정: NAVER_MULTIPART_ENCODING_MODE=$mode" -ForegroundColor Green
    Write-Host ""
    
    # 테스트 실행
    node test_naver_cafe_image.js
    
    Write-Host ""
    Write-Host "모드 '$mode' 테스트 완료" -ForegroundColor Gray
    Write-Host ""
    Write-Host "💡 네이버 카페에서 실제 글을 확인하여 한글이 올바르게 표시되는지 확인하세요." -ForegroundColor Cyan
    Write-Host ""
    
    # 사용자 입력 대기 (선택사항)
    if ($mode -ne $modes[-1]) {
        Write-Host "다음 모드로 진행하려면 Enter를 누르세요..." -ForegroundColor Gray
        Read-Host
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "모든 인코딩 모드 테스트 완료" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ 성공한 모드를 선택하여 .env 파일에 설정하세요:" -ForegroundColor Green
Write-Host "   NAVER_MULTIPART_ENCODING_MODE=<성공한_모드>" -ForegroundColor White
Write-Host ""










