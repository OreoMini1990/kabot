/**
 * !hi 명령어 처리 모듈
 */

/**
 * !hi 명령어 처리
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>>} 응답 메시지 배열
 */
async function handleHiCommand(room, msg, sender, json) {
    const replies = [];
    
    replies.push("안녕하세요! 👋\n\n사용 가능한 명령어:\n- !뉴스 [검색어] - 뉴스 검색\n- !질문 - 질문 작성\n- !통계 - 채팅 통계\n- !이미지 - 이미지 업로드");
    console.log(`[!hi] ✅ 인사 메시지 전송`);
    
    return replies;
}

module.exports = {
    handleHiCommand
};






