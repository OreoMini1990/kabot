# 빠른 시작 가이드

## 서버 실행

```bash
cd server
npm install
npm start
```

또는 PM2 사용:

```bash
cd config
pm2 start ecosystem.config.js
pm2 logs kakkaobot-server
```

## 클라이언트 실행

```bash
cd client
pip install -r requirements.txt
python kakao_poller.py
```

## 테스트

### 복호화 테스트

```bash
cd tests
node test_real_messages.js
```

또는 Python:

```bash
cd tests
python test_decrypt_new.py
```

## 환경 변수

서버 실행 시 다음 환경 변수를 설정할 수 있습니다:

- `PORT`: 서버 포트 (기본값: 5002)
- `BOT_ID`: 봇 ID (기본값: iris-core)
- `LOG_DIR`: 로그 저장 디렉토리 (기본값: /home/app/iris-core)

## 문제 해결

### 복호화 실패 시

1. `userId`가 올바른지 확인
2. `encType`이 올바른지 확인 (일반적으로 31)
3. 테스트 스크립트로 로컬에서 먼저 확인

### 서버 연결 실패 시

1. 서버가 실행 중인지 확인
2. 포트가 올바른지 확인
3. 방화벽 설정 확인

