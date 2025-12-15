# PM2 오류 해결 가이드

## 현재 문제
- 서버 상태: `errored` (에러 상태)
- 재시작 횟수: 18번
- 원인: 서버가 시작되지 않고 계속 실패

## 🔍 1단계: 오류 로그 확인

터미널에서 다음 명령어로 오류를 확인하세요:

```bash
# PM2 오류 로그 확인
pm2 logs kakkaobot-server --err --lines 50

# 또는 전체 로그 확인
pm2 logs kakkaobot-server --lines 100
```

이 로그에서 **실제 오류 메시지**를 확인해야 합니다!

---

## 🔧 2단계: 직접 실행하여 오류 확인

PM2 없이 직접 실행하여 정확한 오류를 확인:

```bash
# 현재 디렉토리 확인
pwd

# server 디렉토리로 이동
cd /home/app/iris-core/server

# 직접 실행
node -r dotenv/config server.js
```

이렇게 하면 **정확한 오류 메시지**가 콘솔에 표시됩니다.

---

## 🚀 3단계: 일반적인 오류 해결

### 오류 1: Cannot find module './db/database'

**해결:**
```bash
# 작업 디렉토리 확인 (반드시 server 디렉토리여야 함)
cd /home/app/iris-core/server
node -r dotenv/config server.js
```

### 오류 2: .env 파일 오류

**확인:**
```bash
# .env 파일 존재 확인
ls -la /home/app/iris-core/server/.env

# .env 파일 내용 확인 (Supabase 설정 확인)
cat /home/app/iris-core/server/.env | grep SUPABASE
```

**해결:** `.env` 파일이 없거나 설정이 잘못되었으면 수정

### 오류 3: Supabase 연결 오류

`.env` 파일에 다음이 올바르게 설정되어 있는지 확인:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (또는 `SUPABASE_ANON_KEY`)

---

## 🎯 4단계: PM2 설정 수정 및 재시작

### 방법 1: 절대 경로 사용 (권장)

`config/ecosystem.config.js` 파일 수정:

```javascript
{
  name: 'kakkaobot-server',
  script: 'server.js',
  cwd: '/home/app/iris-core/server',  // 절대 경로로 변경
  // ... 나머지 설정
}
```

그 후:
```bash
# 기존 프로세스 삭제
pm2 delete kakkaobot-server

# 수정된 설정으로 재시작
pm2 start config/ecosystem.config.js

# 로그 확인
pm2 logs kakkaobot-server --lines 50
```

### 방법 2: 현재 위치에서 실행

```bash
# 현재 디렉토리 확인
pwd
# 출력이 /home/app/iris-core 라면:

cd /home/app/iris-core
pm2 delete kakkaobot-server
pm2 start config/ecosystem.config.js
```

---

## ⚡ 빠른 해결 명령어 (순서대로 실행)

```bash
# 1. 기존 프로세스 삭제
pm2 delete kakkaobot-server

# 2. 현재 위치 확인
pwd

# 3. 직접 실행하여 오류 확인 (오류 메시지를 복사하세요!)
cd /home/app/iris-core/server
node -r dotenv/config server.js

# 오류가 해결되면:
# 4. PM2로 재시작
cd /home/app/iris-core
pm2 start config/ecosystem.config.js

# 5. 상태 확인
pm2 status
pm2 logs kakkaobot-server --lines 50
```

---

## 📝 확인해야 할 사항

1. ✅ `.env` 파일이 `/home/app/iris-core/server/.env`에 있는가?
2. ✅ `.env` 파일에 Supabase 설정이 올바른가?
3. ✅ `server/db/database.js` 파일이 존재하는가?
4. ✅ `npm install`을 실행했는가? (의존성 설치)

---

## 💡 추가 팁

### PM2 설정에 절대 경로 하드코딩

`config/ecosystem.config.js`:
```javascript
cwd: '/home/app/iris-core/server',  // 실제 경로로 변경
```

### 환경 변수로 경로 지정

```bash
export PM2_CWD=/home/app/iris-core/server
pm2 start config/ecosystem.config.js
```

---

**먼저 `pm2 logs kakkaobot-server --err --lines 50` 명령어로 오류 메시지를 확인하고 알려주세요!**

