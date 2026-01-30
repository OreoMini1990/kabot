/**
 * 답장 메시지 상세 확인 스크립트
 * 실행: node server/db/check_reply_detailed.js
 */

const db = require('./database');

async function checkReplyDetailed() {
    try {
        console.log('='.repeat(60));
        console.log('답장 메시지 상세 확인');
        console.log('='.repeat(60));
        
        // 1. 최근 메시지 20개 조회 (답장 여부 확인)
        console.log('\n[1] 최근 메시지 20개 조회 (답장 정보 포함)');
        const { data: recentMessages, error: recentError } = await db.supabase
            .from('chat_messages')
            .select('id, kakao_log_id, room_name, sender_name, message_text, message_type, reply_to_message_id, reply_to_kakao_log_id, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (recentError) {
            console.error('❌ 조회 오류:', recentError.message);
            return;
        }
        
        console.log(`✅ 최근 메시지 ${recentMessages.length}개 발견`);
        if (recentMessages.length > 0) {
            console.log('\n최근 메시지 목록:');
            recentMessages.forEach((msg, idx) => {
                const isReply = !!(msg.reply_to_message_id || msg.reply_to_kakao_log_id);
                const replyMark = isReply ? '📎 답장' : '📝 일반';
                console.log(`\n[${idx + 1}] ${replyMark} ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    메시지: ${(msg.message_text || '').substring(0, 50)}...`);
                console.log(`    message_type: ${msg.message_type || 'NULL'}`);
                // metadata에서 msg_type 확인
                if (msg.metadata && typeof msg.metadata === 'object' && msg.metadata.msg_type) {
                    console.log(`    metadata.msg_type: ${msg.metadata.msg_type}`);
                }
                console.log(`    reply_to_message_id: ${msg.reply_to_message_id || 'NULL'}`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id || 'NULL'}`);
                if (msg.metadata && typeof msg.metadata === 'object') {
                    const hasReplyInfo = msg.metadata.reply_to_message_text || msg.metadata.reply_to_sender_name;
                    if (hasReplyInfo) {
                        console.log(`    metadata.reply_to_message_text: ${msg.metadata.reply_to_message_text ? '있음' : '없음'}`);
                        console.log(`    metadata.reply_to_sender_name: ${msg.metadata.reply_to_sender_name || 'NULL'}`);
                    }
                }
                console.log(`    생성 시간: ${msg.created_at}`);
            });
        }
        
        // 2. 답장 메시지 통계
        console.log('\n\n[2] 답장 메시지 통계');
        const { data: allMessages, error: allError } = await db.supabase
            .from('chat_messages')
            .select('id, reply_to_message_id, reply_to_kakao_log_id', { count: 'exact' });
        
        if (allError) {
            console.error('❌ 통계 조회 오류:', allError.message);
            return;
        }
        
        const totalMessages = allMessages.length;
        const replyByMessageId = allMessages.filter(m => m.reply_to_message_id).length;
        const replyByKakaoLogId = allMessages.filter(m => m.reply_to_kakao_log_id).length;
        const replyTotal = allMessages.filter(m => m.reply_to_message_id || m.reply_to_kakao_log_id).length;
        
        console.log(`전체 메시지: ${totalMessages}개`);
        console.log(`reply_to_message_id 있는 메시지: ${replyByMessageId}개`);
        console.log(`reply_to_kakao_log_id 있는 메시지: ${replyByKakaoLogId}개`);
        console.log(`답장 메시지 (둘 중 하나라도 있음): ${replyTotal}개`);
        
        // 3. reply_to_kakao_log_id는 있지만 reply_to_message_id가 null인 메시지 (백필 대기)
        console.log('\n\n[3] 백필 대기 중인 메시지 (reply_to_kakao_log_id는 있지만 reply_to_message_id가 null)');
        const { data: pendingMessages, error: pendingError } = await db.supabase
            .from('chat_messages')
            .select('id, kakao_log_id, reply_to_kakao_log_id, created_at')
            .not('reply_to_kakao_log_id', 'is', null)
            .is('reply_to_message_id', null)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (pendingError) {
            console.error('❌ 조회 오류:', pendingError.message);
            return;
        }
        
        console.log(`⚠️ 백필 대기 중인 메시지: ${pendingMessages.length}개`);
        if (pendingMessages.length > 0) {
            console.log('\n백필 대기 목록:');
            pendingMessages.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id}`);
                console.log(`    생성 시간: ${msg.created_at}`);
            });
        }
        
        // 4. 최근 1시간 내 메시지 중 답장 메시지 확인
        console.log('\n\n[4] 최근 1시간 내 답장 메시지');
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentReplies, error: recentRepliesError } = await db.supabase
            .from('chat_messages')
            .select('id, kakao_log_id, room_name, sender_name, message_text, reply_to_message_id, reply_to_kakao_log_id, created_at')
            .or(`reply_to_message_id.not.is.null,reply_to_kakao_log_id.not.is.null`)
            .gte('created_at', oneHourAgo)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (recentRepliesError) {
            console.error('❌ 조회 오류:', recentRepliesError.message);
            return;
        }
        
        console.log(`✅ 최근 1시간 내 답장 메시지: ${recentReplies.length}개`);
        if (recentReplies.length > 0) {
            console.log('\n답장 메시지 목록:');
            recentReplies.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    메시지: ${(msg.message_text || '').substring(0, 50)}...`);
                console.log(`    reply_to_message_id: ${msg.reply_to_message_id || 'NULL'}`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id || 'NULL'}`);
                console.log(`    생성 시간: ${msg.created_at}`);
            });
        } else {
            console.log('⚠️ 최근 1시간 내 답장 메시지가 없습니다.');
        }
        
        // 5. metadata에 reply 정보가 있는 메시지 확인
        console.log('\n\n[5] metadata에 reply 정보가 있는 메시지');
        const { data: metadataReplies, error: metadataError } = await db.supabase
            .from('chat_messages')
            .select('id, kakao_log_id, reply_to_message_id, reply_to_kakao_log_id, metadata')
            .not('metadata', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (metadataError) {
            console.error('❌ 조회 오류:', metadataError.message);
            return;
        }
        
        const withReplyMetadata = metadataReplies.filter(msg => {
            if (!msg.metadata || typeof msg.metadata !== 'object') return false;
            return !!(msg.metadata.reply_to_message_text || msg.metadata.reply_to_sender_name);
        });
        
        console.log(`✅ metadata에 reply 정보가 있는 메시지: ${withReplyMetadata.length}개`);
        if (withReplyMetadata.length > 0) {
            console.log('\nmetadata reply 정보 목록:');
            withReplyMetadata.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    reply_to_message_id: ${msg.reply_to_message_id || 'NULL'}`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id || 'NULL'}`);
                if (msg.metadata.reply_to_message_text) {
                    console.log(`    metadata.reply_to_message_text: ${msg.metadata.reply_to_message_text.substring(0, 50)}...`);
                }
                if (msg.metadata.reply_to_sender_name) {
                    console.log(`    metadata.reply_to_sender_name: ${msg.metadata.reply_to_sender_name}`);
                }
            });
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('확인 완료');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

checkReplyDetailed();

