# KakaoBot Supabase 설정 가이드

## ✅ 완료된 작업
- [x] .env 파일 생성
- [x] Supabase 설정 키 입력 완료

## 📋 다음 단계

### 1단계: Supabase 데이터베이스 스키마 생성

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard 에서 프로젝트 선택

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **마이그레이션 SQL 실행**
   - `server/db/supabase_migration.sql` 파일 열기
   - 파일의 전체 내용을 복사
   - Supabase SQL Editor에 붙여넣기
   - "Run" 버튼 클릭 (또는 Ctrl+Enter)

4. **실행 결과 확인**
   - "Success. No rows returned" 메시지 확인
   - 왼쪽 메뉴 "Table Editor"에서 다음 테이블이 생성되었는지 확인:
     - `profanity_words`
     - `notices`
     - `notice_schedules`
     - `filter_logs`
     - `warnings`

### 2단계: Node.js 의존성 설치

터미널에서 다음 명령 실행:

```bash
cd server
npm install
```

**설치되는 패키지:**
- express
- ws
- axios
- @supabase/supabase-js
- dotenv

### 3단계: 서버 실행 및 테스트

1. **서버 시작**
   ```bash
   npm start
   ```

2. **정상 작동 확인**
   - 콘솔에 다음 메시지가 표시되어야 함:
     ```
     [DB] Supabase 클라이언트 초기화 완료
     [DB] 데이터베이스 연결 성공
     [2024-xx-xx] IRIS Core 시작: http://0.0.0.0:5002 / ws://0.0.0.0:5002/ws
     ```

3. **헬스체크 테스트**
   - 브라우저에서 `http://localhost:5002/health` 접속
   - `{"ok":true}` 응답 확인

### 4단계: 데이터베이스 연결 확인

1. **서버 로그 확인**
   - 서버가 시작될 때 데이터베이스 연결 메시지 확인
   - 오류가 있으면 `.env` 파일의 Supabase 설정 재확인

2. **관리자 API 테스트** (선택사항)
   ```bash
   # 환경 변수에서 ADMIN_TOKEN 확인 후
   curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" http://localhost:5002/api/admin/profanity
   ```

### 5단계: 문제 해결

**데이터베이스 연결 오류가 발생하는 경우:**

1. `.env` 파일 확인
   ```bash
   # server/.env 파일 내용 확인
   cat .env
   ```
   - `SUPABASE_URL`이 올바른지 확인
   - `SUPABASE_SERVICE_ROLE_KEY`가 올바른지 확인

2. Supabase 프로젝트 상태 확인
   - Supabase 대시보드에서 프로젝트가 활성 상태인지 확인
   - API Keys 페이지에서 키가 올바른지 확인

3. 스키마 생성 확인
   - Table Editor에서 테이블이 모두 생성되었는지 확인
   - SQL Editor에서 다음 쿼리로 확인:
     ```sql
     SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public';
     ```

**서버가 시작되지 않는 경우:**

1. Node.js 버전 확인
   ```bash
   node --version
   # Node.js 18 이상이어야 함
   ```

2. 포트 충돌 확인
   - 다른 프로세스가 5002 포트를 사용하고 있는지 확인
   - `.env` 파일에서 `PORT` 변경 가능

## 🎉 완료!

모든 단계가 완료되면:
- ✅ Supabase 데이터베이스에 테이블 생성 완료
- ✅ Node.js 서버가 Supabase와 연결됨
- ✅ 서버가 정상적으로 실행 중

이제 봇을 사용할 수 있습니다!



