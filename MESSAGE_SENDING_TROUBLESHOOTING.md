# 메시지 전송 문제 해결 가이드

## 문제: 답장 전송이 되지 않음

클라이언트와 서버는 정상 작동하지만, Bridge APK를 통해 카카오톡으로 답장이 전송되지 않는 경우의 진단 및 해결 방법입니다.

## 진단 체크리스트

### 1. WebSocket 연결 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "WebSocket.*OPENED|WebSocket.*connected"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket OPENED: ws://211.218.42.222:5002/ws
```

**문제 해결**:
- WebSocket이 열리지 않으면 서버가 실행 중인지 확인
- 네트워크 연결 확인
- 방화벽 설정 확인

### 2. 서버에서 메시지 전송 확인

**서버 로그 확인**:
서버 콘솔에서 다음 메시지 확인:
```
[Bridge 전송] 응답 1/1: roomKey="...", text="..."
```

**문제 해결**:
- 서버가 실행 중인지 확인: `cd server && node server.js`
- 클라이언트가 메시지를 서버로 전송하는지 확인
- 서버 로그에서 `[Bridge 전송]` 메시지 확인

### 3. Bridge APK에서 메시지 수신 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "WebSocket.*MESSAGE RECEIVED|Received WebSocket message"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","id":"...","roomKey":"...","text":"..."}
D/BridgeForegroundService: Received WebSocket message: ...
```

**문제 해결**:
- WebSocket 연결이 정상인지 확인
- 서버에서 메시지를 보내는지 확인
- 메시지 형식이 올바른지 확인 (`type: "send"`)

### 4. 알림 캐시 확인 (가장 중요!)

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "KakaoNotificationListener|roomKey|Available cached"
```

**예상 로그**:
```
D/KakaoNotificationListener: Extracted roomKey: [채팅방 이름]
D/KakaoNotificationListener: Found replyAction for roomKey: [채팅방 이름]
D/NotificationActionCache: Updated cache for roomKey: [채팅방 이름]
```

**문제 해결**:
1. **roomKey 불일치**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치해야 함
   - 서버 로그: `[Bridge 전송] ... roomKey="..."`
   - Bridge APK 로그: `Available cached roomKeys: ...`
   - 두 값이 정확히 일치해야 함 (대소문자, 공백 포함)

2. **알림이 없는 경우**: 해당 채팅방으로 메시지를 받아서 알림이 생성되어야 함
   - 카카오톡에서 테스트 계정으로 메시지 전송
   - 알림이 표시되는지 확인
   - Bridge APK 로그에서 알림 감지 확인

### 5. 메시지 전송 시도 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "RemoteInputSender|send\(\)|Message sent"
```

**예상 로그 (성공)**:
```
D/RemoteInputSender: send() called: roomKey=..., text=...
D/RemoteInputSender: ✓ Found cached replyAction
D/RemoteInputSender: ✓ Added RemoteInput results to intent
I/RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
I/BridgeForegroundService: ✓ Message sent successfully: id=...
```

**예상 로그 (알림 대기)**:
```
D/RemoteInputSender: send() called: roomKey=..., text=...
W/RemoteInputSender: ✗ No cached replyAction for roomKey: ...
D/RemoteInputSender: Available cached roomKeys: ...
D/BridgeForegroundService: ⏳ Waiting for notification: id=..., reason=...
```

**예상 로그 (실패)**:
```
D/RemoteInputSender: send() called: roomKey=..., text=...
E/RemoteInputSender: ✗ Failed to send message: ...
W/BridgeForegroundService: ⚠ Failed (retryable): id=..., retryCount=..., reason=...
```

## 일반적인 문제 해결

### 문제 1: WebSocket 연결 실패

**증상**: 로그에 "WebSocket OPENED" 메시지가 없음

**원인**:
- 서버가 실행되지 않음
- 네트워크 연결 문제
- WebSocket URL 오류

**해결 방법**:
1. 서버 실행 확인: `cd server && node server.js`
2. 서버 로그에서 WebSocket 연결 확인
3. 네트워크 연결 확인
4. WebSocket URL 확인 (기본값: `ws://211.218.42.222:5002/ws`)

### 문제 2: 메시지가 수신되지 않음

**증상**: 서버에서 메시지를 보냈지만 Bridge APK 로그에 "MESSAGE RECEIVED"가 없음

**원인**:
- WebSocket 연결이 끊어짐
- 서버에서 메시지를 보내지 않음
- 메시지 형식 오류

**해결 방법**:
1. WebSocket 연결 상태 확인
2. 서버 로그에서 `[Bridge 전송]` 메시지 확인
3. 서버 코드에서 `type: "send"` 형식으로 전송하는지 확인

### 문제 3: roomKey 불일치

**증상**: 로그에 "No cached replyAction for roomKey: ..." 메시지

**원인**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치하지 않음

**해결 방법**:
1. 서버 로그에서 실제 `roomKey` 확인
2. Bridge APK 로그에서 캐시된 `roomKey` 확인
3. 두 값을 비교하여 차이점 확인
4. 서버 코드에서 `roomKey` 생성 로직 확인

**디버깅 명령**:
```powershell
# 서버 로그에서 roomKey 확인 (서버 콘솔)
# Bridge APK 로그에서 roomKey 확인
adb logcat | Select-String -Pattern "roomKey|Available cached roomKeys"
```

### 문제 4: 알림이 감지되지 않음

**증상**: 로그에 알림 관련 메시지가 없음

**원인**:
- 알림 접근 권한이 설정되지 않음
- 카카오톡 알림이 생성되지 않음
- NotificationListenerService가 제대로 작동하지 않음

**해결 방법**:
1. 알림 접근 권한 확인:
   ```powershell
   adb shell "settings get secure enabled_notification_listeners"
   ```
   결과에 `com.goodhabit.kakaobridge`가 포함되어야 함

2. 카카오톡에서 테스트 메시지 전송
3. 알림이 표시되는지 확인
4. Bridge APK 로그에서 알림 감지 확인

## 테스트 시나리오

### 시나리오 1: 전체 플로우 테스트

1. **준비**
   - 서버 실행: `cd server && node server.js`
   - 클라이언트 실행: `cd client && python kakao_poller.py`
   - Bridge APK 서비스 시작

2. **테스트**
   - 카카오톡에서 테스트 계정으로 메시지 전송
   - 서버 로그에서 메시지 수신 확인
   - Bridge APK 로그에서 WebSocket 메시지 수신 확인
   - Bridge APK 로그에서 메시지 전송 시도 확인

3. **예상 결과**
   - 서버에서 메시지 수신 및 복호화 성공
   - Bridge APK에서 WebSocket으로 메시지 수신
   - Bridge APK에서 카카오톡으로 메시지 전송 성공
   - ACK 전송 확인

### 시나리오 2: roomKey 매칭 테스트

1. **준비**
   - Bridge APK 서비스 실행 중
   - 카카오톡에서 특정 채팅방으로 메시지 수신 (알림 생성)

2. **테스트**
   - 서버에서 해당 채팅방으로 메시지 전송 요청
   - Bridge APK 로그에서 roomKey 확인

3. **예상 결과**
   - 서버 로그: `[Bridge 전송] ... roomKey="테스트채팅방"`
   - Bridge APK 로그: `Available cached roomKeys: 테스트채팅방`
   - 두 값이 일치하여 메시지 전송 성공

## 디버깅 명령어

### 실시간 로그 모니터링
```powershell
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|WebSocket|roomKey"
```

### WebSocket 연결 확인
```powershell
adb logcat | Select-String -Pattern "WebSocket.*OPENED|WebSocket.*connected|WebSocket.*FAILURE"
```

### 메시지 수신 확인
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket message"
```

### 알림 캐시 확인
```powershell
adb logcat | Select-String -Pattern "KakaoNotificationListener|roomKey|Available cached"
```

### 메시지 전송 확인
```powershell
adb logcat | Select-String -Pattern "send\(\)|Message sent|Failed to send"
```

## 추가 리소스

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - 전체 테스트 가이드
- [DEBUGGING_GUIDE.md](./DEBUGGING_GUIDE.md) - 디버깅 가이드
- [FINAL_LOGIC.md](./FINAL_LOGIC.md) - 최종 로직 설명

