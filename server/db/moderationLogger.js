// ============================================
// 모더레이션 로그 저장 모듈
// 무단홍보, 메시지삭제, 강퇴, 닉네임변경, 반응 등 기록
// ============================================

const db = require('./database');

/**
 * 무단 홍보 위반 기록 저장
 * @param {Object} data - 위반 정보
 * @returns {Object|null} 저장된 레코드
 */
async function savePromotionViolation(data) {
    const {
        roomName,
        senderName,
        senderId,
        messageText,
        detectedUrl,
        violationType,  // 'open_chat', 'toss', 'discord', 'general_link'
        violationCount,
        warningLevel
    } = data;

    try {
        const isReported = warningLevel >= 3;
        
        const { data: result, error } = await db.supabase
            .from('promotion_violations')
            .insert({
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId,
                message_text: messageText,
                detected_url: detectedUrl,
                violation_type: violationType,
                violation_count: violationCount,
                warning_level: warningLevel,
                is_reported_to_admin: isReported
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 무단홍보 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 무단홍보 기록 저장:', {
            id: result.id,
            sender: senderName,
            type: violationType,
            count: violationCount,
            level: warningLevel
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 무단홍보 저장 예외:', err.message);
        return null;
    }
}

/**
 * 메시지 삭제 경고 기록 저장
 * @param {Object} data - 삭제 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveMessageDeleteWarning(data) {
    const {
        roomName,
        senderName,
        senderId,
        deletedMessageId,
        deletedMessageText,
        deleteCount24h,
        warningLevel
    } = data;

    try {
        const isReported = warningLevel >= 3;
        
        const { data: result, error } = await db.supabase
            .from('message_delete_warnings')
            .insert({
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId,
                deleted_message_id: deletedMessageId,
                deleted_message_text: deletedMessageText,
                delete_count_24h: deleteCount24h,
                warning_level: warningLevel,
                is_reported_to_admin: isReported
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 메시지삭제 경고 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 메시지삭제 경고 기록 저장:', {
            id: result.id,
            sender: senderName,
            count: deleteCount24h,
            level: warningLevel
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 메시지삭제 저장 예외:', err.message);
        return null;
    }
}

/**
 * 강퇴 기록 저장
 * @param {Object} data - 강퇴 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveMemberKick(data) {
    const {
        roomName,
        kickedUserName,
        kickedUserId,
        kickedByName,
        kickedById,
        kickReason
    } = data;

    try {
        const { data: result, error } = await db.supabase
            .from('member_kicks')
            .insert({
                room_name: roomName,
                kicked_user_name: kickedUserName,
                kicked_user_id: kickedUserId,
                kicked_by_name: kickedByName,
                kicked_by_id: kickedById,
                kick_reason: kickReason
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 강퇴 기록 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 강퇴 기록 저장:', {
            id: result.id,
            kicked: kickedUserName,
            by: kickedByName
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 강퇴 저장 예외:', err.message);
        return null;
    }
}

/**
 * 멤버 활동 (입퇴장) 기록 저장
 * @param {Object} data - 활동 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveMemberActivity(data) {
    const {
        roomName,
        userName,
        userId,
        activityType,  // 'join', 'leave', 'kick', 'invite'
        invitedByName,
        invitedById,
        isKicked
    } = data;

    try {
        // 기존 입퇴장 횟수 조회
        let joinCount = 0;
        let leaveCount = 0;

        if (userId) {
            const { data: existing } = await db.supabase
                .from('member_activities')
                .select('join_count, leave_count')
                .eq('user_id', userId)
                .eq('room_name', roomName)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (existing) {
                joinCount = existing.join_count || 0;
                leaveCount = existing.leave_count || 0;
            }
        }

        // 횟수 업데이트
        if (activityType === 'join' || activityType === 'invite') {
            joinCount += 1;
        } else if (activityType === 'leave' || activityType === 'kick') {
            leaveCount += 1;
        }

        const { data: result, error } = await db.supabase
            .from('member_activities')
            .insert({
                room_name: roomName,
                user_name: userName,
                user_id: userId,
                activity_type: activityType,
                invited_by_name: invitedByName,
                invited_by_id: invitedById,
                is_kicked: isKicked || false,
                join_count: joinCount,
                leave_count: leaveCount
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 멤버활동 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 멤버활동 기록 저장:', {
            id: result.id,
            user: userName,
            type: activityType,
            joinCount,
            leaveCount
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 멤버활동 저장 예외:', err.message);
        return null;
    }
}

/**
 * 닉네임 변경 기록 저장
 * @param {Object} data - 닉네임 변경 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveNicknameChange(data) {
    const {
        roomName,
        userId,
        oldNickname,
        newNickname
    } = data;

    try {
        // 기존 변경 횟수 조회
        let changeCount = 0;
        if (userId) {
            const { data: existing } = await db.supabase
                .from('nickname_changes')
                .select('change_count')
                .eq('user_id', userId)
                .eq('room_name', roomName)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (existing) {
                changeCount = existing.change_count || 0;
            }
        }
        changeCount += 1;

        const { data: result, error } = await db.supabase
            .from('nickname_changes')
            .insert({
                room_name: roomName,
                user_id: userId,
                old_nickname: oldNickname,
                new_nickname: newNickname,
                change_count: changeCount
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 닉네임변경 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 닉네임변경 기록 저장:', {
            id: result.id,
            userId,
            old: oldNickname,
            new: newNickname,
            count: changeCount
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 닉네임변경 저장 예외:', err.message);
        return null;
    }
}

/**
 * 비속어 경고 기록 저장
 * @param {Object} data - 비속어 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveProfanityWarning(data) {
    const {
        roomName,
        senderName,
        senderId,
        messageText,
        detectedWord,
        warningLevel,
        warningCount
    } = data;

    try {
        const isReported = warningLevel >= 3;
        
        const { data: result, error } = await db.supabase
            .from('profanity_warnings')
            .insert({
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId,
                message_text: messageText,
                detected_word: detectedWord,
                warning_level: warningLevel,
                warning_count: warningCount,
                is_reported_to_admin: isReported
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 비속어 경고 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 비속어 경고 기록 저장:', {
            id: result.id,
            sender: senderName,
            word: detectedWord,
            count: warningCount
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 비속어 저장 예외:', err.message);
        return null;
    }
}

/**
 * 반응 로그 저장 (상세)
 * @param {Object} data - 반응 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveReactionLog(data) {
    const {
        roomName,
        targetMessageId,
        targetMessageText,
        reactorName,
        reactorId,
        reactionType,
        isAdminReaction
    } = data;

    // 반응 타입에 따른 이모지 매핑
    const emojiMap = {
        'heart': '❤️',
        'thumbs_up': '👍',
        'check': '✅',
        'surprised': '😱',
        'sad': '😢',
        'like': '👍'
    };
    const reactionEmoji = emojiMap[reactionType] || reactionType;

    try {
        const { data: result, error } = await db.supabase
            .from('reaction_logs')
            .insert({
                room_name: roomName,
                target_message_id: targetMessageId,
                target_message_text: targetMessageText,
                reactor_name: reactorName,
                reactor_id: reactorId,
                reaction_type: reactionType,
                reaction_emoji: reactionEmoji,
                is_admin_reaction: isAdminReaction || false
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 반응 로그 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 반응 로그 저장:', {
            id: result.id,
            reactor: reactorName,
            type: reactionType,
            emoji: reactionEmoji,
            isAdmin: isAdminReaction
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 반응 저장 예외:', err.message);
        return null;
    }
}

/**
 * 신고 기록 저장
 * @param {Object} data - 신고 정보
 * @returns {Object|null} 저장된 레코드
 */
async function saveReportLog(data) {
    const {
        roomName,
        reporterName,
        reporterId,
        reportedMessageId,
        reportedMessageText,
        reportedUserName,
        reportedUserId,
        reportReason,
        reportType
    } = data;

    try {
        const { data: result, error } = await db.supabase
            .from('report_logs')
            .insert({
                room_name: roomName,
                reporter_name: reporterName,
                reporter_id: reporterId,
                reported_message_id: reportedMessageId,
                reported_message_text: reportedMessageText,
                reported_user_name: reportedUserName,
                reported_user_id: reportedUserId,
                report_reason: reportReason,
                report_type: reportType || 'general',
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('[모더레이션] 신고 저장 실패:', error.message);
            return null;
        }

        console.log('[모더레이션] ✅ 신고 기록 저장:', {
            id: result.id,
            reporter: reporterName,
            reportedUser: reportedUserName,
            reason: reportReason
        });

        return result;
    } catch (err) {
        console.error('[모더레이션] 신고 저장 예외:', err.message);
        return null;
    }
}

/**
 * 사용자별 무단홍보 위반 횟수 조회
 * @param {string} senderId - 발신자 ID
 * @param {string} roomName - 채팅방 이름
 * @returns {number} 위반 횟수
 */
async function getPromotionViolationCount(senderId, roomName) {
    try {
        const { count, error } = await db.supabase
            .from('promotion_violations')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', senderId)
            .eq('room_name', roomName);

        if (error) {
            console.error('[모더레이션] 위반 횟수 조회 실패:', error.message);
            return 0;
        }

        return count || 0;
    } catch (err) {
        console.error('[모더레이션] 위반 횟수 조회 예외:', err.message);
        return 0;
    }
}

/**
 * 24시간 내 메시지 삭제 횟수 조회
 * @param {string} senderId - 발신자 ID
 * @param {string} roomName - 채팅방 이름
 * @returns {number} 삭제 횟수
 */
async function getDeleteCount24h(senderId, roomName) {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { count, error } = await db.supabase
            .from('message_delete_warnings')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', senderId)
            .eq('room_name', roomName)
            .gte('created_at', twentyFourHoursAgo);

        if (error) {
            console.error('[모더레이션] 삭제 횟수 조회 실패:', error.message);
            return 0;
        }

        return count || 0;
    } catch (err) {
        console.error('[모더레이션] 삭제 횟수 조회 예외:', err.message);
        return 0;
    }
}

module.exports = {
    savePromotionViolation,
    saveMessageDeleteWarning,
    saveMemberKick,
    saveMemberActivity,
    saveNicknameChange,
    saveProfanityWarning,
    saveReactionLog,
    saveReportLog,
    getPromotionViolationCount,
    getDeleteCount24h
};

