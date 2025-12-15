# 로그 분석 결과

## 현재 상태

### ✅ 정상 작동
- **WebSocket 연결**: 성공 (`WebSocket OPENED: ws://211.218.42.222:5002/ws`)
- **서비스 실행**: 정상

### ❌ 문제점

#### 1. roomKey 추출 실패
```
W/KakaoNotificationListener: Failed to extract roomKey from notification
```

**발견 사항**:
- `android.isGroupConversation = true` - 그룹 채팅임
- `android.messages = [Landroid.os.Parcelable;@...]` - 메시지 배열 존재
- `android.messagingStyleUser = Bundle[...]` - MessagingStyle 사용자 정보 존재
- `android.messagingUser = Person@...` - Person 객체 존재
- `android.title = .` - 사용자명이 "."로 표시됨
- `android.subText = 사용자명` - 사용자명만 있음

**문제**: 채팅방명이 어디에도 명시적으로 없음

#### 2. WebSocket 메시지 수신 없음
- `MESSAGE RECEIVED` 로그가 없음
- 서버에서 메시지를 보내지 않았거나 수신되지 않음

## 개선 사항

### 1. android.messagingStyleUser/messagingUser 파싱 추가
- MessagingStyle 알림에서 사용자 정보 파싱
- Person 객체에서 이름 추출 시도

### 2. android.messages 배열 상세 파싱
- 메시지 배열의 모든 키 확인
- 각 메시지의 senderPerson 확인
- conversationTitle 필드 확인

### 3. 로깅 강화
- 메시지 배열의 모든 키와 값 출력
- 파싱 과정 상세 로깅

## 다음 단계

### 1. 테스트
1. 서비스 재시작
2. 카카오톡에서 메시지 수신
3. 로그 확인:
   ```powershell
   adb logcat | Select-String -Pattern "Extracted roomKey|messages\[0\]|messagingStyleUser|messagingUser"
   ```

### 2. 확인할 로그

**성공 시**:
```
D/KakaoNotificationListener: Extracted roomKey from android.messagingStyleUser.name: "채팅방이름"
또는
D/KakaoNotificationListener: Extracted roomKey from messages[0].senderPerson.name: "채팅방이름"
```

**메시지 배열 상세 정보**:
```
D/KakaoNotificationListener: Attempting to parse android.messages array (size=1)
D/KakaoNotificationListener: First message keys: sender, text, ...
D/KakaoNotificationListener:   messages[0].sender = ...
D/KakaoNotificationListener:   messages[0].text = ...
```

### 3. 서버 메시지 확인
서버 로그에서:
```
[Bridge 전송] 응답 1/1: roomKey="...", text="..."
```

Bridge APK 로그에서:
```
I/BridgeWebSocketClient: ✓✓✓ WebSocket MESSAGE RECEIVED: ...
```

## 추가 개선 필요 시

만약 여전히 채팅방명을 찾지 못한다면:

1. **서버에서 보내는 roomKey 확인**
   - 서버 로그에서 실제 `roomKey` 값 확인
   - 클라이언트에서 보내는 `room` 값 확인

2. **알림 구조 재분석**
   - `android.messages` 배열의 실제 구조 확인
   - 다른 필드에서 채팅방명 찾기

3. **대안 방법**
   - 서버에서 보내는 `roomKey`와 알림의 어떤 필드든 매칭 시도
   - 부분 매칭 또는 정규화 로직 추가

