# 답장 메시지 저장 문제 심층 분석

## 로그 분석 결과

### 클라이언트 로그 (client (2).log)

**확인된 사실**:
- ✅ `[get_new_messages] 쿼리 결과: 1개 메시지 조회됨` - 메시지 조회 성공
- ✅ `[poll_messages] ✅ 1개 메시지 처리 시작` - 메시지 처리 시작
- ✅ `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개` - 새 메시지 발견
- ❌ `[DB 쿼리] 컬럼명:` 로그 없음 - **dict 변환 로직이 실행되지 않음**
- ❌ `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음 - **루프가 실행되지 않음**
- ❌ `[msg_type 확인]`, `[attachment 확인]` 로그 없음

**의미**:
- `get_new_messages()`에서 dict 변환 로직이 실행되지 않음
- `poll_messages()`에서 `new_messages` 루프가 실행되지 않음
- 답장 정보 추출 로직이 전혀 실행되지 않음

### 서버 로그 (server (2).log)

**확인된 사실**:
- ✅ `msg_type=26` (답장 메시지) 감지됨
- ✅ `attachment` 존재함 (448자)
- ❌ `attachment` 복호화 실패: "잘못된 패딩 길이 (97)"
- ❌ `reply_to_message_id=null` (클라이언트에서 전송 안함)
- ❌ 최종 `reply_to_kakao_log_id: null`

**의미**:
- 서버에서 `attachment` 복호화를 시도했지만 실패
- 여러 `user_id` 및 `encType` 후보로 시도하는 로직이 실행되지 않음
- `extractReplyTarget`에서 패턴 매칭도 시도하지 않음

## 근본 원인

### 문제 1: 클라이언트 dict 변환 로직 미실행

**증상**:
- `[DB 쿼리] 컬럼명:` 로그가 출력되지 않음
- `if len(messages) > 0:` 조건이 false이거나 예외 발생

**원인 추정**:
1. `get_new_messages()`에서 `messages`가 비어있음
2. dict 변환 중 예외 발생하여 fallback으로 튜플 리스트 사용
3. `if len(messages) > 0:` 조건 전에 예외 발생

**확인 필요**:
- `get_new_messages()` 반환값 확인
- dict 변환 예외 발생 여부 확인
- `messages` 타입 확인

### 문제 2: 클라이언트 메시지 처리 루프 미실행

**증상**:
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음
- `new_messages`는 있지만 루프가 실행되지 않음

**원인 추정**:
1. `if new_messages:` 조건이 false
2. `new_messages`가 비어있음
3. 루프 진입 전에 예외 발생

**확인 필요**:
- `new_messages` 상태 확인
- `if new_messages:` 조건 전후 로그 확인

### 문제 3: 서버 attachment 복호화 로직 미개선

**증상**:
- 여러 `user_id` 및 `encType` 후보로 시도하는 로직이 실행되지 않음
- 여전히 `myUserId`와 `encType`만 시도

**원인**:
- 수정한 코드가 적용되지 않았거나
- 코드 위치가 잘못되었거나
- 조건문이 실행되지 않음

**확인 필요**:
- `server/server.js`의 `attachment` 복호화 로직 확인
- 여러 후보로 시도하는 코드가 실제로 실행되는지 확인

## 해결 방안

### 1. 클라이언트 dict 변환 로직 강화

**수정 사항**:
- `if len(messages) > 0:` 조건을 제거하고 항상 로그 출력
- dict 변환 전후 로그 추가
- 예외 발생 시 상세 로그 출력

### 2. 클라이언트 메시지 처리 루프 강화

**수정 사항**:
- `new_messages` 상태 확인 로그 추가
- `if new_messages:` 조건 전후 로그 추가
- 루프 진입 전 예외 처리 강화

### 3. 서버 attachment 복호화 로직 확인 및 수정

**수정 사항**:
- 여러 `user_id` 및 `encType` 후보로 시도하는 로직 확인
- 복호화 실패 시 패턴 매칭으로 fallback
- `extractReplyTarget`에서 암호화된 문자열도 처리

