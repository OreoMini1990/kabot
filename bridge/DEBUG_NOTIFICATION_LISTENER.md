# 알림 리스너 디버깅 가이드

## 현재 상황

카카오톡 알림이 발생해도 `onNotificationPosted`가 호출되지 않습니다.

## 확인 사항

### 1. 권한 상태 확인

권한은 활성화되어 있습니다:
```
com.goodhabit.kakaobridge/com.goodhabit.kakaobridge.service.KakaoNotificationListenerService
```

### 2. 서비스 연결 상태 확인

다음 명령어로 확인:
```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -d | Select-String "KakaoNotificationListener.*연결|onListenerConnected"
```

다음 로그가 있어야 합니다:
```
[연결 성공] Notification Listener Service connected!
```

### 3. 알림 발생 테스트

1. **logcat 초기화**:
   ```powershell
   & $adbPath logcat -c
   ```

2. **카카오톡에서 알림 발생**:
   - 다른 기기/사용자로부터 "의운모" 채팅방으로 메시지 받기
   - 알림이 발생하는지 확인

3. **로그 확인**:
   ```powershell
   & $adbPath logcat -d | Select-String "KakaoNotificationListener"
   ```

### 4. 예상 로그

알림이 정상적으로 수신되면 다음 로그가 나타나야 합니다:

```
[알림 수신] Package: com.kakao.talk, Key: ...
[카카오톡 알림] KakaoTalk notification posted: ...
[알림 수신] roomKey 추출 성공
  추출된 roomKey: "의운모"
→ 새 캐시 생성: "의운모"
```

## 문제 해결

### 방법 1: 권한 재설정

1. Android 설정에서 알림 액세스 권한 끄기
2. Bridge APK 재시작
3. 알림 액세스 권한 다시 켜기
4. Bridge APK 재시작

### 방법 2: 서비스 재시작

1. Bridge APK 완전 종료 (강제 종료)
2. Bridge APK 다시 시작
3. "Start Service" 버튼 클릭

### 방법 3: 기기 재부팅

가끔 서비스가 제대로 연결되지 않을 수 있습니다. 기기 재부팅으로 해결될 수 있습니다.

## 추가 디버깅

현재 코드는 모든 알림에 대해 `Log.i` 레벨로 로그를 출력하도록 수정되었습니다:

```kotlin
Log.i(TAG, "[알림 수신] Package: ${sbn.packageName}, Key: ${sbn.key}")
```

이 로그가 나타나지 않으면 `onNotificationPosted`가 호출되지 않고 있는 것입니다.

