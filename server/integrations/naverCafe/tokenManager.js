/**
 * 네이버 OAuth 토큰 자동 관리 서비스
 * - 토큰 저장 및 조회
 * - 토큰 만료 시 자동 갱신
 * - 토큰 유효성 검증
 */

const db = require('../../db/database');
const { refreshAccessToken, validateAccessToken } = require('./naverOAuth');

// 환경변수에서 Client ID/Secret 가져오기
const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

/**
 * 활성 토큰 조회 (DB에서)
 * @returns {Promise<Object|null>} { access_token, refresh_token, expires_at, ... }
 */
async function getActiveToken() {
    try {
        // Supabase 사용 시
        if (db.supabase) {
            const { data, error } = await db.supabase
                .from('naver_oauth_tokens')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                console.error('[토큰 관리] DB 조회 오류:', error);
                return null;
            }
            
            return data || null;
        }
        
        // SQLite 호환 인터페이스 사용 시
        const token = await db.prepare(
            'SELECT * FROM naver_oauth_tokens WHERE is_active = ? ORDER BY created_at DESC LIMIT 1'
        ).get(true);
        
        return token || null;
    } catch (error) {
        console.error('[토큰 관리] 활성 토큰 조회 실패:', error.message);
        return null;
    }
}

/**
 * 유효한 Access Token 가져오기 (만료 시 자동 갱신)
 * @returns {Promise<string|null>} Access Token 또는 null
 */
async function getValidAccessToken() {
    try {
        // 1. DB에서 활성 토큰 조회
        let tokenData = await getActiveToken();
        
        // 2. DB에 토큰이 없으면 환경변수에서 가져오기 (기존 방식 호환)
        if (!tokenData) {
            const envToken = process.env.NAVER_ACCESS_TOKEN;
            if (envToken && envToken.trim() !== '') {
                console.log('[토큰 관리] DB에 토큰이 없어 환경변수에서 가져옴');
                return envToken;
            }
            return null;
        }
        
        // 3. 토큰 만료 여부 확인
        const now = new Date();
        const expiresAt = new Date(tokenData.expires_at);
        
        // 만료 5분 전이면 갱신 (안전 마진)
        const refreshThreshold = new Date(expiresAt.getTime() - 5 * 60 * 1000);
        
        if (now >= refreshThreshold) {
            console.log('[토큰 관리] 토큰 만료 임박 또는 만료됨, 갱신 시도...');
            
            // Refresh Token으로 새 Access Token 발급
            if (!tokenData.refresh_token) {
                console.error('[토큰 관리] Refresh Token이 없어 갱신 불가');
                return tokenData.access_token; // 기존 토큰 반환 (만료되었을 수 있음)
            }
            
            if (!CLIENT_ID || !CLIENT_SECRET) {
                console.error('[토큰 관리] CLIENT_ID 또는 CLIENT_SECRET이 설정되지 않음');
                return tokenData.access_token; // 기존 토큰 반환
            }
            
            const refreshResult = await refreshAccessToken(
                tokenData.refresh_token,
                CLIENT_ID,
                CLIENT_SECRET
            );
            
            if (refreshResult.success) {
                // 새 토큰 DB에 저장
                await saveToken({
                    access_token: refreshResult.access_token,
                    refresh_token: refreshResult.refresh_token || tokenData.refresh_token,
                    expires_in: refreshResult.expires_in,
                    token_type: refreshResult.token_type || 'bearer'
                });
                
                console.log('[토큰 관리] 토큰 갱신 성공');
                return refreshResult.access_token;
            } else {
                console.error('[토큰 관리] 토큰 갱신 실패:', refreshResult.error);
                return tokenData.access_token; // 기존 토큰 반환
            }
        }
        
        // 4. 토큰 유효성 검증 (선택사항, 성능을 위해 주석 처리 가능)
        // const validation = await validateAccessToken(tokenData.access_token);
        // if (!validation.valid) {
        //     console.warn('[토큰 관리] 토큰이 유효하지 않음, 갱신 시도...');
        //     // 갱신 로직...
        // }
        
        return tokenData.access_token;
    } catch (error) {
        console.error('[토큰 관리] 유효한 토큰 가져오기 실패:', error.message);
        return null;
    }
}

/**
 * 토큰 저장 (DB에)
 * @param {Object} tokenData - { access_token, refresh_token, expires_in, token_type, user_id, user_name }
 * @returns {Promise<boolean>} 성공 여부
 */
async function saveToken(tokenData) {
    try {
        const {
            access_token,
            refresh_token,
            expires_in = 3600,
            token_type = 'bearer',
            user_id,
            user_name
        } = tokenData;
        
        if (!access_token) {
            console.error('[토큰 관리] Access Token이 없어 저장 불가');
            return false;
        }
        
        // 만료 시각 계산
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expires_in * 1000);
        
        // 기존 활성 토큰 비활성화
        if (db.supabase) {
            // Supabase 사용 시
            await db.supabase
                .from('naver_oauth_tokens')
                .update({ is_active: false })
                .eq('is_active', true);
            
            // 새 토큰 저장
            const { error } = await db.supabase
                .from('naver_oauth_tokens')
                .insert({
                    access_token,
                    refresh_token: refresh_token || null,
                    token_type,
                    expires_in,
                    expires_at: expiresAt.toISOString(),
                    user_id: user_id || null,
                    user_name: user_name || null,
                    is_active: true
                });
            
            if (error) {
                console.error('[토큰 관리] 토큰 저장 실패:', error);
                return false;
            }
        } else {
            // SQLite 호환 인터페이스 사용 시
            // 기존 활성 토큰 비활성화
            await db.prepare(
                'UPDATE naver_oauth_tokens SET is_active = ? WHERE is_active = ?'
            ).run(false, true);
            
            // 새 토큰 저장
            await db.prepare(`
                INSERT INTO naver_oauth_tokens 
                (access_token, refresh_token, token_type, expires_in, expires_at, user_id, user_name, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                access_token,
                refresh_token || null,
                token_type,
                expires_in,
                expiresAt.toISOString(),
                user_id || null,
                user_name || null,
                true
            );
        }
        
        console.log('[토큰 관리] 토큰 저장 완료');
        return true;
    } catch (error) {
        console.error('[토큰 관리] 토큰 저장 실패:', error.message);
        return false;
    }
}

/**
 * 토큰 유효성 검증 및 필요시 갱신
 * @param {string} accessToken - 검증할 Access Token
 * @returns {Promise<Object>} { valid, token, refreshed }
 */
async function validateAndRefreshToken(accessToken) {
    try {
        // 토큰 유효성 검증
        const validation = await validateAccessToken(accessToken);
        
        if (validation.valid) {
            return {
                valid: true,
                token: accessToken,
                refreshed: false
            };
        }
        
        // 토큰이 유효하지 않으면 갱신 시도
        console.log('[토큰 관리] 토큰이 유효하지 않아 갱신 시도...');
        
        const tokenData = await getActiveToken();
        if (!tokenData || !tokenData.refresh_token) {
            return {
                valid: false,
                token: null,
                refreshed: false,
                error: 'Refresh Token이 없습니다'
            };
        }
        
        if (!CLIENT_ID || !CLIENT_SECRET) {
            return {
                valid: false,
                token: null,
                refreshed: false,
                error: 'CLIENT_ID 또는 CLIENT_SECRET이 설정되지 않았습니다'
            };
        }
        
        const refreshResult = await refreshAccessToken(
            tokenData.refresh_token,
            CLIENT_ID,
            CLIENT_SECRET
        );
        
        if (refreshResult.success) {
            await saveToken({
                access_token: refreshResult.access_token,
                refresh_token: refreshResult.refresh_token || tokenData.refresh_token,
                expires_in: refreshResult.expires_in,
                token_type: refreshResult.token_type || 'bearer'
            });
            
            return {
                valid: true,
                token: refreshResult.access_token,
                refreshed: true
            };
        } else {
            return {
                valid: false,
                token: null,
                refreshed: false,
                error: refreshResult.error || '토큰 갱신 실패'
            };
        }
    } catch (error) {
        console.error('[토큰 관리] 토큰 검증 및 갱신 실패:', error.message);
        return {
            valid: false,
            token: null,
            refreshed: false,
            error: error.message
        };
    }
}

module.exports = {
    getActiveToken,
    getValidAccessToken,
    saveToken,
    validateAndRefreshToken
};

