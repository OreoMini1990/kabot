// ============================================
// 메시지 삭제 감지 모듈
// ============================================

const CONFIG = require('../config');

const MESSAGE_DELETE_TRACKER = {
    deleteLogs: new Map(),
    
    addDeleteLog: function(userId) {
        if (!CONFIG.FEATURES.MESSAGE_DELETE_DETECTION) {
            return 0;
        }
        
        const userKey = String(userId);
        const now = new Date();
        const cutoff = new Date(now.getTime() - CONFIG.MESSAGE_DELETE_DETECTION.TRACKING_PERIOD_HOURS * 60 * 60 * 1000);
        
        let logs = this.deleteLogs.get(userKey) || [];
        logs = logs.filter(time => new Date(time) > cutoff);
        logs.push(now.toISOString());
        this.deleteLogs.set(userKey, logs);
        
        return logs.length;
    },
    
    getWarningMessage: function(senderName, count) {
        if (count >= 3) {
            return `🚨 ${senderName}님, 24시간 내 메시지 삭제 ${count}회!\n관리자에게 보고되었습니다.`;
        } else if (count === 2) {
            return `⚠️ ${senderName}님, 24시간 내 메시지 삭제 ${count}회!\n계속 시 관리자에게 보고됩니다.`;
        } else {
            return `💬 ${senderName}님, 메시지 삭제가 감지되었습니다.\n메시지 삭제는 자제해 주세요.`;
        }
    }
};

module.exports = MESSAGE_DELETE_TRACKER;







