# Synology NAS 빠른 시작 가이드

## ✅ 네, Synology NAS에서 사용 가능합니다!

---

## 🚀 빠른 실행 (3단계)

### 1단계: NAS에 파일 업로드

1. 프로젝트 폴더를 NAS에 복사
   - 예: `/volume1/web/kakkaobot`

2. `.env` 파일 확인
   - `server/.env` 파일이 있는지 확인
   - Supabase 설정이 올바른지 확인

### 2단계: SSH 접속 및 설정

```bash
# SSH로 NAS 접속
ssh your-user@your-nas-ip

# 프로젝트 디렉토리로 이동
cd /volume1/web/kakkaobot

# 의존성 설치
cd server
npm install
cd ..
```

### 3단계: PM2로 서버 시작

```bash
# PM2 설치 (처음 한 번만)
npm install -g pm2

# 서버 시작
pm2 start config/ecosystem.config.js

# 자동 시작 설정 (NAS 재부팅 후 자동 실행)
pm2 startup
# 출력된 명령어 실행 (예: sudo env PATH=...)
pm2 save
```

---

## ✅ 확인

```bash
# 서버 상태 확인
pm2 status

# 로그 확인
pm2 logs kakkaobot-server

# 헬스체크
curl http://localhost:5002/health
```

---

## ❗ 현재 오류 해결

**오류:** `Cannot find module './db/database'`

**해결 방법:**

1. **작업 디렉토리 확인**
   ```bash
   # 반드시 server 디렉토리에서 실행하거나
   cd /volume1/web/kakkaobot/server
   npm start
   
   # 또는 PM2를 사용 (권장)
   cd /volume1/web/kakkaobot
   pm2 start config/ecosystem.config.js
   ```

2. **PM2 설정 확인**
   - `config/ecosystem.config.js`의 `cwd`가 프로젝트 루트인지 확인
   - `script`가 `./server/server.js`로 올바르게 설정되어 있는지 확인

---

## 📝 NAS 전용 팁

### 로그 확인
```bash
pm2 logs kakkaobot-server --lines 100
```

### 서버 재시작
```bash
pm2 restart kakkaobot-server
```

### 서버 중지
```bash
pm2 stop kakkaobot-server
```

### 자동 시작 해제
```bash
pm2 unstartup
```

---

## 🔧 문제 발생 시

1. **경로 확인**
   ```bash
   pwd  # 현재 위치 확인
   ls -la server/db/database.js  # 파일 존재 확인
   ```

2. **권한 확인**
   ```bash
   ls -la server/.env  # .env 파일 권한 확인
   ```

3. **Node.js 버전 확인**
   ```bash
   node --version  # v18 이상 필요
   ```

자세한 내용은 `server/NAS_SETUP_GUIDE.md` 참고하세요!










