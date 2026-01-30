/**
 * 질문 제출 처리 모듈
 * processQuestionSubmission 함수를 별도 모듈로 분리
 */

const { extractSenderName, extractSenderId } = require('../../utils/botUtils');
const { getValidNaverAccessToken, hasNaverToken } = require('../../../utils/naverTokenManager');
const { saveDraft } = require('../../../utils/cafeDraftManager');
const { submitQuestion, saveQuestionWithoutPermission } = require('../../../integrations/naverCafe/questionService');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

/**
 * 질문 제출 처리 (이미지 포함/미포함)
 */
async function processQuestionSubmission(room, sender, title, content, imageUrl = null, json = null) {
    const replies = [];
    
    console.log(`[질문 제출] 처리 시작: title="${title}", content="${content.substring(0, 30)}...", imageUrl=${imageUrl ? '있음' : '없음'}`);
    
    // 환경변수 확인
    const naverEnabled = process.env.NAVER_CAFE_ENABLED === 'true';
    const clubidStr = process.env.NAVER_CAFE_CLUBID;
    const menuidStr = process.env.NAVER_CAFE_MENUID;
    
    if (!naverEnabled) {
        replies.push("❌ 네이버 카페 질문 기능이 현재 비활성화되어 있습니다.");
        return replies;
    }
    
    if (!clubidStr || !menuidStr) {
        replies.push("❌ 네이버 카페 설정 오류가 발생했습니다. 관리자에게 문의해주세요.");
        return replies;
    }
    
    // 사용자 ID 추출 (여러 방법 시도)
    let userId = null;
    
    // 1순위: json에서 sender_id 추출 (암호화된 값일 수 있음)
    if (json && (json.sender_id || json.senderId || json.userId || json.user_id)) {
        userId = json.sender_id || json.senderId || json.userId || json.user_id;
        console.log(`[질문 제출] ✅ json에서 user_id 추출: ${userId}`);
    }
    
    // 2순위: extractSenderId 사용
    if (!userId) {
        userId = extractSenderId(json, sender);
        if (userId) {
            console.log(`[질문 제출] ✅ extractSenderId로 추출: ${userId}`);
        }
    }
    
    // 3순위: sender에서 숫자 ID 추출 시도
    if (!userId && sender) {
        const senderStr = String(sender);
        const idMatch = senderStr.match(/(\d+)$/);
        if (idMatch) {
            userId = idMatch[1];
            console.log(`[질문 제출] ✅ sender에서 숫자 ID 추출: ${userId}`);
        } else if (sender.includes('/')) {
            const parts = sender.split('/');
            for (let i = parts.length - 1; i >= 0; i--) {
                const part = parts[i].trim();
                if (/^\d+$/.test(part)) {
                    userId = part;
                    console.log(`[질문 제출] ✅ sender split으로 숫자 ID 추출: ${userId}`);
                }
            }
        }
    }
    
    if (!userId) {
        console.error('[질문 제출] 사용자 ID를 추출할 수 없습니다.');
        replies.push("❌ 사용자 ID를 확인할 수 없습니다. 다시 시도해주세요.");
        return replies;
    }
    
    console.log(`[질문 제출] 최종 사용자 ID: ${userId}, sender="${sender}", json.sender_id=${json?.sender_id || 'N/A'}`);
    
    // 토큰 존재 여부 확인 (userId를 문자열로 변환하여 일관성 유지)
    const userIdStr = String(userId);
    const hasToken = await hasNaverToken(userIdStr);
    
    if (!hasToken) {
        // 토큰 없음: 연동 링크 제공
        const baseUrl = process.env.SERVER_URL || `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 5002}`;
        
        console.log(`[질문 제출] 토큰 없음, 연동 링크 제공: user_id=${userId}`);
        
        // Draft 저장 (필수) - draft_id 반환받기
        let draftId = null;
        try {
            const draftResult = await saveDraft(userIdStr, room, title, content, imageUrl ? [imageUrl] : []);
            
            if (draftResult.success && draftResult.draftId) {
                draftId = draftResult.draftId;
                console.log(`[질문 제출] Draft 저장 완료: user_id=${userIdStr}, draft_id=${draftId}`);
            } else {
                console.warn(`[질문 제출] Draft 저장 실패 또는 draft_id 없음: user_id=${userIdStr}`);
            }
        } catch (draftErr) {
            console.error(`[질문 제출] Draft 저장 실패:`, draftErr.message);
        }
        
        // OAuth 링크 생성 시 draft_id 포함
        const authUrlWithDraft = draftId 
            ? `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}&draft_id=${encodeURIComponent(draftId)}`
            : `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}`;
        
        replies.push(
            `🔗 네이버 계정 연동이 필요합니다.\n\n` +
            `질문 등록을 처음 하시는 경우, 아래 링크를 클릭하여 네이버 계정을 연동해주세요:\n` +
            `${authUrlWithDraft}\n\n` +
            `연동 후 질문이 자동으로 등록됩니다.`
        );
        return replies;
    }
    
    // 토큰 가져오기 (자동 갱신 포함)
    let accessToken = null;
    try {
        const tokenResult = await getValidNaverAccessToken(userIdStr);
        
        if (tokenResult.error) {
            if (tokenResult.error === 'token_not_found') {
                // 토큰이 없음 (레코스 삭제됨)
                const baseUrl = process.env.SERVER_URL || `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 5002}`;
                const authUrl = `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}`;
                
                replies.push(
                    `🔗 네이버 계정 연동이 필요합니다.\n\n` +
                    `아래 링크를 클릭하여 네이버 계정을 연동해주세요:\n` +
                    `${authUrl}`
                );
                return replies;
            } else if (tokenResult.error === 'token_refresh_failed') {
                // 토큰 갱신 실패: 재연동 필요
                const baseUrl = process.env.SERVER_URL || `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 5002}`;
                const authUrl = `${baseUrl}/auth/naver/start?user_id=${encodeURIComponent(userIdStr)}`;
                
                replies.push(
                    `⚠️ 네이버 계정 연동이 만료되었습니다.\n\n` +
                    `아래 링크를 클릭하여 다시 연동해주세요:\n` +
                    `${authUrl}`
                );
                return replies;
            } else {
                throw new Error(tokenResult.message || '토큰 가져오기 실패');
            }
        }
        
        accessToken = tokenResult.accessToken;
        console.log(`[질문 제출] ✅ 사용자별 토큰 가져오기 성공: user_id=${userIdStr}`);
        
    } catch (error) {
        console.error('[질문 제출] 토큰 가져오기 실패:', error.message);
        replies.push("❌ 네이버 카페 인증 오류가 발생했습니다. 관리자에게 문의해주세요.");
        return replies;
    }
    
    const clubid = parseInt(clubidStr, 10);
    const menuid = parseInt(menuidStr, 10);
    const headid = "단톡방질문";
    
    if (isNaN(clubid) || isNaN(menuid)) {
        replies.push("❌ 네이버 카페 설정 오류가 발생했습니다. 관리자에게 문의해주세요.");
        return replies;
    }
    
    const senderName = extractSenderName(json, sender);
    
    // 이미지 다운로드 및 임시 파일 저장
    let imageBuffers = [];
    let tempImageFiles = [];  // 정리용 임시 파일 경로 배열
    
    if (imageUrl) {
        // 이미지 URL 또는 파일 경로 처리
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
            console.warn(`[질문 제출] ⚠️ 잘못된 이미지 형식: ${imageUrl}`);
        } else {
            try {
                // 파일 경로인지 확인
                if (fs.existsSync(imageUrl)) {
                    // 파일 경로인 경우
                    console.log(`[질문 제출] 이미지 파일 경로에서 읽기: ${imageUrl}`);
                    const imageBuffer = fs.readFileSync(imageUrl);
                    console.log(`[질문 제출] ✅ 이미지 파일 읽기 완료: ${imageBuffer.length} bytes`);
                    imageBuffers = [imageBuffer];
                    tempImageFiles.push(imageUrl); // 원본 파일 경로도 정리 대상에 포함 (필요시)
                } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    // URL인 경우 다운로드
                    console.log(`[질문 제출] 이미지 다운로드 시작: ${imageUrl.substring(0, 100)}...`);
                    
                    const imageResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        maxRedirects: 5,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        validateStatus: (status) => status >= 200 && status < 400
                    });
                    
                    if (imageResponse.data && imageResponse.data.length > 0) {
                        const imageBuffer = Buffer.from(imageResponse.data);
                        console.log(`[질문 제출] ✅ 이미지 다운로드 완료: ${imageBuffer.length} bytes, Content-Type: ${imageResponse.headers['content-type'] || 'unknown'}`);
                        
                        // 이미지를 임시 파일로 저장 (안정성을 위해)
                        const tempDir = os.tmpdir();
                        const tempFileName = `question_image_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                        const tempFilePath = path.join(tempDir, tempFileName);
                        
                        try {
                            fs.writeFileSync(tempFilePath, imageBuffer);
                            tempImageFiles.push(tempFilePath);
                            console.log(`[질문 제출] ✅ 이미지 임시 파일 저장: ${tempFilePath}`);
                            
                            // Buffer와 파일 경로 모두 보관 (Buffer 우선 사용, 파일은 백업/정리용)
                            imageBuffers = [imageBuffer];
                        } catch (fileError) {
                            console.error(`[질문 제출] ⚠️ 임시 파일 저장 실패 (Buffer는 사용 가능): ${fileError.message}`);
                            // 파일 저장 실패해도 Buffer는 사용 가능
                            imageBuffers = [imageBuffer];
                        }
                    } else {
                        console.warn(`[질문 제출] ⚠️ 이미지 데이터가 비어있음: URL=${imageUrl.substring(0, 100)}`);
                    }
                } else {
                    console.warn(`[질문 제출] ⚠️ 지원하지 않는 이미지 형식: ${imageUrl.substring(0, 100)}`);
                }
            } catch (error) {
                console.error(`[질문 제출] ❌ 이미지 처리 실패: ${error.message}`);
                if (error.response) {
                    console.error(`[질문 제출] HTTP 상태 코드: ${error.response.status}`);
                }
                // 이미지 처리 실패해도 질문 작성은 계속 진행
            }
        }
    }
    
    try {
        // 이미지 전달 확인 로깅 (테스트 로직과 동일하게)
        if (imageUrl && imageBuffers.length > 0) {
            console.log(`[질문 제출] ✅ 이미지 전달 준비 완료: ${imageBuffers.length}개 이미지 버퍼 (각 ${imageBuffers[0].length} bytes)`);
            console.log(`[질문 제출] 이미지 버퍼 타입: ${imageBuffers[0].constructor.name}, Buffer.isBuffer: ${Buffer.isBuffer(imageBuffers[0])}`);
        } else if (imageUrl && imageBuffers.length === 0) {
            console.warn(`[질문 제출] ⚠️ 이미지 URL은 있지만 이미지 버퍼가 없음: ${imageUrl.substring(0, 100)}`);
        } else if (!imageUrl) {
            console.log(`[질문 제출] 이미지 없이 진행: imageUrl=null`);
        }
        
        // 테스트 로직과 동일하게 Buffer 배열 전달
        const imagesToSend = imageBuffers.length > 0 ? imageBuffers : null;
        console.log(`[질문 제출] submitQuestion 호출: images=${imagesToSend ? `${imagesToSend.length}개 Buffer` : 'null'}`);
        
        const result = await submitQuestion({
            senderId: userIdStr,  // ✅ 사용자 ID 사용 (문자열)
            senderName: senderName,
            roomId: room,
            title: title,
            content: content,
            accessToken: accessToken,
            clubid: clubid,
            menuid: menuid,
            headid: headid,
            images: imagesToSend  // 테스트 로직과 동일: Buffer 배열 또는 null
        });
        
        // 병렬 처리 가능: 여러 사용자가 동시에 질문을 처리해도 각각 독립적으로 처리됨
        if (result.success && result.articleUrl) {
            // 이미지가 있는 경우와 없는 경우 다른 템플릿 사용
            let replyMsg;
            if (imageBuffers.length > 0) {
                // 이미지 포함 템플릿
                replyMsg = `✅ 질문이 등록되었습니다.\n\n` +
                    `📋 제목: ${title}\n\n` +
                    `📝 내용: ${content}\n\n` +
                    `📷 이미지가 첨부되었습니다.\n\n` +
                    `🔗 답변하러 가기: ${result.articleUrl}`;
                console.log(`[질문 제출] ✅ 이미지 포함 질문 등록 완료`);
            } else {
                // 이미지 없음 템플릿 (상용화 느낌)
                replyMsg = `✅ 질문이 등록되었습니다.\n\n` +
                    `📋 제목: ${title}\n\n` +
                    `📝 내용: ${content}\n\n` +
                    `🔗 답변하러 가기: ${result.articleUrl}`;
                if (imageUrl) {
                    console.warn(`[질문 제출] ⚠️ 이미지 URL은 있었지만 첨부 실패: ${imageUrl.substring(0, 100)}`);
                }
            }
            replies.push(replyMsg);
            console.log(`[질문 제출] ✅ 질문 등록 완료 (room: "${room}", sender: "${senderName}", 이미지: ${imageBuffers.length > 0 ? '있음' : '없음'})`);
        } else if (result.error === 'no_permission') {
            await saveQuestionWithoutPermission({
                senderId: sender,
                senderName: senderName,
                roomId: room,
                title: title,
                content: content,
                clubid: clubid,
                menuid: menuid,
                headid: headid
            });
            
            let replyMsg = `⏳ 카페 글쓰기 권한이 없어 질문이 임시 저장되었습니다.\n관리자가 확인 후 작성해드리겠습니다.\n\nQ. ${title}\n${content}\n\n`;
            if (imageBuffers.length > 0) {
                replyMsg += `📷 (이미지 첨부 완료)\n\n`;
            } else if (imageUrl) {
                replyMsg += `⚠️ 이미지 첨부 실패\n\n`;
            }
            replies.push(replyMsg);
        } else {
            replies.push(`❌ 질문 작성 중 오류가 발생했습니다.\n${result.message || '알 수 없는 오류'}\n\n다시 시도해주시거나 관리자에게 문의해주세요.`);
        }
    } catch (error) {
        console.error('[질문 제출] 오류:', error);
        replies.push(`❌ 질문 처리 중 오류가 발생했습니다.\n오류: ${error.message}\n\n관리자에게 문의해주세요.`);
    } finally {
        // 임시 파일 정리
        for (const tempFile of tempImageFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                    console.log(`[질문 제출] ✅ 임시 파일 삭제: ${tempFile}`);
                }
            } catch (cleanupError) {
                console.error(`[질문 제출] ⚠️ 임시 파일 삭제 실패: ${tempFile}, 오류: ${cleanupError.message}`);
            }
        }
        tempImageFiles = [];  // 배열 초기화
    }
    
    return replies;
}

module.exports = {
    processQuestionSubmission
};

