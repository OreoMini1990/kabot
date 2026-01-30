// ============================================
// 입퇴장/강퇴 감지 모듈
// ============================================

const CONFIG = require('../config');

const MEMBER_TRACKER = {
    FEED_TYPES: {
        INVITE: 1,
        LEAVE: 2,
        OPEN_CHAT_JOIN: 4,
        KICK: 6,
        PROMOTE: 11,
        DEMOTE: 12,
        DELETE: 14,
        HANDOVER: 15
    },
    
    processFeedMessage: function(feedType, feedData, roomName) {
        const result = { handled: false, message: null, type: null };
        
        switch (feedType) {
            case this.FEED_TYPES.KICK:
                if (CONFIG.FEATURES.KICK_DETECTION) {
                    result.handled = true;
                    result.type = 'kick';
                    const kickedUser = feedData?.member?.nickName || feedData?.kickedUser?.nickName || '알 수 없음';
                    const kickedBy = feedData?.kicker?.nickName || feedData?.kickedBy?.name || '관리자';
                    result.message = `⚠️ 강퇴 감지\n${kickedBy}님이 ${kickedUser}님을 내보냈습니다.`;
                    console.log(`[강퇴 감지] ${kickedBy} -> ${kickedUser} (방: ${roomName})`);
                }
                break;
            case this.FEED_TYPES.PROMOTE:
                console.log(`[권한 변경] 부방장 승급: ${feedData?.member?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
            case this.FEED_TYPES.DEMOTE:
                console.log(`[권한 변경] 부방장 강등: ${feedData?.member?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
            case this.FEED_TYPES.HANDOVER:
                console.log(`[권한 변경] 방장 위임: ${feedData?.prevHost?.nickName || '알 수 없음'} -> ${feedData?.newHost?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
        }
        
        return result;
    }
};

module.exports = MEMBER_TRACKER;







