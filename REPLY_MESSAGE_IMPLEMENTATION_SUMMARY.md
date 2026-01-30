# 답장 메시지 원문 내용 저장 구현 요약

## 현재 상태

### ✅ 구현 완료
답장 메시지 저장 시 원문 내용을 자동으로 조회하여 `metadata`에 저장하도록 구현되었습니다.

### 현재 구조
- **컬럼**: `reply_to_message_id`, `reply_to_kakao_log_id`로 원문 메시지 참조
- **저장 위치**: `metadata.reply_to_message_text`, `metadata.reply_to_sender_name`
- **조회 방식**: 
  1. `reply_to_message_id`로 조회 (DB id)
  2. 실패 시 `reply_to_kakao_log_id`로 조회 (kakao_log_id)

## 구현 내용

### 답장 메시지 저장 시
1. `reply_to_message_id` 또는 `reply_to_kakao_log_id`가 있으면 원문 메시지 조회
2. 원문 메시지의 `message_text`와 `sender_name` 추출
3. `metadata.reply_to_message_text`와 `metadata.reply_to_sender_name`에 저장

### 장점
- 원문 메시지가 삭제되어도 답장 메시지에서 원문 내용 확인 가능
- JOIN 쿼리 없이 답장 메시지만으로 원문 내용 확인 가능
- 레이스 조건(원문 메시지가 아직 저장되지 않은 경우)에도 대응 가능

### 단점
- `metadata` JSONB 필드에 저장되어 쿼리 성능이 전용 컬럼보다 낮을 수 있음
- 스키마에 명시적으로 표시되지 않음

## 사용 방법

### 답장 메시지 조회 시 원문 내용 확인
```javascript
const message = await db.supabase
    .from('chat_messages')
    .select('*')
    .eq('id', messageId)
    .single();

// 원문 내용 확인
const originalText = message.metadata?.reply_to_message_text;
const originalSender = message.metadata?.reply_to_sender_name;

if (originalText) {
    console.log(`답장 원문: ${originalText}`);
    console.log(`원문 발신자: ${originalSender}`);
}
```

## 향후 개선 방안

### 스키마 개선 (선택사항)
전용 컬럼 추가로 성능 및 명확성 향상:
```sql
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS reply_to_message_text TEXT,
ADD COLUMN IF NOT EXISTS reply_to_sender_name VARCHAR(255);
```

이 경우 `metadata` 대신 전용 컬럼에 저장하도록 코드 수정 필요.

## 테스트 필요 항목

1. 답장 메시지 저장 시 원문 내용이 metadata에 저장되는지 확인
2. 원문 메시지가 삭제된 경우에도 원문 내용 확인 가능한지 확인
3. 원문 메시지 조회 실패 시에도 답장 메시지 저장이 정상적으로 되는지 확인
4. `!신고` 명령어에서 원문 내용이 제대로 저장되는지 확인

