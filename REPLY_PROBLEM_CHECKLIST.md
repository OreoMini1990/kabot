# 답장 메시지 저장 문제 체크리스트

## 현재 상태

- ✅ `server/server.js`: `saveChatMessage` 호출 정상
- ✅ `server/server.js`: `replyToKakaoLogId` 추출 로직 정상
- ✅ `client/a.py`: 답장 정보 추출 로직 정상
- ❌ **DB에 답장 메시지 저장 안됨** (0개)

## 확인 사항

### 1. 클라이언트 로그 확인

다음 로그가 출력되는지 확인:
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수=X`
- `[msg_type 확인] msg_id=X, msg_type=Y`
- `[attachment 확인] msg_id=X, attachment 존재=Y`
- `[referer 확인] msg_id=X, referer=Y`
- `[답장 ID 추출 시작] msg_id=X`
- `[답장 ID] ✅ 최종 추출 성공: msg_id=X, reply_to_message_id=Y`
- `[서버 전송] ⚠️ 답장 정보 확인: reply_to_message_id=Y`

### 2. 서버 로그 확인

다음 로그가 출력되는지 확인:
- `[답장 링크] 클라이언트에서 받은 값: reply_to_message_id=X`
- `[답장 링크] ⚠️ 답장 메시지 감지: msg_type=X`
- `[답장 링크] ✅ attachment에서 추출: X`
- `[답장 링크] 최종 reply_to_kakao_log_id: X`
- `[채팅 로그] ✅ reply_to_kakao_log_id 저장: X`

### 3. DB 확인

다음 쿼리로 확인:
```sql
SELECT COUNT(*) FROM chat_messages WHERE reply_to_message_id IS NOT NULL OR reply_to_kakao_log_id IS NOT NULL;
```

## 문제 해결 단계

1. **클라이언트 재시작**
2. **실제 답장 메시지 전송** (카카오톡에서 답장 버튼 클릭 후 메시지 전송)
3. **클라이언트 로그 확인** (`client.log`)
4. **서버 로그 확인** (`server.log`)
5. **DB 확인** (`node server/db/check_reply_detailed.js`)

## 예상 문제 시나리오

### 시나리오 1: 클라이언트 루프 미진입
- **증상**: `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음
- **원인**: `new_messages`가 비어있음
- **해결**: `get_new_messages()` 반환값 확인, dict 변환 로직 확인

### 시나리오 2: 답장 정보 추출 실패
- **증상**: `[답장 ID] ❌ 최종 추출 실패` 로그 출력
- **원인**: `referer`, `attachment`에서 답장 정보 추출 실패
- **해결**: DB에서 실제 `referer`, `attachment` 값 확인

### 시나리오 3: 서버 수신 실패
- **증상**: 클라이언트는 전송했지만 서버 로그에 `reply_to_message_id=null`
- **원인**: `send_to_server()`에서 `reply_to_message_id` 필드 누락
- **해결**: `message_data`에 `reply_to_message_id` 포함 여부 확인

### 시나리오 4: 서버 추출 실패
- **증상**: 서버 로그에 `[답장 링크] 최종 reply_to_kakao_log_id: null`
- **원인**: `extractReplyTarget()`에서 추출 실패
- **해결**: `attachment` 복호화 및 파싱 로직 확인

