# 관리자 패널 구현 완료 요약

## 완료된 작업

### 1. 불필요한 문서 정리 ✅
- 20개의 오래된 문서를 `docs/archive/`로 이동
- 현재 유지되는 문서만 루트에 유지

### 2. DB 설계 및 구현 ✅
- **선택한 DB**: SQLite (`better-sqlite3`)
- **이유**: Node.js 서버에서 직접 사용 가능, 설정 간단, 성능 충분
- **위치**: `server/data/kakkaobot.db`
- **스키마**: `server/db/schema.sql`

### 3. 비속어 필터링 기능 (DB 기반) ✅
- DB에서 비속어 목록 동적 로드
- 비속어/타직업 비하 표현 분리 관리
- 필터 로그 DB 저장
- 경고 기록 DB 저장

### 4. 공지 스케줄링 기능 (DB 기반) ✅
- 공지 내용 DB 저장
- 만료일 설정 지원
- 스케줄 시간 설정 지원 (예: 09:00,13:00,20:00)
- 활성화/비활성화 지원
- 발송 기록 DB 저장

### 5. 백엔드 API 구현 ✅
- **위치**: `server/api/admin.js`
- **인증**: Bearer Token 기반
- **엔드포인트**:
  - `GET /api/admin/profanity` - 비속어 목록 조회
  - `POST /api/admin/profanity` - 비속어 추가
  - `PUT /api/admin/profanity/:id` - 비속어 수정
  - `DELETE /api/admin/profanity/:id` - 비속어 삭제
  - `GET /api/admin/notices` - 공지 목록 조회
  - `POST /api/admin/notices` - 공지 추가
  - `PUT /api/admin/notices/:id` - 공지 수정
  - `DELETE /api/admin/notices/:id` - 공지 삭제
  - `GET /api/admin/filter-logs` - 필터 로그 조회
  - `GET /api/admin/warnings` - 경고 기록 조회

### 6. 프론트엔드 구현 ✅
- **위치**: `admin/`
- **구조**:
  - `index.html` - 메인 페이지
  - `css/style.css` - 스타일
  - `js/app.js` - JavaScript 로직
- **기능**:
  - 비속어 필터 관리 (추가/수정/삭제)
  - 공지 관리 (추가/수정/삭제)
  - 로그 조회 (필터 로그, 경고 기록)

## 설치 및 실행

### 1. 의존성 설치
```bash
cd server
npm install
```

### 2. 환경 변수 설정 (선택사항)
`.env` 파일 생성:
```
ADMIN_TOKEN=your-secure-admin-token-here
```

또는 환경 변수:
```bash
export ADMIN_TOKEN=your-secure-admin-token-here
```

기본값: `default-admin-token-change-me` (보안을 위해 반드시 변경!)

### 3. 서버 시작
```bash
npm start
```

### 4. 관리자 패널 접속
브라우저에서 `http://localhost:5002/admin` 접속

## DB 스키마

### profanity_words (비속어 필터)
- `id` - 기본 키
- `word` - 단어 (UNIQUE)
- `type` - 타입 ('profanity' | 'job_discrimination')
- `created_at`, `updated_at` - 타임스탬프

### notices (공지)
- `id` - 기본 키
- `content` - 공지 내용
- `expiry_date` - 만료일 (DATE)
- `schedule_times` - 스케줄 시간 (JSON 배열)
- `enabled` - 활성화 여부
- `created_at`, `updated_at` - 타임스탬프

### notice_schedules (공지 스케줄 발송 기록)
- `id` - 기본 키
- `notice_id` - 공지 ID (외래 키)
- `schedule_key` - 스케줄 키 ("YYYY-MM-DD_HH:MM")
- `sent_at` - 발송 시간

### filter_logs (필터 로그)
- `id` - 기본 키
- `sender` - 발신자
- `message` - 메시지 내용
- `reason` - 차단 사유
- `word` - 차단된 단어
- `created_at` - 생성 시간

### warnings (경고 기록)
- `id` - 기본 키
- `sender` - 발신자 (UNIQUE)
- `count` - 경고 횟수
- `last_warning_at` - 마지막 경고 시간
- `updated_at` - 업데이트 시간

## 주요 변경 사항

### labbot-node.js
- `PROFANITY_FILTER.check()` - DB에서 비속어 목록 동적 로드
- `PROFANITY_FILTER.log()` - DB에 필터 로그 저장
- `PROFANITY_FILTER.addWarning()` - DB에 경고 기록 저장
- `PROFANITY_FILTER.getWarningCount()` - DB에서 경고 횟수 조회
- `NOTICE_SYSTEM.shouldSendScheduledNotice()` - DB에서 공지 조회 및 스케줄 체크
- `NOTICE_SYSTEM.getNotice()` - DB에서 공지 조회

### server.js
- 관리자 API 라우터 추가 (`/api/admin`)
- 정적 파일 서빙 추가 (`/admin`)

## 다음 단계

1. **의존성 설치**: `npm install`
2. **서버 재시작**: `npm start`
3. **관리자 패널 접속**: `http://localhost:5002/admin`
4. **토큰 설정**: 환경 변수 또는 `.env` 파일에 `ADMIN_TOKEN` 설정
5. **테스트**: 비속어 추가/수정/삭제, 공지 추가/수정/삭제 테스트

