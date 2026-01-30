// ============================================
// 네이버 OAuth 토큰 관리 유틸
// ============================================

const axios = require('axios');
const db = require('../db/database');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 5 * 60 * 1000;  // 5분

/**
 * 유효한 네이버 access_token 가져오기
 * - 토큰이 만료 임박이면 자동 refresh
 * - refresh 실패 시 에러 반환
 * 
 * @param {string} userId - 사용자 ID
 * @returns {Promise<{accessToken: string, error?: string}>}
 */
async function getValidNaverAccessToken(userId) {
    try {
        const userIdStr = String(userId);
        // ⚠️ 4차 조치: 토큰 조회 시 userId 로그 필수
        console.log(`[TOKEN-LOOKUP] user_id=${userIdStr}`);
        
        let tokenData = null;
        
        // 1순위: 정확한 매칭 (is_active=true만)
        let { data, error: fetchError } = await db.supabase
            .from('naver_oauth_tokens')
            .select('*')
            .eq('user_id', userIdStr)
            .eq('is_active', true)  // ✅ 활성 토큰만 조회
            .order('updated_at', { ascending: false })  // 최신 순
            .order('created_at', { ascending: false })  // 최신 순
            .limit(1)
            .maybeSingle();
        
        if (fetchError) {
            console.error(`[토큰 관리] 토큰 조회 실패:`, fetchError);
            return { error: 'token_fetch_failed', message: '토큰 조회에 실패했습니다.' };
        }
        
        if (data) {
            tokenData = data;
            console.log(`[TOKEN-LOOKUP] user_id=${userIdStr} found=YES (정확 매칭, active)`);
        } else {
            // 2순위: 숫자 ID인 경우, LIKE 검색 (is_active=true만)
            if (/^\d+$/.test(userIdStr)) {
                const { data: likeData, error: likeError } = await db.supabase
                    .from('naver_oauth_tokens')
                    .select('*')
                    .like('user_id', `%${userIdStr}%`)
                    .eq('is_active', true)  // ✅ 활성 토큰만 조회
                    .order('updated_at', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (!likeError && likeData) {
                    tokenData = likeData;
                    console.log(`[TOKEN-LOOKUP] user_id=${userIdStr} found=YES (LIKE 매칭, active) DB값=${likeData.user_id}`);
                }
            }
        }
        
        if (!tokenData) {
            console.log(`[TOKEN-LOOKUP] user_id=${userIdStr} found=NO`);
            return { error: 'token_not_found', message: '네이버 연동이 필요합니다.' };
        }
        
        // 평문으로 저장된 토큰 사용 (암호화 미적용)
        let accessToken = tokenData.access_token;
        let refreshToken = tokenData.refresh_token;
        const expiresAt = new Date(tokenData.expires_at);
        const now = new Date();
        
        // 만료 임박 확인 (현재 시각 + safety window)
        const expiresAtWithWindow = new Date(expiresAt.getTime() - TOKEN_REFRESH_SAFETY_WINDOW_MS);
        
        if (now >= expiresAtWithWindow) {
            // 토큰 갱신 필요
            console.log(`[토큰 관리] 토큰 갱신 시작: user_id=${userId}`);
            
            try {
                const refreshUrl = 'https://nid.naver.com/oauth2.0/token';
                const refreshParams = new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: NAVER_CLIENT_ID,
                    client_secret: NAVER_CLIENT_SECRET,
                    refresh_token: refreshToken
                });
                
                const refreshResponse = await axios.post(refreshUrl, refreshParams.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in } = refreshResponse.data;
                
                if (!newAccessToken) {
                    throw new Error('새 access_token이 없습니다.');
                }
                
                // 새 토큰으로 업데이트
                accessToken = newAccessToken;
                const newExpiresAt = new Date(Date.now() + (expires_in * 1000));
                
                const updateData = {
                    access_token: newAccessToken,
                    expires_at: newExpiresAt.toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // 새 refresh_token이 있으면 업데이트
                if (newRefreshToken) {
                    updateData.refresh_token = newRefreshToken;
                }
                
                const { error: updateError } = await db.supabase
                    .from('naver_oauth_tokens')
                    .update(updateData)
                    .eq('user_id', userId);
                
                if (updateError) {
                    console.error(`[토큰 관리] 토큰 업데이트 실패:`, updateError);
                    // 업데이트 실패해도 새 토큰은 사용 가능
                } else {
                    console.log(`[토큰 관리] ✅ 토큰 갱신 완료: user_id=${userId}`);
                }
                
            } catch (refreshErr) {
                console.error(`[토큰 관리] 토큰 갱신 실패:`, refreshErr.message);
                
                // refresh 실패 시 재연동 필요
                return {
                    error: 'token_refresh_failed',
                    message: '토큰 갱신에 실패했습니다. 네이버 연동을 다시 해주세요.'
                };
            }
        } else {
            console.log(`[토큰 관리] 토큰 유효: user_id=${userId}, 만료까지 ${Math.floor((expiresAt - now) / 1000)}초`);
        }
        
        return { accessToken, userName: tokenData.user_name || null };
        
    } catch (err) {
        console.error(`[토큰 관리] 예외 발생:`, err.message);
        return { error: 'token_manager_error', message: err.message };
    }
}

/**
 * 사용자 토큰 존재 여부 확인
 * 여러 형식의 user_id를 시도 (숫자 ID, 암호화된 값 등)
 * @param {string|number} userId - 사용자 ID
 * @returns {Promise<boolean>}
 */
async function hasNaverToken(userId) {
    try {
        // userId를 문자열로 변환 (타입 일관성)
        const userIdStr = String(userId);
        
        // 1순위: 정확한 매칭 (is_active=true만)
        let { data, error } = await db.supabase
            .from('naver_oauth_tokens')
            .select('user_id')
            .eq('user_id', userIdStr)
            .eq('is_active', true)  // ✅ 활성 토큰만 확인
            .maybeSingle();
        
        if (error) {
            console.error(`[토큰 관리] 토큰 확인 실패:`, error);
            return false;
        }
        
        if (data) {
            console.log(`[토큰 관리] 토큰 확인 성공 (정확 매칭, active): user_id=${userIdStr}`);
            return true;
        }
        
        // 2순위: 숫자 ID인 경우, DB의 모든 user_id와 비교 (부분 매칭)
        // DB에 암호화된 값이 저장되어 있을 수 있으므로, 숫자 ID가 포함되어 있는지 확인
        if (/^\d+$/.test(userIdStr)) {
            // 모든 토큰 조회하여 user_id에 숫자 ID가 포함되어 있는지 확인
            const { data: allTokens, error: allError } = await db.supabase
                .from('naver_oauth_tokens')
                .select('user_id');
            
            if (!allError && allTokens) {
                for (const token of allTokens) {
                    // user_id에 숫자 ID가 포함되어 있는지 확인
                    if (token.user_id && token.user_id.includes(userIdStr)) {
                        console.log(`[토큰 관리] 토큰 확인 성공 (부분 매칭): user_id=${userIdStr}, DB값=${token.user_id}`);
                        return true;
                    }
                }
            }
        }
        
        // 3순위: LIKE 검색 (암호화된 값에 숫자 ID가 포함되어 있을 수 있음)
        if (/^\d+$/.test(userIdStr)) {
            const { data: likeData, error: likeError } = await db.supabase
                .from('naver_oauth_tokens')
                .select('user_id')
                .like('user_id', `%${userIdStr}%`)
                .maybeSingle();
            
            if (!likeError && likeData) {
                console.log(`[토큰 관리] 토큰 확인 성공 (LIKE 매칭): user_id=${userIdStr}, DB값=${likeData.user_id}`);
                return true;
            }
        }
        
        console.log(`[토큰 관리] 토큰 확인 실패: user_id=${userIdStr}, 모든 매칭 시도 실패`);
        return false;
    } catch (err) {
        console.error(`[토큰 관리] 토큰 확인 예외:`, err.message);
        return false;
    }
}

/**
 * 사용자 토큰 삭제 (연동 해제 - 요구사항에 없지만 유틸로 제공)
 * @param {string} userId - 사용자 ID
 */
async function deleteNaverToken(userId) {
    try {
        const { error } = await db.supabase
            .from('naver_oauth_tokens')
            .delete()
            .eq('user_id', userId);
        
        if (error) {
            console.error(`[토큰 관리] 토큰 삭제 실패:`, error);
            return false;
        }
        
        console.log(`[토큰 관리] 토큰 삭제 완료: user_id=${userId}`);
        return true;
    } catch (err) {
        console.error(`[토큰 관리] 토큰 삭제 예외:`, err.message);
        return false;
    }
}

module.exports = {
    getValidNaverAccessToken,
    hasNaverToken,
    deleteNaverToken
};

