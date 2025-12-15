# 기술적 한계 분석: 카카오톡 메시지 전송

## 문제 상황
- 로그에는 "전송 성공"이라고 나오지만 실제로는 카카오톡에 메시지가 전송되지 않음
- Iris 원본 코드는 정상적으로 전송하고 있음

## Iris 원본 코드 분석

### Replier.kt의 sendMessageInternal()
```kotlin
val results = Bundle().apply {
    putCharSequence("reply_message", msg)
}
val remoteInput = RemoteInput.Builder("reply_message").build()
RemoteInput.addResultsToIntent(arrayOf(remoteInput), this, results)
AndroidHiddenApi.startService(intent)
```

### 핵심 차이점

#### Iris (Android 앱)
1. ✅ `RemoteInput.addResultsToIntent()` - Bundle을 Intent에 특정 키로 추가 가능
2. ✅ `AndroidHiddenApi.startService()` - Android Hidden API로 직접 Intent 전송
3. ✅ Bundle 객체를 Intent에 직접 추가 가능

#### 우리 (Python + am startservice)
1. ❌ `RemoteInput.addResultsToIntent()` - Python에서 Android API 호출 불가
2. ❌ `AndroidHiddenApi.startService()` - Python에서 Android Hidden API 호출 불가
3. ❌ Bundle 객체 전달 불가 - `am startservice`는 Bundle을 지원하지 않음

## 기술적 한계 상세 분석

### 1. RemoteInput Bundle 전달 불가
- **문제**: `RemoteInput.addResultsToIntent()`는 Bundle을 Intent에 `android.remoteinput.results` 키로 추가
- **한계**: `am startservice` 명령어는 Bundle 객체를 전달할 수 없음
- **시도한 방법**:
  - `--es android.remoteinput.results` (문자열로 JSON 전달) - 실패
  - `--es reply_message` (일반 Extra로 전달) - 실패
  - `--es android.support.remoteinput.results` (대체 키) - 실패

### 2. Android Hidden API 호출 불가
- **문제**: Iris는 `AndroidHiddenApi.startService()`를 사용하여 직접 Intent 전송
- **한계**: Python에서는 Android Hidden API를 호출할 수 없음
- **시도한 방법**:
  - `am startservice` 명령어 사용 - 명령어는 성공하지만 실제 전송 실패

### 3. Bundle 객체 직렬화 불가
- **문제**: Android의 Bundle은 Parcelable 객체로, 직렬화가 복잡함
- **한계**: `am startservice`는 Bundle을 문자열로 직렬화할 수 없음
- **시도한 방법**:
  - JSON 문자열로 Bundle 시뮬레이션 - 실패 (카카오톡이 인식하지 못함)

## 가능한 해결 방법

### 방법 1: Iris HTTP API 활용 (✅ 구현 완료, 권장)
- **설명**: Iris 앱의 `/reply` HTTP API를 통해 메시지 전송
- **Iris 원본 코드**: `IrisServer.kt`의 `/reply` 엔드포인트
- **요청 형식**:
  ```json
  POST http://[ANDROID_IP]:3000/reply
  Content-Type: application/json
  {
    "type": "text",
    "room": "[CHAT_ROOM_ID]",
    "data": "[MESSAGE_TEXT]"
  }
  ```
- **장점**: 
  - ✅ Iris 원본 코드와 동일한 방식으로 작동
  - ✅ RemoteInput Bundle을 정확하게 전달 가능
  - ✅ 추가 개발 최소화
  - ✅ 이미 구현 완료
- **단점**: 
  - Iris 앱이 실행 중이어야 함
  - Iris 앱의 포트(기본: 3000)에 접근 가능해야 함
- **설정**:
  - 환경 변수: `IRIS_URL=http://[ANDROID_IP]:3000`
  - 환경 변수: `IRIS_ENABLED=true` (기본값: true)

### 방법 2: Android 앱 개발
- **설명**: Iris와 같은 Android 앱을 개발하여 `RemoteInput.addResultsToIntent()` 직접 호출
- **장점**: 
  - Iris 원본 코드와 동일한 방식으로 작동
  - RemoteInput Bundle을 정확하게 전달 가능
- **단점**: 
  - Android 앱 개발 필요
  - 추가 개발 시간 필요

### 방법 3: Termux에서 Android API 직접 호출
- **설명**: Termux에서 Python으로 Android Java/Kotlin 코드 호출
- **필요한 도구**:
  - Py4A (Python for Android)
  - 또는 JNI를 통한 Java 호출
- **장점**: 
  - Python 코드 유지 가능
  - Android API 직접 호출 가능
- **단점**: 
  - 복잡한 설정 필요
  - Termux 환경에서만 작동

### 방법 4: am startservice 직접 호출 (fallback)
- **설명**: `am startservice` 명령어로 직접 Intent 전송
- **현재 상태**: 구현되어 있지만 RemoteInput Bundle 전달 불가로 실패
- **장점**: 
  - Iris 앱 불필요
- **단점**: 
  - RemoteInput Bundle 전달 불가
  - 실제 전송 실패 가능성 높음

## 결론

**핵심 문제**: `am startservice` 명령어로는 `RemoteInput.addResultsToIntent()`가 생성하는 Bundle을 전달할 수 없음

**기술적 한계**:
1. Python에서 Android API 직접 호출 불가
2. `am startservice`는 Bundle 객체 전달 불가
3. RemoteInput Bundle을 문자열로 시뮬레이션 불가

**권장 해결 방법**:
1. **✅ 구현 완료**: Iris HTTP API 활용 (가장 빠른 해결, 권장)
   - `IRIS_URL` 환경 변수 설정 필요
   - Iris 앱이 실행 중이어야 함
2. **fallback**: `am startservice` 직접 호출 (Iris HTTP API 실패 시)
   - RemoteInput Bundle 전달 불가로 실패 가능성 높음
3. **장기**: Android 앱 개발 또는 Py4A 활용

## 참고 자료
- Iris 원본 코드: `docs/LABBOT/Iris-main/app/src/main/java/party/qwer/iris/Replier.kt`
- Android RemoteInput 문서: https://developer.android.com/reference/android/app/RemoteInput
- Android Hidden API: `docs/LABBOT/Iris-main/app/src/main/java/party/qwer/iris/AndroidHiddenApi.kt`

