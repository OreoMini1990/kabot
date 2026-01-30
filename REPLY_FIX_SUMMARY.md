# 답장 메시지 저장 문제 수정 요약

## 로그 분석 결과

### 클라이언트 로그 (client (1).log)
- ✅ `[get_new_messages] 쿼리 결과: 1개 메시지 조회됨` - 메시지 조회 성공
- ✅ `[poll_messages] ✅ 1개 메시지 처리 시작` - 메시지 처리 시작
- ✅ `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개` - 새 메시지 발견
- ❌ `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음 - 루프 미실행
- ❌ `[DB 쿼리] 컬럼명:` 로그 없음 - dict 변환 로그 미출력
- ❌ `[msg_type 확인]`, `[attachment 확인]` 로그 없음

### 서버 로그 (server (1).log)
- ✅ `msg_type=26` (답장 메시지) 감지됨
- ✅ `attachment` 존재함 (448자)
- ❌ `attachment` 복호화 실패: "잘못된 패딩 길이 (133)"
- ❌ `reply_to_message_id=null` (클라이언트에서 전송 안함)
- ❌ 최종 `reply_to_kakao_log_id: null`

## 근본 원인

### 문제 1: 클라이언트 메시지 처리 루프 미실행
- `new_messages`는 있지만 루프가 실행되지 않음
- `[DB 쿼리] 컬럼명:` 로그가 출력되지 않음 → dict 변환 로직이 실행되지 않았을 가능성

### 문제 2: 서버 attachment 복호화 실패
- `myUserId`와 `encType`으로 복호화 시도했지만 실패
- 다른 `user_id` 후보나 `encType` 후보를 시도하지 않음

## 수정 사항

### 1. 클라이언트 로그 강화 ✅

**파일**: `client/a.py`

**변경 내용**:
- `[DB 쿼리] 컬럼명:` 로그를 항상 출력하도록 변경
- `[조회 결과]` 로그에 `messages` 타입 정보 추가
- `new_messages` 상태 확인 로그 추가

### 2. 서버 attachment 복호화 개선 ✅

**파일**: `server/server.js`

**변경 내용**:
- 여러 `user_id` 후보로 복호화 시도 (myUserId, userId, sender_id)
- 여러 `encType` 후보로 복호화 시도 (31, 30, 32)
- 복호화 실패 시 모든 후보를 시도한 후 실패 로그 출력

### 3. extractReplyTarget 개선 ✅

**파일**: `server/db/utils/attachmentExtractor.js`

**변경 내용**:
- JSON 파싱 실패 시 base64 디코딩 시도
- base64 디코딩도 실패하면 패턴 매칭으로 `src_message`, `logId`, `src_logId` 추출 시도

## 변경 파일 목록

### [수정] client/a.py
- `get_new_messages()`: DB 쿼리 결과 로그 강화 (항상 출력)
- `poll_messages()`: `new_messages` 상태 확인 로그 추가

### [수정] server/server.js
- `attachment` 복호화 로직: 여러 `user_id` 및 `encType` 후보로 시도

### [수정] server/db/utils/attachmentExtractor.js
- `extractReplyTarget()`: base64 디코딩 및 패턴 매칭 fallback 추가

## 예상 효과

1. **클라이언트 루프 진입 확인**:
   - `[DB 쿼리] 컬럼명:` 로그가 항상 출력되어 dict 변환 여부 확인 가능
   - `new_messages` 상태 로그로 루프 미실행 원인 파악 가능

2. **서버 attachment 복호화 성공률 향상**:
   - 여러 `user_id` 및 `encType` 후보로 시도하여 복호화 성공률 향상
   - 복호화 실패 시에도 패턴 매칭으로 답장 ID 추출 시도

3. **답장 메시지 저장 성공**:
   - `reply_to_kakao_log_id` 추출 성공 시 DB에 저장됨

## 다음 단계

1. 클라이언트 재시작
2. 실제 답장 메시지 전송
3. 클라이언트 로그에서 `[DB 쿼리] 컬럼명:` 로그 확인
4. 클라이언트 로그에서 `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 확인
5. 서버 로그에서 `[답장 링크] ✅ attachment 복호화 성공` 로그 확인
6. DB에서 답장 메시지 저장 여부 확인

