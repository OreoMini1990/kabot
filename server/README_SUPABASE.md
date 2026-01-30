# Supabase 설정 가이드

이 프로젝트는 Supabase를 데이터베이스로 사용합니다.

## 설정 방법

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에서 계정 생성 및 프로젝트 생성
2. 프로젝트 설정에서 다음 정보 확인:
   - Project URL
   - API Keys (anon key, service_role key)

### 2. 데이터베이스 스키마 생성

1. Supabase 대시보드에서 SQL Editor 열기
2. `server/db/supabase_migration.sql` 파일의 내용을 복사하여 실행
3. 테이블 및 초기 데이터가 생성됨

### 3. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 입력:

```env
# 서버 설정
PORT=5002
BOT_ID=iris-core
SERVER_URL=http://localhost:5002

# 관리자 인증
ADMIN_TOKEN=your-secure-admin-token

# Supabase 설정
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**중요**: 
- `SUPABASE_URL`: Supabase 프로젝트의 URL
- `SUPABASE_ANON_KEY`: 공개 API 키 (클라이언트용)
- `SUPABASE_SERVICE_ROLE_KEY`: 서비스 역할 키 (서버용, 모든 권한)
- `.env` 파일은 `.gitignore`에 포함되어 있으므로 커밋되지 않습니다.

### 4. 의존성 설치

```bash
cd server
npm install
```

### 5. 서버 실행

```bash
npm start
```

## 주의사항

1. **보안**: `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용해야 하며, 클라이언트에 노출되어서는 안 됩니다.
2. **RLS (Row Level Security)**: Supabase의 RLS 정책을 설정하지 않으면 모든 데이터에 접근할 수 있습니다. 프로덕션 환경에서는 적절한 RLS 정책을 설정하세요.
3. **연결 풀링**: Supabase는 연결 풀링을 자동으로 관리하므로 별도의 연결 관리가 필요하지 않습니다.

## 문제 해결

### 데이터베이스 연결 오류

- `.env` 파일이 올바른 위치에 있는지 확인
- Supabase URL과 키가 정확한지 확인
- Supabase 프로젝트가 활성 상태인지 확인

### 테이블이 없다는 오류

- `server/db/supabase_migration.sql` 파일을 Supabase SQL Editor에서 실행했는지 확인

### 쿼리 오류

- 복잡한 SQL 쿼리는 지원하지 않을 수 있습니다. 간단한 SELECT, INSERT, UPDATE, DELETE만 지원합니다.
- WHERE 절의 복잡한 조건은 지원하지 않을 수 있습니다.



















