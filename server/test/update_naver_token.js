/**
 * 네이버 OAuth 토큰 업데이트 스크립트
 * 
 * 사용법:
 *   node server/test/update_naver_token.js
 */

const { saveToken } = require('../integrations/naverCafe/tokenManager');

// 새 토큰 정보
const NEW_ACCESS_TOKEN = 'AAAANcpebqA2SaVgNqUtsMcbyhWysFQ8HOpxKeF+joHCwyGtjPf8eS8egW6U1Xcp4eGyhm5NrSLDQPgWfLxPlkb/Aic=';
const NEW_REFRESH_TOKEN = 'vErYoPnkpp7isGzbtBqHQeJy9uhgSTxgWOqaFcbhTzJ6wwws9C3Q72I0ZcVWkalY9PfwyeDEOWisK5GMnSnyb3pdXhGCI0VapZQAHsbisHsOr4ie';

async function updateToken() {
    try {
        console.log('='.repeat(60));
        console.log('네이버 OAuth 토큰 업데이트');
        console.log('='.repeat(60));
        console.log('');
        
        console.log('📝 새 토큰 정보:');
        console.log(`   Access Token: ${NEW_ACCESS_TOKEN.substring(0, 30)}...`);
        console.log(`   Refresh Token: ${NEW_REFRESH_TOKEN.substring(0, 30)}...`);
        console.log('');
        
        // 토큰 저장 (expires_in 기본값 3600초 = 1시간)
        const result = await saveToken({
            access_token: NEW_ACCESS_TOKEN,
            refresh_token: NEW_REFRESH_TOKEN,
            expires_in: 3600, // 1시간 (네이버 기본값)
            token_type: 'bearer'
        });
        
        if (result) {
            console.log('✅ 토큰 저장 성공!');
            console.log('');
            console.log('다음 단계:');
            console.log('  1. 테스트 스크립트 실행: node server/test/test_naver_cafe_image.js');
            console.log('  2. 또는 PowerShell: .\\server\\test\\test_naver_cafe_image.ps1');
        } else {
            console.error('❌ 토큰 저장 실패');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        if (error.stack) {
            console.error('');
            console.error('스택 트레이스:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

updateToken()
    .then(() => {
        console.log('');
        console.log('='.repeat(60));
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('실행 실패:', error.message);
        process.exit(1);
    });

