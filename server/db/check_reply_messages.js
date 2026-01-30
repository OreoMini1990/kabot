/**
 * 답장 메시지 저장 상태 확인 스크립트
 * 실행: node server/db/check_reply_messages.js
 */

const db = require('./database');

async function checkReplyMessages() {
    try {
        console.log('='.repeat(60));
        console.log('답장 메시지 저장 상태 확인');
        console.log('='.repeat(60));
        
        // 최근 20개 메시지 조회
        const { data: messages, error } = await db.supabase
            .from('chat_messages')
            .select('id, metadata, room_name, sender_name, message_text, reply_to_message_id, created_at')
            .eq('room_name', '의운모')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('❌ 조회 오류:', error.message);
            return;
        }
        
        console.log(`\n✅ 최근 20개 메시지: ${messages.length}개\n`);
        
        // 답장 메시지와 일반 메시지 분류
        const replyMessages = [];
        const normalMessages = [];
        
        messages.forEach(msg => {
            const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id;
            const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id;
            const replyToMessageId = msg.reply_to_message_id;
            
            if (replyToKakaoLogId || replyToMessageId) {
                replyMessages.push({
                    id: msg.id,
                    kakao_log_id: kakaoLogId,
                    reply_to_message_id: replyToMessageId,
                    reply_to_kakao_log_id: replyToKakaoLogId,
                    message: msg.message_text?.substring(0, 30),
                    created: msg.created_at
                });
            } else {
                normalMessages.push({
                    id: msg.id,
                    kakao_log_id: kakaoLogId,
                    message: msg.message_text?.substring(0, 30),
                    created: msg.created_at
                });
            }
        });
        
        console.log(`📊 통계:`);
        console.log(`  - 답장 메시지: ${replyMessages.length}개`);
        console.log(`  - 일반 메시지: ${normalMessages.length}개\n`);
        
        // 답장 메시지 상세 정보
        if (replyMessages.length > 0) {
            console.log(`📋 답장 메시지 상세:`);
            replyMessages.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    메시지: ${msg.message}...`);
                console.log(`    reply_to_message_id: ${msg.reply_to_message_id || 'null'} (DB FK)`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id || 'null'} (metadata)`);
                console.log(`    생성 시간: ${msg.created}`);
                
                // 원문 메시지 찾기
                if (msg.reply_to_kakao_log_id) {
                    const targetKakaoLogId = String(msg.reply_to_kakao_log_id);
                    console.log(`    🔍 원문 메시지 검색: reply_to_kakao_log_id=${targetKakaoLogId}`);
                    
                    // 방법 1: metadata.kakao_log_id로 검색
                    const targetMessage1 = messages.find(m => {
                        const mKakaoLogId = m.metadata?.kakao_log_id || m.metadata?._id;
                        return mKakaoLogId && String(mKakaoLogId) === targetKakaoLogId;
                    });
                    
                    // 방법 2: 모든 메시지의 kakao_log_id 출력 (디버그)
                    console.log(`    📋 최근 메시지들의 kakao_log_id:`);
                    messages.slice(0, 10).forEach(m => {
                        const mKakaoLogId = m.metadata?.kakao_log_id || m.metadata?._id;
                        console.log(`      - ID=${m.id}, kakao_log_id=${mKakaoLogId || 'null'}`);
                    });
                    
                    if (targetMessage1) {
                        console.log(`    ✅ 원문 메시지 찾음 (방법1): ID=${targetMessage1.id}, kakao_log_id=${targetMessage1.metadata?.kakao_log_id || targetMessage1.metadata?._id}`);
                        console.log(`    ⚠️ 하지만 reply_to_message_id는 null (백필 실패)`);
                    } else {
                        console.log(`    ❌ 원문 메시지 미발견: kakao_log_id=${targetKakaoLogId}`);
                        console.log(`    ⚠️ 문제: attachment에서 추출한 src_logId(${targetKakaoLogId})가 실제 DB의 kakao_log_id와 일치하지 않음`);
                    }
                }
            });
        }
        
        // 일반 메시지 중 답장 대상이 될 수 있는 메시지
        console.log(`\n📋 일반 메시지 (답장 대상 후보):`);
        normalMessages.slice(0, 5).forEach((msg, idx) => {
            console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
            console.log(`    메시지: ${msg.message}...`);
            console.log(`    생성 시간: ${msg.created}`);
        });
        
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

checkReplyMessages();
