/**
 * 네이버 카페 질문 서비스
 * DB 저장 및 글쓰기 로직 통합
 */

const db = require('../../db/database');
const { createQuestion } = require('./index');
const { generateShortCode } = require('../../services/shortlink');
const { shortenUrl } = require('../../services/bulyShortlink');
const { v4: uuidv4 } = require('uuid');

/**
 * 질문을 네이버 카페에 작성하고 DB에 저장
 * @param {Object} params
 * @param {string} params.senderId - 카카오톡 발신자 ID
 * @param {string} params.senderName - 카카오톡 발신자 닉네임
 * @param {string} params.roomId - 카카오톡 채팅방 ID
 * @param {string} params.title - 질문 제목
 * @param {string} params.content - 질문 내용
 * @param {string} params.accessToken - 네이버 OAuth 액세스 토큰
 * @param {number} params.clubid - 카페 ID
 * @param {number} params.menuid - 게시판 메뉴 ID
 * @param {number} [params.headid] - 말머리 ID (선택사항)
 * @param {Array<Buffer|string>} [params.images] - 이미지 파일 배열 (Buffer 또는 파일 경로 또는 URL)
 * @returns {Promise<Object>} { success, articleId, articleUrl, shortCode, error }
 */
async function submitQuestion({ 
    senderId, 
    senderName, 
    roomId, 
    title, 
    content,
    accessToken,
    clubid,
    menuid,
    headid,
    images
}) {
    try {
        // 짧은 코드 생성
        const shortCode = generateShortCode();
        
        // DB에 먼저 저장 (pending 상태)
        const postId = uuidv4();
        const insertQuery = `INSERT INTO naver_cafe_posts (id, kakao_sender_id, kakao_sender_name, kakao_room_id, title, content, clubid, menuid, short_code, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await db.prepare(insertQuery).run(
            postId,
            senderId,
            senderName || null,
            roomId || null,
            title,
            content,
            clubid,
            menuid,
            shortCode,
            'pending'  // status를 파라미터로 전달
        );
        
        console.log(`[네이버 카페] 질문 DB 저장 완료: id=${postId}, shortCode=${shortCode}`);
        
        // 네이버 카페에 글 작성 시도
        const writeResult = await createQuestion({
            title: title,
            content: content,
            accessToken: accessToken,
            clubid: clubid,
            menuid: menuid,
            headid: headid,
            images: images
        });
        
        if (writeResult.success) {
            // 글쓰기 성공 - DB 업데이트
            const updateQuery = `UPDATE naver_cafe_posts SET status = 'created', article_id = ?, article_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            
            await db.prepare(updateQuery).run(
                writeResult.articleId,
                writeResult.articleUrl,
                postId
            );
            
            console.log(`[네이버 카페] 글쓰기 성공 및 DB 업데이트: articleId=${writeResult.articleId}`);
            
            // 즉시 응답 반환 (원본 URL 사용)
            // 단축 URL은 백그라운드에서 생성 후 별도 전송
            return {
                success: true,
                articleId: writeResult.articleId,
                articleUrl: writeResult.articleUrl,
                shortUrl: writeResult.articleUrl, // 즉시 응답에는 원본 URL 사용
                shortCode: shortCode,
                postId: postId,
                roomId: roomId, // 단축 URL 전송용
                senderId: senderId // 단축 URL 전송용
            };
            
        } else {
            // 글쓰기 실패 - DB 상태 업데이트
            const status = writeResult.error === 'no_permission' ? 'no_permission' : 'failed';
            const updateQuery = `UPDATE naver_cafe_posts SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            
            await db.prepare(updateQuery).run(
                status,
                writeResult.message || writeResult.error,
                postId
            );
            
            console.log(`[네이버 카페] 글쓰기 실패: status=${status}, error=${writeResult.message}`);
            
            return {
                success: false,
                error: writeResult.error,
                message: writeResult.message,
                shortCode: shortCode,
                postId: postId
            };
        }
        
    } catch (error) {
        console.error('[네이버 카페] 질문 제출 중 오류:', error);
        return {
            success: false,
            error: 'database_error',
            message: error.message
        };
    }
}

/**
 * 권한 없을 때 질문을 DB에만 저장 (나중에 관리자가 확인 가능)
 * @param {Object} params
 * @param {string} params.senderId
 * @param {string} params.senderName
 * @param {string} params.roomId
 * @param {string} params.title
 * @param {string} params.content
 * @param {number} params.clubid
 * @param {number} params.menuid
 * @returns {Promise<Object>}
 */
async function saveQuestionWithoutPermission({
    senderId,
    senderName,
    roomId,
    title,
    content,
    clubid,
    menuid
}) {
    try {
        const shortCode = generateShortCode();
        const postId = uuidv4();
        
        const insertQuery = `INSERT INTO naver_cafe_posts (id, kakao_sender_id, kakao_sender_name, kakao_room_id, title, content, clubid, menuid, short_code, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await db.prepare(insertQuery).run(
            postId,
            senderId,
            senderName || null,
            roomId || null,
            title,
            content,
            clubid,
            menuid,
            shortCode,
            'no_permission'  // status를 파라미터로 전달
        );
        
        console.log(`[네이버 카페] 권한 없음 - 질문 DB 저장: id=${postId}, sender=${senderName}`);
        
        return {
            success: true,
            saved: true,
            postId: postId,
            shortCode: shortCode
        };
        
    } catch (error) {
        console.error('[네이버 카페] 질문 저장 중 오류:', error);
        return {
            success: false,
            error: 'database_error',
            message: error.message
        };
    }
}

module.exports = {
    submitQuestion,
    saveQuestionWithoutPermission
};

