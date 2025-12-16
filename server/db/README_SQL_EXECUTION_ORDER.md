# SQL 스키마 실행 순서 가이드

## ⚠️ 중요: 실행 순서를 반드시 지켜야 합니다

SQL 스키마 파일들은 서로 의존성이 있으므로 **반드시 다음 순서대로 실행**해야 합니다.

---

## 📋 실행 순서

### 1단계: `chat_logs_schema.sql` (필수, 먼저 실행)

**실행 시간**: 약 1-2분

**포함 내용**:
- `set_updated_at()` 함수 생성
- `users`, `rooms`, `room_members` 테이블 생성
- `chat_messages` 테이블 생성 (다른 스키마에서 참조됨)
- `chat_reactions`, `user_statistics` 등 모든 기본 테이블 생성
- 모든 인덱스 및 트리거 생성

**중요**: 이 파일을 먼저 실행하지 않으면 다른 스키마 파일들이 실패합니다.

---

### 2단계: `reports_schema.sql` (필수)

**실행 시간**: 약 30초

**의존성**: `chat_logs_schema.sql`의 `chat_messages` 테이블 필요

**포함 내용**:
- `reports` 테이블 생성
- 인덱스 및 트리거 생성

**오류 발생 시**: `chat_logs_schema.sql`이 먼저 실행되었는지 확인하세요.

---

### 3단계: `chat_logs_aggregation.sql` (선택사항)

**실행 시간**: 약 30초

**의존성**: `chat_logs_schema.sql`의 모든 테이블 필요

**포함 내용**:
- 통계 집계 함수 생성

---

### 4단계: `chat_logs_search.sql` (선택사항)

**실행 시간**: 약 30초

**의존성**: `chat_logs_schema.sql`의 `chat_messages` 테이블 필요

**포함 내용**:
- 검색 함수 생성

---

## 🚨 자주 발생하는 오류

### 오류 1: `relation "public.chat_messages" does not exist`

**원인**: `reports_schema.sql`을 `chat_logs_schema.sql`보다 먼저 실행함

**해결**:
1. `chat_logs_schema.sql`을 먼저 실행
2. 실행이 완료되었는지 확인
3. 그 다음 `reports_schema.sql` 실행

---

### 오류 2: `text search configuration "korean" does not exist`

**원인**: PostgreSQL에 한국어 텍스트 검색 설정이 없음

**해결**: 이미 수정됨 - `chat_logs_schema.sql`에서 `'korean'`을 `'simple'`로 변경

**참고**: `'simple'` 설정은 한국어를 포함한 모든 언어를 검색할 수 있습니다.

---

## ✅ 실행 확인 방법

각 스키마 실행 후 다음을 확인하세요:

1. **Supabase Table Editor**에서 테이블 목록 확인
   - `chat_logs_schema.sql` 실행 후: `users`, `rooms`, `chat_messages` 등 확인
   - `reports_schema.sql` 실행 후: `reports` 테이블 확인

2. **오류 메시지 확인**
   - 오류가 없으면 성공적으로 실행된 것입니다
   - 오류가 있으면 위의 "자주 발생하는 오류" 섹션 참고

---

## 📝 실행 예시

```sql
-- 1단계: 기본 스키마 실행
-- Supabase SQL Editor에서 chat_logs_schema.sql 내용 복사 후 실행

-- 2단계: 신고 스키마 실행
-- Supabase SQL Editor에서 reports_schema.sql 내용 복사 후 실행

-- 3단계: (선택) 집계 함수 실행
-- Supabase SQL Editor에서 chat_logs_aggregation.sql 내용 복사 후 실행

-- 4단계: (선택) 검색 함수 실행
-- Supabase SQL Editor에서 chat_logs_search.sql 내용 복사 후 실행
```

---

## 🔄 재실행 시 주의사항

이미 테이블이 존재하는 경우:
- `CREATE TABLE IF NOT EXISTS` 구문을 사용하므로 안전하게 재실행 가능
- 하지만 데이터가 이미 있다면 주의해서 실행하세요

트리거 재생성:
- `DROP TRIGGER IF EXISTS` 구문을 사용하므로 안전하게 재실행 가능

---

## 📞 문제 해결

위의 가이드로 해결되지 않으면:
1. Supabase 로그 확인
2. 각 SQL 파일의 오류 메시지 확인
3. 실행 순서 재확인

