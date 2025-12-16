# 접근성 서비스 활성화 가이드

## 문제 상황

로그에서 다음 메시지가 보이면 접근성 서비스가 활성화되지 않은 것입니다:

```
⚠ AccessibilityService not available
⚠ Using RemoteInput-only mode
getInstance() != null: false
isServiceEnabled(): false
```

이 경우 `RemoteInputSender`만 사용되며, 알림이 없으면 `WAITING_NOTIFICATION` 상태로 대기하게 됩니다.

## 해결 방법: 접근성 서비스 활성화

### 1단계: 설정 앱 열기

1. 안드로이드 기기의 **설정** 앱을 엽니다
2. **접근성** (Accessibility) 메뉴로 이동합니다
   - 설정 > 접근성
   - 또는 설정 > 접근성 > 설치된 서비스

### 2단계: KakaoBridge 서비스 찾기

1. **설치된 서비스** (Installed services) 또는 **다운로드한 앱** 섹션을 찾습니다
2. **KakaoBridge** 또는 **KakaoAutomationService**를 찾습니다

### 3단계: 서비스 활성화

1. **KakaoBridge** 서비스를 탭합니다
2. 서비스 **ON/OFF 스위치**를 **ON**으로 설정합니다
3. 경고 메시지가 나타나면 **확인** 또는 **허용**을 선택합니다
   - "이 서비스는 기기의 모든 작업을 모니터링할 수 있습니다" 경고가 나타날 수 있습니다
   - 이는 정상적인 안드로이드 접근성 서비스 경고입니다

### 4단계: 확인

서비스를 활성화한 후:

1. **BridgeForegroundService** 앱을 재시작합니다
   - 앱에서 서비스 중지 후 다시 시작
   - 또는 앱 완전 종료 후 재실행

2. 로그캣에서 다음 로그를 확인합니다:
   ```
   ✓✓✓ AccessibilityService detected - USING ACCESSIBILITY ONLY ✓✓✓
   Checking AccessibilityService: instance=true
   Active sender (primary): AccessibilitySender
   ```

## 빠른 확인 방법

PowerShell에서 다음 명령어로 확인:

```powershell
$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { 
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" 
} else { 
    "adb" 
}

# 접근성 서비스 상태 확인
& $adbPath logcat -s BridgeForegroundService:D | Select-String "AccessibilityService"
```

## 문제 해결

### 접근성 서비스를 찾을 수 없는 경우

1. 앱이 제대로 설치되었는지 확인
2. 앱을 완전히 제거 후 재설치
3. 기기 재시작

### 서비스를 활성화했는데도 작동하지 않는 경우

1. 앱 재시작 (서비스 중지 후 다시 시작)
2. 기기 재시작
3. 로그캣에서 `instance=true` 확인

### 여전히 `instance=false`인 경우

1. AndroidManifest.xml에 서비스가 등록되어 있는지 확인
2. `accessibility_service_config.xml` 파일이 존재하는지 확인
3. 앱 권한 확인

## 중요 참고사항

- 접근성 서비스가 활성화되어 있으면 **알림 없이도 즉시 메시지 전송**이 가능합니다
- 접근성 서비스가 없으면 **알림 리플라이 방식**만 사용되며, 알림이 없으면 대기합니다
- 접근성 서비스는 **보안상 중요한 권한**이므로 신뢰할 수 있는 앱에서만 활성화하세요
