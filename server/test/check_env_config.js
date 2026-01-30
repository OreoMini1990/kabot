/**
 * 환경변수 설정 확인 스크립트
 */

require('dotenv').config();

console.log('='.repeat(60));
console.log('네이버 카페 환경변수 설정 확인');
console.log('='.repeat(60));
console.log('');

const envVars = {
    'NAVER_CAFE_ENABLED': process.env.NAVER_CAFE_ENABLED,
    'NAVER_CAFE_CLUBID': process.env.NAVER_CAFE_CLUBID,
    'NAVER_CAFE_MENUID': process.env.NAVER_CAFE_MENUID,
    'NAVER_CLIENT_ID': process.env.NAVER_CLIENT_ID ? '설정됨' : '없음',
    'NAVER_CLIENT_SECRET': process.env.NAVER_CLIENT_SECRET ? '설정됨' : '없음',
    'NAVER_REDIRECT_URI': process.env.NAVER_REDIRECT_URI || '자동 설정됨'
};

console.log('필수 환경변수:');
Object.entries(envVars).forEach(([key, value]) => {
    const status = value ? '✅' : '❌';
    console.log(`  ${status} ${key}: ${value || '설정 안 됨'}`);
});

console.log('');
console.log('='.repeat(60));
console.log('');

// DB 토큰 확인
async function checkDBToken() {
    try {
        const { getValidAccessToken } = require('../integrations/naverCafe/tokenManager');
        const token = await getValidAccessToken();
        if (token) {
            console.log('✅ DB에서 토큰을 가져올 수 있습니다.');
            console.log(`   토큰 길이: ${token.length}자`);
        } else {
            console.log('❌ DB에서 토큰을 가져올 수 없습니다.');
            console.log('   환경변수 NAVER_ACCESS_TOKEN 또는 OAuth callback을 통해 토큰을 설정하세요.');
        }
    } catch (error) {
        console.log('⚠️ DB 토큰 확인 실패:', error.message);
    }
}

checkDBToken().then(() => {
    console.log('');
    console.log('='.repeat(60));
    process.exit(0);
}).catch((error) => {
    console.error('오류:', error.message);
    process.exit(1);
});










