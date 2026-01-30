/**
 * !질문 명령어 처리 모듈
 */

const { extractSenderId } = require('../../utils/botUtils');
const {
    setPendingQuestion,
    getPendingQuestion,
    getAndClearPendingQuestion,
    getAndClearPendingAttachment,
    getAndClearPendingPreview,
    IMAGE_REQUEST_CACHE
} = require('../../cache/cacheManager');
const { createCacheKey } = require('../../../db/utils/roomKeyNormalizer');
const { processQuestionSubmission } = require('./questionService');
const { isTestRoom } = require('../../../utils/roomConfig');
const { runWithDbScope } = require('../../../db/database');
const fs = require('fs');

/** !질문 기능 임시 비활성화. true로 설정 시 모든 방에서 질문 등록/대기 플로우 동작 */
const QUESTION_FEATURE_ENABLED = process.env.QUESTION_FEATURE_ENABLED === 'true';

/** 비활성화 시 !질문 입력 시 반환할 메시지 */
const QUESTION_PREPARING_MSG = '준비 중입니다. 개발이 완료되면 공지하겠습니다.';

/** 해당 방에서 !질문 기능 사용 가능 여부 (테스트 방에서는 항상 사용 가능) */
function isQuestionFeatureEnabledInRoom(room) {
  return QUESTION_FEATURE_ENABLED || isTestRoom(room || '');
}

/**
 * !질문 명령어 처리
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>>} 응답 메시지 배열
 */
async function handleQuestionCommand(room, msg, sender, json) {
    const replies = [];

    // ----- !질문 기능 비활성화 시: 테스트 방이 아니면 준비중 메시지만 반환 -----
    const featureEnabled = isQuestionFeatureEnabledInRoom(room);
    if (!featureEnabled) {
        replies.push(QUESTION_PREPARING_MSG);
        console.log('[!질문] 기능 비활성화 상태(해당 방) - 준비중 메시지 반환, room="' + (room || '') + '"');
        return replies;
    }
    // ----- 여기부터 기존 !질문 로직 -----

    const msgTrimmed = (msg || '').trim();
    const msgLower = msgTrimmed.toLowerCase();

    // senderId 추출
    let questionSenderId = extractSenderId(json, sender);
    if (!questionSenderId && sender) {
        const senderStr = String(sender);
        const idMatch = senderStr.match(/(\d+)$/);
        if (idMatch) {
            questionSenderId = idMatch[1];
        }
    }
    
    // !질문 제목,내용 형식인지 확인 (전각 !／공백 변형 허용)
    const questionMatch = msgTrimmed.match(/^[!！]\s*질문\s+(.+)$/);
    if (questionMatch) {
        const questionText = questionMatch[1].trim();
        // 쉼표로 제목과 내용 구분 시도
        const parts = questionText.split(',').map(p => p.trim()).filter(p => p);
        if (parts.length >= 2) {
            // 제목,내용 형식 - 질문 대기 상태 저장 후 이미지 여부 물어봄
            const title = parts[0];
            const content = parts.slice(1).join(',');
            
            if (!questionSenderId) {
                replies.push("❌ 사용자 ID를 확인할 수 없습니다. 다시 시도해주세요.");
                return replies;
            }
            
            // 질문 대기 상태 저장 (이미지 단계)
            setPendingQuestion(room, questionSenderId, {
                step: 'image',
                room: room,
                sender: sender,
                senderId: questionSenderId,
                title: title,
                content: content,
                timestamp: Date.now()
            });
            
            console.log(`[!질문] 질문 대기 상태 저장: title="${title}", content="${content.substring(0, 30)}...", step=image`);
            
            // 이미지 첨부 여부 물어봄
            replies.push(`📝 질문이 등록되었습니다.\n\n` +
                `혹시 같이 첨부할 이미지가 있나요?\n\n` +
                `• 이미지를 첨부하려면 이미지를 보내주세요\n` +
                `• 이미지 없이 진행하려면 '없음' 또는 다른 메시지를 보내주세요\n\n` +
                `⏱️ 5분 이내에 이미지를 보내지 않으면 이미지 없이 등록됩니다.`);
            return replies;
        } else {
            // 제목만 있거나 형식이 잘못됨
            replies.push("❌ 질문 형식이 올바르지 않습니다.\n\n사용법:\n!질문 제목,내용\n\n또는\n!질문\n(그 다음 질문 제목과 내용을 입력하세요)");
            return replies;
        }
    } else {
        // !질문만 입력한 경우 - 양식 안내 메시지
        replies.push("📝 질문 작성 방법\n\n" +
            "다음 형식으로 한 번에 입력해주세요:\n" +
            "!질문 제목,내용\n\n" +
            "예시:\n" +
            "!질문 오류가 발생합니다,프로그램이 실행되지 않아요\n\n" +
            "💡 이미지를 첨부하려면 질문 등록 후 이미지를 보내주세요.");
        console.log(`[!질문] 양식 안내 메시지 전송`);
        return replies;
    }
}

/**
 * 질문 대기 상태 처리
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {object} json - 메시지 JSON 데이터
 * @returns {Promise<Array<string>|null>} 응답 메시지 배열 또는 null (처리되지 않은 경우)
 */
async function handleQuestionPendingState(room, msg, sender, json) {
    const replies = [];
    const msgTrimmed = msg.trim();
    const msgLower = msgTrimmed.toLowerCase();

    // senderId 추출
    let questionSenderId = extractSenderId(json, sender);
    if (!questionSenderId && sender) {
        const senderStr = String(sender);
        const idMatch = senderStr.match(/(\d+)$/);
        if (idMatch) {
            questionSenderId = idMatch[1];
        }
    }

    if (!questionSenderId) {
        return null; // 처리하지 않음
    }

    // ----- !질문 기능 비활성화 시(해당 방): 대기 상태만 정리하고 준비중 메시지 반환 -----
    if (!isQuestionFeatureEnabledInRoom(room)) {
        const pendingQuestion = getPendingQuestion(room, questionSenderId);
        if (pendingQuestion) {
            getAndClearPendingQuestion(room, questionSenderId);
            const requestCacheKey = createCacheKey(room, questionSenderId);
            IMAGE_REQUEST_CACHE.delete(requestCacheKey);
            replies.push(QUESTION_PREPARING_MSG);
            return replies;
        }
        return null;
    }

    // 질문 대기 상태 확인
    const pendingQuestion = getPendingQuestion(room, questionSenderId);
    if (!pendingQuestion) {
        return null; // 질문 대기 상태 없음
    }
    
    // ⚠️ 중요: step이 없으면 'image'로 간주 (하위 호환)
    const currentStep = pendingQuestion.step || 'image';
    console.log(`[질문 대기] ✅ 상태 발견 (사용자 ID: ${questionSenderId}): 메시지="${msgTrimmed}", step="${currentStep}" (원본: ${pendingQuestion.step || 'undefined'})`);
    
    // 질문 대기 상태 처리: step에 따라 이미지 또는 제출 처리
    if (currentStep === 'image') {
        // 이미지 첨부 단계
        const skipImageKeywords = ['없음', '없어', 'no', '안함', '안해', 'skip', '취소', '넘어가', '다음'];
        const confirmKeywords = ['등록', '예', 'yes', 'ok', '확인', '네', '좋아', '좋아요'];
        const isSkipImage = skipImageKeywords.some(keyword => msgLower.includes(keyword));
        const isConfirmImage = confirmKeywords.some(keyword => msgLower.includes(keyword));
        
        // 이미지 확인 대기 중인 경우 (detectedImageUrl이 있는 경우)
        if (pendingQuestion.detectedImageUrl && isConfirmImage) {
            // 사용자가 이미지 첨부 확인 - 질문 제출
            const title = pendingQuestion.title || '제목 없음';
            const content = pendingQuestion.content || '';
            const imageUrlToUse = pendingQuestion.detectedImageUrl;
            
            if (!title || !content) {
                replies.push("❌ 질문 제목과 내용이 필요합니다.");
                return replies;
            }
            
            // 질문 대기 상태 삭제
            getAndClearPendingQuestion(room, questionSenderId);
            
            // 이미지 요청 캐시 정리
            const requestCacheKey = createCacheKey(room, questionSenderId);
            IMAGE_REQUEST_CACHE.delete(requestCacheKey);
            
            // 질문 제출 (테스트 방이면 DB는 test 스키마, 동일 플로우)
            console.log(`[질문 대기] 사용자 확인 후 이미지 포함 질문 제출: title="${title}", content="${content.substring(0, 30)}...", imageUrl=${imageUrlToUse.substring(0, 50)}...`);
            const questionReplies = await runWithDbScope(room, () => processQuestionSubmission(room, sender, title, content, imageUrlToUse, json));
            replies.push(...questionReplies);
            console.log(`[질문 대기] 질문 제출 완료`);
            return replies;
        }
        
        if (isSkipImage) {
            // 이미지 없이 진행 - 질문 제출 (계정 연동 체크 포함)
            const title = pendingQuestion.title || '제목 없음';
            const content = pendingQuestion.content || '';
            
            if (!title || !content) {
                replies.push("❌ 질문 제목과 내용이 필요합니다.");
                return replies;
            }
            
            // 질문 대기 상태 삭제
            getAndClearPendingQuestion(room, questionSenderId);
            
            // 이미지 요청 캐시 정리
            const requestCacheKey = createCacheKey(room, questionSenderId);
            IMAGE_REQUEST_CACHE.delete(requestCacheKey);
            
            // 질문 제출 (테스트 방이면 DB는 test 스키마, 동일 플로우)
            console.log(`[질문 대기] 이미지 없이 질문 제출 시작: title="${title}", content="${content.substring(0, 30)}..."`);
            const questionReplies = await runWithDbScope(room, () => processQuestionSubmission(room, sender, title, content, null, json));
            console.log(`[질문 대기] processQuestionSubmission 결과: replies.length=${questionReplies ? questionReplies.length : 0}`);
            if (questionReplies && questionReplies.length > 0) {
                replies.push(...questionReplies);
                console.log(`[질문 대기] ✅ 질문 제출 완료: ${questionReplies.length}개 응답`);
            } else {
                console.error(`[질문 대기] ❌ processQuestionSubmission이 빈 배열 반환`);
                replies.push("❌ 질문 제출 중 오류가 발생했습니다. 관리자에게 문의해주세요.");
            }
            return replies;
        } else {
            // 이미지가 이미 캐시에 있는지 확인 (자동 사용하지 않고 사용자 확인 필요)
            // ⚠️ 중요: 이미지 캐시를 확인하되, 자동으로 사용하지 않고 사용자 확인 필요
            // 이미지가 캐시에 있어도 바로 사용하지 않고, 사용자가 명시적으로 확인해야 함
            const cachedImageUrl = getAndClearPendingAttachment(room, questionSenderId);
            const previewData = getAndClearPendingPreview(room, questionSenderId, 90 * 1000);
            let imageUrlToUse = cachedImageUrl;
            
            if (previewData && previewData.filePath && fs.existsSync(previewData.filePath)) {
                const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_BASE_URL || 'http://192.168.0.15:5002';
                imageUrlToUse = `${serverUrl}/api/image/${previewData.filename}`;
                console.log(`[질문 대기] ✅ Bridge fallback 이미지 발견: ${imageUrlToUse.substring(0, 50)}...`);
            }
            
            // ⚠️ 중요: 이미지가 캐시에 있어도 사용자 확인 필요 (자동 사용하지 않음)
            // 이미지가 감지되었는지 확인하고, 사용자에게 확인 요청
            if (imageUrlToUse && !pendingQuestion.detectedImageUrl) {
                // 이미지가 감지되었음을 알리고 사용자 확인 요청
                replies.push(`📷 이미지가 감지되었습니다.\n\n` +
                    `이 이미지를 첨부하여 질문을 등록하시겠습니까?\n\n` +
                    `• 등록하려면 "등록" 또는 "예"를 입력하세요\n` +
                    `• 이미지 없이 진행하려면 "없음"을 입력하세요\n` +
                    `• 다른 이미지를 보내려면 새로운 이미지를 전송하세요`);
                
                // 질문 대기 상태에 이미지 URL 임시 저장 (사용자 확인 대기)
                pendingQuestion.detectedImageUrl = imageUrlToUse;
                setPendingQuestion(room, questionSenderId, pendingQuestion);
                
                return replies;
            } else if (pendingQuestion.detectedImageUrl) {
                // 이미 확인 대기 중인 이미지가 있으면, 사용자가 명시적으로 확인할 때까지 대기
                replies.push(`📷 이미지가 이미 감지되었습니다.\n\n` +
                    `이 이미지를 첨부하여 질문을 등록하시겠습니까?\n\n` +
                    `• 등록하려면 "등록" 또는 "예"를 입력하세요\n` +
                    `• 이미지 없이 진행하려면 "없음"을 입력하세요\n` +
                    `• 다른 이미지를 보내려면 새로운 이미지를 전송하세요`);
                return replies;
            } else {
                // 이미지가 아직 없으면 대기
                replies.push(`📷 이미지를 전송하시거나, 이미지 없이 진행하려면 "없음"을 입력하세요.`);
                return replies;
            }
        }
    }
    
    return null; // 처리되지 않음
}

module.exports = {
    handleQuestionCommand,
    handleQuestionPendingState
};

