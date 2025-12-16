# 채팅 로그 데이터베이스 설정 가이드

## Supabase에서 테이블 생성

### 단계별 설정

1. Supabase 대시보드 접속
2. SQL Editor 열기
3. 다음 순서로 SQL 파일 실행:
   - `chat_logs_schema.sql` - 테이블, 제약조건, 인덱스, 트리거 생성
   - `chat_logs_aggregation.sql` - 통계 집계 함수 생성 (선택사항)
   - `chat_logs_search.sql` - 검색 함수 생성 (선택사항)
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

## 주요 기능

### 1. room_user_key 해시 컬럼
- `sender_id`가 없어도 안정적으로 사용자 식별
- `MD5(room_name|sender_name|sender_id)` 형식으로 자동 생성
- GENERATED 컬럼이므로 자동 관리

### 2. FTS (Full Text Search)
- 한국어 텍스트 검색 지원
- `message_text_tsvector` 컬럼에 자동 생성
- GIN 인덱스로 빠른 검색 성능

### 3. 자동 통계 집계
- `aggregate_user_statistics()`: 특정 날짜 통계 집계
- `aggregate_user_statistics_range()`: 기간별 통계 집계
- `aggregate_yesterday_statistics()`: 어제 통계 자동 집계 (스케줄 작업용)

### 4. 검색 함수
- `search_messages()`: 키워드로 메시지 검색
- `count_messages_by_keyword()`: 키워드별 메시지 개수 조회

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

