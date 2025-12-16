# 네이버 OAuth 인증 가이드

## 중요: Access Token vs Client ID/Secret

### Access Token이란?

- **Access Token**: OAuth 2.0 인증 흐름을 통해 발급받는 **실제 API 호출에 사용하는 토큰**
- **Client ID**: 네이버 개발자센터에서 발급받는 **앱 식별자**
- **Client Secret**: 네이버 개발자센터에서 발급받는 **앱 비밀키**

### OAuth 2.0 인증 흐름

1. **Client ID/Secret으로 Authorization URL 생성**
2. **사용자가 네이버에 로그인하고 권한 승인**
3. **Authorization Code 발급**
4. **Authorization Code + Client ID/Secret으로 Access Token 교환**
5. **Access Token으로 API 호출**

## 현재 문제

현재 코드는 `NAVER_ACCESS_TOKEN` 환경변수를 직접 사용하고 있습니다. 이는:
- ✅ 수동으로 토큰을 발급받아 설정한 경우 작동
- ❌ 토큰 만료 시 자동 갱신 불가
- ❌ 권한 검증 없음

## 해결 방법

### 방법 1: 수동 토큰 발급 (현재 방식, 빠른 테스트용)

1. **네이버 개발자센터에서 OAuth 인증 URL 생성**
   ```
   https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&state=STATE_STRING
   ```

2. **브라우저에서 위 URL 접속**
   - 네이버 로그인
   - 권한 승인
   - Redirect URI로 리다이렉트되며 `code` 파라미터 확인

3. **Authorization Code를 Access Token으로 교환**
   ```bash
   curl -X POST "https://nid.naver.com/oauth2.0/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "redirect_uri=YOUR_REDIRECT_URI" \
     -d "code=AUTHORIZATION_CODE"
   ```

4. **응답에서 `access_token` 추출하여 `.env`에 설정**
   ```env
   NAVER_ACCESS_TOKEN=발급받은_access_token
   ```

### 방법 2: 자동 토큰 갱신 구현 (권장, 추후 구현)

`server/integrations/naverCafe/naverOAuth.js` 파일을 사용하여:
- 토큰 만료 시 자동 갱신
- Refresh Token 사용
- 토큰 유효성 검증

## 환경변수 설정

`.env` 파일에 다음을 추가:

```env
# 네이버 OAuth 설정
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
NAVER_REDIRECT_URI=https://your-domain.com/naver/callback

# Access Token (수동 발급 또는 자동 갱신)
NAVER_ACCESS_TOKEN=your_access_token

# Refresh Token (자동 갱신용, 선택사항)
NAVER_REFRESH_TOKEN=your_refresh_token
```

## 빠른 테스트용 토큰 발급

### 1. 네이버 개발자센터에서 Client ID/Secret 확인

1. [네이버 개발자센터](https://developers.naver.com/) 접속
2. 내 애플리케이션 → 해당 앱 선택
3. **Client ID**와 **Client Secret** 확인

### 2. OAuth 인증 URL 생성

브라우저에서 다음 URL 접속 (YOUR_CLIENT_ID와 YOUR_REDIRECT_URI를 실제 값으로 변경):

```
https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&state=test
```

### 3. Authorization Code 확인

리다이렉트된 URL에서 `code` 파라미터 확인:
```
https://your-redirect-uri?code=AUTHORIZATION_CODE&state=test
```

### 4. Access Token 발급

터미널에서:
```bash
curl -X POST "https://nid.naver.com/oauth2.0/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=YOUR_REDIRECT_URI" \
  -d "code=AUTHORIZATION_CODE"
```

응답 예시:
```json
{
  "access_token": "AAAAQ...",
  "refresh_token": "BBBBQ...",
  "token_type": "bearer",
  "expires_in": "3600"
}
```

### 5. .env 파일 업데이트

```env
NAVER_ACCESS_TOKEN=AAAAQ...
NAVER_REFRESH_TOKEN=BBBBQ...  # 선택사항
```

## 토큰 만료 확인

Access Token은 보통 1시간 후 만료됩니다. 만료되면:
- 401 Unauthorized 에러 발생
- Refresh Token으로 새 Access Token 발급 필요

## 참고 자료

- [네이버 OAuth 2.0 문서](https://developers.naver.com/docs/login/overview/)
- [네이버 카페 API 문서](https://developers.naver.com/docs/login/cafe-api/cafe-api.md)



