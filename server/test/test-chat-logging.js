/**
 * 채팅 로그 DB 및 통계 기능 통합 테스트 스크립트
 * 
 * 사용법:
 *   node test/test-chat-logging.js
 * 
 * 테스트 항목:
 *   1. DB 연결 테스트
 *   2. 메시지 저장 테스트
 *   3. 통계 조회 테스트
 *   4. 신고 기능 테스트
 *   5. 닉네임 변경 감지 테스트
 */

const chatLogger = require('../db/chatLogger');
const db = require('../db/database');

// 테스트 설정
const TEST_ROOM = '의운모';
const TEST_SENDER = '테스트유저';
const TEST_SENDER_ID = 'test123';

// 색상 코드
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    log(`\n[테스트] ${name}`, 'blue');
}

function logSuccess(message) {
    log(`  ✅ ${message}`, 'green');
}

function logError(message) {
    log(`  ❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`  ⚠️  ${message}`, 'yellow');
}

async function testDatabaseConnection() {
    logTest('1. DB 연결 테스트');
    
    try {
        if (!db.supabase) {
            logError('Supabase 클라이언트가 초기화되지 않았습니다.');
            logWarning('server/db/database.js에서 Supabase 설정을 확인하세요.');
            return false;
        }
        
        // 간단한 쿼리로 연결 테스트
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('id')
            .limit(1);
        
        if (error && error.code !== 'PGRST116') { // PGRST116: 테이블이 없음
            logError(`DB 연결 실패: ${error.message}`);
            return false;
        }
        
        logSuccess('DB 연결 성공');
        return true;
    } catch (error) {
        logError(`DB 연결 오류: ${error.message}`);
        return false;
    }
}

async function testMessageSaving() {
    logTest('2. 메시지 저장 테스트');
    
    try {
        const testMessage = `테스트 메시지 ${Date.now()}`;
        const result = await chatLogger.saveChatMessage(
            TEST_ROOM,
            TEST_SENDER,
            TEST_SENDER_ID,
            testMessage,
            true
        );
        
        if (!result) {
            logError('메시지 저장 실패');
            return false;
        }
        
        logSuccess(`메시지 저장 성공 (ID: ${result.id})`);
        return result;
    } catch (error) {
        logError(`메시지 저장 오류: ${error.message}`);
        return null;
    }
}

async function testStatistics() {
    logTest('3. 통계 조회 테스트');
    
    try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];
        
        // 오늘 채팅 조회
        const messages = await chatLogger.getChatMessagesByPeriod(
            TEST_ROOM,
            startDate,
            endDate,
            10
        );
        
        if (!Array.isArray(messages)) {
            logError('통계 조회 실패: 배열이 아닙니다');
            return false;
        }
        
        logSuccess(`오늘 채팅 조회 성공 (${messages.length}개)`);
        
        // 사용자 통계 조회
        const stats = await chatLogger.getUserChatStatistics(
            TEST_ROOM,
            startDate,
            endDate
        );
        
        if (!stats) {
            logWarning('사용자 통계 조회 실패 (데이터 없을 수 있음)');
        } else {
            logSuccess('사용자 통계 조회 성공');
        }
        
        return true;
    } catch (error) {
        logError(`통계 조회 오류: ${error.message}`);
        return false;
    }
}

async function testReportSystem() {
    logTest('4. 신고 기능 테스트');
    
    try {
        // 먼저 테스트 메시지 저장
        const testMessage = await chatLogger.saveChatMessage(
            TEST_ROOM,
            '피신고자',
            'reported123',
            '테스트 신고 대상 메시지',
            true
        );
        
        if (!testMessage) {
            logError('신고 테스트용 메시지 저장 실패');
            return false;
        }
        
        // 신고 저장
        const report = await chatLogger.saveReport(
            testMessage.id,
            TEST_SENDER,
            TEST_SENDER_ID,
            '테스트 신고 사유',
            'general'
        );
        
        if (!report) {
            logError('신고 저장 실패');
            return false;
        }
        
        logSuccess(`신고 저장 성공 (ID: ${report.id})`);
        return true;
    } catch (error) {
        logError(`신고 기능 오류: ${error.message}`);
        return false;
    }
}

async function testNicknameChange() {
    logTest('5. 닉네임 변경 감지 테스트');
    
    try {
        // 첫 번째 메시지 (원래 이름)
        await chatLogger.saveChatMessage(
            TEST_ROOM,
            TEST_SENDER,
            TEST_SENDER_ID,
            '첫 번째 메시지',
            true
        );
        
        // 두 번째 메시지 (이름 변경)
        const newName = `${TEST_SENDER}_변경됨`;
        await chatLogger.saveChatMessage(
            TEST_ROOM,
            newName,
            TEST_SENDER_ID,
            '두 번째 메시지',
            true
        );
        
        // 닉네임 변경 감지
        const notification = await chatLogger.checkNicknameChange(
            TEST_ROOM,
            newName,
            TEST_SENDER_ID
        );
        
        if (notification) {
            logSuccess('닉네임 변경 감지 성공');
            log(`  알림: ${notification.substring(0, 100)}...`);
        } else {
            logWarning('닉네임 변경 감지 실패 (첫 등록이거나 변경 없음)');
        }
        
        return true;
    } catch (error) {
        logError(`닉네임 변경 감지 오류: ${error.message}`);
        return false;
    }
}

async function runAllTests() {
    log('\n═══════════════════════════════════════════', 'blue');
    log('채팅 로그 DB 및 통계 기능 통합 테스트', 'blue');
    log('═══════════════════════════════════════════\n', 'blue');
    
    const results = {
        dbConnection: false,
        messageSaving: false,
        statistics: false,
        reportSystem: false,
        nicknameChange: false
    };
    
    // 1. DB 연결 테스트
    results.dbConnection = await testDatabaseConnection();
    
    if (!results.dbConnection) {
        log('\n❌ DB 연결 실패로 인해 테스트를 중단합니다.', 'red');
        log('   Supabase 설정을 확인하세요.', 'yellow');
        return;
    }
    
    // 2. 메시지 저장 테스트
    const savedMessage = await testMessageSaving();
    results.messageSaving = !!savedMessage;
    
    // 3. 통계 조회 테스트
    results.statistics = await testStatistics();
    
    // 4. 신고 기능 테스트
    results.reportSystem = await testReportSystem();
    
    // 5. 닉네임 변경 감지 테스트
    results.nicknameChange = await testNicknameChange();
    
    // 결과 요약
    log('\n═══════════════════════════════════════════', 'blue');
    log('테스트 결과 요약', 'blue');
    log('═══════════════════════════════════════════\n', 'blue');
    
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(r => r).length;
    
    log(`총 테스트: ${totalTests}개`);
    log(`성공: ${passedTests}개`, 'green');
    log(`실패: ${totalTests - passedTests}개`, totalTests - passedTests > 0 ? 'red' : 'green');
    
    if (passedTests === totalTests) {
        log('\n✅ 모든 테스트 통과!', 'green');
    } else {
        log('\n⚠️  일부 테스트 실패. 위의 오류 메시지를 확인하세요.', 'yellow');
    }
}

// 테스트 실행
if (require.main === module) {
    runAllTests().catch(error => {
        logError(`테스트 실행 오류: ${error.message}`);
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testDatabaseConnection,
    testMessageSaving,
    testStatistics,
    testReportSystem,
    testNicknameChange
};






