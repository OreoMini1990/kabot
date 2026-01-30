# 로그 분석 결과 및 문제점

## 로그 분석 결과

### 클라이언트 로그 (client.log)
- ✅ `[get_new_messages] ✅ 1개 새 메시지 발견` - 메시지 조회는 정상
- ✅ `[poll_messages] ✅ 1개 메시지 처리 시작` - 메시지 처리 시작은 정상
- ❌ `[DB 쿼리] 컬럼명:` 로그 없음 - dict 변환 로그 미출력
- ❌ `[DB 쿼리] 첫 메시지 attachment:` 로그 없음
- ❌ `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음 - 루프 진입 로그 미출력
- ❌ `[메시지 처리] [1/1] 처리 시작` 로그 없음
- ❌ `[msg_type 확인]` 로그 없음
- ❌ `[attachment 확인]` 로그 없음
- ❌ `[referer 확인]` 로그 없음
- ❌ `[서버 전송] ⚠️ 답장 정보 확인` 로그 없음
- ❌ `[반응 업데이트] 호출 체크` 로그 없음

### 서버 로그 (server.log)
- `reply_to_message_id=null`
- `attachment=null`
- `attachment_decrypted=null`
- `msg_type=0`
- `isReplyMessage=false`
- 답장 메시지로 인식되지 않음

## 핵심 문제점

### 문제 1: get_new_messages()에서 dict 변환은 했지만, poll_messages()에서 여전히 인덱스 기반 접근

**증상**:
- `get_new_messages()`는 dict 리스트를 반환
- 하지만 `poll_messages()`에서 `queried_max_id = max(msg[0] for msg in messages)`로 인덱스 기반 접근
- `for msg in messages:` 루프에서 `msg_id = msg[0]`로 인덱스 기반 접근

**원인**:
- `get_new_messages()`는 dict로 변환하지만, `poll_messages()`에서는 여전히 튜플로 가정
- 두 함수 간 데이터 형식 불일치

**해결 방법**:
- `poll_messages()`에서도 dict 기반 접근으로 변경
- `queried_max_id = max(msg.get('_id') or msg.get('id') for msg in messages)`
- `msg_id = msg.get('_id') or msg.get('id')`

### 문제 2: 로그가 출력되지 않음

**증상**:
- `[DB 쿼리] 컬럼명:` 로그 없음
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음
- `[msg_type 확인]` 로그 없음

**원인 추정**:
1. `get_new_messages()`에서 dict 변환 후 로그가 출력되기 전에 예외 발생
2. `poll_messages()`에서 `messages`가 dict 리스트인데 튜플로 가정하여 예외 발생
3. 예외가 발생해도 조용히 처리되어 로그가 출력되지 않음

## 해결 방안

### 1. poll_messages()에서 dict 기반 접근으로 변경

```python
# 기존
queried_max_id = max(msg[0] for msg in messages)
for msg in messages:
    msg_id = msg[0]

# 변경
queried_max_id = max((msg.get('_id') or msg.get('id') or 0) for msg in messages if msg)
for msg in messages:
    msg_id = msg.get('_id') or msg.get('id')
```

### 2. 예외 처리 강화

```python
try:
    # dict 변환 및 로그 출력
    column_names = [description[0] for description in cursor.description]
    messages = []
    for row in raw_messages:
        msg_dict = dict(zip(column_names, row))
        messages.append(msg_dict)
    
    if len(messages) > 0:
        print(f"[DB 쿼리] 컬럼명: {column_names}")
        # ...
except Exception as e:
    print(f"[오류] dict 변환 실패: {e}")
    import traceback
    traceback.print_exc()
```

### 3. poll_messages()에서 messages 타입 확인

```python
if messages:
    # messages가 dict 리스트인지 확인
    if isinstance(messages[0], dict):
        queried_max_id = max((msg.get('_id') or msg.get('id') or 0) for msg in messages if msg)
    else:
        queried_max_id = max(msg[0] for msg in messages if msg)
```

