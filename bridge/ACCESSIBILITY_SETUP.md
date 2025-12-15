# 접근성 기반 전송 기능 설정 가이드

## 개요

접근성(Accessibility) 기반 전송 기능은 알림이 없어도 카카오톡 UI를 직접 조작하여 메시지를 전송할 수 있는 새로운 방식입니다.

## 아키텍처

### 이원화 구조

코드는 완전히 분리되어 있어 언제든 롤백 가능:

```
bridge/app/src/main/java/com/goodhabit/kakaobridge/
├── sender/
│   ├── RemoteInputSender.kt      # 기존 방식 (알림 기반)
│   └── MessageSender.kt          # 공통 인터페이스
├── accessibility/                 # 새로운 방식 (접근성 기반)
│   ├── AccessibilitySender.kt
│   ├── KakaoAutomationService.kt
│   ├── state/
│   │   └── AutomationStateMachine.kt
│   └── util/
│       └── UiNodeHelper.kt
└── config/
    ├── FeatureFlags.kt            # 기능 플래그
    └── SelectorsConfig.kt         # UI Selector 설정
```

### 기능 플래그

`FeatureFlags`를 통해 두 방식을 전환:

- **기본값**: `RemoteInputSender` 활성화, `AccessibilitySender` 비활성화
- **롤백**: 언제든 플래그만 변경하여 기존 방식으로 복귀 가능

## 설정 방법

### 1. 접근성 서비스 활성화

1. 앱 실행
2. 설정 > 접근성 > 설치된 서비스
3. "KakaoBridge" 서비스 찾기
4. 활성화

### 2. 기능 플래그 변경

**코드에서 변경:**
```kotlin
// 접근성 방식 활성화
FeatureFlags.setAccessibilitySendEnabled(context, true)
FeatureFlags.setRemoteInputSendEnabled(context, false)
```

**런타임 변경 (향후 MainActivity에 UI 추가 예정):**
- 설정 화면에서 토글 스위치로 변경 가능

### 3. Selector 설정

카카오톡 업데이트로 UI가 변경되면 `selectors.json` 파일 수정:

```json
{
  "search_button_id": "com.kakao.talk:id/search_icon",
  "search_input_id": "com.kakao.talk:id/search_edit_text",
  "chat_input_id": "com.kakao.talk:id/edittext_chat_input",
  "send_button_id": "com.kakao.talk:id/sendbutton"
}
```

**실제 ID 확인 방법:**
```bash
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml
```

## 테스트

### 자동화 테스트 스크립트

```powershell
.\test-accessibility.ps1
```

### 수동 테스트

1. 접근성 서비스 활성화 확인
2. 기능 플래그 변경
3. 서비스 재시작
4. 카카오톡에서 테스트 메시지 전송
5. 로그 확인:
   ```bash
   adb logcat | grep -E "AccessibilitySender|AutomationStateMachine|KakaoAutomationService"
   ```

## 롤백 방법

### 즉시 롤백

```kotlin
// 기존 방식으로 복귀
FeatureFlags.setAccessibilitySendEnabled(context, false)
FeatureFlags.setRemoteInputSendEnabled(context, true)
```

### 코드 레벨 롤백

접근성 관련 코드는 모두 `accessibility/` 폴더에 있으므로:
- 해당 폴더의 import만 주석 처리하면 완전히 비활성화됨
- 기존 `RemoteInputSender`는 그대로 유지됨

## 주의사항

1. **화면 잠금**: 잠금 상태에서는 UI 자동화가 실패할 수 있음
   - 해결: Smart Lock 또는 잠금 해제 설정

2. **배터리 최적화**: 백그라운드에서 안정적으로 작동하려면 배터리 최적화 제외 필요

3. **카카오톡 업데이트**: UI 변경 시 `selectors.json` 업데이트 필요

4. **단일 실행**: 동시에 여러 작업이 실행되지 않도록 Mutex로 보호됨

## 문제 해결

### 접근성 서비스가 활성화되지 않음
- 설정 > 접근성에서 수동으로 활성화 필요
- 앱 재시작

### UI 요소를 찾을 수 없음
- `selectors.json`의 View ID 확인
- `adb shell uiautomator dump`로 실제 ID 확인

### 전송 실패
- 로그 확인: `adb logcat | grep AutomationStateMachine`
- 상태 머신의 각 단계별 실패 원인 확인

