# 접근성 기반 전송 방식 마이그레이션 가이드

## 개요

Bridge APK에서 두 가지 메시지 전송 방식을 지원합니다:
1. **RemoteInputSender** (기존 방식): 알림 기반 전송
2. **AccessibilitySender** (새로운 방식): 접근성 서비스 기반 UI 자동화

## 아키텍처

### 메시지 플로우

```
서버 (server.js)
  ↓ WebSocket: type: "send"
Bridge APK (BridgeForegroundService)
  ↓ 기능 플래그 확인
  ├─ 단일 모드 (하나만 활성화)
  │  ├─ RemoteInput 방식 → KakaoNotificationListenerService → RemoteInputSender
  │  └─ Accessibility 방식 → AccessibilitySender (직접 UI 조작)
  └─ 하이브리드 모드 (둘 다 활성화)
     ├─ 1차 시도: 우선순위 방식 (접근성 우선)
     └─ 실패 시 자동 fallback: 다른 방식으로 재시도
```

### 서버/클라이언트 변경 사항

**✅ 서버 (server.js)**: 변경 불필요
- 여전히 동일한 형식의 메시지 전송: `{ type: "send", id, roomKey, text, ts }`
- Bridge APK가 어떤 방식으로 전송하는지는 서버가 알 필요 없음
- 메시지 프로토콜 변경 없음

**✅ 클라이언트 (kakao_poller.py)**: 변경 불필요
- 전송 로직이 이미 제거됨 (Bridge APK가 담당)
- 메시지 수신만 담당
- 변경 사항 없음

**✅ Bridge APK**: 내부적으로만 변경
- 기능 플래그로 전송 방식 선택
- 서버와의 통신 프로토콜 변경 없음

## 기능 플래그

### 설정 방법

```kotlin
// 단일 모드: 접근성 방식만 활성화
FeatureFlags.setAccessibilitySendEnabled(context, true)
FeatureFlags.setRemoteInputSendEnabled(context, false)

// 단일 모드: RemoteInput 방식만 활성화 (기본값)
FeatureFlags.setAccessibilitySendEnabled(context, false)
FeatureFlags.setRemoteInputSendEnabled(context, true)

// 하이브리드 모드: 둘 다 활성화 (자동 fallback)
FeatureFlags.setAccessibilitySendEnabled(context, true)
FeatureFlags.setRemoteInputSendEnabled(context, true)
```

### 기본값

- 접근성 방식: **비활성화** (false)
- RemoteInput 방식: **활성화** (true)
- 하이브리드 모드: **비활성화** (둘 다 활성화해야 함)

### 하이브리드 모드

**둘 다 활성화되어 있으면 자동으로 하이브리드 모드로 동작합니다:**

1. **우선순위**: 접근성 방식이 우선 (더 직접적이고 안정적)
2. **자동 Fallback**: 첫 번째 방식 실패 시 자동으로 두 번째 방식으로 재시도
3. **장점**: 
   - 한 방식이 실패해도 다른 방식으로 자동 전환
   - 최대한 메시지 전송 성공률 향상
4. **동작 예시**:
   - 접근성 방식으로 시도 → 실패 → RemoteInput 방식으로 자동 재시도
   - RemoteInput 방식으로 시도 → 실패 → 접근성 방식으로 자동 재시도

## 동작 방식 비교

### RemoteInput 방식 (기존)

1. 서버에서 `type: "send"` 메시지 수신
2. 큐에 적재 (PENDING 상태)
3. `KakaoNotificationListenerService`가 카카오톡 알림 감지
4. 알림에서 `replyAction` 추출 및 캐싱
5. `RemoteInputSender`로 메시지 전송
6. 전송 완료 후 ACK 전송

**장점:**
- 안정적이고 검증된 방식
- 알림 권한만 필요
- 빠른 전송 속도

**단점:**
- 알림이 있어야 전송 가능
- 알림 캐시 의존성

### Accessibility 방식 (새로운)

1. 서버에서 `type: "send"` 메시지 수신
2. 큐에 적재 (PENDING 상태)
3. `AccessibilitySender`가 직접 UI 조작
4. 카카오톡 앱 열기 → 채팅방 찾기 → 메시지 입력 → 전송
5. 전송 완료 후 ACK 전송

**장점:**
- 알림 없이도 전송 가능
- 더 직접적인 제어
- 알림 캐시 불필요

**단점:**
- 접근성 서비스 활성화 필요
- UI Selector 설정 필요
- 카카오톡 UI 변경 시 영향 받을 수 있음
- 약간 느릴 수 있음 (UI 조작 시간)

### 하이브리드 방식 (둘 다 활성화)

1. 서버에서 `type: "send"` 메시지 수신
2. 큐에 적재 (PENDING 상태)
3. **1차 시도**: 우선순위 방식 (접근성 우선)
4. **실패 시 자동 fallback**: 다른 방식으로 재시도
5. 전송 완료 후 ACK 전송

**장점:**
- 최대한 메시지 전송 성공률 향상
- 한 방식 실패 시 자동으로 다른 방식 시도
- 유연한 대응

**단점:**
- 두 방식 모두 초기화 필요 (약간의 리소스 사용)
- 첫 번째 방식 실패 시 약간의 지연 발생

## 코드 변경 사항

### BridgeForegroundService.kt

- 기능 플래그에 따라 `activeSender` 선택
- `processSendRequest()`에서 `activeSender` 사용

### KakaoNotificationListenerService.kt

- 접근성 방식일 때 알림 처리 건너뛰기
- RemoteInput 방식일 때만 알림 기반 처리

### FeatureFlags.kt

- 두 가지 전송 방식 전환 가능
- SharedPreferences로 설정 저장

## 테스트 방법

### 1. 접근성 서비스 활성화

1. 설정 > 접근성 > 설치된 서비스
2. KakaoBridge 서비스 활성화

### 2. 기능 플래그 변경

코드에서 다음 호출:
```kotlin
FeatureFlags.setAccessibilitySendEnabled(context, true)
FeatureFlags.setRemoteInputSendEnabled(context, false)
```

또는 MainActivity에 UI 토글 추가 (향후 구현)

### 3. 서비스 재시작

- BridgeForegroundService 재시작하여 새로운 설정 적용

### 4. 메시지 전송 테스트

- 서버에서 테스트 메시지 전송
- 접근성 방식으로 전송되는지 확인

## 롤백 방법

### 즉시 롤백

```kotlin
FeatureFlags.setAccessibilitySendEnabled(context, false)
FeatureFlags.setRemoteInputSendEnabled(context, true)
```

서비스 재시작 후 기존 방식으로 동작합니다.

### Git 롤백

```bash
git log --oneline  # 커밋 히스토리 확인
git revert <commit-hash>  # 특정 커밋 롤백
```

또는

```bash
git reset --hard <commit-hash>  # 특정 커밋으로 되돌리기
```

## 주의사항

1. **접근성 서비스 활성화 필수**
   - Accessibility 방식 사용 시 반드시 접근성 서비스를 활성화해야 합니다.

2. **UI Selector 설정**
   - `selectors.json` 파일에 카카오톡 UI Selector가 정확히 설정되어 있어야 합니다.
   - 카카오톡 업데이트 시 Selector 업데이트 필요할 수 있습니다.

3. **알림 권한**
   - RemoteInput 방식 사용 시 알림 권한 필요
   - Accessibility 방식은 알림 권한 불필요

4. **성능**
   - Accessibility 방식은 UI 조작이 필요하므로 약간 느릴 수 있습니다.
   - RemoteInput 방식이 더 빠를 수 있습니다.

## 향후 개선 사항

1. **MainActivity UI 추가**
   - 기능 플래그 전환 토글 추가
   - 접근성 서비스 활성화 안내

2. **자동 Selector 업데이트**
   - 카카오톡 UI 변경 감지
   - Selector 자동 업데이트

3. **하이브리드 방식**
   - 두 방식을 조합하여 최적의 전송 방식 선택

## 관련 파일

- `bridge/app/src/main/java/com/goodhabit/kakaobridge/config/FeatureFlags.kt`
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/service/BridgeForegroundService.kt`
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/service/KakaoNotificationListenerService.kt`
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/sender/RemoteInputSender.kt`
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/accessibility/AccessibilitySender.kt`

