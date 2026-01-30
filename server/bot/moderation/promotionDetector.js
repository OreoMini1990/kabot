// ============================================
// 무단 홍보 감지 모듈
// ============================================

const CONFIG = require('../config');
const { extractSenderName } = require('../utils/botUtils');

const PROMOTION_DETECTOR = {
    violations: new Map(),
    urlRegex: /https?:\/\/[^\s]+/gi,
    
    checkMessage: function(msg, sender) {
        if (!CONFIG.FEATURES.PROMOTION_DETECTION) {
            return { detected: false };
        }
        
        const urls = msg.match(this.urlRegex);
        if (!urls || urls.length === 0) {
            return { detected: false };
        }
        
        for (const url of urls) {
            const lowerUrl = url.toLowerCase();
            const isWhitelisted = CONFIG.PROMOTION_DETECTION.WHITELIST_DOMAINS.some(domain => 
                lowerUrl.includes(domain)
            );
            if (isWhitelisted) continue;
            
            for (const bannedDomain of CONFIG.PROMOTION_DETECTION.BANNED_DOMAINS) {
                if (lowerUrl.includes(bannedDomain)) {
                    let banType = "링크 홍보";
                    if (bannedDomain.includes("kakao")) banType = "오픈채팅 무단 홍보";
                    else if (bannedDomain.includes("toss")) banType = "토스 무단 홍보";
                    else if (bannedDomain.includes("discord")) banType = "디스코드 무단 홍보";
                    
                    return {
                        detected: true,
                        url: url,
                        domain: bannedDomain,
                        banType: banType
                    };
                }
            }
        }
        
        return { detected: false };
    },
    
    addViolation: function(senderId) {
        const senderKey = String(senderId);
        const current = this.violations.get(senderKey) || { count: 0, lastTime: 0 };
        const now = Date.now();
        if (now - current.lastTime > 24 * 60 * 60 * 1000) {
            current.count = 0;
        }
        current.count += 1;
        current.lastTime = now;
        this.violations.set(senderKey, current);
        return current.count;
    },
    
    getWarningMessage: function(sender, banType, count, url, senderName = null) {
        const finalSenderName = senderName || extractSenderName(null, sender);
        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        
        let message = `⚠️ ${banType}가 감지되었습니다.\n`;
        message += `📆 시간: ${now}\n`;
        message += `👤 사용자: ${finalSenderName || sender}\n`;
        message += `📌 무단 홍보 감지 ${count}회째입니다.\n`;
        
        if (count === 1) {
            message += `첫 번째 경고입니다. 무단 홍보는 자제해 주세요.\n`;
            message += `홍보를 원하시면 관리자에게 문의해주세요: https://open.kakao.com/o/sOlCUKjh`;
        } else if (count === 2) {
            message += `두 번째 경고입니다. 계속 시 관리자에게 보고됩니다.\n`;
            message += `관리자 분들은 가려주세요.\n`;
            message += `홍보를 원하시면 관리자에게 문의해주세요: https://open.kakao.com/o/sOlCUKjh`;
        } else if (count >= 3) {
            message += `🚨 관리자에게 보고되었으며, 강퇴 처리됩니다.\n`;
            message += `문의: https://open.kakao.com/o/sOlCUKjh`;
        }
        
        return message;
    }
};

module.exports = PROMOTION_DETECTOR;



