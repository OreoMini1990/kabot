/**
 * 네이버 OAuth 토큰 강제 갱신 스크립트
 * 
 * 사용법:
 *   node server/test/refresh_naver_token.js
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// .env 파일 로드
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ .env 파일 로드: ${envPath}`);
} else {
    const rootEnvPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(rootEnvPath)) {
        dotenv.config({ path: rootEnvPath });
        console.log(`✅ .env 파일 로드: ${rootEnvPath}`);
    } else {
        dotenv.config();
        console.log(`⚠️ .env 파일을 찾을 수 없습니다.`);
    }
}

const { refreshAccessToken, validateAccessToken } = require('../integrations/naverCafe/naverOAuth');
const { getActiveToken, saveToken, getValidAccessToken } = require('../integrations/naverCafe/tokenManager');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.NAVER_REFRESH_TOKEN;

async function refreshToken() {
    console.log('='.repeat(60));
    console.log('네이버 OAuth 토큰 갱신');
    console.log('='.repeat(60));
    console.log('');

    // 1. 환경변수 확인
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('❌ NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.');
        process.exit(1);
    }

    console.log(`✅ CLIENT_ID: ${CLIENT_ID.substring(0, 10)}...`);
    console.log(`✅ CLIENT_SECRET: ${CLIENT_SECRET.substring(0, 10)}...`);
    console.log('');

    // 2. Refresh Token 가져오기 (DB 우선, 환경변수 fallback)
    let refreshToken = null;
    let tokenSource = null;

    try {
        // DB에서 토큰 조회
        const tokenData = await getActiveToken();
        if (tokenData && tokenData.refresh_token) {
            refreshToken = tokenData.refresh_token;
            tokenSource = 'DB';
            console.log('✅ DB에서 Refresh Token을 가져왔습니다.');
        }
    } catch (error) {
        console.warn('⚠️ DB에서 토큰 조회 실패:', error.message);
    }

    // 환경변수에서 가져오기
    if (!refreshToken && REFRESH_TOKEN) {
        refreshToken = REFRESH_TOKEN;
        tokenSource = '환경변수';
        console.log('✅ 환경변수에서 Refresh Token을 가져왔습니다.');
    }

    if (!refreshToken) {
        console.error('❌ Refresh Token을 찾을 수 없습니다.');
        console.error('');
        console.error('해결 방법:');
        console.error('  1. 서버 DB에 토큰이 저장되어 있는지 확인');
        console.error('  2. 또는 .env 파일에 NAVER_REFRESH_TOKEN 설정');
        console.error('  3. 또는 서버의 /api/naver/oauth/authorize 엔드포인트를 통해 새 토큰 발급');
        process.exit(1);
    }

    console.log(`   토큰 소스: ${tokenSource}`);
    console.log(`   Refresh Token: ${refreshToken.substring(0, 20)}... (길이: ${refreshToken.length})`);
    console.log('');

    // 3. 현재 Access Token 검증
    try {
        const currentToken = await getValidAccessToken();
        if (currentToken) {
            console.log('📋 현재 Access Token 검증 중...');
            const validation = await validateAccessToken(currentToken);
            if (validation.valid) {
                console.log(`✅ 현재 Access Token 유효: 사용자=${validation.user_info?.name || validation.user_info?.id || '알 수 없음'}`);
            } else {
                console.log(`⚠️ 현재 Access Token 무효: ${validation.error}`);
            }
            console.log('');
        }
    } catch (error) {
        console.warn('⚠️ 현재 토큰 검증 실패:', error.message);
        console.log('');
    }

    // 4. 토큰 갱신
    console.log('🔄 Access Token 갱신 시도...');
    console.log('');

    const refreshResult = await refreshAccessToken(refreshToken, CLIENT_ID, CLIENT_SECRET);

    if (refreshResult.success) {
        console.log('✅ 토큰 갱신 성공!');
        console.log('');
        console.log('새 토큰 정보:');
        console.log(`   Access Token: ${refreshResult.access_token.substring(0, 20)}... (길이: ${refreshResult.access_token.length})`);
        console.log(`   Refresh Token: ${refreshResult.refresh_token ? refreshResult.refresh_token.substring(0, 20) + '...' : '없음 (기존 사용)'}`);
        console.log(`   Expires In: ${refreshResult.expires_in}초 (${Math.floor(refreshResult.expires_in / 60)}분)`);
        console.log('');

        // 5. 새 토큰 검증
        console.log('📋 새 Access Token 검증 중...');
        const validation = await validateAccessToken(refreshResult.access_token);
        if (validation.valid) {
            console.log(`✅ 새 Access Token 유효: 사용자=${validation.user_info?.name || validation.user_info?.id || '알 수 없음'}`);
            if (validation.user_info) {
                console.log(`   사용자 ID: ${validation.user_info.id || 'N/A'}`);
                console.log(`   사용자 이름: ${validation.user_info.name || 'N/A'}`);
                console.log(`   이메일: ${validation.user_info.email || 'N/A'}`);
            }
        } else {
            console.log(`❌ 새 Access Token 무효: ${validation.error}`);
        }
        console.log('');

        // 6. DB에 저장
        console.log('💾 새 토큰을 DB에 저장 중...');
        const saveResult = await saveToken({
            access_token: refreshResult.access_token,
            refresh_token: refreshResult.refresh_token || refreshToken,
            expires_in: refreshResult.expires_in,
            token_type: 'bearer',
            user_id: validation.user_info?.id || null,
            user_name: validation.user_info?.name || null
        });

        if (saveResult) {
            console.log('✅ 토큰 저장 완료');
        } else {
            console.log('⚠️ 토큰 저장 실패 (하지만 토큰은 유효함)');
        }
        console.log('');

        console.log('='.repeat(60));
        console.log('토큰 갱신 완료');
        console.log('='.repeat(60));
        console.log('');
        console.log('💡 이제 다시 카페 글쓰기를 시도해보세요.');
        console.log('   node server/test/test_naver_cafe_image.js');

    } else {
        console.error('❌ 토큰 갱신 실패');
        console.error(`   오류: ${refreshResult.error || '알 수 없는 오류'}`);
        if (refreshResult.error_description) {
            console.error(`   설명: ${refreshResult.error_description}`);
        }
        console.log('');
        console.log('💡 해결 방법:');
        console.log('   1. Refresh Token이 만료되었을 수 있습니다.');
        console.log('   2. 서버의 /api/naver/oauth/authorize 엔드포인트를 통해 새 토큰을 발급받으세요.');
        console.log('   3. 네이버 개발자센터에서 OAuth 앱 설정을 확인하세요.');
        process.exit(1);
    }
}

refreshToken()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ 오류 발생:', error.message);
        if (error.stack) {
            console.error('');
            console.error('스택 트레이스:');
            console.error(error.stack);
        }
        process.exit(1);
    });

