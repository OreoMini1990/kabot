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
 * @param {string|number|null} referer - referer 필드 값 (우선순위 1)
 * @param {string|number|null} msgType - 메시지 타입 (예: 26 = 답장)
 * @returns {number|null} kakao_log_id 또는 null
 */
function extractReplyTarget(attachment, referer, msgType = null) {
    // 1순위: referer 필드 (가장 신뢰할 수 있음)
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
                // src_message 또는 logId 확인 (답장 메시지)
                const srcMessageId = attachObj.src_message || attachObj.logId || attachObj.src_logId;
                
                if (srcMessageId) {
                    try {
                        const srcMessageStr = String(srcMessageId).trim();
                        if (/^\d+$/.test(srcMessageStr)) {
                            const num = parseInt(srcMessageStr, 10);
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
 * 이미지 URL 추출
 * @param {Object|string|null} attachment - attachment JSON 객체 또는 문자열
 * @param {string|number|null} msgType - 메시지 타입 (예: 2 = 사진, 12 = 이미지, 27 = 사진 앨범)
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
                return null; // 파싱 실패
            }
        }
        
        // 객체인 경우에만 처리
        if (attachObj && typeof attachObj === 'object') {
            // 이미지 URL 필드 (우선순위 순)
            const imageUrl = attachObj.url || 
                            attachObj.thumbnailUrl || 
                            attachObj.path || 
                            attachObj.path_1 ||
                            attachObj.xl || 
                            attachObj.l || 
                            attachObj.m || 
                            attachObj.s;
            
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                return imageUrl.trim();
            }
        }
    } catch (e) {
        // 추출 실패 시 무시
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

