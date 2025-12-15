# KakaoBridge 디버깅 가이드

## 문제: 메시지가 전송되지 않음

서버와 클라이언트는 정상 작동하지만, Bridge APK를 통해 카카오톡으로 메시지가 전송되지 않는 경우의 디버깅 방법입니다.

## 체크리스트

### 1. 서비스 상태 확인

```powershell
# Bridge APK가 설치되어 있고 서비스가 실행 중인지 확인
adb shell "dumpsys activity services | grep -i 'BridgeForegroundService'"
```

**예상 결과**: 서비스가 실행 중이어야 함

**문제 해결**:
- 앱을 열고 "서비스 시작" 버튼 클릭
- 알림 접근 권한 및 배터리 최적화 제외 설정 확인

### 2. WebSocket 연결 확인

```powershell
# 로그에서 WebSocket 연결 확인
adb logcat | Select-String -Pattern "WebSocket|BridgeForegroundService"
```

**예상 로그**:
```
D/BridgeForegroundService: Connecting to WebSocket: ws://211.218.42.222:5002/ws
D/BridgeForegroundService: WebSocket connected
```

**문제 해결**:
- 서버가 실행 중인지 확인: `cd server && node server.js`
- WebSocket URL이 올바른지 확인 (기본값: `ws://211.218.42.222:5002/ws`)
- 네트워크 연결 확인

### 3. 메시지 수신 확인

```powershell
# 로그에서 메시지 수신 확인
adb logcat | Select-String -Pattern "Received WebSocket message|Processing send request"
```

**예상 로그**:
```
D/BridgeForegroundService: Received WebSocket message: {"type":"send","id":"...","roomKey":"...","text":"..."}
D/BridgeForegroundService: Processing send request: id=..., roomKey=..., textLength=...
```

**문제 해결**:
- 서버에서 메시지를 보내는지 확인
- 서버 로그에서 `[Bridge 전송]` 메시지 확인

### 4. 알림 캐시 확인

**가장 중요한 단계**: Bridge APK는 카카오톡 알림에서 `roomKey`를 추출하고 `replyAction`을 캐싱합니다.

```powershell
# 로그에서 알림 캐시 확인
adb logcat | Select-String -Pattern "NotificationActionCache|KakaoNotificationListener|roomKey"
```

**예상 로그**:
```
D/KakaoNotificationListener: KakaoTalk notification posted: ...
D/KakaoNotificationListener: Extracted roomKey: [채팅방 이름]
D/KakaoNotificationListener: Found replyAction for roomKey: [채팅방 이름]
D/NotificationActionCache: Updated cache for roomKey: [채팅방 이름]
```

**문제 해결**:
1. **roomKey 불일치**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치해야 함
   - 서버 로그에서 `roomKey` 확인: `[Bridge 전송] ... roomKey="..."`
   - Bridge APK 로그에서 캐시된 `roomKey` 확인: `Available cached roomKeys: ...`
   - 두 값이 정확히 일치해야 함 (대소문자, 공백 포함)

2. **알림이 없는 경우**: 해당 채팅방으로 메시지를 받아서 알림이 생성되어야 함
   - 카카오톡에서 테스트 계정으로 메시지 전송
   - 알림이 표시되는지 확인
   - Bridge APK 로그에서 알림 감지 확인

### 5. 메시지 전송 시도 확인

```powershell
# 로그에서 메시지 전송 시도 확인
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

### 문제 1: roomKey 불일치

**증상**: 로그에 `No cached replyAction for roomKey: ...` 메시지

**원인**: 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치하지 않음

**해결 방법**:
1. 서버 로그에서 실제 `roomKey` 확인
2. Bridge APK 로그에서 캐시된 `roomKey` 확인
3. 두 값을 비교하여 차이점 확인
4. 서버 코드에서 `roomKey` 생성 로직 확인

**디버깅 명령**:
```powershell
# 서버 로그에서 roomKey 확인
# (서버 콘솔에서 확인)

# Bridge APK 로그에서 roomKey 확인
adb logcat | Select-String -Pattern "roomKey|Available cached roomKeys"
```

### 문제 2: 알림이 감지되지 않음

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

### 문제 3: PendingIntent 전송 실패

**증상**: 로그에 `PendingIntent was canceled` 또는 `Failed to send message` 메시지

**원인**:
- PendingIntent가 만료됨
- 카카오톡 알림이 제거됨
- RemoteInput 결과 주입 실패

**해결 방법**:
1. 해당 채팅방으로 새로운 메시지 수신
2. 알림이 표시되는지 확인
3. 즉시 메시지 전송 시도
4. 로그에서 상세 오류 메시지 확인

### 문제 4: WebSocket 연결 실패

**증상**: 로그에 `WebSocket error` 또는 `WebSocket closed` 메시지

**원인**:
- 서버가 실행되지 않음
- 네트워크 연결 문제
- WebSocket URL 오류

**해결 방법**:
1. 서버 실행 확인: `cd server && node server.js`
2. 서버 로그에서 WebSocket 연결 확인
3. 네트워크 연결 확인
4. WebSocket URL 확인 (기본값: `ws://211.218.42.222:5002/ws`)

## 디버깅 워크플로우

### 1단계: 기본 상태 확인

```powershell
# 서비스 상태
adb shell "dumpsys activity services | grep -i 'BridgeForegroundService'"

# 알림 권한
adb shell "settings get secure enabled_notification_listeners"

# WebSocket 연결 (로그 확인)
adb logcat | Select-String -Pattern "WebSocket"
```

### 2단계: 메시지 플로우 추적

```powershell
# 전체 플로우 로그 확인
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|KakaoNotificationListener"
```

### 3단계: roomKey 매칭 확인

```powershell
# 서버에서 보낸 roomKey 확인 (서버 콘솔)
# Bridge APK에서 캐시된 roomKey 확인
adb logcat | Select-String -Pattern "roomKey|Available cached roomKeys"
```

### 4단계: 전송 시도 확인

```powershell
# 메시지 전송 시도 로그
adb logcat | Select-String -Pattern "send\(\)|Message sent|Failed"
```

## 로그 분석 예시

### 성공적인 메시지 전송

```
D/BridgeForegroundService: Received WebSocket message: {"type":"send","id":"...","roomKey":"테스트채팅방","text":"안녕하세요"}
D/BridgeForegroundService: Processing send request: id=..., roomKey=테스트채팅방, textLength=5
D/RemoteInputSender: send() called: roomKey=테스트채팅방, text=안녕하세요...
D/RemoteInputSender: ✓ Found cached replyAction
D/RemoteInputSender: ✓ Added RemoteInput results to intent
I/RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
I/BridgeForegroundService: ✓ Message sent successfully: id=...
```

### 알림 대기 상황

```
D/BridgeForegroundService: Received WebSocket message: {"type":"send","id":"...","roomKey":"새채팅방","text":"안녕하세요"}
D/BridgeForegroundService: Processing send request: id=..., roomKey=새채팅방, textLength=5
D/RemoteInputSender: send() called: roomKey=새채팅방, text=안녕하세요...
W/RemoteInputSender: ✗ No cached replyAction for roomKey: 새채팅방
D/RemoteInputSender: Available cached roomKeys: 테스트채팅방, 다른채팅방
D/BridgeForegroundService: ⏳ Waiting for notification: id=..., reason=채팅방 '새채팅방'에 대한 알림이 없습니다...
```

이 경우, "새채팅방"으로 메시지를 받아서 알림이 생성되면 자동으로 전송됩니다.

## 추가 리소스

- [Android NotificationListenerService 문서](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Android RemoteInput 문서](https://developer.android.com/reference/android/app/RemoteInput)
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - 전체 테스트 가이드

