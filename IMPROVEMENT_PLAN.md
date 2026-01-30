# 답장 및 반응 문제점 개선 계획

## 문제점 요약

### 1. 클라이언트에서 메시지 처리 루프가 실행되지 않음
- **증상**: `[msg_type 확인]`, `[attachment 확인]`, `[referer 확인]` 로그가 전혀 없음
- **원인**: `for msg in new_messages:` 루프가 실행되지 않거나, `is_mine` 필터링으로 모든 메시지가 스킵됨

### 2. DB 쿼리에서 attachment/referer 정보 미조회
- **증상**: 서버로 전송되는 메시지에 `attachment`, `referer` 정보가 없음
- **원인**: DB 컬럼 확인 로직은 있지만, 실제 쿼리 결과에 포함되지 않음

### 3. 반응 감지 로직 미작동
- **증상**: `[반응 업데이트]` 로그가 전혀 없음
- **원인**: `poll_reaction_updates()` 함수가 호출되지 않거나, 반응 데이터가 없음

## 개선 방향

### 1. 메시지 처리 루프 진입 로그 강화
- 루프 진입 시 `new_messages` 개수 및 내용 로그 출력
- 각 메시지 처리 시작 시 상세 로그 출력
- `is_mine` 필터링 로그 강화

### 2. DB 쿼리 결과 확인
- SELECT 컬럼 목록 로그 출력
- 쿼리 결과의 `msg` 배열 구조 확인
- `attachment`, `referer` 값 존재 여부 확인

### 3. 서버 전송 데이터 확인
- `message_data` 구성 시 로그 출력
- `attachment`, `referer` 정보 포함 여부 확인

### 4. 반응 감지 로직 점검
- `poll_reaction_updates()` 함수 호출 여부 확인
- 반응 감지 쿼리 결과 로그 출력

## 즉시 적용 가능한 개선 사항

### 1. 메시지 처리 루프 진입 로그 추가
```python
if new_messages:
    print(f"[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수={len(new_messages)}")
    for idx, msg in enumerate(new_messages):
        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작: msg_id={msg[0] if msg else 'N/A'}, msg 길이={len(msg) if msg else 0}")
```

### 2. is_mine 필터링 로그 강화
```python
if is_mine:
    print(f"[필터링] ⚠️ 자신이 보낸 메시지 스킵: ID={msg_id}, sender={user_id}, isMine={is_mine}")
    skipped_count += 1
    sent_message_ids.add(msg_id)
    continue
else:
    print(f"[필터링] ✅ 타인이 보낸 메시지 (isMine=False): ID={msg_id}, sender={user_id}")
```

### 3. DB 쿼리 결과 확인
```python
# get_new_messages() 함수 내부
print(f"[DB 쿼리] SELECT 컬럼: {columns_str}")
if messages:
    print(f"[DB 쿼리] 첫 메시지 구조: 길이={len(messages[0])}, 필드={[type(m).__name__ for m in messages[0][:12]]}")
```

### 4. 서버 전송 데이터 확인
```python
# send_to_server() 호출 전
print(f"[서버 전송] message_data 구조: {list(message_data.keys())}")
print(f"[서버 전송] attachment={message_data.get('attachment')}, referer={message_data.get('referer')}")
```
