# dotenv 오류 해결 가이드

## 🔴 현재 오류
```
Error: Cannot find module 'dotenv/config'
```

## 원인
`dotenv` 패키지가 설치되지 않았거나, `node_modules`가 없는 상태입니다.

## ✅ 해결 방법

### 방법 1: 의존성 설치 (권장)

```bash
# server 디렉토리로 이동
cd /home/app/iris-core/server

# 의존성 설치
npm install

# 설치 확인
ls -la node_modules/dotenv
```

설치 후:
```bash
# PM2 재시작
cd /home/app/iris-core
pm2 delete kakkaobot-server
pm2 start config/ecosystem.config.js
pm2 status
```

### 방법 2: PM2 설정 수정 (이미 적용됨)

PM2 설정에서 `interpreter_args: '-r dotenv/config'`를 제거했습니다.
이미 `server.js`와 `database.js`에서 `require('dotenv').config()`를 사용하고 있으므로
`-r dotenv/config` 플래그는 필요하지 않습니다.

---

## 🚀 빠른 해결 (순서대로 실행)

```bash
# 1. server 디렉토리로 이동
cd /home/app/iris-core/server

# 2. 의존성 설치 (가장 중요!)
npm install

# 3. 설치 확인
ls -la node_modules | head -10

# 4. dotenv 설치 확인
ls -la node_modules/dotenv

# 5. PM2 재시작
cd /home/app/iris-core
pm2 delete kakkaobot-server
pm2 start config/ecosystem.config.js

# 6. 상태 확인
pm2 status
pm2 logs kakkaobot-server --lines 20
```

---

## 📋 체크리스트

- [ ] `cd /home/app/iris-core/server` 실행
- [ ] `npm install` 실행 (의존성 설치)
- [ ] `node_modules` 폴더가 생성되었는지 확인
- [ ] PM2 프로세스 삭제 후 재시작
- [ ] `pm2 status`에서 상태가 `online`인지 확인

---

## ⚠️ 주의사항

1. **반드시 `server` 디렉토리에서 `npm install` 실행**
   ```bash
   cd /home/app/iris-core/server
   npm install
   ```

2. **설치된 패키지 확인**
   - `express`
   - `ws`
   - `axios`
   - `@supabase/supabase-js`
   - `dotenv` ← 이게 있어야 함!

3. **설치 후 PM2 재시작 필수**
   ```bash
   pm2 delete kakkaobot-server
   pm2 start config/ecosystem.config.js
   ```

---

## 💡 추가 확인

### package.json 확인
```bash
cat /home/app/iris-core/server/package.json | grep dotenv
```

출력이 있어야 합니다:
```json
"dotenv": "^16.3.1"
```

### 직접 실행 테스트
```bash
cd /home/app/iris-core/server
node server.js
```

오류 없이 실행되면 성공!

