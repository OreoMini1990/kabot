# 카카오톡 DB 반응 감지 구현 가이드

**생성 일시**: 2025-12-20  
**기반 문서**: `db_analysis_output/KAKAO_DB_STRUCTURE.md`

---

## 1. 개요

이 문서는 카카오톡 DB에서 반응(Reaction) 데이터를 감지하고 처리하는 방법을 설명합니다.

### 1.1 반응 데이터 위치

반응 정보는 `chat_logs` 테이블의 다음 필드에 저장됩니다:

- **`v` 필드**: 반응 개수 (`defaultEmoticonsCount`)
- **`supplement` 필드**: 반응 상세 정보 (`reactions` 배열)

### 1.2 반응 감지 방법

반응은 두 가지 방법으로 감지할 수 있습니다:

1. **`v` 필드의 `defaultEmoticonsCount` 확인**: 반응 개수 확인
2. **`supplement` 필드의 `reactions` 배열 확인**: 반응 상세 정보 확인

---

## 2. DB 구조

### 2.1 chat_logs 테이블 구조

```sql
CREATE TABLE chat_logs (
    _id INTEGER PRIMARY KEY,
    id INTEGER NOT NULL,
    type INTEGER,
    chat_id INTEGER NOT NULL,
    thread_id INTEGER,
    scope INTEGER,
    user_id INTEGER,
    message TEXT,
    attachment TEXT,
    created_at INTEGER,
    deleted_at INTEGER,
    client_message_id INTEGER,
    prev_id INTEGER,
    referer INTEGER,
    supplement TEXT,
    v TEXT
);
```

### 2.2 주요 필드 설명

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `_id` | INTEGER | 내부 ID (PK) |
| `id` | INTEGER | 카카오톡 메시지 ID (kakao_log_id) |
| `type` | INTEGER | 메시지 타입 (1: 텍스트, 2: 사진, 12: Feed, 70-79: 반응 등) |
| `chat_id` | INTEGER | 채팅방 ID |
| `user_id` | INTEGER | 발신자 ID |
| `message` | TEXT | 메시지 내용 (암호화 가능) |
| `attachment` | TEXT | 첨부 정보 (JSON 문자열) |
| `supplement` | TEXT | 추가 정보 (JSON 문자열, 반응 상세 정보 포함) |
| `v` | TEXT | 메타데이터 (JSON 문자열, 반응 개수 포함) |
| `created_at` | INTEGER | 생성 시간 (Unix timestamp) |

---

## 3. 반응 데이터 구조

### 3.1 `v` 필드 구조

```json
{
  "enc": 31,
  "modifyRevision": 0,
  "isMine": true,
  "defaultEmoticonsCount": 3
}
```

**주요 키**:
- `defaultEmoticonsCount`: 반응 개수 (정수)
- `isMine`: 자신이 보낸 메시지 여부 (boolean)
- `enc`: 암호화 타입 (정수)
- `modifyRevision`: 수정 리비전 (정수)

### 3.2 `supplement` 필드 구조

```json
{
  "reactions": [
    {
      "type": "0",
      "userId": 429744344,
      "userName": "사용자명",
      "createdAt": 1751002695
    },
    {
      "type": "1",
      "userId": 123456789,
      "userName": "다른사용자",
      "createdAt": 1751002700
    }
  ]
}
```

**`reactions` 배열 구조**:
- `type`: 반응 타입 (0: ❤️, 1: 👍, 2: ✅, 3: 😱, 4: 😢)
- `userId`: 반응한 사용자 ID
- `userName`: 반응한 사용자 이름 (선택)
- `createdAt`: 반응 생성 시간 (Unix timestamp)

---

## 4. 반응 감지 구현

### 4.1 기본 반응 감지 코드

```python
import sqlite3
import json

def detect_reactions(conn, msg_id):
    """메시지의 반응 정보 조회"""
    cursor = conn.cursor()
    
    # v 필드와 supplement 필드 조회
    cursor.execute("""
        SELECT v, supplement, type, message, created_at
        FROM chat_logs
        WHERE id = ?
    """, (msg_id,))
    
    row = cursor.fetchone()
    if not row:
        return None
    
    v_field, supplement, msg_type, message, created_at = row
    
    # v 필드 파싱
    v_data = None
    if v_field:
        try:
            v_data = json.loads(v_field) if isinstance(v_field, str) else v_field
        except:
            v_data = None
    
    # supplement 필드 파싱
    supplement_data = None
    if supplement:
        try:
            supplement_data = json.loads(supplement) if isinstance(supplement, str) else supplement
        except:
            supplement_data = None
    
    # 반응 개수 확인
    reaction_count = 0
    if isinstance(v_data, dict):
        reaction_count = v_data.get('defaultEmoticonsCount', 0)
    
    # 반응 상세 정보 확인
    reactions = []
    if isinstance(supplement_data, dict):
        reactions = supplement_data.get('reactions', [])
        if not isinstance(reactions, list):
            reactions = []
    
    return {
        'msg_id': msg_id,
        'reaction_count': reaction_count,
        'reactions': reactions,
        'msg_type': msg_type,
        'message': message,
        'created_at': created_at
    }
```

### 4.2 반응 업데이트 감지

```python
import time

# 반응 캐시 (msg_id -> {'count': int, 'last_check': float})
reaction_cache = {}

def check_reaction_updates(conn, msg_id):
    """반응 업데이트 확인"""
    reaction_info = detect_reactions(conn, msg_id)
    
    if not reaction_info:
        return None
    
    current_count = reaction_info['reaction_count']
    current_reactions = reaction_info['reactions']
    
    # 캐시 확인
    if msg_id in reaction_cache:
        cached_count = reaction_cache[msg_id]['count']
        cached_reactions = reaction_cache[msg_id].get('reactions', [])
        
        # 반응 개수 변경 확인
        if current_count != cached_count:
            # 새로운 반응 확인
            new_reactions = []
            cached_user_ids = {r.get('userId') for r in cached_reactions if isinstance(r, dict)}
            
            for reaction in current_reactions:
                if isinstance(reaction, dict):
                    user_id = reaction.get('userId')
                    if user_id and user_id not in cached_user_ids:
                        new_reactions.append(reaction)
            
            # 캐시 업데이트
            reaction_cache[msg_id] = {
                'count': current_count,
                'reactions': current_reactions,
                'last_check': time.time()
            }
            
            return {
                'msg_id': msg_id,
                'old_count': cached_count,
                'new_count': current_count,
                'new_reactions': new_reactions,
                'all_reactions': current_reactions
            }
    else:
        # 첫 확인
        reaction_cache[msg_id] = {
            'count': current_count,
            'reactions': current_reactions,
            'last_check': time.time()
        }
    
    return None
```

### 4.3 반응 폴링 코드

```python
def poll_reaction_updates(conn, last_check_time=None):
    """반응 업데이트 폴링"""
    cursor = conn.cursor()
    
    # 최근 메시지 조회 (v 필드가 있는 메시지만)
    query = """
        SELECT id, v, supplement, type, message, created_at
        FROM chat_logs
        WHERE v IS NOT NULL AND v != ''
        AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 100
    """
    
    if last_check_time:
        cursor.execute(query, (last_check_time,))
    else:
        # 최근 1시간 내 메시지
        import time
        one_hour_ago = int(time.time()) - 3600
        cursor.execute(query, (one_hour_ago,))
    
    updates = []
    for row in cursor.fetchall():
        msg_id, v_field, supplement, msg_type, message, created_at = row
        
        # 반응 업데이트 확인
        update = check_reaction_updates(conn, msg_id)
        if update:
            updates.append(update)
    
    return updates
```

---

## 5. 반응 타입 매핑

### 5.1 반응 타입 코드

| 코드 | 이모지 | 설명 |
|------|--------|------|
| `"0"` | ❤️ | 좋아요 (하트) |
| `"1"` | 👍 | 좋아요 (엄지) |
| `"2"` | ✅ | 확인 |
| `"3"` | 😱 | 놀람 |
| `"4"` | 😢 | 슬픔 |

### 5.2 반응 타입 매핑 함수

```python
REACTION_TYPE_MAP = {
    "0": {"emoji": "❤️", "name": "heart", "korean": "좋아요 (하트)"},
    "1": {"emoji": "👍", "name": "thumbs_up", "korean": "좋아요 (엄지)"},
    "2": {"emoji": "✅", "name": "check", "korean": "확인"},
    "3": {"emoji": "😱", "name": "surprised", "korean": "놀람"},
    "4": {"emoji": "😢", "name": "sad", "korean": "슬픔"}
}

def get_reaction_info(reaction_type):
    """반응 타입 정보 조회"""
    return REACTION_TYPE_MAP.get(str(reaction_type), {
        "emoji": "❓",
        "name": "unknown",
        "korean": "알 수 없음"
    })
```

---

## 6. SQL 쿼리 예제

### 6.1 반응이 있는 메시지 조회

```sql
-- 반응이 있는 메시지 조회
SELECT 
    _id,
    id AS msg_id,
    chat_id,
    user_id,
    type,
    message,
    v,
    supplement,
    created_at
FROM chat_logs
WHERE v IS NOT NULL 
  AND v != ''
  AND json_extract(v, '$.defaultEmoticonsCount') > 0
ORDER BY created_at DESC
LIMIT 100;
```

### 6.2 특정 채팅방의 반응 조회

```sql
-- 특정 채팅방의 반응이 있는 메시지 조회
SELECT 
    _id,
    id AS msg_id,
    chat_id,
    user_id,
    type,
    message,
    v,
    supplement,
    created_at
FROM chat_logs
WHERE chat_id = ?
  AND v IS NOT NULL 
  AND v != ''
  AND json_extract(v, '$.defaultEmoticonsCount') > 0
ORDER BY created_at DESC;
```

### 6.3 반응 개수 통계

```sql
-- 반응 개수 통계
SELECT 
    chat_id,
    COUNT(*) AS message_count,
    SUM(json_extract(v, '$.defaultEmoticonsCount')) AS total_reactions
FROM chat_logs
WHERE v IS NOT NULL 
  AND v != ''
  AND json_extract(v, '$.defaultEmoticonsCount') > 0
GROUP BY chat_id
ORDER BY total_reactions DESC;
```

---

## 7. 통합 구현 예제

### 7.1 반응 감지 서비스 클래스

```python
import sqlite3
import json
import time
from typing import Dict, List, Optional

class ReactionDetector:
    """반응 감지 서비스"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.reaction_cache: Dict[int, Dict] = {}
    
    def get_connection(self):
        """DB 연결"""
        return sqlite3.connect(self.db_path)
    
    def detect_reactions(self, msg_id: int) -> Optional[Dict]:
        """메시지의 반응 정보 조회"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT v, supplement, type, message, created_at
                FROM chat_logs
                WHERE id = ?
            """, (msg_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            v_field, supplement, msg_type, message, created_at = row
            
            # 파싱
            v_data = self._parse_json(v_field)
            supplement_data = self._parse_json(supplement)
            
            # 반응 정보 추출
            reaction_count = 0
            if isinstance(v_data, dict):
                reaction_count = v_data.get('defaultEmoticonsCount', 0)
            
            reactions = []
            if isinstance(supplement_data, dict):
                reactions = supplement_data.get('reactions', [])
                if not isinstance(reactions, list):
                    reactions = []
            
            return {
                'msg_id': msg_id,
                'reaction_count': reaction_count,
                'reactions': reactions,
                'msg_type': msg_type,
                'message': message,
                'created_at': created_at
            }
        finally:
            conn.close()
    
    def check_reaction_updates(self, msg_id: int) -> Optional[Dict]:
        """반응 업데이트 확인"""
        reaction_info = self.detect_reactions(msg_id)
        
        if not reaction_info:
            return None
        
        current_count = reaction_info['reaction_count']
        current_reactions = reaction_info['reactions']
        
        # 캐시 확인
        if msg_id in self.reaction_cache:
            cached_count = self.reaction_cache[msg_id]['count']
            cached_reactions = self.reaction_cache[msg_id].get('reactions', [])
            
            # 변경 확인
            if current_count != cached_count:
                # 새로운 반응 찾기
                new_reactions = self._find_new_reactions(cached_reactions, current_reactions)
                
                # 캐시 업데이트
                self.reaction_cache[msg_id] = {
                    'count': current_count,
                    'reactions': current_reactions,
                    'last_check': time.time()
                }
                
                return {
                    'msg_id': msg_id,
                    'old_count': cached_count,
                    'new_count': current_count,
                    'new_reactions': new_reactions,
                    'all_reactions': current_reactions
                }
        else:
            # 첫 확인
            self.reaction_cache[msg_id] = {
                'count': current_count,
                'reactions': current_reactions,
                'last_check': time.time()
            }
        
        return None
    
    def poll_reaction_updates(self, since_timestamp: Optional[int] = None) -> List[Dict]:
        """반응 업데이트 폴링"""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            
            if since_timestamp:
                cursor.execute("""
                    SELECT id
                    FROM chat_logs
                    WHERE v IS NOT NULL AND v != ''
                    AND created_at > ?
                    ORDER BY created_at DESC
                    LIMIT 100
                """, (since_timestamp,))
            else:
                # 최근 1시간
                one_hour_ago = int(time.time()) - 3600
                cursor.execute("""
                    SELECT id
                    FROM chat_logs
                    WHERE v IS NOT NULL AND v != ''
                    AND created_at > ?
                    ORDER BY created_at DESC
                    LIMIT 100
                """, (one_hour_ago,))
            
            updates = []
            for (msg_id,) in cursor.fetchall():
                update = self.check_reaction_updates(msg_id)
                if update:
                    updates.append(update)
            
            return updates
        finally:
            conn.close()
    
    def _parse_json(self, value):
        """JSON 파싱 헬퍼"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                return json.loads(value)
            return value
        except:
            return None
    
    def _find_new_reactions(self, cached_reactions: List[Dict], current_reactions: List[Dict]) -> List[Dict]:
        """새로운 반응 찾기"""
        cached_user_ids = {
            r.get('userId') for r in cached_reactions 
            if isinstance(r, dict) and r.get('userId')
        }
        
        new_reactions = []
        for reaction in current_reactions:
            if isinstance(reaction, dict):
                user_id = reaction.get('userId')
                if user_id and user_id not in cached_user_ids:
                    new_reactions.append(reaction)
        
        return new_reactions
```

### 7.2 사용 예제

```python
# 반응 감지 서비스 초기화
detector = ReactionDetector("/data/data/com.kakao.talk/databases/KakaoTalk.db")

# 특정 메시지의 반응 확인
reaction_info = detector.detect_reactions(3607650857048612864)
if reaction_info:
    print(f"반응 개수: {reaction_info['reaction_count']}")
    for reaction in reaction_info['reactions']:
        print(f"  - {reaction.get('type')} by {reaction.get('userId')}")

# 반응 업데이트 폴링
updates = detector.poll_reaction_updates()
for update in updates:
    print(f"메시지 {update['msg_id']}에 새로운 반응 {len(update['new_reactions'])}개")
    for new_reaction in update['new_reactions']:
        print(f"  - {new_reaction.get('type')} by {new_reaction.get('userId')}")
```

---

## 8. 주의사항

### 8.1 성능 고려사항

- 반응 캐시는 메모리 사용량을 고려하여 주기적으로 정리해야 합니다.
- SQL 쿼리는 인덱스를 활용할 수 있도록 `created_at` 기준으로 필터링하세요.
- 대량의 메시지를 처리할 때는 배치 처리 방식을 사용하세요.

### 8.2 데이터 정확성

- `v` 필드와 `supplement` 필드는 JSON 파싱 실패 시 `None`을 반환합니다.
- 반응 정보는 실시간으로 업데이트되므로, 폴링 주기를 적절히 설정하세요.
- `defaultEmoticonsCount`와 `reactions` 배열의 길이가 일치하지 않을 수 있습니다.

### 8.3 보안 및 권한

- DB 파일 접근 권한이 필요합니다 (Android: root 권한 또는 하율 패치).
- DB 파일은 읽기 전용으로 접근하는 것을 권장합니다.

---

## 9. 참고 자료

- **DB 구조 문서**: `db_analysis_output/KAKAO_DB_STRUCTURE.md`
- **기존 구현**: `client/kakao_poller.py` (주석 처리된 반응 감지 로직)
- **반응 문서**: `REACTION_LOGIC_DOCUMENTATION.md`

---

## 10. 변경 이력

- **2025-12-20**: 초기 문서 작성 (DB 분석 기반)

