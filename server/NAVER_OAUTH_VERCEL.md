# 네이버 OAuth · Vercel 연동 및 토큰 안내

## 0. **확실한 방법: `naver-oauth-app` (별도 앱)**

MediFirst 홈·미들웨어·로그인과 **완전 분리**된 OAuth 전용 앱. 로그인 리다이렉트 **원천 제거**.

- **폴더**: `naver-oauth-app/` (프로젝트 루트)
- **API**: `GET /api/start`, `GET /api/callback` 만 존재. 미들웨어·proxy·로그인 페이지 없음.
- **배포**: Vercel **새 프로젝트** 생성 → Root Directory = `naver-oauth-app` 연결.
- **kakkaobot**:  
  - `NAVER_OAUTH_BASE_URL` = `https://<naver-oauth-app배포도메인>`  
  - `NAVER_OAUTH_START_PATH` = **`/api/start`**
- **네이버 앱** Callback URL: `https://<naver-oauth-app배포도메인>/api/callback`
- **상세**: `naver-oauth-app/README.md` 참고.

---

## 1. OAuth 연동 URL (Vercel 등 외부 인증)

외부 포트를 열 수 없는 환경에서는 **OAuth 시작/콜백**을 Vercel 등 공개 URL에서 처리하고, **토큰만 Supabase**에 저장합니다.

### 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `NAVER_OAUTH_BASE_URL` | OAuth **시작** URL 베이스 | `https://<naver-oauth-app도메인>` 또는 `https://medifirstall.vercel.app` |
| `NAVER_OAUTH_START_PATH` | OAuth 시작 경로 | **`/api/start`** (naver-oauth-app) 또는 `/oauth/naver/start` (MediFirst) |

연동 링크:  
`{NAVER_OAUTH_BASE_URL}{NAVER_OAUTH_START_PATH}?user_id=...&draft_id=...&user_name=...`

- `user_id`: 카카오 채팅 사용자 ID (필수)
- `draft_id`: 미연동 시 저장한 질문 draft ID (선택)
- `user_name`: 채팅 닉네임 (선택, `naver_oauth_tokens.user_name` 저장용)

### 토큰 조회 및 연동 주체

- **토큰 조회/사용**: `user_id` 기준. `user_name`은 연동 표시용이며, 조회 키는 `user_id`만 사용합니다.
- **처음 !질문 시**: 토큰 없으면 위 연동 링크를 봇이 안내하고, 사용자가 링크 접속 → 네이버 로그인 → 콜백에서 토큰 저장 후 사용됩니다.

---

## 2. 토큰 한 번 발급 후 계속 쓰기 (자동 갱신)

- **access_token**: 약 1시간 만료.  
- **refresh_token**: 장기 유효. 이걸로 access_token을 갱신합니다.

동작 방식:

1. `getValidNaverAccessToken(userId)` 호출 시 DB에서 해당 `user_id`의 토큰 조회.
2. `expires_at`이 **만료 임박(5분 이내)**이면 **refresh_token**으로 Naver에 갱신 요청.
3. 새 access_token / refresh_token으로 DB 업데이트 후 사용.

따라서 **한 번 OAuth 연동 후에는 사용자가 다시 로그인할 필요 없이** 토큰이 자동 갱신됩니다.  
재연동이 필요한 경우는 **refresh_token 만료/폐기** 시에만 해당됩니다.

---

## 3. `naver_oauth_tokens` 연동 (user_id / user_name)

- **user_id**: 카카오 채팅 사용자 식별자. 토큰 조회·연동의 기준.
- **user_name**: 채팅 닉네임. 연동 표시용으로 저장(선택).

OAuth 링크에 `user_name`을 넘기면, 콜백에서 토큰 저장 시 `user_name`도 함께 DB에 넣을 수 있습니다.  
`user_name` 컬럼 추가는 `server/db/migration_add_user_name_to_naver_tokens.sql` 참고.

---

## 4. Vercel에서 OAuth 처리 시 체크리스트

**naver-oauth-app 사용 시 (권장)**  
1. **redirect_uri**: Naver 앱에 `https://<naver-oauth-app도메인>/api/callback` 등록.  
2. **kakkaobot**: `NAVER_OAUTH_BASE_URL` = naver-oauth-app 배포 URL, `NAVER_OAUTH_START_PATH` = **`/api/start`**. PM2 재시작.

### `pm2 start server.js` 사용 시 (ecosystem 미사용)

ecosystem을 쓰지 않으면 **`config/ecosystem.config.js`의 env는 적용되지 않습니다.**  
OAuth 관련 값은 **`server/.env`** 에 넣어야 합니다. (`database.js`에서 `dotenv`로 로드)

**`server/.env`에 추가 예시 (naver-oauth-app 사용 시):**
```env
NAVER_OAUTH_BASE_URL=https://<naver-oauth-app배포도메인>
NAVER_OAUTH_START_PATH=/api/start
```

**실행:** `server/` 디렉터리에서 `pm2 start server.js` (또는 `pm2 start server.js --cwd ./server`).  
변경 후 `pm2 restart all` 또는 해당 앱 이름으로 재시작.

**MediFirst 사용 시** `server/.env` 예:  
`NAVER_OAUTH_BASE_URL=https://medifirstall.vercel.app`, `NAVER_OAUTH_START_PATH=/oauth/naver/start`

**MediFirst(/oauth/naver) 사용 시**  
1. **redirect_uri**: Naver 앱에 `https://medifirstall.vercel.app/oauth/naver/callback` 등록.  
2. **kakkaobot**: `NAVER_OAUTH_START_PATH` = **`/oauth/naver/start`**.
3. **콜백**: `code` → token 교환 후 **Supabase `naver_oauth_tokens`**에  
   `user_id`, `access_token`, `refresh_token`, `expires_at`, (선택) `user_name` 저장.
4. **State**: `user_id`, `draft_id`, `user_name` 등을 state에 넣어 콜백에서 복원 후 저장에 사용.
5. **Supabase 분리**:  
   - **MediFirst 홈**: 기존 `NEXT_PUBLIC_SUPABASE_*` 등 그대로 사용 (profiles, posts 등).  
   - **Naver OAuth 토큰**: **kakkaobot** Supabase만 사용. Vercel env에  
     `NAVER_OAUTH_SUPABASE_URL`, `NAVER_OAUTH_SUPABASE_SERVICE_ROLE_KEY`  
     를 kakkaobot 프로젝트 값으로 설정. env 겹침 없음.  
   - kakkaobot 서버는 동일 kakkaobot Supabase에서 `getValidNaverAccessToken`으로 토큰 조회.

**Vercel용 구현 코드**: `server/vercel-naver-oauth/` 폴더.  
→ `README.md` 참고하여 MediFirst 등 Vercel 프로젝트의 `pages/api/naver/oauth/`(또는 `api/naver/oauth/`)에 복사 후 **Naver OAuth 전용** env 설정.

---

## 5. 참고

- 뉴스 검색 등 **비로그인 API**는 OAuth와 무관하게 `X-Naver-Client-Id` / `X-Naver-Client-Secret`만으로 사용 가능합니다.
- 카페 글쓰기 등 **로그인 API**는 OAuth access_token이 필요하며, 위 Vercel 연동 + Supabase 저장 구조로 **외부 포트 없이** 연동할 수 있습니다.
