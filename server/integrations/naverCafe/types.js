/**
 * 네이버 카페 API 타입 정의
 */

/**
 * 네이버 카페 글쓰기 요청 파라미터
 * @typedef {Object} CafeWriteParams
 * @property {string} subject - 글 제목
 * @property {string} content - 글 내용
 * @property {number} clubid - 카페 ID
 * @property {number} menuid - 게시판 메뉴 ID
 */

/**
 * 네이버 카페 글쓰기 응답
 * @typedef {Object} CafeWriteResponse
 * @property {Object} result
 * @property {number} result.articleId - 작성된 글의 ID
 * @property {string} result.articleUrl - 작성된 글의 URL
 */

/**
 * DB에 저장할 질문 정보
 * @typedef {Object} QuestionPost
 * @property {string} kakao_sender_id - 카카오톡 발신자 ID
 * @property {string} kakao_sender_name - 카카오톡 발신자 닉네임
 * @property {string} kakao_room_id - 카카오톡 채팅방 ID
 * @property {string} title - 질문 제목
 * @property {string} content - 질문 내용
 * @property {number} clubid - 네이버 카페 ID
 * @property {number} menuid - 게시판 메뉴 ID
 * @property {string} status - 상태 (pending, created, failed, no_permission)
 * @property {string} [error_message] - 오류 메시지
 */

module.exports = {};

