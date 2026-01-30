/**
 * 채팅방 이름 정규화 유틸리티
 * 
 * 목적: 캐시 키 생성 시 roomName을 일관되게 정규화하여 불일치 방지
 * - trim, 연속 공백 제거, 제어문자 제거
 * - 유니코드 정규화 (선택사항)
 */

/**
 * 채팅방 이름을 캐시 키용으로 정규화
 * @param {string|null|undefined} roomName - 원본 채팅방 이름
 * @returns {string} 정규화된 채팅방 이름
 */
function normalizeRoomNameForCache(roomName) {
    if (!roomName) {
        return '';
    }
    
    let normalized = String(roomName);
    
    // 1. trim
    normalized = normalized.trim();
    
    // 2. 연속 공백을 1개로 치환
    normalized = normalized.replace(/\s+/g, ' ');
    
    // 3. 제어문자 제거 (\r, \n, \t 등)
    normalized = normalized.replace(/[\r\n\t]/g, '');
    
    // 4. 유니코드 정규화 (NFKC) - 선택사항이지만 더 안전함
    // Node.js의 경우 String.prototype.normalize 사용 가능
    try {
        if (typeof normalized.normalize === 'function') {
            normalized = normalized.normalize('NFKC');
        }
    } catch (e) {
        // normalize 미지원 환경에서는 무시
    }
    
    return normalized;
}

/**
 * 발신자 ID 정규화 (캐시 키 생성용)
 * "이름/ID" 형식에서 ID만 추출, 또는 숫자 ID 그대로 사용
 * @param {string|null|undefined} senderId - 발신자 ID
 * @returns {string} 정규화된 발신자 ID
 */
function normalizeSenderIdForCache(senderId) {
    if (!senderId) {
        return '';
    }
    
    const str = String(senderId).trim();
    
    // 1. 숫자만 있으면 그대로 사용
    if (/^\d+$/.test(str)) {
        return str;
    }
    
    // 2. "이름/ID" 형식에서 모든 부분에서 숫자 ID 찾기 (마지막부터)
    if (str.includes('/')) {
        const parts = str.split('/');
        // 모든 부분에서 숫자 ID 찾기 (마지막부터 역순)
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i].trim();
            if (/^\d+$/.test(part)) {
                return part;  // 숫자 ID 반환
            }
        }
        // 숫자를 찾지 못한 경우 원본 그대로 (하위 호환성)
        // 예: "AN" 같은 경우도 있을 수 있음
        return str;
    }
    
    // 3. 그 외는 원본 그대로
    return str;
}

/**
 * 캐시 키 생성 (roomName + senderId)
 * @param {string|null|undefined} roomName - 채팅방 이름
 * @param {string|null|undefined} senderId - 발신자 ID
 * @returns {string} 정규화된 캐시 키
 */
function createCacheKey(roomName, senderId) {
    const normalizedRoom = normalizeRoomNameForCache(roomName);
    const normalizedSender = normalizeSenderIdForCache(senderId);
    return `${normalizedRoom}|${normalizedSender}`;
}

module.exports = {
    normalizeRoomNameForCache,
    normalizeSenderIdForCache,
    createCacheKey
};

