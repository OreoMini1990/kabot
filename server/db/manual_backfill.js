/**
 * 수동 백필 실행 스크립트
 * 실행: node server/db/manual_backfill.js
 */

const { backfillAllPendingReplies } = require('./chatLogger');

async function manualBackfill() {
    try {
        console.log('='.repeat(60));
        console.log('수동 백필 작업 시작');
        console.log('='.repeat(60));
        console.log('');
        
        await backfillAllPendingReplies();
        
        console.log('');
        console.log('='.repeat(60));
        console.log('수동 백필 작업 완료');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error(error.stack);
    } finally {
        // 2초 후 종료 (비동기 작업 완료 대기)
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
}

manualBackfill();


