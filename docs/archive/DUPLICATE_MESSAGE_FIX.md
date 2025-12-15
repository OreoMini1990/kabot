# 중복 메시지 전송 방지 수정

## 문제

답장 기능이 활성화되었지만 메시지가 1번 이상 중복으로 전송되고 있었습니다.

## 원인

1. 서버가 모든 WebSocket 클라이언트에게 브로드캐스트하면서 같은 메시지를 여러 번 보낼 수 있음
2. Bridge APK가 같은 메시지를 여러 번 받아서 처리할 수 있음
3. 중복 체크 로직이 없어서 같은 ID의 메시지가 여러 번 처리됨

## 해결

### 1. 중복 메시지 체크 추가

Bridge APK에서 메시지를 받을 때:
1. 메시지 ID로 기존 요청 확인
2. 이미 처리 중이거나 완료된 메시지는 무시
3. Primary key 충돌 시 무시

### 2. SendRequestDao 개선

- `getById()` 메서드 추가: ID로 요청 조회
- `OnConflictStrategy.IGNORE`로 변경: 중복 ID는 무시

### 3. 로직 개선

```kotlin
// 중복 메시지 체크
val existingRequest = dao.getById(id)
if (existingRequest != null) {
    // 이미 처리 중이거나 완료된 메시지는 무시
    if (existingRequest.status == SendStatus.SENT || existingRequest.status == SendStatus.PENDING) {
        return
    }
}
```

## 테스트

### 1. APK 설치 완료
중복 방지 로직이 포함된 APK가 설치되었습니다.

### 2. 테스트 시나리오

1. 카카오톡에서 메시지 전송
2. 서버에서 응답 생성
3. Bridge APK가 메시지 수신
4. 중복 체크 로그 확인

### 3. 로그 확인

```powershell
adb logcat | Select-String -Pattern "Duplicate message|Inserted request|MESSAGE RECEIVED"
```

**예상 로그 (정상)**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","id":"reply-...",...}
I/BridgeForegroundService: Processing send request: id=reply-...
I/BridgeForegroundService: ✓ Inserted request to queue: id=reply-...
```

**예상 로그 (중복 방지)**:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: {"type":"send","id":"reply-...",...}
W/BridgeForegroundService: ⚠ Duplicate message detected, ignoring: id=reply-..., status=SENT
D/BridgeForegroundService: Message already processed or processing, skipping: id=reply-...
```

## 추가 확인 사항

### 서버 로그 확인

서버에서 같은 메시지를 여러 번 보내는지 확인:
```
[Bridge 전송] 응답 1/1: roomKey="의운모", text="...", 브로드캐스트=2개 클라이언트
```

만약 서버가 같은 메시지를 여러 번 생성한다면, 서버 코드도 확인이 필요합니다.

### 메시지 ID 확인

서버에서 생성하는 메시지 ID:
```javascript
id: `reply-${Date.now()}-${index}`
```

같은 시간에 여러 응답이 생성되면 같은 ID가 생성될 수 있습니다. 하지만 `index`가 포함되어 있어서 일반적으로는 고유합니다.

## 예상 결과

이제 같은 메시지 ID로 여러 번 메시지가 와도:
1. 첫 번째 메시지만 처리
2. 나머지는 중복으로 감지되어 무시
3. 메시지가 1번만 전송됨

