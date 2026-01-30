# 이미지 미리보기 업로드 기능 가이드

## 개요

Bridge APK가 카카오톡 알림에서 이미지 미리보기를 감지하여 서버로 업로드하는 기능입니다. 이 기능은 Primary 이미지 처리(attachment 복호화)가 실패했을 때 Fallback으로 사용됩니다.

## 구현된 기능

### 1. 이미지 감지 (`KakaoNotificationListenerService`)
- 카카오톡 알림에서 이미지 메시지 감지
- `android.messages` 배열의 첫 번째 메시지에서 Content URI 추출
- 이미지 타입 확인 (`type="image/"`, `type="2"`, `type="27"`)

### 2. 이미지 업로드 (`ImagePreviewUploader`)
- Content URI에서 이미지 바이트 읽기 (버퍼 스트리밍)
- 임시 파일로 저장
- `POST /bridge/preview-image`로 multipart 업로드
- `X-Bridge-Key` 헤더로 인증
- 최대 3회 재시도

### 3. 재시도 로직 (`ImagePreviewUploadWorker`)
- WorkManager를 사용한 백그라운드 재시도
- 최대 3회 재시도
- 네트워크 연결 시 자동 재시도

## 설정 방법

### 1. 서버 URL 설정

앱의 SharedPreferences에 서버 URL을 설정합니다:

```kotlin
val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
prefs.edit().putString("server_url", "http://192.168.0.15:5002").apply()
```

### 2. Bridge API Key 설정

서버의 `.env` 파일에 설정한 `BRIDGE_API_KEY`를 앱에 설정합니다:

```kotlin
val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
prefs.edit().putString("bridge_api_key", "your-secret-key-here").apply()
```

### 3. 서버 환경 변수

서버의 `.env` 파일에 다음을 추가:

```bash
BRIDGE_API_KEY=your-secret-key-here
BRIDGE_PREVIEW_ENABLED=true
```

## 동작 흐름

1. **알림 수신**: 카카오톡에서 이미지 메시지 알림이 올 때
2. **이미지 감지**: `KakaoNotificationListenerService.onNotificationPosted()`에서 이미지 타입 확인
3. **URI 추출**: `android.messages[0].uri`에서 Content URI 추출
4. **즉시 업로드**: `ImagePreviewUploader.uploadImage()` 호출
5. **성공 시**: 서버의 `PENDING_PREVIEW_CACHE`에 저장됨
6. **실패 시**: WorkManager로 재시도 예약 (최대 3회)

## 서버 측 처리

서버는 다음 순서로 이미지를 처리합니다:

1. **Primary Flow**: attachment 복호화 → URL 추출 → 다운로드
2. **Fallback Flow**: `PENDING_PREVIEW_CACHE`에서 조회 (90초 이내)
3. **네이버 카페 업로드**: Primary 또는 Fallback으로 확보한 이미지로 글 작성

## 로그 확인

### Bridge APK 로그

```bash
adb logcat | grep -E "ImagePreviewUploader|ImagePreviewUploadWorker|이미지 감지"
```

주요 로그 태그:
- `ImagePreviewUploader`: 업로드 진행 상황
- `ImagePreviewUploadWorker`: WorkManager 재시도
- `KakaoNotificationListener`: 이미지 감지

### 서버 로그

```bash
# 서버 로그에서 확인
[Bridge 업로드] ✅ 업로드 성공
[미리보기 캐시] ✅ 조회 성공
[이미지 처리] [Fallback] ✅ 성공
```

## 문제 해결

### 1. 이미지가 감지되지 않음

- 알림 접근 권한 확인: 설정 > 앱 > KakaoBridge > 알림 액세스
- 로그 확인: `adb logcat | grep "이미지 감지"`
- `android.messages` 배열이 비어있는지 확인

### 2. 업로드 실패

- 네트워크 연결 확인
- 서버 URL 확인: `bridge_config` SharedPreferences
- Bridge API Key 확인: 서버와 동일한지 확인
- 서버 로그 확인: `/bridge/preview-image` 엔드포인트 로그

### 3. WorkManager 재시도가 작동하지 않음

- 배터리 최적화 제외: 설정 > 앱 > KakaoBridge > 배터리 최적화 제외
- WorkManager 로그 확인: `adb logcat | grep "WorkManager"`

## 테스트 방법

1. **카카오톡에서 이미지 전송**
2. **Bridge APK 로그 확인**:
   ```bash
   adb logcat | grep -E "이미지 감지|ImagePreviewUploader"
   ```
3. **서버 로그 확인**:
   ```bash
   # 서버에서
   tail -f server.log | grep -E "Bridge 업로드|미리보기 캐시"
   ```
4. **서버 캐시 확인**: `PENDING_PREVIEW_CACHE`에 저장되었는지 확인

## 주의사항

1. **Content URI 유효성**: 알림이 사라지면 URI가 무효화될 수 있음
   - 해결: 즉시 업로드 또는 임시 파일 저장
2. **배터리 최적화**: Android 14+에서는 배터리 최적화 제외 필요
3. **권한**: 알림 접근 권한이 활성화되어 있어야 함

## 파일 구조

```
bridge/app/src/main/java/com/goodhabit/kakaobridge/service/
├── KakaoNotificationListenerService.kt  # 알림 감지 및 이미지 감지
├── ImagePreviewUploader.kt              # 이미지 업로드 유틸리티
└── ImagePreviewUploadWorker.kt          # WorkManager 재시도 Worker
```

## API 스펙

### POST /bridge/preview-image

**Headers:**
- `X-Bridge-Key: <BRIDGE_API_KEY>` (필수)

**Body (multipart/form-data):**
- `room`: string (채팅방 이름)
- `senderId`: string (선택)
- `senderName`: string (선택)
- `kakaoLogId`: string (선택)
- `clientTs`: string (밀리초 타임스탬프)
- `mime`: string (image/jpeg, image/png 등)
- `isGroupConversation`: string ("true" 또는 "false")
- `image`: file (이미지 파일)

**Response:**
```json
{
  "ok": true,
  "message": "Image uploaded successfully",
  "filename": "room_sender_timestamp.jpg",
  "url": "http://192.168.0.15:5002/api/image/filename.jpg",
  "size": 12345,
  "mime": "image/jpeg"
}
```

