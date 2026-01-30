# KakaoBridge 테스트 및 디버깅 가이드

## 개요

이 문서는 KakaoBridge APK의 테스트 및 디버깅 방법을 설명합니다.

## 테스트 환경 준비

### 1. 필수 요구사항

- Android 디바이스 (Galaxy A16 권장)
- ADB (Android Debug Bridge) 설치
- Android SDK 플랫폼 도구
- Node.js 서버 실행 중
- Python 클라이언트 실행 중

### 2. 권한 설정

앱을 실행하고 다음 권한을 설정해야 합니다:

1. **알림 접근 권한**
   - 앱에서 "알림 접근 권한 설정" 버튼 클릭
   - 설정 화면에서 KakaoBridge 활성화

2. **배터리 최적화 제외**
   - 앱에서 "배터리 최적화 제외 설정" 버튼 클릭
   - 설정 화면에서 KakaoBridge 찾아서 제외 설정

3. **서비스 시작**
   - 모든 권한 설정 후 "서비스 시작" 버튼 클릭
   - 버튼이 "서비스 중지"로 변경되고 상태가 "서비스 중"으로 표시되어야 함

## 테스트 스크립트 사용

### 전체 테스트 실행

```powershell
cd kakkaobot\bridge
.\test-bridge.ps1 -All
```

이 명령은 다음을 순차적으로 실행합니다:
1. APK 빌드
2. APK 설치
3. 테스트 실행

### 개별 명령

```powershell
# APK 빌드만
.\test-bridge.ps1 -Build

# APK 설치만
.\test-bridge.ps1 -Install

# 로그 확인 (실시간)
.\test-bridge.ps1 -Logs

# 테스트만 실행
.\test-bridge.ps1 -Test
```

## 로그 확인

### 실시간 로그 확인

```powershell
cd kakkaobot\bridge
.\test-bridge.ps1 -Logs
```

또는 직접 ADB 사용:

```powershell
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|KakaoNotificationListener"
```

### 주요 로그 태그

- `BridgeForegroundService`: Foreground Service 관련 로그
- `RemoteInputSender`: 메시지 전송 관련 로그
- `KakaoNotificationListener`: 알림 감시 관련 로그
- `NotificationActionCache`: 알림 캐시 관련 로그

### 로그 레벨

- `D` (Debug): 상세 디버깅 정보
- `I` (Info): 중요한 정보 (예: 메시지 전송 성공)
- `W` (Warning): 경고 (예: 알림 대기 중)
- `E` (Error): 오류

## 테스트 시나리오

### 시나리오 1: 기본 메시지 전송

1. **준비**
   - 서버 실행: `cd kakkaobot/server && node server.js`
   - 클라이언트 실행: `cd kakkaobot/client && python kakao_poller.py`
   - Bridge APK 설치 및 서비스 시작

2. **테스트**
   - 카카오톡에서 테스트 계정으로 메시지 전송
   - 서버 로그에서 메시지 수신 확인
   - Bridge APK 로그에서 메시지 전송 시도 확인

3. **예상 결과**
   - 서버에서 메시지 수신 및 복호화 성공
   - Bridge APK에서 WebSocket으로 메시지 수신
   - Bridge APK에서 카카오톡으로 메시지 전송 성공
   - ACK 전송 확인

### 시나리오 2: 알림 대기 상황

1. **준비**
   - Bridge APK 서비스 실행 중
   - 카카오톡에서 특정 채팅방에 알림이 없는 상태

2. **테스트**
   - 서버에서 해당 채팅방으로 메시지 전송 요청
   - Bridge APK 로그 확인

3. **예상 결과**
   - `WaitingNotification` 상태로 전환
   - 해당 채팅방으로 메시지가 오면 자동으로 전송 시도

### 시나리오 3: 재시도 로직

1. **준비**
   - Bridge APK 서비스 실행 중
   - 카카오톡 알림 접근 권한 제거 (임시)

2. **테스트**
   - 서버에서 메시지 전송 요청
   - Bridge APK 로그 확인

3. **예상 결과**
   - `FailedRetryable` 상태로 전환
   - 재시도 시간 계산 및 큐에 저장
   - 재시도 큐 처리 로그 확인

## 디버깅 체크리스트

### 서비스 상태 확인

```powershell
# 서비스 실행 중인지 확인
adb shell "dumpsys activity services | grep -i 'BridgeForegroundService'"
```

### 알림 권한 확인

```powershell
# 알림 접근 권한 확인
adb shell "settings get secure enabled_notification_listeners"
```

### WebSocket 연결 확인

로그에서 다음 메시지 확인:
- `Connecting to WebSocket: ws://...`
- `WebSocket connected`
- `Received WebSocket message: ...`

### 메시지 전송 확인

로그에서 다음 메시지 확인:
- `Processing send request: id=..., roomKey=..., textLength=...`
- `✓ Message sent successfully` (성공)
- `⏳ Waiting for notification` (알림 대기)
- `⚠ Failed (retryable)` (재시도 가능한 실패)
- `✗ Failed (final)` (최종 실패)

## 일반적인 문제 해결

### 문제 1: 서비스가 시작되지 않음

**증상**: "서비스 시작" 버튼을 눌러도 서비스가 시작되지 않음

**해결 방법**:
1. 알림 접근 권한이 설정되어 있는지 확인
2. 배터리 최적화 제외가 설정되어 있는지 확인
3. 로그에서 오류 메시지 확인: `adb logcat | Select-String -Pattern "BridgeForegroundService"`

### 문제 2: 메시지가 전송되지 않음

**증상**: 서버에서 메시지를 보냈지만 카카오톡에 전송되지 않음

**해결 방법**:
1. **알림 캐시 확인**: 로그에서 `Available cached roomKeys: ...` 확인
2. **roomKey 매칭 확인**: 서버에서 보낸 `roomKey`와 캐시된 `roomKey`가 일치하는지 확인
3. **카카오톡 알림 확인**: 해당 채팅방으로 메시지를 받아서 알림이 생성되었는지 확인
4. **RemoteInput 확인**: 로그에서 `remoteInputs count: ...` 확인

### 문제 3: WebSocket 연결 실패

**증상**: 로그에 "WebSocket error" 또는 "WebSocket closed" 메시지

**해결 방법**:
1. 서버가 실행 중인지 확인
2. WebSocket URL이 올바른지 확인 (기본값: `ws://192.168.0.15:5002/ws`)
3. 네트워크 연결 확인
4. 방화벽 설정 확인

### 문제 4: 서비스가 자동으로 중지됨

**증상**: 서비스를 시작했지만 곧 중지됨

**해결 방법**:
1. 배터리 최적화 제외 설정 확인
2. WakeLock이 정상적으로 획득되었는지 로그 확인
3. Foreground Service 알림이 표시되는지 확인
4. 디바이스의 백그라운드 앱 제한 설정 확인

## 성능 모니터링

### 메모리 사용량 확인

```powershell
adb shell "dumpsys meminfo com.goodhabit.kakaobridge"
```

### CPU 사용량 확인

```powershell
adb shell "top -n 1 | grep kakaobridge"
```

### 네트워크 사용량 확인

```powershell
adb shell "cat /proc/net/dev"
```

## 로그 분석 팁

### 성공적인 메시지 전송 로그

```
D/BridgeForegroundService: Received WebSocket message: {"type":"send","id":"...","roomKey":"...","text":"..."}
D/BridgeForegroundService: Processing send request: id=..., roomKey=..., textLength=...
D/RemoteInputSender: ✓ Found cached replyAction
D/RemoteInputSender: ✓ Added RemoteInput results to intent
I/RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
I/BridgeForegroundService: ✓ Message sent successfully: id=...
```

### 알림 대기 로그

```
D/BridgeForegroundService: Processing send request: id=..., roomKey=..., textLength=...
W/RemoteInputSender: ✗ No cached replyAction for roomKey: ...
D/BridgeForegroundService: ⏳ Waiting for notification: id=..., reason=...
```

### 재시도 로그

```
W/BridgeForegroundService: ⚠ Failed (retryable): id=..., retryCount=1, reason=..., nextRetryAt=...
D/BridgeForegroundService: Found 1 retryable requests
```

## 추가 리소스

- [Android NotificationListenerService 문서](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Android RemoteInput 문서](https://developer.android.com/reference/android/app/RemoteInput)
- [Android Foreground Service 문서](https://developer.android.com/guide/components/foreground-services)

