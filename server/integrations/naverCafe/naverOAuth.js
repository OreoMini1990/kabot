/**
 * 네이버 OAuth 2.0 인증 및 토큰 관리
 * 참고: https://developers.naver.com/docs/login/overview/
 */

const axios = require('axios');
const querystring = require('querystring');

/**
 * Authorization Code를 Access Token으로 교환
 * @param {string} code - Authorization Code
 * @param {string} clientId - 네이버 Client ID
 * @param {string} clientSecret - 네이버 Client Secret
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} { access_token, refresh_token, expires_in, token_type }
 */
async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
    try {
        const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
        
        const params = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code: code,
            state: 'STATE_STRING'  // CSRF 방지용 (실제로는 랜덤 문자열 사용)
        };
        
        const response = await axios.post(tokenUrl, querystring.stringify(params), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (response.data.access_token) {
            return {
                success: true,
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in,
                token_type: response.data.token_type
            };
        } else {
            return {
                success: false,
                error: response.data.error || '토큰 발급 실패',
                error_description: response.data.error_description
            };
        }
    } catch (error) {
        console.error('[네이버 OAuth] 토큰 교환 실패:', error.message);
        return {
            success: false,
            error: 'network_error',
            message: error.message
        };
    }
}

/**
 * Refresh Token으로 Access Token 갱신
 * @param {string} refreshToken - Refresh Token
 * @param {string} clientId - 네이버 Client ID
 * @param {string} clientSecret - 네이버 Client Secret
 * @returns {Promise<Object>} { access_token, refresh_token, expires_in }
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
    try {
        const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
        
        const params = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        };
        
        const response = await axios.post(tokenUrl, querystring.stringify(params), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        if (response.data.access_token) {
            return {
                success: true,
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token || refreshToken,  // 새 refresh_token이 없으면 기존 것 사용
                expires_in: response.data.expires_in
            };
        } else {
            return {
                success: false,
                error: response.data.error || '토큰 갱신 실패',
                error_description: response.data.error_description
            };
        }
    } catch (error) {
        console.error('[네이버 OAuth] 토큰 갱신 실패:', error.message);
        return {
            success: false,
            error: 'network_error',
            message: error.message
        };
    }
}

/**
 * Access Token 유효성 검증
 * @param {string} accessToken - Access Token
 * @returns {Promise<Object>} { valid, user_info }
 */
async function validateAccessToken(accessToken) {
    try {
        const apiUrl = 'https://openapi.naver.com/v1/nid/me';
        
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.data && response.data.response) {
            return {
                valid: true,
                user_info: response.data.response
            };
        } else {
            return {
                valid: false,
                error: '토큰 검증 실패'
            };
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            return {
                valid: false,
                error: '토큰 만료 또는 무효'
            };
        }
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * 네이버 OAuth 인증 URL 생성
 * @param {string} clientId - 네이버 Client ID
 * @param {string} redirectUri - Redirect URI
 * @param {string} state - CSRF 방지용 랜덤 문자열
 * @returns {string} 인증 URL
 */
function getAuthorizationUrl(clientId, redirectUri, state = 'STATE_STRING') {
    const params = {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state
    };
    
    return `https://nid.naver.com/oauth2.0/authorize?${querystring.stringify(params)}`;
}

module.exports = {
    exchangeCodeForToken,
    refreshAccessToken,
    validateAccessToken,
    getAuthorizationUrl
};



















