/**
 * buly.kr URL 단축 API 서비스
 * API 문서: https://www.buly.kr/api/shoturl.siso
 */

const axios = require('axios');

/**
 * buly.kr API를 사용하여 URL 단축
 * @param {string} originalUrl - 단축할 원본 URL
 * @param {string} customerId - 회원가입 아이디 (예: ghclinicys)
 * @param {string} partnerApiId - buly에서 발급받은 API 코드
 * @returns {Promise<Object>} { success, shortUrl, message }
 */
async function shortenUrl(originalUrl, customerId, partnerApiId) {
    try {
        const apiUrl = 'https://www.buly.kr/api/shoturl.siso';
        
        const params = {
            customer_id: customerId,
            partner_api_id: partnerApiId,
            org_url: originalUrl
        };
        
        console.log(`[buly.kr] URL 단축 요청: originalUrl=${originalUrl.substring(0, 50)}...`);
        
        // application/x-www-form-urlencoded 형식으로 변환
        const querystring = require('querystring');
        const formData = querystring.stringify(params);
        
        const response = await axios.post(apiUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log(`[buly.kr] API 응답:`, JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.result === 'Y') {
            const shortUrl = response.data.url;
            console.log(`[buly.kr] URL 단축 성공: ${shortUrl}`);
            return {
                success: true,
                shortUrl: shortUrl,
                message: response.data.message || '성공'
            };
        } else {
            const errorMessage = response.data?.message || 'URL 단축 실패';
            console.error(`[buly.kr] URL 단축 실패: ${errorMessage}`);
            return {
                success: false,
                shortUrl: null,
                message: errorMessage
            };
        }
        
    } catch (error) {
        console.error('[buly.kr] URL 단축 오류:', error.message);
        if (error.response) {
            console.error('[buly.kr] API 응답 오류:', error.response.data);
            return {
                success: false,
                shortUrl: null,
                message: error.response.data?.message || error.message
            };
        }
        return {
            success: false,
            shortUrl: null,
            message: error.message
        };
    }
}

module.exports = {
    shortenUrl
};

