/**
 * 네이버 OAuth 인증 라우트
 * Access Token 발급을 위한 웹 인터페이스 제공
 */

const express = require('express');
const router = express.Router();
const { getAuthorizationUrl, exchangeCodeForToken, validateAccessToken } = require('../integrations/naverCafe/naverOAuth');
const { saveToken } = require('../integrations/naverCafe/tokenManager');
const crypto = require('crypto');

/**
 * OAuth 인증 시작 (Authorization URL 생성)
 */
router.get('/authorize', (req, res) => {
    try {
        const clientId = process.env.NAVER_CLIENT_ID;
        const redirectUri = process.env.NAVER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/naver/oauth/callback`;
        
        if (!clientId) {
            return res.status(400).send(`
                <html>
                    <head><title>네이버 OAuth 설정 오류</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 50px;">
                        <h1>설정 오류</h1>
                        <p>NAVER_CLIENT_ID가 환경변수에 설정되지 않았습니다.</p>
                        <p>.env 파일에 다음을 추가하세요:</p>
                        <pre>NAVER_CLIENT_ID=your_client_id
NAVER_REDIRECT_URI=${redirectUri}</pre>
                    </body>
                </html>
            `);
        }
        
        // CSRF 방지를 위한 state 생성
        const state = crypto.randomBytes(16).toString('hex');
        
        // 세션에 state 저장 (간단하게 쿠키나 세션 사용 가능하지만, 여기서는 간단하게 처리)
        const authUrl = getAuthorizationUrl(clientId, redirectUri, state);
        
        res.send(`
            <html>
                <head>
                    <title>네이버 OAuth 인증</title>
                    <meta charset="utf-8">
                </head>
                <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
                    <h1>네이버 OAuth 인증</h1>
                    <p>아래 버튼을 클릭하여 네이버 로그인 및 권한 승인을 진행하세요.</p>
                    <p style="margin: 30px 0;">
                        <a href="${authUrl}" 
                           style="display: inline-block; padding: 15px 30px; background-color: #03C75A; 
                                  color: white; text-decoration: none; border-radius: 5px; font-size: 16px;">
                            네이버 로그인 및 권한 승인
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 30px;">
                        인증 후 리다이렉트된 URL에서 code 파라미터를 복사하여 사용하세요.
                    </p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('[네이버 OAuth] 인증 URL 생성 오류:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * OAuth Callback (Authorization Code를 Access Token으로 교환)
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        
        if (error) {
            return res.status(400).send(`
                <html>
                    <head><title>인증 오류</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 50px;">
                        <h1>인증 오류</h1>
                        <p>오류: ${error}</p>
                        <p><a href="/api/naver/oauth/authorize">다시 시도</a></p>
                    </body>
                </html>
            `);
        }
        
        if (!code) {
            return res.status(400).send(`
                <html>
                    <head><title>인증 코드 없음</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 50px;">
                        <h1>인증 코드를 받지 못했습니다</h1>
                        <p><a href="/api/naver/oauth/authorize">다시 시도</a></p>
                    </body>
                </html>
            `);
        }
        
        const clientId = process.env.NAVER_CLIENT_ID;
        const clientSecret = process.env.NAVER_CLIENT_SECRET;
        const redirectUri = process.env.NAVER_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/naver/oauth/callback`;
        
        if (!clientId || !clientSecret) {
            return res.status(500).send(`
                <html>
                    <head><title>설정 오류</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 50px;">
                        <h1>설정 오류</h1>
                        <p>NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.</p>
                    </body>
                </html>
            `);
        }
        
        // Authorization Code를 Access Token으로 교환
        const result = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);
        
        if (result.success) {
            // 토큰 유효성 검증 및 사용자 정보 가져오기
            let userInfo = null;
            try {
                const validation = await validateAccessToken(result.access_token);
                if (validation.valid && validation.user_info) {
                    userInfo = validation.user_info;
                }
            } catch (err) {
                console.warn('[네이버 OAuth] 사용자 정보 가져오기 실패 (무시):', err.message);
            }
            
            // DB에 토큰 저장
            const saveResult = await saveToken({
                access_token: result.access_token,
                refresh_token: result.refresh_token,
                expires_in: result.expires_in,
                token_type: result.token_type || 'bearer',
                user_id: userInfo?.id || null,
                user_name: userInfo?.name || null
            });
            
            if (!saveResult) {
                console.error('[네이버 OAuth] 토큰 DB 저장 실패 (토큰은 발급되었지만 저장되지 않음)');
            } else {
                console.log('[네이버 OAuth] 토큰 DB 저장 완료');
            }
            res.send(`
                <html>
                    <head>
                        <title>Access Token 발급 완료</title>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: Arial, sans-serif; padding: 50px; max-width: 800px; margin: 0 auto; }
                            .token-box { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
                            .token { font-family: monospace; word-break: break-all; background: white; padding: 10px; border: 1px solid #ddd; }
                            .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
                            .success { background: #d4edda; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0; }
                            button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
                        </style>
                    </head>
                    <body>
                        <h1>✅ Access Token 발급 완료!</h1>
                        
                        <div class="success">
                            <strong>성공:</strong> Access Token이 발급되었습니다.${saveResult ? ' DB에 자동 저장되었습니다.' : ' (DB 저장 실패 - 수동 설정 필요)'}
                        </div>
                        
                        <h2>발급된 토큰 정보</h2>
                        
                        <div class="token-box">
                            <h3>Access Token</h3>
                            <div class="token" id="accessToken">${result.access_token}</div>
                            <button onclick="copyToClipboard('accessToken')">복사</button>
                        </div>
                        
                        ${result.refresh_token ? `
                        <div class="token-box">
                            <h3>Refresh Token</h3>
                            <div class="token" id="refreshToken">${result.refresh_token}</div>
                            <button onclick="copyToClipboard('refreshToken')">복사</button>
                        </div>
                        ` : ''}
                        
                        <div class="token-box">
                            <h3>토큰 정보</h3>
                            <p><strong>Token Type:</strong> ${result.token_type || 'bearer'}</p>
                            <p><strong>Expires In:</strong> ${result.expires_in || '3600'}초 (약 ${Math.floor((result.expires_in || 3600) / 60)}분)</p>
                        </div>
                        
                        <div class="warning">
                            <strong>⚠️ 중요:</strong>
                            <ol>
                                ${saveResult ? '<li>✅ 토큰이 DB에 자동 저장되었습니다. 이제 자동으로 관리됩니다.</li>' : '<li>토큰이 DB에 저장되지 않았습니다. 위 Access Token을 복사하여 .env 파일의 <code>NAVER_ACCESS_TOKEN</code>에 설정하세요.</li>'}
                                <li>토큰은 약 1시간 후 만료됩니다.${result.refresh_token ? ' Refresh Token으로 자동 갱신됩니다.' : ' 만료되면 다시 발급받아야 합니다.'}</li>
                                ${result.refresh_token ? '<li>✅ Refresh Token이 저장되어 자동 갱신이 활성화되었습니다.</li>' : ''}
                            </ol>
                        </div>
                        
                        <h2>.env 파일 예시</h2>
                        <div class="token-box">
                            <pre style="background: white; padding: 15px; border: 1px solid #ddd; overflow-x: auto;">
NAVER_ACCESS_TOKEN=${result.access_token}
${result.refresh_token ? `NAVER_REFRESH_TOKEN=${result.refresh_token}` : ''}
                            </pre>
                        </div>
                        
                        <p>
                            <a href="/admin">
                                <button>관리자 페이지로 이동</button>
                            </a>
                        </p>
                        
                        <script>
                            function copyToClipboard(elementId) {
                                const element = document.getElementById(elementId);
                                const text = element.textContent;
                                navigator.clipboard.writeText(text).then(() => {
                                    alert('복사되었습니다!');
                                }).catch(err => {
                                    // Fallback for older browsers
                                    const textArea = document.createElement('textarea');
                                    textArea.value = text;
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(textArea);
                                    alert('복사되었습니다!');
                                });
                            }
                        </script>
                    </body>
                </html>
            `);
        } else {
            res.status(400).send(`
                <html>
                    <head><title>토큰 발급 실패</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 50px;">
                        <h1>토큰 발급 실패</h1>
                        <p><strong>오류:</strong> ${result.error || '알 수 없는 오류'}</p>
                        <p><strong>설명:</strong> ${result.error_description || result.message || ''}</p>
                        <p><a href="/api/naver/oauth/authorize">다시 시도</a></p>
                    </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('[네이버 OAuth] Callback 처리 오류:', error);
        res.status(500).send(`
            <html>
                <head><title>서버 오류</title></head>
                <body style="font-family: Arial, sans-serif; padding: 50px;">
                    <h1>서버 오류</h1>
                    <p>${error.message}</p>
                    <p><a href="/api/naver/oauth/authorize">다시 시도</a></p>
                </body>
            </html>
        `);
    }
});

module.exports = router;

