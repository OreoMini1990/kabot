// ============================================
// 카페 글쓰기 Draft 관리 유틸
// ============================================

const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Draft 저장
 * @param {string} userId - 사용자 ID
 * @param {string} roomName - 채팅방 이름
 * @param {string} title - 제목
 * @param {string} content - 내용
 * @param {string[]} imageRefs - 이미지 URL 배열
 * @returns {Promise<{success: boolean, draftId?: string}>}
 */
async function saveDraft(userId, roomName, title, content, imageRefs = []) {
    try {
        const draftId = uuidv4();  // UUID 생성
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);  // 2시간 TTL
        const scheduledAt = new Date(Date.now() + 3 * 60 * 1000);  // 3분 후 자동 작성 트리거
        
        const { data, error } = await db.supabase
            .from('cafe_post_drafts')
            .upsert({
                draft_id: draftId,
                user_id: userId,
                room_name: roomName,
                title: title,
                content: content,
                image_refs: imageRefs,
                status: 'pending_oauth',
                expires_at: expiresAt.toISOString(),
                scheduled_at: scheduledAt.toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select('draft_id')
            .single();
        
        if (error) {
            console.error(`[Draft] 저장 실패:`, error);
            return { success: false };
        }
        
        const savedDraftId = data?.draft_id || draftId;
        console.log(`[Draft] ✅ 저장 완료: user_id=${userId}, draft_id=${savedDraftId}, scheduled_at=3분 후`);
        return { success: true, draftId: savedDraftId };
    } catch (err) {
        console.error(`[Draft] 저장 예외:`, err.message);
        return { success: false };
    }
}

/**
 * Draft 조회 (draft_id 우선, 없으면 최신 pending draft)
 * @param {string} userId - 사용자 ID
 * @param {string} draftId - Draft ID (선택사항)
 * @returns {Promise<{draft_id: string, room_name: string, title: string, content: string, imageRefs: string[]} | null>}
 */
async function getDraft(userId, draftId = null) {
    try {
        let query = db.supabase
            .from('cafe_post_drafts')
            .select('*')
            .eq('user_id', userId)
            .gt('expires_at', new Date().toISOString())  // 만료되지 않은 것만
            .in('status', ['pending_oauth', 'pending_submit']);  // 미처리 상태만
        
        // draft_id가 있으면 우선 조회
        if (draftId) {
            query = query.eq('draft_id', draftId);
        }
        
        // draft_id가 없으면 최신 순으로 정렬
        if (!draftId) {
            query = query.order('created_at', { ascending: false }).limit(1);
        }
        
        const { data, error } = await query.maybeSingle();
        
        if (error) {
            console.error(`[Draft] 조회 실패:`, error);
            return null;
        }
        
        if (!data) {
            return null;
        }
        
        return {
            draft_id: data.draft_id,
            room_name: data.room_name,
            title: data.title,
            content: data.content,
            imageRefs: data.image_refs || [],
            status: data.status
        };
    } catch (err) {
        console.error(`[Draft] 조회 예외:`, err.message);
        return null;
    }
}

/**
 * Draft 조회 및 삭제 (기존 호환성 유지)
 * @param {string} userId - 사용자 ID
 * @param {string} draftId - Draft ID (선택사항)
 * @returns {Promise<{draft_id: string, room_name: string, title: string, content: string, imageRefs: string[]} | null>}
 */
async function getAndDeleteDraft(userId, draftId = null) {
    try {
        const draft = await getDraft(userId, draftId);
        
        if (!draft) {
            return null;
        }
        
        // 조회 후 삭제
        await db.supabase
            .from('cafe_post_drafts')
            .delete()
            .eq('draft_id', draft.draft_id);
        
        console.log(`[Draft] ✅ 조회 및 삭제 완료: user_id=${userId}, draft_id=${draft.draft_id}`);
        
        return draft;
    } catch (err) {
        console.error(`[Draft] 조회 예외:`, err.message);
        return null;
    }
}

/**
 * Draft 상태 업데이트
 * @param {string} draftId - Draft ID
 * @param {string} status - 새 상태 ('pending_oauth', 'pending_submit', 'submitted', 'failed')
 * @param {string} errorLast - 에러 메시지 (선택사항)
 */
async function updateDraftStatus(draftId, status, errorLast = null) {
    try {
        const updateData = {
            status: status,
            updated_at: new Date().toISOString()
        };
        
        if (status === 'submitted') {
            updateData.submitted_at = new Date().toISOString();
        }
        
        if (errorLast) {
            updateData.error_last = errorLast;
        }
        
        const { error } = await db.supabase
            .from('cafe_post_drafts')
            .update(updateData)
            .eq('draft_id', draftId);
        
        if (error) {
            console.error(`[Draft] 상태 업데이트 실패:`, error);
            return false;
        }
        
        console.log(`[Draft] ✅ 상태 업데이트: draft_id=${draftId}, status=${status}`);
        return true;
    } catch (err) {
        console.error(`[Draft] 상태 업데이트 예외:`, err.message);
        return false;
    }
}

/**
 * Draft 삭제 (질문 등록 완료 후 임시저장 제거)
 * @param {string} draftId - Draft ID
 * @returns {Promise<boolean>}
 */
async function deleteDraft(draftId) {
    try {
        const { error } = await db.supabase
            .from('cafe_post_drafts')
            .delete()
            .eq('draft_id', draftId);
        if (error) {
            console.error(`[Draft] 삭제 실패:`, error);
            return false;
        }
        console.log(`[Draft] ✅ 삭제 완료: draft_id=${draftId}`);
        return true;
    } catch (err) {
        console.error(`[Draft] 삭제 예외:`, err.message);
        return false;
    }
}

/**
 * 만료된 Draft 정리
 */
async function cleanupExpiredDrafts() {
    try {
        const { error } = await db.supabase
            .from('cafe_post_drafts')
            .delete()
            .lt('expires_at', new Date().toISOString());
        
        if (error) {
            console.error(`[Draft] 정리 실패:`, error);
            return 0;
        }
        
        console.log(`[Draft] ✅ 만료된 Draft 정리 완료`);
        return 1;
    } catch (err) {
        console.error(`[Draft] 정리 예외:`, err.message);
        return 0;
    }
}

/**
 * 백그라운드 재개 워커: 다음 두 경우에 Draft 처리
 * 1) scheduled_at 시각이 지남 (3분 후 자동 작성)
 * 2) 해당 user_id가 naver_oauth_tokens에 존재(이미 연동됨) → scheduled_at 무시하고 바로 등록
 */
async function processPendingSubmits() {
    try {
        console.log(`[백그라운드 재개] Draft 조회 시작`);
        
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();
        
        const { data: rows, error } = await db.supabase
            .from('cafe_post_drafts')
            .select('*')
            .in('status', ['pending_oauth', 'pending_submit'])
            .gt('expires_at', now)
            .gte('created_at', oneHourAgo)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error(`[백그라운드 재개] 조회 실패:`, error);
            return;
        }
        
        if (!rows || rows.length === 0) {
            console.log(`[백그라운드 재개] 조회 완료: 0건`);
            return;
        }
        
        const { data: tokenUserIds } = await db.supabase
            .from('naver_oauth_tokens')
            .select('user_id')
            .eq('is_active', true);
        const linkedSet = new Set((tokenUserIds || []).map((r) => String(r.user_id)));
        
        const drafts = rows.filter((d) => {
            const scheduledDue = !d.scheduled_at || d.scheduled_at <= now;
            const alreadyLinked = linkedSet.has(String(d.user_id));
            return scheduledDue || alreadyLinked;
        });
        if (drafts.length === 0) {
            console.log(`[백그라운드 재개] 조회 완료: 처리 대상 없음 (scheduled_at 미도래·미연동 ${rows.length}건)`);
            return;
        }
        
        console.log(`[백그라운드 재개] ${drafts.length}개 Draft 처리 대상 (scheduled_at 도래 또는 연동완료)`);
        
        // 각 Draft에 대해 재개 시도
        const { resumeDraftAfterOAuth } = require('./resumeDraftService');
        
        for (const draft of drafts) {
            try {
                console.log(`[백그라운드 재개] 처리 시작: draft_id=${draft.draft_id}, user_id=${draft.user_id}`);
                
                const resumeResult = await resumeDraftAfterOAuth(draft.user_id, draft.draft_id);
                
                if (resumeResult.ok) {
                    console.log(`[백그라운드 재개] ✅ 성공: draft_id=${draft.draft_id}, url=${resumeResult.url || 'N/A'}`);
                    
                    // 성공 시 사용자 알림 (sendFollowUp이 null이어도 재시도)
                    if (resumeResult.roomName) {
                        const sendFollowUpMessageFunction = global.sendFollowUpMessageFunction;
                        
                        if (sendFollowUpMessageFunction) {
                            const authorLine = resumeResult.authorName
                                ? `작성자 : ${resumeResult.authorName}\n\n`
                                : '';
                            const message = `✅ 네이버 계정 연동이 완료되었습니다!\n\n` +
                                authorLine +
                                `📋 제목: ${resumeResult.title || 'N/A'}\n\n` +
                                `🔗 답변하러 가기: ${resumeResult.url || 'N/A'}`;
                            
                            sendFollowUpMessageFunction(resumeResult.roomName, message);
                            console.log(`[백그라운드 재개] ✅ 알림 전송: room=${resumeResult.roomName}`);
                        } else {
                            console.warn(`[백그라운드 재개] ⚠️ sendFollowUpMessageFunction null - 알림 스킵`);
                        }
                    }
                } else {
                    console.warn(`[백그라운드 재개] ⚠️ 실패: draft_id=${draft.draft_id}, reason=${resumeResult.reason || 'N/A'}`);
                    // 실패한 Draft는 다음 주기에 다시 시도 (status는 그대로 pending_submit 유지)
                }
            } catch (draftErr) {
                console.error(`[백그라운드 재개] ❌ 예외: draft_id=${draft.draft_id}, error=${draftErr.message}`);
            }
        }
        
        console.log(`[백그라운드 재개] 처리 완료: ${drafts.length}개`);
    } catch (err) {
        console.error(`[백그라운드 재개] 워커 예외:`, err.message);
    }
}

module.exports = {
    saveDraft,
    getDraft,
    getAndDeleteDraft,
    updateDraftStatus,
    deleteDraft,
    cleanupExpiredDrafts,
    processPendingSubmits  // ⚠️ 7차 조치: 백그라운드 재개 워커
};

