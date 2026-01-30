# 답장 및 반응 저장 개선 사항

## 문제점 분석

### 1. 답장 메시지가 저장되지 않음
- **원인**: `msg_type=0`으로 전송되어 답장으로 인식되지 않음
- **증상**: `reply_to_message_id=null`, `attachment=null`

### 2. 반응이 저장되지 않음
- **원인**: 클라이언트가 반응을 감지하지 못하거나 서버로 전송하지 않음
- **증상**: `chat_reactions` 테이블이 비어있음

## 개선 사항

### 1. 서버: 답장 메시지 감지 로직 강화

**위치**: `server/server.js`

**변경 사항**:
- `msg_type=0`이어도 `attachment`나 `referer`가 있으면 답장으로 처리
- `attachment` 복호화 로직 강화 (msg_type=0이어도 시도)
- 답장 메시지 감지 로그 강화

**코드 변경**:
```javascript
// ⚠️ 개선: msg_type=0이어도 attachment나 referer가 있으면 답장으로 처리
const hasAttachment = !!(json?.attachment || json?.attachment_decrypted);
const hasReferer = !!(replyToKakaoLogIdRaw);
const isReplyMessage = msgTypeForCheck === 26 || msgTypeForCheck === '26' || hasAttachment || hasReferer;

if (isReplyMessage) {
    // attachment 복호화 시도
    // ...
}
```

### 2. 클라이언트: attachment 복호화 로직 강화

**위치**: `client/a.py`

**변경 사항**:
- `msg_type=0`이어도 `attachment`가 있으면 복호화 시도
- whitelist에 없어도 `attachment`가 있으면 복호화 시도

**코드 변경**:
```python
# ⚠️ 개선: whitelist에 없어도 attachment가 있으면 복호화 시도
should_decrypt = (
    msg_type_str_for_decrypt in ATTACHMENT_DECRYPT_WHITELIST or 
    msg_type in ATTACHMENT_DECRYPT_WHITELIST or
    (attachment and isinstance(attachment, str) and len(attachment) > 10)
)
```

### 3. 클라이언트: 답장 메시지 감지 로직 강화

**위치**: `client/a.py`

**변경 사항**:
- `msg_type=0`이어도 `referer`나 `attachment`가 있으면 답장 후보로 처리

**코드 변경**:
```python
# ⚠️ 개선: msg_type=0이어도 referer나 attachment가 있으면 답장 후보로 처리
if not is_reply_candidate and (referer or attachment or attachment_decrypted):
    is_reply_candidate = True
    reply_reasons.append(f"msg_type=0이지만 referer/attachment 존재")
```

## 변경 파일

### [수정] server/server.js
- 답장 메시지 감지 로직 강화 (msg_type=0이어도 처리)
- attachment 복호화 로직 강화
- 답장 메시지 감지 로그 강화

### [수정] client/a.py
- attachment 복호화 로직 강화 (whitelist 없어도 시도)
- 답장 메시지 감지 로직 강화 (msg_type=0이어도 처리)

## 예상 결과

1. **답장 메시지 저장**:
   - `msg_type=0`이어도 `attachment`나 `referer`가 있으면 답장으로 인식
   - `reply_to_kakao_log_id` 저장 성공

2. **반응 저장**:
   - 클라이언트에서 반응 감지 및 전송
   - 서버에서 반응 저장 성공

## 다음 단계

1. 실제 답장 메시지를 보내서 테스트
2. 실제 반응을 추가해서 테스트
3. 클라이언트 및 서버 로그 확인
4. DB에서 저장 여부 확인
