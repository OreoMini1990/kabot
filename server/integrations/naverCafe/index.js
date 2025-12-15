/**
 * 네이버 카페 통합 모듈
 */

const { writeCafeArticle } = require('./cafeWrite');

/**
 * 네이버 카페에 질문 글 작성
 * @param {Object} params
 * @param {string} params.title - 질문 제목
 * @param {string} params.content - 질문 내용
 * @param {string} params.accessToken - 네이버 OAuth 액세스 토큰
 * @param {number} params.clubid - 카페 ID
 * @param {number} params.menuid - 게시판 메뉴 ID
 * @param {number} [params.headid] - 말머리 ID (선택사항)
 * @returns {Promise<Object>}
 */
async function createQuestion({ title, content, accessToken, clubid, menuid, headid }) {
    try {
        const result = await writeCafeArticle({
            subject: title,
            content: content,
            clubid: clubid,
            menuid: menuid,
            accessToken: accessToken,
            headid: headid
        });
        
        return result;
    } catch (error) {
        console.error('[네이버 카페] 질문 작성 실패:', error);
        return {
            success: false,
            error: 'unknown_error',
            message: error.message
        };
    }
}

module.exports = {
    createQuestion,
    writeCafeArticle
};

