/**
 * !통계 명령어 처리 모듈
 */

const { extractSenderName, extractSenderId, isAdmin } = require('../../utils/botUtils');
const { getChatRankings } = require('./statsService');
const CONFIG = require('../../config');

/**
 * !통계, /오늘 채팅, /어제 채팅, /이번주 채팅 명령어 처리 (관리자 전용)
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>>} 응답 메시지 배열
 */
async function handleStatsCommand(room, msg, sender, json) {
    const replies = [];
    
    // 관리자 권한 체크
    if (!isAdmin(sender, json)) {
        replies.push("❌ 통계 조회는 관리자만 사용할 수 있습니다.");
        console.log(`[통계] ⚠️ 권한 없음: sender="${sender}"`);
        return replies;
    }
    
    try {
        const msgLower = msg.trim().toLowerCase();
        const endDate = new Date();
        const startDate = new Date();
        let title = "📊 최근 7일 채팅 통계";
        
        // 명령어에 따라 기간 설정
        if (msgLower.startsWith("/오늘 채팅")) {
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            title = "📊 오늘 채팅 통계";
        } else if (msgLower.startsWith("/어제 채팅")) {
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            title = "📊 어제 채팅 통계";
        } else if (msgLower.startsWith("/이번주 채팅")) {
            const dayOfWeek = startDate.getDay();
            startDate.setDate(startDate.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
            title = "📊 이번주 채팅 통계";
        } else {
            // !통계 (기본: 최근 7일)
            startDate.setDate(startDate.getDate() - 7);
        }
        
        const senderName = extractSenderName(json, sender) || sender || '알 수 없음';
        const statsText = await getChatRankings(startDate, endDate, title, senderName, room);
        replies.push(statsText);
        console.log(`[통계] ✅ 통계 조회 완료: room="${room}", sender="${senderName}", title="${title}"`);
    } catch (error) {
        console.error('[통계] 오류:', error);
        replies.push("❌ 통계 조회 중 오류가 발생했습니다.\n관리자에게 문의해주세요.");
    }
    
    return replies;
}

module.exports = {
    handleStatsCommand
};

