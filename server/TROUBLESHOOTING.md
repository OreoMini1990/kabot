# 문제 해결 가이드

## 현재 수정된 오류

### ✅ 1. `nicknameChangeNotification is not defined` 오류
**원인**: 변수가 선언되지 않았는데 사용됨

**해결**: 
- `nicknameChangeNotification` 변수를 함수 최상위에 선언
- `await`를 사용하여 동기적으로 처리하도록 변경

**파일**: `server/server.js`

---

### ✅ 2. `chatId` 중복 선언 오류
**원인**: 같은 스코프에서 `chatId`가 두 번 선언됨

**해결**: 
- 1560번 줄의 선언 유지
- 1629번 줄의 중복 선언 제거

**파일**: `server/server.js`

---

### ✅ 3. `chatLogger` 중복 선언 오류
**원인**: `handleMessage` 함수 내에서 `chatLogger`가 여러 번 선언됨

**해결**: 
- 함수 최상위에 한 번만 선언
- 모든 곳에서 재사용

**파일**: `server/labbot-node.js`

---

## 통계 기능 문제 해결

### 문제: 통계 명령어가 작동하지 않음

**확인 사항**:

1. **Supabase 테이블 확인**
   - `user_statistics` 테이블이 생성되었는지 확인
   - 데이터가 있는지 확인

2. **관리자 권한 확인**
   - `CONFIG.ADMIN_USERS`에 본인 닉네임이 포함되어 있는지 확인
   - 형식: `"닉네임/ID/지역"` (예: `"랩장/AN/서울"`)

3. **서버 로그 확인**
   ```bash
   pm2 logs kakkaobot-server --lines 50
   ```
   - `[채팅 로그]` 관련 오류 메시지 확인
   - `getChatMessagesByPeriod` 호출 성공 여부 확인

---

## 닉네임 변경 감지 문제 해결

### 문제: 닉네임 변경이 감지되지 않음

**확인 사항**:

1. **Supabase 테이블 확인**
   - `users` 테이블 확인
   - `user_name_history` 테이블 확인

2. **서버 로그 확인**
   - `[닉네임 변경]` 관련 로그 확인
   - `checkNicknameChange` 호출 여부 확인

3. **테스트 방법**
   - 사용자가 닉네임 변경
   - 메시지 전송
   - 서버 로그에서 닉네임 변경 감지 로그 확인

---

## 일반적인 문제 해결

### 문제 1: 서버가 시작되지 않음

**해결**:
1. `.env` 파일의 Supabase 설정 확인
2. Supabase 연결 확인
3. 서버 로그 확인

### 문제 2: DB 연결 실패

**해결**:
1. Supabase 프로젝트가 활성화되어 있는지 확인
2. `.env` 파일의 URL/Key 확인
3. 네트워크 연결 확인

### 문제 3: 테이블이 없다는 오류

**해결**:
1. Supabase SQL 스키마 실행 확인
2. 테이블 목록에서 생성 확인
3. `server/db/README_SQL_EXECUTION_ORDER.md` 참고

---

## 로그 확인 방법

### PM2 사용 시
```bash
pm2 logs kakkaobot-server --lines 100
```

### 직접 실행 시
콘솔에서 로그 확인

### 주요 로그 키워드
- `[채팅 로그]` - 채팅 로그 관련
- `[닉네임 변경]` - 닉네임 변경 감지
- `[통계]` - 통계 기능
- `[신고]` - 신고 기능
- `[DB]` - 데이터베이스 관련

---

## 다음 단계

1. 서버 재시작
2. 로그 확인
3. 기능 테스트
4. 오류 발생 시 위의 가이드 참고






