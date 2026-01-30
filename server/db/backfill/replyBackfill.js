// ============================================
// 답장 백필 모듈
// ============================================

const db = require('../database');

function safeParseInt(value) {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
    return isNaN(num) ? null : num;
}

async function backfillReplyLink(messageId, roomName, replyToKakaoLogId) {
    try {
        if (!replyToKakaoLogId || !roomName) {
            return;
        }
        
        const numericLogId = safeParseInt(replyToKakaoLogId);
        if (!numericLogId) {
            return;
        }
        
        const { data: targetMessage, error } = await db.supabase
            .from('chat_messages')
            .select('id')
            .eq('kakao_log_id', numericLogId)
            .eq('room_name', roomName)
            .maybeSingle();
        
        if (error) {
            console.warn(`[백필] 답장 대상 메시지 조회 실패: ${error.message}`);
            return;
        }
        
        if (targetMessage && targetMessage.id) {
            const { error: updateError } = await db.supabase
                .from('chat_messages')
                .update({ reply_to_message_id: targetMessage.id })
                .eq('id', messageId)
                .eq('reply_to_message_id', null);
            
            if (updateError) {
                console.warn(`[백필] 답장 링크 업데이트 실패: ${updateError.message}`);
            } else {
                console.log(`[백필] ✅ 답장 링크 연결 완료: message_id=${messageId}, reply_to_message_id=${targetMessage.id}`);
            }
        }
    } catch (error) {
        console.error('[백필] 백필 작업 중 오류:', error.message);
    }
}

async function backfillAllPendingReplies() {
    try {
        const { data: pendingMessages, error } = await db.supabase
            .from('chat_messages')
            .select('id, room_name, reply_to_kakao_log_id')
            .not('reply_to_kakao_log_id', 'is', null)
            .is('reply_to_message_id', null)
            .limit(100);
        
        if (error) {
            console.error('[백필] 대기 중인 메시지 조회 실패:', error.message);
            return;
        }
        
        if (!pendingMessages || pendingMessages.length === 0) {
            return;
        }
        
        let successCount = 0;
        for (const msg of pendingMessages) {
            await backfillReplyLink(msg.id, msg.room_name, msg.reply_to_kakao_log_id);
            successCount++;
        }
        
        if (successCount > 0) {
            console.log(`[백필] ✅ ${successCount}개 메시지 백필 완료`);
        }
    } catch (error) {
        console.error('[백필] 전체 백필 작업 실패:', error.message);
    }
}

module.exports = {
    backfillReplyLink,
    backfillAllPendingReplies
};







