# 알림 리플라이 로그 모니터링 가이드

## 현재 상황

보여주신 로그는 **클라이언트(Python) 로그**입니다. 알림 리플라이 로그는 **Bridge APK**에서 나옵니다.

## 알림 리플라이 로그 확인 방법

### 방법 1: 실시간 로그 모니터링 (권장)

PowerShell에서 다음 명령어를 실행하고, **메시지를 전송**해보세요:

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -s RemoteInputSender:I BridgeForegroundService:I KakaoNotificationListener:I
```

### 방법 2: 특정 태그만 필터링

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

# 알림 리플라이 관련 로그만
& $adbPath logcat -s RemoteInputSender:I | Select-String "알림|PendingIntent|roomKey|캐시"

# 메시지 전송 처리 로그
& $adbPath logcat -s BridgeForegroundService:I | Select-String "Step 1|SUCCESS|WaitingNotification|FALLBACK"
```

### 방법 3: 한 번에 확인

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -d -t 1000 | Select-String "RemoteInputSender|BridgeForegroundService.*Step 1|알림 리플라이|PendingIntent|WaitingNotification"
```

## 확인할 로그 내용

### 알림 리플라이 성공 시:
```
RemoteInputSender: [알림 리플라이] roomKey 매칭 시도
RemoteInputSender: ✓✓✓ 캐시 발견 및 유효성 검증 통과 ✓✓✓
RemoteInputSender: [알림 리플라이] PendingIntent.send() 실행 시도
RemoteInputSender: ✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓
BridgeForegroundService: ✓✓✓✓✓ RemoteInputSender SUCCESS - 알림 리플라이로 전송 완료 ✓✓✓✓✓
```

### 알림 리플라이 실패 (Fallback) 시:
```
RemoteInputSender: ✗✗✗ 알림 리플라이 실패: 캐시 없음 또는 만료 ✗✗✗
RemoteInputSender: 캐시된 roomKey 목록: ...
BridgeForegroundService: ⚠⚠⚠ RemoteInputSender 실패: WaitingNotification ⚠⚠⚠
BridgeForegroundService: → 알림 리플라이 불가능, AccessibilitySender로 fallback
BridgeForegroundService: 🚀🚀🚀 FALLBACK: Using AccessibilitySender 🚀🚀🚀
```

### 알림 수신 시:
```
KakaoNotificationListener: [알림 수신] roomKey 추출 성공
KakaoNotificationListener: ✓ replyAction 발견
KakaoNotificationListener: → 새 캐시 생성: "의운모"
```

## 테스트 방법

1. **로그 모니터링 시작**:
   ```powershell
   $adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adbPath logcat -c  # 로그 클리어
   & $adbPath logcat -s RemoteInputSender:I BridgeForegroundService:I KakaoNotificationListener:I
   ```

2. **다른 터미널/창에서 메시지 전송**:
   - 클라이언트가 실행 중이면 자동으로 메시지가 전송됩니다
   - 또는 서버에서 직접 메시지를 보내보세요

3. **로그 확인**:
   - 알림 리플라이 성공: `✓✓✓ Message sent successfully via PendingIntent.send()`
   - 알림 리플라이 실패: `✗✗✗ 알림 리플라이 실패` 또는 `WaitingNotification`
   - Fallback: `FALLBACK: Using AccessibilitySender`

## 현재 상태 확인

Bridge APK가 실행 중인지 확인:

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adbPath logcat -d -t 50 | Select-String "BridgeForegroundService.*onCreate|BridgeForegroundService.*initialized"
```

Bridge APK가 실행 중이면 서비스 초기화 로그가 보입니다.

