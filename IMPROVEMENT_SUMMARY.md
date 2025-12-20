# 아키텍처 개선 작업 요약

## 완료된 개선 사항

### 1. reply_to_message_id 체계 개선 ✅

**문제점:**
- `reply_to_message_id`에 kakao_log_id와 DB id가 혼재되어 저장
- 레이스 조건으로 인해 답장 대상 메시지가 아직 DB에 없을 때 연결 실패

**해결:**
- `reply_to_kakao_log_id` 컬럼 추가 (마이그레이션 파일: `server/db/migration_add_reply_to_kakao_log_id.sql`)
- `reply_to_kakao_log_id`에 원본 kakao_log_id 저장
- `reply_to_message_id`는 DB id만 저장 (FK)
- 백필 작업 추가:
  - 저장 직후 백필: `backfillReplyLink()` 함수로 즉시 재연결 시도
  - 주기적 백필: 5분마다 `backfillAllPendingReplies()` 호출하여 모든 pending 링크 재시도
- 안전장치:
  - `safeParseInt()` 함수로 숫자 검증 강화 (`/^\d+$/`)
  - `maybeSingle()` 사용 (single() 대신)
  - `room_name` 조건 추가로 room scope 제한

### 2. 이미지 캐시 키 정규화 강화 ✅

**문제점:**
- `roomName` 기반 캐시 키가 불안정 (공백, 이모지, 정규화 차이)

**해결:**
- `server/db/utils/roomKeyNormalizer.js` 모듈 생성
- `normalizeRoomNameForCache()`: trim, 연속 공백 제거, 제어문자 제거, 유니코드 정규화(NFKC)
- `createCacheKey()`: 정규화된 roomName + senderId로 일관된 키 생성
- `setPendingAttachment()` / `getAndClearPendingAttachment()` 모두 동일 함수 사용
- 디버그 모드 (`DEBUG_CACHE=1`): 캐시 미스 시 상세 로그 출력

### 3. 반응 저장 로직 개선 ✅

**문제점:**
- `reactorName`이 없으면 저장 실패

**해결:**
- `reactorName` 의존 제거: 없어도 `reactor_id`만으로 저장 가능
- `reactorName`이 없으면 `null`로 저장
- 저장 시 `reactor_id`가 없으면 경고 로그 (하지만 저장은 진행)
- 디버그 모드 (`DEBUG_REACTION=1`): 상세 로그 출력

### 4. attachment 추출 함수 통합 ✅

**문제점:**
- 코드 곳곳에서 `src_message`, `logId`, `target_id` 등을 각자 추측해서 사용

**해결:**
- `server/db/utils/attachmentExtractor.js` 모듈 생성 (단일 진실 소스)
- 함수:
  - `extractReplyTarget()`: 답장 대상 메시지 ID 추출
  - `extractReactionTarget()`: 반응 대상 메시지 ID 추출
  - `extractImageUrl()`: 이미지 URL 추출
  - `safeParseInt()`: 안전한 숫자 파싱
- `server.js`에서 이미지 저장 시 `extractImageUrl()` 사용
- `server.js`에서 답장 ID 추출 시 `extractReplyTarget()` 사용

### 5. 안전장치 추가 ✅

**추가된 안전장치:**
- `safeParseInt()`: `/^\d+$/` 검증으로 `parseInt` 위험 방지
- `maybeSingle()`: `single()` 대신 사용하여 중복 데이터 에러 방지
- `room_name` 조건: 모든 ID 조회 시 room scope로 제한
- 디버그 모드: 환경변수로 제어 (`DEBUG_CACHE=1`, `DEBUG_REACTION=1`, `DEBUG_REPLY_LINK=1`, `DEBUG_KAKAO_ATTACHMENT=1`)

## 변경된 파일 목록

### 새로운 파일
1. `server/db/migration_add_reply_to_kakao_log_id.sql` - 스키마 마이그레이션
2. `server/db/utils/attachmentExtractor.js` - attachment 추출 함수 통합
3. `server/db/utils/roomKeyNormalizer.js` - roomName 정규화 유틸리티

### 수정된 파일
1. `server/db/chatLogger.js`
   - `saveChatMessage()`: `replyToKakaoLogId` 파라미터 추가
   - `backfillReplyLink()`: 답장 링크 백필 함수 추가
   - `backfillAllPendingReplies()`: 주기적 백필 함수 추가
   - `saveReaction()`: reactorName 의존 제거
   - `safeParseInt()`: 안전한 숫자 파싱 함수 추가

2. `server/server.js`
   - reply_to_kakao_log_id 추출 및 저장 로직 추가
   - `extractReplyTarget()` 사용
   - `extractImageUrl()` 사용
   - 이미지 캐시 저장 시 senderId 검증 추가

3. `server/labbot-node.js`
   - `setPendingAttachment()` / `getAndClearPendingAttachment()`: `createCacheKey()` 사용
   - 디버그 모드 로깅 추가

## 데이터베이스 마이그레이션

**실행 방법:**
```sql
-- Supabase SQL Editor에서 실행
-- 파일: server/db/migration_add_reply_to_kakao_log_id.sql
```

**변경 사항:**
- `chat_messages.reply_to_kakao_log_id` 컬럼 추가 (BIGINT)
- 인덱스 생성:
  - `idx_chat_messages_reply_to_kakao_log_id`
  - `idx_chat_messages_room_reply_kakao_log_id`

## 테스트 체크리스트

### 1. 답장 링크 백필
- [ ] 답장 메시지 저장 시 `reply_to_kakao_log_id` 저장 확인
- [ ] 답장 대상 메시지가 이미 DB에 있으면 즉시 `reply_to_message_id` 연결 확인
- [ ] 답장 대상 메시지가 아직 없으면 `reply_to_message_id`는 null, 이후 백필로 연결 확인
- [ ] 5분 주기 백필 작업 동작 확인

### 2. 이미지 캐시
- [ ] 이미지 메시지 저장 시 캐시에 저장 확인
- [ ] `!질문` 명령 시 캐시에서 이미지 조회 확인
- [ ] 정규화된 캐시 키로 저장/조회 일관성 확인
- [ ] `DEBUG_CACHE=1` 모드에서 캐시 미스 시 상세 로그 확인

### 3. 반응 저장
- [ ] `reactorName`이 없어도 `reactor_id`만으로 저장 가능 확인
- [ ] `reactor_id`도 없으면 경고 로그 확인 (저장은 진행)
- [ ] `DEBUG_REACTION=1` 모드에서 상세 로그 확인

### 4. attachment 추출
- [ ] 이미지 URL 추출 정확성 확인
- [ ] 답장 ID 추출 정확성 확인
- [ ] 다양한 메시지 타입에서 동작 확인

## 환경변수 (디버그 모드)

```bash
# 캐시 디버그 로그
DEBUG_CACHE=1

# 반응 저장 디버그 로그
DEBUG_REACTION=1

# 답장 링크 디버그 로그
DEBUG_REPLY_LINK=1

# attachment 디버그 로그
DEBUG_KAKAO_ATTACHMENT=1
```

## 롤백 방법

1. **스키마 롤백:**
   ```sql
   ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS reply_to_kakao_log_id;
   DROP INDEX IF EXISTS idx_chat_messages_reply_to_kakao_log_id;
   DROP INDEX IF EXISTS idx_chat_messages_room_reply_kakao_log_id;
   ```

2. **코드 롤백:**
   ```bash
   git checkout <이전 커밋>
   ```

## 다음 단계

1. 스키마 마이그레이션 실행
2. 서버 재시작
3. 테스트 체크리스트 확인
4. 프로덕션 배포

