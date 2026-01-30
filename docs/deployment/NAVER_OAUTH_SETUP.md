# 네이버 OAuth 연동 설정 가이드

## 환경변수 설정

다음 환경변수를 설정해야 합니다:

```bash
# 네이버 OAuth 설정
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
NAVER_REDIRECT_URI=https://your-domain.com/auth/naver/callback
OAUTH_STATE_SECRET=your-random-secret-key-change-in-production

# 서버 URL (연동 링크 생성용)
SERVER_URL=https://your-domain.com
# 또는
SERVER_HOST=your-domain.com
PORT=5002

# 네이버 카페 설정 (기존)
NAVER_CAFE_ENABLED=true
NAVER_CAFE_CLUBID=your_club_id
NAVER_CAFE_MENUID=your_menu_id
```

## 네이버 개발자 센터 설정

1. **애플리케이션 등록**
   - https://developers.naver.com/apps/#/register
   - 서비스 URL: `https://your-domain.com`
   - Callback URL: `https://your-domain.com/auth/naver/callback`

2. **API 권한 설정**
   - 카페 글쓰기 권한 활성화
   - Scope: `cafe_write`

## DB 마이그레이션

`server/db/chat_logs_schema.sql` 파일의 다음 부분을 Supabase에서 실행:

```sql
-- naver_oauth_tokens 테이블
-- cafe_post_drafts 테이블
```

## 테스트 시나리오

1. **신규 사용자**
   - `!질문 제목,내용` 입력
   - 연동 링크 제공 확인
   - 링크 클릭 → 네이버 로그인 → 콜백 완료
   - 다시 `!질문 제목,내용` 입력 → 자동 게시 확인

2. **기존 사용자**
   - 토큰이 있는 경우 즉시 게시 확인

3. **토큰 만료**
   - 만료 임박 시 자동 refresh 확인
   - refresh 실패 시 재연동 링크 제공 확인

## 주의사항

- **암호화 미적용**: 토큰은 평문으로 저장됩니다 (요구사항)
- **연동 해제 기능 없음**: 요구사항에 따라 구현하지 않음
- **Draft TTL**: 2시간 (만료 후 자동 삭제)



