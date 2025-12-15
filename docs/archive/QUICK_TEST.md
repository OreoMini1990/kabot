# 빠른 테스트 가이드

## 메시지 전송 테스트 절차

### 1단계: 서비스 시작

1. 앱을 열고 "서비스 시작" 버튼 클릭
2. 서비스 상태가 "서비스 중"으로 변경되는지 확인
3. 알림창에 "KakaoBridge 서비스 중" 알림이 표시되는지 확인

### 2단계: WebSocket 연결 확인

**로그 확인**:
```powershell
adb logcat | Select-String -Pattern "WebSocket.*OPENED"
```

**예상 결과**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket OPENED: ws://211.218.42.222:5002/ws
```

### 3단계: 테스트 메시지 전송

1. **카카오톡에서 메시지 수신**:
   - 테스트 계정으로 카카오톡 메시지 전송
   - 알림이 표시되는지 확인
   - Bridge APK가 알림을 감지하는지 확인

2. **서버에서 응답 생성**:
   - 서버가 메시지를 수신하고 응답을 생성
   - 서버 로그에서 `[Bridge 전송]` 메시지 확인

3. **Bridge APK에서 메시지 수신**:
   - Bridge APK 로그에서 `WebSocket MESSAGE RECEIVED` 확인
   - `Received WebSocket message` 확인

4. **메시지 전송 시도**:
   - Bridge APK 로그에서 `send()` 호출 확인
   - `Message sent successfully` 또는 `Waiting for notification` 확인

### 4단계: 문제 진단

**WebSocket 연결 실패**:
- 서버가 실행 중인지 확인
- 네트워크 연결 확인
- 로그에서 "WebSocket FAILURE" 확인

**메시지 수신 실패**:
- 서버 로그에서 `[Bridge 전송]` 확인
- WebSocket 연결 상태 확인

**roomKey 불일치**:
- 서버 로그: `[Bridge 전송] ... roomKey="..."`
- Bridge APK 로그: `Available cached roomKeys: ...`
- 두 값을 비교

**알림 없음**:
- 카카오톡에서 메시지 수신
- 알림 접근 권한 확인
- Bridge APK 로그에서 알림 감지 확인

## 빠른 진단 명령어

```powershell
# 전체 플로우 로그 확인
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|WebSocket|roomKey"

# WebSocket 연결만 확인
adb logcat | Select-String -Pattern "WebSocket.*OPENED|WebSocket.*FAILURE"

# 메시지 수신만 확인
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket message"

# 메시지 전송만 확인
adb logcat | Select-String -Pattern "send\(\)|Message sent|Failed"
```

