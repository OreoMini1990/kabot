// ============================================
// OAuth 연동 후 Draft 자동 게시 재개 서비스
// ============================================

const { getDraft, updateDraftStatus, deleteDraft } = require('./cafeDraftManager');
const { getValidNaverAccessToken } = require('./naverTokenManager');
const { submitQuestion } = require('../integrations/naverCafe/questionService');
const { downloadAndSaveImage } = require('../utils/imageDownloader');
const { decryptKakaoTalkMessage } = require('../crypto/kakaoDecrypt');
const fs = require('fs');
const path = require('path');

/**
 * user_name이 카카오 암호화 문자열이면 복호화 후 반환
 */
function resolveAuthorDisplayName(rawUserName, userId) {
    if (!rawUserName || typeof rawUserName !== 'string') return null;
    const trimmed = rawUserName.trim();
    if (!trimmed) return null;
    const isBase64Like = trimmed.length > 10 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(trimmed);
    if (!isBase64Like || !userId) return trimmed;
    try {
        const userIdStr = String(userId);
        for (const encTry of [31, 30, 32]) {
            const decrypted = decryptKakaoTalkMessage(trimmed, userIdStr, encTry);
            if (decrypted && decrypted !== trimmed) {
                const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                const stillBase64 = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
                if (!hasControlChars && !stillBase64) {
                    return decrypted;
                }
            }
        }
    } catch (err) {
        console.warn(`[RESUME] 작성자명 복호화 실패: ${err.message}`);
    }
    return trimmed;
}

/**
 * OAuth 연동 후 Draft 자동 게시 재개
 * @param {string} userId - 사용자 ID
 * @param {string} draftId - Draft ID (선택사항)
 * @returns {Promise<{ok: boolean, reason?: string, error?: string, url?: string}>}
 */
async function resumeDraftAfterOAuth(userId, draftId = null) {
    // ⚠️ 5차 조치: resume 실행 여부 강제 확정 로그
    console.log(`[RESUME] ENTER userId=${userId} draftId=${draftId || 'null'}`);
    
    try {
        // 1단계: Draft 조회
        console.log(`[RESUME] [1단계] Draft 조회 시작`);
        const draft = await getDraft(userId, draftId);
        
        if (!draft) {
            console.warn(`[RESUME] [1단계] ❌ Draft 없음: user_id=${userId}, draft_id=${draftId || 'null'}`);
            return { ok: false, reason: 'NO_DRAFT' };
        }
        
        console.log(`[RESUME] [1단계] ✅ Draft 발견`);
        console.log(`[RESUME]   - draft_id: ${draft.draft_id}`);
        console.log(`[RESUME]   - room_name: ${draft.room_name || 'N/A'}`);
        console.log(`[RESUME]   - title: "${draft.title.substring(0, 50)}${draft.title.length > 50 ? '...' : ''}"`);
        console.log(`[RESUME]   - content: "${draft.content.substring(0, 50)}${draft.content.length > 50 ? '...' : ''}"`);
        console.log(`[RESUME]   - image_refs: ${draft.imageRefs ? draft.imageRefs.length : 0}개`);
        console.log(`[RESUME]   - status: ${draft.status}`);
        
        // Draft 상태를 pending_submit으로 변경
        await updateDraftStatus(draft.draft_id, 'pending_submit');
        
        // 2단계: 토큰 가져오기 (5차 조치: 단계별 간소화 로그)
        const tokenResult = await getValidNaverAccessToken(userId);
        
        if (tokenResult.error) {
            console.log(`[RESUME-2] token ok? NO error=${tokenResult.error}`);
            await updateDraftStatus(draft.draft_id, 'failed', `토큰 가져오기 실패: ${tokenResult.error}`);
            return { ok: false, reason: 'TOKEN_ERROR', error: tokenResult.error };
        }
        
        const accessToken = tokenResult.accessToken;
        const authorName = resolveAuthorDisplayName(tokenResult.userName, userId) || null;
        console.log(`[RESUME-2] token ok? YES`);
        
        // 3단계: 이미지 처리 (5차 조치: 단계별 간소화 로그)
        const images = [];
        let imageProcessedCount = 0;
        let imageSkippedCount = 0;
        
        if (draft.imageRefs && draft.imageRefs.length > 0) {
            for (let i = 0; i < draft.imageRefs.length; i++) {
                const imageRef = draft.imageRefs[i];
                
                try {
                    // URL인 경우 다운로드
                    if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) {
                        const downloadResult = await downloadAndSaveImage(imageRef);
                        
                        if (downloadResult && downloadResult.filePath && fs.existsSync(downloadResult.filePath)) {
                            images.push(downloadResult.filePath);
                            imageProcessedCount++;
                        } else {
                            imageSkippedCount++;
                        }
                    } 
                    // 로컬 파일 경로인 경우
                    else if (fs.existsSync(imageRef)) {
                        images.push(imageRef);
                        imageProcessedCount++;
                    } 
                    // 파일이 없는 경우 스킵
                    else {
                        imageSkippedCount++;
                    }
                } catch (imgErr) {
                    imageSkippedCount++;
                }
            }
        }
        
        console.log(`[RESUME-3] images count=${images.length} (processed=${imageProcessedCount}, skipped=${imageSkippedCount})`);
        
        // 4단계: 게시글 등록 (5차 조치: 단계별 간소화 로그)
        const clubidStr = process.env.NAVER_CAFE_CLUBID;
        const menuidStr = process.env.NAVER_CAFE_MENUID;
        
        if (!clubidStr || !menuidStr) {
            const errorMsg = 'NAVER_CAFE_CLUBID 또는 NAVER_CAFE_MENUID가 설정되지 않았습니다.';
            console.log(`[RESUME-4] submit ok? NO error=${errorMsg}`);
            await updateDraftStatus(draft.draft_id, 'failed', errorMsg);
            return { ok: false, reason: 'CONFIG_ERROR', error: errorMsg };
        }
        
        const clubid = parseInt(clubidStr, 10);
        const menuid = parseInt(menuidStr, 10);
        
        try {
            const submitResult = await submitQuestion({
                senderId: userId,
                senderName: null,  // OAuth 콜백에서는 senderName을 알 수 없음
                roomId: draft.room_name,
                title: draft.title,
                content: draft.content,
                accessToken: accessToken,
                clubid: clubid,
                menuid: menuid,
                images: images.length > 0 ? images : null
            });
            
            if (!submitResult.success) {
                const errorMsg = submitResult.error || '게시글 등록 실패';
                console.log(`[RESUME-4] submit ok? NO error=${errorMsg}`);
                await updateDraftStatus(draft.draft_id, 'failed', errorMsg);
                return { ok: false, reason: 'SUBMIT_FAILED', error: errorMsg };
            }
            
            console.log(`[RESUME-4] submit ok? YES url=${submitResult.articleUrl || 'N/A'}`);
            
            // 질문 등록 완료 → 임시저장 draft 제거
            await deleteDraft(draft.draft_id);
            
            // 5단계: 재개 완료
            console.log(`[RESUME-5] notify ok? (callback에서 처리)`);
            console.log(`[RESUME] EXIT ok url=${submitResult.articleUrl || 'N/A'}`);
            
            return { 
                ok: true, 
                url: submitResult.articleUrl,
                articleId: submitResult.articleId,
                shortCode: submitResult.shortCode,
                roomName: draft.room_name,
                title: draft.title,
                content: draft.content,
                authorName
            };
            
        } catch (submitErr) {
            console.error(`[RESUME-4] submit ok? NO error=${submitErr.message}`);
            await updateDraftStatus(draft.draft_id, 'failed', submitErr.message);
            return { ok: false, reason: 'SUBMIT_EXCEPTION', error: submitErr.message };
        }
        
    } catch (err) {
        console.error(`[RESUME] FATAL error=${err.message}`);
        console.error(`[RESUME] FATAL stack:`, err.stack);
        return { ok: false, reason: 'RESUME_FATAL', error: String(err?.message || err) };
    }
}

module.exports = {
    resumeDraftAfterOAuth
};

