# 반응 감지 문제 진단 보고서

**생성 일시**: 2025-01-20  
**분석 대상 DB**: 
- `ref/db/KakaoTalk_1766244238080.db`
- `ref/db/KakaoTalk2_1766244238194.db`

---

## 📊 분석 결과 요약

### 반응 데이터 현황
- **v 필드가 있는 메시지**: 1,784개
- **반응이 있는 메시지**: **2개** ✅
- **총 반응 개수**: 2개
- **supplement.reactions 배열**: **없음** ⚠️

### 핵심 발견 사항
1. ✅ **반응 데이터는 DB에 존재함** - `v.defaultEmoticonsCount`로 확인 가능
2. ⚠️ **supplement 필드는 null** - 상세 반응 정보(`reactions` 배열) 없음
3. ✅ **v 필드는 JSON 문자열** - 파싱 가능
4. ✅ **메시지 ID 구조 확인** - `id` (kakao_log_id), `chat_id` 컬럼 존재

---

## 🔍 질문별 확인 가능 정보

### 1) DB에 반응 정보가 실제로 기록되는지 검증

#### ✅ 확인 결과: **반응 정보 존재**

**증거**:
- `chat_logs` 테이블에서 `v.defaultEmoticonsCount > 0`인 메시지 **2개 발견**
- 샘플 데이터:
  ```json
  {
    "msg_id": 8490,
    "v": {
      "defaultEmoticonsCount": 1,
      "isMine": false,
      "enc": 31
    },
    "reaction_count": 1
  }
  ```

**결론**: 
- ✅ 반응 정보는 `chat_logs.v` 필드에 기록됨
- ✅ `defaultEmoticonsCount` 키로 반응 개수 확인 가능
- ❌ 별도 `reaction` 테이블 없음 (KakaoTalk2.db에도 없음)

**권장 조치**: 현재 감지 전략(`chat_logs.v` 폴링)은 **올바름**

---

### 2) v/supplement 파싱 실패 문제

#### ✅ 확인 결과: **파싱 가능, 하지만 supplement는 null**

**v 필드 구조**:
```json
{
  "notDecoded": false,
  "origin": "MSG",
  "c": "12-15 23:31:23",
  "modifyRevision": 0,
  "isSingleDefaultEmoticon": false,
  "defaultEmoticonsCount": 1,  // ✅ 반응 개수
  "isMine": false,
  "enc": 31
}
```

**파싱 가능성**:
- ✅ v 필드는 **JSON 문자열**로 저장됨 → `json.loads()` 가능
- ✅ 타입: `TEXT` (SQLite) → Python에서 `str`로 읽힘
- ⚠️ **supplement 필드는 null** → `reactions` 배열 없음

**문제점**:
- 현재 코드는 `supplement.reactions`에서 상세 반응 정보를 기대하지만
- 실제 DB에는 `supplement`가 **null**이거나 `reactions` 배열이 없음
- 따라서 **`new_reactions`, `removed_reactions`를 정확히 계산할 수 없음**

**권장 조치**:
1. `v.defaultEmoticonsCount`만으로는 반응 개수만 알 수 있음
2. 반응자 정보(`userId`, `type`)는 `supplement.reactions`에서만 얻을 수 있는데, 현재 DB에는 없음
3. **대안**: 반응 개수 변화만 감지하고, 상세 정보는 네트워크/알림 기반으로 수집 필요

---

### 3) 캐시 로직 문제

#### ✅ 확인 결과: **캐시 miss 시 reaction_new 이벤트 생성 로직 존재**

**현재 코드 상태** (라인 1742-1760):
```python
# 캐시에 없음: 초기 등록
if current_count > 0:
    event_data = create_reaction_event(
        old_count=0,
        new_count=current_count,
        new_reactions=normalized_reactions,  # ⚠️ 빈 set일 가능성
        ...
    )
```

**문제점**:
- `supplement.reactions`가 없으면 `normalized_reactions`는 **빈 set**
- `new_reactions`가 빈 배열로 전송됨
- 서버에서 반응자 정보를 알 수 없어 저장 불가

**폴링 범위**:
- 현재: 6시간, 300개
- 분석 결과: v 필드가 있는 메시지가 1,784개
- **권장**: 24시간, 2000개 이상으로 확대

**권장 조치**:
1. 캐시 miss 시 `reaction_new` 이벤트는 생성하되, `new_reactions`가 비어있으면 서버에서 처리 불가
2. 폴링 범위 확대 검토

---

### 4) WebSocket 라우팅 문제

#### ✅ 확인 결과: **서버 수신 로직 존재**

**현재 코드 상태** (`server/server.js` 라인 1363-1365):
```javascript
if (messageData.type === 'reaction_update') {
  console.log(`[반응 업데이트] [1단계] 이벤트 수신: ...`);
  // 처리 시작
}
```

**확인 방법**:
- 서버 로그에서 `[반응 업데이트] [1단계]` 메시지 확인
- 없으면 클라이언트에서 이벤트 전송 실패 또는 필터링됨

**권장 조치**:
- 서버 로그 확인 필요 (실제 테스트 필요)

---

### 5) 메시지 ID 변환 실패

#### ⚠️ 확인 결과: **잠재적 문제 존재**

**DB 구조 확인**:
- `chat_logs` 테이블:
  - `_id`: INTEGER (PK) - 내부 ID
  - `id`: INTEGER - **kakao_log_id** (3607650857048612864 형식)
  - `chat_id`: INTEGER - 채팅방 ID

**현재 서버 코드** (`server/server.js` 라인 1407-1411):
```javascript
const { data: messageByLogId } = await db.supabase
  .from('chat_messages')
  .select('id')
  .eq('kakao_log_id', numericLogId)
  .eq('room_name', room || '')  // ⚠️ room_name으로 매칭
```

**문제점**:
1. **room_name 매칭**: 공백/이모지/정규화 차이로 실패 가능
2. **chat_id 미사용**: `chat_logs.chat_id`는 있지만 서버 매핑에 사용 안 함

**권장 조치**:
- ✅ `chat_id` 기반 매핑으로 변경 (더 안정적)
- 또는 `room_name` 정규화 로직 추가

---

### 6) Unique Constraint 문제

#### ⚠️ 확인 결과: **설계 불일치 존재**

**현재 스키마** (`server/db/chat_logs_schema.sql` 라인 132):
```sql
UNIQUE (message_id, reactor_name, reaction_type)
```

**문제점**:
1. **reactor_name 기반**: null이거나 변동 시 중복 처리 문제
2. **삭제 쿼리 불일치**: 서버 코드는 `reactor_id` 기준으로 삭제 (라인 1551)
3. **supplement.reactions 없음**: `reactor_id`를 얻을 수 없음

**권장 조치**:
- Unique를 `(message_id, reactor_id, reaction_type)`로 변경
- 하지만 현재 DB에는 `reactor_id` 정보가 없어서 저장 불가

---

## 🎯 핵심 문제점 종합

### 문제 1: supplement.reactions 배열 없음
**영향**: 반응자 정보(`userId`, `type`)를 얻을 수 없어 저장 불가

**증거**:
- 분석 결과: `supplement: null` 또는 `reactions` 키 없음
- 반응 개수만 알 수 있음 (`v.defaultEmoticonsCount`)

**해결 방안**:
1. **단기**: 반응 개수 변화만 감지하고 로그만 남김
2. **중기**: 네트워크 패킷 분석 또는 알림 기반으로 상세 정보 수집
3. **장기**: 카카오톡 API 또는 다른 데이터 소스 활용

### 문제 2: 메시지 ID 변환의 room_name 의존
**영향**: room_name 불일치 시 메시지 찾기 실패

**해결 방안**:
- `chat_id` 기반 매핑으로 변경

### 문제 3: Unique Constraint 설계 불일치
**영향**: reactor_name이 null이거나 변동 시 중복 처리 문제

**해결 방안**:
- `reactor_id` 기반으로 변경 (하지만 현재는 reactor_id 정보 없음)

---

## 📋 즉시 실행 가능한 수정 사항

### 우선순위 1: 메시지 ID 변환 개선
```javascript
// server/server.js 수정
// room_name 대신 chat_id 사용
const { data: messageByLogId } = await db.supabase
  .from('chat_messages')
  .select('id')
  .eq('kakao_log_id', numericLogId)
  .eq('chat_id', chatId)  // ✅ room_name 대신 chat_id 사용
  .maybeSingle();
```

**필수 조건**: 클라이언트 이벤트에 `chat_id` 포함 필요

### 우선순위 2: 파싱 디버그 로그 추가
```python
# client/kakao_poller.py 수정
print(f"[REACTION-DBG] log_id={msg_id}, type(v)={type(v_field)}, len(v)={len(str(v_field)) if v_field else 0}")
print(f"[REACTION-DBG] v_head={str(v_field)[:200] if v_field else 'None'}")
print(f"[REACTION-DBG] supplement={str(supplement)[:200] if supplement else 'None'}")
print(f"[REACTION-DBG] extracted count={current_count}, reactions_len={len(reactions)}")
```

### 우선순위 3: 폴링 범위 확대
```python
# client/kakao_poller.py 수정
REACTION_TIME_RANGE = 86400  # 24시간 (기존: 6시간)
REACTION_QUERY_LIMIT = 2000  # 2000개 (기존: 300개)
```

---

## 🔬 추가 조사 필요 사항

### 1. supplement.reactions가 언제 생성되는가?
- 반응을 누른 직후 DB를 확인하여 `supplement` 필드 변화 관찰
- 네트워크 패킷 분석으로 반응 데이터 수신 시점 확인

### 2. chat_id 매핑 확인
- 서버의 `chat_messages` 테이블에 `chat_id` 컬럼 존재 여부 확인
- 클라이언트 이벤트에 `chat_id` 포함 여부 확인

### 3. 실제 반응 저장 테스트
- 반응 이벤트가 서버까지 도달하는지 로그 확인
- 메시지 ID 변환 성공 여부 확인
- DB 저장 시도 및 오류 확인

---

## 📝 결론

### ✅ 확인된 사항
1. 반응 데이터는 DB에 존재 (`v.defaultEmoticonsCount`)
2. v 필드 파싱 가능 (JSON 문자열)
3. 캐시 miss 시 reaction_new 이벤트 생성 로직 존재
4. 서버 수신 로직 존재

### ⚠️ 발견된 문제
1. **supplement.reactions 배열 없음** → 반응자 정보 수집 불가 (최대 문제)
2. 메시지 ID 변환의 room_name 의존 → chat_id 사용 권장
3. Unique Constraint 설계 불일치 → reactor_id 기반 권장 (하지만 정보 없음)

### 🎯 권장 조치 순서
1. **즉시**: 파싱 디버그 로그 추가하여 실제 데이터 확인
2. **단기**: 메시지 ID 변환을 chat_id 기반으로 변경
3. **중기**: supplement.reactions 수집 방법 조사 (네트워크/알림 기반)
4. **장기**: 반응 개수 변화만 감지하는 간소화된 버전으로 전환 검토

---

**보고서 작성일**: 2025-01-20  
**다음 업데이트**: 실제 반응 저장 테스트 후 결과 반영



