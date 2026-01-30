/**
 * 네이버 카페 인코딩 모드 자동 테스트 및 캐싱
 * 각 인코딩 모드를 시도하여 성공한 모드를 찾아서 캐시
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const iconv = require('iconv-lite');
const FormData = require('form-data');
const { validateAccessToken } = require('./naverOAuth');
const { writeCafeArticle } = require('./cafeWrite');

// 캐시 파일 경로
const CACHE_FILE_PATH = path.join(__dirname, '../../.naver_encoding_cache.json');

// 테스트용 제목/내용 (짧고 간단한 한글)
const TEST_SUBJECT = '인코딩 테스트';
const TEST_CONTENT = '<p>한글 테스트: 가나다라마바사</p>';

// 사용 가능한 인코딩 모드 목록
// 참고: multipart/form-data는 기본적으로 ISO-8859-1을 사용하므로 한글 처리를 위한 다양한 모드 제공
const ENCODING_MODES = ['iso8859_to_utf8', 'urlencoded', 'raw_string', 'raw', 'double_ms949', 'euckr_bytes'];

/**
 * 캐시에서 성공한 인코딩 모드 읽기
 */
function loadCachedEncodingMode() {
    try {
        if (fs.existsSync(CACHE_FILE_PATH)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
            if (cacheData.encodingMode && ENCODING_MODES.includes(cacheData.encodingMode)) {
                return cacheData.encodingMode;
            }
        }
    } catch (error) {
        // 캐시 파일 읽기 실패는 무시
    }
    return null;
}

/**
 * 성공한 인코딩 모드를 캐시에 저장
 */
function saveCachedEncodingMode(encodingMode) {
    try {
        const cacheDir = path.dirname(CACHE_FILE_PATH);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const cacheData = {
            encodingMode: encodingMode,
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
        // 캐시 파일 저장 실패는 무시
    }
}

/**
 * 특정 인코딩 모드로 테스트 글 작성
 */
async function testEncodingMode(mode, params) {
    const { clubid, menuid, accessToken, headid, testImage } = params;
    
    // 환경변수에 인코딩 모드 설정
    const originalMode = process.env.NAVER_MULTIPART_ENCODING_MODE;
    process.env.NAVER_MULTIPART_ENCODING_MODE = mode;
    
    try {
        // 테스트 이미지 준비 (있는 경우)
        let images = null;
        if (testImage && fs.existsSync(testImage)) {
            images = [fs.readFileSync(testImage)];
        }
        
        // 테스트 글 작성 시도
        const result = await writeCafeArticle({
            subject: TEST_SUBJECT,
            content: TEST_CONTENT,
            clubid: clubid,
            menuid: menuid,
            accessToken: accessToken,
            headid: headid,
            images: images
        });
        
        // 성공 조건: articleId와 articleUrl이 있으면 성공
        if (result && result.articleId && result.articleUrl) {
            return { success: true, mode, articleUrl: result.articleUrl };
        } else if (result && result.success === true) {
            return { success: true, mode, articleUrl: result.articleUrl };
        } else {
            return { success: false, mode, error: result?.error || 'unknown' };
        }
    } catch (error) {
        return { success: false, mode, error: error.message };
    } finally {
        // 환경변수 복원
        if (originalMode !== undefined) {
            process.env.NAVER_MULTIPART_ENCODING_MODE = originalMode;
        } else {
            delete process.env.NAVER_MULTIPART_ENCODING_MODE;
        }
    }
}

/**
 * 모든 인코딩 모드를 순차적으로 테스트하여 성공한 첫 번째 모드 찾기
 */
async function findWorkingEncodingMode(params) {
    for (const mode of ENCODING_MODES) {
        const result = await testEncodingMode(mode, params);
        
        if (result.success) {
            saveCachedEncodingMode(mode);
            return mode;
        }
        
        // 다음 모드 테스트 전 잠시 대기 (API 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return null;
}

/**
 * 성공한 인코딩 모드 가져오기 (캐시 확인 후 필요시 테스트)
 */
async function getWorkingEncodingMode(params) {
    // 1. 캐시에서 확인
    const cachedMode = loadCachedEncodingMode();
    if (cachedMode) {
        const testResult = await testEncodingMode(cachedMode, params);
        
        if (testResult.success) {
            return cachedMode;
        } else {
            // 캐시 삭제
            try {
                if (fs.existsSync(CACHE_FILE_PATH)) {
                    fs.unlinkSync(CACHE_FILE_PATH);
                }
            } catch (error) {
                // 캐시 파일 삭제 실패는 무시
            }
        }
    }
    
    // 2. 캐시가 없거나 검증 실패 시 모든 모드 테스트
    const workingMode = await findWorkingEncodingMode(params);
    
    if (workingMode) {
        return workingMode;
    }
    
    // 3. 모든 모드 실패 시 기본값 반환
    return 'raw';
}

module.exports = {
    getWorkingEncodingMode,
    findWorkingEncodingMode,
    loadCachedEncodingMode,
    saveCachedEncodingMode,
    ENCODING_MODES
};

