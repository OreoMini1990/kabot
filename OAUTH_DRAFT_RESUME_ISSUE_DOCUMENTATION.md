# OAuth 연동 후 Draft 자동 게시 재개 로직 문제 진단 문서

## 문제 상황

**증상**: 네이버 OAuth 연동 완료 후 토큰이 DB에 저장되지만, 그 이후 Draft 조회 → 이미지 처리 → 게시글 등록 → 사용자 알림 단계가 자동으로 진행되지 않음.

**로그 증거**:
```
[토큰 관리] 토큰 저장 완료
[네이버 OAuth] 토큰 DB 저장 완료
(이후 로그 없음 - 재개 로직이 실행되지 않음)
```

---

## 현재 구현된 로직 구조

### 1. OAuth Callback 경로 (2개 존재)

#### A. `/auth/naver/callback` (`server/routes/naverOAuth.js`)
- **파일**: `server/routes/naverOAuth.js`
- **라우트 등록**: `app.use('/auth/naver', naverOAuthRouter);` (server.js:359)
- **State 생성**: `createState(userId, draftId)` - HMAC 서명된 state에 `userId`와 `draftId` 포함
- **재개 로직**: ✅ 구현됨 (`resumeDraftAfterOAuth` 호출)
- **로그 태그**: `[OAUTH-CB]`

#### B. `/api/naver/oauth/callback` (`server/api/naverOAuth.js`)
- **파일**: `server/api/naverOAuth.js`
- **라우트 등록**: `app.use('/api/naver/oauth', naverOAuthRouter);` (server.js:368)
- **State 생성**: 단순 랜덤 hex (draftId 미포함)
- **재개 로직**: ✅ 구현됨 (최근 추가됨)
- **로그 태그**: `[OAUTH-CB] [api/naverOAuth]`

**문제**: 실제로 어느 callback이 실행되는지는 `NAVER_REDIRECT_URI` 환경변수에 따라 결정됨.

---

## 2. Draft 저장 및 OAuth 링크 생성 (`server/labbot-node.js`)

### 위치: `processQuestionSubmission` 함수 내부

```javascript
// 토큰 없음: 연동 링크 제공
if (!hasToken) {
    const baseUrl = process.env.SERVER_URL || `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 5002}`;
    
    // Draft 저장 (draft_id 반환받기)
    const { saveDraft } = require('./utils/cafeDraftManager');
    const draftResult = await saveDraft(userIdStr, room, title, content, imageUrl ? [imageUrl] : []);
    
    if (draftResult.success && draftResult.draftId) {
        draftId = draftResult.draftId;
    }
    
    // OAuth 링크 생성 시 draft_id 포함
    const authUrlWithDraft = draftId 
        ? `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}&draft_id=${encodeURIComponent(draftId)}`
        : `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}`;
    
    // 사용자에게 연동 링크 전송
    replies.push(`🔗 네이버 계정 연동이 필요합니다...\n${authUrlWithDraft}`);
}
```

**동작**:
1. `saveDraft` 호출 → `draft_id` (UUID) 반환
2. OAuth 링크에 `draft_id`를 query parameter로 포함
3. 사용자에게 링크 전송

---

## 3. OAuth 시작 (`server/routes/naverOAuth.js`)

### 위치: `GET /auth/naver/start`

```javascript
router.get('/start', async (req, res) => {
    const userId = req.query.user_id || req.query.userId;
    const draftId = req.query.draft_id || null;  // query에서 draft_id 받기
    
    // 기존 토큰 확인
    const hasToken = await hasNaverToken(userIdStr);
    if (hasToken) {
        // 토큰이 있으면 성공 페이지로 리다이렉트
        return res.redirect(`${baseUrl}/auth/naver/success?user_id=${userIdStr}`);
    }
    
    // draft_id가 없으면 Draft 조회하여 draft_id 가져오기
    let finalDraftId = draftId;
    if (!finalDraftId) {
        const { getDraft } = require('../utils/cafeDraftManager');
        const draft = await getDraft(userIdStr);
        if (draft) {
            finalDraftId = draft.draft_id;
        }
    }
    
    // State 생성 (draft_id 포함)
    const state = createState(userIdStr, finalDraftId);
    
    // 네이버 OAuth authorize URL 생성
    const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
    authUrl.searchParams.set('state', state);  // state에 userId와 draftId 포함
    // ... 기타 파라미터
    
    res.redirect(authUrl.toString());
});
```

**동작**:
1. Query에서 `draft_id` 받기 (없으면 DB에서 조회)
2. `createState(userId, draftId)` 호출하여 HMAC 서명된 state 생성
3. 네이버 OAuth 페이지로 리다이렉트

---

## 4. OAuth Callback 처리

### A. `/auth/naver/callback` (`server/routes/naverOAuth.js`)

```javascript
router.get('/callback', async (req, res) => {
    console.log(`[OAUTH-CB] 콜백 수신 시작`);
    
    const { code, state } = req.query;
    
    // State 검증
    const statePayload = verifyState(state);
    const userId = String(statePayload.userId);
    const draftId = statePayload.draftId || null;
    
    // 토큰 교환
    const { access_token, refresh_token, expires_in, scope } = await exchangeCodeForToken(...);
    
    // 기존 토큰 비활성화
    await db.supabase
        .from('naver_oauth_tokens')
        .update({ is_active: false })
        .eq('user_id', userId);
    
    // 새 토큰 저장 (is_active=true)
    await db.supabase
        .from('naver_oauth_tokens')
        .insert({
            user_id: userId,
            access_token: access_token,
            refresh_token: refresh_token,
            expires_at: expiresAt.toISOString(),
            is_active: true,
            // ...
        });
    
    console.log(`[OAUTH-CB] ✅ token_saved`);
    console.log(`[OAUTH-CB]   user_id: ${userId}`);
    console.log(`[OAUTH-CB]   draft_id: ${draftId || 'null'}`);
    
    // ⚠️ 핵심: resumeDraftAfterOAuth 호출
    console.log(`[OAUTH-CB] [재개 시작] resumeDraftAfterOAuth 호출`);
    const { resumeDraftAfterOAuth } = require('../utils/resumeDraftService');
    const resumeResult = await resumeDraftAfterOAuth(userId, draftId);
    
    console.log(`[OAUTH-CB] [재개 결과]`, resumeResult);
    
    // 재개 성공 시 사용자 알림
    if (resumeResult.ok && resumeResult.roomName) {
        const sendFollowUpMessageFunction = global.sendFollowUpMessageFunction;
        if (sendFollowUpMessageFunction) {
            const message = `✅ 네이버 계정 연동이 완료되었습니다!...`;
            sendFollowUpMessageFunction(resumeResult.roomName, message);
        }
    }
    
    // 성공 페이지 반환
    res.send(successPageHtml);
});
```

### B. `/api/naver/oauth/callback` (`server/api/naverOAuth.js`)

```javascript
router.get('/callback', async (req, res) => {
    console.log(`[OAUTH-CB] [api/naverOAuth] 콜백 수신 시작`);
    
    const { code, state } = req.query;
    
    // 토큰 교환
    const result = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);
    
    // State에서 user_id와 draft_id 추출
    let kakaoUserId = null;
    let draftId = null;
    
    if (state) {
        try {
            const { verifyState } = require('../routes/naverOAuth');
            const statePayload = verifyState(state);
            if (statePayload) {
                kakaoUserId = String(statePayload.userId);
                draftId = statePayload.draftId || null;
            }
        } catch (stateErr) {
            // State 검증 실패 시 직접 파싱 시도
        }
    }
    
    // DB에 토큰 저장
    const saveResult = await saveToken({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user_id: kakaoUserId || userInfo?.id || null,
        // ...
    });
    
    console.log(`[OAUTH-CB] [api/naverOAuth] ✅ 토큰 DB 저장 완료`);
    
    // ⚠️ 핵심: resumeDraftAfterOAuth 호출
    const finalUserId = kakaoUserId || userInfo?.id || null;
    
    if (finalUserId && saveResult) {
        console.log(`[OAUTH-CB] [api/naverOAuth] [재개 시작] resumeDraftAfterOAuth 호출`);
        const { resumeDraftAfterOAuth } = require('../utils/resumeDraftService');
        const resumeResult = await resumeDraftAfterOAuth(finalUserId, draftId);
        
        // 재개 성공 시 사용자 알림
        if (resumeResult.ok && resumeResult.roomName) {
            const sendFollowUpMessageFunction = global.sendFollowUpMessageFunction;
            if (sendFollowUpMessageFunction) {
                sendFollowUpMessageFunction(resumeResult.roomName, message);
            }
        }
    }
    
    res.send(successPageHtml);
});
```

---

## 5. 재개 서비스 (`server/utils/resumeDraftService.js`)

### 함수: `resumeDraftAfterOAuth(userId, draftId)`

```javascript
async function resumeDraftAfterOAuth(userId, draftId = null) {
    console.log(`[RESUME] 시작: user_id=${userId}, draft_id=${draftId || 'null'}`);
    
    // 1단계: Draft 조회
    const draft = await getDraft(userId, draftId);
    if (!draft) {
        console.warn(`[RESUME] [1단계] ❌ Draft 없음`);
        return { ok: false, reason: 'NO_DRAFT' };
    }
    
    console.log(`[RESUME] [1단계] ✅ Draft 발견`);
    console.log(`[RESUME]   - draft_id: ${draft.draft_id}`);
    console.log(`[RESUME]   - room_name: ${draft.room_name}`);
    console.log(`[RESUME]   - title: "${draft.title}"`);
    console.log(`[RESUME]   - image_refs: ${draft.imageRefs ? draft.imageRefs.length : 0}개`);
    
    // Draft 상태를 pending_submit으로 변경
    await updateDraftStatus(draft.draft_id, 'pending_submit');
    
    // 2단계: 토큰 가져오기
    const tokenResult = await getValidNaverAccessToken(userId);
    if (tokenResult.error) {
        console.error(`[RESUME] [2단계] ❌ 토큰 가져오기 실패: ${tokenResult.error}`);
        return { ok: false, reason: 'TOKEN_ERROR', error: tokenResult.error };
    }
    
    const accessToken = tokenResult.accessToken;
    console.log(`[RESUME] [2단계] ✅ 토큰 가져오기 성공`);
    
    // 3단계: 이미지 처리
    const images = [];
    // ... 이미지 다운로드/로컬 파일 읽기 로직
    
    console.log(`[RESUME] [3단계] ✅ 이미지 처리 완료: ${images.length}개`);
    
    // 4단계: 게시글 등록
    const submitResult = await submitQuestion({
        senderId: userId,
        roomId: draft.room_name,
        title: draft.title,
        content: draft.content,
        accessToken: accessToken,
        clubid: clubid,
        menuid: menuid,
        images: images.length > 0 ? images : null
    });
    
    if (!submitResult.success) {
        console.error(`[RESUME] [4단계] ❌ 게시글 등록 실패: ${submitResult.error}`);
        await updateDraftStatus(draft.draft_id, 'failed', submitResult.error);
        return { ok: false, reason: 'SUBMIT_FAILED', error: submitResult.error };
    }
    
    console.log(`[RESUME] [4단계] ✅ 게시글 등록 성공`);
    console.log(`[RESUME]   - article_url: ${submitResult.articleUrl}`);
    
    // Draft 상태를 submitted로 변경
    await updateDraftStatus(draft.draft_id, 'submitted');
    
    // 5단계: 재개 완료
    console.log(`[RESUME] [5단계] ✅ 재개 완료`);
    
    return { 
        ok: true, 
        url: submitResult.articleUrl,
        articleId: submitResult.articleId,
        roomName: draft.room_name
    };
}
```

---

## 6. 문제 진단 포인트

### 문제 1: Callback이 실행되지 않음

**증상**: 로그에 `[OAUTH-CB]` 태그가 전혀 없음

**가능한 원인**:
1. `NAVER_REDIRECT_URI` 환경변수가 `/auth/naver/callback`이 아닌 다른 경로로 설정됨
2. 네이버 OAuth 설정에서 Redirect URI가 잘못 설정됨
3. Callback이 실행되었지만 예외가 발생하여 로그가 출력되지 않음

**확인 방법**:
- 환경변수 `NAVER_REDIRECT_URI` 값 확인
- 네이버 개발자센터에서 등록된 Redirect URI 확인
- Callback 시작 부분에 `console.log` 추가 (이미 추가됨)

### 문제 2: State에서 user_id 추출 실패

**증상**: `[OAUTH-CB] [api/naverOAuth] ⚠️ 카카오 user_id 없음 - 재개 로직 스킵`

**가능한 원인**:
1. State 검증 실패 (`verifyState` 반환값이 null)
2. State에 `userId`가 포함되지 않음
3. State 형식이 예상과 다름

**확인 방법**:
- Callback에서 `state` 값 로그 출력
- `verifyState(state)` 반환값 확인
- State 직접 파싱 시도 로그 확인

### 문제 3: Draft 조회 실패

**증상**: `[RESUME] [1단계] ❌ Draft 없음`

**가능한 원인**:
1. `draft_id`가 state에서 추출되지 않음
2. `user_id` 매칭 실패 (암호화/형식 차이)
3. Draft가 만료됨 (TTL 2시간)
4. Draft가 이미 삭제됨

**확인 방법**:
- `getDraft(userId, draftId)` 호출 시 파라미터 로그 출력
- DB에서 직접 `cafe_post_drafts` 테이블 조회
- `user_id` 형식 일치 여부 확인

### 문제 4: 토큰 조회 실패

**증상**: `[RESUME] [2단계] ❌ 토큰 가져오기 실패`

**가능한 원인**:
1. `is_active=true` 조건으로 조회하는데, 저장 시 `is_active`가 설정되지 않음
2. `user_id` 매칭 실패
3. 토큰이 다른 `user_id`로 저장됨

**확인 방법**:
- `getValidNaverAccessToken(userId)` 호출 시 파라미터 로그 출력
- DB에서 직접 `naver_oauth_tokens` 테이블 조회
- `is_active` 컬럼 값 확인

---

## 7. 현재 로그 분석

### 로그에서 확인된 사항:

1. **토큰 저장은 성공**:
   ```
   [토큰 관리] 토큰 저장 완료
   [네이버 OAuth] 토큰 DB 저장 완료
   ```
   - 이것은 `server/integrations/naverCafe/tokenManager.js`의 `saveToken` 함수에서 출력됨
   - 또는 `server/api/naverOAuth.js`의 callback에서 출력됨

2. **재개 로직 로그가 없음**:
   - `[OAUTH-CB]` 태그가 전혀 없음
   - `[RESUME]` 태그도 전혀 없음
   - 이것은 callback이 실행되지 않았거나, callback에서 재개 로직까지 도달하지 못했다는 것을 의미

3. **가능한 시나리오**:
   - Callback이 `/api/naver/oauth/callback`로 들어왔지만, 우리가 추가한 로그가 출력되기 전에 다른 경로로 처리됨
   - 또는 callback이 실행되었지만 예외가 발생하여 재개 로직까지 도달하지 못함

---

## 8. 디버깅 체크리스트

### 즉시 확인해야 할 사항:

1. **환경변수 확인**:
   ```bash
   echo $NAVER_REDIRECT_URI
   # 또는
   # .env 파일에서 NAVER_REDIRECT_URI 값 확인
   ```

2. **네이버 개발자센터 설정 확인**:
   - 등록된 Redirect URI가 실제 callback 경로와 일치하는지 확인
   - `/auth/naver/callback` 또는 `/api/naver/oauth/callback`

3. **Callback 실행 여부 확인**:
   - Callback 시작 부분에 `console.log` 추가 (이미 추가됨)
   - 서버 재시작 후 다시 테스트

4. **State 값 확인**:
   - Callback에서 받은 `state` 값을 로그로 출력
   - `verifyState(state)` 반환값 확인

5. **DB 직접 확인**:
   ```sql
   -- Draft 확인
   SELECT * FROM cafe_post_drafts 
   WHERE user_id = '4897202238384073231' 
   ORDER BY created_at DESC LIMIT 1;
   
   -- 토큰 확인
   SELECT * FROM naver_oauth_tokens 
   WHERE user_id = '4897202238384073231' 
   AND is_active = true;
   ```

---

## 9. 예상되는 문제와 해결 방법

### 문제 A: Callback이 다른 경로로 실행됨

**증상**: `[OAUTH-CB]` 로그가 없음

**해결**:
- `NAVER_REDIRECT_URI` 환경변수를 `/auth/naver/callback`로 설정
- 또는 두 callback 모두에 재개 로직이 있으므로, 어느 것이 실행되든 상관없음

### 문제 B: State 검증 실패

**증상**: `[OAUTH-CB] [api/naverOAuth] State 검증 실패`

**해결**:
- State 직접 파싱 로직이 이미 구현되어 있음
- `OAUTH_STATE_SECRET` 환경변수가 일치하는지 확인

### 문제 C: user_id 매칭 실패

**증상**: `[RESUME] [1단계] ❌ Draft 없음` 또는 `[토큰 관리] 토큰 확인 실패`

**해결**:
- `user_id`를 문자열로 통일하여 비교
- DB에서 직접 조회하여 형식 확인

---

## 10. GPT에게 질문할 때 포함할 정보

### 필수 정보:

1. **로그 파일**: `server.log` 전체 내용
2. **환경변수**: `NAVER_REDIRECT_URI` 값
3. **네이버 개발자센터 설정**: 등록된 Redirect URI
4. **DB 조회 결과**:
   - `cafe_post_drafts` 테이블에서 해당 `user_id`의 최신 Draft
   - `naver_oauth_tokens` 테이블에서 해당 `user_id`의 토큰 (is_active=true)
5. **OAuth 링크**: 사용자가 클릭한 실제 OAuth 링크 (state 값 포함)

### 질문 예시:

```
로그를 보면 토큰 저장은 성공했지만, 그 이후 재개 로직이 실행되지 않습니다.

1. 로그에 [OAUTH-CB] 태그가 전혀 없습니다. 이것은 callback이 실행되지 않았다는 의미인가요?
2. 만약 callback이 실행되었다면, 왜 재개 로직까지 도달하지 못했을까요?
3. State에서 user_id를 추출하는 로직이 실패했을 가능성이 있나요?
4. 두 개의 callback 경로가 있는데, 실제로 어느 것이 실행되는지 어떻게 확인할 수 있나요?
```

---

## 11. 코드 파일 위치

- **OAuth 라우트 (메인)**: `server/routes/naverOAuth.js`
- **OAuth 라우트 (API)**: `server/api/naverOAuth.js`
- **재개 서비스**: `server/utils/resumeDraftService.js`
- **Draft 관리**: `server/utils/cafeDraftManager.js`
- **토큰 관리**: `server/utils/naverTokenManager.js`
- **질문 제출**: `server/labbot-node.js` (processQuestionSubmission 함수)

---

## 12. 다음 단계

1. 서버 재시작 후 다시 테스트
2. 로그에서 `[OAUTH-CB]` 태그 확인
3. `[OAUTH-CB]` 태그가 없으면 callback이 실행되지 않은 것이므로, `NAVER_REDIRECT_URI` 확인
4. `[OAUTH-CB]` 태그가 있으면, 어느 단계에서 멈췄는지 확인
5. 필요시 DB 직접 조회하여 데이터 확인










