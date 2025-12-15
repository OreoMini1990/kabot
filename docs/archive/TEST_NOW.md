# 지금 테스트하세요!

## 확인된 사항

✅ **WebSocket 연결 성공**: `WebSocket OPENED: ws://211.218.42.222:5002/ws`

## 개선 사항

1. **알림에서 roomKey 추출 개선**:
   - `"."` 같은 무의미한 값 제외
   - 더 많은 필드 확인 (android.title, android.bigText, android.text)
   - 모든 extras 덤프하여 디버깅 용이

## 테스트 절차

### 1. 서비스 재시작
- 앱을 열고 "서비스 시작" 버튼 클릭 (이미 시작되어 있으면 중지 후 재시작)

### 2. 카카오톡에서 메시지 수신
- **중요**: 실제 채팅방 이름이 있는 메시지를 받아야 합니다
- 테스트 계정으로 특정 채팅방에 메시지 전송
- 알림이 표시되는지 확인

### 3. 로그 확인
```powershell
adb logcat | Select-String -Pattern "Extracted roomKey|Notification extras dump|roomKey"
```

**예상 로그**:
```
D/KakaoNotificationListener: Notification extras dump:
D/KakaoNotificationListener:   android.title = 실제채팅방이름
D/KakaoNotificationListener: Extracted roomKey from android.title: "실제채팅방이름"
```

### 4. 서버에서 응답 생성
- 서버가 메시지를 받고 응답 생성
- 서버 로그에서 `[Bridge 전송] ... roomKey="..."` 확인

### 5. 메시지 수신 및 전송 확인
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Processing send request|send\(\)|Message sent"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","roomKey":"실제채팅방이름",...}
I/BridgeForegroundService: Processing send request:
I/BridgeForegroundService:   roomKey: "실제채팅방이름"
I/RemoteInputSender: send() called
I/RemoteInputSender:   roomKey: "실제채팅방이름"
I/RemoteInputSender: ✓ Found cached replyAction for roomKey: "실제채팅방이름"
I/RemoteInputSender: ✓✓✓ Message sent successfully
```

## 문제 해결

### roomKey가 여전히 "."로 추출되는 경우
- 로그에서 "Notification extras dump" 확인
- 실제 채팅방 이름이 어느 필드에 있는지 확인
- 필요시 해당 필드를 roomKey 추출 로직에 추가

### 메시지가 수신되지 않는 경우
- 서버 로그에서 `[Bridge 전송]` 메시지 확인
- 서버에서 `roomKey` 값 확인
- Bridge APK 로그에서 "MESSAGE RECEIVED" 확인

### roomKey 매칭 실패
- 서버 로그: `[Bridge 전송] ... roomKey="서버roomKey"`
- Bridge APK 로그: `Available cached roomKeys: 알림roomKey`
- 두 값을 비교하여 일치시키기

## 빠른 진단

```powershell
# 전체 플로우 확인
cd D:\JosupAI\kakkaobot
.\debug-realtime.ps1
```

