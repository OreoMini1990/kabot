# 네이버 카페 질문 기능 설정 가이드

## 개요

카카오톡에서 `!질문 제목,내용` 형식으로 메시지를 보내면 네이버 카페에 자동으로 질문 글을 작성하는 기능입니다.

## 설정 단계

### 1. DB 테이블 생성

Supabase 대시보드에서 `server/db/naver_cafe_posts.sql` 파일의 SQL을 실행하여 테이블을 생성합니다.

```sql
-- PostgreSQL/Supabase용
-- server/db/naver_cafe_posts.sql 파일 참고
```

### 2. 네이버 개발자센터 앱 등록

1. [네이버 개발자센터](https://developers.naver.com/) 접속
2. "Application" → "애플리케이션 등록"
3. 애플리케이션 정보 입력:
   - 애플리케이션 이름: 원하는 이름
   - 사용 API: "카페 API" 선택
   - 로그인 오픈 API 서비스 환경: 서비스 URL 입력 (예: `https://your-domain.com`)
   - 로그인 오픈 API 서비스 환경: Callback URL 입력
4. 등록 완료 후 **Client ID**와 **Client Secret** 확인

### 3. 네이버 OAuth 토큰 발급

네이버 카페 글쓰기 API는 OAuth 2.0 인증이 필요합니다.

#### 방법 1: 수동 토큰 발급 (초기 설정)

1. [네이버 개발자센터 OAuth 테스트](https://developers.naver.com/apps/#/register) 사용
2. 또는 Postman/curl로 OAuth 인증 흐름 진행
3. 발급받은 Access Token을 `.env` 파일에 추가

#### 방법 2: 자동 토큰 갱신 (추후 구현)

OAuth 토큰 갱신 로직을 추가하여 자동으로 토큰을 갱신할 수 있습니다.

### 4. 카페 정보 확인

#### clubid (카페 ID) 확인

1. 네이버 카페 관리 페이지 접속
2. URL에서 `clubid=` 파라미터 확인
   - 예: `https://cafe.naver.com/ca-fe/cafes/{clubid}/manage`
   - 또는 카페 홈 URL에서 확인

#### menuid (게시판 메뉴 ID) 확인

1. 글을 작성할 게시판으로 이동
2. URL에서 `menuid=` 파라미터 확인
   - 예: `https://cafe.naver.com/myCafe?iframe_url=/ArticleList.nhn?clubid=12345678&menuid=123`

### 5. 환경변수 설정

`.env` 파일에 다음 환경변수를 추가합니다:

```env
# 네이버 카페 질문 기능 활성화
NAVER_CAFE_ENABLED=true

# 네이버 OAuth 토큰 (Access Token)
NAVER_ACCESS_TOKEN=YOUR_ACCESS_TOKEN_HERE

# 네이버 카페 정보
NAVER_CAFE_CLUBID=12345678
NAVER_CAFE_MENUID=123
NAVER_CAFE_CAFEURL=mycafe  # 선택사항

# 짧은 링크용 공개 URL
PUBLIC_BASE_URL=https://your-domain.com
# 또는
PUBLIC_BASE_URL=http://211.218.42.222:5002
```

### 6. 패키지 설치 확인

필요한 패키지가 설치되어 있는지 확인:

```bash
cd server
npm install iconv-lite uuid
```

이미 설치되어 있으면 스킵해도 됩니다.

### 7. 서버 재시작

설정 완료 후 서버를 재시작합니다:

```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는 직접 실행 시
npm start
```

## 사용 방법

### 카카오톡에서 질문 작성

```
!질문 제목,내용
```

**예시:**
```
!질문 의사 선생님께 질문,증상이 있는데 병원을 가야 할까요?
```

### 응답 형식

**성공 시:**
```
✅ 질문 작성 완료!

Q. 제목
내용

답변하러가기: https://your-domain.com/go/abc123
```

**권한 없을 시:**
```
⏳ 카페 글쓰기 권한이 없어 질문이 임시 저장되었습니다.
관리자가 확인 후 작성해드리겠습니다.

Q. 제목
내용
```

**오류 시:**
```
❌ 질문 작성 중 오류가 발생했습니다.
오류 내용...

다시 시도해주시거나 관리자에게 문의해주세요.
```

## 데이터베이스 확인

### 저장된 질문 조회

Supabase 대시보드 또는 SQL로 확인:

```sql
-- 최근 질문 조회
SELECT * FROM naver_cafe_posts 
ORDER BY created_at DESC 
LIMIT 10;

-- 권한 없이 저장된 질문 조회
SELECT * FROM naver_cafe_posts 
WHERE status = 'no_permission'
ORDER BY created_at DESC;

-- 성공한 질문 조회
SELECT * FROM naver_cafe_posts 
WHERE status = 'created'
ORDER BY created_at DESC;
```

## 문제 해결

### 1. "네이버 카페 질문 기능이 현재 비활성화되어 있습니다"

`.env` 파일에서 `NAVER_CAFE_ENABLED=true`로 설정하고 서버를 재시작하세요.

### 2. "카페 글쓰기 권한이 없습니다"

- 네이버 OAuth 토큰이 만료되었을 수 있습니다. 새 토큰을 발급받아 `.env` 파일을 업데이트하세요.
- 해당 카페에서 글쓰기 권한이 없는 계정일 수 있습니다.

### 3. "네이버 카페 설정 오류가 발생했습니다"

`.env` 파일에 다음 값들이 모두 설정되어 있는지 확인:
- `NAVER_ACCESS_TOKEN`
- `NAVER_CAFE_CLUBID`
- `NAVER_CAFE_MENUID`

### 4. 짧은 링크가 작동하지 않습니다

`PUBLIC_BASE_URL` 환경변수가 올바르게 설정되어 있는지 확인하세요.
외부에서 접근 가능한 URL이어야 합니다 (예: `https://your-domain.com` 또는 `http://211.218.42.222:5002`).

## 참고 자료

- [네이버 카페 API 문서](https://developers.naver.com/docs/login/cafe-api/cafe-api.md)
- [네이버 OAuth 2.0 문서](https://developers.naver.com/docs/login/overview/)



