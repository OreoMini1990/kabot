# 완전 자동화 테스트 스크립트
# 모든 Phase 구현 상태 확인 및 테스트

$ErrorActionPreference = "Stop"
$script:TestResults = @()

function Write-TestResult {
    param(
        [string]$TestName,
        [string]$Status,
        [string]$Message = ""
    )
    $script:TestResults += [PSCustomObject]@{
        TestName = $TestName
        Status = $Status
        Message = $Message
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "[$Status] $TestName" -ForegroundColor $color
    if ($Message) {
        Write-Host "  $Message" -ForegroundColor Gray
    }
}

function Test-FileExists {
    param([string]$Path, [string]$Description)
    if (Test-Path $Path) {
        Write-TestResult -TestName $Description -Status "PASS" -Message "파일 존재: $Path"
        return $true
    } else {
        Write-TestResult -TestName $Description -Status "FAIL" -Message "파일 없음: $Path"
        return $false
    }
}

function Test-CodeContains {
    param([string]$FilePath, [string]$Pattern, [string]$Description)
    if (-not (Test-Path $FilePath)) {
        Write-TestResult -TestName $Description -Status "FAIL" -Message "파일 없음: $FilePath"
        return $false
    }
    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if ($content -match $Pattern) {
        Write-TestResult -TestName $Description -Status "PASS" -Message "패턴 발견: $Pattern"
        return $true
    } else {
        Write-TestResult -TestName $Description -Status "FAIL" -Message "패턴 없음: $Pattern"
        return $false
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "카카오톡 봇 완전 자동화 테스트 시작" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Phase 1: 클라이언트-서버 데이터 구조 표준화
Write-Host "`n[Phase 1] 클라이언트-서버 데이터 구조 표준화" -ForegroundColor Yellow

# 클라이언트 확인
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "sender_name.*sender_name_decrypted" -Description "Phase 1.1: 클라이언트 sender_name 전송"
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "sender_id.*sender_id_for_transmission" -Description "Phase 1.1: 클라이언트 sender_id 전송"
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "kakao_log_id.*msg_id" -Description "Phase 1.1: 클라이언트 kakao_log_id 전송"
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "raw_sender.*sender" -Description "Phase 1.1: 클라이언트 raw_sender 전송"

# 서버 확인
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "function extractSenderName" -Description "Phase 1.2: 서버 extractSenderName 함수"
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "function extractSenderId" -Description "Phase 1.2: 서버 extractSenderId 함수"
Test-CodeContains -FilePath "server/server.js" -Pattern "extractSenderName.*extractSenderId" -Description "Phase 1.2: 서버 extractSenderName/extractSenderId 사용"

# DB 마이그레이션 확인
Test-FileExists -Path "server/db/migration_add_raw_sender_kakao_log_id.sql" -Description "Phase 1.3: DB 마이그레이션 스크립트"
Test-CodeContains -FilePath "server/db/chatLogger.js" -Pattern "raw_sender.*rawSender" -Description "Phase 1.3: DB raw_sender 저장"
Test-CodeContains -FilePath "server/db/chatLogger.js" -Pattern "kakao_log_id.*kakaoLogId" -Description "Phase 1.3: DB kakao_log_id 저장"

# Phase 2: attachment 복호화 구현
Write-Host "`n[Phase 2] attachment 복호화 구현" -ForegroundColor Yellow

Test-FileExists -Path "client/attachment_decrypt.py" -Description "Phase 2.1: attachment_decrypt.py 모듈"
Test-CodeContains -FilePath "client/attachment_decrypt.py" -Pattern "ATTACHMENT_DECRYPT_WHITELIST" -Description "Phase 2.2: msg_type whitelist"
Test-CodeContains -FilePath "client/attachment_decrypt.py" -Pattern "def decrypt_attachment" -Description "Phase 2.1: decrypt_attachment 함수"
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "attachment_decrypted.*decrypt_attachment" -Description "Phase 2.2: 클라이언트 attachment 복호화 호출"
Test-CodeContains -FilePath "client/kakao_poller.py" -Pattern "json\.dumps\(attachment_decrypted\)" -Description "Phase 2.4: 클라이언트 복호화된 attachment 전송"

# Phase 3: kakao_log_id 기준 메시지 식별 통일
Write-Host "`n[Phase 3] kakao_log_id 기준 메시지 식별 통일" -ForegroundColor Yellow

Test-CodeContains -FilePath "server/db/chatLogger.js" -Pattern "kakao_log_id.*reportedMessageId" -Description "Phase 3.3: 신고 기능 kakao_log_id 기준 검색"
Test-FileExists -Path "ATTACHMENT_KEY_MAPPING.md" -Description "Phase 3.4: ATTACHMENT_KEY_MAPPING.md 문서"

# Phase 4: 이미지-질문 연결 개선
Write-Host "`n[Phase 4] 이미지-질문 연결 개선" -ForegroundColor Yellow

Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "PENDING_ATTACHMENT_CACHE" -Description "Phase 4.1: pending_attachment 캐시 구현"
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "function setPendingAttachment" -Description "Phase 4.1: setPendingAttachment 함수"
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "function getAndClearPendingAttachment" -Description "Phase 4.1: getAndClearPendingAttachment 함수"
Test-CodeContains -FilePath "server/server.js" -Pattern "setPendingAttachment" -Description "Phase 4.2: 이미지 메시지 수신 시 캐시 저장"
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "getAndClearPendingAttachment.*room.*questionSenderId" -Description "Phase 4.3: 질문 명령어 처리 시 캐시 조회"
Test-CodeContains -FilePath "server/labbot-node.js" -Pattern "setPendingAttachment," -Description "Phase 4: setPendingAttachment export"

# Phase 5: 닉네임 변경 감지 개선
Write-Host "`n[Phase 5] 닉네임 변경 감지 개선" -ForegroundColor Yellow

Test-CodeContains -FilePath "server/db/chatLogger.js" -Pattern "function checkNicknameChange" -Description "Phase 5.1: checkNicknameChange 함수"
Test-CodeContains -FilePath "server/db/chatLogger.js" -Pattern "if \(!senderId\)" -Description "Phase 5.1: sender_id 필수 체크"

# Phase 6: 로깅 및 관측 가능성 강화
Write-Host "`n[Phase 6] 로깅 및 관측 가능성 강화" -ForegroundColor Yellow

Test-CodeContains -FilePath "client/attachment_decrypt.py" -Pattern "DECRYPT_FAIL_REASON" -Description "Phase 6.1: 복호화 실패 이유 코드화"
Test-CodeContains -FilePath "client/attachment_decrypt.py" -Pattern "print.*\[attachment" -Description "Phase 6.1: 복호화 로깅"

# 서버 이미지 저장 개선 확인
Write-Host "`n[추가 개선] 서버 이미지 저장 attachment_decrypted 우선 사용" -ForegroundColor Yellow

Test-CodeContains -FilePath "server/server.js" -Pattern "attachment_decrypted.*json\.attachment_decrypted" -Description "서버 이미지 저장: attachment_decrypted 우선 사용"

# 결과 요약
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "테스트 결과 요약" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$total = $script:TestResults.Count
$passed = ($script:TestResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($script:TestResults | Where-Object { $_.Status -eq "FAIL" }).Count

Write-Host "총 테스트: $total" -ForegroundColor White
Write-Host "통과: $passed" -ForegroundColor Green
Write-Host "실패: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -gt 0) {
    Write-Host "`n실패한 테스트:" -ForegroundColor Red
    $script:TestResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "  - $($_.TestName): $($_.Message)" -ForegroundColor Red
    }
}

# 결과를 JSON 파일로 저장
$resultsJson = $script:TestResults | ConvertTo-Json -Depth 3
$resultsFile = "test-results-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$resultsJson | Out-File -FilePath $resultsFile -Encoding UTF8
Write-Host "`n테스트 결과 저장: $resultsFile" -ForegroundColor Cyan

# 결과를 마크다운으로도 저장
$markdownLines = @()
$markdownLines += "# 자동화 테스트 결과"
$markdownLines += ""
$markdownLines += "생성 시간: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$markdownLines += ""
$markdownLines += "## 요약"
$markdownLines += ""
$markdownLines += "- 총 테스트: $total"
$markdownLines += "- 통과: $passed"
$markdownLines += "- 실패: $failed"
$markdownLines += ""
$markdownLines += "## 상세 결과"
$markdownLines += ""
$markdownLines += "| 테스트 이름 | 상태 | 메시지 | 시간 |"
$markdownLines += "|------------|------|--------|------|"

$script:TestResults | ForEach-Object {
    $testName = $_.TestName -replace '\|', '\|'
    $message = $_.Message -replace '\|', '\|'
    $markdownLines += "| $testName | $($_.Status) | $message | $($_.Timestamp) |"
}

$markdownFile = "test-results-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
$markdownLines -join "`n" | Out-File -FilePath $markdownFile -Encoding UTF8
Write-Host "테스트 결과 마크다운 저장: $markdownFile" -ForegroundColor Cyan

Write-Host ""
Write-Host "테스트 완료!" -ForegroundColor Green

