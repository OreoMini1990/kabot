# Synology NAS에서 실행 가이드

## ✅ Synology NAS에서 Node.js 서버 실행 가능합니다!

## 📋 사전 준비

### 1. Node.js 설치 확인

Synology NAS에서 Node.js가 설치되어 있는지 확인:

```bash
# SSH로 접속 후
node --version
# Node.js 18 이상이어야 합니다

npm --version
```

**Node.js가 없다면:**
- DSM → 패키지 센터 → Node.js v18 또는 v20 설치

### 2. PM2 설치 (권장)

PM2를 사용하면 서버가 자동 재시작되고, NAS 재부팅 후에도 자동 실행됩니다:

```bash
npm install -g pm2
```

---

## 🚀 서버 실행 방법

### 방법 1: PM2 사용 (권장)

1. **프로젝트 디렉토리로 이동**
   ```bash
   cd /volume1/your-path/kakkaobot  # 실제 경로로 변경
   ```

2. **의존성 설치**
   ```bash
   cd server
   npm install
   ```

3. **PM2로 서버 시작**
   ```bash
   cd ..
   pm2 start config/ecosystem.config.js
   ```

4. **PM2 자동 시작 설정** (NAS 재부팅 후 자동 실행)
   ```bash
   pm2 startup
   # 출력된 명령어를 복사하여 실행 (예: sudo env PATH=...)
   pm2 save
   ```

5. **상태 확인**
   ```bash
   pm2 status
   pm2 logs kakkaobot-server
   ```

### 방법 2: npm start 직접 실행

```bash
cd /volume1/your-path/kakkaobot/server
npm start
```

**주의:** 터미널을 닫으면 서버가 종료됩니다. `nohup` 사용 권장:
```bash
nohup npm start > server.log 2>&1 &
```

---

## 🔧 환경 설정

### 1. .env 파일 생성

NAS에서 서버 디렉토리에 `.env` 파일 생성:

```bash
cd /volume1/your-path/kakkaobot/server
nano .env
```

내용:
```env
PORT=5002
BOT_ID=iris-core
SERVER_URL=http://your-nas-ip:5002

ADMIN_TOKEN=your-secure-token

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. PM2 설정 파일 수정 (선택사항)

`config/ecosystem.config.js` 파일에서:
- `cwd` 경로를 NAS 실제 경로로 변경
- `env_file` 추가하여 .env 파일 자동 로드:

```javascript
module.exports = {
  apps: [{
    name: 'kakkaobot-server',
    script: './server/server.js',
    cwd: '/volume1/your-path/kakkaobot',  // 실제 경로로 변경
    instances: 1,
    exec_mode: 'fork',
    env_file: './server/.env',  // .env 파일 경로
    // ... 나머지 설정
  }]
};
```

---

## 🔍 문제 해결

### 오류: "Cannot find module './db/database'"

**원인:** 작업 디렉토리가 잘못되었습니다.

**해결 방법:**

1. **PM2 설정 확인**
   - `config/ecosystem.config.js`의 `cwd` 경로가 올바른지 확인
   - `script` 경로가 상대 경로인지 확인

2. **수동으로 경로 수정**
   ```javascript
   // config/ecosystem.config.js
   script: './server/server.js',  // 또는 절대 경로: '/volume1/.../server.js'
   cwd: '/volume1/your-path/kakkaobot',  // 프로젝트 루트 경로
   ```

3. **직접 실행 시 작업 디렉토리 확인**
   ```bash
   # 반드시 server 디렉토리에서 실행
   cd /volume1/your-path/kakkaobot/server
   npm start
   ```

### 오류: "EACCES: permission denied"

**해결:**
```bash
# 권한 부여
sudo chmod -R 755 /volume1/your-path/kakkaobot
sudo chown -R your-user:your-group /volume1/your-path/kakkaobot
```

### 포트가 이미 사용 중

**확인:**
```bash
netstat -tulpn | grep 5002
```

**해결:**
- `.env` 파일에서 `PORT` 변경
- 또는 기존 프로세스 종료

---

## 📝 NAS 전용 설정 팁

### 1. 로그 디렉토리 설정

NAS에서는 로그를 공유 폴더에 저장하는 것이 좋습니다:

`server/server.js`의 `LOG_DIR`을 수정:
```javascript
const LOG_DIR = '/volume1/your-shared-folder/logs';
```

### 2. 방화벽 설정

DSM → 제어판 → 보안 → 방화벽:
- 포트 5002 TCP 허용 추가

### 3. 자동 시작 스크립트 (PM2 없이)

DSM → 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트:

```bash
#!/bin/bash
cd /volume1/your-path/kakkaobot/server
nohup node -r dotenv/config server.js > /dev/null 2>&1 &
```

---

## ✅ 실행 확인

1. **서버 상태 확인**
   ```bash
   pm2 status
   # 또는
   curl http://localhost:5002/health
   ```

2. **로그 확인**
   ```bash
   pm2 logs kakkaobot-server
   # 또는
   tail -f /volume1/your-path/kakkaobot/logs/kakkaobot-out.log
   ```

3. **외부에서 접속 테스트**
   - `http://your-nas-ip:5002/health`
   - `{"ok":true}` 응답 확인

---

## 🎯 최종 체크리스트

- [ ] Node.js 설치 확인 (v18+)
- [ ] PM2 설치 (권장)
- [ ] 프로젝트 파일을 NAS에 복사
- [ ] `server/.env` 파일 생성 및 설정
- [ ] `cd server && npm install` 실행
- [ ] Supabase 스키마 생성 완료
- [ ] PM2로 서버 시작
- [ ] PM2 자동 시작 설정 (`pm2 startup && pm2 save`)
- [ ] 방화벽 포트 5002 허용
- [ ] 헬스체크 성공 확인

---

## 💡 추가 팁

### PM2 관리 명령어

```bash
pm2 list              # 실행 중인 프로세스 목록
pm2 logs kakkaobot-server  # 로그 확인
pm2 restart kakkaobot-server  # 재시작
pm2 stop kakkaobot-server     # 중지
pm2 delete kakkaobot-server   # 삭제
pm2 monit             # 실시간 모니터링
```

### 리소스 모니터링

```bash
# CPU/메모리 사용량 확인
pm2 monit

# 또는
top -p $(pgrep -f "node.*server.js")
```

