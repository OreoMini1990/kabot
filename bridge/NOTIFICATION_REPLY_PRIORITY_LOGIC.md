# 알림 리플라이 우선순위 로직 개선

## 문제점

### 기존 문제
- **이미지가 포함된 메시지**가 알림 리플라이로 처리되면 이미지가 전송되지 않음
- `RemoteInputSender`는 이미지 전송을 지원하지 않지만, 이미지가 있어도 먼저 시도함
- RemoteInputSender가 성공하면 이미지가 무시된 채로 완료됨

### 예시 시나리오
1. 사용자가 `!이미지` 명령어 입력
2. 서버에서 `imageUrl` 필드를 포함한 응답 생성
3. Bridge APK가 RemoteInputSender로 먼저 시도
4. RemoteInputSender가 성공하지만 이미지는 무시됨
5. 사용자는 이미지 없이 텍스트만 받음

## 해결 방안

### 이미지 전송 요청 판단 로직 추가

`BridgeForegroundService.processSendRequest()`에서:

1. **이미지가 있는 경우 (imageUrl != null && imageUrl.isNotBlank())**:
   - RemoteInputSender를 건너뛰고 바로 AccessibilitySender 사용
   - 이유: RemoteInputSender는 이미지 전송을 지원하지 않음

2. **이미지가 없는 경우**:
   - 기존 로직대로 RemoteInputSender 먼저 시도
   - 알림이 없으면 AccessibilitySender로 fallback

## 코드 변경 사항

### `BridgeForegroundService.kt`

```kotlin
private suspend fun processSendRequest(request: SendRequest) {
    // ...
    
    // 이미지가 있는 경우: RemoteInputSender는 이미지 전송을 지원하지 않으므로
    // 바로 AccessibilitySender 사용 (알림 리플라이 건너뛰기)
    val hasImage = request.imageUrl != null && request.imageUrl!!.isNotBlank()
    if (hasImage) {
        Log.i(TAG, "⚠ 이미지 전송 요청 감지: RemoteInputSender 건너뛰기")
        // AccessibilitySender로 바로 처리
        // ...
        return
    }
    
    // 이미지가 없는 경우: RemoteInputSender 시도 (알림 리플라이)
    // ...
}
```

## 장점

1. **정확한 이미지 전송**: 이미지가 있는 메시지는 항상 AccessibilitySender로 전송되어 이미지가 정상 전송됨
2. **성능 최적화**: 불필요한 RemoteInputSender 시도를 건너뛰어 시간 절약
3. **명확한 로직**: 이미지 유무에 따라 명확히 분기되어 이해하기 쉬움

## 테스트 시나리오

### 시나리오 1: 이미지가 포함된 메시지
1. 서버에서 `imageUrl` 필드를 포함한 메시지 전송
2. Bridge APK가 이미지 감지
3. RemoteInputSender를 건너뛰고 AccessibilitySender 사용
4. 이미지와 텍스트가 정상 전송됨

### 시나리오 2: 텍스트만 있는 메시지
1. 서버에서 `imageUrl` 필드 없이 메시지 전송
2. Bridge APK가 RemoteInputSender 먼저 시도
3. 알림이 있으면 알림 리플라이로 전송
4. 알림이 없으면 AccessibilitySender로 fallback

### 시나리오 3: `!이미지` 명령어
1. 사용자가 `!이미지` 명령어 입력
2. 서버에서 `imageUrl` 포함 응답 생성
3. Bridge APK가 이미지 감지하여 AccessibilitySender 사용
4. 이미지가 정상 전송됨

## 관련 기능

- `!이미지` 명령어 (서버에서 `imageUrl` 필드 포함)
- 네이버 카페 질문 글에 이미지 첨부
- 기타 이미지가 포함된 봇 응답

