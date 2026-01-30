# KakaoBot 전체 통합 가이드

## 시스템 아키텍처

```
카카오톡 DB → kakao_poller.py → WebSocket → server.js → labbot-node.js
                                                      ↓
                                              Bridge APK (Android)
                                                      ↓
                                                카카오톡 전송
```

## 메시지 플로우

### 1. 메시지 수신 플로우

1. **클라이언트 (kakao_poller.py)**
   - 카카오톡 DB 폴링
   - 메시지 복호화
   - WebSocket으로 서버에 전송:
   ```json
   {
     "type": "message",
     "room": "의운모",
     "sender": "사용자명",
     "message": "복호화된 메시지",
     "isGroupChat": true,
     "json": { ... }
   }
   ```

2. **서버 (server.js)**
   - WebSocket 메시지 수신
   - 메시지 복호화 (필요 시)
   - `labbot-node.js`의 `handleMessage()` 호출
   - 응답 생성

3. **서버 응답 전송**
   - 기존 클라이언트용:
   ```json
   {
     "type": "reply",
     "replies": [
       {
         "type": "text",
         "text": "응답 메시지",
         "room": "의운모",
         "chat_id": "123456"
       }
     ]
   }
   ```
   - Bridge APK용:
   ```json
   {
     "type": "send",
     "id": "reply-1234567890-0",
     "roomKey": "의운모",
     "text": "응답 메시지",
     "ts": 1234567890
   }
   ```

### 2. 메시지 전송 플로우 (Bridge APK)

1. **Bridge APK 메시지 수신**
   - WebSocket으로 `type: "send"` 메시지 수신
   - 큐에 적재 (Room DB)
   - 상태: `PENDING`

2. **알림 감지 및 전송**
   - `KakaoNotificationListenerService`가 카카오톡 알림 감지
   - `roomKey` 추출 및 `replyAction` 캐싱
   - 대기 중인 전송 요청 자동 처리
   - `RemoteInputSender`로 메시지 전송

3. **전송 결과 처리**
   - 성공: 상태 → `SENT`, ACK 전송
   - 실패: 상태 → `FAILED_RETRYABLE` 또는 `FAILED_FINAL`
   - 재시도 정책: 5s → 20s → 60s → 3m → 10m

4. **ACK 전송**
   ```json
   {
     "type": "ack",
     "id": "request-id",
     "status": "SENT",
     "detail": null,
     "device": "Galaxy A16",
     "ts": 1234567890
   }
   ```

## 설정

### 서버 설정

**환경 변수:**
- `PORT`: 서버 포트 (기본값: 5002)
- `BOT_ID`: 봇 ID (기본값: iris-core)
- `LOG_DIR`: 로그 저장 디렉토리 (기본값: /home/app/iris-core)

**서버 실행:**
```bash
cd kakkaobot/server
npm install
npm start
```

### 클라이언트 설정

**환경 변수:**
- `WS_URL`: WebSocket URL (기본값: ws://192.168.0.15:5002/ws)
- `HTTP_URL`: HTTP URL (기본값: http://192.168.0.15:5002)
- `IRIS_URL`: Iris HTTP API URL (기본값: http://localhost:3000)
- `IRIS_ENABLED`: Iris 사용 여부 (기본값: true)

**클라이언트 실행:**
```bash
cd kakkaobot/client
pip install -r requirements.txt
python kakao_poller.py
```

### Bridge APK 설정

**WebSocket URL:**
- 기본값: `ws://192.168.0.15:5002/ws`
- 앱 내 설정에서 변경 가능 (향후 구현)

**필수 권한:**
1. 알림 접근 권한 (NotificationListenerService)
2. 배터리 최적화 제외
3. Foreground Service 권한

## 프로토콜 명세

### WebSocket 메시지 타입

#### 1. 클라이언트 → 서버

**메시지 수신:**
```json
{
  "type": "message",
  "room": "채팅방 이름",
  "sender": "발신자 이름",
  "message": "메시지 내용",
  "isGroupChat": true,
  "json": {
    "_id": "메시지 ID",
    "chat_id": "채팅방 ID",
    "user_id": "사용자 ID",
    "v": "{\"enc\":31}",
    ...
  }
}
```

**연결 확인:**
```json
{
  "type": "connect",
  "client": "kakao_poller"
}
```

#### 2. 서버 → 클라이언트

**응답 (기존 형식):**
```json
{
  "type": "reply",
  "replies": [
    {
      "type": "text",
      "text": "응답 메시지",
      "room": "채팅방 이름",
      "chat_id": "채팅방 ID"
    }
  ]
}
```

#### 3. 서버 → Bridge APK

**메시지 전송 요청:**
```json
{
  "type": "send",
  "id": "고유 ID",
  "roomKey": "채팅방 이름",
  "text": "전송할 메시지",
  "ts": 1234567890
}
```

#### 4. Bridge APK → 서버

**ACK 응답:**
```json
{
  "type": "ack",
  "id": "요청 ID",
  "status": "SENT" | "WAITING_NOTIFICATION" | "FAILED",
  "detail": "상세 정보 (선택)",
  "device": "기기 모델",
  "ts": 1234567890
}
```

## 문제 해결

### Bridge APK가 메시지를 받지 못하는 경우

1. **WebSocket 연결 확인**
   - 앱 로그 확인: `adb logcat -s BridgeForegroundService:D`
   - 연결 상태 확인

2. **권한 확인**
   - 알림 접근 권한 활성화 여부
   - 배터리 최적화 제외 여부

3. **서버 로그 확인**
   - Bridge 전송 로그 확인
   - WebSocket 연결 상태 확인

### 메시지가 전송되지 않는 경우

1. **알림 감지 확인**
   - 카카오톡 알림이 켜져 있는지 확인
   - 해당 채팅방 알림이 활성화되어 있는지 확인

2. **큐 상태 확인**
   - Room DB에서 전송 요청 상태 확인
   - 재시도 큐 확인

3. **로그 확인**
   - `KakaoNotificationListenerService` 로그
   - `RemoteInputSender` 로그

## 테스트

### 로컬 테스트 (Bridge APK)

```bash
adb shell am broadcast -a com.goodhabit.kakaobridge.SEND \
  -n com.goodhabit.kakaobridge/.BridgeCommandReceiver \
  --es token "LOCAL_DEV_TOKEN" \
  --es roomKey "의운모" \
  --es text "테스트 메시지"
```

### WebSocket 테스트

서버에서 직접 전송:
```json
{
  "type": "send",
  "id": "test-123",
  "roomKey": "의운모",
  "text": "테스트 메시지",
  "ts": 1234567890
}
```

## 참고 문서

- [Bridge APK 빌드 가이드](bridge/BUILD_INSTRUCTIONS.md)
- [서버 README](server/README.md)
- [클라이언트 README](client/README.md)
- [기술적 한계](docs/TECHNICAL_LIMITATIONS.md)

