// ============================================
// 반응 관리 모듈
// ============================================

const db = require('../database');

async function saveReaction(messageId, reactionType, reactorName, reactorId, isAdminReaction = false) {
    try {
        const { data, error } = await db.supabase
            .from('reactions')
            .insert({
                message_id: messageId,
                reaction_type: reactionType,
                reactor_name: reactorName,
                reactor_id: reactorId || null,
                is_admin_reaction: isAdminReaction,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) {
            console.error('[반응] 저장 실패:', error.message);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('[반응] 저장 중 오류:', error.message);
        return null;
    }
}

async function updateReactionStatistics(messageId, reactorName, isAdminReaction) {
    try {
        const { data: existing } = await db.supabase
            .from('reaction_statistics')
            .select('*')
            .eq('message_id', messageId)
            .single();
        
        if (existing) {
            const updateData = {
                reaction_count: (existing.reaction_count || 0) + 1,
                updated_at: new Date().toISOString()
            };
            
            if (isAdminReaction) {
                updateData.admin_reaction_count = (existing.admin_reaction_count || 0) + 1;
            }
            
            await db.supabase
                .from('reaction_statistics')
                .update(updateData)
                .eq('id', existing.id);
        } else {
            await db.supabase
                .from('reaction_statistics')
                .insert({
                    message_id: messageId,
                    reaction_count: 1,
                    admin_reaction_count: isAdminReaction ? 1 : 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
        }
    } catch (error) {
        console.error('[반응 통계] 업데이트 실패:', error.message);
    }
}

module.exports = {
    saveReaction,
    updateReactionStatistics
};







