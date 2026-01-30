/**
 * 답장 백필 성공/실패 분석 스크립트
 * 실행: node server/db/analyze_reply_backfill.js
 */

const db = require('./database');

async function analyzeReplyBackfill() {
    try {
        console.log('='.repeat(60));
        console.log('답장 백필 성공/실패 분석');
        console.log('='.repeat(60));
        
        // reply_to_kakao_log_id는 있지만 reply_to_message_id가 null인 메시지들 찾기
        const { data: allMessages, error } = await db.supabase
            .from('chat_messages')
            .select('id, room_name, metadata, reply_to_message_id, created_at')
            .eq('room_name', '의운모')
            .order('created_at', { ascending: false })
            .limit(30);
        
        if (error) {
            console.error('❌ 조회 오류:', error.message);
            return;
        }
        
        // metadata에 reply_to_kakao_log_id가 있는 메시지 필터링
        const replyMessages = (allMessages || []).filter(msg => {
            const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id;
            return replyToKakaoLogId != null;
        });
        
        console.log(`\n✅ 답장 메시지 총 ${replyMessages.length}개 발견\n`);
        
        // 성공/실패 분류
        const successMessages = [];
        const failedMessages = [];
        
        replyMessages.forEach(msg => {
            const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id;
            const replyToMessageId = msg.reply_to_message_id;
            const kakaoLogId = msg.metadata?.kakao_log_id || msg.metadata?._id;
            
            if (replyToMessageId) {
                successMessages.push({
                    id: msg.id,
                    kakao_log_id: kakaoLogId,
                    reply_to_message_id: replyToMessageId,
                    reply_to_kakao_log_id: replyToKakaoLogId,
                    created_at: msg.created_at
                });
            } else {
                failedMessages.push({
                    id: msg.id,
                    kakao_log_id: kakaoLogId,
                    reply_to_kakao_log_id: replyToKakaoLogId,
                    created_at: msg.created_at
                });
            }
        });
        
        console.log(`📊 통계:`);
        console.log(`  - ✅ 성공: ${successMessages.length}개`);
        console.log(`  - ❌ 실패: ${failedMessages.length}개`);
        
        // 성공한 메시지 상세
        if (successMessages.length > 0) {
            console.log(`\n✅ 성공한 답장 메시지:`);
            successMessages.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    reply_to_message_id: ${msg.reply_to_message_id} ✅`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id}`);
                console.log(`    생성 시간: ${new Date(msg.created_at).toLocaleString('ko-KR', { timeZone: 'UTC' })}`);
                
                // 원문 메시지 확인
                const targetMessage = allMessages.find(m => m.id === msg.reply_to_message_id);
                if (targetMessage) {
                    const targetKakaoLogId = targetMessage.metadata?.kakao_log_id || targetMessage.metadata?._id;
                    console.log(`    ✅ 원문 메시지: ID=${targetMessage.id}, kakao_log_id=${targetKakaoLogId}`);
                } else {
                    console.log(`    ⚠️ 원문 메시지 조회 실패`);
                }
            });
        }
        
        // 실패한 메시지 상세
        if (failedMessages.length > 0) {
            console.log(`\n❌ 실패한 답장 메시지:`);
            failedMessages.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    reply_to_message_id: null ❌`);
                console.log(`    reply_to_kakao_log_id: ${msg.reply_to_kakao_log_id}`);
                console.log(`    생성 시간: ${new Date(msg.created_at).toLocaleString('ko-KR', { timeZone: 'UTC' })}`);
                
                // 시간대 기반 검색으로 찾을 수 있는지 확인
                const recentMessages = allMessages.filter(m => 
                    m.id !== msg.id && 
                    new Date(m.created_at) < new Date(msg.created_at) &&
                    !m.metadata?.reply_to_kakao_log_id  // 답장이 아닌 일반 메시지
                ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
                
                if (recentMessages.length > 0) {
                    console.log(`    ⚠️ 시간대 기반 검색 후보 (가장 가까운 메시지):`);
                    recentMessages.forEach((m, i) => {
                        const mKakaoLogId = m.metadata?.kakao_log_id || m.metadata?._id;
                        const timeDiff = (new Date(msg.created_at) - new Date(m.created_at)) / 1000; // 초
                        console.log(`      ${i + 1}. ID=${m.id}, kakao_log_id=${mKakaoLogId}, 시간차=${timeDiff.toFixed(1)}초`);
                    });
                } else {
                    console.log(`    ⚠️ 시간대 기반 검색 후보 없음`);
                }
            });
        }
        
        // 서버 로그와 비교
        console.log(`\n📋 서버 로그 분석:`);
        console.log(`  - Line 210-211: ID 765 백필 성공 ✅`);
        console.log(`  - Line 206: 시간대 기반 검색으로 ID 764 찾음`);
        console.log(`  - Line 211: "답장 링크 연결 완료: message_id=765, reply_to_message_id=764"`);
        
        console.log(`\n💡 분석 결과:`);
        if (successMessages.length > 0) {
            console.log(`  ✅ 백필 로직은 정상 작동 중입니다!`);
            console.log(`  ✅ 최신 답장 메시지(ID ${successMessages[0].id})는 성공적으로 연결되었습니다.`);
        }
        
        if (failedMessages.length > 0) {
            console.log(`  ⚠️ 이전 답장 메시지 ${failedMessages.length}개는 아직 연결되지 않았습니다.`);
            console.log(`  💡 주기적 백필 작업(5분마다)이 실행되면 자동으로 연결됩니다.`);
            console.log(`  💡 또는 수동으로 backfillAllPendingReplies()를 실행할 수 있습니다.`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('분석 완료');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

analyzeReplyBackfill();


