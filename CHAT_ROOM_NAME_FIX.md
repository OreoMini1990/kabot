# 채팅방명 추출 수정

## 문제

- **알림에서 추출한 roomKey**: "좋은메디" (APK 설치 핸드폰의 카카오톡 사용자명)
- **실제 채팅방명**: "의운모"
- **발신자**: "."

알림에서 사용자명을 추출하고 있었고, 실제 채팅방명을 추출하지 못했습니다.

## 해결

### 그룹 채팅에서 채팅방명 추출

카카오톡 알림 구조:
- `android.isGroupConversation = true` - 그룹 채팅
- `android.subText = "의운모"` - 채팅방명 (그룹 채팅의 경우)
- `android.messagingStyleUser.name = "좋은메디"` - 사용자명

### 수정 사항

1. **그룹 채팅 감지**: `android.isGroupConversation` 확인
2. **android.subText 우선순위 상향**: 그룹 채팅의 경우 `android.subText`를 채팅방명으로 사용
3. **필터링**: "N개의 읽지 않은 메시지" 같은 형식 제외

### 우선순위

1. `EXTRA_CONVERSATION_TITLE` (채팅방명)
2. **`android.subText`** (그룹 채팅의 경우 채팅방명) ← **추가**
3. `android.hiddenConversationTitle` (숨겨진 채팅방명)
4. `android.messagingStyleUser.name` (사용자명 - 낮은 우선순위)
5. `android.messagingUser.name` (사용자명 - 낮은 우선순위)
6. `android.messages` 배열 파싱

## 테스트

### 1. 서비스 재시작
앱에서 "서비스 시작" 버튼 클릭

### 2. 카카오톡에서 메시지 수신
"의운모" 채팅방으로 메시지 수신

### 3. 로그 확인
```powershell
adb logcat | Select-String -Pattern "Extracted roomKey|subText.*group chat|isGroupConversation"
```

### 4. 예상 로그

**성공 시**:
```
D/KakaoNotificationListener: isGroupConversation: true
D/KakaoNotificationListener: Extracted roomKey from android.subText (group chat): "의운모"
D/KakaoNotificationListener: Extracted roomKey: 의운모
D/KakaoNotificationListener: Found replyAction for roomKey: 의운모
```

### 5. 서버와 매칭 확인

서버 로그에서:
```
[Bridge 전송] 응답 1/1: roomKey="의운모", text="..."
```

Bridge APK 로그에서:
```
I/BridgeForegroundService: Processing send request:
I/BridgeForegroundService:   roomKey (normalized): "의운모"
I/RemoteInputSender: ✓ Found cached replyAction for roomKey: "의운모"
I/RemoteInputSender: ✓✓✓ Message sent successfully
```

## 추가 개선

만약 여전히 문제가 있다면:

1. **서버에서 보내는 roomKey 확인**: 클라이언트에서 보내는 `room` 값 확인
2. **정규화**: 대소문자, 공백 등 정규화 로직 추가
3. **부분 매칭**: 완전 일치가 안 되면 부분 매칭 시도

