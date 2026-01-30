# 관리자 패널 사용 가이드

## 시작하기

### 1. 의존성 설치
```bash
cd server
npm install
```

### 2. 환경 변수 설정
`.env` 파일 생성 (선택사항):
```
ADMIN_TOKEN=your-secure-admin-token-here
```

또는 환경 변수로 설정:
```bash
export ADMIN_TOKEN=your-secure-admin-token-here
```

기본값: `default-admin-token-change-me` (보안을 위해 반드시 변경하세요!)

### 3. 서버 시작
```bash
npm start
```

### 4. 관리자 패널 접속
브라우저에서 `http://localhost:5002/admin` 접속

## 기능

### 비속어 필터 관리
- 비속어 단어 추가/수정/삭제
- 타직업 비하 표현 추가/수정/삭제
- 실시간 필터링 적용

### 공지 관리
- 공지 내용 추가/수정/삭제
- 만료일 설정
- 스케줄 시간 설정 (예: 09:00,13:00,20:00)
- 활성화/비활성화

### 로그 조회
- 필터 로그 조회 (비속어 사용 기록)
- 경고 기록 조회

## API 엔드포인트

모든 API는 `/api/admin` 경로로 시작하며, `Authorization: Bearer <token>` 헤더가 필요합니다.

### 비속어 필터
- `GET /api/admin/profanity` - 목록 조회
- `GET /api/admin/profanity?type=profanity` - 비속어만 조회
- `GET /api/admin/profanity?type=job_discrimination` - 타직업 비하만 조회
- `POST /api/admin/profanity` - 추가
- `PUT /api/admin/profanity/:id` - 수정
- `DELETE /api/admin/profanity/:id` - 삭제

### 공지 관리
- `GET /api/admin/notices` - 목록 조회
- `POST /api/admin/notices` - 추가
- `PUT /api/admin/notices/:id` - 수정
- `DELETE /api/admin/notices/:id` - 삭제

### 로그 조회
- `GET /api/admin/filter-logs?limit=100&offset=0` - 필터 로그 조회
- `GET /api/admin/warnings` - 경고 기록 조회

## 데이터베이스

SQLite 데이터베이스는 `server/data/kakkaobot.db`에 저장됩니다.

백업:
```bash
cp server/data/kakkaobot.db server/data/kakkaobot.db.backup
```

복원:
```bash
cp server/data/kakkaobot.db.backup server/data/kakkaobot.db
```





