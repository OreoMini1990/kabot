/**
 * 네이버 카페 API 이미지 업로드 테스트
 * 
 * 사용법:
 *   node server/test/test_naver_cafe_image.js
 * 
 * 환경변수 필요:
 *   - NAVER_ACCESS_TOKEN
 *   - NAVER_CAFE_CLUBID
 *   - NAVER_CAFE_MENUID
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// dotenv 설정: server 디렉토리의 .env 파일 로드
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ .env 파일 로드: ${envPath}`);
} else {
    // 루트 디렉토리의 .env도 시도
    const rootEnvPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(rootEnvPath)) {
        dotenv.config({ path: rootEnvPath });
        console.log(`✅ .env 파일 로드: ${rootEnvPath}`);
    } else {
        // 기본 dotenv 로드 (현재 디렉토리에서 찾기)
        dotenv.config();
        console.log(`⚠️ .env 파일을 찾을 수 없습니다. 환경변수를 직접 설정하거나 .env 파일을 생성하세요.`);
    }
}

// 테스트 이미지 경로 (여러 경로 시도)
const TEST_IMAGE_PATHS = [
    path.join(__dirname, 'catch.JPG'),  // server/test/catch.JPG
    path.join(__dirname, '..', 'test', 'catch.JPG'),  // 상위 디렉토리의 test
    path.join(process.cwd(), 'server', 'test', 'catch.JPG'),  // 절대 경로
    '/home/app/iris-core/admin/data/img/catch.JPG'  // 서버 환경
];

// 첫 번째로 존재하는 이미지 파일 경로 찾기
let TEST_IMAGE_PATH = null;
for (const imgPath of TEST_IMAGE_PATHS) {
    if (fs.existsSync(imgPath)) {
        TEST_IMAGE_PATH = imgPath;
        break;
    }
}

console.log('='.repeat(60));
console.log('네이버 카페 API 이미지 업로드 테스트');
console.log('='.repeat(60));
console.log('');

// 토큰 가져오기 함수 (DB 우선, 환경변수 fallback)
async function getAccessToken() {
    let accessToken = null;
    let tokenSource = null;
    
    // 1. DB에서 토큰 조회 시도
    try {
        const { getValidAccessToken } = require('../integrations/naverCafe/tokenManager');
        console.log('📡 서버 DB에서 토큰 조회 시도...');
        accessToken = await getValidAccessToken();
        if (accessToken) {
            tokenSource = 'DB';
            console.log('✅ DB에서 토큰을 가져왔습니다.');
            return { accessToken, tokenSource };
        }
    } catch (error) {
        console.warn('⚠️ DB에서 토큰 조회 실패 (환경변수로 fallback):', error.message);
    }
    
    // 2. 환경변수에서 가져오기
    accessToken = process.env.NAVER_ACCESS_TOKEN;
    if (accessToken) {
        tokenSource = '환경변수';
        console.log('✅ 환경변수에서 토큰을 가져왔습니다.');
        return { accessToken, tokenSource };
    }
    
    // 3. 토큰을 찾을 수 없음
    console.error('❌ NAVER_ACCESS_TOKEN을 찾을 수 없습니다.');
    console.error('');
    console.error('해결 방법:');
    console.error('  1. 서버 DB에 토큰이 저장되어 있는지 확인');
    console.error('  2. 또는 .env 파일 또는 환경변수에 NAVER_ACCESS_TOKEN 설정');
    console.error('  3. 또는 서버의 /api/naver/oauth/authorize 엔드포인트를 통해 토큰 발급');
    return { accessToken: null, tokenSource: null };
}

// 환경변수 확인
const clubid = process.env.NAVER_CAFE_CLUBID;
const menuid = process.env.NAVER_CAFE_MENUID;

if (!clubid || !menuid) {
    console.error('❌ NAVER_CAFE_CLUBID 또는 NAVER_CAFE_MENUID 환경변수가 설정되지 않았습니다.');
    process.exit(1);
}

// 이미지 파일 확인
if (!TEST_IMAGE_PATH) {
    console.error('❌ 테스트 이미지 파일을 찾을 수 없습니다.');
    console.error('');
    console.error('시도한 경로:');
    TEST_IMAGE_PATHS.forEach(p => console.error(`  - ${p}`));
    console.error('');
    console.error('이미지 파일 위치를 확인하거나 다른 경로를 지정하세요.');
    process.exit(1);
}

const imageStats = fs.statSync(TEST_IMAGE_PATH);
console.log(`✅ 테스트 이미지 확인: ${TEST_IMAGE_PATH}`);
console.log(`   파일 크기: ${imageStats.size} bytes`);
console.log('');

async function testImageUpload() {
    try {
        // 토큰 가져오기 (DB 우선, 환경변수 fallback)
        const { accessToken, tokenSource } = await getAccessToken();
        if (!accessToken) {
            process.exit(1);
        }
        
        console.log(`✅ 설정 확인 완료`);
        console.log(`   토큰 소스: ${tokenSource}`);
        console.log(`   CLUB_ID: ${clubid}`);
        console.log(`   MENU_ID: ${menuid}`);
        console.log(`   ACCESS_TOKEN: ${accessToken.substring(0, 20)}... (길이: ${accessToken.length})`);
        console.log('');
        
        // 이미지 파일 읽기
        const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
        console.log(`✅ 이미지 파일 읽기 완료: ${imageBuffer.length} bytes`);
        console.log('');

        // 실제 구현된 writeCafeArticle 함수 사용 (권장)
        console.log('📤 실제 서버 코드의 writeCafeArticle 함수 사용...');
        console.log('');
        
        const { writeCafeArticle } = require('../integrations/naverCafe/cafeWrite');
        
        // 인코딩 모드 확인
        const encodingMode = process.env.NAVER_MULTIPART_ENCODING_MODE || 'raw';
        console.log(`📝 인코딩 모드: ${encodingMode} (환경변수 NAVER_MULTIPART_ENCODING_MODE)`);
        console.log('');
        
        // 한글 테스트 제목/내용 (인코딩 문제 확인용)
        const subject = `[${encodingMode}] 이미지 업로드 테스트 - 한글 제목 테스트`;
        const content = `<font color="red">이미지 업로드 테스트입니다.</font><br>
        <p>인코딩 모드: <strong>${encodingMode}</strong></p>
        <p>이미지가 정상적으로 표시되는지 확인합니다.</p>
        <p>한글 인코딩 테스트: 가나다라마바사아자차카타파하</p>
        <p>특수문자 테스트: !@#$%^&*()_+-=[]{}|;':\",./<>?</p>`;
        
        console.log(`📝 제목: ${subject}`);
        console.log(`📝 내용: ${content.substring(0, 100)}...`);
        console.log('');
        
        const result = await writeCafeArticle({
            subject: subject,
            content: content,
            clubid: parseInt(clubid),
            menuid: parseInt(menuid),
            accessToken: accessToken,
            images: [imageBuffer]  // Buffer 배열로 전달
        });

        console.log('');
        console.log('📥 writeCafeArticle 결과:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');

        if (result.success) {
            console.log('✅ 글 작성 성공!');
            if (result.articleUrl) {
                console.log(`   글 URL: ${result.articleUrl}`);
            }
            if (result.articleId) {
                console.log(`   글 ID: ${result.articleId}`);
            }
            console.log('');
            console.log('브라우저에서 위 URL을 열어서 이미지가 정상적으로 표시되는지 확인하세요.');
        } else {
            console.log('❌ 글 작성 실패');
            console.log(`   오류: ${result.error || '알 수 없는 오류'}`);
            console.log(`   메시지: ${result.message || '없음'}`);
            if (result.statusCode) {
                console.log(`   HTTP 상태 코드: ${result.statusCode}`);
            }
            if (result.errorDetails) {
                console.log('');
                console.log('📋 네이버 API 오류 상세:');
                console.log(JSON.stringify(result.errorDetails, null, 2));
            }
            console.log('');
            
            // 추가 디버깅 정보
            if (result.error === 'invalid_token') {
                console.log('💡 해결 방법:');
                console.log('   1. 토큰이 만료되었을 수 있습니다.');
                console.log('   2. 서버의 /api/naver/oauth/authorize 엔드포인트를 통해 새 토큰을 발급받으세요.');
            } else if (result.error === 'no_token') {
                console.log('💡 해결 방법:');
                console.log('   1. 환경변수 또는 DB에 NAVER_ACCESS_TOKEN을 설정하세요.');
            } else if (result.error === 'no_permission') {
                console.log('💡 해결 방법:');
                console.log('   1. 네이버 카페에 해당 사용자(이민)가 글쓰기 권한이 있는지 확인하세요.');
                console.log('   2. 카페 ID와 메뉴 ID가 올바른지 확인하세요.');
                console.log('   3. 카페 멤버십이 활성화되어 있는지 확인하세요.');
                console.log('   4. 네이버 개발자센터에서 OAuth 앱 권한이 카페 글쓰기로 설정되어 있는지 확인하세요.');
            }
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        
        if (error.response) {
            console.error(`   상태 코드: ${error.response.status}`);
            console.error(`   응답 데이터:`, JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('   요청 전송 실패 (응답 없음)');
        } else {
            console.error(`   오류 메시지: ${error.message}`);
        }
        
        if (error.stack) {
            console.error('');
            console.error('스택 트레이스:');
            console.error(error.stack);
        }
        
        process.exit(1);
    }
}

// 테스트 실행
testImageUpload()
    .then(() => {
        console.log('');
        console.log('='.repeat(60));
        console.log('테스트 완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('테스트 실패:', error.message);
        process.exit(1);
    });
