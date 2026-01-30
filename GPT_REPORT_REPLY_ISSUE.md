# 답장 메시지 저장 문제 GPT 보고서

## 문제 요약

답장 메시지(`msg_type=26`)가 감지되지만 `reply_to_kakao_log_id`가 `null`로 저장되어 답장 정보가 손실되고 있습니다.

## 로그 분석 결과

### 클라이언트 로그 (client (3).log)

**확인된 사실**:
- ✅ `[get_new_messages] 쿼리 결과: 1개 메시지 조회됨` - 메시지 조회 성공
- ✅ `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개` - 새 메시지 발견
- ❌ `[DB 쿼리] ⚠️⚠️⚠️ dict 변환 완료` 로그 없음 - **dict 변환 로직이 실행되지 않음**
- ❌ `[디버그] ⚠️⚠️⚠️ new_messages 상태` 로그 없음 - **상태 확인 로그가 출력되지 않음**
- ❌ `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그 없음 - **메시지 처리 루프가 실행되지 않음**

**의미**:
- `get_new_messages()` 함수의 dict 변환 로직이 실행되지 않음
- `poll_messages()` 함수의 메시지 처리 루프가 실행되지 않음
- 답장 정보 추출 로직(`msg_type`, `attachment`, `referer` 확인)이 전혀 실행되지 않음

### 서버 로그 (server (3).log)

**확인된 사실**:
- ✅ `msg_type=26` (답장 메시지) 감지됨
- ✅ `attachment` 존재함 (448자)
- ✅ `[답장 링크] ⚠️ 답장 메시지 감지: msg_type=26, hasAttachment=true, hasReferer=false`
- ❌ `attachment` 복호화 실패: "잘못된 패딩 길이 (100)"
- ❌ `[답장 링크] ⚠️ 복호화 후보 목록` 로그 없음 - **여러 후보로 복호화 시도하는 로직이 실행되지 않음**
- ❌ `[답장 링크] 복호화 시도: userId=...` 로그 없음
- ❌ 최종 `reply_to_kakao_log_id: null`

**의미**:
- `isReplyMessage` 조건은 통과했지만, `if (myUserId && encType)` 조건이 false이거나
- `decryptKakaoTalkMessage`가 예외를 던지지 않고 `null`을 반환하여 여러 후보로 시도하는 로직이 실행되지 않음

## 근본 원인 분석

### 문제 1: 클라이언트 메시지 처리 루프 미실행

**원인**:
1. `get_new_messages()` 함수에서 dict 변환 로직이 실행되지 않음
   - `if len(messages) > 0:` 조건이 false이거나
   - 예외 발생하여 fallback으로 튜플 리스트 사용
2. `poll_messages()` 함수에서 메시지 처리 루프가 실행되지 않음
   - `if new_messages:` 조건이 false
   - `new_messages`가 비어있음

**증거**:
- `[DB 쿼리] ⚠️⚠️⚠️ dict 변환 완료` 로그가 출력되지 않음
- `[디버그] ⚠️⚠️⚠️ new_messages 상태` 로그가 출력되지 않음
- `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그가 출력되지 않음

**해결 방안**:
1. `get_new_messages()` 함수에서 dict 변환 로직이 실행되는지 확인
2. `poll_messages()` 함수에서 `new_messages` 상태 확인
3. 예외 발생 시 상세 로그 출력

### 문제 2: 서버 attachment 복호화 로직 미실행

**원인**:
1. `if (myUserId && encType)` 조건이 false
   - `myUserId` 또는 `encType`이 `null` 또는 `undefined`
2. `decryptKakaoTalkMessage`가 예외를 던지지 않고 `null`을 반환
   - 여러 후보로 시도하는 로직이 실행되지 않음

**증거**:
- `[답장 링크] ⚠️ 복호화 후보 목록` 로그가 출력되지 않음
- `[답장 링크] 복호화 시도: userId=...` 로그가 출력되지 않음
- `[답장 링크] ⚠️ attachment 복호화 실패` 로그만 출력됨

**해결 방안**:
1. `if (myUserId && encType)` 조건 전에 로그 출력
2. `decryptKakaoTalkMessage` 호출 전후 로그 출력
3. 복호화 실패 시 여러 후보로 시도하는 로직이 실행되는지 확인

## 코드 구조

### 클라이언트 (client/a.py)

**메시지 처리 흐름**:
1. `poll_messages()` - 메인 루프
2. `get_new_messages()` - DB에서 새 메시지 조회 및 dict 변환
3. `new_messages` 필터링 (중복 제거)
4. `for msg in new_messages:` - 메시지 처리 루프
5. 답장 정보 추출 (`msg_type`, `attachment`, `referer`)
6. `send_to_server()` - 서버로 전송

**문제 지점**:
- `get_new_messages()`의 dict 변환 로직이 실행되지 않음
- `poll_messages()`의 메시지 처리 루프가 실행되지 않음

### 서버 (server/server.js)

**답장 정보 추출 흐름**:
1. `msg_type=26` 또는 `attachment`/`referer` 존재 시 답장 메시지로 감지
2. `if (myUserId && encType)` - 복호화 가능 여부 확인
3. 여러 `user_id` 후보로 복호화 시도
4. 여러 `encType` 후보로 복호화 시도
5. `extractReplyTarget()` - 답장 ID 추출
6. `saveChatMessage()` - DB에 저장

**문제 지점**:
- `if (myUserId && encType)` 조건이 false이거나
- 여러 후보로 복호화 시도하는 로직이 실행되지 않음

## 해결 방안

### 1. 클라이언트 메시지 처리 루프 강화

**수정 사항**:
- `get_new_messages()` 함수에서 dict 변환 로직 실행 여부 확인
- `poll_messages()` 함수에서 `new_messages` 상태 확인
- 예외 발생 시 상세 로그 출력

### 2. 서버 attachment 복호화 로직 강화

**수정 사항**:
- `if (myUserId && encType)` 조건 전에 로그 출력
- `decryptKakaoTalkMessage` 호출 전후 로그 출력
- 복호화 실패 시 여러 후보로 시도하는 로직이 실행되는지 확인

### 3. extractReplyTarget 개선

**수정 사항**:
- JSON 파싱 실패 시 base64 디코딩 시도
- base64 디코딩도 실패하면 패턴 매칭으로 답장 ID 추출 시도
- 원본 `attachment` 문자열에서도 패턴 매칭 시도

## 예상 효과

1. **클라이언트 루프 진입 원인 파악**:
   - `[DB 쿼리] ⚠️⚠️⚠️ dict 변환 완료` 로그로 dict 변환 여부 확인
   - `[디버그] ⚠️⚠️⚠️ new_messages 상태` 로그로 루프 미실행 원인 파악

2. **서버 attachment 복호화 성공률 향상**:
   - 각 복호화 시도마다 로그 출력으로 어떤 후보가 시도되는지 확인
   - 원본 `attachment` 문자열에서도 패턴 매칭으로 답장 ID 추출 시도

3. **답장 메시지 저장 성공**:
   - `reply_to_kakao_log_id` 추출 성공 시 DB에 저장됨

## 다음 단계

1. 클라이언트 재시작 (코드 변경사항 적용)
2. 실제 답장 메시지 전송
3. 클라이언트 로그에서 `[DB 쿼리] ⚠️⚠️⚠️ dict 변환 완료` 로그 확인
4. 클라이언트 로그에서 `[디버그] ⚠️⚠️⚠️ new_messages 상태` 로그 확인
5. 서버 로그에서 `[답장 링크] ⚠️ 복호화 후보 목록` 로그 확인
6. 서버 로그에서 `[답장 링크] 복호화 시도` 로그 확인
7. DB에서 답장 메시지 저장 여부 확인

