# KakaoBot 최종 로직 및 아키텍처

## 최종 시스템 구조

```
┌─────────────────┐
│  카카오톡 DB     │
│  (KakaoTalk.db) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  클라이언트      │  ← 메시지 수신만 담당
│  kakao_poller.py │
└────────┬────────┘
         │ WebSocket
         │ type: "message"
         ▼
┌─────────────────┐
│  서버            │  ← 메시지 처리 및 응답 생성
│  server.js       │
│  labbot-node.js  │
└────────┬────────┘
         │ WebSocket
         │ type: "send"
         ▼
┌─────────────────┐
│  Bridge APK     │  ← 메시지 전송만 담당
│  (Android)       │
└────────┬────────┘
         │ RemoteInput
         ▼
┌─────────────────┐
│  카카오톡        │
│  (앱)            │
└─────────────────┘
```

## 역할 분리

### 1. 클라이언트 (kakao_poller.py)
**역할**: 메시지 수신만 담당

**기능:**
- ✅ 카카오톡 DB 폴링
- ✅ 메시지 복호화
- ✅ 서버로 메시지 전송 (WebSocket, type: "message")
- ✅ 서버 응답 로깅 (디버깅용)

**제거된 기능:**
- ❌ Iris HTTP API 연동
- ❌ 카카오톡 메시지 전송 (`send_to_kakaotalk()`)
- ❌ 서버 응답 처리 및 전송

### 2. 서버 (server.js + labbot-node.js)
**역할**: 메시지 처리 및 응답 생성

**기능:**
- ✅ 클라이언트로부터 메시지 수신
- ✅ 메시지 처리 및 응답 생성 (`handleMessage()`)
- ✅ Bridge APK로 응답 전송 (type: "send")
- ✅ 기존 클라이언트로도 응답 전송 (type: "reply", 호환성)

### 3. Bridge APK (Android)
**역할**: 메시지 전송만 담당

**기능:**
- ✅ 서버로부터 응답 수신 (type: "send")
- ✅ 큐에 적재 (Room DB)
- ✅ 카카오톡 알림 감지 및 자동 전송
- ✅ ACK 응답 전송 (type: "ack")

## 메시지 플로우

### 수신 플로우
1. **클라이언트**: 카카오톡 DB 폴링 → 메시지 복호화
2. **클라이언트 → 서버**: WebSocket으로 메시지 전송
   ```json
   {
     "type": "message",
     "room": "의운모",
     "sender": "사용자명",
     "message": "복호화된 메시지",
     "json": { ... }
   }
   ```
3. **서버**: 메시지 처리 및 응답 생성
4. **서버 → Bridge APK**: WebSocket으로 응답 전송
   ```json
   {
     "type": "send",
     "id": "reply-1234567890-0",
     "roomKey": "의운모",
     "text": "응답 메시지",
     "ts": 1234567890
   }
   ```
5. **Bridge APK**: 큐에 적재 → 알림 감지 → 카카오톡 전송
6. **Bridge APK → 서버**: ACK 전송
   ```json
   {
     "type": "ack",
     "id": "request-id",
     "status": "SENT",
     "device": "Galaxy A16",
     "ts": 1234567890
   }
   ```

## 제거된 코드 요약

### 클라이언트 (kakao_poller.py)
- ❌ `IRIS_URL`, `IRIS_ENABLED` 설정 변수
- ❌ `send_to_kakaotalk()` 함수 (약 280줄)
- ❌ 서버 응답 처리 및 카카오톡 전송 로직

### 결과
- ✅ 코드 약 280줄 감소
- ✅ 역할이 명확해짐
- ✅ 유지보수 용이

## 장점

1. **명확한 역할 분리**
   - 클라이언트: 수신만
   - 서버: 처리만
   - Bridge APK: 전송만

2. **안정성 향상**
   - Bridge APK가 전용으로 전송을 담당
   - RemoteInput을 올바르게 사용

3. **코드 단순화**
   - 클라이언트 코드가 단순해짐
   - 불필요한 로직 제거

4. **확장성**
   - Bridge APK를 통해 다양한 전송 방식 지원 가능
   - 향후 AccessibilitySender 등 추가 가능

## 검증 완료

- ✅ Python 구문 오류 없음
- ✅ 불필요한 코드 제거 완료
- ✅ 전체 플로우 점검 완료
- ✅ 서버 코드 구문 오류 없음
- ✅ Bridge APK 코드 컴파일 성공

---

**최종 상태**: ✅ **완료 및 검증 완료**





