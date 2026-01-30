/**
 * 이미지 처리 파이프라인
 * Primary: attachment 복호화 → URL 추출 → 다운로드
 * Fallback: Bridge 미리보기 이미지 캐시 조회
 */

const path = require('path');
const fs = require('fs');
const { extractImageUrl } = require('../db/utils/attachmentExtractor');

// ========== P0-1: 모듈 로딩 실패 해결 ==========
// 실행 환경에서 실제 실행 경로 확인 및 안전장치 추가
let downloadAndSaveImage;
let moduleLoadStatus = 'unknown';

try {
    const imageDownloaderPath = path.join(__dirname, '../utils/imageDownloader');
    const imageDownloaderJsPath = path.join(__dirname, '../utils/imageDownloader.js');
    
    // 실행 환경 정보 로깅 (운영자용)
    console.log(`[이미지 처리] [모듈 로딩] 실행 환경 확인:`);
    console.log(`  - __dirname: ${__dirname}`);
    console.log(`  - process.cwd(): ${process.cwd()}`);
    console.log(`  - 예상 경로: ${imageDownloaderJsPath}`);
    console.log(`  - 파일 존재: ${fs.existsSync(imageDownloaderJsPath)}`);
    
    // 파일 존재 확인
    if (!fs.existsSync(imageDownloaderJsPath)) {
        // 디렉토리 목록 확인
        const utilsDir = path.join(__dirname, '../utils');
        if (fs.existsSync(utilsDir)) {
            const files = fs.readdirSync(utilsDir);
            console.log(`  - utils 디렉토리 파일 목록: ${files.join(', ')}`);
        } else {
            console.log(`  - utils 디렉토리 없음`);
        }
        throw new Error(`파일이 존재하지 않음: ${imageDownloaderJsPath}`);
    }
    
    // 모듈 로드 시도
    const imageDownloader = require(imageDownloaderPath);
    
    if (!imageDownloader || typeof imageDownloader.downloadAndSaveImage !== 'function') {
        throw new Error(`모듈에서 downloadAndSaveImage 함수를 찾을 수 없음`);
    }
    
    downloadAndSaveImage = imageDownloader.downloadAndSaveImage;
    moduleLoadStatus = 'loaded';
    console.log(`[이미지 처리] ✅ imageDownloader 모듈 로드 성공: ${imageDownloaderPath}`);
} catch (e) {
    moduleLoadStatus = 'failed';
    console.error(`[이미지 처리] ❌ imageDownloader 모듈 로드 실패 (운영자용 상세 로그):`);
    console.error(`  - 에러 메시지: ${e.message}`);
    console.error(`  - 에러 스택: ${e.stack}`);
    console.error(`  - __dirname: ${__dirname}`);
    console.error(`  - process.cwd(): ${process.cwd()}`);
    console.error(`  - 예상 경로: ${path.join(__dirname, '../utils/imageDownloader.js')}`);
    
    // Fallback: 기능 비활성화 + 명확한 에러 반환
    downloadAndSaveImage = async (imageUrl) => {
        console.error(`[이미지 처리] ⚠️ 모듈 로딩 실패로 인해 이미지 다운로드 기능이 비활성화되었습니다`);
        return {
            success: false,
            error: 'MODULE_NOT_LOADED',
            errorCode: 'MODULE_NOT_LOADED',
            stage: 'module_load',
            detail: `imageDownloader 모듈을 로드할 수 없습니다: ${e.message}`
        };
    };
}

const { getAndClearPendingPreview } = require('../labbot-node');
const axios = require('axios');

/**
 * 이미지 메시지 처리 (Primary → Fallback)
 * @param {object} params - 처리 파라미터
 * @param {string} params.roomName - 채팅방 이름
 * @param {string} params.senderId - 발신자 ID
 * @param {string} params.senderName - 발신자 이름
 * @param {string|number} params.msgType - 메시지 타입 (2 또는 27)
 * @param {string|object} params.attachment - attachment 원문
 * @param {object} params.attachmentDecrypted - 복호화된 attachment
 * @param {string} params.imageUrlFromClient - 클라이언트에서 추출한 이미지 URL
 * @param {number} params.encType - 암호화 타입
 * @param {string} params.kakaoLogId - 카카오 로그 ID (가능하면)
 * @returns {Promise<{success: boolean, source: 'primary'|'fallback'|'none', filePath?: string, url?: string, error?: string, trace?: object}>}
 */
/**
 * 이미지 메시지 처리 (Primary → Fallback)
 * P1-1: correlation id 전파 및 단계별 시간 측정
 * @param {object} params - 처리 파라미터
 * @param {string} params.roomName - 채팅방 이름
 * @param {string} params.senderId - 발신자 ID
 * @param {string} params.senderName - 발신자 이름
 * @param {string|number} params.msgType - 메시지 타입 (2 또는 27)
 * @param {string|object} params.attachment - attachment 원문
 * @param {object} params.attachmentDecrypted - 복호화된 attachment
 * @param {string} params.imageUrlFromClient - 클라이언트에서 추출한 이미지 URL
 * @param {number} params.encType - 암호화 타입
 * @param {string} params.kakaoLogId - 카카오 로그 ID (correlation id)
 * @returns {Promise<{success: boolean, source: 'primary'|'fallback'|'none', filePath?: string, url?: string, errorCode?: string, stage?: string, detail?: string, trace?: object, correlationId?: string}>}
 */
async function handleIncomingImageMessage({
    roomName,
    senderId,
    senderName,
    msgType,
    attachment,
    attachmentDecrypted,
    imageUrlFromClient,
    encType,
    kakaoLogId
}) {
    // P1-1: correlation id 생성/전파
    const correlationId = kakaoLogId || `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    const trace = {
        correlationId: correlationId,
        primary: { attempted: false, success: false, error: null, errorCode: null, stage: null, timings: {} },
        fallback: { attempted: false, success: false, error: null, errorCode: null, stage: null, timings: {} }
    };

    console.log(`[이미지 처리] [${correlationId}] ========== 이미지 메시지 처리 시작 ==========`);
    console.log(`[이미지 처리] [${correlationId}] roomName="${roomName}", senderId="${senderId}", msgType=${msgType}`);

    // ========== Primary Flow ==========
    trace.primary.attempted = true;
    const primaryStartTime = Date.now();
    console.log(`[이미지 처리] [${correlationId}] [Primary] 시작`);

    try {
        // 1. 이미지 URL 추출
        const urlExtractStartTime = Date.now();
        let imageUrl = imageUrlFromClient;
        
        if (!imageUrl) {
            // attachment에서 추출 시도
            let attachmentData = attachmentDecrypted || attachment;
            
            if (attachmentData) {
                // 문자열이면 파싱 또는 복호화 시도
                let attachObj = attachmentData;
                if (typeof attachmentData === 'string') {
                    // 1순위: JSON 파싱 시도
                    try {
                        attachObj = JSON.parse(attachmentData);
                        console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ attachment JSON 파싱 성공`);
                    } catch (e) {
                        // JSON 파싱 실패 → Base64 암호화 문자열일 가능성
                        // 2순위: 서버에서 복호화 시도
                        console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ attachment JSON 파싱 실패, 복호화 시도: ${e.message}`);
                        
                        // Base64 문자열인지 확인 (일반적으로 Base64는 A-Za-z0-9+/= 문자만 포함)
                        const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(attachmentData.trim()) && attachmentData.length > 20;
                        
                        if (isBase64Like && encType) {
                            try {
                                // 서버의 decryptKakaoTalkMessage 함수 사용
                                const { decryptKakaoTalkMessage } = require('../server');
                                
                                // userId는 senderId에서 추출 (숫자 부분)
                                let decryptUserId = null;
                                if (senderId) {
                                    const userIdMatch = String(senderId).match(/\d+/);
                                    if (userIdMatch) {
                                        decryptUserId = parseInt(userIdMatch[0], 10);
                                    }
                                }
                                
                                if (decryptUserId) {
                                    console.log(`[이미지 처리] [${correlationId}] [Primary] 복호화 시도: userId=${decryptUserId}, encType=${encType}`);
                                    const decrypted = decryptKakaoTalkMessage(attachmentData, decryptUserId, encType);
                                    
                                    if (decrypted) {
                                        console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ attachment 복호화 성공: ${decrypted.substring(0, 100)}...`);
                                        
                                        // 복호화된 결과를 JSON으로 파싱 시도
                                        try {
                                            attachObj = JSON.parse(decrypted);
                                            console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ 복호화 후 JSON 파싱 성공`);
                                        } catch (parseError) {
                                            // JSON이 아니면 문자열 그대로 사용 (이미지 URL일 수 있음)
                                            console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ 복호화 결과가 JSON이 아님, URL로 간주: ${decrypted.substring(0, 100)}...`);
                                            // 복호화된 문자열이 URL인지 확인
                                            if (decrypted.startsWith('http://') || decrypted.startsWith('https://') || decrypted.startsWith('file://') || decrypted.startsWith('content://')) {
                                                imageUrl = decrypted;
                                                console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ 복호화된 문자열에서 URL 발견: ${imageUrl.substring(0, 80)}...`);
                                            } else {
                                                // 객체 형태로 감싸서 extractImageUrl에 전달
                                                attachObj = { url: decrypted, data: decrypted };
                                            }
                                        }
                                    } else {
                                        trace.primary.error = `attachment 복호화 실패 (userId=${decryptUserId}, encType=${encType})`;
                                        trace.primary.errorCode = 'DECRYPT_FAIL';
                                        trace.primary.stage = 'primary.urlExtract.decrypt';
                                        console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ attachment 복호화 실패`);
                                    }
                                } else {
                                    trace.primary.error = `복호화를 위한 userId를 찾을 수 없음 (senderId=${senderId})`;
                                    trace.primary.errorCode = 'NO_USER_ID';
                                    trace.primary.stage = 'primary.urlExtract.decrypt';
                                    console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ userId 없음: senderId=${senderId}`);
                                }
                            } catch (decryptError) {
                                trace.primary.error = `복호화 예외: ${decryptError.message}`;
                                trace.primary.errorCode = 'DECRYPT_EXCEPTION';
                                trace.primary.stage = 'primary.urlExtract.decrypt';
                                console.error(`[이미지 처리] [${correlationId}] [Primary] ❌ 복호화 예외:`, decryptError);
                            }
                        } else {
                            trace.primary.error = `attachment JSON 파싱 실패: ${e.message}`;
                            trace.primary.errorCode = 'PARSE_FAIL';
                            trace.primary.stage = 'primary.urlExtract.parse';
                            console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ attachment JSON 파싱 실패 (Base64 아님): ${e.message}`);
                        }
                    }
                }
                
                // attachObj가 객체이면 extractImageUrl 호출
                if (attachObj && typeof attachObj === 'object' && !imageUrl) {
                    imageUrl = extractImageUrl(attachObj, msgType);
                    if (imageUrl) {
                        console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ URL 추출 성공: ${imageUrl.substring(0, 80)}...`);
                    } else {
                        if (!trace.primary.errorCode) {
                            trace.primary.error = 'attachment에서 URL 추출 실패';
                            trace.primary.errorCode = 'URL_EXTRACT_FAIL';
                            trace.primary.stage = 'primary.urlExtract.extract';
                        }
                        console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ URL 추출 실패`);
                    }
                }
            } else {
                trace.primary.error = 'attachment 데이터 없음';
                trace.primary.errorCode = 'NO_ATTACHMENT';
                trace.primary.stage = 'primary.urlExtract';
                console.log(`[이미지 처리] [${correlationId}] [Primary] ⚠️ attachment 데이터 없음`);
            }
        } else {
            console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ 클라이언트에서 URL 받음: ${imageUrl.substring(0, 80)}...`);
        }
        
        trace.primary.timings.urlExtract = Date.now() - urlExtractStartTime;

        // 2. URL 다운로드 시도
        if (imageUrl) {
            const downloadStartTime = Date.now();
            console.log(`[이미지 처리] [${correlationId}] [Primary] 다운로드 시도: ${imageUrl.substring(0, 80)}...`);
            
            const downloadResult = await downloadAndSaveImage(imageUrl);
            trace.primary.timings.download = Date.now() - downloadStartTime;
            
            if (downloadResult.success) {
                trace.primary.success = true;
                const totalTime = Date.now() - primaryStartTime;
                console.log(`[이미지 처리] [${correlationId}] [Primary] ✅ 성공: ${downloadResult.filename} -> ${downloadResult.url} (소요: ${totalTime}ms)`);
                console.log(`[이미지 처리] [${correlationId}] ==========================================`);
                
                return {
                    success: true,
                    source: 'primary',
                    filePath: downloadResult.filePath,
                    url: downloadResult.url,
                    filename: downloadResult.filename,
                    size: downloadResult.size,
                    correlationId: correlationId,
                    trace: trace
                };
            } else {
                trace.primary.error = `다운로드 실패: ${downloadResult.error || downloadResult.detail || '알 수 없는 오류'}`;
                trace.primary.errorCode = downloadResult.errorCode || 'DOWNLOAD_FAIL';
                trace.primary.stage = downloadResult.stage || 'primary.download';
                trace.primary.detail = downloadResult.detail || downloadResult.error;
                console.log(`[이미지 처리] [${correlationId}] [Primary] ❌ 다운로드 실패: ${trace.primary.errorCode} (${trace.primary.stage})`);
            }
        }
    } catch (error) {
        trace.primary.error = `예외 발생: ${error.message}`;
        trace.primary.errorCode = 'EXCEPTION';
        trace.primary.stage = 'primary';
        trace.primary.detail = error.stack;
        console.error(`[이미지 처리] [${correlationId}] [Primary] ❌ 예외:`, error);
    }

    // ========== Fallback Flow ==========
    trace.fallback.attempted = true;
    const fallbackStartTime = Date.now();
    console.log(`[이미지 처리] [${correlationId}] [Fallback] 시작 (Primary 실패)`);

    try {
        // 여러 키로 시도 (roomName + senderId, roomName + senderName, senderName만)
        const previewLookupStartTime = Date.now();
        const previewData = getAndClearPendingPreview(roomName, senderId || senderName, 90 * 1000);
        trace.fallback.timings.previewLookup = Date.now() - previewLookupStartTime;
        
        if (previewData && previewData.filePath) {
            // 파일 존재 확인
            if (fs.existsSync(previewData.filePath)) {
                trace.fallback.success = true;
                
                // 서버 URL 생성
                const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_BASE_URL || 'http://192.168.0.15:5002';
                const imageUrl = `${serverUrl}/api/image/${previewData.filename}`;
                
                const totalTime = Date.now() - fallbackStartTime;
                console.log(`[이미지 처리] [${correlationId}] [Fallback] ✅ 성공: ${previewData.filename} -> ${imageUrl} (소요: ${totalTime}ms)`);
                console.log(`[이미지 처리] [${correlationId}] ==========================================`);
                
                return {
                    success: true,
                    source: 'fallback',
                    filePath: previewData.filePath,
                    url: imageUrl,
                    filename: previewData.filename,
                    size: previewData.size,
                    mime: previewData.mime,
                    correlationId: correlationId,
                    trace: trace
                };
            } else {
                trace.fallback.error = `파일 없음: ${previewData.filePath}`;
                trace.fallback.errorCode = 'FILE_NOT_FOUND';
                trace.fallback.stage = 'fallback.fileCheck';
                console.log(`[이미지 처리] [${correlationId}] [Fallback] ⚠️ 파일 없음: ${previewData.filePath}`);
            }
        } else {
            trace.fallback.error = '미리보기 캐시 미스';
            trace.fallback.errorCode = 'PREVIEW_CACHE_MISS';
            trace.fallback.stage = 'fallback.previewLookup';
            console.log(`[이미지 처리] [${correlationId}] [Fallback] ⚠️ 미리보기 캐시 미스: roomName="${roomName}", senderId="${senderId || senderName}"`);
            console.log(`[이미지 처리] [${correlationId}] [Fallback] ⚠️ Bridge APK가 아직 이미지를 업로드하지 않았을 수 있습니다`);
            console.log(`[이미지 처리] [${correlationId}] [Fallback] ⚠️ 잠시 후 Bridge fallback이 도착하면 자동으로 처리됩니다`);
        }
    } catch (error) {
        trace.fallback.error = `예외 발생: ${error.message}`;
        trace.fallback.errorCode = 'EXCEPTION';
        trace.fallback.stage = 'fallback';
        trace.fallback.detail = error.stack;
        console.error(`[이미지 처리] [${correlationId}] [Fallback] ❌ 예외:`, error);
    }

    // ========== 모두 실패 ==========
    const totalTime = Date.now() - startTime;
    console.log(`[이미지 처리] [${correlationId}] ❌ Primary와 Fallback 모두 실패 (총 소요: ${totalTime}ms)`);
    console.log(`[이미지 처리] [${correlationId}] trace:`, JSON.stringify(trace, null, 2));
    console.log(`[이미지 처리] [${correlationId}] ==========================================`);

    // P0-3: 에러 코드 표준화
    const finalErrorCode = trace.primary.errorCode || trace.fallback.errorCode || 'UNKNOWN';
    const finalStage = trace.primary.stage || trace.fallback.stage || 'unknown';
    const finalDetail = trace.primary.detail || trace.fallback.detail || trace.primary.error || trace.fallback.error || '알 수 없는 오류';

    return {
        success: false,
        source: 'none',
        error: 'Primary와 Fallback 모두 실패',
        errorCode: finalErrorCode,
        stage: finalStage,
        detail: finalDetail,
        correlationId: correlationId,
        trace: trace
    };
}

module.exports = {
    handleIncomingImageMessage
};

