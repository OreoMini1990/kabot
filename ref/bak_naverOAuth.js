// ============================================
// 네이버 OAuth 인증 라우트
// ============================================

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const db = require('../db/database');
const router = express.Router();

// 환경변수
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NAVER_REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://localhost:5002/auth/naver/callback';
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || 'default-secret-change-in-production';

/**
 * State 생성 (HMAC 서명)
 * @param {string} userId - 사용자 ID
 * @param {string} draftId - Draft ID (선택사항)
 */
function createState(userId, draftId = null) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const iat = Math.floor(Date.now() / 1000);
    const payload = { userId, nonce, iat };
    
    // draft_id가 있으면 포함
    if (draftId) {
        payload.draftId = draftId;
    }
    
    const payloadStr = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', OAUTH_STATE_SECRET);
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');
    
    return Buffer.from(payloadStr).toString('base64url') + '.' + signature;
}

/**
 * State 검증
 */
function verifyState(state) {
    try {
        const [payloadB64, signature] = state.split('.');
        if (!payloadB64 || !signature) {
            return null;
        }
        
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        
        // HMAC 검증용 payload 재구성 (draftId 포함)
        const verifyPayload = { userId: payload.userId, nonce: payload.nonce, iat: payload.iat };
        if (payload.draftId) {
            verifyPayload.draftId = payload.draftId;
        }
        
        const hmac = crypto.createHmac('sha256', OAUTH_STATE_SECRET);
        hmac.update(JSON.stringify(verifyPayload));
        const expectedSignature = hmac.digest('hex');
        
        if (signature !== expectedSignature) {
            return null;
        }
        
        // 만료 확인 (10분)
        const now = Math.floor(Date.now() / 1000);
        if (now - payload.iat > 600) {
            return null;
        }
        
        return payload;
    } catch (err) {
        console.error('[OAuth] State 검증 실패:', err.message);
        return null;
    }
}

/**
 * GET /auth/naver/start
 * OAuth 로그인 시작
 * 기존 토큰 확인 후 있으면 패스, 없으면 OAuth 진행
 */
router.get('/start', async (req, res) => {
    try {
        const userId = req.query.user_id || req.query.userId;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'user_id_required',
                message: 'user_id가 필요합니다.'
            });
        }
        
        const userIdStr = String(userId);
        console.log(`[OAuth] 로그인 시작 요청: user_id=${userIdStr}`);
        
        // 기존 토큰 확인
        console.log(`[OAuth] [토큰 확인] 기존 토큰 조회 시작: user_id=${userIdStr}`);
        const { hasNaverToken, getValidNaverAccessToken } = require('../utils/naverTokenManager');
        const hasToken = await hasNaverToken(userIdStr);
        
        if (hasToken) {
            console.log(`[OAuth] [토큰 확인] ✅ 기존 토큰 발견: user_id=${userIdStr}`);
            
            // 토큰 유효성 확인
            const tokenResult = await getValidNaverAccessToken(userIdStr);
            
            if (tokenResult.error) {
                if (tokenResult.error === 'token_not_found') {
                    console.log(`[OAuth] [토큰 확인] ⚠️ 토큰이 DB에서 삭제됨 - OAuth 진행`);
                    // 토큰이 없으므로 OAuth 진행
                } else if (tokenResult.error === 'token_refresh_failed') {
                    console.log(`[OAuth] [토큰 확인] ⚠️ 토큰 갱신 실패 - OAuth 재진행 필요`);
                    // 토큰 갱신 실패이므로 OAuth 재진행
                } else {
                    console.log(`[OAuth] [토큰 확인] ⚠️ 토큰 오류 - OAuth 진행: ${tokenResult.error}`);
                    // 기타 오류이므로 OAuth 진행
                }
            } else {
                // 토큰이 유효함 - 성공 페이지로 리다이렉트
                console.log(`[OAuth] [토큰 확인] ✅ 유효한 토큰 보유 - 연동 완료 페이지로 리다이렉트`);
                
                const baseUrl = process.env.SERVER_URL || `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 5002}`;
                const successUrl = `${baseUrl}/auth/naver/success?user_id=${encodeURIComponent(userIdStr)}`;
                return res.redirect(successUrl);
            }
        } else {
            console.log(`[OAuth] [토큰 확인] ❌ 기존 토큰 없음 - OAuth 진행`);
        }
        
        // Draft 조회하여 draft_id 가져오기
        let draftId = null;
        try {
            const { getDraft } = require('../utils/cafeDraftManager');
            const draft = await getDraft(userIdStr);
            if (draft) {
                draftId = draft.draft_id;
                console.log(`[OAuth] Draft 발견: draft_id=${draftId}`);
            }
        } catch (draftErr) {
            console.warn(`[OAuth] Draft 조회 실패 (무시):`, draftErr.message);
        }
        
        // State 생성 (draft_id 포함)
        const state = createState(userIdStr, draftId);
        
        // 네이버 OAuth authorize URL 생성
        const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', NAVER_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', NAVER_REDIRECT_URI);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('scope', 'cafe_write');  // 카페 글쓰기 권한
        
        console.log(`[OAuth] 네이버 OAuth 페이지로 리다이렉트: user_id=${userIdStr}`);
        
        // 302 redirect
        res.redirect(authUrl.toString());
        
    } catch (err) {
        console.error('[OAuth] 로그인 시작 오류:', err.message);
        console.error('[OAuth] 스택 트레이스:', err.stack);
        res.status(500).json({
            success: false,
            error: 'oauth_start_failed',
            message: err.message
        });
    }
});

/**
 * GET /auth/naver/callback
 * OAuth 콜백 처리
 */
router.get('/callback', async (req, res) => {
    // ⚠️ 1차 조치: 콜백이 실제로 타는지 강제 확정 로그
    console.log(`[OAUTH-HIT] ==========================================`);
    console.log(`[OAUTH-HIT] path=${req.originalUrl}`);
    console.log(`[OAUTH-HIT] code?=${!!req.query.code}, state_len=${(req.query.state || '').length}`);
    console.log(`[OAUTH-HIT] user-agent=${req.get('user-agent')?.substring(0, 50) || 'N/A'}`);
    console.log(`[OAUTH-HIT] ==========================================`);
    
    console.log(`[OAUTH-CB] ==========================================`);
    console.log(`[OAUTH-CB] 콜백 수신 시작`);
    console.log(`[OAUTH-CB]   query.code: ${req.query.code ? '있음' : '없음'}`);
    console.log(`[OAUTH-CB]   query.state: ${req.query.state ? '있음' : '없음'}`);
    console.log(`[OAUTH-CB]   query.error: ${req.query.error || '없음'}`);
    console.log(`[OAUTH-CB] ==========================================`);
    
    try {
        const code = req.query.code;
        const state = req.query.state;
        const error = req.query.error;
        
        // 에러 처리
        if (error) {
            console.error(`[OAUTH-CB] ❌ 콜백 에러: ${error}`);
            return res.status(400).send(`
                <html>
                <head><meta charset="UTF-8"></head>
                <body>
                    <h2>연동 실패</h2>
                    <p>네이버 연동에 실패했습니다: ${error}</p>
                    <p>카카오톡으로 돌아가세요.</p>
                </body>
                </html>
            `);
        }
        
        if (!code || !state) {
            console.error(`[OAUTH-CB] ❌ 필수 파라미터 없음: code=${code ? '있음' : '없음'}, state=${state ? '있음' : '없음'}`);
            return res.status(400).send(`
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>연동 실패</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
                            display: flex; justify-content: center; align-items: center;
                            min-height: 100vh; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
                            padding: 20px;
                        }
                        .container {
                            background: white; padding: 50px 40px; border-radius: 24px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.15); text-align: center;
                            max-width: 420px; width: 100%;
                        }
                        .error-icon { font-size: 64px; margin-bottom: 20px; }
                        h1 { color: #333; font-size: 28px; font-weight: 700; margin-bottom: 15px; }
                        .message { color: #666; font-size: 18px; line-height: 1.6; margin-bottom: 30px; }
                        .kakao-button {
                            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                            margin-top: 20px; padding: 16px 32px; background: #FEE500; color: #000;
                            text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 18px;
                            transition: all 0.3s; box-shadow: 0 4px 12px rgba(254, 229, 0, 0.3);
                        }
                        .kakao-button:hover { background: #FDD835; transform: translateY(-2px); }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error-icon">❌</div>
                        <h1>연동 실패</h1>
                        <p class="message">필수 파라미터가 없습니다.<br>카카오톡으로 돌아가세요.</p>
                        <a href="kakaotalk://" class="kakao-button">
                            <span>💬</span> 카카오톡으로 돌아가기
                        </a>
                    </div>
                </body>
                </html>
            `);
        }
        
        // State 검증 (3차 조치: state 복원 강제)
        console.log(`[OAUTH-CB] [State 검증] 시작`);
        console.log(`[OAUTH-CB] [State 검증] state_raw=${state.substring(0, 100)}...`);
        
        let userId = null;
        let draftId = null;
        let statePayload = verifyState(state);
        
        if (!statePayload) {
            console.error('[OAUTH-CB] ❌ State 검증 실패 - state raw 로그');
            console.error(`[OAUTH-CB] [State 검증] state 전체: ${state}`);
            
            // State 검증 실패 시에도 state를 직접 파싱 시도
            try {
                const decoded = Buffer.from(state, 'base64url').toString();
                const parsed = JSON.parse(decoded);
                if (parsed.userId) {
                    userId = String(parsed.userId);
                    draftId = parsed.draftId || null;
                    console.warn(`[OAUTH-CB] [State 검증] ⚠️ 직접 파싱 성공: user_id=${userId}, draft_id=${draftId || 'null'}`);
                } else {
                    console.error(`[OAUTH-CB] [State 검증] ❌ 직접 파싱도 실패: userId 없음`);
                    return res.status(400).send(`
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>연동 실패</title>
                            <style>
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                body {
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
                                    display: flex; justify-content: center; align-items: center;
                                    min-height: 100vh; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
                                    padding: 20px;
                                }
                                .container {
                                    background: white; padding: 50px 40px; border-radius: 24px;
                                    box-shadow: 0 20px 60px rgba(0,0,0,0.15); text-align: center;
                                    max-width: 420px; width: 100%;
                                }
                                .error-icon { font-size: 64px; margin-bottom: 20px; }
                                h1 { color: #333; font-size: 28px; font-weight: 700; margin-bottom: 15px; }
                                .message { color: #666; font-size: 18px; line-height: 1.6; margin-bottom: 30px; }
                                .kakao-button {
                                    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                                    margin-top: 20px; padding: 16px 32px; background: #FEE500; color: #000;
                                    text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 18px;
                                    transition: all 0.3s; box-shadow: 0 4px 12px rgba(254, 229, 0, 0.3);
                                }
                                .kakao-button:hover { background: #FDD835; transform: translateY(-2px); }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="error-icon">❌</div>
                                <h1>연동 실패</h1>
                                <p class="message">유효하지 않은 요청입니다.<br>카카오톡으로 돌아가세요.</p>
                                <a href="kakaotalk://" class="kakao-button">
                                    <span>💬</span> 카카오톡으로 돌아가기
                                </a>
                            </div>
                        </body>
                        </html>
                    `);
                }
            } catch (parseErr) {
                console.error(`[OAUTH-CB] [State 검증] ❌ 직접 파싱 실패:`, parseErr.message);
                return res.status(400).send(`
                    <html>
                    <head><meta charset="UTF-8"></head>
                    <body>
                        <h2>연동 실패</h2>
                        <p>유효하지 않은 요청입니다.</p>
                        <p>카카오톡으로 돌아가세요.</p>
                    </body>
                    </html>
                `);
            }
        } else {
            userId = String(statePayload.userId);
            draftId = statePayload.draftId || null;
            console.log(`[OAUTH-CB] [State 검증] ✅ 성공`);
            console.log(`[OAUTH-CB]   user_id: ${userId}`);
            console.log(`[OAUTH-CB]   draft_id: ${draftId || 'null'}`);
        }
        
        // draftId가 null이면 최신 Draft 조회하여 보완 (3차 조치)
        if (!draftId && userId) {
            console.log(`[OAUTH-CB] [State 보완] draftId 없음 - 최신 Draft 조회 시도`);
            try {
                const { getDraft } = require('../utils/cafeDraftManager');
                const latestDraft = await getDraft(userId);
                if (latestDraft) {
                    draftId = latestDraft.draft_id;
                    console.log(`[OAUTH-CB] [State 보완] ✅ 최신 Draft 발견: draft_id=${draftId}`);
                } else {
                    console.warn(`[OAUTH-CB] [State 보완] ⚠️ 최신 Draft 없음`);
                }
            } catch (draftErr) {
                console.error(`[OAUTH-CB] [State 보완] ❌ 최신 Draft 조회 실패:`, draftErr.message);
            }
        }
        
        // 기존 토큰 확인 (중복 저장 방지)
        console.log(`[OAuth] [중복 확인] 기존 토큰 조회 시작: user_id=${userId}`);
        const { hasNaverToken } = require('../utils/naverTokenManager');
        const existingToken = await hasNaverToken(userId);
        
        if (existingToken) {
            console.log(`[OAuth] [중복 확인] ⚠️ 기존 토큰 발견: user_id=${userId}`);
            console.log(`[OAuth] [중복 확인] 기존 토큰이 있으므로 upsert로 업데이트합니다.`);
            
            // DB에서 기존 토큰 정보 조회
            const { data: existingTokenData, error: fetchError } = await db.supabase
                .from('naver_oauth_tokens')
                .select('user_id, expires_at, updated_at')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (!fetchError && existingTokenData) {
                console.log(`[OAuth] [중복 확인] 기존 토큰 정보:`);
                console.log(`[OAuth]   - user_id: ${existingTokenData.user_id}`);
                console.log(`[OAuth]   - expires_at: ${existingTokenData.expires_at}`);
                console.log(`[OAuth]   - updated_at: ${existingTokenData.updated_at}`);
            } else {
                // LIKE 검색으로도 확인
                if (/^\d+$/.test(userId)) {
                    const { data: likeData, error: likeError } = await db.supabase
                        .from('naver_oauth_tokens')
                        .select('user_id, expires_at, updated_at')
                        .like('user_id', `%${userId}%`)
                        .maybeSingle();
                    
                    if (!likeError && likeData) {
                        console.log(`[OAuth] [중복 확인] LIKE 검색으로 기존 토큰 발견:`);
                        console.log(`[OAuth]   - user_id: ${likeData.user_id}`);
                        console.log(`[OAuth]   - expires_at: ${likeData.expires_at}`);
                        console.log(`[OAuth]   - updated_at: ${likeData.updated_at}`);
                    }
                }
            }
        } else {
            console.log(`[OAuth] [중복 확인] ✅ 기존 토큰 없음 - 새로 저장합니다.`);
        }
        
        // 토큰 교환
        console.log(`[OAUTH-CB] [토큰 교환] 시작`);
        const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: NAVER_CLIENT_ID,
            client_secret: NAVER_CLIENT_SECRET,
            code: code,
            state: state
        });
        
        const tokenResponse = await axios.post(tokenUrl, tokenParams.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
        
        if (!access_token || !refresh_token) {
            console.error(`[OAUTH-CB] [토큰 교환] ❌ 토큰 응답에 access_token 또는 refresh_token이 없습니다.`);
            throw new Error('토큰 응답에 access_token 또는 refresh_token이 없습니다.');
        }
        
        console.log(`[OAUTH-CB] [토큰 교환] ✅ 성공`);
        console.log(`[OAUTH-CB]   access_token: ${access_token.substring(0, 20)}...`);
        console.log(`[OAUTH-CB]   expires_in: ${expires_in}초`);
        
        // expires_at 계산
        const expiresAt = new Date(Date.now() + (expires_in * 1000));
        
        // DB에 저장 전 기존 토큰 비활성화 (user_id당 active는 1개만)
        console.log(`[OAuth] [저장 전] 기존 토큰 비활성화 시작: user_id=${userId}`);
        
        // 1. 정확한 user_id로 기존 토큰 비활성화
        const { error: deactivateExactError } = await db.supabase
            .from('naver_oauth_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        
        if (deactivateExactError) {
            console.error(`[OAuth] [저장 전] 정확 매칭 비활성화 실패:`, deactivateExactError);
        } else {
            console.log(`[OAuth] [저장 전] ✅ 정확 매칭 기존 토큰 비활성화 완료`);
        }
        
        // 2. 숫자 ID인 경우 LIKE 검색으로도 비활성화 (중복 방지)
        if (/^\d+$/.test(userId)) {
            const { data: likeTokens, error: likeFetchError } = await db.supabase
                .from('naver_oauth_tokens')
                .select('user_id, id')
                .like('user_id', `%${userId}%`)
                .eq('is_active', true);  // 활성 토큰만
            
            if (!likeFetchError && likeTokens && likeTokens.length > 0) {
                console.log(`[OAuth] [저장 전] LIKE 검색으로 ${likeTokens.length}개 활성 토큰 발견`);
                
                for (const token of likeTokens) {
                    // 숫자 ID가 포함된 토큰 비활성화
                    if (token.user_id && token.user_id.includes(userId)) {
                        const { error: deactivateLikeError } = await db.supabase
                            .from('naver_oauth_tokens')
                            .update({ is_active: false, updated_at: new Date().toISOString() })
                            .eq('id', token.id);
                        
                        if (!deactivateLikeError) {
                            console.log(`[OAuth] [저장 전] ✅ 중복 토큰 비활성화: user_id=${token.user_id}`);
                        }
                    }
                }
            }
        }
        
        // DB에 저장 (insert - is_active=true로 새 토큰 저장)
        console.log(`[OAuth] [저장] 새 토큰 저장 시작: user_id=${userId}`);
        const { error: dbError } = await db.supabase
            .from('naver_oauth_tokens')
            .insert({
                user_id: userId,
                access_token: access_token,  // 평문 저장 (암호화 미적용)
                refresh_token: refresh_token,  // 평문 저장 (암호화 미적용)
                expires_at: expiresAt.toISOString(),
                scope: scope || null,
                is_active: true,  // ✅ 새 토큰은 활성으로 저장
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        
        if (dbError) {
            // insert 실패 시 upsert로 재시도
            console.log(`[OAuth] [저장] insert 실패, upsert로 재시도: ${dbError.message}`);
            const { error: upsertError } = await db.supabase
                .from('naver_oauth_tokens')
                .upsert({
                    user_id: userId,
                    access_token: access_token,
                    refresh_token: refresh_token,
                    expires_at: expiresAt.toISOString(),
                    scope: scope || null,
                    is_active: true,  // ✅ 새 토큰은 활성으로 저장
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });
            
            if (upsertError) {
                console.error('[OAuth] ❌ 토큰 저장 실패 (upsert도 실패):', upsertError);
                throw new Error('토큰 저장에 실패했습니다.');
            } else {
                console.log(`[OAuth] [저장] ✅ upsert로 저장 성공`);
            }
        } else {
            console.log(`[OAuth] [저장] ✅ insert로 저장 성공`);
        }
        
        // 토큰 저장 완료 상세 로그
        console.log(`[OAUTH-CB] ==========================================`);
        console.log(`[OAUTH-CB] ✅ token_saved`);
        console.log(`[OAUTH-CB]   user_id: ${userId}`);
        console.log(`[OAUTH-CB]   draft_id: ${draftId || 'null'}`);
        console.log(`[OAUTH-CB]   expires_at: ${expiresAt.toISOString()}`);
        console.log(`[OAUTH-CB]   scope: ${scope || 'N/A'}`);
        console.log(`[OAUTH-CB] ==========================================`);
        
        // ⚠️ 핵심: resumeDraftAfterOAuth 호출
        console.log(`[OAUTH-CB] [재개 시작] resumeDraftAfterOAuth 호출`);
        const { resumeDraftAfterOAuth } = require('../utils/resumeDraftService');
        const resumeResult = await resumeDraftAfterOAuth(userId, draftId);
        
        console.log(`[OAUTH-CB] [재개 결과]`, resumeResult);
        
        // 재개 성공 시 사용자 알림
        if (resumeResult.ok && resumeResult.roomName) {
            try {
                console.log(`[OAUTH-CB] [알림 전송] 사용자에게 성공 메시지 전송`);
                const sendFollowUpMessageFunction = global.sendFollowUpMessageFunction;
                
                if (sendFollowUpMessageFunction) {
                    const message = `✅ 네이버 계정 연동이 완료되었습니다!\n\n` +
                        `질문이 자동으로 등록되었습니다:\n` +
                        `📋 제목: ${resumeResult.title || 'N/A'}\n\n` +
                        `🔗 답변하러 가기: ${resumeResult.url || 'N/A'}`;
                    
                    sendFollowUpMessageFunction(resumeResult.roomName, message);
                    console.log(`[OAUTH-CB] [알림 전송] ✅ notify_ok room=${resumeResult.roomName}`);
                } else {
                    console.warn(`[OAUTH-CB] [알림 전송] ⚠️ sendFollowUpMessageFunction 없음`);
                }
            } catch (notifyErr) {
                console.error(`[OAUTH-CB] [알림 전송] ❌ notify 실패:`, notifyErr.message);
            }
        } else if (!resumeResult.ok) {
            console.warn(`[OAUTH-CB] [재개 결과] ⚠️ 재개 실패: reason=${resumeResult.reason}, error=${resumeResult.error || 'N/A'}`);
            
            // 실패 시에도 사용자에게 알림 (가능하면)
            if (resumeResult.roomName) {
                try {
                    const sendFollowUpMessageFunction = global.sendFollowUpMessageFunction;
                    if (sendFollowUpMessageFunction) {
                        const message = `⚠️ 네이버 계정 연동은 완료되었지만, 질문 등록에 실패했습니다.\n\n` +
                            `오류: ${resumeResult.error || resumeResult.reason || '알 수 없는 오류'}\n\n` +
                            `다시 시도해주세요.`;
                        sendFollowUpMessageFunction(resumeResult.roomName, message);
                    }
                } catch (notifyErr) {
                    console.error(`[OAUTH-CB] [알림 전송] ❌ 실패 알림 전송 실패:`, notifyErr.message);
                }
            }
        }
        
        // 성공 페이지 반환
        const draftProcessed = resumeResult.ok;
        const articleUrl = resumeResult.url || null;
        
        // 성공 페이지 반환 (Draft 처리 상태 포함)
        const successPageHtml = `
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>연동 완료</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                        max-width: 400px;
                    }
                    h2 {
                        color: #333;
                        margin-bottom: 20px;
                    }
                    p {
                        color: #666;
                        line-height: 1.6;
                    }
                    .success-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    .kakao-button {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 12px 24px;
                        background: #FEE500;
                        color: #000;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: bold;
                        font-size: 16px;
                        transition: background 0.3s;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .kakao-button:hover {
                        background: #FDD835;
                    }
                    .kakao-button:active {
                        transform: scale(0.98);
                    }
                    .kakao-icon {
                        display: inline-block;
                        width: 20px;
                        height: 20px;
                        margin-right: 8px;
                        vertical-align: middle;
                    }
                    .guide-text {
                        margin-top: 20px;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 8px;
                        border-left: 4px solid #FEE500;
                        text-align: left;
                        font-size: 14px;
                        color: #555;
                    }
                    .guide-text strong {
                        color: #333;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">✅</div>
                    <h2>연동 완료</h2>
                    <p>네이버 계정 연동이 완료되었습니다.</p>
                    ${draftProcessed ? 
                        `<p style="color: #28a745; font-weight: bold; margin-top: 15px;">질문이 자동으로 등록되었습니다!</p>
                         <p style="color: #666;">카카오톡으로 돌아가서 확인해주세요.</p>` :
                        `<p style="margin-top: 15px;">이제 카카오톡으로 돌아가서<br>질문을 작성할 수 있습니다.</p>`
                    }
                    
                    <a href="kakaotalk://" class="kakao-button" onclick="openKakaoTalk(); return false;">
                        <span class="kakao-icon">💬</span>
                        카카오톡으로 돌아가기
                    </a>
                    
                    <div class="guide-text">
                        <strong>💡 안내</strong><br>
                        • 버튼이 작동하지 않으면 카카오톡 앱을 직접 열어주세요<br>
                        • 카카오톡 인앱 브라우저에서는 자동으로 돌아갑니다<br>
                        ${draftProcessed ? 
                            '• 질문이 자동으로 등록되었습니다. 카카오톡에서 확인해주세요' :
                            '• 질문 등록이 완료되면 카카오톡에서 알림을 받을 수 있습니다'
                        }
                    </div>
                    
                    ${draftProcessed ? 
                        `<div style="margin-top: 20px; padding: 15px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745;">
                            <strong style="color: #155724;">✅ 질문 자동 등록 완료</strong><br>
                            <span style="color: #155724; font-size: 14px;">카카오톡으로 돌아가서 확인해주세요.</span>
                        </div>` :
                        ''
                    }
                </div>
                
                <script>
                    function openKakaoTalk() {
                        // 카카오톡 딥링크 시도
                        window.location.href = 'kakaotalk://';
                        
                        // 딥링크가 작동하지 않을 경우를 대비한 안내
                        setTimeout(function() {
                            alert('카카오톡 앱을 직접 열어주세요.\\n\\n또는 브라우저를 닫고 카카오톡으로 돌아가세요.');
                        }, 500);
                    }
                    
                    // 페이지 로드 시 자동으로 카카오톡 열기 시도 (선택적)
                    // 인앱 브라우저에서는 자동으로 작동할 수 있음
                    window.onload = function() {
                        ${draftProcessed ? 
                            `// Draft가 처리되었으므로 2초 후 자동으로 카카오톡 열기 시도
                            setTimeout(function() {
                                try {
                                    window.location.href = 'kakaotalk://';
                                } catch(e) {
                                    console.log('카카오톡 딥링크 실패:', e);
                                }
                            }, 2000);` :
                            ''
                        }
                    };
                </script>
            </body>
            </html>
        `;
        
        res.send(successPageHtml);
        
    } catch (err) {
        console.error('[OAuth] 콜백 처리 오류:', err.message);
        res.status(500).send(`
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
                <h2>연동 실패</h2>
                <p>오류가 발생했습니다: ${err.message}</p>
                <p>카카오톡으로 돌아가세요.</p>
            </body>
            </html>
        `);
    }
});

/**
 * GET /auth/naver/success
 * 기존 토큰이 있을 때 성공 페이지 표시
 */
router.get('/success', async (req, res) => {
    try {
        const userId = req.query.user_id || req.query.userId;
        
        if (!userId) {
            return res.status(400).send(`
                <html>
                <head><meta charset="UTF-8"></head>
                <body>
                    <h2>오류</h2>
                    <p>user_id가 필요합니다.</p>
                </body>
                </html>
            `);
        }
        
        const userIdStr = String(userId);
        console.log(`[OAuth] 성공 페이지 요청: user_id=${userIdStr}`);
        
        // 토큰 확인
        const { hasNaverToken, getValidNaverAccessToken } = require('../utils/naverTokenManager');
        const hasToken = await hasNaverToken(userIdStr);
        
        if (!hasToken) {
            return res.status(404).send(`
                <html>
                <head><meta charset="UTF-8"></head>
                <body>
                    <h2>토큰 없음</h2>
                    <p>토큰을 찾을 수 없습니다.</p>
                </body>
                </html>
            `);
        }
        
        const tokenResult = await getValidNaverAccessToken(userIdStr);
        
        if (tokenResult.error) {
            return res.status(500).send(`
                <html>
                <head><meta charset="UTF-8"></head>
                <body>
                    <h2>토큰 오류</h2>
                    <p>토큰을 가져오는 중 오류가 발생했습니다: ${tokenResult.message}</p>
                </body>
                </html>
            `);
        }
        
        // 성공 페이지 반환 (기존 콜백 성공 페이지와 동일한 형식)
        res.send(`
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>연동 완료</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                        max-width: 400px;
                    }
                    h2 {
                        color: #333;
                        margin-bottom: 20px;
                    }
                    p {
                        color: #666;
                        line-height: 1.6;
                    }
                    .success-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    .kakao-button {
                        display: inline-block;
                        margin-top: 20px;
                        padding: 12px 24px;
                        background: #FEE500;
                        color: #000;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: bold;
                        font-size: 16px;
                        transition: background 0.3s;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .kakao-button:hover {
                        background: #FDD835;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">✅</div>
                    <h2>연동 완료</h2>
                    <p>네이버 계정이 이미 연동되어 있습니다.</p>
                    <p style="margin-top: 15px;">이제 카카오톡으로 돌아가서<br>질문을 작성할 수 있습니다.</p>
                    
                    <a href="kakaotalk://" class="kakao-button" onclick="window.location.href='kakaotalk://'; return false;">
                        💬 카카오톡으로 돌아가기
                    </a>
                </div>
            </body>
            </html>
        `);
        
    } catch (err) {
        console.error('[OAuth] 성공 페이지 오류:', err.message);
        res.status(500).send(`
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
                <h2>오류</h2>
                <p>오류가 발생했습니다: ${err.message}</p>
            </body>
            </html>
        `);
    }
});

// verifyState 함수를 외부에서 사용할 수 있도록 export
module.exports = router;
module.exports.verifyState = verifyState;
module.exports.createState = createState;

