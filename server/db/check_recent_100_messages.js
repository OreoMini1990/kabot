/**
 * 최근 100개 메시지 저장 상태 확인 스크립트
 * 실행: node server/db/check_recent_100_messages.js
 */

const db = require('./database');

async function checkRecent100Messages() {
    try {
        console.log('='.repeat(60));
        console.log('최근 100개 메시지 저장 상태 확인');
        console.log('='.repeat(60));
        
        const { data: messages, error } = await db.supabase
            .from('chat_messages')
            .select('id, metadata, room_name, sender_name, message_text, created_at, reply_to_message_id')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) {
            console.error('❌ 조회 오류:', error.message);
            return;
        }
        
        console.log(`\n✅ 최근 100개 메시지: ${messages.length}개\n`);
        
        // kakao_log_id별로 그룹화
        const messagesByKakaoLogId = {};
        const messagesWithoutKakaoLogId = [];
        
        messages.forEach(msg => {
            const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id;
            if (kakaoLogId) {
                if (!messagesByKakaoLogId[kakaoLogId]) {
                    messagesByKakaoLogId[kakaoLogId] = [];
                }
                messagesByKakaoLogId[kakaoLogId].push(msg);
            } else {
                messagesWithoutKakaoLogId.push(msg);
            }
        });
        
        console.log(`📊 통계:`);
        console.log(`  - kakao_log_id가 있는 메시지: ${messages.length - messagesWithoutKakaoLogId.length}개`);
        console.log(`  - kakao_log_id가 없는 메시지: ${messagesWithoutKakaoLogId.length}개`);
        console.log(`  - 고유 kakao_log_id 개수: ${Object.keys(messagesByKakaoLogId).length}개\n`);
        
        // 시간대별 메시지 분포 확인
        const timeSlots = {};
        messages.forEach(msg => {
            const date = new Date(msg.created_at);
            const hour = date.getHours();
            const minute = Math.floor(date.getMinutes() / 10) * 10;
            const timeSlot = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            
            if (!timeSlots[timeSlot]) {
                timeSlots[timeSlot] = 0;
            }
            timeSlots[timeSlot]++;
        });
        
        console.log(`⏰ 시간대별 메시지 분포 (최근 10개 시간대):`);
        const sortedTimeSlots = Object.entries(timeSlots)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 10);
        sortedTimeSlots.forEach(([time, count]) => {
            console.log(`  ${time}: ${count}개`);
        });
        
        // 최근 20개 메시지 상세 정보
        console.log(`\n📋 최근 20개 메시지 상세:`);
        messages.slice(0, 20).forEach((msg, idx) => {
            const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id || 'null';
            const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id || 'null';
            const createdTime = new Date(msg.created_at).toISOString().replace('T', ' ').substring(0, 19);
            console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${kakaoLogId}`);
            console.log(`    메시지: ${(msg.message_text || '').substring(0, 50)}...`);
            console.log(`    발신자: ${msg.sender_name || 'NULL'}`);
            console.log(`    방: ${msg.room_name || 'NULL'}`);
            console.log(`    reply_to_message_id: ${msg.reply_to_message_id || 'null'}`);
            console.log(`    reply_to_kakao_log_id: ${replyToKakaoLogId}`);
            console.log(`    생성 시간: ${createdTime}`);
        });
        
        // 저장 간격 분석
        if (messages.length >= 2) {
            console.log(`\n⏱️ 저장 간격 분석:`);
            const intervals = [];
            for (let i = 0; i < Math.min(10, messages.length - 1); i++) {
                const time1 = new Date(messages[i].created_at).getTime();
                const time2 = new Date(messages[i + 1].created_at).getTime();
                const interval = (time1 - time2) / 1000; // 초 단위
                intervals.push(interval);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const maxInterval = Math.max(...intervals);
            const minInterval = Math.min(...intervals);
            console.log(`  평균 간격: ${avgInterval.toFixed(2)}초`);
            console.log(`  최대 간격: ${maxInterval.toFixed(2)}초`);
            console.log(`  최소 간격: ${minInterval.toFixed(2)}초`);
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

checkRecent100Messages();

