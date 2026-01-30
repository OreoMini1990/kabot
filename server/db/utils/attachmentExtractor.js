/**
 * Attachment 필드에서 메시지 정보 추출 (단일 진실 소스)
 * 
 * 목적: attachment JSON에서 답장/반응/이미지 정보를 추출하는 로직을 한 곳에 통합
 * - extractReplyTarget: 답장 대상 메시지 ID 추출
 * - extractReactionTarget: 반응 대상 메시지 ID 추출
 * - extractImageUrl: 이미지 URL 추출
 */

/**
 * 답장 대상 메시지 ID 추출
 * @param {Object|string|null} attachment - attachment JSON 객체 또는 문자열
 * @param {string|number|null} referer - referer 필드 값 (우선순위 1, 하지만 현재는 클라이언트에서 이미 추출해서 보냄)
 * @param {string|number|null} msgType - 메시지 타입 (예: 26 = 답장)
 * @returns {number|null} kakao_log_id 또는 null
 */
function extractReplyTarget(attachment, referer, msgType = null) {
    // 1순위: referer 필드 (가장 신뢰할 수 있음, 하지만 현재는 클라이언트에서 이미 추출해서 json.reply_to_message_id로 보냄)
    // 참고: referer는 클라이언트에서 이미 추출해서 json.reply_to_message_id로 전송하므로 여기서는 attachment만 확인
    if (referer) {
        try {
            const refererStr = String(referer).trim();
            if (/^\d+$/.test(refererStr)) {
                const num = parseInt(refererStr, 10);
                if (num > 0) {
                    return num;
                }
            }
        } catch (e) {
            // 파싱 실패 시 무시
        }
    }
    
    // 2순위: attachment에서 추출 (type 26 답장 메시지)
    if (attachment) {
        try {
            let attachObj = attachment;
            
            // 문자열인 경우 JSON 파싱 (fallback 강화)
            if (typeof attachment === 'string') {
                try {
                    attachObj = JSON.parse(attachment);
                } catch (e) {
                    // 파싱 실패 시 암호화된 문자열일 수 있으므로 base64 디코딩 시도
                    try {
                        // base64 디코딩 시도
                        const decoded = Buffer.from(attachment, 'base64').toString('utf-8');
                        attachObj = JSON.parse(decoded);
                        console.log(`[extractReplyTarget] ✅ base64 디코딩 후 JSON 파싱 성공`);
                    } catch (e2) {
                        // base64 디코딩도 실패하면 원본 문자열에서 직접 패턴 추출 시도
                        // 예: "src_message":12345 또는 logId:12345 패턴 찾기
                        const srcMessageMatch = attachment.match(/["']src_message["']\s*:\s*(\d+)/i) || 
                                                attachment.match(/["']logId["']\s*:\s*(\d+)/i) ||
                                                attachment.match(/["']src_logId["']\s*:\s*(\d+)/i);
                        if (srcMessageMatch && srcMessageMatch[1]) {
                            const num = parseInt(srcMessageMatch[1], 10);
                            if (num > 0) {
                                console.log(`[extractReplyTarget] ✅ 패턴 매칭으로 추출 성공: ${num}`);
                                return num;
                            }
                        }
                        // 파싱 실패 시 로그 출력
                        console.warn(`[extractReplyTarget] attachment JSON 파싱 실패: ${e.message}, attachment 길이=${attachment.length}, 시작=${attachment.substring(0, 100)}`);
                        return null; // 파싱 실패
                    }
                }
            }
            
            // 객체인 경우에만 처리
            if (attachObj && typeof attachObj === 'object') {
                // ⚠️ 디버그: attachment 객체의 키 목록과 src_logId 값 확인
                const keys = Object.keys(attachObj);
                console.log(`[extractReplyTarget] ⚠️⚠️⚠️ attachment 객체 키 목록: ${keys.join(', ')}, msgType=${msgType}`);
                if (attachObj.src_logId !== undefined) {
                    console.log(`[extractReplyTarget] ⚠️⚠️⚠️ src_logId 발견: 값=${attachObj.src_logId}, 타입=${typeof attachObj.src_logId}`);
                }
                if (attachObj.src_message !== undefined) {
                    console.log(`[extractReplyTarget] ⚠️⚠️⚠️ src_message 발견: 값=${attachObj.src_message}, 타입=${typeof attachObj.src_message}`);
                }
                if (attachObj.logId !== undefined) {
                    console.log(`[extractReplyTarget] ⚠️⚠️⚠️ logId 발견: 값=${attachObj.logId}, 타입=${typeof attachObj.logId}`);
                }
                
                // ⚠️ 중요: src_logId를 우선 확인 (가장 신뢰할 수 있는 필드)
                // src_message는 "원문" 같은 문자열일 수 있으므로 숫자인지 확인 필요
                // 우선순위: src_logId > logId > src_message (숫자인 경우만)
                let srcMessageId = null;
                
                // 1순위: src_logId (가장 신뢰할 수 있음)
                if (attachObj.src_logId !== undefined && attachObj.src_logId !== null) {
                    srcMessageId = attachObj.src_logId;
                    console.log(`[extractReplyTarget] ⚠️ src_logId 우선 사용: 값=${srcMessageId}, 타입=${typeof srcMessageId}`);
                }
                // 2순위: logId
                else if (attachObj.logId !== undefined && attachObj.logId !== null) {
                    srcMessageId = attachObj.logId;
                    console.log(`[extractReplyTarget] ⚠️ logId 사용: 값=${srcMessageId}, 타입=${typeof srcMessageId}`);
                }
                // 3순위: src_message (숫자인 경우만)
                else if (attachObj.src_message !== undefined && attachObj.src_message !== null) {
                    const srcMessageStr = String(attachObj.src_message).trim();
                    // 숫자인지 확인
                    if (/^\d+$/.test(srcMessageStr)) {
                        srcMessageId = attachObj.src_message;
                        console.log(`[extractReplyTarget] ⚠️ src_message 사용 (숫자 확인됨): 값=${srcMessageId}, 타입=${typeof srcMessageId}`);
                    } else {
                        console.warn(`[extractReplyTarget] ⚠️ src_message가 숫자가 아님, 무시: "${srcMessageStr}"`);
                    }
                }
                
                if (srcMessageId) {
                    console.log(`[extractReplyTarget] ⚠️⚠️⚠️ srcMessageId 최종 추출: 값=${srcMessageId}, 타입=${typeof srcMessageId}`);
                    try {
                        const srcMessageStr = String(srcMessageId).trim();
                        console.log(`[extractReplyTarget] ⚠️⚠️⚠️ srcMessageStr 변환: "${srcMessageStr}", 숫자 패턴 매칭=${/^\d+$/.test(srcMessageStr)}`);
                        if (/^\d+$/.test(srcMessageStr)) {
                            const num = parseInt(srcMessageStr, 10);
                            console.log(`[extractReplyTarget] ⚠️⚠️⚠️ parseInt 결과: ${num}, 유효성=${num > 0}`);
                            if (num > 0) {
                                console.log(`[extractReplyTarget] ✅ attachment에서 추출 성공: srcMessageId=${num}, msgType=${msgType}`);
                                return num;
                            } else {
                                console.warn(`[extractReplyTarget] ⚠️ parseInt 결과가 0 이하: ${num}`);
                            }
                        } else {
                            console.warn(`[extractReplyTarget] ⚠️ srcMessageStr이 숫자 패턴이 아님: "${srcMessageStr}"`);
                        }
                    } catch (e) {
                        // 파싱 실패 시 무시
                        console.warn(`[extractReplyTarget] srcMessageId 파싱 실패: ${e.message}, srcMessageId=${srcMessageId}`);
                    }
                } else {
                    // srcMessageId가 없을 때 attachment 키 목록 로그
                    console.warn(`[extractReplyTarget] ⚠️ attachment에 src_logId/logId/src_message(숫자) 없음, 키 목록: ${keys.join(', ')}, msgType=${msgType}`);
                }
            } else {
                console.warn(`[extractReplyTarget] ⚠️ attachment가 객체가 아님: type=${typeof attachObj}, msgType=${msgType}`);
            }
        } catch (e) {
            // 추출 실패 시 로그 출력
            console.error(`[extractReplyTarget] 추출 예외: ${e.message}, attachment 타입=${typeof attachment}, msgType=${msgType}`);
        }
    }
    
    return null;
}

/**
 * 반응 대상 메시지 ID 추출
 * @param {Object|string|null} attachment - attachment JSON 객체 또는 문자열
 * @param {string|number|null} msgType - 메시지 타입 (예: 12 = Feed, 70-79 = 반응)
 * @returns {number|null} kakao_log_id 또는 null
 */
function extractReactionTarget(attachment, msgType = null) {
    if (!attachment) {
        return null;
    }
    
    try {
        let attachObj = attachment;
        
        // 문자열인 경우 JSON 파싱
        if (typeof attachment === 'string') {
            try {
                attachObj = JSON.parse(attachment);
            } catch (e) {
                return null; // 파싱 실패
            }
        }
        
        // 객체인 경우에만 처리
        if (attachObj && typeof attachObj === 'object') {
            // 반응 대상 메시지 ID 필드 (다양한 필드명 지원)
            const targetId = attachObj.message_id || 
                            attachObj.target_id || 
                            attachObj.target_message_id ||
                            attachObj.logId || 
                            attachObj.src_logId;
            
            if (targetId) {
                try {
                    const targetStr = String(targetId).trim();
                    if (/^\d+$/.test(targetStr)) {
                        const num = parseInt(targetStr, 10);
                        if (num > 0) {
                            return num;
                        }
                    }
                } catch (e) {
                    // 파싱 실패 시 무시
                }
            }
        }
    } catch (e) {
        // 추출 실패 시 무시
    }
    
    return null;
}

/**
 * 이미지 URL인지 확인 (확장자 또는 URL 패턴 기반)
 * @param {string} value - 확인할 값
 * @returns {boolean} 이미지 URL 여부
 */
function isImageUrl(value) {
    if (!value || typeof value !== 'string' || value.length < 5) {
        return false;
    }
    
    const valueLower = value.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const imageUrlPatterns = ['http://', 'https://', 'file://', 'content://'];
    
    // URL 패턴 확인
    const hasUrlPattern = imageUrlPatterns.some(pattern => valueLower.includes(pattern));
    const hasExtension = imageExtensions.some(ext => valueLower.includes(ext));
    
    // URL 패턴이 있고 확장자가 있으면 이미지
    if (hasUrlPattern && hasExtension) {
        return true;
    }
    // URL 패턴이 있으면 이미지로 간주 (확장자가 없어도)
    if (hasUrlPattern) {
        return true;
    }
    // 확장자만 있는 경우 (상대 경로)
    if (imageExtensions.some(ext => valueLower.endsWith(ext))) {
        return true;
    }
    
    return false;
}

/**
 * 딕셔너리에서 이미지 URL 재귀적으로 찾기
 * @param {Object} dataObj - 확인할 객체
 * @param {number} depth - 현재 깊이
 * @param {number} maxDepth - 최대 깊이
 * @returns {string|null} 이미지 URL 또는 null
 */
function findImageUrlInObject(dataObj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth || !dataObj || typeof dataObj !== 'object') {
        return null;
    }
    
    // 우선순위 1: Iris Rhino 문서 기준 이미지 URL 키
    // type=2: attachment.url
    // type=27: attachment.imageUrls (배열)
    const priorityKeys = ['url', 'imageUrls', 'thumbnailUrl', 'thumbnailUrls', 'path', 'path_1', 'xl', 'l', 'm', 's', 'imageUrl', 'image_url', 'photoUrl', 'photo_url'];
    for (const key of priorityKeys) {
        const value = dataObj[key];
        if (value) {
            // imageUrls는 배열이므로 첫 번째 요소 반환
            if (key === 'imageUrls' && Array.isArray(value) && value.length > 0) {
                const firstUrl = value[0];
                if (typeof firstUrl === 'string' && isImageUrl(firstUrl)) {
                    return firstUrl;
                }
            } else if (isImageUrl(String(value))) {
                return String(value);
            }
        }
    }
    
    // 우선순위 2: 모든 키-값 쌍 확인
    for (const [key, value] of Object.entries(dataObj)) {
        if (typeof value === 'string' && isImageUrl(value)) {
            return value;
        } else if (typeof value === 'object' && value !== null) {
            // 재귀적으로 객체 내부 확인
            const found = findImageUrlInObject(value, depth + 1, maxDepth);
            if (found) {
                return found;
            }
        } else if (Array.isArray(value)) {
            // 배열 내부 확인
            for (const item of value) {
                if (typeof item === 'string' && isImageUrl(item)) {
                    return item;
                } else if (typeof item === 'object' && item !== null) {
                    const found = findImageUrlInObject(item, depth + 1, maxDepth);
                    if (found) {
                        return found;
                    }
                }
            }
        }
    }
    
    return null;
}

/**
 * 이미지 URL 추출
 * @param {Object|string|null} attachment - attachment JSON 객체 또는 문자열
 * @param {string|number|null} msgType - 메시지 타입 (예: 2 = 사진, 27 = 사진 앨범)
 * @returns {string|null} 이미지 URL 또는 null
 */
function extractImageUrl(attachment, msgType = null) {
    if (!attachment) {
        return null;
    }
    
    try {
        let attachObj = attachment;
        
        // 문자열인 경우 JSON 파싱
        if (typeof attachment === 'string') {
            try {
                attachObj = JSON.parse(attachment);
            } catch (e) {
                // 파싱 실패 시 문자열 그대로 null 반환
                return null;
            }
        }
        
        // 객체인 경우에만 처리
        if (attachObj && typeof attachObj === 'object') {
            // 재귀적으로 이미지 URL 찾기 (확장자 필터링 포함)
            const imageUrl = findImageUrlInObject(attachObj);
            if (imageUrl) {
                return imageUrl.trim();
            }
        }
    } catch (e) {
        // 추출 실패 시 무시
        console.warn(`[extractImageUrl] 추출 실패: ${e.message}, attachment 타입=${typeof attachment}`);
    }
    
    return null;
}

/**
 * 안전한 숫자 파싱 (parseInt 위험 방지)
 * @param {any} value - 파싱할 값
 * @returns {number|null} 파싱된 숫자 또는 null
 */
function safeParseInt(value) {
    if (value === null || value === undefined) {
        return null;
    }
    
    const str = String(value).trim();
    
    // 숫자만 있는지 확인 (^[0-9]+$)
    if (!/^\d+$/.test(str)) {
        return null;
    }
    
    try {
        const num = parseInt(str, 10);
        return (num > 0) ? num : null;
    } catch (e) {
        return null;
    }
}

module.exports = {
    extractReplyTarget,
    extractReactionTarget,
    extractImageUrl,
    safeParseInt
};

