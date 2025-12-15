# Supabase 연결 문제 해결 가이드

## 🔴 "오류: 조회실패" 해결 방법

### 1. 관리자 토큰 확인

**기본 토큰:** `default-admin-token-change-me`

**확인 방법:**
```bash
# .env 파일 확인
cat /home/app/iris-core/server/.env | grep ADMIN_TOKEN
```

**없다면 기본값 사용:** `default-admin-token-change-me`

---

### 2. Supabase 테이블 생성 확인

**가장 중요!** Supabase에서 테이블이 생성되었는지 확인:

1. Supabase 대시보드 접속
2. 왼쪽 메뉴 → "Table Editor" 클릭
3. 다음 테이블이 있는지 확인:
   - `profanity_words` ✅
   - `notices`
   - `notice_schedules`
   - `filter_logs`
   - `warnings`

**테이블이 없다면:**

1. SQL Editor 열기
2. `server/db/supabase_migration.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기
4. "Run" 클릭

---

### 3. 서버 로그 확인

```bash
pm2 logs kakkaobot-server --lines 50 | grep -i "DB\|supabase\|error"
```

확인할 메시지:
- ✅ `[DB] Supabase 클라이언트 초기화 완료`
- ✅ `[DB] 데이터베이스 연결 성공`
- ❌ 오류 메시지가 있으면 내용 확인

---

### 4. .env 파일 확인

```bash
cat /home/app/iris-core/server/.env
```

확인 사항:
- `SUPABASE_URL`이 올바른지
- `SUPABASE_SERVICE_ROLE_KEY`가 올바른지
- 값이 `your-supabase-url` 같은 예시값이 아닌지

---

### 5. 직접 테스트

```bash
cd /home/app/iris-core/server
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('profanity_words').select('*').limit(1).then(({data, error}) => {
  if (error) {
    console.error('오류:', error);
  } else {
    console.log('성공:', data);
  }
});
"
```

---

## ✅ 체크리스트

- [ ] Supabase 테이블 생성 완료
- [ ] `.env` 파일에 올바른 Supabase 설정
- [ ] 서버 로그에 "데이터베이스 연결 성공" 메시지
- [ ] 관리자 토큰이 올바른지 확인
- [ ] PM2 재시작 완료

---

## 🚀 빠른 해결

1. **Supabase 테이블 확인 및 생성**
   - 가장 흔한 원인!

2. **서버 재시작**
   ```bash
   pm2 restart kakkaobot-server
   pm2 logs kakkaobot-server --lines 30
   ```

3. **관리자 페이지에서 토큰 입력**
   - `default-admin-token-change-me`

