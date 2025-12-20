# 알림 캐시 테스트 가이드

## 현재 문제

알림 리플라이는 정상 작동하지만, **알림 캐시가 비어있어** 항상 실패합니다:
- 캐시된 roomKey 개수: 0
- `KakaoNotificationListenerService`의 알림 수신 로그가 없음

## 테스트 절차

### 1. Bridge APK 재빌드 및 설치

```powershell
cd bridge
.\build-and-install-auto.ps1 -DebugBuild
```

### 2. 서비스 시작 확인

logcat에서 다음 로그 확인:

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -d | Select-String "KakaoNotificationListener.*onCreate|KakaoNotificationListener.*connected"
```

**예상 로그**:
```
[서비스 생성] KakaoNotificationListenerService.onCreate()
Notification Listener Service connected: true/false
[연결 성공] Notification Listener Service connected!
  활성 알림 개수: X
```

### 3. 알림 권한 확인

Android 기기에서:
1. **설정 > 앱 > KakaoBridge**
2. **특수 앱 액세스 > 알림 액세스**
3. **KakaoBridge 활성화** 확인

### 4. 실제 알림 발생 테스트

1. **카카오톡 열기**
2. **"의운모" 채팅방으로 이동**
3. **다른 기기/사용자로부터 메시지 받기**
   - 또는 다른 기기에서 "의운모" 채팅방으로 메시지 보내기
4. **알림 발생 확인**

### 5. 알림 수신 로그 확인

```powershell
& $adbPath logcat -d | Select-String "KakaoNotificationListener.*알림 수신|KakaoTalk notification posted"
```

**예상 로그 (성공 시)**:
```
[알림 수신] Package: com.kakao.talk, Key: ...
[카카오톡 알림] KakaoTalk notification posted: ...
[알림 수신] roomKey 추출 성공
  추출된 roomKey: "의운모"
→ 새 캐시 생성: "의운모"
```

**예상 로그 (실패 시)**:
```
[알림 수신] Package: com.kakao.talk, Key: ...
  → Accessibility mode active, skipping notification processing
```
(이 경우 FeatureFlags 설정 확인 필요)

또는:
```
[알림 수신] Package: com.other.app, Key: ...
  → 카카오톡 알림이 아님 (패키지: com.other.app), 무시
```

### 6. 메시지 전송 후 캐시 확인

알림이 수신된 후 메시지를 전송하면:

**성공 시**:
```
RemoteInputSender: ✓✓✓ 캐시 발견 및 유효성 검증 통과 ✓✓✓
RemoteInputSender: [알림 리플라이] PendingIntent.send() 실행 시도
RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
BridgeForegroundService: ✓✓✓✓✓ RemoteInputSender SUCCESS - 알림 리플라이로 전송 완료 ✓✓✓✓✓
```

**실패 시 (현재 상태)**:
```
RemoteInputSender: ✗✗✗ 알림 리플라이 실패: 캐시 없음 또는 만료 ✗✗✗
캐시된 roomKey 개수: 0
🚀🚀🚀 FALLBACK: Using AccessibilitySender 🚀🚀🚀
```

## 문제 해결

### 케이스 1: 서비스가 시작되지 않음

로그에 `[서비스 생성]` 로그가 없으면:
- Bridge APK 재설치
- 알림 권한 재설정

### 케이스 2: 서비스가 연결되지 않음

로그에 `Notification Listener Service connected: false`면:
- Android 설정에서 알림 액세스 권한 확인
- 권한 끄고 다시 켜기
- Bridge APK 재시작

### 케이스 3: 알림이 감지되지 않음

로그에 `[알림 수신]` 로그가 없으면:
- 실제로 카카오톡 알림이 발생하는지 확인
- 카카오톡 알림 설정 확인
- 다른 앱의 알림은 감지되는지 확인

### 케이스 4: Accessibility 모드로 인해 스킵됨

로그에 `Accessibility mode active, skipping notification processing`가 있으면:
- FeatureFlags 설정 확인
- 하이브리드 모드가 활성화되어 있는지 확인

## 참고

현재는 **AccessibilitySender fallback**으로 메시지가 정상 전송되고 있으므로 기능상 문제는 없습니다. 하지만 알림 리플라이는 더 빠르고 효율적이므로, 알림 캐시가 작동하도록 설정하는 것이 좋습니다.

