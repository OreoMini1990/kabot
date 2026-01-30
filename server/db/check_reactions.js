/**
 * 반응 저장 상태 확인 스크립트
 * 실행: node server/db/check_reactions.js
 */

const db = require('./database');

async function checkReactions() {
    try {
        console.log('='.repeat(60));
        console.log('반응 저장 상태 확인');
        console.log('='.repeat(60));
        
        // 1. chat_reactions 테이블 조회
        console.log('\n[1] chat_reactions 테이블 조회');
        const { data: reactions, error: reactionsError } = await db.supabase
            .from('chat_reactions')
            .select('id, message_id, reactor_name, reactor_id, reaction_type, is_admin_reaction, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (reactionsError) {
            console.error('❌ 조회 오류:', reactionsError.message);
            return;
        }
        
        console.log(`✅ 반응 ${reactions.length}개 발견`);
        if (reactions.length > 0) {
            console.log('\n반응 목록:');
            reactions.forEach((reaction, idx) => {
                console.log(`\n[${idx + 1}] ID: ${reaction.id}, message_id: ${reaction.message_id}, reactor_name: ${reaction.reactor_name}`);
                console.log(`    reactor_id: ${reaction.reactor_id || 'NULL'}`);
                console.log(`    reaction_type: ${reaction.reaction_type}`);
                console.log(`    is_admin_reaction: ${reaction.is_admin_reaction}`);
                console.log(`    생성 시간: ${reaction.created_at}`);
            });
        } else {
            console.log('⚠️ 반응이 없습니다.');
        }
        
        // 2. chat_reaction_counts 테이블 조회
        console.log('\n\n[2] chat_reaction_counts 테이블 조회');
        const { data: reactionCounts, error: countsError } = await db.supabase
            .from('chat_reaction_counts')
            .select('id, message_id, kakao_log_id, chat_id, room_name, reaction_count, last_observed_at, updated_at')
            .order('updated_at', { ascending: false })
            .limit(20);
        
        if (countsError) {
            console.error('❌ 조회 오류:', countsError.message);
            return;
        }
        
        console.log(`✅ 반응 카운트 ${reactionCounts.length}개 발견`);
        if (reactionCounts.length > 0) {
            console.log('\n반응 카운트 목록:');
            reactionCounts.forEach((count, idx) => {
                console.log(`\n[${idx + 1}] ID: ${count.id}, message_id: ${count.message_id}, kakao_log_id: ${count.kakao_log_id}`);
                console.log(`    reaction_count: ${count.reaction_count}`);
                console.log(`    room_name: ${count.room_name || 'NULL'}`);
                console.log(`    last_observed_at: ${count.last_observed_at}`);
                console.log(`    업데이트 시간: ${count.updated_at}`);
            });
        } else {
            console.log('⚠️ 반응 카운트가 없습니다.');
        }
        
        // 3. 통계
        console.log('\n\n[3] 통계');
        const { data: allReactions, error: allReactionsError } = await db.supabase
            .from('chat_reactions')
            .select('id', { count: 'exact' });
        
        const { data: allCounts, error: allCountsError } = await db.supabase
            .from('chat_reaction_counts')
            .select('id', { count: 'exact' });
        
        if (allReactionsError || allCountsError) {
            console.error('❌ 통계 조회 오류');
            return;
        }
        
        console.log(`전체 반응: ${allReactions.length}개`);
        console.log(`전체 반응 카운트: ${allCounts.length}개`);
        
        // 4. 최근 메시지 중 반응이 있는 메시지 조회
        console.log('\n\n[4] 최근 메시지 중 반응이 있는 메시지 조회');
        const { data: messagesWithReactions, error: messagesError } = await db.supabase
            .from('chat_messages')
            .select('id, room_name, sender_name, message_text, kakao_log_id, metadata, created_at')
            .not('metadata', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (messagesError) {
            console.error('❌ 조회 오류:', messagesError.message);
            return;
        }
        
        const messagesWithReactionData = messagesWithReactions.filter(msg => {
            if (!msg.metadata) return false;
            return msg.metadata.reaction_count > 0 || 
                   (msg.metadata.reactions && Array.isArray(msg.metadata.reactions) && msg.metadata.reactions.length > 0);
        });
        
        console.log(`✅ 반응이 있는 메시지: ${messagesWithReactionData.length}개`);
        if (messagesWithReactionData.length > 0) {
            messagesWithReactionData.forEach((msg, idx) => {
                console.log(`\n[${idx + 1}] ID: ${msg.id}, kakao_log_id: ${msg.kakao_log_id}`);
                console.log(`    메시지: ${msg.message_text.substring(0, 50)}...`);
                console.log(`    metadata.reaction_count: ${msg.metadata.reaction_count || 0}`);
                if (msg.metadata.reactions) {
                    console.log(`    metadata.reactions: ${JSON.stringify(msg.metadata.reactions)}`);
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

checkReactions();

