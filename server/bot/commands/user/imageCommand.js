/**
 * !이미지 명령어 처리 모듈
 */

/**
 * !이미지 명령어 처리
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>>} 응답 메시지 배열
 */
async function handleImageCommand(room, msg, sender, json) {
    const replies = [];
    
    replies.push("📷 이미지 업로드 방법:\n\n1. 질문 작성 중 이미지 첨부:\n   !질문 제목,내용\n   (그 다음 이미지 전송)\n\n2. 직접 이미지 전송:\n   이미지를 카카오톡으로 전송하면 자동으로 업로드됩니다.");
    console.log(`[!이미지] ✅ 안내 메시지 전송`);
    
    return replies;
}

module.exports = {
    handleImageCommand
};






