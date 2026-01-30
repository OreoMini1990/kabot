# 카카오톡 반응(Reaction) 로직 문서

## 개요
이 문서는 카카오톡 메시지의 반응(이모지 반응: 👍, ❤️, ✅ 등) 정보를 데이터베이스에서 추출하고 처리하는 로직을 설명합니다.

## 1. 데이터베이스 구조

### 테이블: `chat_logs`
카카오톡 메시지가 저장되는 메인 테이블입니다.

### 반응 정보가 저장되는 필드

#### 1.1 `v` 필드 (JSON 문자열)
- **위치**: `chat_logs.v`
- **형식**: JSON 문자열
- **주요 데이터**:
  ```json
  {
    "defaultEmoticonsCount": 3,  // 반응 개수 (중요!)
    "isMine": false,             // 자신이 보낸 메시지 여부
    "enc": 31                    // 암호화 타입
  }
  ```
- **용도**: 반응 개수를 확인하는 주요 필드
- **예시 쿼리**:
  ```sql
  SELECT _id, v FROM chat_logs WHERE v LIKE '%defaultEmoticonsCount%';
  ```

#### 1.2 `supplement` 필드 (JSON 문자열)
- **위치**: `chat_logs.supplement`
- **형식**: JSON 문자열
- **주요 데이터**:
  ```json
  {
    "reactions": [  // 또는 "emoticons"
      {
        "userId": 1234567890,
        "user_id": 1234567890,
        "type": "1",           // 반응 타입 (0=❤️, 1=👍, 2=✅, 3=😱, 4=😢)
        "emoType": "1",
        "reaction": "thumbs_up"
      },
      {
        "userId": 9876543210,
        "type": "0",
        "emoType": "0"
      }
    ]
  }
  ```
- **용도**: 반응 상세 정보 (누가 어떤 반응을 했는지)
- **예시 쿼리**:
  ```sql
  SELECT _id, supplement FROM chat_logs WHERE supplement LIKE '%reactions%';
  ```

#### 1.3 `type` 필드 (정수)
- **위치**: `chat_logs.type`
- **형식**: 정수
- **반응 관련 타입**:
  - `12`: Feed 타입 (시스템 메시지, 반응 포함 가능)
  - `70-79`: 반응 전용 메시지 타입
- **용도**: 반응 메시지 자체를 감지

#### 1.4 `attachment` 필드 (JSON 문자열 또는 암호화된 문자열)
- **위치**: `chat_logs.attachment`
- **형식**: JSON 문자열 또는 Base64 암호화 문자열
- **반응 관련 데이터**:
  ```json
  {
    "reaction": "thumbs_up",
    "like": "1",
    "emoType": "1",
    "message_id": 12345,        // 반응 대상 메시지 ID
    "target_id": 12345,
    "logId": 12345
  }
  ```
- **용도**: 반응 메시지의 상세 정보 (반응 타입, 대상 메시지 ID)

## 2. 반응 정보 추출 로직

### 2.1 반응 개수 확인 (`v` 필드)
```python
# v 필드를 JSON으로 파싱
v_json = json.loads(v_field)

# 반응 개수 추출
reaction_count = v_json.get("defaultEmoticonsCount", 0)

# 반응이 있는 경우
if reaction_count > 0:
    # 반응 처리 로직 실행
```

### 2.2 반응 상세 정보 추출 (`supplement` 필드)
```python
# supplement 필드를 JSON으로 파싱
supplement_json = json.loads(supplement)

# 반응 배열 추출 (필드명이 다를 수 있음)
reactions = supplement_json.get("reactions") or supplement_json.get("emoticons") or []

# 각 반응 정보 추출
for reaction_detail in reactions:
    reactor_id = reaction_detail.get("userId") or reaction_detail.get("user_id")
    reaction_type = reaction_detail.get("type") or reaction_detail.get("emoType")
```

### 2.3 반응 타입 매핑
```python
emoji_map = {
    "0": "heart",      # ❤️
    "1": "thumbs_up",  # 👍
    "2": "check",      # ✅
    "3": "surprised",  # 😱
    "4": "sad"         # 😢
}
```

## 3. 반응 감지 방법

### 방법 1: `v.defaultEmoticonsCount` 확인
- **위치**: `chat_logs.v` 필드
- **조건**: `defaultEmoticonsCount > 0`
- **장점**: 가장 정확하고 빠름
- **단점**: 반응 상세 정보는 없음

### 방법 2: `supplement.reactions` 확인
- **위치**: `chat_logs.supplement` 필드
- **조건**: `reactions` 배열이 있고 길이 > 0
- **장점**: 반응 상세 정보 (누가, 어떤 반응) 포함
- **단점**: 필드명이 다를 수 있음 (`reactions` 또는 `emoticons`)

### 방법 3: `type` 필드 확인
- **위치**: `chat_logs.type` 필드
- **조건**: `type IN (12, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79)`
- **장점**: 반응 전용 메시지 감지
- **단점**: Feed 타입(12)은 반응 외에도 다른 용도로 사용됨

### 방법 4: `attachment` 필드 확인
- **위치**: `chat_logs.attachment` 필드
- **조건**: `attachment`에 반응 관련 키 존재 (`reaction`, `like`, `emoType` 등)
- **장점**: 반응 대상 메시지 ID 확인 가능
- **단점**: 암호화되어 있을 수 있어 복호화 필요

## 4. 반응 업데이트 감지 로직

### 4.1 캐시 기반 비교
```python
# 이전 반응 개수와 현재 반응 개수 비교
previous_count = cache.get(msg_id, {}).get('count', 0)
current_count = v_json.get("defaultEmoticonsCount", 0)

# 반응 개수가 증가했으면 새 반응 감지
if current_count > previous_count:
    # 새 반응 처리
```

### 4.2 새 반응 추출
```python
# 이전 supplement와 현재 supplement 비교
previous_reactions = cache.get(msg_id, {}).get('supplement', {}).get('reactions', [])
current_reactions = supplement_json.get("reactions", [])

# 이전에 없던 반응만 추출
new_reactions = []
for react in current_reactions:
    react_key = f"{react['userId']}:{react['type']}"
    if react_key not in previous_reaction_ids:
        new_reactions.append(react)
```

## 5. 데이터베이스 쿼리 예시

### 5.1 반응이 있는 메시지 조회
```sql
SELECT 
    _id,
    chat_id,
    user_id,
    v,
    supplement,
    created_at
FROM chat_logs
WHERE v LIKE '%defaultEmoticonsCount%'
  AND json_extract(v, '$.defaultEmoticonsCount') > 0
ORDER BY _id DESC
LIMIT 100;
```

### 5.2 특정 메시지의 반응 상세 정보 조회
```sql
SELECT 
    _id,
    json_extract(v, '$.defaultEmoticonsCount') as reaction_count,
    json_extract(supplement, '$.reactions') as reactions
FROM chat_logs
WHERE _id = 12345;
```

### 5.3 반응 메시지 타입 조회
```sql
SELECT 
    _id,
    type,
    attachment
FROM chat_logs
WHERE type IN (12, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79)
ORDER BY _id DESC
LIMIT 100;
```

## 6. 서버로 전송하는 데이터 형식

### 6.1 반응 업데이트 (`type: "reaction_update"`)
```json
{
  "type": "reaction_update",
  "room": "채팅방이름",
  "sender": "반응자이름/user_id",
  "json": {
    "target_message_id": 12345,      // 반응 대상 메시지 ID (kakao_log_id)
    "reaction_type": "thumbs_up",     // 반응 타입
    "message_id": 12345,              // 메시지 ID
    "chat_id": 67890,                 // 채팅방 ID
    "user_id": 11111,                 // 반응자 user_id
    "created_at": 1234567890,         // 생성 시간
    "reaction_count": 3,              // 전체 반응 개수
    "supplement": "..."                // supplement 원본
  }
}
```

### 6.2 반응 메시지 (`type: "reaction"`)
```json
{
  "type": "reaction",
  "room": "채팅방이름",
  "sender": "반응자이름/user_id",
  "json": {
    "target_message_id": 12345,       // 반응 대상 메시지 ID
    "reaction_type": "thumbs_up",     // 반응 타입
    "message_id": 12345,              // 반응 메시지 자체의 ID
    "chat_id": 67890,
    "user_id": 11111,
    "created_at": 1234567890,
    "msg_type": 71,                   // 메시지 타입
    "attachment": "...",               // attachment 원본
    "attachment_decrypted": {...}     // 복호화된 attachment
  }
}
```

## 7. 주요 함수 및 로직

### 7.1 `poll_reaction_updates()`
- **목적**: 이미 저장된 메시지의 반응 정보를 주기적으로 확인
- **주기**: 10초마다 실행
- **쿼리**: 최근 24시간 내 메시지 조회
- **로직**:
  1. `chat_logs` 테이블에서 `v`, `supplement` 필드 조회
  2. `v.defaultEmoticonsCount` 확인
  3. 이전 캐시와 비교하여 새 반응 감지
  4. `supplement.reactions`에서 새 반응 추출
  5. 서버로 전송

### 7.2 `poll_messages()` 내 반응 처리
- **목적**: 새 메시지 처리 중 반응 정보도 함께 처리
- **로직**:
  1. 메시지 조회 시 `v`, `supplement` 필드도 함께 조회
  2. `v.defaultEmoticonsCount > 0`이면 반응 처리
  3. `supplement.reactions`에서 반응 상세 정보 추출
  4. 각 반응별로 서버에 전송

## 8. 질문 가능한 항목

### 8.1 데이터베이스 관련
1. `chat_logs` 테이블의 `v` 필드에서 `defaultEmoticonsCount`가 항상 정확한가?
2. `supplement` 필드의 구조가 카카오톡 버전에 따라 달라지는가?
3. 반응 정보가 실시간으로 업데이트되는가, 아니면 지연이 있는가?

### 8.2 로직 관련
1. 반응 개수(`defaultEmoticonsCount`)와 실제 반응 상세 정보(`supplement.reactions`)의 개수가 일치하는가?
2. 반응이 삭제되면 `defaultEmoticonsCount`가 감소하는가?
3. 같은 사용자가 같은 메시지에 여러 반응을 할 수 있는가?

### 8.3 성능 관련
1. 반응이 많은 메시지(수백 개)에서 `supplement` 필드 크기는?
2. 반응 업데이트 확인 주기(10초)가 적절한가?
3. 캐시 크기 제한이 필요한가?

## 9. 참고 사항

### 9.1 필드명 변형
- `reactions` 또는 `emoticons`: 반응 배열 필드명
- `userId` 또는 `user_id`: 반응자 ID 필드명
- `type` 또는 `emoType` 또는 `reaction`: 반응 타입 필드명

### 9.2 암호화
- `attachment` 필드는 암호화되어 있을 수 있음
- 복호화가 필요한 경우 `MY_USER_ID`와 `encType` 필요

### 9.3 타임스탬프
- `created_at`은 초 단위 또는 밀리초 단위일 수 있음
- 쿼리 시 두 가지 경우 모두 고려 필요

## 10. 샘플 코드

### 10.1 반응 개수 확인
```python
import sqlite3
import json

conn = sqlite3.connect("/data/data/com.kakao.talk/databases/KakaoTalk.db")
cursor = conn.cursor()

# 반응이 있는 메시지 조회
cursor.execute("""
    SELECT _id, v, supplement
    FROM chat_logs
    WHERE v IS NOT NULL
    LIMIT 10
""")

for row in cursor.fetchall():
    msg_id, v_field, supplement = row
    
    # v 필드 파싱
    if v_field:
        v_json = json.loads(v_field)
        reaction_count = v_json.get("defaultEmoticonsCount", 0)
        
        if reaction_count > 0:
            print(f"메시지 ID {msg_id}: 반응 {reaction_count}개")
            
            # supplement에서 상세 정보 추출
            if supplement:
                supp_json = json.loads(supplement)
                reactions = supp_json.get("reactions", [])
                print(f"  반응 상세: {len(reactions)}개")
                for react in reactions:
                    print(f"    - 사용자: {react.get('userId')}, 타입: {react.get('type')}")

conn.close()
```

### 10.2 반응 업데이트 감지
```python
# 이전 반응 개수 저장
reaction_cache = {}

def check_reaction_update(msg_id, v_field, supplement):
    # 현재 반응 개수 확인
    v_json = json.loads(v_field)
    current_count = v_json.get("defaultEmoticonsCount", 0)
    
    # 이전 반응 개수 확인
    previous_count = reaction_cache.get(msg_id, {}).get('count', 0)
    
    # 반응 개수 증가 감지
    if current_count > previous_count:
        # 새 반응 추출
        new_reactions = []
        if supplement:
            supp_json = json.loads(supplement)
            current_reactions = supp_json.get("reactions", [])
            
            # 이전 반응과 비교
            previous_reactions = reaction_cache.get(msg_id, {}).get('reactions', [])
            previous_ids = {f"{r['userId']}:{r['type']}" for r in previous_reactions}
            
            for react in current_reactions:
                react_key = f"{react['userId']}:{react['type']}"
                if react_key not in previous_ids:
                    new_reactions.append(react)
        
        # 캐시 업데이트
        reaction_cache[msg_id] = {
            'count': current_count,
            'reactions': current_reactions
        }
        
        return new_reactions
    
    return []
```

