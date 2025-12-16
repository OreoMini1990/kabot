# 채팅 로그 데이터베이스 설정 가이드

## Supabase에서 테이블 생성

`server/db/chat_logs_schema.sql` 파일의 내용을 Supabase SQL Editor에서 실행하세요.

### 단계별 설정

1. Supabase 대시보드 접속
2. SQL Editor 열기
3. `chat_logs_schema.sql` 파일 내용 복사하여 실행
4. 테이블 생성 확인

## 테이블 구조

### chat_messages
- 채팅 메시지 저장
- 발신자, 메시지 내용, 시간 등 저장
- 통계 분석용 필드 포함 (단어 수, 문자 수, URL 포함 여부 등)

### chat_reactions
- 메시지 반응 저장 (따봉, 👍 등)
- 사용자 반응과 관리자 반응 구분
- 중복 반응 방지 (UNIQUE 제약)

### user_statistics
- 사용자별 일일 통계
- 메시지 수, 반응 수, 시간대별 통계 등

### message_keywords
- 키워드/주제 추출 (향후 확장용)

### user_activity
- 사용자 활동 추적 (향후 확장용)

## 반응 수집 방법

현재는 반응 수집 로직이 준비되어 있지만, 실제 반응 데이터는 카카오톡에서 제공하는 API나 이벤트를 통해 수집해야 합니다.

### 향후 구현 방안

1. **알림 기반 수집**: 메시지 반응 알림을 감지하여 저장
2. **주기적 조회**: 주기적으로 메시지 반응 상태를 조회
3. **수동 입력**: 관리자가 반응을 수동으로 입력할 수 있는 기능

## 사용 예시

```javascript
const chatLogger = require('./db/chatLogger');

// 메시지 저장
await chatLogger.saveChatMessage(roomName, senderName, senderId, messageText);

// 반응 저장
await chatLogger.saveReaction(messageId, 'thumbs_up', reactorName, reactorId, false);

// 통계 조회
const stats = await chatLogger.getUserChatStatistics(roomName, startDate, endDate);
```

