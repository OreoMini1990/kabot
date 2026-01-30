# Vercel 네이버 OAuth API (MediFirst / kakkaobot 연동)

kakkaobot `!질문` 연동 링크(`NAVER_OAUTH_BASE_URL` + `/api/naver/oauth/start`)에서 사용하는 **네이버 OAuth 시작/콜백** API입니다.  
토큰은 **Supabase `naver_oauth_tokens`**에 저장하며, kakkaobot 서버와 동일 DB를 사용합니다.

---

## 1. Vercel 프로젝트에 추가하는 방법

**복사 출처**: kakkaobot `server/vercel-naver-oauth/` 폴더

| 복사할 파일 | 대상 경로 (Next.js 예) |
|------------|-------------------------|
| `start.js` | `pages/api/naver/oauth/start.js` |
| `callback.js` | `pages/api/naver/oauth/callback.js` |
| `_lib/state.js` | `pages/api/naver/oauth/_lib/state.js` |
| `_lib/db.js` | `pages/api/naver/oauth/_lib/db.js` |

### 1-1. Next.js (Pages Router) 사용 시

프로젝트 루트 기준으로 아래 구조가 되도록 복사합니다.

```
pages/
  api/
    naver/
      oauth/
        start.js      ← vercel-naver-oauth/start.js
        callback.js   ← vercel-naver-oauth/callback.js
        _lib/
          state.js    ← vercel-naver-oauth/_lib/state.js
          db.js       ← vercel-naver-oauth/_lib/db.js
```

- `_lib` 폴더 이름은 그대로 두세요. (API 라우트로 노출되지 않음)

### 1-2. Vercel Serverless (api 폴더) 사용 시

루트에 `api` 폴더가 있다면:

```
api/
  naver/
    oauth/
      start.js
      callback.js
      _lib/
        state.js
        db.js
```

`vercel-naver-oauth` 폴더의 `start.js`, `callback.js`, `_lib/state.js`, `_lib/db.js`를 위 경로에 맞게 복사합니다.

### 1-3. 패키지 의존성

Vercel 프로젝트에 **@supabase/supabase-js**가 있어야 합니다.

```bash
npm i @supabase/supabase-js
# 또는
pnpm add @supabase/supabase-js
```

---

## 2. 환경 변수 (Vercel)

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**에서 아래 변수를 추가합니다.

| 변수 | 설명 | 예시 |
|------|------|------|
| `NAVER_CLIENT_ID` | 네이버 앱 Client ID | (개발자센터에서 발급) |
| `NAVER_CLIENT_SECRET` | 네이버 앱 Client Secret | (개발자센터에서 발급) |
| `NAVER_REDIRECT_URI` | 콜백 URL (네이버 앱에 등록된 값과 동일) | `https://medifirstall.vercel.app/api/naver/oauth/callback` |
| `OAUTH_STATE_SECRET` | state HMAC용 비밀 (kakkaobot과 동일 권장) | 영문/숫자 임의 문자열 |
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 (또는 anon) | (Supabase 대시보드에서 확인) |

- `NAVER_REDIRECT_URI`를 넣지 않으면 `VERCEL_URL`로 `https://${VERCEL_URL}/api/naver/oauth/callback`를 사용합니다.  
  **네이버 개발자센터 앱의 Callback URL**에 이 주소를 반드시 등록해야 합니다.

---

## 3. API 동작 요약

### `GET /api/naver/oauth/start`

- **쿼리**: `user_id` (필수), `draft_id`, `user_name` (선택)
- **동작**: state 생성 후 네이버 OAuth authorize URL로 302 리다이렉트

### `GET /api/naver/oauth/callback`

- **쿼리**: `code`, `state` (네이버 redirect)
- **동작**: code → 토큰 교환 → `naver_oauth_tokens` 저장 → 연동 완료 HTML 응답

---

## 4. kakkaobot 쪽 설정

- `NAVER_OAUTH_BASE_URL`: `https://medifirstall.vercel.app`
- `NAVER_OAUTH_START_PATH`: `/api/naver/oauth/start`  
→ 연동 링크:  
`https://medifirstall.vercel.app/api/naver/oauth/start?user_id=...&draft_id=...&user_name=...`

---

## 5. DB 테이블

- **naver_oauth_tokens** (kakkaobot과 동일)
- `user_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, `is_active`, `user_name` 등  
- `server/db/migration_add_user_name_to_naver_tokens.sql` 적용 여부 확인.

---

## 6. 트러블슈팅

- **redirect_uri_mismatch**: 네이버 앱 Callback URL과 `NAVER_REDIRECT_URI`가 일치하는지 확인.
- **토큰 저장 실패**: Supabase `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, RLS 정책 확인.
- **state 검증 실패**: `OAUTH_STATE_SECRET`이 동일한지, 링크 재사용 없이 새로 열었는지 확인.
