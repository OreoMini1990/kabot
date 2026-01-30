/**
 * !뉴스 명령어 처리 모듈
 */

const CONFIG = require('../../config');
const { searchTodayNews } = require('../../../integrations/naverSearch/naverNews');

/**
 * !뉴스 명령어 처리
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>>} 응답 메시지 배열
 */
async function handleNewsCommand(room, msg, sender, json) {
    const replies = [];
    const msgTrimmed = msg.trim();
    
    try {
        const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || CONFIG.NAVER_CLIENT_ID;
        const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || CONFIG.NAVER_CLIENT_SECRET;
        
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
            replies.push("❌ 네이버 검색 API 인증 정보가 설정되지 않았습니다.\n관리자에게 문의해주세요.");
        } else {
            const query = msgTrimmed.substring(3).trim() || '오늘 뉴스';
            console.log(`[!뉴스] 검색 시작: query="${query}"`);
            
            const result = await searchTodayNews(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, query, 1);
            
            if (result.success) {
                let replyMsg = `📰 ${result.title}\n\n`;
                replyMsg += `${result.description}\n\n`;
                replyMsg += `🔗 ${result.link}`;
                replies.push(replyMsg);
                console.log(`[!뉴스] ✅ 검색 성공: "${result.title.substring(0, 50)}..."`);
            } else {
                replies.push(`❌ 뉴스 검색 실패: ${result.message || result.error || '알 수 없는 오류'}`);
                console.log(`[!뉴스] ❌ 검색 실패: ${result.error || '알 수 없는 오류'}`);
            }
        }
    } catch (error) {
        console.error('[!뉴스] 오류:', error);
        replies.push(`❌ 뉴스 검색 중 오류가 발생했습니다.\n오류: ${error.message}\n\n관리자에게 문의해주세요.`);
    }
    
    return replies;
}

module.exports = {
    handleNewsCommand
};






