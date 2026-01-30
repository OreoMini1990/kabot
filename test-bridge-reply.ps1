# Bridge APK 알림 리플라이 기능 테스트 스크립트
# 이 스크립트는 Bridge APK의 알림 리플라이 기능을 테스트합니다.

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bridge APK 알림 리플라이 기능 테스트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 서버 URL 설정
$SERVER_URL = "http://192.168.0.15:5002"
$WS_URL = "ws://192.168.0.15:5002/ws"

Write-Host "[1단계] WebSocket 연결 테스트" -ForegroundColor Yellow
Write-Host "서버 URL: $WS_URL" -ForegroundColor Gray
Write-Host ""

# WebSocket 테스트 (PowerShell에서는 직접 WebSocket 연결이 어려우므로 curl 사용)
Write-Host "[2단계] 서버 상태 확인" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$SERVER_URL/health" -Method GET -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ 서버 연결 성공" -ForegroundColor Green
    } else {
        Write-Host "✗ 서버 연결 실패: Status $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ 서버 연결 실패: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[3단계] Bridge APK 테스트 방법" -ForegroundColor Yellow
Write-Host ""
Write-Host "방법 1: ADB를 통한 직접 테스트" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "1. Android 기기를 USB로 연결하고 ADB 활성화" -ForegroundColor White
Write-Host "2. 다음 명령어 실행:" -ForegroundColor White
Write-Host ""
Write-Host "   adb shell am broadcast -a com.goodhabit.kakaobridge.SEND \" -ForegroundColor Yellow
Write-Host "     -n com.goodhabit.kakaobridge/.BridgeCommandReceiver \" -ForegroundColor Yellow
Write-Host "     --es roomKey \"의운모\" \" -ForegroundColor Yellow
Write-Host "     --es text \"테스트 메시지\"" -ForegroundColor Yellow
Write-Host ""
Write-Host "방법 2: 카카오톡 알림 테스트" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "1. 카카오톡에서 테스트할 채팅방으로 이동" -ForegroundColor White
Write-Host "2. 다른 기기나 계정에서 메시지 전송 (알림 발생)" -ForegroundColor White
Write-Host "3. Bridge APK가 알림을 감지하고 roomKey를 캐시하는지 확인" -ForegroundColor White
Write-Host "4. 서버에서 응답 메시지 전송 시 자동으로 리플라이 사용" -ForegroundColor White
Write-Host ""
Write-Host "방법 3: 로그 확인" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Bridge APK 로그 확인:" -ForegroundColor White
Write-Host "  adb logcat -s BridgeForegroundService:D KakaoNotificationListenerService:D RemoteInputSender:D" -ForegroundColor Yellow
Write-Host ""
Write-Host "서버 로그 확인:" -ForegroundColor White
Write-Host "  서버 콘솔에서 '[Bridge 전송]' 로그 확인" -ForegroundColor Yellow
Write-Host ""
Write-Host "[4단계] 알림 리플라이 동작 확인" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "정상 동작 시:" -ForegroundColor White
Write-Host "  1. Bridge APK가 WebSocket으로 'type: send' 메시지 수신" -ForegroundColor Green
Write-Host "  2. 큐에 전송 요청 저장 (PENDING 상태)" -ForegroundColor Green
Write-Host "  3. 카카오톡 알림 감지 시 roomKey 추출 및 replyAction 캐싱" -ForegroundColor Green
Write-Host "  4. RemoteInputSender로 메시지 전송 (알림 리플라이)" -ForegroundColor Green
Write-Host "  5. ACK 응답 전송 (type: ack, status: SENT)" -ForegroundColor Green
Write-Host ""
Write-Host "문제 발생 시:" -ForegroundColor White
Write-Host "  1. 알림 접근 권한 확인 (설정 > 앱 > Bridge APK > 알림)" -ForegroundColor Yellow
Write-Host "  2. 배터리 최적화 제외 확인" -ForegroundColor Yellow
Write-Host "  3. 카카오톡 알림이 켜져 있는지 확인" -ForegroundColor Yellow
Write-Host "  4. 해당 채팅방 알림이 활성화되어 있는지 확인" -ForegroundColor Yellow
Write-Host ""
Write-Host "[5단계] 수동 테스트" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "서버에서 직접 테스트 메시지 전송:" -ForegroundColor White
Write-Host ""
Write-Host "  WebSocket으로 다음 JSON 전송:" -ForegroundColor Yellow
Write-Host '  {' -ForegroundColor Gray
Write-Host '    "type": "send",' -ForegroundColor Gray
Write-Host '    "id": "test-' + (Get-Date -Format "yyyyMMddHHmmss") + '",' -ForegroundColor Gray
Write-Host '    "roomKey": "의운모",' -ForegroundColor Gray
Write-Host '    "text": "테스트 메시지",' -ForegroundColor Gray
Write-Host '    "ts": ' + [int](Get-Date -UFormat %s) -ForegroundColor Gray
Write-Host '  }' -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "테스트 완료" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

