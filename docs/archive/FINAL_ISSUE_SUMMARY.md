# 최종 문제 요약 및 해결 방안

## 현재 상태

### ✅ 성공
1. **roomKey 추출**: 성공 - "의운모" 추출됨
2. **replyAction 찾기**: 성공
3. **WebSocket 연결**: 성공

### ❌ 문제
**WebSocket 메시지 수신 없음**

## 문제 원인

서버에서 Bridge APK로 메시지를 보내지 않았거나, 메시지를 받았지만 처리하지 못하고 있습니다.

## 확인 사항

### 1. 서버 로그 확인
서버 콘솔에서 다음 메시지 확인:
```
[Bridge 전송] 응답 1/1: roomKey="의운모", text="..."
```

**중요**: 서버가 실제로 메시지를 보내는지 확인해야 합니다.

### 2. WebSocket 연결 확인
Bridge APK 로그에서:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket OPENED: ws://211.218.42.222:5002/ws
```

### 3. 메시지 수신 확인
Bridge APK 로그에서:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: ...
I/BridgeForegroundService: Received WebSocket message: ...
```

## 해결 방법

### 방법 1: 서버에서 메시지 전송 확인

**서버 코드 확인** (`server.js`):
```javascript
// Bridge APK용 send 형식으로도 전송 (각 응답마다)
replies.forEach((text, index) => {
  const sendMessage = {
    type: 'send',
    id: `reply-${Date.now()}-${index}`,
    roomKey: decryptedRoomName || room || '',
    text: text,
    ts: Math.floor(Date.now() / 1000)
  };
  ws.send(JSON.stringify(sendMessage));
  console.log(`[Bridge 전송] 응답 ${index + 1}/${replies.length}: roomKey="${decryptedRoomName || room}", text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
});
```

**확인**:
- 서버 로그에 `[Bridge 전송]` 메시지가 있는지 확인
- `roomKey` 값이 "의운모"인지 확인

### 방법 2: WebSocket 메시지 수신 로그 강화

현재 로그가 충분하지만, 더 상세한 로그를 추가할 수 있습니다.

### 방법 3: 테스트 메시지 전송

서버에서 직접 테스트 메시지를 보내서 Bridge APK가 수신하는지 확인:

```javascript
// 테스트용
ws.send(JSON.stringify({
  type: 'send',
  id: 'test-123',
  roomKey: '의운모',
  text: '테스트 메시지',
  ts: Math.floor(Date.now() / 1000)
}));
```

## 다음 단계

1. **서버 로그 확인**: `[Bridge 전송]` 메시지가 있는지 확인
2. **서버 실행 확인**: 서버가 정상 실행 중인지 확인
3. **클라이언트 확인**: 클라이언트가 서버로 메시지를 보내는지 확인
4. **WebSocket 연결 확인**: Bridge APK가 WebSocket에 연결되어 있는지 확인

## 예상 시나리오

### 성공 시나리오
1. 클라이언트가 카카오톡 메시지를 서버로 전송
2. 서버가 응답 생성 및 Bridge APK로 전송
3. Bridge APK가 메시지 수신
4. roomKey 매칭 ("의운모")
5. 메시지 전송 성공

### 실패 시나리오 (현재)
1. 클라이언트가 카카오톡 메시지를 서버로 전송 ✅
2. 서버가 응답 생성 ✅
3. 서버가 Bridge APK로 전송 ❓ (확인 필요)
4. Bridge APK가 메시지 수신 ❌ (실패)

## 디버깅 명령어

```powershell
# WebSocket 메시지 수신 확인
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|Received WebSocket|Processing send request"

# roomKey 추출 확인
adb logcat | Select-String -Pattern "Extracted roomKey|Found replyAction"

# 전체 플로우 확인
adb logcat | Select-String -Pattern "BridgeForegroundService|BridgeWebSocketClient|RemoteInputSender"
```

