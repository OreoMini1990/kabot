# 답장 및 반응 저장 문제점 요약

## 현재 상태

### DB 조회 결과
- **답장 메시지**: 0개 (`reply_to_kakao_log_id`가 있는 메시지 없음)
- **반응**: 0개 (`chat_reactions` 테이블 비어있음)
- **전체 메시지**: 82개
- 모든 메시지가 `reply_to_message_id: NULL`, `reply_to_kakao_log_id: NULL`

### 로그 분석 결과

#### 클라이언트 로그
- ✅ `[get_new_messages] ✅ 1개 새 메시지 발견` - 메시지 조회는 정상
- ✅ `[poll_messages] ✅ 1개 메시지 처리 시작` - 메시지 처리 시작은 정상
- ❌ `[msg_type 확인]` 로그 없음 - 메시지 처리 루프 내부 로그 미출력
- ❌ `[attachment 확인]` 로그 없음
- ❌ `[referer 확인]` 로그 없음
- ❌ `[반응 업데이트]` 로그 없음

#### 서버 로그
- `msg_type: 0` (일반 메시지로 인식)
- `attachment: null`
- `attachment_decrypted: null`
- `isReplyMessage=false`
- 답장 메시지로 인식되지 않음

## 핵심 문제점

### 1. 클라이언트에서 메시지 처리 루프가 실행되지 않음

**증상**:
- `[poll_messages] ✅ 1개 메시지 처리 시작` 로그는 있음
- `[조회 결과] DB에서 조회한 메시지: 1개, 새 메시지: 1개` 로그도 있음
- 하지만 `for msg in new_messages:` 루프 내부의 로그는 전혀 없음

**원인 추정**:
1. `new_messages`가 실제로는 비어있어서 루프가 실행되지 않음
2. 루프 진입 전에 예외 발생
3. `is_mine` 필터링으로 모든 메시지가 스킵됨
4. 로그가 출력되기 전에 루프가 종료됨

**확인 필요**:
- `new_messages` 리스트의 실제 내용
- `is_mine` 필터링 로직의 실행 여부
- 예외 처리 로직

### 2. DB 쿼리에서 attachment/referer 정보 미조회

**증상**:
- 서버로 전송되는 메시지에 `attachment`, `referer` 정보가 없음
- 클라이언트에서 `msg[9]`, `msg[10]` 접근 시도하지만 값이 NULL

**원인 추정**:
1. DB 쿼리에서 `attachment`, `referer` 컬럼을 SELECT하지 않음
2. `msg` 배열에 해당 정보가 포함되지 않음
3. DB에 실제로 `attachment`, `referer` 값이 저장되지 않음

**확인 필요**:
- `get_new_messages()` 함수의 SQL 쿼리
- SELECT 컬럼 목록에 `attachment`, `referer` 포함 여부
- DB에 실제로 `attachment`, `referer` 값이 있는지

### 3. 답장 메시지 정보가 서버로 전송되지 않음

**증상**:
- 클라이언트에서 `msg[9]` (attachment), `msg[10]` (referer) 추출 시도
- 하지만 서버로 전송 시 해당 정보가 포함되지 않음

**원인 추정**:
1. `message_data` 구성 시 `attachment`, `referer` 정보가 포함되지 않음
2. 서버로 전송하는 `message_data`에 해당 필드가 누락됨

**확인 필요**:
- `message_data` 구성 로직
- `send_to_server()` 함수 호출 전 데이터 확인

### 4. 반응 감지 로직 미작동

**증상**:
- `[반응 업데이트]` 로그가 전혀 없음
- `poll_reaction_updates()` 함수가 호출되지 않음

**원인 추정**:
1. `REACTION_CHECK_INTERVAL` 조건이 만족되지 않음
2. `poll_reaction_updates()` 함수 내부에서 예외 발생
3. 반응 데이터가 실제로 없음

**확인 필요**:
- `poll_reaction_updates()` 함수 호출 여부
- 반응 감지 쿼리 결과
- 반응 데이터가 DB에 실제로 있는지

### 5. 서버에서 답장 메시지로 인식하지 못함

**증상**:
- 서버 로그에서 `msg_type: 0`, `attachment: null`, `isReplyMessage=false`
- 답장 메시지로 인식되지 않음

**원인 추정**:
1. 클라이언트에서 `attachment`, `referer` 정보를 전송하지 않음
2. 서버에서 `msg_type=0`이어도 `attachment`나 `referer`가 없어서 답장으로 인식하지 못함

**확인 필요**:
- 서버로 전송되는 `message_data`의 실제 내용
- 서버의 답장 메시지 감지 로직

## 개선 사항 적용 상태

### 이미 적용된 개선 사항
1. ✅ 메시지 처리 루프 진입 로그 강화
2. ✅ DB 쿼리 결과 확인 로그 추가
3. ✅ is_mine 필터링 로그 강화
4. ✅ 서버 전송 데이터 확인 로그 추가
5. ✅ 반응 감지 로직 점검 로그 강화

### 추가 확인 필요 사항
1. 클라이언트 재시작 후 새로운 로그 확인
2. 실제 답장 메시지를 보내서 로그 확인
3. 실제 반응을 추가해서 로그 확인
4. DB에 실제로 `attachment`, `referer` 값이 있는지 확인

## 다음 단계

1. **클라이언트 재시작 및 로그 확인**
   - 새로운 로그가 출력되는지 확인
   - 메시지 처리 루프가 실제로 실행되는지 확인

2. **실제 답장 메시지 테스트**
   - 답장 메시지를 보내서 로그 확인
   - `attachment`, `referer` 정보가 추출되는지 확인

3. **DB 직접 확인**
   - `chat_logs` 테이블에서 `attachment`, `referer` 컬럼 값 확인
   - 실제로 값이 저장되어 있는지 확인

4. **서버 로그 확인**
   - 서버로 전송되는 `message_data`의 실제 내용 확인
   - 답장 메시지 감지 로직이 작동하는지 확인

## 핵심 질문

1. **클라이언트에서 메시지 처리 루프가 실행되는가?**
   - `[메시지 처리] ⚠️⚠️⚠️ 루프 진입` 로그가 출력되는가?
   - 각 메시지 처리 시작 로그가 출력되는가?

2. **DB에서 attachment/referer 정보가 조회되는가?**
   - `[DB 쿼리] 첫 메시지 attachment (msg[9])` 로그에서 값이 있는가?
   - `[DB 쿼리] 첫 메시지 referer (msg[10])` 로그에서 값이 있는가?

3. **서버로 답장 정보가 전송되는가?**
   - `[서버 전송] attachment=` 로그에서 값이 있는가?
   - `[서버 전송] reply_to_message_id=` 로그에서 값이 있는가?

4. **반응이 감지되는가?**
   - `[반응 업데이트]` 로그가 출력되는가?
   - `poll_reaction_updates()` 함수가 호출되는가?

