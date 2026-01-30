# 답장 메시지 저장 문제 요약

## DB 조회 결과

- 전체 메시지: 86개
- **답장 메시지: 0개** (reply_to_message_id 또는 reply_to_kakao_log_id가 있는 메시지 없음)

## 문제점

### 1. 클라이언트에서 답장 정보 추출 실패

**증상**:
- 클라이언트 로그에 `[서버 전송] ⚠️ 답장 정보 확인` 로그가 없음
- `[msg_type 확인]`, `[attachment 확인]`, `[referer 확인]` 로그가 없음
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그가 없음

**원인 추정**:
- `poll_messages()` 루프에서 `new_messages`가 비어있거나
- dict 변환 후 메시지 처리 루프가 실행되지 않음
- `is_reply_candidate()` 로직이 실행되지 않음

### 2. 서버에서 답장 정보 수신 실패

**증상**:
- 서버 로그: `reply_to_message_id=null`
- 서버 로그: `attachment=null`
- 서버 로그: `msg_type=0`
- 서버 로그: `isReplyMessage=false`

**원인**:
- 클라이언트에서 답장 정보를 전송하지 않음

## 해결 방안

### 1. 클라이언트 루프 진입 확인

**확인 사항**:
- `new_messages`가 비어있는지 확인
- dict 변환 후 메시지 처리 루프가 실행되는지 확인
- `is_reply_candidate()` 로직이 실행되는지 확인

**수정 필요**:
- `poll_messages()`에서 `new_messages`가 비어있을 때도 로그 출력
- `is_reply_candidate()` 로직 실행 전후 로그 추가
- `message_data`에 `reply_to_message_id` 포함 여부 확인 로그 추가

### 2. 서버 로그 강화

**추가할 로그**:
- 클라이언트에서 받은 `json.reply_to_message_id` 값
- `attachment` 존재 여부 및 타입
- `msg_type` 값
- `isReplyMessage` 판단 결과

## 다음 단계

1. 클라이언트 재시작 후 실제 답장 메시지 전송
2. 클라이언트 로그에서 `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 확인
3. 클라이언트 로그에서 `[서버 전송] ⚠️ 답장 정보 확인` 로그 확인
4. 서버 로그에서 `[답장 링크]` 로그 확인
5. DB에서 답장 메시지 저장 여부 확인

