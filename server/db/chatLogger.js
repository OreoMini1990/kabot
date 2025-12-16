// ============================================
// 채팅 로그 저장 및 통계 관리
// ============================================

const db = require('./database');

/**
 * 채팅 메시지 저장
 */
async function saveChatMessage(roomName, senderName, senderId, messageText, isGroupChat = true) {
    try {
        // 메시지 분석
        const wordCount = messageText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const charCount = messageText.length;
        const hasMention = /@\w+/.test(messageText);
        const hasUrl = /https?:\/\/[^\s]+/.test(messageText);
        const hasImage = /\.(jpg|jpeg|png|gif|webp)/i.test(messageText) || messageText.includes('📷') || messageText.includes('이미지');
        
        // 메시지 타입 결정
        let messageType = 'text';
        if (hasImage) messageType = 'image';
        else if (hasUrl) messageType = 'url';
        
        const { data, error } = await db.supabase
            .from('chat_messages')
            .insert({
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId || null,
                message_text: messageText,
                message_type: messageType,
                is_group_chat: isGroupChat,
                word_count: wordCount,
                char_count: charCount,
                has_mention: hasMention,
                has_url: hasUrl,
                has_image: hasImage
            })
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 메시지 저장 실패:', error.message);
            return null;
        }
        
        // 사용자 통계 업데이트 (비동기)
        updateUserStatistics(roomName, senderName, senderId, wordCount, charCount).catch(err => {
            console.error('[채팅 로그] 통계 업데이트 실패:', err.message);
        });
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 메시지 저장 중 오류:', error.message);
        return null;
    }
}

/**
 * 사용자 통계 업데이트
 */
async function updateUserStatistics(roomName, senderName, senderId, wordCount, charCount) {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // 기존 통계 조회
        const { data: existing } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', senderName)
            .eq('room_name', roomName)
            .eq('date', today)
            .single();
        
        const currentHour = new Date().getHours();
        
        if (existing) {
            // 기존 통계 업데이트
            const hourlyCount = existing.hourly_message_count || {};
            hourlyCount[currentHour] = (hourlyCount[currentHour] || 0) + 1;
            
            await db.supabase
                .from('user_statistics')
                .update({
                    message_count: existing.message_count + 1,
                    total_char_count: existing.total_char_count + charCount,
                    total_word_count: existing.total_word_count + wordCount,
                    hourly_message_count: hourlyCount,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
        } else {
            // 새 통계 생성
            const hourlyCount = {};
            hourlyCount[currentHour] = 1;
            
            await db.supabase
                .from('user_statistics')
                .insert({
                    user_name: senderName,
                    user_id: senderId || null,
                    room_name: roomName,
                    date: today,
                    message_count: 1,
                    total_char_count: charCount,
                    total_word_count: wordCount,
                    hourly_message_count: hourlyCount
                });
        }
    } catch (error) {
        console.error('[채팅 로그] 통계 업데이트 오류:', error.message);
    }
}

/**
 * 반응 저장
 */
async function saveReaction(messageId, reactionType, reactorName, reactorId, isAdminReaction = false) {
    try {
        const { data, error } = await db.supabase
            .from('chat_reactions')
            .insert({
                message_id: messageId,
                reaction_type: reactionType,
                reactor_name: reactorName,
                reactor_id: reactorId || null,
                is_admin_reaction: isAdminReaction
            })
            .select()
            .single();
        
        if (error) {
            // 중복 반응인 경우 무시
            if (error.code === '23505') { // unique_violation
                return null;
            }
            console.error('[채팅 로그] 반응 저장 실패:', error.message);
            return null;
        }
        
        // 반응 통계 업데이트 (비동기)
        updateReactionStatistics(messageId, reactorName, isAdminReaction).catch(err => {
            console.error('[채팅 로그] 반응 통계 업데이트 실패:', err.message);
        });
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 반응 저장 중 오류:', error.message);
        return null;
    }
}

/**
 * 반응 통계 업데이트
 */
async function updateReactionStatistics(messageId, reactorName, isAdminReaction) {
    try {
        // 메시지 정보 조회
        const { data: message } = await db.supabase
            .from('chat_messages')
            .select('sender_name, sender_id, room_name, created_at')
            .eq('id', messageId)
            .single();
        
        if (!message) return;
        
        const messageDate = new Date(message.created_at).toISOString().split('T')[0];
        
        // 메시지 작성자 통계 업데이트 (받은 반응)
        const { data: senderStats } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', message.sender_name)
            .eq('room_name', message.room_name)
            .eq('date', messageDate)
            .single();
        
        if (senderStats) {
            await db.supabase
                .from('user_statistics')
                .update({
                    received_reactions_count: senderStats.received_reactions_count + 1,
                    received_admin_reactions_count: isAdminReaction 
                        ? senderStats.received_admin_reactions_count + 1 
                        : senderStats.received_admin_reactions_count,
                    updated_at: new Date().toISOString()
                })
                .eq('id', senderStats.id);
        }
        
        // 반응을 준 사용자 통계 업데이트 (준 반응)
        const { data: reactorStats } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', reactorName)
            .eq('room_name', message.room_name)
            .eq('date', messageDate)
            .single();
        
        if (reactorStats) {
            await db.supabase
                .from('user_statistics')
                .update({
                    given_reactions_count: reactorStats.given_reactions_count + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', reactorStats.id);
        }
    } catch (error) {
        console.error('[채팅 로그] 반응 통계 업데이트 오류:', error.message);
    }
}

/**
 * 기간별 채팅 조회
 */
async function getChatMessagesByPeriod(roomName, startDate, endDate, limit = 1000) {
    try {
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('*')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .order('created_at', { ascending: true })
            .limit(limit);
        
        if (error) {
            console.error('[채팅 로그] 메시지 조회 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[채팅 로그] 메시지 조회 중 오류:', error.message);
        return [];
    }
}

/**
 * 사용자별 채팅 통계 조회
 */
async function getUserChatStatistics(roomName, startDate, endDate) {
    try {
        const { data, error } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('room_name', roomName)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('message_count', { ascending: false });
        
        if (error) {
            console.error('[채팅 로그] 통계 조회 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[채팅 로그] 통계 조회 중 오류:', error.message);
        return [];
    }
}

/**
 * 가장 반응 많이 받은 사용자 조회
 */
async function getMostReactedUser(roomName, startDate, endDate) {
    try {
        // 먼저 기간 내 메시지 ID 목록 조회
        const { data: messages, error: msgError } = await db.supabase
            .from('chat_messages')
            .select('id, sender_name')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate);
        
        if (msgError) {
            console.error('[채팅 로그] 메시지 조회 실패:', msgError.message);
            return null;
        }
        
        if (!messages || messages.length === 0) {
            return null;
        }
        
        const messageIds = messages.map(m => m.id);
        
        // 해당 메시지들의 반응 조회
        const { data: reactions, error: reactError } = await db.supabase
            .from('chat_reactions')
            .select('message_id')
            .in('message_id', messageIds);
        
        if (reactError) {
            console.error('[채팅 로그] 반응 조회 실패:', reactError.message);
            return null;
        }
        
        if (!reactions || reactions.length === 0) {
            return null;
        }
        
        // 메시지 ID -> 발신자 매핑
        const messageToSender = {};
        messages.forEach(msg => {
            messageToSender[msg.id] = msg.sender_name;
        });
        
        // 사용자별 반응 수 집계
        const userReactions = {};
        reactions.forEach(reaction => {
            const senderName = messageToSender[reaction.message_id];
            if (senderName) {
                userReactions[senderName] = (userReactions[senderName] || 0) + 1;
            }
        });
        
        // 가장 많이 받은 사용자 찾기
        let maxReactions = 0;
        let topUser = null;
        for (const [userName, count] of Object.entries(userReactions)) {
            if (count > maxReactions) {
                maxReactions = count;
                topUser = userName;
            }
        }
        
        return topUser ? { user_name: topUser, reaction_count: maxReactions } : null;
    } catch (error) {
        console.error('[채팅 로그] 반응 통계 조회 중 오류:', error.message);
        return null;
    }
}

module.exports = {
    saveChatMessage,
    saveReaction,
    getChatMessagesByPeriod,
    getUserChatStatistics,
    getMostReactedUser
};

