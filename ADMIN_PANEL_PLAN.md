# 관리자 패널 개발 계획

## DB 선택: SQLite

### 선택 이유
1. **Node.js 서버에서 직접 사용 가능** - 외부 서비스 불필요
2. **설정 간단** - 파일 기반, 설치만 하면 됨
3. **성능 충분** - 관리자 기능에는 충분한 성능
4. **백업 용이** - 단일 파일로 백업 가능

### 대안 비교
- **Supabase**: 외부 서비스, 설정 복잡, 과금 가능
- **PostgreSQL**: 별도 서버 필요, 오버엔지니어링
- **파일 기반**: 웹 관리 어려움, 동시성 문제

## DB 스키마

### 1. profanity_words (비속어 필터)
```sql
CREATE TABLE profanity_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL, -- 'profanity' | 'job_discrimination'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. notices (공지)
```sql
CREATE TABLE notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    expiry_date DATE,
    schedule_times TEXT, -- JSON: ["09:00", "13:00", "20:00"]
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. notice_schedules (공지 스케줄 발송 기록)
```sql
CREATE TABLE notice_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id INTEGER NOT NULL,
    schedule_key TEXT NOT NULL, -- "YYYY-MM-DD_HH:MM"
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notice_id) REFERENCES notices(id)
);
```

### 4. filter_logs (필터 로그)
```sql
CREATE TABLE filter_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    reason TEXT NOT NULL,
    word TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5. warnings (경고 기록)
```sql
CREATE TABLE warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    last_warning_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender)
);
```

## API 엔드포인트

### 비속어 필터 관리
- `GET /api/admin/profanity` - 비속어 목록 조회
- `POST /api/admin/profanity` - 비속어 추가
- `DELETE /api/admin/profanity/:id` - 비속어 삭제
- `PUT /api/admin/profanity/:id` - 비속어 수정

### 공지 관리
- `GET /api/admin/notices` - 공지 목록 조회
- `POST /api/admin/notices` - 공지 추가
- `PUT /api/admin/notices/:id` - 공지 수정
- `DELETE /api/admin/notices/:id` - 공지 삭제

### 로그 조회
- `GET /api/admin/filter-logs` - 필터 로그 조회
- `GET /api/admin/warnings` - 경고 기록 조회

## 프론트엔드 구조

```
admin/
├── index.html          # 메인 페이지
├── css/
│   └── style.css      # 스타일
└── js/
    ├── app.js         # 메인 앱 로직
    ├── profanity.js   # 비속어 관리
    └── notices.js     # 공지 관리
```

## 인증

간단한 토큰 기반 인증:
- 환경 변수로 관리자 토큰 설정
- 헤더에 `Authorization: Bearer <token>` 전송





