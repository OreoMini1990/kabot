// ============================================
// 메시지 저장 모듈
// ============================================

const db = require('../database');
const { getOrCreateUser } = require('./userManager');
const { getOrCreateRoom, ensureRoomMembership } = require('./roomManager');

async function saveChatMessage(roomName, senderName, senderId, messageText, isGroupChat = true, metadata = null, replyToMessageId = null, threadId = null, rawSender = null, kakaoLogId = null, replyToKakaoLogId = null) {
    try {
        const user = await getOrCreateUser(roomName, senderName, senderId);
        const room = await getOrCreateRoom(roomName, isGroupChat ? 'group' : 'direct');
        
        if (!user || !room) {
            console.error('[채팅 로그] 사용자 또는 채팅방 조회 실패');
        }
        
        if (user && room) {
            await ensureRoomMembership(room.id, user.id);
        }
        
        const wordCount = messageText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const charCount = messageText.length;
        const hasMention = /@\w+/.test(messageText);
        const hasUrl = /https?:\/\/[^\s]+/.test(messageText);
        const hasImage = /\.(jpg|jpeg|png|gif|webp)/i.test(messageText) || messageText.includes('📷') || messageText.includes('이미지');
        const hasFile = /\.(pdf|doc|docx|xls|xlsx|zip|rar)/i.test(messageText);
        const hasVideo = /\.(mp4|avi|mov|wmv|flv)/i.test(messageText);
        const hasLocation = /위치|location|지도/i.test(messageText);
        
        let messageType = 'text';
        if (hasImage) messageType = 'image';
        else if (hasVideo) messageType = 'video';
        else if (hasFile) messageType = 'file';
        else if (hasLocation) messageType = 'location';
        else if (hasUrl) messageType = 'link';
        
        const finalMetadata = {
            ...metadata,
            _id: kakaoLogId || metadata?._id
        };
        
        const insertData = {
            room_id: room?.id || null,
            room_name: roomName,
            user_id: user?.id || null,
            sender_name: senderName,
            sender_id: senderId || null,
            raw_sender: rawSender || null,
            message_text: messageText,
            message_type: messageType,
            is_group_chat: isGroupChat,
            word_count: wordCount,
            char_count: charCount,
            has_mention: hasMention,
            has_url: hasUrl,
            has_image: hasImage,
            has_file: hasFile,
            has_video: hasVideo,
            has_location: hasLocation,
            reply_to_message_id: replyToMessageId || null,
            reply_to_kakao_log_id: replyToKakaoLogId || null,
            thread_id: threadId || null,
            kakao_log_id: kakaoLogId || null,
            metadata: finalMetadata || null
        };
        
        const chatIdValue = metadata?.chat_id || metadata?._chat_id;
        if (chatIdValue) {
            const chatIdNum = typeof chatIdValue === 'string' ? parseInt(chatIdValue, 10) : chatIdValue;
            if (!isNaN(chatIdNum) && chatIdNum > 0) {
                insertData.chat_id = chatIdNum;
            }
        }
        
        const { data, error } = await db.supabase
            .from('chat_messages')
            .insert(insertData)
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 메시지 저장 실패:', error.message);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 메시지 저장 중 오류:', error.message);
        return null;
    }
}

module.exports = {
    saveChatMessage
};







