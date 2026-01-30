/**
 * 네이버 카페 인코딩 모드 자동 테스트
 * 모든 모드를 순차적으로 테스트하고 성공한 모드를 찾아서 cafeWrite.js에 적용
 */

const fs = require('fs');
const path = require('path');
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

// 테스트용 제목/내용
const TEST_SUBJECT = '인코딩 테스트 - 한글 제목';
const TEST_CONTENT = `<font color="red">인코딩 테스트입니다.</font><br>
<p>한글 인코딩 테스트: 가나다라마바사아자차카타파하</p>
<p>특수문자: !@#$%^&*()_+-=[]{}|;':",./<>?</p>`;

/**
 * 특정 인코딩 모드로 테스트
 */
async function testEncodingMode(mode) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`인코딩 모드 테스트: ${mode}`);
    console.log('='.repeat(80));
    
    try {
        // 환경변수 설정
        process.env.NAVER_MULTIPART_ENCODING_MODE = mode;
        
        // 토큰 가져오기
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            console.log(`❌ 토큰을 가져올 수 없습니다.`);
            return { success: false, error: 'no_token' };
        }
        
        // 이미지 파일 읽기
        if (!TEST_IMAGE_PATH) {
            console.log(`❌ 테스트 이미지 파일을 찾을 수 없습니다.`);
            return { success: false, error: 'no_image' };
        }
        
        const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
        
        // 제목에 모드명 포함
        const subject = `[${mode}] ${TEST_SUBJECT}`;
        const content = TEST_CONTENT.replace(
            '<p>한글 인코딩 테스트',
            `<p>인코딩 모드: <strong>${mode}</strong></p><p>한글 인코딩 테스트`
        );
        
        // API 호출
        const result = await writeCafeArticle({
            subject: subject,
            content: content,
            clubid: clubid,
            menuid: menuid,
            accessToken: accessToken,
            images: [imageBuffer]
        });
        
        if (result.success) {
            console.log(`✅ 성공! articleUrl: ${result.articleUrl}`);
            return { success: true, mode, articleUrl: result.articleUrl };
        } else {
            console.log(`❌ 실패: ${result.error} - ${result.message}`);
            return { success: false, mode, error: result.error, message: result.message };
        }
        
    } catch (error) {
        console.log(`❌ 오류 발생: ${error.message}`);
        return { success: false, mode, error: error.message };
    }
}

/**
 * 모든 모드 테스트 및 결과 분석
 */
async function testAllModes() {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║              네이버 카페 인코딩 모드 자동 테스트                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    
    const modes = ['raw', 'double_ms949', 'euckr_bytes'];
    const results = [];
    
    for (const mode of modes) {
        const result = await testEncodingMode(mode);
        results.push(result);
        
        // 약간의 대기 시간 (API 부하 방지)
        if (mode !== modes[modes.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // 결과 분석
    console.log('\n' + '='.repeat(80));
    console.log('테스트 결과 요약');
    console.log('='.repeat(80));
    
    const successfulModes = results.filter(r => r.success);
    const failedModes = results.filter(r => !r.success);
    
    console.log(`\n성공한 모드: ${successfulModes.length}개`);
    successfulModes.forEach(({ mode, articleUrl }) => {
        console.log(`  ✅ ${mode.padEnd(20)} : ${articleUrl}`);
    });
    
    console.log(`\n실패한 모드: ${failedModes.length}개`);
    failedModes.forEach(({ mode, error, message }) => {
        console.log(`  ❌ ${mode.padEnd(20)} : ${error} - ${message || ''}`);
    });
    
    // 최종 모드 결정
    let finalMode = 'raw'; // 기본값
    
    if (successfulModes.length > 0) {
        // 성공한 모드가 있으면 첫 번째 성공 모드 사용
        finalMode = successfulModes[0].mode;
        console.log(`\n✅ 성공한 모드 발견: ${finalMode}`);
    } else {
        // 모두 실패한 경우, raw 모드를 기본값으로 사용 (가장 표준적인 방식)
        console.log(`\n⚠️ 모든 모드가 실패했습니다. 기본값 'raw' 모드를 사용합니다.`);
        console.log(`   (권한 문제일 수 있으므로, 실제 인코딩은 올바를 수 있습니다.)`);
    }
    
    return { finalMode, results };
}

/**
 * cafeWrite.js 파일에서 기본 인코딩 모드 업데이트
 */
function updateCafeWriteDefaultMode(finalMode) {
    const filePath = path.join(__dirname, '..', 'integrations', 'naverCafe', 'cafeWrite.js');
    
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // 기본값 변경 (process.env.NAVER_MULTIPART_ENCODING_MODE || 'raw')
        const oldPattern = /(const encodingMode = process\.env\.NAVER_MULTIPART_ENCODING_MODE \|\| ')([^']+)(';)/;
        
        if (oldPattern.test(content)) {
            content = content.replace(oldPattern, `$1${finalMode}$3`);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`\n✅ cafeWrite.js 업데이트 완료: 기본 인코딩 모드 = '${finalMode}'`);
            return true;
        } else {
            console.log(`\n⚠️ cafeWrite.js에서 기본값 패턴을 찾을 수 없습니다.`);
            return false;
        }
    } catch (error) {
        console.error(`\n❌ cafeWrite.js 업데이트 실패: ${error.message}`);
        return false;
    }
}

// 메인 실행
(async () => {
    try {
        const { finalMode, results } = await testAllModes();
        
        console.log('\n' + '='.repeat(80));
        console.log('cafeWrite.js 업데이트');
        console.log('='.repeat(80));
        
        const updated = updateCafeWriteDefaultMode(finalMode);
        
        if (updated) {
            console.log(`\n✅ 최종 인코딩 모드: '${finalMode}'`);
            console.log(`\n💡 환경변수로 다른 모드를 사용하려면:`);
            console.log(`   NAVER_MULTIPART_ENCODING_MODE=${finalMode}`);
        }
        
        // 결과 요약 출력
        console.log('\n' + '='.repeat(80));
        console.log('최종 결과');
        console.log('='.repeat(80));
        console.log(`선택된 모드: ${finalMode}`);
        console.log(`\n각 모드별 결과:`);
        results.forEach(({ mode, success, error, articleUrl }) => {
            const status = success ? '✅ 성공' : `❌ 실패 (${error})`;
            console.log(`  ${mode.padEnd(20)} : ${status}`);
            if (articleUrl) {
                console.log(`    └─ ${articleUrl}`);
            }
        });
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 테스트 실행 실패:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
})();










