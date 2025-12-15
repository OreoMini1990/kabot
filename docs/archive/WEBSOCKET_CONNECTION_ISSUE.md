# WebSocket 연결 문제 해결

## 현재 상황

### ✅ 서버
- 서버가 정상적으로 메시지를 보내고 있음
- `[Bridge 전송] 응답 1/1: roomKey="의운모", text="helloworld"`

### ❌ Bridge APK
- WebSocket 연결 로그 없음
- 메시지 수신 로그 없음

## 문제 원인

Bridge APK의 WebSocket 연결이 끊어졌거나 연결되지 않았을 가능성이 높습니다.

## 해결 방법

### 1. 서비스 재시작

앱에서:
1. "서비스 중지" 버튼 클릭
2. 2초 대기
3. "서비스 시작" 버튼 클릭
4. 5초 대기 (WebSocket 연결)

### 2. WebSocket 연결 확인

```powershell
adb logcat | Select-String -Pattern "WebSocket.*OPENED|Connecting to WebSocket"
```

**예상 로그**:
```
I/BridgeForegroundService: Connecting to WebSocket: ws://211.218.42.222:5002/ws
I/BridgeWebSocketClient: ✓✓✓ WebSocket OPENED: ws://211.218.42.222:5002/ws
```

### 3. 메시지 수신 확인

서버에서 메시지를 보낸 후:
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","roomKey":"의운모",...}
I/BridgeForegroundService: Received WebSocket message: ...
```

## 서버 측 확인

서버는 모든 WebSocket 클라이언트에게 메시지를 보내고 있습니다:
```javascript
ws.send(JSON.stringify(sendMessage));
```

하지만 Bridge APK가 연결되어 있지 않으면 메시지를 받을 수 없습니다.

## 디버깅 단계

1. **서비스 재시작**: 앱에서 서비스 중지 후 재시작
2. **WebSocket 연결 확인**: 로그에서 "WebSocket OPENED" 확인
3. **서버에서 메시지 전송**: 카카오톡에서 메시지 전송
4. **메시지 수신 확인**: Bridge APK 로그에서 "MESSAGE RECEIVED" 확인
5. **메시지 전송 확인**: "Message sent successfully" 확인

## 추가 확인 사항

### 서버 로그에서 WebSocket 연결 확인
서버 콘솔에서:
```
[2025-12-15T...] WebSocket connection opened
```

여러 개의 WebSocket 연결이 있어야 합니다:
- 클라이언트 (카카오톡 폴러)
- Bridge APK

### Bridge APK WebSocket URL 확인
기본값: `ws://211.218.42.222:5002/ws`

이 URL이 서버의 WebSocket 엔드포인트와 일치하는지 확인해야 합니다.

