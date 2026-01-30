/**
 * 최근 메시지 저장 상태 확인 스크립트
 * 실행: node server/db/check_recent_messages.js
 */

const db = require('./database');

async function checkRecentMessages() {
    try {
        console.log('='.repeat(60));
        console.log('최근 메시지 저장 상태 확인');
        console.log('='.repeat(60));
        
        // 최근 1시간 내 메시지 조회
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        console.log(`\n[1] 최근 1시간 내 메시지 (${oneHourAgo} 이후)`);
        
        const { data: recentMessages, error: recentError } = await db.supabase
            .from('chat_messages')
            .select('id, metadata, room_name, sender_name, message_text, created_at')
            .gte('created_at', oneHourAgo)
            .order('created_at', { ascending: false });
        
        if (recentError) {
            console.error('❌ 조회 오류:', recentError.message);
            return;
        }
        
        console.log(`✅ 최근 1시간 내 메시지: ${recentMessages.length}개`);
        if (recentMessages.length > 0) {
            console.log('\n최근 메시지 목록:');
            recentMessages.forEach((msg, idx) => {
                const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id || 'null';
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${kakaoLogId}`);
                console.log(`    메시지: ${(msg.message_text || '').substring(0, 50)}...`);
                console.log(`    발신자: ${msg.sender_name || 'NULL'}`);
                console.log(`    생성 시간: ${msg.created_at}`);
            });
        } else {
            console.log('⚠️ 최근 1시간 내 메시지가 없습니다.');
        }
        
        // 최근 10분 내 메시지 조회
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        console.log(`\n\n[2] 최근 10분 내 메시지 (${tenMinutesAgo} 이후)`);
        
        const { data: veryRecentMessages, error: veryRecentError } = await db.supabase
            .from('chat_messages')
            .select('id, metadata, room_name, sender_name, message_text, created_at')
            .gte('created_at', tenMinutesAgo)
            .order('created_at', { ascending: false });
        
        if (veryRecentError) {
            console.error('❌ 조회 오류:', veryRecentError.message);
            return;
        }
        
        console.log(`✅ 최근 10분 내 메시지: ${veryRecentMessages.length}개`);
        if (veryRecentMessages.length > 0) {
            console.log('\n최근 메시지 목록:');
            veryRecentMessages.forEach((msg, idx) => {
                const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id || 'null';
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${kakaoLogId}`);
                console.log(`    메시지: ${(msg.message_text || '').substring(0, 50)}...`);
                console.log(`    발신자: ${msg.sender_name || 'NULL'}`);
                console.log(`    생성 시간: ${msg.created_at}`);
            });
        } else {
            console.log('⚠️ 최근 10분 내 메시지가 없습니다.');
        }
        
        // 전체 메시지 개수 확인
        console.log(`\n\n[3] 전체 메시지 개수`);
        const { count, error: countError } = await db.supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true });
        
        if (countError) {
            console.error('❌ 개수 조회 오류:', countError.message);
            return;
        }
        
        console.log(`✅ 전체 메시지 개수: ${count}개`);
        
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

checkRecentMessages();

