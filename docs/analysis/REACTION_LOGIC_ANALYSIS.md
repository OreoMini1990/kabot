# 반응 감지 로직 분석 및 문제점

## 1. 현재 구조

### 1.1 클라이언트 측 (`client/kakao_poller.py`)

#### `poll_reaction_updates()` 함수
- **목적**: 이미 저장된 메시지의 반응 정보를 주기적으로 확인하여 변경사항을 감지
- **실행 주기**: 10초마다 (`REACTION_CHECK_INTERVAL = 10`)
- **데이터 소스**: KakaoTalk DB의 `chat_logs` 테이블

#### 주요 로직 흐름:

```
1. DB에서 최근 24시간(또는 7일) 내 메시지 조회
   - SELECT _id, chat_id, user_id, v, supplement, created_at FROM chat_logs
   - created_at 기준으로 필터링 (초/밀리초 단위 자동 감지)

2. 각 메시지에 대해:
   a) v 필드에서 defaultEmoticonsCount 추출
      - v 필드가 JSON 문자열이면 파싱
      - v.defaultEmoticonsCount 값 확인
   
   b) 이전 확인 값과 비교 (_reaction_check_cache)
      - cache_key = msg_id
      - previous_count = cache.get(cache_key, {}).get('count', 0)
      - current_reaction_count > previous_count 이면 감지
   
   c) supplement 필드에서 새 반응 상세 정보 추출
      - supplement.reactions 또는 supplement.emoticons 배열 확인
      - 첫 실행 시 (previous_supplement 없음): 모든 reactions를 새 반응으로 처리
      - 이후 실행: previous_reactions와 비교하여 새 반응만 추출
         - reactor_id + reaction_type 조합으로 중복 체크
   
   d) 새 반응 정보를 reaction_update 메시지로 구성
      - type: "reaction_update"
      - json.target_message_id: msg_id (kakao_log_id)
      - json.reaction_type: "thumbs_up", "heart" 등
      - json.reaction_count: current_reaction_count
      - json.supplement: supplement 전체
   
   e) WebSocket으로 서버에 전송 (send_to_server with is_reaction=True)

3. 캐시 업데이트
   - _reaction_check_cache[cache_key] = {
       'count': current_reaction_count,
       'supplement': supplement,
       'last_check': time.time()
     }
```

#### 현재 문제점 (클라이언트):

1. **첫 실행 시 처리**
   - ✅ 개선됨: `previous_supplement`가 없으면 모든 reactions를 새 반응으로 처리
   - ⚠️ 여전히 문제: `supplement`가 없으면 반응 개수만 전송 (reaction_type="unknown")

2. **supplement 필드 파싱 실패**
   - supplement가 None이거나 파싱 실패 시, 반응 개수 정보만 전송
   - 서버에서는 reaction_type="unknown"으로 처리되므로 DB 저장 실패 가능

3. **반응 타입 추출**
   - supplement에서 추출하는 키: `type`, `emoType`, `reaction`
   - 일부 반응은 다른 키를 사용할 수 있음 (예: `emoticonType`)

4. **reactor_id 추출**
   - supplement에서 추출하는 키: `userId`, `user_id`
   - 일부 반응은 다른 키를 사용할 수 있음

5. **캐시 관리**
   - 메모리 캐시 사용 (프로세스 재시작 시 초기화)
   - 24시간 이상 오래된 캐시만 정리 (TTL 체크)

6. **DB 쿼리 성능**
   - 최근 24시간(또는 7일) 내 100개 메시지만 확인
   - created_at 인덱스 사용 여부 불확실

7. **로깅**
   - 반응이 0개 감지될 때 원인 파악이 어려움
   - 디버깅 로그가 부족 (최근 개선됨)

---

### 1.2 서버 측 (`server/server.js`)

#### reaction_update 메시지 처리:

```
1. WebSocket으로 reaction_update 메시지 수신
   - messageData.type === "reaction_update"

2. payload.json에서 정보 추출:
   - target_message_id: kakao_log_id
   - reaction_type: 반응 타입 (예: "thumbs_up", "heart")
   - reaction_count: 전체 반응 개수
   - supplement: supplement 전체 데이터

3. target_message_id로 실제 DB message_id 찾기
   - kakao_log_id → chat_messages.id 매핑
   - 쿼리: SELECT id FROM chat_messages WHERE kakao_log_id = ? AND room_name = ?

4. supplement 파싱하여 개별 반응 추출
   - supplement.reactions 또는 supplement.emoticons 배열 확인
   - 각 반응에 대해:
     a) reactor_id, reactor_name 추출
     b) reaction_type 추출
     c) chatLogger.saveReaction() 호출

5. saveReaction() 실행
   - chat_reactions 테이블에 INSERT
   - 중복 체크: (message_id, reaction_type, reactor_id) unique constraint
   - 중복이면 무시 (return null)

6. moderationLogger.saveReactionLog() 실행
   - reaction_logs 테이블에 INSERT
   - 상세 반응 로그 저장
```

#### 현재 문제점 (서버):

1. **target_message_id → message_id 매핑 실패**
   - kakao_log_id로 chat_messages.id를 찾지 못하면 반응 저장 실패
   - race condition: 메시지가 아직 DB에 저장되지 않은 경우

2. **supplement 파싱**
   - supplement가 없거나 파싱 실패 시 처리 불가
   - reaction_type="unknown"인 경우 DB 저장 실패 가능

3. **reactor_id/reactor_name 추출 실패**
   - reactor_id가 없으면 경고만 출력하고 저장 시도
   - reactor_name이 없으면 null로 저장 (문제 없음)

4. **중복 체크**
   - unique constraint로 중복 저장 방지
   - 하지만 이미 저장된 반응을 다시 감지하면 무시 (정상 동작)

---

## 2. 전체 흐름 다이어그램

```
[KakaoTalk DB]
  chat_logs 테이블
    ├─ _id (msg_id, kakao_log_id)
    ├─ v 필드: {"defaultEmoticonsCount": 5, ...}
    └─ supplement 필드: {"reactions": [{"userId": "...", "type": "thumbs_up"}, ...]}

[클라이언트: poll_reaction_updates()]
  ├─ 1. 최근 메시지 조회 (v, supplement 포함)
  ├─ 2. v.defaultEmoticonsCount 확인
  ├─ 3. 캐시와 비교 (증가 여부 확인)
  ├─ 4. supplement.reactions에서 새 반응 추출
  ├─ 5. reaction_update 메시지 구성
  └─ 6. WebSocket으로 서버에 전송

[서버: server.js]
  ├─ 1. reaction_update 메시지 수신
  ├─ 2. target_message_id (kakao_log_id)로 message_id 찾기
  ├─ 3. supplement 파싱하여 개별 반응 추출
  ├─ 4. 각 반응에 대해 saveReaction() 호출
  └─ 5. saveReactionLog() 호출

[DB: Supabase]
  ├─ chat_messages 테이블
  │   └─ id (message_id) ← kakao_log_id로 조회
  └─ chat_reactions 테이블
      ├─ message_id (FK → chat_messages.id)
      ├─ reaction_type
      ├─ reactor_id
      └─ reactor_name
```

---

## 3. 현재 발견된 문제점 요약

### 3.1 핵심 문제

1. **반응 감지가 0개**
   - 증상: `poll_reaction_updates()` 실행 시 "감지된 반응 변화: 0개"
   - 가능한 원인:
     - 실제로 반응이 없음
     - v.defaultEmoticonsCount가 0 또는 증가하지 않음
     - supplement 필드가 없거나 파싱 실패
     - 캐시가 이미 최신 상태 (변화 없음)
     - 첫 실행 시 supplement가 없어서 new_reactions가 비어있음

2. **첫 실행 시 supplement 없음 문제**
   - supplement가 None이면 new_reactions가 비어있음
   - 현재는 reaction_type="unknown"으로 전체 반응 개수만 전송
   - 서버에서는 supplement가 없으면 개별 반응을 추출할 수 없음

3. **msg_id (kakao_log_id) → message_id 매핑 실패**
   - 서버에서 chat_messages.id를 찾지 못하면 반응 저장 실패
   - race condition: 메시지가 아직 저장되지 않은 경우

4. **supplement 구조 불일치**
   - 카카오톡 버전에 따라 supplement 구조가 다를 수 있음
   - reactions vs emoticons 키 차이
   - reaction type 명명 규칙 차이

### 3.2 기타 문제

1. **로깅 부족**
   - 반응 감지 실패 시 원인 파악이 어려움
   - 디버깅 로그가 최근 개선되었지만 여전히 부족

2. **성능 문제**
   - 10초마다 100개 메시지 전체 스캔 (불필요한 작업)
   - DB 쿼리 최적화 필요 (인덱스 활용)

3. **캐시 관리**
   - 메모리 캐시로 인한 프로세스 재시작 시 초기화
   - 영속성 있는 캐시 필요 (선택사항)

---

## 4. 개선 방안

### 4.1 즉시 적용 가능한 개선

1. **디버깅 로그 강화**
   ```python
   # 반응이 있는 메시지에 대한 상세 로그
   if current_reaction_count > 0:
       print(f"[반응 디버깅] msg_id={msg_id}, count={current_reaction_count}, supplement={bool(supplement)}")
       if supplement:
           print(f"[반응 디버깅] supplement 샘플: {str(supplement)[:200]}...")
   ```

2. **supplement 재조회**
   - 현재 구현됨: supplement가 None이면 DB에서 재조회
   - 개선: supplement 파싱 실패 시에도 재조회 시도

3. **첫 실행 시 처리 개선**
   - 현재: supplement 없으면 reaction_type="unknown" 전송
   - 개선: supplement 재조회 실패 시에도 최소한 반응 개수 정보는 저장 시도

### 4.2 구조적 개선 (장기)

1. **반응 타입 표준화**
   - 카카오톡 반응 타입 → 내부 타입 매핑 테이블
   - 예: "like" → "thumbs_up", "love" → "heart"

2. **2-stage linking 개선**
   - 현재: kakao_log_id로 즉시 조회
   - 개선: 조회 실패 시 백그라운드 재시도 큐

3. **캐시 영속화**
   - 파일 기반 캐시 또는 Redis 사용
   - 프로세스 재시작 후에도 캐시 유지

4. **폴링 최적화**
   - 변경된 메시지만 조회 (v.defaultEmoticonsCount가 변경된 메시지만)
   - 또는 웹훅 방식으로 실시간 감지 (불가능할 수 있음)

---

## 5. 테스트 방법

### 5.1 수동 테스트

1. **반응 감지 테스트**
   ```bash
   # Termux에서
   python client/test_reaction_with_server.py
   ```

2. **로그 확인**
   ```powershell
   # PC에서
   .\scripts\fetch_termux_logs.ps1
   ```

3. **서버 로그 확인**
   - reaction_update 메시지 수신 여부
   - saveReaction() 성공/실패
   - supplement 파싱 성공/실패

### 5.2 자동화 테스트 (권장)

1. **반응이 있는 메시지 샘플 수집**
   - 실제 DB에서 v, supplement 필드 샘플 추출
   - 각 반응 타입별 샘플 확보

2. **단위 테스트 작성**
   - supplement 파싱 로직 테스트
   - 반응 타입 추출 로직 테스트
   - 캐시 비교 로직 테스트

---

## 6. 참고 자료

### 6.1 관련 코드 위치

- **클라이언트**: `client/kakao_poller.py` - `poll_reaction_updates()` 함수 (약 1390-1640줄)
- **서버**: `server/server.js` - `ws.on('message')` 핸들러 (약 1260-1370줄)
- **DB**: `server/db/chatLogger.js` - `saveReaction()` 함수 (약 645-700줄)

### 6.2 주요 변수/상수

- `_reaction_check_cache`: 반응 확인 캐시 (메모리)
- `REACTION_CHECK_INTERVAL`: 10초
- `ATTACHMENT_DECRYPT_WHITELIST`: attachment 복호화 whitelist
- `defaultEmoticonsCount`: v 필드의 반응 개수

---

## 7. 질문 및 확인 사항

1. **반응 감지가 0개인 경우, 실제로 반응이 있는 메시지가 DB에 있는가?**
   - v.defaultEmoticonsCount > 0인 메시지가 있는지 확인
   - supplement 필드가 채워져 있는지 확인

2. **첫 실행 시 모든 반응을 저장해야 하는가?**
   - 현재는 첫 실행 시 모든 reactions를 새 반응으로 처리
   - 하지만 이는 중복 저장 문제를 일으킬 수 있음

3. **reaction_type="unknown"인 경우 DB 저장을 허용해야 하는가?**
   - 현재는 저장 시도하지만, 정확한 타입이 없는 반응의 의미가 불명확

4. **반응 감지 주기 (10초)가 적절한가?**
   - 더 짧게 하면 부하 증가
   - 더 길게 하면 반응 감지 지연

---

## 8. 다음 단계 (우선순위)

1. **🔴 긴급**: 반응 감지가 0개인 원인 파악
   - 실제 DB에서 반응이 있는 메시지 샘플 확인
   - v, supplement 필드 구조 확인

2. **🟡 중요**: supplement 파싱 로직 개선
   - 다양한 supplement 구조 대응
   - 파싱 실패 시 fallback 로직

3. **🟢 개선**: 로깅 및 디버깅 강화
   - 상세 디버깅 로그 추가
   - 반응 감지 실패 시 원인 추적

4. **🔵 선택**: 성능 최적화
   - DB 쿼리 최적화
   - 캐시 영속화



