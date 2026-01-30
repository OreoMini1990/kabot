# 프로젝트 구조

## 폴더 구조

```
kakkaobot/
├── server/                    # 서버 코드 (Node.js)
│   ├── server.js             # WebSocket 서버 + 복호화 로직
│   ├── labbot-node.js        # 봇 로직 (자동 응답)
│   └── package.json          # Node.js 의존성
│
├── client/                    # 클라이언트 코드 (Python)
│   ├── kakao_poller.py       # 카카오톡 DB 폴링 및 메시지 전송
│   ├── kakaodecrypt.py       # 복호화 로직 (Python)
│   ├── irispy.py             # Iris 클라이언트
│   └── requirements.txt      # Python 의존성
│
├── tests/                     # 테스트 스크립트
│   ├── test_real_messages.js # 실제 메시지 복호화 테스트 (JS)
│   └── test_decrypt_new.py   # 복호화 테스트 (Python)
│
├── config/                    # 설정 파일
│   └── ecosystem.config.js   # PM2 설정
│
├── .gitignore                 # Git 제외 파일
├── README.md                  # 프로젝트 소개
├── QUICKSTART.md             # 빠른 시작 가이드
├── VERSION.md                # 버전 정보
├── CHANGELOG.md              # 변경 이력
└── PROJECT_STRUCTURE.md      # 이 파일
```

## 파일 설명

### 서버 파일

- **server.js**: 
  - WebSocket 서버 구현
  - 카카오톡 메시지 복호화 로직
  - 로그 파일 자동 관리
  - HTTP API 엔드포인트

- **labbot-node.js**:
  - 봇 자동 응답 로직
  - 메시지 처리 및 명령어 처리

- **package.json**:
  - Node.js 의존성 관리
  - 실행 스크립트

### 클라이언트 파일

- **kakao_poller.py**:
  - 카카오톡 DB 폴링
  - WebSocket으로 서버에 메시지 전송
  - 자체 복호화 로직 포함

- **kakaodecrypt.py**:
  - 카카오톡 메시지 복호화 로직
  - PKCS12 키 생성
  - AES-256-CBC 복호화

- **irispy.py**:
  - Iris 클라이언트 구현
  - 서버와의 통신 처리

### 테스트 파일

- **test_real_messages.js**:
  - 실제 핸드폰 메시지로 복호화 테스트
  - JavaScript 구현 검증

- **test_decrypt_new.py**:
  - 복호화 로직 테스트
  - Python 구현 검증

## 데이터 흐름

```
카카오톡 DB → kakao_poller.py → WebSocket → server.js → 복호화 → labbot-node.js → 응답
```

## 버전 관리

Git을 사용하여 버전 관리:
- 초기 커밋: v1.0.0 (복호화 기능 완료)
- 롤백: `git checkout <commit-hash>`

## 의존성

### 서버 (Node.js)
- express: ^4.18.2
- ws: ^8.16.0
- axios: ^1.6.0

### 클라이언트 (Python)
- websocket-client: >=1.6.0
- pycryptodome: >=3.19.0





