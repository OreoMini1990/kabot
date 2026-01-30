# 답장 및 반응 저장 문제점 - 개발자 질문용

## 문제 상황

카카오톡 봇에서 **답장 메시지**와 **반응(reaction)** 정보가 DB에 저장되지 않는 문제가 발생했습니다.

### 현재 상태
- **답장 메시지**: 0개 저장됨 (reply_to_kakao_log_id가 있는 메시지 없음)
- **반응**: 0개 저장됨 (chat_reactions 테이블 비어있음)
- **전체 메시지**: 82개 (일반 메시지는 정상 저장됨)

## 코드 구조

### 클라이언트 (Python) - `client/a.py`

#### 1. 메시지 조회 및 처리 흐름

```python
# poll_messages() 함수 내부
messages = get_new_messages()  # DB에서 새 메시지 조회

# 중복 필터링
new_messages = []
for msg in messages:
    if msg_id not in sent_message_ids:
        new_messages.append(msg)

# 메시지 처리 루프
if new_messages:
    print(f"[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수={len(new_messages)}")
    
    for idx, msg in enumerate(new_messages):
        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작")
        
        # 메시지 필드 추출
        msg_id = msg[0]      # _id
        chat_id = msg[1]     # chat_id
        user_id = msg[2]     # user_id
        message = msg[3]      # message
        created_at = msg[4]   # created_at
        v_field = msg[5]      # v (암호화 정보)
        # ...
        msg_type = msg[8]    # type (메시지 타입)
        attachment = msg[9]   # attachment (답장 정보 포함 가능)
        referer = msg[10]     # referer (답장 메시지 ID)
```

#### 2. DB 쿼리 - `get_new_messages()` 함수

```python
# 동적으로 컬럼 확인 후 SELECT
select_columns = ["_id", "chat_id", "user_id", "message", "created_at", "v", "userId", "encType", "type"]

# attachment, referer 컬럼이 있으면 추가
if "attachment" in available_columns:
    select_columns.append("attachment")
if "referer" in available_columns:
    select_columns.append("referer")

columns_str = ", ".join(select_columns)
query = f"""
    SELECT {columns_str}
    FROM chat_logs
    WHERE _id > ?
    ORDER BY _id ASC
    LIMIT 10
"""
```

#### 3. 답장 메시지 ID 추출 로직

```python
# referer 필드에서 추출 (1순위)
if referer:
    reply_to_message_id = referer

# attachment에서 추출 (2순위)
if attachment_decrypted:
    if isinstance(attachment_decrypted, dict):
        src_message = attachment_decrypted.get('src_message') or \
                     attachment_decrypted.get('logId') or \
                     attachment_decrypted.get('src_logId')
        if src_message:
            reply_to_message_id = src_message

# message_data 구성
message_data = {
    "_id": msg_id,
    "chat_id": chat_id,
    "user_id": valid_user_id,
    "message": message,
    "reply_to_message_id": reply_to_message_id,  # 답장 메시지 ID
    "msg_type": msg_type,
    "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,
    "attachment_decrypted": attachment_decrypted,
    # ...
}

# 서버로 전송
send_to_server(message_data)
```

#### 4. 반응 감지 로직 - `poll_reaction_updates()` 함수

```python
def poll_reaction_updates():
    """이미 저장된 메시지의 반응 정보 주기적 확인"""
    query = """
        SELECT _id, chat_id, user_id, v, supplement, created_at
        FROM chat_logs
        WHERE created_at > ?
        ORDER BY _id DESC
        LIMIT 100
    """
    # v 필드에서 defaultEmoticonsCount 확인
    # supplement 필드에서 반응 상세 정보 추출
    # 서버로 reaction_update 전송
```

### 서버 (Node.js) - `server/server.js`

#### 1. 답장 메시지 감지 로직

```javascript
// attachment에서 reply_to_kakao_log_id 추출
const msgTypeForCheck = json?.msg_type || json?.type || json?.msgType || null;
const hasAttachment = !!(json?.attachment || json?.attachment_decrypted);
const hasReferer = !!(replyToKakaoLogIdRaw);
const isReplyMessage = msgTypeForCheck === 26 || msgTypeForCheck === '26' || hasAttachment || hasReferer;

if (isReplyMessage) {
    // attachment 복호화 및 추출
    let attachmentToUse = json?.attachment_decrypted || json?.attachment;
    replyToKakaoLogIdFromAttachment = extractReplyTarget(attachmentToUse, null, msgTypeForCheck);
}

// 최종 reply_to_kakao_log_id
const replyToKakaoLogId = (isReplyMessage && replyToKakaoLogIdFromAttachment)
    ? replyToKakaoLogIdFromAttachment
    : (replyToKakaoLogIdRaw || replyToKakaoLogIdFromAttachment);
```

#### 2. 반응 처리 로직

```javascript
if (messageData.type === 'reaction_update') {
    const newReactions = json?.new_reactions || [];
    const allReactions = json?.all_reactions || [];
    
    // DB에서 실제 message id 찾기
    const actualMessageId = await findMessageIdByKakaoLogId(targetMessageId);
    
    // 각 반응 저장
    for (const reactionDetail of reactionsToProcess) {
        await chatLogger.saveReaction(
            actualMessageId,
            reactionType,
            reactorName,
            reactorId
        );
    }
}
```

## 문제점 분석

### 문제 1: 클라이언트에서 메시지 처리 루프가 실행되지 않음

**증상**:
- 로그에 `[poll_messages] ✅ 1개 메시지 처리 시작`는 있음
- 로그에 `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개`도 있음
- 하지만 `for msg in new_messages:` 루프 내부의 로그는 전혀 없음

**의심되는 코드 부분**:
```python
if new_messages:
    print(f"[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수={len(new_messages)}")
    # 이 로그가 출력되지 않음
    
    for idx, msg in enumerate(new_messages):
        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작")
        # 이 로그도 출력되지 않음
```

**질문**:
1. `new_messages` 리스트가 실제로 비어있는가? (로그에는 1개라고 나오는데)
2. 루프 진입 전에 예외가 발생하는가?
3. `is_mine` 필터링으로 모든 메시지가 스킵되는가?

### 문제 2: DB 쿼리에서 attachment/referer 정보 미조회

**증상**:
- 서버로 전송되는 메시지에 `attachment`, `referer` 정보가 없음
- 클라이언트에서 `msg[9]`, `msg[10]` 접근 시도하지만 값이 NULL

**의심되는 코드 부분**:
```python
# get_new_messages() 함수
select_columns = ["_id", "chat_id", "user_id", "message", "created_at", "v", "userId", "encType", "type"]

# attachment, referer 컬럼이 있으면 추가
if "attachment" in available_columns:
    select_columns.append("attachment")
if "referer" in available_columns:
    select_columns.append("referer")

# 하지만 실제 쿼리 결과에서 msg[9], msg[10]이 NULL
```

**질문**:
1. `available_columns`에 `attachment`, `referer`가 포함되어 있는가?
2. DB에 실제로 `attachment`, `referer` 값이 저장되어 있는가?
3. SELECT 쿼리에 해당 컬럼이 포함되어 있는가?

### 문제 3: 답장 메시지 정보가 서버로 전송되지 않음

**증상**:
- 클라이언트에서 `msg[9]` (attachment), `msg[10]` (referer) 추출 시도
- 하지만 서버로 전송 시 해당 정보가 포함되지 않음

**의심되는 코드 부분**:
```python
# message_data 구성
message_data = {
    "reply_to_message_id": reply_to_message_id,  # 이 값이 None일 수 있음
    "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,
    "attachment_decrypted": attachment_decrypted,
}

# 서버로 전송
send_to_server(message_data)
```

**질문**:
1. `reply_to_message_id`가 실제로 추출되는가?
2. `attachment`, `attachment_decrypted`가 `message_data`에 포함되는가?
3. `send_to_server()` 함수에서 해당 필드가 제거되는가?

### 문제 4: 반응 감지 로직 미작동

**증상**:
- `[반응 업데이트]` 로그가 전혀 없음
- `poll_reaction_updates()` 함수가 호출되지 않음

**의심되는 코드 부분**:
```python
# 주기적으로 반응 업데이트 확인 (10초마다)
REACTION_CHECK_INTERVAL = 10
last_reaction_check = time.time()

while True:
    current_time = time.time()
    time_since_last_check = current_time - last_reaction_check
    if time_since_last_check >= REACTION_CHECK_INTERVAL:
        print(f"[반응 업데이트] 주기적 확인 시작")
        updated_count = poll_reaction_updates()  # 이 함수가 호출되지 않음
        last_reaction_check = current_time
```

**질문**:
1. `REACTION_CHECK_INTERVAL` 조건이 만족되는가?
2. `poll_reaction_updates()` 함수 내부에서 예외가 발생하는가?
3. 반응 데이터가 DB에 실제로 있는가?

### 문제 5: 서버에서 답장 메시지로 인식하지 못함

**증상**:
- 서버 로그에서 `msg_type: 0`, `attachment: null`, `isReplyMessage=false`
- 답장 메시지로 인식되지 않음

**의심되는 코드 부분**:
```javascript
// 서버에서 답장 메시지 감지
const hasAttachment = !!(json?.attachment || json?.attachment_decrypted);
const hasReferer = !!(replyToKakaoLogIdRaw);
const isReplyMessage = msgTypeForCheck === 26 || msgTypeForCheck === '26' || hasAttachment || hasReferer;

// 하지만 hasAttachment와 hasReferer가 모두 false
```

**질문**:
1. 클라이언트에서 전송한 `message_data`에 `attachment`, `referer`가 포함되어 있는가?
2. 서버에서 `json.attachment`, `json.attachment_decrypted`가 null인 이유는?
3. `replyToKakaoLogIdRaw`가 null인 이유는?

## 확인이 필요한 핵심 질문

### 클라이언트 측
1. **메시지 처리 루프가 실행되는가?**
   - `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그가 출력되는가?
   - `new_messages` 리스트의 실제 내용은?

2. **DB에서 attachment/referer 정보가 조회되는가?**
   - `[DB 쿼리] 첫 메시지 attachment (msg[9])` 로그에서 값이 있는가?
   - `[DB 쿼리] 첫 메시지 referer (msg[10])` 로그에서 값이 있는가?
   - DB에 실제로 `attachment`, `referer` 값이 저장되어 있는가?

3. **답장 정보가 추출되는가?**
   - `reply_to_message_id`가 실제로 추출되는가?
   - `attachment_decrypted`가 복호화되는가?

4. **서버로 답장 정보가 전송되는가?**
   - `[서버 전송] attachment=` 로그에서 값이 있는가?
   - `[서버 전송] reply_to_message_id=` 로그에서 값이 있는가?

### 서버 측
1. **답장 메시지로 인식되는가?**
   - `isReplyMessage`가 true가 되는가?
   - `hasAttachment`, `hasReferer`가 true가 되는가?

2. **반응이 저장되는가?**
   - `reaction_update` 메시지가 수신되는가?
   - `saveReaction` 함수가 호출되는가?

## 로그 확인 방법

### 클라이언트 로그에서 확인할 항목
```
[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수=?
[메시지 처리] [1/?] 처리 시작: msg_id=?, msg 길이=?
[DB 쿼리] 첫 메시지 attachment (msg[9]): ?
[DB 쿼리] 첫 메시지 referer (msg[10]): ?
[서버 전송] attachment=?
[서버 전송] reply_to_message_id=?
[반응 업데이트] 주기적 확인 시작
```

### 서버 로그에서 확인할 항목
```
[답장 링크] ⚠️ 답장 메시지 감지: replyToKakaoLogId=?
[답장 링크] 상세: msg_type=?, hasAttachment=?, hasReferer=?
[반응 업데이트] [1-1] 진입 확인: newReactions.length=?
```

## 요청 사항

다음 사항들을 확인해주시면 문제 해결에 도움이 됩니다:

1. **클라이언트 로그 확인**: 위의 로그 항목들이 출력되는지 확인
2. **DB 직접 확인**: `chat_logs` 테이블에서 `attachment`, `referer` 컬럼 값 확인
3. **실제 테스트**: 답장 메시지를 보내고 로그 확인
4. **코드 리뷰**: 위의 의심되는 코드 부분에서 문제가 있는지 확인

