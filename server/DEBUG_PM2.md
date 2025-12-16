# PM2 오류 디버깅 가이드

## 현재 상태
- 서버 상태: `errored` 
- 재시작 횟수: 18번
- 문제: 서버가 시작되지 않고 계속 실패

## 🔍 오류 확인 방법

### 1. PM2 로그 확인

```bash
# 오류 로그 확인
pm2 logs kakkaobot-server --err --lines 50

# 전체 로그 확인
pm2 logs kakkaobot-server --lines 100

# 실시간 로그 확인
pm2 logs kakkaobot-server --lines 0
```

### 2. 상세 정보 확인

```bash
# 프로세스 상세 정보
pm2 describe kakkaobot-server

# 재시작 이력
pm2 logs kakkaobot-server --lines 200 | grep -i error
```

### 3. 직접 실행하여 오류 확인

PM2 없이 직접 실행하여 오류 메시지 확인:

```bash
cd /home/app/iris-core/server
node -r dotenv/config server.js
```

또는:

```bash
cd /home/app/iris-core
cd server
npm start
```

## 🔧 일반적인 오류 해결

### 오류 1: Cannot find module './db/database'

**원인:** 작업 디렉토리가 잘못됨

**해결:**
```bash
# PM2 설정 확인 및 수정
cd /home/app/iris-core
pm2 delete kakkaobot-server
pm2 start config/ecosystem.config.js
```

### 오류 2: .env 파일을 찾을 수 없음

**해결:**
```bash
# .env 파일 확인
ls -la /home/app/iris-core/server/.env

# 파일이 없으면 생성
cd /home/app/iris-core/server
nano .env
```

### 오류 3: Supabase 연결 오류

**확인:**
```bash
# .env 파일 내용 확인
cat /home/app/iris-core/server/.env | grep SUPABASE
```

**해결:**
- `.env` 파일에 올바른 Supabase URL과 키가 있는지 확인

### 오류 4: 포트 충돌

**확인:**
```bash
netstat -tulpn | grep 5002
```

**해결:**
- 다른 프로세스가 포트를 사용 중이면 종료하거나 `.env`에서 PORT 변경

## 📝 PM2 설정 확인

`config/ecosystem.config.js` 파일 확인:

```javascript
{
  name: 'kakkaobot-server',
  script: 'server.js',  // server 디렉토리 기준
  cwd: '/home/app/iris-core/server',  // 절대 경로 사용 권장
  // ...
}
```

## 🚀 수정된 PM2 설정 사용

현재 경로가 `/home/app/iris-core`인 경우:

```bash
# 기존 프로세스 삭제
pm2 delete kakkaobot-server

# 수정된 설정으로 재시작
pm2 start config/ecosystem.config.js

# 로그 확인
pm2 logs kakkaobot-server --lines 50
```

## ⚡ 빠른 해결 방법

1. **PM2 프로세스 삭제**
   ```bash
   pm2 delete kakkaobot-server
   ```

2. **직접 실행하여 오류 확인**
   ```bash
   cd /home/app/iris-core/server
   node -r dotenv/config server.js
   ```

3. **오류 메시지 확인 후 수정**

4. **PM2로 다시 시작**
   ```bash
   cd /home/app/iris-core
   pm2 start config/ecosystem.config.js
   ```



