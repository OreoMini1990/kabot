/**
 * 네이버 검색 API - 뉴스 검색
 * 참고: https://developers.naver.com/docs/serviceapi/search/news/news.md
 */

const axios = require('axios');

/**
 * 오늘 주요 뉴스 검색
 * @param {string} clientId - 네이버 Client ID
 * @param {string} clientSecret - 네이버 Client Secret
 * @param {string} [query] - 검색어 (기본값: "오늘 뉴스")
 * @param {number} [display] - 검색 결과 출력 건수 (기본값: 1)
 * @returns {Promise<Object>} { success, title, link, description, pubDate, error }
 */
async function searchTodayNews(clientId, clientSecret, query = '오늘 뉴스', display = 1) {
    try {
        if (!clientId || !clientSecret) {
            return {
                success: false,
                error: 'no_credentials',
                message: '네이버 검색 API 인증 정보가 설정되지 않았습니다.'
            };
        }

        // 네이버 검색 API 엔드포인트
        const apiUrl = 'https://openapi.naver.com/v1/search/news.json';
        
        // 오늘 날짜 (YYYYMMDD 형식)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
        
        // 요청 파라미터
        const params = {
            query: query,
            display: display,
            sort: 'date', // 날짜순 정렬
            start: 1
        };

        const response = await axios.get(apiUrl, {
            params: params,
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret
            }
        });

        if (response.data && response.data.items && response.data.items.length > 0) {
            const item = response.data.items[0];
            
            // HTML 태그 제거
            const cleanTitle = item.title.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const cleanDescription = item.description.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            return {
                success: true,
                title: cleanTitle,
                link: item.link,
                description: cleanDescription,
                pubDate: item.pubDate,
                originallink: item.originallink
            };
        } else {
            return {
                success: false,
                error: 'no_results',
                message: '검색 결과가 없습니다.'
            };
        }
    } catch (error) {
        console.error('[네이버 검색] 뉴스 검색 실패:', error.message);
        
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            
            if (status === 401) {
                return {
                    success: false,
                    error: 'unauthorized',
                    message: '네이버 검색 API 인증에 실패했습니다. Client ID와 Client Secret을 확인해주세요.'
                };
            } else if (status === 429) {
                return {
                    success: false,
                    error: 'rate_limit',
                    message: 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
                };
            }
            
            return {
                success: false,
                error: 'api_error',
                message: errorData?.errorMessage || error.message,
                statusCode: status
            };
        }
        
        return {
            success: false,
            error: 'network_error',
            message: error.message
        };
    }
}

module.exports = {
    searchTodayNews
};

