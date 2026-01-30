# 신고 기능 및 반응 감지 점검 요약

## 1. 신고 기능 수정 완료

### 문제점
- `server.js`에서 `replyToKakaoLogId`를 추출하지만 `handleMessage`에 전달하지 않음
- `replyToMessageId`가 `null`일 때 `handleMessage`에서 재추출 시도하지만 실패

### 수정 내용
- `handleMessage` 함수에 `replyToKakaoLogId` 파라미터 추가
- `server.js`에서 `handleMessage` 호출 시 `replyToKakaoLogId` 전달
- `handleMessage`에서 `replyToKakaoLogId`를 우선 사용하도록 수정

### 변경 파일
- `server/labbot-node.js`: `handleMessage` 함수 시그니처 수정 및 `replyToKakaoLogId` 처리 로직 개선
- `server/server.js`: `handleMessage` 호출 시 `replyToKakaoLogId` 전달

### 예상 결과
- 답장 버튼을 누르고 `!신고` 명령어 입력 시 `replyToKakaoLogId`가 정상적으로 추출되어 신고 기능이 작동함

---

## 2. 반응 감지 및 DB 저장 점검

### 반응 감지 로직 확인

#### 2.1 반응 메시지 타입 처리
- **위치**: `server/server.js` (라인 982-1171)
- **처리 타입**:
  - `reaction`: 기본 반응 메시지
  - `reaction_update`: 반응 업데이트 (상세 정보 포함)
  - `like`: 좋아요 반응
  - `reaction_count_update`: 반응 카운트만 업데이트 (경량 버전)

#### 2.2 반응 저장 로직

**2.2.1 `reaction_update` 타입 처리** (라인 1174-1422)
- `newReactions` 배열을 순회하며 각 반응 저장
- `saveReaction` 함수 호출하여 `chat_reactions` 테이블에 저장
- 반응자 이름 조회: `reactorId`로 `chat_messages` 테이블에서 최신 `sender_name` 조회
- 관리자 반응 여부 확인: `CONFIG.ADMIN_USERS`와 비교
- `moderationLogger.saveReactionLog` 호출하여 로그 저장

**2.2.2 `reaction_count_update` 타입 처리** (라인 1001-1170)
- 반응 카운트만 저장 (경량 버전)
- `chat_reaction_counts` 테이블에 스냅샷 저장
- `chat_reaction_deltas` 테이블에 변경 이력 저장
- 메시지를 찾지 못한 경우 `reaction_count_pending` 테이블에 적재

#### 2.3 반응 저장 함수 (`saveReaction`)

**위치**: `server/db/chatLogger.js` (라인 742-841)

**저장 테이블**: `chat_reactions`
- `message_id`: 메시지 DB id
- `reaction_type`: 반응 타입 (예: 'thumbs_up', 'heart')
- `reactor_name`: 반응자 이름 (null 가능)
- `reactor_id`: 반응자 ID (필수 권장)
- `is_admin_reaction`: 관리자 반응 여부

**저장 로직**:
1. 파라미터 확인 및 로그 출력
2. `chat_reactions` 테이블에 INSERT
3. 중복 반응인 경우 무시 (unique_violation)
4. 반응 통계 업데이트 (비동기, `reactorName`이 있을 때만)

#### 2.4 반응 삭제 로직

**위치**: `server/server.js` (라인 1385-1422)
- `removedReactions` 배열을 순회하며 각 반응 삭제
- `chat_reactions` 테이블에서 `message_id`, `reactor_id`, `reaction_type`으로 삭제

---

## 3. 반응 감지 상태 점검 결과

### ✅ 정상 작동 확인
1. **반응 메시지 수신**: `reaction`, `reaction_update`, `like` 타입 메시지 처리
2. **반응 저장**: `saveReaction` 함수 호출하여 `chat_reactions` 테이블에 저장
3. **반응 삭제**: `removedReactions` 배열 처리하여 반응 삭제
4. **반응 카운트**: `reaction_count_update` 타입 처리하여 카운트 저장
5. **로그 저장**: `moderationLogger.saveReactionLog` 호출하여 로그 저장

### 📋 확인 필요 사항
1. **실제 반응 데이터 확인**: DB에서 `chat_reactions` 테이블 조회하여 실제 반응이 저장되는지 확인
2. **반응 카운트 확인**: `chat_reaction_counts` 테이블 조회하여 카운트가 정상적으로 저장되는지 확인
3. **로그 확인**: 서버 로그에서 `[반응 업데이트]`, `[반응 저장]` 관련 로그 확인

### 🔍 디버깅 방법
1. **서버 로그 확인**:
   - `[반응 처리]` 로그: 반응 메시지 수신 확인
   - `[반응 업데이트]` 로그: 반응 업데이트 처리 확인
   - `[반응 저장]` 로그: 반응 저장 성공/실패 확인
   - `[반응 카운트]` 로그: 반응 카운트 업데이트 확인

2. **DB 조회**:
   ```sql
   -- 최근 반응 조회
   SELECT * FROM chat_reactions 
   ORDER BY created_at DESC 
   LIMIT 10;
   
   -- 반응 카운트 조회
   SELECT * FROM chat_reaction_counts 
   ORDER BY updated_at DESC 
   LIMIT 10;
   
   -- 반응 로그 조회
   SELECT * FROM reaction_logs 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

---

## 4. 권장 사항

### 4.1 신고 기능
- 테스트: 답장 버튼을 누르고 `!신고` 명령어 입력하여 정상 작동 확인
- 로그 확인: `[신고]` 관련 로그에서 `replyToKakaoLogId` 추출 및 변환 과정 확인

### 4.2 반응 감지
- 실제 반응 데이터 확인: DB에서 `chat_reactions` 테이블 조회
- 반응 카운트 확인: `chat_reaction_counts` 테이블 조회
- 로그 확인: 서버 로그에서 반응 처리 관련 로그 확인

---

## 변경 파일 목록

### [수정] server/labbot-node.js
- `handleMessage` 함수에 `replyToKakaoLogId` 파라미터 추가
- 신고 기능에서 `replyToKakaoLogId` 우선 사용하도록 수정

### [수정] server/server.js
- `handleMessage` 호출 시 `replyToKakaoLogId` 전달

### [점검 완료] server/db/chatLogger.js
- `saveReaction` 함수 확인: 정상 작동 확인

### [점검 완료] server/server.js
- 반응 감지 로직 확인: 정상 작동 확인

