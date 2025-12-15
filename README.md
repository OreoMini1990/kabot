# KakaoBot

카카오톡 자동 응답 봇 시스템

## 프로젝트 구조

```
kakkaobot/
├── server/          # 서버 코드 (Node.js)
│   ├── server.js    # WebSocket 서버 + 복호화 로직
│   ├── labbot-node.js  # 봇 로직
│   └── package.json    # Node.js 의존성
├── client/          # 클라이언트 코드 (Python)
│   ├── kakao_poller.py   # 카카오톡 DB 폴링
│   ├── kakaodecrypt.py   # 복호화 로직
│   └── irispy.py         # Iris 클라이언트
├── tests/           # 테스트 스크립트
│   ├── test_real_messages.js
│   └── test_decrypt_new.py
└── config/          # 설정 파일
    └── ecosystem.config.js  # PM2 설정
```

## 주요 기능

- 카카오톡 메시지 복호화 (AES-256-CBC)
- WebSocket 기반 실시간 메시지 처리
- 자동 응답 봇 시스템
- 로그 파일 자동 관리 (최근 10개)

## 설치 및 실행

### 서버 실행

```bash
cd server
npm install
npm start
```

또는 PM2 사용:

```bash
pm2 start ../config/ecosystem.config.js
```

### 클라이언트 실행

```bash
cd client
python kakao_poller.py
```

## 환경 변수

- `PORT`: 서버 포트 (기본값: 5002)
- `BOT_ID`: 봇 ID (기본값: iris-core)

## 버전 정보

- 현재 버전: v1.0.0
- 복호화 로직: Python 코드와 동일하게 구현 완료
- 테스트 상태: 실제 메시지 복호화 성공 확인

