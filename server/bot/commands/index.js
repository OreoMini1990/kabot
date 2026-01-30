/**
 * 명령어 라우터 모듈
 * 모든 명령어를 통합 관리
 */

const { handleQuestionCommand, handleQuestionPendingState } = require('./cafe/questionCommand');
const { handleNewsCommand } = require('./news/newsCommand');
const { handleStatsCommand } = require('./user/statsCommand');
// const { handleImageCommand } = require('./user/imageCommand'); // 비활성화
const { handleHiCommand } = require('./user/hiCommand');

/**
 * 명령어 처리 라우터
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>|null>} 응답 메시지 배열 또는 null (처리되지 않은 경우)
 */
async function handleCommand(room, msg, sender, json) {
    const msgTrimmed = msg.trim();
    const msgLower = msgTrimmed.toLowerCase();
    
    // ========== !질문 명령어 처리 (최우선) ==========
    if (msgLower.startsWith("!질문")) {
        return await handleQuestionCommand(room, msg, sender, json);
    }
    
    // ========== !뉴스 명령어 처리 ==========
    if (msgLower.startsWith("!뉴스")) {
        return await handleNewsCommand(room, msg, sender, json);
    }
    
    // ========== !통계 명령어 처리 (관리자 전용) ==========
    if (msgLower.startsWith("!통계")) {
        return await handleStatsCommand(room, msg, sender, json);
    }
    
    // ========== /통계 명령어 처리 (관리자 전용) ==========
    if (msgLower.startsWith("/통계")) {
        return await handleStatsCommand(room, msg, sender, json);
    }
    
    // ========== /오늘 채팅, /어제 채팅, /이번주 채팅 명령어 처리 (관리자 전용) ==========
    if (msgLower.startsWith("/오늘 채팅") || msgLower.startsWith("/어제 채팅") || msgLower.startsWith("/이번주 채팅")) {
        return await handleStatsCommand(room, msg, sender, json);
    }
    
    // ========== !이미지 명령어 처리 (비활성화) ==========
    // if (msgLower.startsWith("!이미지")) {
    //     return await handleImageCommand(room, msg, sender, json);
    // }
    
    // ========== !hi 명령어 처리 ==========
    if (msgLower.startsWith("!hi")) {
        return await handleHiCommand(room, msg, sender, json);
    }
    
    return null; // 처리되지 않은 명령어
}

/**
 * 질문 대기 상태 처리 (명령어가 아닌 일반 메시지)
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>|null>} 응답 메시지 배열 또는 null (처리되지 않은 경우)
 */
async function handleQuestionPendingStateWrapper(room, msg, sender, json) {
    return await handleQuestionPendingState(room, msg, sender, json);
}

module.exports = {
    handleCommand,
    handleQuestionPendingState: handleQuestionPendingStateWrapper
};

