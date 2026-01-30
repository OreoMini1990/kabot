# 네이버 카페 인코딩 모드 테스트 스크립트 (개선 버전)
# 실제 cafeWrite.js 로직을 사용하여 테스트

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "네이버 카페 인코딩 모드 테스트 (실제 로직 사용)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# .env 파일 로드
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Write-Host "✅ .env 파일 로드: $envFile" -ForegroundColor Green
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host ""
}

# 인코딩 모드 선택
$mode = $args[0]

if (-not $mode -or $mode -notin @("raw", "double_ms949", "euckr_bytes")) {
    Write-Host "사용법:" -ForegroundColor Yellow
    Write-Host "  .\test_encoding_modes_fixed.ps1 [raw|double_ms949|euckr_bytes]" -ForegroundColor White
    Write-Host ""
    Write-Host "예시:" -ForegroundColor Yellow
    Write-Host "  .\test_encoding_modes_fixed.ps1 raw" -ForegroundColor White
    Write-Host "  .\test_encoding_modes_fixed.ps1 double_ms949" -ForegroundColor White
    Write-Host ""
    
    # 모드 선택 프롬프트
    Write-Host "테스트할 인코딩 모드를 선택하세요:" -ForegroundColor Cyan
    Write-Host "  1. raw (기본값 - 원본 문자열)" -ForegroundColor White
    Write-Host "  2. double_ms949 (이중 인코딩)" -ForegroundColor White
    Write-Host "  3. euckr_bytes (EUC-KR 바이트)" -ForegroundColor White
    Write-Host "  4. all (모두 테스트)" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "선택 (1-4)"
    
    switch ($choice) {
        "1" { $mode = "raw" }
        "2" { $mode = "double_ms949" }
        "3" { $mode = "euckr_bytes" }
        "4" { $mode = "all" }
        default { 
            Write-Host "잘못된 선택입니다. 기본값 'raw'를 사용합니다." -ForegroundColor Yellow
            $mode = "raw"
        }
    }
}

if ($mode -eq "all") {
    Write-Host "모든 모드를 순차적으로 테스트합니다..." -ForegroundColor Cyan
    Write-Host ""
    
    $modes = @("raw", "double_ms949", "euckr_bytes")
    foreach ($m in $modes) {
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
        Write-Host "테스트 모드: $m" -ForegroundColor Yellow
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
        Write-Host ""
        
        $env:NAVER_MULTIPART_ENCODING_MODE = $m
        node test_naver_cafe_encoding.js $m
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "⚠️ 모드 '$m' 테스트 실패" -ForegroundColor Yellow
        }
        
        Write-Host ""
        
        if ($m -ne $modes[-1]) {
            Write-Host "다음 모드로 진행하려면 Enter를 누르세요..." -ForegroundColor Gray
            Read-Host
        }
    }
} else {
    Write-Host "테스트 모드: $mode" -ForegroundColor Green
    Write-Host ""
    
    $env:NAVER_MULTIPART_ENCODING_MODE = $mode
    node test_naver_cafe_encoding.js $mode
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "테스트 완료" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan










