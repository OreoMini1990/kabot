# 알림 권한 확인 가이드

## 현재 문제

로그를 보면 알림 리플라이는 정상 작동하지만, **알림 캐시가 비어있어** 항상 실패합니다:

```
⚠ 캐시가 완전히 비어있습니다!
캐시된 roomKey 개수: 0
```

**원인**: `KakaoNotificationListenerService`가 알림을 감지하지 못하고 있습니다.

## 확인 방법

### 1. 알림 권한 확인

Android 기기에서:
1. **설정 > 앱 > KakaoBridge** (또는 Bridge)
2. **권한** 또는 **특수 앱 액세스 > 알림 액세스**
3. **KakaoBridge가 활성화**되어 있는지 확인

또는:
1. **설정 > 접근성 > 설치된 서비스**
2. **KakaoBridge** 확인

### 2. logcat에서 서비스 시작 로그 확인

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -d | Select-String "KakaoNotificationListener.*onCreate|KakaoNotificationListener.*connected"
```

다음 로그가 있어야 합니다:
```
[서비스 생성] KakaoNotificationListenerService.onCreate()
Notification Listener Service connected: true
[연결 성공] Notification Listener Service connected!
```

### 3. 알림 수신 로그 확인

```powershell
& $adbPath logcat -d | Select-String "KakaoNotificationListener.*알림 수신|KakaoTalk notification posted"
```

카카오톡 알림이 발생하면 다음 로그가 있어야 합니다:
```
[카카오톡 알림] KakaoTalk notification posted: ...
[알림 수신] roomKey 추출 성공
→ 새 캐시 생성: "의운모"
```

## 테스트 방법

1. **알림 권한 확인 및 재설정**
   - 설정에서 알림 액세스 권한 끄고 다시 켜기
   - Bridge APK 재시작

2. **실제 알림 발생**
   - 카카오톡에서 "의운모" 채팅방으로 이동
   - 다른 기기나 사용자로부터 메시지 받기
   - 알림이 발생하는지 확인

3. **로그 확인**
   - `KakaoNotificationListener` 로그 확인
   - 캐시 생성 로그 확인

## 예상되는 정상 동작

알림이 정상적으로 수신되면:

```
[카카오톡 알림] KakaoTalk notification posted: ...
[알림 수신] roomKey 추출 성공
  추출된 roomKey: "의운모"
→ 새 캐시 생성: "의운모"
```

그 후 메시지 전송 시:

```
RemoteInputSender: ✓✓✓ 캐시 발견 및 유효성 검증 통과 ✓✓✓
RemoteInputSender: [알림 리플라이] PendingIntent.send() 실행 시도
RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
BridgeForegroundService: ✓✓✓✓✓ RemoteInputSender SUCCESS - 알림 리플라이로 전송 완료 ✓✓✓✓✓
```

## 현재 상태

현재는 알림 리플라이 실패 시 **AccessibilitySender로 자동 fallback**되어 메시지가 정상 전송되고 있습니다:

```
🚀🚀🚀 FALLBACK: Using AccessibilitySender 🚀🚀🚀
AccessibilitySender result: Success
✓✓✓✓✓ FALLBACK SUCCEEDED: AccessibilitySender sent message ✓✓✓✓✓
```

따라서 **기능적으로는 문제가 없지만**, 알림 리플라이를 사용하려면 알림 캐시가 필요합니다.

