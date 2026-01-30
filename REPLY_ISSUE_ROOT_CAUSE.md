# 답장 메시지 저장 실패 근본 원인 분석

## 로그 분석 결과

### 클라이언트 로그 (client (1).log)

**문제점**:
- ❌ `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음
- ❌ `[DB 쿼리] 컬럼명:` 로그 없음
- ❌ `[msg_type 확인]` 로그 없음
- ❌ `[attachment 확인]` 로그 없음
- ❌ `[referer 확인]` 로그 없음
- ❌ `[답장 ID 추출 시작]` 로그 없음

**의미**:
- 메시지 처리 루프가 실행되지 않음
- `new_messages`가 비어있거나 루프 진입 조건이 맞지 않음
- dict 변환 로직이 실행되지 않음

### 서버 로그 (server (1).log)

**확인된 사실**:
- ✅ `msg_type=26` (답장 메시지) 감지됨
- ✅ `attachment` 존재함 (448자 길이)
- ✅ `attachment` 복호화 시도함
- ❌ `attachment` 복호화 실패: "잘못된 패딩 길이 (133)"
- ❌ `reply_to_message_id=null` (클라이언트에서 전송 안함)
- ❌ `attachment_decrypted=null` (복호화 실패)
- ❌ 최종 `reply_to_kakao_log_id: null`

## 근본 원인

### 문제 1: 클라이언트 메시지 처리 루프 미실행

**증상**:
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음
- `[DB 쿼리] 컬럼명:` 로그 없음

**원인 추정**:
1. `get_new_messages()`에서 dict 변환 실패
2. `poll_messages()`에서 `new_messages`가 비어있음
3. `if new_messages:` 조건이 false

**확인 필요**:
- `get_new_messages()` 반환값 확인
- `poll_messages()`에서 `new_messages` 상태 확인
- dict 변환 예외 발생 여부 확인

### 문제 2: 서버 attachment 복호화 실패

**증상**:
- `[복호화] 실패: 잘못된 패딩 길이 (133)`
- `attachment_decrypted=null`

**원인**:
- `attachment` 복호화 시 잘못된 `user_id` 또는 `encType` 사용
- 클라이언트에서 복호화된 `attachment_decrypted`를 전송하지 않음

**해결 방안**:
1. 클라이언트에서 `attachment` 복호화 후 `attachment_decrypted` 전송
2. 서버에서 복호화 실패 시 다른 `user_id` 또는 `encType` 시도
3. `extractReplyTarget`에서 암호화된 `attachment` 문자열도 파싱 시도

## 해결 계획

### 1. 클라이언트 루프 진입 확인

**수정 사항**:
- `get_new_messages()`에서 dict 변환 실패 시 예외 로그 출력
- `poll_messages()`에서 `new_messages`가 비어있을 때도 로그 출력
- `if new_messages:` 조건 전후 로그 추가

### 2. 서버 attachment 복호화 개선

**수정 사항**:
- 복호화 실패 시 다른 `user_id` 후보 시도
- `extractReplyTarget`에서 암호화된 문자열도 파싱 시도
- 클라이언트에서 `attachment_decrypted` 전송 확인

### 3. 클라이언트 attachment 복호화 확인

**수정 사항**:
- 클라이언트에서 `attachment` 복호화 로직 확인
- 복호화 성공 시 `attachment_decrypted` 전송 확인
- 복호화 실패 시 로그 출력

