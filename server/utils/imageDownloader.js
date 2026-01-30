/**
 * 이미지 다운로드 및 저장 유틸리티
 * 카카오톡에서 받은 이미지를 서버에 저장하고 URL을 생성
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 이미지 저장 디렉토리
const IMAGE_DIR = '/home/app/iris-core/admin/data/img';
const SERVER_URL = process.env.SERVER_URL || process.env.PUBLIC_BASE_URL || 'http://192.168.0.15:5002';

// 디렉토리 생성
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

/**
 * 이미지 URL에서 이미지 다운로드 및 저장
 * @param {string} imageUrl - 다운로드할 이미지 URL
 * @param {string} [filename] - 저장할 파일명 (없으면 자동 생성)
 * @returns {Promise<{success: boolean, filePath?: string, url?: string, error?: string}>}
 */
async function downloadAndSaveImage(imageUrl, filename = null) {
    if (!imageUrl || typeof imageUrl !== 'string' || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
        return {
            success: false,
            error: 'Invalid image URL'
        };
    }

    try {
        console.log(`[이미지 다운로드] 시작: ${imageUrl.substring(0, 100)}...`);
        
        // 이미지 다운로드
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            validateStatus: (status) => status >= 200 && status < 400
        });

        const imageBuffer = Buffer.from(response.data);
        
        // 파일명 생성 (없으면 URL 해시 기반)
        if (!filename) {
            const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
            const contentType = response.headers['content-type'] || 'image/jpeg';
            const ext = contentType.includes('png') ? '.png' : 
                       contentType.includes('gif') ? '.gif' : 
                       contentType.includes('webp') ? '.webp' : '.jpg';
            filename = `kakao_${Date.now()}_${urlHash}${ext}`;
        }

        // 안전한 파일명 (경로 탐색 방지)
        const safeFilename = path.basename(filename);
        const filePath = path.join(IMAGE_DIR, safeFilename);

        // 파일 저장
        fs.writeFileSync(filePath, imageBuffer);
        
        // 서버 URL 생성
        const serverUrl = SERVER_URL.endsWith('/') ? SERVER_URL.slice(0, -1) : SERVER_URL;
        const imageUrlOnServer = `${serverUrl}/api/image/${safeFilename}`;

        console.log(`[이미지 다운로드] ✅ 성공: ${safeFilename} (${imageBuffer.length} bytes) -> ${imageUrlOnServer}`);

        return {
            success: true,
            filePath: filePath,
            filename: safeFilename,
            url: imageUrlOnServer,
            size: imageBuffer.length
        };
    } catch (error) {
        console.error(`[이미지 다운로드] ❌ 실패: ${imageUrl.substring(0, 100)}...`, error.message);
        return {
            success: false,
            error: error.message || 'Download failed'
        };
    }
}

/**
 * 여러 이미지 URL 다운로드 및 저장
 * @param {string[]} imageUrls - 다운로드할 이미지 URL 배열
 * @returns {Promise<Array<{success: boolean, filePath?: string, url?: string, error?: string}>>}
 */
async function downloadAndSaveImages(imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return [];
    }

    const results = await Promise.all(
        imageUrls.map((url, index) => downloadAndSaveImage(url, null))
    );

    return results;
}

module.exports = {
    downloadAndSaveImage,
    downloadAndSaveImages,
    IMAGE_DIR
};

