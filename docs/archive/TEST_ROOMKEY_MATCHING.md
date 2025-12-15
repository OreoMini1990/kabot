# roomKey 매칭 테스트 가이드

## 개선 사항

1. **roomKey 정규화**: 알림에서 추출한 `roomKey`와 서버에서 보낸 `roomKey`를 정규화하여 비교
2. **상세한 로그**: roomKey 매칭 과정을 상세히 로그로 출력
3. **디버깅 정보**: 매칭 실패 시 사용 가능한 roomKey 목록 출력

## 테스트 절차

### 1단계: 서비스 시작

1. 앱을 열고 "서비스 시작" 버튼 클릭
2. 서비스 상태가 "서비스 중"으로 변경되는지 확인

### 2단계: 알림 생성

1. **카카오톡에서 메시지 수신**:
   - 테스트 계정으로 특정 채팅방에 메시지 전송
   - 알림이 표시되는지 확인

2. **로그 확인**:
   ```powershell
   adb logcat | Select-String -Pattern "Extracted roomKey|Available cached roomKeys"
   ```

3. **예상 로그**:
   ```
   D/KakaoNotificationListener: Extracted roomKey from EXTRA_CONVERSATION_TITLE: "테스트채팅방"
   D/NotificationActionCache: Updated cache for roomKey: "테스트채팅방"
   ```

### 3단계: 서버에서 응답 생성

1. **서버 로그 확인**:
   - 서버 콘솔에서 `[Bridge 전송]` 메시지 확인
   - 예: `[Bridge 전송] 응답 1/1: roomKey="테스트채팅방", text="..."`

2. **Bridge APK 로그 확인**:
   ```powershell
   adb logcat | Select-String -Pattern "MESSAGE RECEIVED|roomKey.*normalized|Processing send request"
   ```

3. **예상 로그**:
   ```
   I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","roomKey":"테스트채팅방",...}
   I/BridgeForegroundService: Processing send request:
   I/BridgeForegroundService:   roomKey (normalized): "테스트채팅방"
   ```

### 4단계: roomKey 매칭 확인

1. **메시지 전송 시도 로그 확인**:
   ```powershell
   adb logcat | Select-String -Pattern "send\(\)|No cached replyAction|Available cached roomKeys"
   ```

2. **성공 시 로그**:
   ```
   I/RemoteInputSender: send() called
   I/RemoteInputSender:   roomKey: "테스트채팅방"
   D/RemoteInputSender: ✓ Found cached replyAction for roomKey: "테스트채팅방"
   I/RemoteInputSender: ✓✓✓ Message sent successfully
   ```

3. **실패 시 로그**:
   ```
   I/RemoteInputSender: send() called
   I/RemoteInputSender:   roomKey: "테스트채팅방"
   W/RemoteInputSender: ✗ No cached replyAction for roomKey: "테스트채팅방"
   W/RemoteInputSender:   Available cached roomKeys (1):
   W/RemoteInputSender:     - "다른채팅방"
   W/RemoteInputSender:   → roomKey 매칭 실패! 서버에서 보낸 roomKey와 알림에서 추출한 roomKey가 일치하지 않습니다.
   ```

## 문제 해결

### 문제 1: roomKey 불일치

**증상**: 로그에 "No cached replyAction for roomKey" 메시지

**원인**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 다름

**해결**:
1. 서버 로그에서 실제 `roomKey` 확인
2. Bridge APK 로그에서 사용 가능한 `roomKey` 확인
3. 두 값을 비교하여 차이점 파악
4. 필요시 클라이언트에서 보내는 `room` 값 수정

### 문제 2: 알림이 없음

**증상**: "Available cached roomKeys (0):" 메시지

**원인**: 해당 채팅방으로 메시지를 받지 않아서 알림이 생성되지 않음

**해결**:
1. 카카오톡에서 해당 채팅방으로 메시지 수신
2. 알림이 표시되는지 확인
3. Bridge APK 로그에서 알림 감지 확인

### 문제 3: WebSocket 연결 실패

**증상**: "MESSAGE RECEIVED" 로그가 없음

**원인**: WebSocket 연결이 안 됨

**해결**:
1. 서버가 실행 중인지 확인
2. WebSocket 연결 로그 확인
3. 네트워크 연결 확인

## 디버깅 명령어

### 전체 플로우 확인
```powershell
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|WebSocket|roomKey"
```

### roomKey만 확인
```powershell
adb logcat | Select-String -Pattern "roomKey|Extracted|Available cached"
```

### 메시지 수신 확인
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket message"
```

### 메시지 전송 확인
```powershell
adb logcat | Select-String -Pattern "send\(\)|Message sent|No cached replyAction"
```

## 예상 결과

### 성공 시나리오

1. **알림 생성**:
   ```
   D/KakaoNotificationListener: Extracted roomKey: "테스트채팅방"
   ```

2. **서버에서 메시지 전송**:
   ```
   [Bridge 전송] 응답 1/1: roomKey="테스트채팅방", text="..."
   ```

3. **Bridge APK에서 메시지 수신**:
   ```
   I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: ...
   I/BridgeForegroundService: Processing send request: roomKey (normalized): "테스트채팅방"
   ```

4. **메시지 전송 성공**:
   ```
   I/RemoteInputSender: ✓ Found cached replyAction for roomKey: "테스트채팅방"
   I/RemoteInputSender: ✓✓✓ Message sent successfully
   ```

### 실패 시나리오

1. **roomKey 불일치**:
   ```
   W/RemoteInputSender: ✗ No cached replyAction for roomKey: "서버roomKey"
   W/RemoteInputSender:   Available cached roomKeys (1):
   W/RemoteInputSender:     - "알림roomKey"
   ```

2. **알림 없음**:
   ```
   W/RemoteInputSender: ✗ No cached replyAction for roomKey: "테스트채팅방"
   W/RemoteInputSender:   Available cached roomKeys (0):
   ```

