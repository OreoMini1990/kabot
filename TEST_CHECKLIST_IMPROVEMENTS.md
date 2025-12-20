# 개선 사항 테스트 체크리스트

## 필수 사전 작업

### 1. 데이터베이스 마이그레이션 실행
```sql
-- Supabase SQL Editor에서 실행
-- 파일: server/db/migration_add_reply_to_kakao_log_id.sql
```

### 2. 서버 재시작
```bash
# 서버 재시작하여 새로운 코드 로드
pm2 restart kakkaobot-server
# 또는
node server/server.js
```

---

## 테스트 항목

### 1. 답장 링크 백필 기능 ✅

#### 1-1. 즉시 백필 (답장 대상 메시지가 이미 DB에 있는 경우)
**테스트 방법:**
1. 일반 메시지 전송 (메시지 A)
2. 메시지 A에 답장 전송
3. 서버 로그 확인:
   ```
   [백필] ✅ 답장 링크 연결 완료: message_id=XXX, reply_to_message_id=YYY, kakao_log_id=ZZZ
   ```
4. DB 확인:
   ```sql
   SELECT id, reply_to_kakao_log_id, reply_to_message_id 
   FROM chat_messages 
   WHERE reply_to_kakao_log_id IS NOT NULL 
   ORDER BY created_at DESC LIMIT 5;
   ```
   - `reply_to_kakao_log_id`: 값이 있어야 함
   - `reply_to_message_id`: 값이 있어야 함 (즉시 연결 성공)

**예상 결과:**
- ✅ 답장 메시지 저장 시 `reply_to_kakao_log_id`에 kakao_log_id 저장
- ✅ 답장 대상 메시지가 이미 DB에 있으면 `reply_to_message_id` 즉시 연결
- ✅ 서버 로그에 백필 성공 메시지 출력

---

#### 1-2. 레이스 조건 처리 (답장 대상 메시지가 아직 DB에 없는 경우)
**테스트 방법:**
1. 빠르게 연속 메시지 전송 (답장 대상 메시지가 아직 DB에 저장되지 않은 상태)
2. 서버 로그 확인:
   ```
   [백필] 답장 대상 메시지 미발견 (레이스 조건): kakao_log_id=XXX, room="방이름"
   ```
3. 5분 후 주기적 백필 작업 확인:
   ```
   [백필] X개의 pending reply 링크 발견, 백필 시작...
   [백필] 완료: 성공=X, 실패=Y
   ```
4. DB 확인:
   ```sql
   SELECT id, reply_to_kakao_log_id, reply_to_message_id 
   FROM chat_messages 
   WHERE reply_to_kakao_log_id IS NOT NULL 
     AND reply_to_message_id IS NULL
   ORDER BY created_at DESC;
   ```
   - 처음에는 `reply_to_message_id`가 NULL
   - 5분 후 주기적 백필로 연결됨

**예상 결과:**
- ✅ 답장 메시지 저장 시 `reply_to_message_id`는 null (대상 메시지 미발견)
- ✅ 5분 후 주기적 백필로 자동 연결
- ✅ 서버 로그에 백필 진행 상황 출력

---

#### 1-3. 디버그 모드
**테스트 방법:**
```bash
# 환경변수 설정
export DEBUG_REPLY_LINK=1

# 서버 재시작
pm2 restart kakkaobot-server
```

**예상 로그:**
```
[답장 링크] ✅ 즉시 변환 성공: kakao_log_id(XXX) → DB id(YYY)
[답장 링크] ⏳ 백필 필요: kakao_log_id(XXX), room="방이름"
```

---

### 2. 이미지 캐시 정규화 ✅

#### 2-1. 캐시 저장 및 조회
**테스트 방법:**
1. 이미지 메시지 전송
2. 서버 로그 확인:
   ```
   [이미지 캐시] 저장: key="방이름|senderId", roomName="방이름", senderId="senderId", url=...
   ```
3. `!질문` 명령 전송 (같은 사용자)
4. 서버 로그 확인:
   ```
   [이미지 캐시] 조회 및 삭제: key="방이름|senderId", url=...
   [네이버 카페] 캐시에서 이미지 조회: room="방이름", senderId="senderId", found=true
   ```

**예상 결과:**
- ✅ 이미지 저장 시 정규화된 키로 캐시 저장
- ✅ `!질문` 명령 시 캐시에서 이미지 조회 성공
- ✅ 캐시 키가 일관되게 생성됨 (공백, 이모지 정규화)

---

#### 2-2. 캐시 미스 처리
**테스트 방법:**
1. 이미지 전송하지 않고 바로 `!질문` 명령 전송
2. 서버 로그 확인:
   ```
   [이미지 캐시] 캐시에서 이미지 조회: found=false
   [네이버 카페] DB 조회 시도 (fallback)
   ```

**예상 결과:**
- ✅ 캐시에 없으면 DB 조회로 fallback
- ✅ DB 조회도 실패하면 이미지 없이 글 작성

---

#### 2-3. 디버그 모드
**테스트 방법:**
```bash
export DEBUG_CACHE=1
pm2 restart kakkaobot-server
```

**예상 로그:**
```
[이미지 캐시] 디버그: 같은 roomName prefix 키 샘플: [...]
[이미지 캐시] 미스: key="방이름|senderId", roomName="방이름", senderId="senderId"
[이미지 캐시] 디버그: 유사 키 샘플: [...]
```

---

### 3. 반응 저장 개선 ✅

#### 3-1. reactorName 없이 저장 (reactor_id만으로)
**테스트 방법:**
1. 반응 메시지 전송 (reactorName이 없는 경우 시뮬레이션)
2. 서버 로그 확인:
   ```
   [반응 저장] ⚠️ reactor_id가 없음: reactorName=..., messageId=...
   ```
   또는
   ```
   [반응 저장] ✅ 성공: { id=XXX, messageId=YYY, reactionType=..., reactorName=null, reactorId=... }
   ```
3. DB 확인:
   ```sql
   SELECT * FROM chat_reactions 
   WHERE reactor_name IS NULL 
     AND reactor_id IS NOT NULL
   ORDER BY created_at DESC LIMIT 5;
   ```

**예상 결과:**
- ✅ reactorName이 없어도 reactor_id만으로 저장 가능
- ✅ reactor_id도 없으면 경고 로그 (하지만 저장은 진행)

---

#### 3-2. 디버그 모드
**테스트 방법:**
```bash
export DEBUG_REACTION=1
pm2 restart kakkaobot-server
```

**예상 로그:**
```
[반응 저장] ✅ 성공: { id=XXX, messageId=YYY, reactionType=thumbs_up, reactorName=..., reactorId=... }
[반응 저장] 중복 반응 (무시): { messageId=YYY, reactionType=thumbs_up, ... }
```

---

### 4. attachment 추출 함수 통합 ✅

#### 4-1. 이미지 URL 추출
**테스트 방법:**
1. 이미지 메시지 전송
2. 서버 로그 확인:
   ```
   [이미지 저장] ✅ 성공: message_id=XXX, url=...
   ```
3. DB 확인:
   ```sql
   SELECT * FROM message_attachments 
   WHERE attachment_type = 'image'
   ORDER BY created_at DESC LIMIT 5;
   ```

**예상 결과:**
- ✅ `extractImageUrl()` 함수로 이미지 URL 추출 성공
- ✅ DB에 이미지 정보 저장 성공

---

#### 4-2. 답장 ID 추출
**테스트 방법:**
1. 답장 메시지 전송
2. 서버 로그 확인 (디버그 모드):
   ```bash
   export DEBUG_REPLY_LINK=1
   ```
3. `extractReplyTarget()` 함수로 답장 ID 추출 확인

**예상 결과:**
- ✅ `extractReplyTarget()` 함수로 답장 대상 ID 추출 성공
- ✅ `reply_to_kakao_log_id` 저장 확인

---

#### 4-3. 디버그 모드
**테스트 방법:**
```bash
export DEBUG_KAKAO_ATTACHMENT=1
pm2 restart kakkaobot-server
```

**예상 로그:**
```
[이미지 저장] ⚠️ 이미지 URL 추출 실패: msgType=2, attachmentData 존재=true
```

---

### 5. 안전장치 검증 ✅

#### 5-1. safeParseInt 검증
**테스트 방법:**
- 잘못된 입력 테스트는 코드 내부에서 처리됨
- 실제로는 정상 동작 확인

**예상 결과:**
- ✅ 숫자가 아닌 문자열은 null 반환
- ✅ `parseInt` 위험 방지

---

#### 5-2. maybeSingle() 사용
**테스트 방법:**
- 중복 데이터가 있어도 에러 발생하지 않음
- 실제로는 정상 동작 확인

**예상 결과:**
- ✅ 중복 데이터 시 에러 없이 null 반환
- ✅ `single()` 대신 `maybeSingle()` 사용으로 안정성 향상

---

#### 5-3. room scope 제한
**테스트 방법:**
1. 같은 kakao_log_id를 가진 메시지가 다른 방에 있을 때
2. 답장 링크가 올바른 방의 메시지만 연결되는지 확인

**예상 결과:**
- ✅ `room_name` 조건으로 올바른 방의 메시지만 연결
- ✅ 다른 방의 메시지와 혼동 없음

---

## 통합 테스트 시나리오

### 시나리오 1: 완전한 답장 흐름
1. 일반 메시지 전송 (메시지 A)
2. 메시지 A에 답장 전송
3. 확인:
   - `reply_to_kakao_log_id` 저장 확인
   - `reply_to_message_id` 연결 확인
   - 서버 로그에 백필 성공 메시지

---

### 시나리오 2: 이미지 + 질문 글쓰기
1. 이미지 메시지 전송
2. 바로 이어서 `!질문 제목 내용` 전송
3. 확인:
   - 이미지 캐시 저장 확인
   - `!질문` 시 캐시에서 이미지 조회 성공
   - 네이버 카페에 이미지 포함하여 글 작성

---

### 시나리오 3: 반응 저장 (reactorName 없음)
1. 반응 메시지 전송 (reactorName 추출 실패 시뮬레이션)
2. 확인:
   - `reactor_id`만으로 저장 성공
   - DB에 `reactor_name=null, reactor_id=값` 저장 확인

---

## 성능 테스트

### 백필 작업 성능
- 100개의 pending reply 링크가 있을 때
- 주기적 백필 작업이 5분 내에 완료되는지 확인

---

## 롤백 계획

테스트 실패 시:
1. **스키마 롤백:**
   ```sql
   ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS reply_to_kakao_log_id;
   DROP INDEX IF EXISTS idx_chat_messages_reply_to_kakao_log_id;
   DROP INDEX IF EXISTS idx_chat_messages_room_reply_kakao_log_id;
   ```

2. **코드 롤백:**
   ```bash
   git checkout <이전 커밋>
   pm2 restart kakkaobot-server
   ```

---

## 성공 기준

✅ 모든 테스트 항목이 예상 결과대로 동작
✅ 서버 로그에 오류 없음
✅ DB 데이터 정합성 확인
✅ 기존 기능 정상 동작 확인

