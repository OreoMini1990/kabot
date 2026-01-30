# 답장 및 반응 문제점 분석 보고서

## 로그 분석 결과

### 클라이언트 로그 (client (3).log)
- ✅ `[get_new_messages] ✅ 1개 새 메시지 발견` - 메시지 조회는 정상
- ✅ `[poll_messages] ✅ 1개 메시지 처리 시작` - 메시지 처리 시작은 정상
- ❌ `[msg_type 확인]` 로그 없음 - 메시지 처리 루프 내부 로그 미출력
- ❌ `[attachment 확인]` 로그 없음
- ❌ `[referer 확인]` 로그 없음
- ❌ `[반응 업데이트]` 로그 없음

**핵심 발견**: 메시지 처리 루프(`for msg in new_messages:`)가 실행되지 않았거나, 로그가 출력되기 전에 루프가 종료됨

### 서버 로그 (server (2).log)
- `msg_type: 0` (일반 메시지)
- `attachment: null`
- `attachment_decrypted: null`
- `isReplyMessage=false`
- 답장 메시지로 인식되지 않음

### DB 조회 결과
- **답장 메시지**: 0개
- **반응**: 0개
- 모든 메시지가 `reply_to_message_id: NULL`, `reply_to_kakao_log_id: NULL`

## 핵심 문제점

### 1. 클라이언트에서 메시지 처리 루프가 실행되지 않음

**증상**:
- `[poll_messages] ✅ 1개 메시지 처리 시작` 로그는 있음
- `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개` 로그도 있음
- 하지만 `for msg in new_messages:` 루프 내부의 로그는 전혀 없음

**원인 추정**:
1. `new_messages`가 비어있어서 루프가 실행되지 않음 (하지만 로그에는 1개라고 나옴)
2. 루프 진입 전에 예외 발생
3. `is_mine` 필터링으로 모든 메시지가 스킵됨

**코드 확인 필요**:
- `new_messages` 리스트의 실제 내용
- `is_mine` 필터링 로직의 실행 여부
- 예외 처리 로직

### 2. DB 쿼리에서 attachment/referer 컬럼 미조회

**증상**:
- 서버로 전송되는 메시지에 `attachment`, `referer` 정보가 없음
- 클라이언트에서 `msg[9]`, `msg[10]` 접근 시도하지만 값이 없음

**원인 추정**:
1. DB 쿼리에서 `attachment`, `referer` 컬럼을 SELECT하지 않음
2. `msg` 배열에 해당 정보가 포함되지 않음

**확인 필요**:
- `get_new_messages()` 함수의 SQL 쿼리
- SELECT 컬럼 목록에 `attachment`, `referer` 포함 여부

### 3. 반응 감지 로직 미작동

**증상**:
- `[반응 업데이트]` 로그가 전혀 없음
- `poll_reaction_updates()` 함수가 호출되지 않음

**원인 추정**:
1. `REACTION_CHECK_INTERVAL` 조건이 만족되지 않음
2. `poll_reaction_updates()` 함수 내부에서 예외 발생
3. 반응 데이터가 실제로 없음

## 개선 방향

### 1. 메시지 처리 루프 진입 로그 강화

**목적**: 루프가 실제로 실행되는지 확인

**개선 사항**:
```python
if new_messages:
    print(f"[메시지 처리] 루프 진입: new_messages 개수={len(new_messages)}")
    for idx, msg in enumerate(new_messages):
        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작: msg_id={msg[0] if msg else 'N/A'}, msg 길이={len(msg) if msg else 0}")
        # ... 기존 처리 로직
```

### 2. DB 쿼리 확인 및 강화

**목적**: `attachment`, `referer` 정보가 실제로 조회되는지 확인

**개선 사항**:
1. `get_new_messages()` 함수의 SQL 쿼리 확인
2. SELECT 컬럼에 `attachment`, `referer` 포함 확인
3. 쿼리 결과 로그 출력

### 3. is_mine 필터링 로직 확인

**목적**: 모든 메시지가 스킵되는지 확인

**개선 사항**:
```python
if is_mine:
    print(f"[필터링] ⚠️ 자신이 보낸 메시지 스킵: ID={msg_id}, sender={user_id}")
    skipped_count += 1
    sent_message_ids.add(msg_id)
    continue
else:
    print(f"[필터링] ✅ 타인이 보낸 메시지 (isMine=False): ID={msg_id}, sender={user_id}")
```

### 4. 반응 감지 로직 점검

**목적**: 반응이 실제로 감지되는지 확인

**개선 사항**:
1. `poll_reaction_updates()` 함수 호출 여부 확인
2. 반응 감지 쿼리 결과 로그 출력
3. 반응 데이터 전송 여부 확인

## 즉시 적용 가능한 개선 사항

### 1. 메시지 처리 루프 진입 로그 추가

```python
if new_messages:
    print(f"[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수={len(new_messages)}")
    max_id = 0
    sent_count = 0
    skipped_count = 0
    
    for idx, msg in enumerate(new_messages):
        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작: msg_id={msg[0] if msg else 'N/A'}")
        # ... 기존 처리 로직
```

### 2. DB 쿼리 확인

```python
# get_new_messages() 함수 내부
query = """
    SELECT _id, chat_id, user_id, message, created_at, v, userId, encType, type, attachment, referer, supplement
    FROM chat_logs
    WHERE _id > ?
    ORDER BY _id ASC
    LIMIT ?
"""
print(f"[DB 쿼리] SELECT 컬럼: _id, chat_id, user_id, message, created_at, v, userId, encType, type, attachment, referer, supplement")
```

### 3. is_mine 필터링 로그 강화

```python
if is_mine:
    print(f"[필터링] ⚠️ 자신이 보낸 메시지 스킵: ID={msg_id}, sender={user_id}, isMine={is_mine}")
    skipped_count += 1
    sent_message_ids.add(msg_id)
    continue
```

## 다음 단계

1. 메시지 처리 루프 진입 로그 추가
2. DB 쿼리 확인 및 강화
3. is_mine 필터링 로직 확인
4. 실제 답장 메시지를 보내서 로그 확인
5. 실제 반응을 추가해서 로그 확인

