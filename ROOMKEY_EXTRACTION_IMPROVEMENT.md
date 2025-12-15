# roomKey 추출 개선 사항

## 문제

알림에서 사용자명만 추출되고 채팅방명이 추출되지 않는 문제가 있었습니다.

## 개선 사항

### 1. 채팅방명 우선순위 적용

**이전**:
- `EXTRA_TITLE` 또는 `android.title`을 우선 사용
- 이 필드들이 사용자명일 수 있음

**개선 후**:
1. **1순위**: `EXTRA_CONVERSATION_TITLE` (채팅방명)
2. **2순위**: `android.hiddenConversationTitle` (숨겨진 채팅방명)
3. **3순위**: `android.messages` 배열에서 `conversationTitle` 추출
4. **4순위**: `EXTRA_TITLE` (사용자명일 수 있음)
5. **5순위**: `android.title` (사용자명일 수 있음)

### 2. 사용자명 필드 제외

- `android.subText`: 사용자명이므로 채팅방명으로 사용하지 않음
- `android.text`: 메시지 내용이므로 채팅방명으로 사용하지 않음

### 3. android.messages 배열 파싱

MessagingStyle 알림의 경우 `android.messages` 배열에서 채팅방명을 추출 시도:
- 첫 번째 메시지의 `conversationTitle` 필드 확인
- MessagingStyle.Message 구조 파싱

## 테스트 방법

### 1. 로그 확인

```powershell
adb logcat | Select-String -Pattern "Extracted roomKey|Notification extras dump|messages\[0\]|conversationTitle"
```

### 2. 확인할 로그

**성공 시**:
```
D/KakaoNotificationListener: Extracted roomKey from EXTRA_CONVERSATION_TITLE: "실제채팅방이름"
또는
D/KakaoNotificationListener: Extracted roomKey from android.hiddenConversationTitle: "실제채팅방이름"
또는
D/KakaoNotificationListener: Extracted roomKey from messages[0].conversationTitle: "실제채팅방이름"
```

**실패 시**:
```
D/KakaoNotificationListener: Extracted roomKey from EXTRA_TITLE: "사용자명" (may be sender name)
또는
D/KakaoNotificationListener: Failed to extract roomKey from notification
```

### 3. extras 덤프 확인

로그에서 "Notification extras dump"를 확인하여 실제 채팅방명이 어느 필드에 있는지 확인:

```
D/KakaoNotificationListener: Notification extras dump:
D/KakaoNotificationListener:   android.title = 사용자명
D/KakaoNotificationListener:   android.subText = 사용자명
D/KakaoNotificationListener:   android.conversationTitle = 채팅방명  ← 이 필드 확인
D/KakaoNotificationListener:   android.messages = [Landroid.os.Parcelable;@...
```

## 추가 개선 필요 시

만약 여전히 채팅방명을 찾지 못한다면:

1. **extras 덤프에서 채팅방명 위치 확인**
   - 로그에서 실제 채팅방명이 어느 필드에 있는지 확인
   - 예: `android.conversationTitle`, `com.kakao.talk.roomName` 등

2. **android.messages 배열 상세 파싱**
   - `android.messages` 배열의 각 메시지 구조 확인
   - 채팅방명이 메시지 객체 내부에 있을 수 있음

3. **서버와 매칭 로직 개선**
   - 서버에서 보내는 `roomKey`와 알림에서 추출한 값을 비교
   - 부분 매칭 또는 정규화 로직 추가

## 참고

- 카카오톡 알림 구조는 버전에 따라 다를 수 있음
- 1:1 채팅과 그룹 채팅의 알림 구조가 다를 수 있음
- 실제 테스트를 통해 정확한 필드 위치 확인 필요

