# 로그 확인 가이드

## 1. ADB 설치 확인

먼저 ADB가 설치되어 있는지 확인하세요:
- Windows: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
- 또는 PATH에 `adb`가 설정되어 있어야 합니다

## 2. 로그캣 실행 방법

### 방법 1: PowerShell에서 직접 실행

```powershell
# ADB 경로 설정
$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { 
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" 
} else { 
    "adb" 
}

# 로그캣 실행 (BridgeForegroundService 로그만 필터링)
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D AutomationStateMachine:D KakaoAutomationService:D
```

### 방법 2: 모든 관련 로그 보기

```powershell
# 모든 Bridge 관련 로그
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D AutomationStateMachine:D KakaoAutomationService:D RemoteInputSender:D
```

### 방법 3: 특정 키워드로 필터링

```powershell
# "Accessibility" 키워드가 포함된 로그만 보기
& $adbPath logcat | Select-String "Accessibility"

# "FALLBACK" 키워드가 포함된 로그만 보기
& $adbPath logcat | Select-String "FALLBACK"

# "WaitingNotification" 키워드가 포함된 로그만 보기
& $adbPath logcat | Select-String "WaitingNotification"
```

## 3. 중요한 로그 확인 사항

### 서비스 시작 시 확인할 로그:

```
✓✓✓ AccessibilityService detected - USING ACCESSIBILITY ONLY ✓✓✓
Accessibility-only mode: Only AccessibilitySender will be initialized
✓ AccessibilitySender initialized (accessibility-only mode)
✓✓✓ AccessibilitySender set as PRIMARY ✓✓✓
Active sender (primary): AccessibilitySender
RemoteInputSender: DISABLED
```

### 메시지 전송 시 확인할 로그:

```
Processing send request:
  sender type: AccessibilitySender
Attempting first send with: AccessibilitySender
AccessibilitySender.send() called
✓✓✓ Message sent successfully via AccessibilityService ✓✓✓
```

### 문제 발생 시 확인할 로그:

```
✗✗✗ AccessibilityService not available ✗✗✗
✗ Please enable Accessibility Service: Settings > Accessibility > Installed services > KakaoBridge
```

## 4. 로그 파일로 저장하기

```powershell
# 로그를 파일로 저장
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D > bridge_logs.txt

# 특정 시간 동안 로그 수집 (예: 30초)
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D -d > bridge_logs.txt
```

## 5. 실시간 로그 모니터링

```powershell
# 실시간으로 로그 보기 (Ctrl+C로 중지)
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D
```

## 6. 로그 레벨 설명

- `V` = Verbose (모든 로그)
- `D` = Debug (디버그 로그)
- `I` = Info (정보 로그)
- `W` = Warning (경고 로그)
- `E` = Error (오류 로그)

## 7. 문제 해결

### 로그가 안 보이는 경우:

1. USB 디버깅이 활성화되어 있는지 확인
2. 디바이스가 연결되어 있는지 확인: `adb devices`
3. 앱이 실행 중인지 확인
4. 서비스가 시작되었는지 확인

### 특정 로그만 보기:

```powershell
# "AccessibilitySender"만 필터링
& $adbPath logcat | Select-String "AccessibilitySender"

# "ERROR" 또는 "FAILED"만 필터링
& $adbPath logcat | Select-String "ERROR|FAILED"
```

## 8. 빠른 명령어

가장 자주 사용할 명령어:

```powershell
# BridgeForegroundService와 AccessibilitySender 로그만 보기
$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" } else { "adb" }
& $adbPath logcat -s BridgeForegroundService:D AccessibilitySender:D AutomationStateMachine:D
```

