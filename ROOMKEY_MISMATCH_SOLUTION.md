# roomKey 불일치 문제 해결

## 현재 상황

### ✅ 성공
- roomKey 추출: "좋은메디" (사용자명)
- replyAction 찾기: 성공

### ❌ 문제
- WebSocket 메시지 수신 없음
- 메시지 전송 시도 없음

## 문제 원인

**roomKey 불일치 가능성**:
- 알림에서 추출한 roomKey: "좋은메디" (사용자명)
- 서버에서 보내는 roomKey: 실제 채팅방명 (다를 수 있음)

## 해결 방법

### 방법 1: 서버에서 보내는 roomKey 확인

**서버 로그 확인**:
```
[Bridge 전송] 응답 1/1: roomKey="...", text="..."
```

**Bridge APK 로그 확인**:
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|roomKey"
```

**비교**:
- 서버 roomKey: "실제채팅방이름"
- 알림 roomKey: "좋은메디"
- 두 값이 일치하지 않으면 매칭 실패

### 방법 2: 클라이언트에서 보내는 room 값 확인

클라이언트 로그에서:
```
[전송] room 값: 복호화된 이름="..."
```

이 값이 서버로 전달되어 `roomKey`로 사용됩니다.

### 방법 3: 알림에서 실제 채팅방명 추출

현재는 `android.messagingStyleUser.name`에서 사용자명을 추출하고 있습니다.

**실제 채팅방명을 찾기 위해**:
1. `android.messages` 배열의 구조 확인
2. 다른 필드에서 채팅방명 찾기
3. 서버에서 보내는 roomKey와 매칭되는 필드 찾기

## 테스트 방법

### 1. 서버 로그 확인
서버 콘솔에서:
```
[Bridge 전송] 응답 1/1: roomKey="실제값", text="..."
```

### 2. Bridge APK 로그 확인
```powershell
adb logcat | Select-String -Pattern "MESSAGE RECEIVED|roomKey|Available cached roomKeys"
```

### 3. roomKey 비교
- 서버 roomKey: "실제값"
- 알림 roomKey: "좋은메디"
- 두 값이 일치하는지 확인

### 4. 매칭 실패 시
로그에서:
```
W/RemoteInputSender: ✗ No cached replyAction for roomKey: "서버roomKey"
W/RemoteInputSender:   Available cached roomKeys (1):
W/RemoteInputSender:     - "좋은메디"
```

## 임시 해결책

만약 서버에서 보내는 roomKey가 "좋은메디"라면:
- 현재 추출 로직이 정상 작동
- WebSocket 메시지 수신 문제 해결 필요

만약 서버에서 보내는 roomKey가 다른 값이라면:
- 알림에서 실제 채팅방명을 추출하도록 개선 필요
- 또는 서버에서 보내는 roomKey를 사용자명으로 변경

## 다음 단계

1. **서버 로그 확인**: 실제 roomKey 값 확인
2. **Bridge APK 로그 확인**: 메시지 수신 여부 확인
3. **roomKey 비교**: 두 값이 일치하는지 확인
4. **불일치 시**: 알림에서 실제 채팅방명 추출 방법 개선

