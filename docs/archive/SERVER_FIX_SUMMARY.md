# 서버 수정 요약

## 문제

서버가 현재 연결된 WebSocket 클라이언트(`ws`)에게만 메시지를 보내고 있어서, Bridge APK가 별도의 WebSocket 연결로 메시지를 받지 못했습니다.

## 해결

Bridge APK용 메시지를 **모든 WebSocket 클라이언트에게 브로드캐스트**하도록 수정했습니다.

### 변경 사항

**이전**:
```javascript
ws.send(JSON.stringify(sendMessage));  // 현재 연결만
```

**수정 후**:
```javascript
// 모든 WebSocket 클라이언트에게 브로드캐스트
wss.clients.forEach((client) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(messageStr);
    broadcastCount++;
  }
});
```

### 수정된 위치

1. **첫 번째 위치** (라인 ~1169): IrisLink 형식 처리 부분
2. **두 번째 위치** (라인 ~1237): 기존 형식 호환 부분

## 테스트

### 1. 서버 재시작
```bash
cd server
node server.js
```

### 2. 서버 로그 확인
```
[Bridge 전송] 응답 1/1: roomKey="의운모", text="...", 브로드캐스트=2개 클라이언트
```

`브로드캐스트=2개 클라이언트`가 표시되면:
- 클라이언트 (카카오톡 폴러)
- Bridge APK

두 개의 클라이언트가 연결되어 있다는 의미입니다.

### 3. Bridge APK 로그 확인
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket|Processing send request"
```

**예상 로그**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","roomKey":"의운모",...}
I/BridgeForegroundService: Processing send request:
I/BridgeForegroundService:   roomKey (normalized): "의운모"
I/RemoteInputSender: ✓ Found cached replyAction for roomKey: "의운모"
I/RemoteInputSender: ✓✓✓ Message sent successfully
```

## 예상 결과

1. 서버가 메시지를 모든 WebSocket 클라이언트에게 브로드캐스트
2. Bridge APK가 메시지 수신
3. roomKey 매칭 성공 ("의운모")
4. 메시지 전송 성공

## 추가 확인

서버 로그에서 브로드캐스트 개수를 확인하여 Bridge APK가 연결되어 있는지 확인할 수 있습니다:
- `브로드캐스트=1개 클라이언트`: 클라이언트만 연결 (Bridge APK 미연결)
- `브로드캐스트=2개 클라이언트`: 클라이언트 + Bridge APK 연결됨

