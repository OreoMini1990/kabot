# 문제 해결 요약

## 1. 닉네임 복호화 문제 (EnmdCn3K가 로그에 암호화되어 나타남)

### 원인
- 클라이언트에서 복호화 실패 시 암호화된 이름이 그대로 전달됨
- 서버에서 복호화 시도했지만 senderName이 여전히 암호화된 상태로 handleMessage에 전달될 수 있음

### 해결
- `server/server.js`에 최종 검증 로직 추가: senderName이 여전히 암호화되어 있으면 복호화 재시도
- 위치: `server/server.js` 1740-1764 라인
- 동작: senderName이 base64 형태이면 myUserId로 복호화 재시도 (enc: 31, 30, 32)

### 확인 방법
- 로그에서 `[발신자] ⚠️ senderName이 여전히 암호화된 상태` 경고 확인
- `[발신자] ✅ 최종 복호화 성공` 메시지 확인

---

## 2. 반응 감지 문제

### 현재 코드
- 클라이언트: `client/kakao_poller.py` 1418라인에서 type이 70-79 범위일 때 반응으로 감지
- 서버: `server/server.js` 1127라인에서 `type === 'reaction'` 처리

### 확인 필요 사항
- 실제 카카오톡 DB에서 반응 메시지의 type 값 확인 필요
- 사용자가 제공한 JavaScript 코드에서 반응 타입 확인 필요

### 개선 방안
1. DB에서 실제 반응 메시지의 type 값 로깅 추가
2. attachment 필드에서 반응 정보 파싱 강화
3. 사용자 제공 코드 참고하여 실제 타입 값 확인

---

## 3. 신고 기능 문제

### 현재 구현
- `server/labbot-node.js` 785-836라인: `!신고` 명령어 처리
- `replyToMessageId`가 필수 (답장 버튼 클릭 필요)
- `server/server.js` 1787라인: `replyToMessageId` 추출 (json?.reply_to_message_id 등)

### 확인 필요 사항
- 클라이언트에서 `reply_to_message_id`를 제대로 전송하는지 확인 필요
- 카카오톡 DB의 `chat_logs` 테이블에서 답장 메시지의 구조 확인

### 개선 방안
1. 클라이언트에서 답장 메시지의 원본 메시지 ID 추출 로직 추가
2. DB 스키마 확인 (Iris 코드 참고: `referer` 필드 또는 `attachment`의 `src_message` 확인)
3. 로깅 강화: replyToMessageId 값 로깅

---

## 4. 통계 관리자 권한 체크

### 현재 구현
- `server/labbot-node.js` 467-476라인: `isAdmin()` 함수
- `extractSenderName()`으로 닉네임 추출 후 비교
- 이미 복호화된 닉네임이 전달되므로 문제 없음

### 확인
- senderName이 복호화된 후 handleMessage에 전달되므로 문제 없음
- 하지만 암호화된 닉네임이 전달되면 isAdmin이 false 반환할 수 있음

### 개선 방안
- isAdmin 함수에서 암호화된 닉네임인지 확인하고 복호화 시도 (현재는 복호화된 값이 전달되므로 불필요할 수 있음)

---

## 5. Bridge APK 접근성 사용 이유

### 현재 구조 (하이브리드 모드)
1. **RemoteInputSender (우선 사용)**: 알림 기반 전송
   - NotificationListenerService 사용
   - 알림의 RemoteInput으로 메시지 전송
   - 알림이 있어야 작동

2. **AccessibilitySender (Fallback)**: UI 자동화
   - AccessibilityService 사용
   - 알림이 없을 때 자동으로 fallback
   - UI를 직접 조작하여 메시지 전송

### 이유
- 알림이 없는 경우에도 메시지 전송 가능
- 알림이 사라진 경우 fallback으로 작동
- 더 안정적인 메시지 전송 보장

### 코드 위치
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/service/BridgeForegroundService.kt` 93-128라인
- `bridge/app/src/main/java/com/goodhabit/kakaobridge/service/BridgeForegroundService.kt` 562-590라인 (fallback 로직)

---

## 6. 닉네임 변경 감지

### Iris 예제 구조 참고
- `db2.open_chat_member` 테이블에서 `nickname`, `user_id`, `involved_chat_id` 조회
- 이전 닉네임과 비교하여 변경 감지
- 변경 시 이력 저장 및 알림

### 현재 구현
- `server/db/chatLogger.js` 911-994라인: `checkNicknameChange()` 함수
- `user_name_history` 테이블에 이력 저장
- 변경 감지 시 알림 생성

### 개선 방안 (참고만, 구조 유지)
- 사용자 요청: Iris 코드를 똑같이 구현하지 말고 구조만 참고
- 현재 구현 유지하되, DB 조회 방식만 확인
- `db2.open_chat_member` 테이블 구조 확인 (클라이언트에서 조회 가능한지)

---

## 클라이언트 2개 연결 문제

### 원인
- Bridge APK와 Iris 클라이언트가 동시에 연결될 수 있음
- 서버 로그에서 "전체 WebSocket 클라이언트 수: 2" 확인됨

### 해결
- 이미 구현됨: `server/server.js`에서 `isBridge` 플래그로 구분
- Bridge APK 전송 시 Iris 클라이언트 제외

---

## 추가 확인 필요 사항

1. **답장 메시지 ID 추출**
   - 클라이언트에서 `reply_to_message_id` 전송 여부 확인
   - DB의 `referer` 필드 또는 `attachment.src_message` 확인

2. **반응 메시지 타입**
   - 실제 DB에서 반응 메시지의 type 값 확인
   - 사용자 제공 JavaScript 코드 참고

3. **닉네임 변경 감지 DB 조회**
   - `db2.open_chat_member` 테이블 접근 가능 여부 확인
   - 클라이언트에서 주기적으로 조회하여 변경 감지

