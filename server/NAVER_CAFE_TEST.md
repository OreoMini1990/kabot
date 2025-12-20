# 네이버 카페 질문 기능 테스트 가이드

## 서버 재시작

설정 완료 후 서버를 재시작하세요:

```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는 직접 실행 시
cd server
npm start
```

## 테스트 방법

### 1. 기능 활성화 확인

서버 로그에서 다음 메시지를 확인하세요:
- `[DB] Supabase 클라이언트 초기화 완료`
- 환경변수 로드 확인 (오류가 없어야 함)

### 2. 카톡에서 질문 테스트

카카오톡 오픈채팅방에서 다음 명령어를 입력:

```
!질문 테스트 질문입니다,이것은 테스트 질문 내용입니다.
```

### 3. 예상 응답

**성공 시:**
```
✅ 질문 작성 완료!

Q. 테스트 질문입니다
이것은 테스트 질문 내용입니다.

답변하러가기: https://your-domain.com/go/abc123
```

**권한 없을 시:**
```
⏳ 카페 글쓰기 권한이 없어 질문이 임시 저장되었습니다.
관리자가 확인 후 작성해드리겠습니다.

Q. 테스트 질문입니다
이것은 테스트 질문 내용입니다.
```

**오류 시:**
```
❌ 질문 작성 중 오류가 발생했습니다.
오류 내용...
```

### 4. 서버 로그 확인

서버 로그에서 다음을 확인:

**정상 동작 시:**
```
[네이버 카페] 질문 DB 저장 완료: id=..., shortCode=...
[네이버 카페] 글쓰기 요청: clubid=..., menuid=..., 제목=...
[네이버 카페] 글쓰기 성공: articleId=..., articleUrl=...
```

**권한 없을 시:**
```
[네이버 카페] 글쓰기 실패: status=403, error=...
[네이버 카페] 권한 없음 - 질문 DB 저장: id=..., sender=...
```

### 5. DB 확인

Supabase 대시보드에서 다음 쿼리로 확인:

```sql
-- 최근 질문 조회
SELECT 
    id,
    kakao_sender_name,
    title,
    content,
    status,
    article_url,
    short_code,
    created_at
FROM naver_cafe_posts 
ORDER BY created_at DESC 
LIMIT 10;
```

### 6. 짧은 링크 테스트

브라우저에서 짧은 링크로 접근:
```
https://your-domain.com/go/{shortCode}
```

정상 동작 시 네이버 카페 글 페이지로 리다이렉트됩니다.

## 문제 해결

### 질문이 처리되지 않음

1. 환경변수 확인:
   ```bash
   # .env 파일 확인
   NAVER_CAFE_ENABLED=true
   NAVER_ACCESS_TOKEN=...
   NAVER_CAFE_CLUBID=...
   NAVER_CAFE_MENUID=...
   ```

2. 서버 로그 확인:
   - 오류 메시지 확인
   - 환경변수 로드 오류 확인

3. 기능 활성화 확인:
   - `CONFIG.FEATURES.NAVER_CAFE`가 `true`인지 확인

### 권한 오류 (403)

1. 네이버 OAuth 토큰 확인:
   - 토큰이 만료되었을 수 있습니다
   - 새 토큰을 발급받아 `.env` 파일 업데이트

2. 카페 권한 확인:
   - 해당 계정이 카페 글쓰기 권한이 있는지 확인
   - 카페 가입 여부 확인

### DB 오류

1. 테이블 생성 확인:
   ```sql
   SELECT * FROM naver_cafe_posts LIMIT 1;
   ```
   테이블이 없으면 `server/db/naver_cafe_posts.sql` 실행

2. Supabase 연결 확인:
   - `.env` 파일의 Supabase 설정 확인
   - 서버 로그에서 DB 연결 오류 확인

### 짧은 링크가 작동하지 않음

1. `PUBLIC_BASE_URL` 확인:
   - 외부에서 접근 가능한 URL인지 확인
   - `http://localhost`는 외부에서 접근 불가

2. 서버 로그 확인:
   - `/go/:code` 요청 로그 확인
   - DB 쿼리 오류 확인

## 다음 단계

1. 실제 질문 테스트
2. 짧은 링크 동작 확인
3. 권한 없을 때 DB 저장 확인
4. 관리자 페이지에서 저장된 질문 조회 (추후 구현 가능)










