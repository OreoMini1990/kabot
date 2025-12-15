# 디버깅 단계별 가이드

## 문제: 클라이언트/서버는 정상 응답하지만 카카오톡 전송이 안 됨

## 단계별 확인 사항

### 1단계: WebSocket 연결 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "WebSocket.*OPENED|Connecting to WebSocket"
```

**예상 로그**:
```
I/BridgeForegroundService: Connecting to WebSocket: ws://211.218.42.222:5002/ws
I/BridgeWebSocketClient: ✓✓✓ WebSocket OPENED: ws://211.218.42.222:5002/ws
```

**문제 해결**:
- WebSocket이 열리지 않으면 서버가 실행 중인지 확인
- 네트워크 연결 확인
- 로그에서 "WebSocket FAILURE" 확인

### 2단계: 서버에서 메시지 전송 확인

**서버 로그 확인**:
서버 콘솔에서 다음 메시지 확인:
```
[Bridge 전송] 응답 1/1: roomKey="...", text="..."
```

**문제 해결**:
- 서버가 실행 중인지 확인
- 서버 로그에서 `[Bridge 전송]` 메시지 확인
- `roomKey` 값 확인

### 3단계: Bridge APK에서 메시지 수신 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket message|Processing send request"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send",...}
I/BridgeForegroundService: Received WebSocket message: ...
I/BridgeForegroundService: Processing send request:
I/BridgeForegroundService:   roomKey: "..."
```

**문제 해결**:
- WebSocket 연결 상태 확인
- 서버에서 메시지를 보내는지 확인
- 메시지 형식이 올바른지 확인 (`type: "send"`)

### 4단계: 알림 캐시 확인 (가장 중요!)

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "Extracted roomKey|Available cached roomKeys|KakaoNotificationListener"
```

**예상 로그**:
```
D/KakaoNotificationListener: Extracted roomKey from EXTRA_CONVERSATION_TITLE: "테스트채팅방"
D/NotificationActionCache: Updated cache for roomKey: "테스트채팅방"
```

**문제 해결**:
1. **알림이 없는 경우**: 해당 채팅방으로 메시지를 받아서 알림이 생성되어야 함
2. **roomKey 불일치**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치해야 함

### 5단계: roomKey 매칭 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "send\(\)|No cached replyAction|Available cached roomKeys"
```

**예상 로그 (성공)**:
```
I/RemoteInputSender: send() called
I/RemoteInputSender:   roomKey: "테스트채팅방"
D/RemoteInputSender: ✓ Found cached replyAction for roomKey: "테스트채팅방"
I/RemoteInputSender: ✓✓✓ Message sent successfully
```

**예상 로그 (실패 - roomKey 불일치)**:
```
I/RemoteInputSender: send() called
I/RemoteInputSender:   roomKey: "서버roomKey"
W/RemoteInputSender: ✗ No cached replyAction for roomKey: "서버roomKey"
W/RemoteInputSender:   Available cached roomKeys (1):
W/RemoteInputSender:     - "알림roomKey"
W/RemoteInputSender:   → roomKey 매칭 실패!
```

**문제 해결**:
- 서버 로그의 `roomKey`와 Bridge APK 로그의 `Available cached roomKeys` 비교
- 두 값이 정확히 일치해야 함 (대소문자, 공백 포함)

### 6단계: 메시지 전송 시도 확인

**확인 방법**:
```powershell
adb logcat | Select-String -Pattern "PendingIntent|Message sent|Failed to send"
```

**예상 로그 (성공)**:
```
D/RemoteInputSender: Attempting to send via PendingIntent.send()...
I/RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
I/BridgeForegroundService: ✓ Message sent successfully: id=...
```

**예상 로그 (실패)**:
```
E/RemoteInputSender: ✗ PendingIntent was canceled
또는
E/RemoteInputSender: ✗ Failed to send message
```

**문제 해결**:
- PendingIntent가 취소된 경우: 알림이 사라졌을 수 있음
- 전송 실패: 권한 문제 또는 카카오톡 버전 호환성 문제

## 빠른 진단 명령어

### 전체 플로우 확인
```powershell
cd kakkaobot
.\debug-realtime.ps1
```

### 특정 단계만 확인
```powershell
# WebSocket 연결만
adb logcat | Select-String -Pattern "WebSocket.*OPENED|WebSocket.*FAILURE"

# 메시지 수신만
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket message"

# roomKey 매칭만
adb logcat | Select-String -Pattern "roomKey|Extracted|Available cached"

# 메시지 전송만
adb logcat | Select-String -Pattern "send\(\)|Message sent|Failed"
```

## 일반적인 문제 해결

### 문제 1: WebSocket 연결 실패

**증상**: 로그에 "WebSocket OPENED" 메시지가 없음

**해결**:
1. 서버 실행 확인: `cd server && node server.js`
2. 서버 로그에서 WebSocket 연결 확인
3. 네트워크 연결 확인
4. 방화벽 설정 확인

### 문제 2: 메시지 수신 실패

**증상**: 서버에서 메시지를 보냈지만 Bridge APK 로그에 "MESSAGE RECEIVED"가 없음

**해결**:
1. WebSocket 연결 상태 확인
2. 서버 로그에서 `[Bridge 전송]` 메시지 확인
3. 서버 코드에서 `type: "send"` 형식으로 전송하는지 확인

### 문제 3: roomKey 불일치

**증상**: 로그에 "No cached replyAction for roomKey" 메시지

**해결**:
1. 서버 로그에서 실제 `roomKey` 확인
2. Bridge APK 로그에서 캐시된 `roomKey` 확인
3. 두 값을 비교하여 차이점 파악
4. 필요시 클라이언트에서 보내는 `room` 값 수정

### 문제 4: 알림이 없음

**증상**: "Available cached roomKeys (0):" 메시지

**해결**:
1. 카카오톡에서 해당 채팅방으로 메시지 수신
2. 알림이 표시되는지 확인
3. Bridge APK 로그에서 알림 감지 확인
4. 알림 접근 권한 확인

### 문제 5: PendingIntent 실패

**증상**: "PendingIntent was canceled" 또는 "Failed to send message"

**해결**:
1. 알림이 아직 표시 중인지 확인
2. 카카오톡 버전 확인
3. 권한 확인
4. 알림을 다시 생성하여 재시도

## 테스트 시나리오

1. **준비**:
   - 서버 실행: `cd server && node server.js`
   - 클라이언트 실행: `cd client && python kakao_poller.py`
   - Bridge APK 서비스 시작

2. **테스트**:
   - 카카오톡에서 테스트 계정으로 메시지 전송
   - 서버 로그에서 메시지 수신 확인
   - Bridge APK 로그에서 WebSocket 메시지 수신 확인
   - Bridge APK 로그에서 roomKey 매칭 확인
   - Bridge APK 로그에서 메시지 전송 확인

3. **예상 결과**:
   - 서버에서 메시지 수신 및 복호화 성공
   - Bridge APK에서 WebSocket으로 메시지 수신
   - Bridge APK에서 알림 캐시에서 roomKey 찾기 성공
   - Bridge APK에서 카카오톡으로 메시지 전송 성공
   - ACK 전송 확인

