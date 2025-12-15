# 빠른 시작 가이드

## 1️⃣ Supabase 스키마 생성 (1분)

1. Supabase 대시보드 → SQL Editor
2. `server/db/supabase_migration.sql` 파일 내용 복사 & 붙여넣기
3. Run 클릭

## 2️⃣ 의존성 설치 (1분)

```bash
cd server
npm install
```

## 3️⃣ 서버 실행

```bash
npm start
```

## ✅ 확인 사항

- 콘솔에 `[DB] 데이터베이스 연결 성공` 메시지 확인
- `http://localhost:5002/health` 접속하여 `{"ok":true}` 확인

## ❓ 문제 발생 시

1. `.env` 파일의 Supabase 설정 확인
2. Supabase Table Editor에서 테이블 생성 여부 확인
3. Node.js 버전 확인 (18 이상 필요)

