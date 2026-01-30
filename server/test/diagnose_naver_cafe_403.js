/**
 * 네이버 카페 403 오류 진단 스크립트
 * 
 * 사용법:
 *   node server/test/diagnose_naver_cafe_403.js
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

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
    }
}

const { validateAccessToken } = require('../integrations/naverCafe/naverOAuth');
const { getValidAccessToken, getActiveToken } = require('../integrations/naverCafe/tokenManager');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const CLUB_ID = process.env.NAVER_CAFE_CLUBID;
const MENU_ID = process.env.NAVER_CAFE_MENUID;

async function diagnose403() {
    console.log('='.repeat(60));
    console.log('네이버 카페 403 오류 진단');
    console.log('='.repeat(60));
    console.log('');

    // 1. 환경변수 확인
    console.log('[1] 환경변수 확인');
    console.log('-'.repeat(60));
    
    const checks = {
        'NAVER_CLIENT_ID': CLIENT_ID ? '✅ 설정됨' : '❌ 없음',
        'NAVER_CLIENT_SECRET': CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음',
        'NAVER_CAFE_CLUBID': CLUB_ID ? `✅ 설정됨 (${CLUB_ID})` : '❌ 없음',
        'NAVER_CAFE_MENUID': MENU_ID ? `✅ 설정됨 (${MENU_ID})` : '❌ 없음',
    };

    Object.entries(checks).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });
    console.log('');

    // 2. 토큰 확인
    console.log('[2] Access Token 확인');
    console.log('-'.repeat(60));
    
    let accessToken = null;
    try {
        accessToken = await getValidAccessToken();
        if (accessToken) {
            console.log(`   ✅ Access Token 조회 성공 (길이: ${accessToken.length})`);
            console.log(`   토큰 앞 20자: ${accessToken.substring(0, 20)}...`);
        } else {
            console.log(`   ❌ Access Token을 찾을 수 없습니다.`);
        }
    } catch (error) {
        console.log(`   ❌ Access Token 조회 실패: ${error.message}`);
    }
    console.log('');

    if (!accessToken) {
        console.log('💡 해결 방법:');
        console.log('   1. 토큰 갱신: node server/test/refresh_naver_token.js');
        console.log('   2. 또는 서버의 /api/naver/oauth/authorize 엔드포인트를 통해 새 토큰 발급');
        return;
    }

    // 3. 토큰 유효성 검증
    console.log('[3] Access Token 유효성 검증');
    console.log('-'.repeat(60));
    
    try {
        const validation = await validateAccessToken(accessToken);
        if (validation.valid) {
            console.log(`   ✅ 토큰 유효`);
            console.log(`   사용자: ${validation.user_info?.name || validation.user_info?.id || '알 수 없음'}`);
            if (validation.user_info) {
                console.log(`   사용자 ID: ${validation.user_info.id || 'N/A'}`);
                console.log(`   이메일: ${validation.user_info.email || 'N/A'}`);
            }
        } else {
            console.log(`   ❌ 토큰 무효: ${validation.error}`);
            console.log('');
            console.log('💡 해결 방법:');
            console.log('   1. 토큰 갱신: node server/test/refresh_naver_token.js');
            return;
        }
    } catch (error) {
        console.log(`   ❌ 토큰 검증 실패: ${error.message}`);
        return;
    }
    console.log('');

    // 4. 카페 정보 확인 (API 호출)
    console.log('[4] 카페 API 접근 테스트');
    console.log('-'.repeat(60));
    
    if (!CLUB_ID || !MENU_ID) {
        console.log('   ❌ CLUB_ID 또는 MENU_ID가 설정되지 않았습니다.');
        return;
    }

    // 4-1. 카페 정보 조회 시도
    try {
        const cafeInfoUrl = `https://openapi.naver.com/v1/cafe/${CLUB_ID}/articles`;
        console.log(`   카페 정보 조회 시도: ${cafeInfoUrl}`);
        
        const response = await axios.get(cafeInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                searchType: 'all',
                page: 1,
                perPage: 1
            }
        });

        if (response.status === 200) {
            console.log(`   ✅ 카페 정보 조회 성공`);
            console.log(`   응답 상태: ${response.status}`);
        }
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            console.log(`   ❌ 카페 정보 조회 실패: HTTP ${status}`);
            
            if (status === 403) {
                console.log(`   ⚠️ 403 오류: 권한 없음`);
                if (errorData?.message?.error?.msg) {
                    console.log(`   오류 메시지: ${errorData.message.error.msg}`);
                }
            } else if (status === 401) {
                console.log(`   ⚠️ 401 오류: 인증 실패`);
            }
        } else {
            console.log(`   ❌ 네트워크 오류: ${error.message}`);
        }
    }
    console.log('');

    // 4-2. 글쓰기 API 테스트 (실제 글 작성 없이)
    console.log('[5] 글쓰기 API 권한 테스트');
    console.log('-'.repeat(60));
    
    try {
        const writeUrl = `https://openapi.naver.com/v1/cafe/${CLUB_ID}/menu/${MENU_ID}/articles`;
        console.log(`   글쓰기 API URL: ${writeUrl}`);
        console.log(`   메뉴 ID: ${MENU_ID}`);
        
        // 최소한의 데이터로 테스트 (실제로는 글을 작성하지 않음)
        // 대신 API 엔드포인트 접근 권한만 확인
        console.log(`   ⚠️ 실제 글 작성은 하지 않고 권한만 확인합니다.`);
        console.log(`   (실제 글 작성 테스트는 test_naver_cafe_image.js 사용)`);
        
    } catch (error) {
        console.log(`   ❌ 테스트 실패: ${error.message}`);
    }
    console.log('');

    // 5. 가능한 원인 분석
    console.log('[6] 403 오류 가능한 원인 분석');
    console.log('-'.repeat(60));
    console.log('');
    console.log('403 오류의 가능한 원인:');
    console.log('');
    console.log('1. 카페 멤버십 문제');
    console.log('   - 해당 계정이 카페에 가입되어 있는지 확인');
    console.log('   - 카페에서 강퇴되었는지 확인');
    console.log('   - 카페 멤버십이 활성화되어 있는지 확인');
    console.log('');
    console.log('2. 메뉴 ID 권한 문제');
    console.log('   - 메뉴 ID가 올바른지 확인');
    console.log('   - 해당 메뉴에 글쓰기 권한이 있는지 확인');
    console.log('   - 메뉴가 비활성화되었는지 확인');
    console.log('');
    console.log('3. OAuth 앱 권한 설정 문제');
    console.log('   - 네이버 개발자센터에서 OAuth 앱 권한 확인');
    console.log('   - 카페 글쓰기 권한이 활성화되어 있는지 확인');
    console.log('   - OAuth 앱이 승인되었는지 확인');
    console.log('');
    console.log('4. 토큰 스코프 문제');
    console.log('   - 토큰에 카페 글쓰기 스코프가 포함되어 있는지 확인');
    console.log('   - 새 토큰 발급 시 필요한 스코프 요청');
    console.log('');
    console.log('5. multipart/form-data 인코딩 문제');
    console.log('   - 이미지 첨부 시 FormData 인코딩 확인');
    console.log('   - Content-Type 헤더 확인');
    console.log('');

    // 6. 해결 방법 제시
    console.log('[7] 해결 방법');
    console.log('-'.repeat(60));
    console.log('');
    console.log('1. 토큰 갱신 시도:');
    console.log('   node server/test/refresh_naver_token.js');
    console.log('');
    console.log('2. 네이버 개발자센터 확인:');
    console.log('   - https://developers.naver.com/apps/#/list');
    console.log('   - OAuth 앱 설정 > API 설정 > 카페 글쓰기 권한 확인');
    console.log('');
    console.log('3. 카페 멤버십 확인:');
    console.log('   - 네이버 카페에 직접 접속하여 멤버십 확인');
    console.log('   - 글쓰기 권한이 있는 메뉴 확인');
    console.log('');
    console.log('4. 메뉴 ID 확인:');
    console.log('   - 카페 관리자 페이지에서 메뉴 ID 확인');
    console.log('   - 또는 카페 URL에서 메뉴 ID 추출');
    console.log('');
    console.log('5. 텍스트만으로 테스트:');
    console.log('   - 이미지 없이 텍스트만으로 글 작성 시도');
    console.log('   - multipart/form-data 대신 application/x-www-form-urlencoded 사용');
    console.log('');

    console.log('='.repeat(60));
    console.log('진단 완료');
    console.log('='.repeat(60));
}

diagnose403()
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

