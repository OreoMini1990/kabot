// ============================================
// 닉네임 변경 감지 모듈
// ============================================

const CONFIG = require('../config');

const NICKNAME_TRACKER = {
    nicknames: new Map(),
    
    checkAndUpdate: function(senderId, senderName, roomId) {
        if (!CONFIG.FEATURES.NICKNAME_CHANGE_DETECTION) {
            return { changed: false };
        }
        
        if (!senderId || !senderName) {
            return { changed: false };
        }
        
        const key = `${roomId}_${senderId}`;
        const previous = this.nicknames.get(key);
        
        if (!previous) {
            this.nicknames.set(key, {
                name: senderName,
                history: [{ name: senderName, timestamp: new Date().toISOString() }]
            });
            return { changed: false, isFirst: true };
        }
        
        if (previous.name !== senderName) {
            const oldName = previous.name;
            previous.history.push({ name: senderName, timestamp: new Date().toISOString() });
            previous.name = senderName;
            this.nicknames.set(key, previous);
            
            return {
                changed: true,
                oldName: oldName,
                newName: senderName,
                history: previous.history
            };
        }
        
        return { changed: false };
    },
    
    getChangeMessage: function(oldName, newName) {
        return `📛 닉네임 변경 감지\n` +
               `이전 닉네임: ${oldName}\n` +
               `현재 닉네임: ${newName}`;
    }
};

module.exports = NICKNAME_TRACKER;







