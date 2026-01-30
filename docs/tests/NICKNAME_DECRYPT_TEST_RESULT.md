# 닉네임 복호화 테스트 결과

## 테스트 정보

- **암호화된 이름**: `R1Znx2lwf3K`
- **예상 결과**: `환영하는 라이언`
- **MY_USER_ID**: `4897202238384073231`
- **테스트 범위**: enc = 0 ~ 31 (전체 범위)

## 테스트 결과

### 기본 테스트 (enc: 31, 30, 32)
- **결과**: 모두 실패
- enc=31: 복호화 실패 또는 결과 없음
- enc=30: 복호화 실패 또는 결과 없음
- enc=32: Invalid enc value 오류 (범위 초과)

### 확장 테스트 (enc: 0 ~ 31)
- **결과**: 모두 실패
- 32개의 enc 값 모두 테스트했지만 유효한 복호화 결과 없음

## 가능한 원인

### 1. MY_USER_ID가 잘못되었을 가능성 ⚠️
- 현재 사용한 MY_USER_ID가 실제 자신의 user_id와 다를 수 있음
- Iris는 `Configurable.botId`를 사용하는데, 이것은 `chat_logs`에서 `isMine=true`로 찾음

### 2. 암호화된 이름이 예상과 다를 수 있음
- "R1Znx2lwf3K"가 실제 DB에 저장된 값과 다를 수 있음
- Base64 패딩이나 추가 문자가 있을 수 있음

### 3. DB에서 실제 enc 값을 확인해야 함
```sql
-- friends 테이블 확인
SELECT name, enc FROM db2.friends WHERE name = 'R1Znx2lwf3K';

-- open_chat_member 테이블 확인
SELECT nickname, enc FROM db2.open_chat_member WHERE nickname = 'R1Znx2lwf3K';
```

## 해결 방안

### 방안 1: 실제 DB 쿼리로 확인 (권장)
1. Android 기기에서 DB 직접 접근
2. `friends` 또는 `open_chat_member` 테이블에서:
   - `name`/`nickname` = 'R1Znx2lwf3K'인 행 조회
   - 해당 행의 `enc` 값 확인
3. 확인한 enc 값으로 다시 테스트

### 방안 2: MY_USER_ID 재확인
1. `chat_logs` 테이블에서 `isMine=true`인 메시지의 `user_id` 확인
2. 또는 `guess_my_user_id()` 함수 실행하여 후보 확인
3. 각 후보로 테스트

### 방안 3: 실제 메시지 로그 확인
클라이언트 로그에서 다음 정보 확인:
- 실제 DB에서 조회한 enc 값
- 복호화 시도 시 오류 메시지
- MY_USER_ID 값

## 다음 단계

1. **DB에서 직접 확인**: 
   ```sql
   SELECT name, enc FROM db2.friends WHERE name LIKE '%R1Znx2lwf3K%';
   SELECT nickname, enc FROM db2.open_chat_member WHERE nickname LIKE '%R1Znx2lwf3K%';
   ```

2. **MY_USER_ID 재확인**:
   - `~/my_user_id.txt` 파일 내용 확인
   - 또는 `chat_logs`에서 `isMine=true`인 메시지 확인

3. **로그 확인**:
   - 클라이언트 실행 시 `[발신자]` 관련 로그 확인
   - 실제 조회한 enc 값과 MY_USER_ID 확인

## 코드 분석 결과

✅ **복호화 로직은 올바르게 구현되어 있습니다**
- Iris 코드와 동일한 알고리즘 사용
- 파라미터 전달도 올바름

❌ **문제는 데이터 또는 ID 값**에 있을 가능성이 높습니다
- MY_USER_ID가 잘못되었거나
- enc 값이 예상과 다르거나
- 암호화된 이름이 정확하지 않을 수 있음

