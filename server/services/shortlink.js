/**
 * 짧은 링크(Shortlink) 서비스
 * base62 인코딩을 사용하여 짧은 코드 생성
 */

/**
 * base62 인코딩 (0-9, a-z, A-Z)
 */
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 숫자를 base62로 인코딩
 * @param {number} num - 인코딩할 숫자
 * @returns {string} base62 인코딩된 문자열
 */
function encodeBase62(num) {
    if (num === 0) return '0';
    
    let result = '';
    while (num > 0) {
        result = BASE62[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result;
}

/**
 * base62를 숫자로 디코딩
 * @param {string} str - base62 인코딩된 문자열
 * @returns {number} 디코딩된 숫자
 */
function decodeBase62(str) {
    let num = 0;
    for (let i = 0; i < str.length; i++) {
        num = num * 62 + BASE62.indexOf(str[i]);
    }
    return num;
}

/**
 * 짧은 코드 생성 (타임스탬프 + 랜덤 조합)
 * @returns {string} 7-10자리 짧은 코드
 */
function generateShortCode() {
    // 타임스탬프의 마지막 부분 + 랜덤 숫자
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const combined = timestamp % 100000000 + random;
    
    const encoded = encodeBase62(combined);
    
    // 최소 7자리 확보 (앞에 0 패딩)
    return encoded.padStart(7, '0');
}

/**
 * 짧은 코드 검증
 * @param {string} code - 검증할 코드
 * @returns {boolean} 유효한 코드인지 여부
 */
function isValidShortCode(code) {
    if (!code || typeof code !== 'string') return false;
    if (code.length < 5 || code.length > 15) return false;
    
    // base62 문자만 포함되어 있는지 확인
    return /^[0-9a-zA-Z]+$/.test(code);
}

module.exports = {
    generateShortCode,
    isValidShortCode,
    encodeBase62,
    decodeBase62
};










