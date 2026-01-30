/**
 * 통계 서비스 모듈
 * getChatRankings 함수를 별도 모듈로 분리
 */

const chatLogger = require('../../../db/chatLogger');

/**
 * 채팅 통계 조회
 * @param {Date} startDate - 시작 날짜
 * @param {Date} endDate - 종료 날짜
 * @param {string} title - 통계 제목
 * @param {string} sender - 발신자 이름
 * @param {string} room - 채팅방 이름
 * @returns {Promise<string>} 통계 텍스트
 */
async function getChatRankings(startDate, endDate, title, sender, room = '의운모') {
    try {
        // DB에서 통계 조회
        const stats = await chatLogger.getUserChatStatistics(room, startDate.toISOString(), endDate.toISOString());
        
        if (!stats || stats.length === 0) {
            return `${title}\n────────\n• 그룹반 전체횟수: 0회\n• ${sender}: 순위 없음\n\n📭 해당 기간에 채팅 데이터가 없습니다.`;
        }
        
        // 사용자별 메시지 수 집계
        const userChatCounts = {};
        let totalChats = 0;
        
        // 복호화 함수 가져오기
        const { extractSenderName } = require('../../utils/botUtils');
        
        stats.forEach(stat => {
            let userName = stat.user_name || stat.display_name || '알 수 없음';
            
            // 암호화된 이름인지 확인 (base64 패턴)
            const isBase64Like = userName && userName.length > 10 && userName.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(userName);
            if (isBase64Like && stat.user_id) {
                // 복호화 시도
                try {
                    const decryptKakaoTalkMessage = require('../../../crypto/kakaoDecrypt').decryptKakaoTalkMessage;
                    if (decryptKakaoTalkMessage) {
                        // enc 후보: 31, 30, 32 순으로 시도
                        for (const encTry of [31, 30, 32]) {
                            const decrypted = decryptKakaoTalkMessage(userName, String(stat.user_id), encTry);
                            if (decrypted && decrypted !== userName) {
                                const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                                const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
                                const isValidText = !hasControlChars && !isBase64Pattern;
                                
                                if (isValidText) {
                                    userName = decrypted;
                                    console.log(`[통계] ✅ 이름 복호화 성공: ${userName.substring(0, 20)}... (enc=${encTry})`);
                                    break;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[통계] 이름 복호화 실패: ${err.message}`);
                }
            }
            
            const count = stat.message_count || 0;
            userChatCounts[userName] = (userChatCounts[userName] || 0) + count;
            totalChats += count;
        });
        
        // 정렬
        const sortedUsers = Object.keys(userChatCounts).sort(function(a, b) {
            return userChatCounts[b] - userChatCounts[a];
        });
        
        let responseText = title + "\n" + "\u200b".repeat(500) + "\n────────\n";
        responseText += "• 그룹반 전체횟수: " + totalChats.toLocaleString() + "회\n";
        
        const senderRank = sortedUsers.indexOf(sender) + 1;
        if (senderRank > 0) {
            responseText += "• " + sender + ": " + senderRank + "위\n\n";
        } else {
            responseText += "• " + sender + ": 순위 없음\n\n";
        }
        
        const medals = ["🥇", "🥈", "🥉"];
        for (let i = 0; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            const count = userChatCounts[user];
            const percentage = totalChats > 0 ? ((count / totalChats) * 100).toFixed(2) : "0.00";
            
            let rankText = (i + 1) + "위: ";
            if (i < 3) {
                rankText = medals[i] + " " + rankText;
            }
            
            responseText += rankText + user + " (" + count.toLocaleString() + "회 | " + percentage + "%)\n";
            
            if ((i + 1) % 10 === 0) {
                responseText += "\n";
            }
        }
        
        return responseText;
    } catch (error) {
        console.error('[통계] getChatRankings 오류:', error.message);
        return `${title}\n────────\n❌ 통계 조회 중 오류가 발생했습니다: ${error.message}`;
    }
}

module.exports = {
    getChatRankings
};



