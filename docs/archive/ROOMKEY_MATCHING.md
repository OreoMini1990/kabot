# roomKey 매칭 문제 해결

## 문제

Bridge APK는 **알림에서 추출한 `roomKey`**를 사용하고, 서버는 **클라이언트에서 받은 `room` 값**을 `roomKey`로 사용합니다. 이 두 값이 일치해야 메시지가 전송됩니다.

## 현재 동작 방식

### 1. 클라이언트 → 서버
- 클라이언트가 카카오톡 DB에서 메시지를 읽음
- 채팅방 이름을 복호화하여 `room` 값으로 전송
- 예: `room = "테스트채팅방"` (복호화된 이름)

### 2. 서버 → Bridge APK
- 서버가 클라이언트에서 받은 `room` 값을 `roomKey`로 사용
- 예: `roomKey = "테스트채팅방"` (클라이언트에서 받은 값)

### 3. Bridge APK 알림 감지
- 카카오톡 알림이 올 때 `roomKey` 추출
- `Notification.EXTRA_CONVERSATION_TITLE` 또는 `Notification.EXTRA_TITLE` 사용
- 예: `roomKey = "테스트채팅방"` (알림에서 추출한 값)

### 4. 매칭 문제
- 서버의 `roomKey`와 알림의 `roomKey`가 **정확히 일치**해야 함
- 대소문자, 공백, 특수문자까지 모두 일치해야 함

## 해결 방법

### 방법 1: 로그로 확인 (현재)

**서버 로그 확인**:
```
[Bridge 전송] 응답 1/1: roomKey="테스트채팅방", text="..."
```

**Bridge APK 로그 확인**:
```powershell
adb logcat | Select-String -Pattern "Extracted roomKey|Available cached roomKeys"
```

**비교**:
- 서버: `roomKey="테스트채팅방"`
- Bridge APK: `Available cached roomKeys: 테스트채팅방`
- 두 값이 일치하면 전송 성공, 다르면 실패

### 방법 2: roomKey 정규화 (개선)

서버와 Bridge APK 모두에서 `roomKey`를 정규화하여 비교:

```kotlin
// Bridge APK에서
fun normalizeRoomKey(roomKey: String): String {
    return roomKey.trim().lowercase()
}
```

### 방법 3: chat_id 사용 (대안)

`roomKey` 대신 `chat_id`를 사용하는 방법도 고려할 수 있지만, 알림에서 `chat_id`를 추출하기 어려울 수 있습니다.

## 디버깅 방법

### 1. 실시간 로그 모니터링

```powershell
# 터미널 1: 서버 로그
cd server
node server.js

# 터미널 2: Bridge APK 로그
adb logcat | Select-String -Pattern "roomKey|Extracted|Available cached"
```

### 2. 테스트 시나리오

1. **카카오톡에서 메시지 수신**:
   - 특정 채팅방으로 메시지 전송
   - Bridge APK 로그에서 `Extracted roomKey: ...` 확인
   - 예: `Extracted roomKey: 테스트채팅방`

2. **서버에서 응답 생성**:
   - 서버 로그에서 `[Bridge 전송] ... roomKey="..."` 확인
   - 예: `[Bridge 전송] ... roomKey="테스트채팅방"`

3. **값 비교**:
   - 두 값이 정확히 일치하는지 확인
   - 일치하면 전송 성공, 다르면 실패

### 3. roomKey 불일치 시 해결

**문제**: 서버 `roomKey`와 알림 `roomKey`가 다름

**원인**:
- 클라이언트에서 보내는 `room` 값과 알림 제목이 다름
- 복호화된 이름과 알림 제목이 다름

**해결**:
1. 클라이언트 로그에서 실제 `room` 값 확인
2. Bridge APK 로그에서 실제 `roomKey` 값 확인
3. 두 값을 비교하여 차이점 파악
4. 필요시 정규화 로직 추가

## 중요 사항

**알림이 떠야만 전송 가능**:
- Bridge APK는 알림에서 `replyAction`을 캐싱함
- 알림이 없으면 `replyAction`이 없어서 전송 불가
- 따라서 **해당 채팅방으로 메시지를 받아서 알림이 생성되어야 함**

**roomKey 매칭**:
- 서버에서 보낸 `roomKey`와 알림에서 추출한 `roomKey`가 일치해야 함
- 대소문자, 공백, 특수문자까지 모두 일치해야 함

## 다음 단계

1. 실제 테스트를 진행하여 로그 확인
2. 서버 로그의 `roomKey` 값 확인
3. Bridge APK 로그의 `roomKey` 값 확인
4. 두 값을 비교하여 불일치 원인 파악
5. 필요시 정규화 로직 추가

