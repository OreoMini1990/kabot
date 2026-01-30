// ============================================
// 채팅 통계 모듈
// ============================================

const db = require('../database');

async function getChatMessagesByPeriod(roomName, startDate, endDate, limit = 1000) {
    try {
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('*')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.error('[통계] 메시지 조회 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[통계] 메시지 조회 중 오류:', error.message);
        return [];
    }
}

async function getUserChatStatistics(roomName, startDate, endDate) {
    try {
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('sender_name, sender_id')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate);
        
        if (error) {
            console.error('[통계] 사용자 통계 조회 실패:', error.message);
            return {};
        }
        
        const stats = {};
        (data || []).forEach(msg => {
            const key = msg.sender_id || msg.sender_name;
            if (!stats[key]) {
                stats[key] = { name: msg.sender_name, count: 0 };
            }
            stats[key].count++;
        });
        
        return stats;
    } catch (error) {
        console.error('[통계] 사용자 통계 조회 중 오류:', error.message);
        return {};
    }
}

async function searchMessagesByKeyword(roomName, searchQuery, limit = 100) {
    try {
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('*')
            .eq('room_name', roomName)
            .ilike('message_text', `%${searchQuery}%`)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.error('[통계] 메시지 검색 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[통계] 메시지 검색 중 오류:', error.message);
        return [];
    }
}

module.exports = {
    getChatMessagesByPeriod,
    getUserChatStatistics,
    searchMessagesByKeyword
};







