/**
 * 네이버 카페 인코딩 테스트 스크립트
 * cafeWrite.js의 실제 로직을 사용하여 각 인코딩 모드를 테스트
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// .env 파일 로드
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const { writeCafeArticle } = require('../integrations/naverCafe/cafeWrite');
const { getValidAccessToken } = require('../integrations/naverCafe/tokenManager');

// 테스트 이미지 경로
const TEST_IMAGE_PATHS = [
    path.join(__dirname, 'catch.JPG'),
    path.join(__dirname, '..', 'test', 'catch.JPG'),
];

let TEST_IMAGE_PATH = null;
for (const imgPath of TEST_IMAGE_PATHS) {
    if (fs.existsSync(imgPath)) {
        TEST_IMAGE_PATH = imgPath;
        break;
    }
}

// 환경변수
const clubid = parseInt(process.env.NAVER_CAFE_CLUBID || '31199051');
const menuid = parseInt(process.env.NAVER_CAFE_MENUID || '160');

// 테스트용 제목/내용 (한글 포함)
const TEST_SUBJECT = '이미지 업로드 테스트 - 한글 제목';
const TEST_CONTENT = `<font color="red">이미지 업로드 테스트입니다.</font><br>
<p>인코딩 테스트용 내용입니다.</p>
<p>한글 인코딩 테스트: 가나다라마바사아자차카타파하</p>
<p>특수문자: !@#$%^&*()_+-=[]{}|;':",./<>?</p>`;

/**
 * 특정 인코딩 모드로 테스트
 */
async function testEncodingMode(mode) {
    console.log('='.repeat(80));
    console.log(`인코딩 모드 테스트: ${mode}`);
    console.log('='.repeat(80));
    console.log('');
    
    try {
        // 환경변수 설정
        process.env.NAVER_MULTIPART_ENCODING_MODE = mode;
        
        // 토큰 가져오기
        console.log('📡 토큰 조회 중...');
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            console.error('❌ 토큰을 가져올 수 없습니다.');
            return { success: false, error: 'no_token' };
        }
        console.log(`✅ 토큰 조회 완료: ${accessToken.substring(0, 30)}...`);
        console.log('');
        
        // 이미지 파일 읽기
        if (!TEST_IMAGE_PATH) {
            console.error('❌ 테스트 이미지 파일을 찾을 수 없습니다.');
            return { success: false, error: 'no_image' };
        }
        
        console.log(`📷 이미지 파일: ${TEST_IMAGE_PATH}`);
        const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
        console.log(`   크기: ${imageBuffer.length} bytes`);
        console.log('');
        
        // 제목에 모드명 포함
        const subject = `[${mode}] ${TEST_SUBJECT}`;
        const content = TEST_CONTENT.replace(
            '<p>인코딩 테스트용 내용입니다.</p>',
            `<p>인코딩 모드: <strong>${mode}</strong></p>`
        );
        
        console.log(`📝 제목: ${subject}`);
        console.log(`📝 내용: ${content.substring(0, 100)}...`);
        console.log('');
        
        // API 호출
        console.log('📤 네이버 카페 API 호출 중...');
        console.log('');
        
        const result = await writeCafeArticle({
            subject: subject,
            content: content,
            clubid: clubid,
            menuid: menuid,
            accessToken: accessToken,
            images: [imageBuffer]
        });
        
        console.log('');
        console.log('📥 결과:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        
        if (result.success) {
            console.log('✅ 성공!');
            if (result.articleUrl) {
                console.log(`   URL: ${result.articleUrl}`);
                console.log('');
                console.log('💡 브라우저에서 위 URL을 열어서 한글이 올바르게 표시되는지 확인하세요.');
            }
            return { success: true, result };
        } else {
            console.log('❌ 실패');
            console.log(`   오류: ${result.error}`);
            console.log(`   메시지: ${result.message}`);
            if (result.statusCode) {
                console.log(`   상태 코드: ${result.statusCode}`);
            }
            return { success: false, result };
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        if (error.stack) {
            console.error('');
            console.error('스택 트레이스:');
            console.error(error.stack);
        }
        return { success: false, error: error.message };
    }
}

/**
 * 모든 인코딩 모드 테스트
 */
async function testAllModes() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    네이버 카페 인코딩 모드 테스트                          ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    const modes = ['raw', 'double_ms949', 'euckr_bytes'];
    const results = [];
    
    for (let i = 0; i < modes.length; i++) {
        const mode = modes[i];
        
        if (i > 0) {
            console.log('');
            console.log('⏸  다음 모드로 진행하려면 Enter를 누르세요...');
            await new Promise(resolve => {
                process.stdin.once('data', () => resolve());
            });
        }
        
        const result = await testEncodingMode(mode);
        results.push({ mode, ...result });
        
        console.log('');
        console.log('─'.repeat(80));
        console.log('');
    }
    
    // 결과 요약
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                            테스트 결과 요약                                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    results.forEach(({ mode, success, result }) => {
        const status = success ? '✅ 성공' : '❌ 실패';
        console.log(`${mode.padEnd(20)} : ${status}`);
        if (success && result?.articleUrl) {
            console.log(`  └─ URL: ${result.articleUrl}`);
        } else if (!success) {
            console.log(`  └─ 오류: ${result?.error || '알 수 없음'}`);
        }
    });
    
    console.log('');
    console.log('💡 성공한 모드를 .env 파일에 설정하세요:');
    console.log('   NAVER_MULTIPART_ENCODING_MODE=<성공한_모드>');
    console.log('');
}

// 명령줄 인수 확인
const mode = process.argv[2];

if (mode && ['raw', 'double_ms949', 'euckr_bytes'].includes(mode)) {
    // 특정 모드만 테스트
    testEncodingMode(mode)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('테스트 실패:', error.message);
            process.exit(1);
        });
} else {
    // 모든 모드 테스트
    testAllModes()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('테스트 실패:', error.message);
            process.exit(1);
        });
}










