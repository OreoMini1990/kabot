// ============================================
// 채팅 로그 저장 및 통계 관리
// ============================================

const db = require('./database');

/**
 * 사용자 조회 또는 생성 (정규화된 users 테이블 사용)
 */
async function getOrCreateUser(roomName, senderName, senderId) {
    try {
        // internal_user_id 생성
        const internalUserId = require('crypto')
            .createHash('md5')
            .update(`${roomName}|${senderName}|${senderId || ''}`)
            .digest('hex');
        
        // 기존 사용자 조회 (우선순위: kakao_user_id > internal_user_id)
        let existingUser = null;
        
        if (senderId) {
            // 1순위: kakao_user_id로 조회 (더 정확한 식별)
            const { data: userByKakaoId } = await db.supabase
                .from('users')
                .select('*')
                .eq('kakao_user_id', senderId)
                .single();
            
            if (userByKakaoId) {
                existingUser = userByKakaoId;
            }
        }
        
        // 2순위: internal_user_id로 조회
        if (!existingUser) {
            const { data: userByInternalId } = await db.supabase
                .from('users')
                .select('*')
                .eq('internal_user_id', internalUserId)
                .single();
            
            if (userByInternalId) {
                existingUser = userByInternalId;
                
                // kakao_user_id가 없으면 업데이트
                if (senderId && !existingUser.kakao_user_id) {
                    await db.supabase
                        .from('users')
                        .update({
                            kakao_user_id: senderId
                        })
                        .eq('id', existingUser.id);
                    existingUser.kakao_user_id = senderId;
                }
            }
        }
        
        if (existingUser) {
            // 이름이 변경되었는지 확인
            if (existingUser.display_name !== senderName) {
                // 닉네임 변경 감지 및 로깅
                console.log('[닉네임 변경 감지]', {
                    user_id: existingUser.id,
                    kakao_user_id: existingUser.kakao_user_id,
                    old_name: existingUser.display_name,
                    new_name: senderName,
                    room: roomName
                });
                
                // 이름 변경 이력 저장
                const { error: historyError } = await db.supabase
                    .from('user_name_history')
                    .insert({
                        user_id: existingUser.id,
                        old_name: existingUser.display_name,
                        new_name: senderName,
                        changed_at: new Date().toISOString()
                    });
                
                if (historyError) {
                    console.error('[채팅 로그] 이름 변경 이력 저장 실패:', historyError.message);
                } else {
                    console.log('[닉네임 변경] 이력 저장 완료:', {
                        old_name: existingUser.display_name,
                        new_name: senderName
                    });
                    
                    // nickname_changes 테이블에도 저장 (모더레이션 로그)
                    try {
                        const moderationLogger = require('./moderationLogger');
                        moderationLogger.saveNicknameChange({
                            roomName: roomName,
                            userId: existingUser.kakao_user_id || senderId,
                            oldNickname: existingUser.display_name,
                            newNickname: senderName
                        });
                    } catch (modErr) {
                        console.error('[닉네임 변경] 모더레이션 로그 저장 실패:', modErr.message);
                    }
                }
                
                // 사용자 정보 업데이트
                const { error: updateError } = await db.supabase
                    .from('users')
                    .update({
                        display_name: senderName,
                        last_seen_at: new Date().toISOString()
                    })
                    .eq('id', existingUser.id);
                
                if (updateError) {
                    console.error('[닉네임 변경] 사용자 정보 업데이트 실패:', updateError.message);
                } else {
                    console.log('[닉네임 변경] 사용자 정보 업데이트 완료');
                }
                
                // 업데이트된 정보 반영
                existingUser.display_name = senderName;
            } else {
                // last_seen_at만 업데이트
                await db.supabase
                    .from('users')
                    .update({
                        last_seen_at: new Date().toISOString()
                    })
                    .eq('id', existingUser.id);
            }
            
            return existingUser;
        }
        
        // 새 사용자 생성
        const { data: newUser, error: createError } = await db.supabase
            .from('users')
            .insert({
                internal_user_id: internalUserId,
                kakao_user_id: senderId || null,
                display_name: senderName,
                original_name: senderName,
                last_seen_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (createError) {
            console.error('[채팅 로그] 사용자 생성 실패:', createError.message);
            return null;
        }
        
        return newUser;
    } catch (error) {
        console.error('[채팅 로그] 사용자 조회/생성 중 오류:', error.message);
        return null;
    }
}

/**
 * 채팅방 조회 또는 생성
 */
async function getOrCreateRoom(roomName, roomType = 'group') {
    try {
        // 기존 채팅방 조회
        const { data: existingRoom } = await db.supabase
            .from('rooms')
            .select('*')
            .eq('room_name', roomName)
            .single();
        
        if (existingRoom) {
            return existingRoom;
        }
        
        // 새 채팅방 생성
        const { data: newRoom, error: createError } = await db.supabase
            .from('rooms')
            .insert({
                room_name: roomName,
                room_type: roomType
            })
            .select()
            .single();
        
        if (createError) {
            console.error('[채팅 로그] 채팅방 생성 실패:', createError.message);
            return null;
        }
        
        return newRoom;
    } catch (error) {
        console.error('[채팅 로그] 채팅방 조회/생성 중 오류:', error.message);
        return null;
    }
}

/**
 * 채팅방 멤버십 확인 또는 추가
 */
async function ensureRoomMembership(roomId, userId, role = 'member') {
    try {
        // 기존 멤버십 확인
        const { data: existing } = await db.supabase
            .from('room_members')
            .select('*')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .single();
        
        if (existing) {
            // 이미 멤버이면 활성화 상태만 업데이트
            if (!existing.is_active) {
                await db.supabase
                    .from('room_members')
                    .update({
                        is_active: true,
                        left_at: null
                    })
                    .eq('id', existing.id);
            }
            return existing;
        }
        
        // 새 멤버십 생성
        const { data: newMembership, error: createError } = await db.supabase
            .from('room_members')
            .insert({
                room_id: roomId,
                user_id: userId,
                role: role
            })
            .select()
            .single();
        
        if (createError) {
            console.error('[채팅 로그] 멤버십 생성 실패:', createError.message);
            return null;
        }
        
        return newMembership;
    } catch (error) {
        console.error('[채팅 로그] 멤버십 확인/생성 중 오류:', error.message);
        return null;
    }
}

/**
 * 채팅 메시지 저장
 */
async function saveChatMessage(roomName, senderName, senderId, messageText, isGroupChat = true, metadata = null, replyToMessageId = null, threadId = null, rawSender = null, kakaoLogId = null, replyToKakaoLogId = null) {
    try {
        // 정규화된 사용자 및 채팅방 조회/생성
        const user = await getOrCreateUser(roomName, senderName, senderId);
        const room = await getOrCreateRoom(roomName, isGroupChat ? 'group' : 'direct');
        
        if (!user || !room) {
            console.error('[채팅 로그] 사용자 또는 채팅방 조회 실패');
            // 정규화 실패 시에도 기존 방식으로 저장 (하위 호환성)
        }
        
        // 멤버십 확인/생성
        if (user && room) {
            await ensureRoomMembership(room.id, user.id);
        }
        
        // 메시지 분석
        const wordCount = messageText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const charCount = messageText.length;
        const hasMention = /@\w+/.test(messageText);
        const hasUrl = /https?:\/\/[^\s]+/.test(messageText);
        const hasImage = /\.(jpg|jpeg|png|gif|webp)/i.test(messageText) || messageText.includes('📷') || messageText.includes('이미지');
        const hasFile = /\.(pdf|doc|docx|xls|xlsx|zip|rar)/i.test(messageText);
        const hasVideo = /\.(mp4|avi|mov|wmv|flv)/i.test(messageText);
        const hasLocation = /위치|location|지도/i.test(messageText);
        
        // 메시지 타입 결정
        let messageType = 'text';
        if (hasImage) messageType = 'image';
        else if (hasVideo) messageType = 'video';
        else if (hasFile) messageType = 'file';
        else if (hasLocation) messageType = 'location';
        else if (hasUrl) messageType = 'link';
        
        // room_user_key와 message_text_tsvector는 GENERATED 컬럼이므로 자동 생성됨
        // Phase 1.3: raw_sender, kakao_log_id 저장
        const finalMetadata = {
            ...metadata,
            _id: kakaoLogId || metadata?._id  // metadata에도 저장 (이중화)
        };
        
        const { data, error } = await db.supabase
            .from('chat_messages')
            .insert({
                room_id: room?.id || null,
                room_name: roomName,
                user_id: user?.id || null,
                sender_name: senderName,
                sender_id: senderId || null,
                raw_sender: rawSender || null,  // ✅ Phase 1.3: 원본 sender 문자열
                message_text: messageText,
                message_type: messageType,
                is_group_chat: isGroupChat,
                word_count: wordCount,
                char_count: charCount,
                has_mention: hasMention,
                has_url: hasUrl,
                has_image: hasImage,
                has_file: hasFile,
                has_video: hasVideo,
                has_location: hasLocation,
                reply_to_message_id: replyToMessageId || null,
                thread_id: threadId || null,
                kakao_log_id: kakaoLogId || null,  // ✅ Phase 1.3: 카카오톡 원본 logId
                metadata: finalMetadata || null
            })
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 메시지 저장 실패:', error.message);
            console.error('[채팅 로그] 저장 시도 데이터:', {
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId,
                message_text_length: messageText?.length || 0,
                message_type: messageType
            });
            return null;
        }
        
        console.log('[채팅 로그] 메시지 저장 성공:', {
            id: data?.id,
            room_name: roomName,
            sender_name: senderName,
            sender_id: senderId,
            message_text_preview: messageText?.substring(0, 50) + (messageText?.length > 50 ? '...' : ''),
            message_type: messageType
        });
        
        // 멘션 저장 (비동기)
        if (hasMention && data) {
            saveMentions(data.id, mentionedUserNames).catch(err => {
                console.error('[채팅 로그] 멘션 저장 실패:', err.message);
            });
        }
        
        // 사용자 활동 업데이트 (비동기)
        if (user && room) {
            updateUserActivity(room.id, user.id, roomName, senderName).catch(err => {
                console.error('[채팅 로그] 활동 업데이트 실패:', err.message);
            });
        }
        
        // 사용자 통계 업데이트 (비동기)
        updateUserStatistics(roomName, senderName, senderId, wordCount, charCount).catch(err => {
            console.error('[채팅 로그] 통계 업데이트 실패:', err.message);
        });
        
        // 백필 작업: reply_to_kakao_log_id가 있는데 reply_to_message_id가 null인 경우 연결 시도
        if (data && replyToKakaoLogId && !replyToMessageId) {
            backfillReplyLink(data.id, roomName, replyToKakaoLogId).catch(err => {
                console.error('[채팅 로그] 백필 작업 실패:', err.message);
            });
        }
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 메시지 저장 중 오류:', error.message);
        return null;
    }
}

/**
 * 답장 링크 백필 작업 (reply_to_kakao_log_id → reply_to_message_id)
 * 새 메시지 저장 후 호출하거나 주기적으로 호출
 * @param {number} messageId - 현재 저장된 메시지 ID
 * @param {string} roomName - 채팅방 이름
 * @param {number} replyToKakaoLogId - 답장 대상 메시지의 kakao_log_id
 */
async function backfillReplyLink(messageId, roomName, replyToKakaoLogId) {
    try {
        if (!replyToKakaoLogId || !roomName) {
            return;
        }
        
        // 안전한 숫자 파싱
        const numericLogId = safeParseInt(replyToKakaoLogId);
        if (!numericLogId) {
            return;
        }
        
        // 같은 room에서 kakao_log_id로 답장 대상 메시지 찾기
        const { data: targetMessage, error } = await db.supabase
            .from('chat_messages')
            .select('id')
            .eq('kakao_log_id', numericLogId)
            .eq('room_name', roomName)  // ✅ room scope로 제한
            .maybeSingle();  // ✅ single() 대신 maybeSingle() 사용
        
        if (error) {
            console.warn(`[백필] 답장 대상 메시지 조회 실패: ${error.message}`);
            return;
        }
        
        if (targetMessage && targetMessage.id) {
            // reply_to_message_id 업데이트
            const { error: updateError } = await db.supabase
                .from('chat_messages')
                .update({ reply_to_message_id: targetMessage.id })
                .eq('id', messageId)
                .eq('reply_to_message_id', null);  // null인 경우만 업데이트
            
            if (updateError) {
                console.warn(`[백필] 답장 링크 업데이트 실패: ${updateError.message}`);
            } else {
                console.log(`[백필] ✅ 답장 링크 연결 완료: message_id=${messageId}, reply_to_message_id=${targetMessage.id}, kakao_log_id=${numericLogId}`);
            }
        } else {
            // 아직 답장 대상 메시지가 DB에 없음 (레이스 조건)
            // 나중에 주기적 백필 작업에서 다시 시도됨
            console.log(`[백필] 답장 대상 메시지 미발견 (레이스 조건): kakao_log_id=${numericLogId}, room="${roomName}"`);
        }
    } catch (error) {
        console.error('[백필] 백필 작업 중 오류:', error.message);
    }
}

/**
 * 주기적 백필 작업: 모든 pending reply 링크를 재시도
 * 서버 시작 시 또는 주기적으로 호출 (예: 5분마다)
 */
async function backfillAllPendingReplies() {
    try {
        // reply_to_kakao_log_id는 있지만 reply_to_message_id가 null인 메시지들 찾기
        const { data: pendingMessages, error } = await db.supabase
            .from('chat_messages')
            .select('id, room_name, reply_to_kakao_log_id')
            .not('reply_to_kakao_log_id', 'is', null)
            .is('reply_to_message_id', null)
            .limit(100);  // 한 번에 최대 100개 처리
        
        if (error) {
            console.error('[백필] pending 메시지 조회 실패:', error.message);
            return;
        }
        
        if (!pendingMessages || pendingMessages.length === 0) {
            return;
        }
        
        console.log(`[백필] ${pendingMessages.length}개의 pending reply 링크 발견, 백필 시작...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const msg of pendingMessages) {
            try {
                const numericLogId = safeParseInt(msg.reply_to_kakao_log_id);
                if (!numericLogId) {
                    continue;
                }
                
                // 같은 room에서 답장 대상 메시지 찾기
                const { data: targetMessage, error: findError } = await db.supabase
                    .from('chat_messages')
                    .select('id')
                    .eq('kakao_log_id', numericLogId)
                    .eq('room_name', msg.room_name)
                    .maybeSingle();
                
                if (findError || !targetMessage) {
                    failCount++;
                    continue;
                }
                
                // reply_to_message_id 업데이트
                const { error: updateError } = await db.supabase
                    .from('chat_messages')
                    .update({ reply_to_message_id: targetMessage.id })
                    .eq('id', msg.id)
                    .eq('reply_to_message_id', null);
                
                if (updateError) {
                    failCount++;
                } else {
                    successCount++;
                }
            } catch (e) {
                failCount++;
                console.error(`[백필] 메시지 ${msg.id} 처리 중 오류:`, e.message);
            }
        }
        
        if (successCount > 0 || failCount > 0) {
            console.log(`[백필] 완료: 성공=${successCount}, 실패=${failCount}`);
        }
    } catch (error) {
        console.error('[백필] 주기적 백필 작업 중 오류:', error.message);
    }
}

/**
 * 안전한 숫자 파싱 (parseInt 위험 방지)
 * @param {any} value - 파싱할 값
 * @returns {number|null} 파싱된 숫자 또는 null
 */
function safeParseInt(value) {
    if (value === null || value === undefined) {
        return null;
    }
    
    const str = String(value).trim();
    
    // 숫자만 있는지 확인 (^[0-9]+$)
    if (!/^\d+$/.test(str)) {
        return null;
    }
    
    try {
        const num = parseInt(str, 10);
        return (num > 0) ? num : null;
    } catch (e) {
        return null;
    }
}

/**
 * 사용자 활동 업데이트
 */
async function updateUserActivity(roomId, userId, roomName, senderName) {
    try {
        const now = new Date().toISOString();
        
        // 기존 활동 기록 조회
        const { data: existing } = await db.supabase
            .from('user_activity')
            .select('*')
            .eq('user_id', userId)
            .eq('room_id', roomId)
            .single();
        
        if (existing) {
            // 업데이트
            await db.supabase
                .from('user_activity')
                .update({
                    last_seen_at: now,
                    last_message_at: now,
                    total_messages_sent: existing.total_messages_sent + 1,
                    is_active: true
                })
                .eq('id', existing.id);
        } else {
            // 새로 생성
            await db.supabase
                .from('user_activity')
                .insert({
                    user_id: userId,
                    user_name: senderName,
                    room_id: roomId,
                    room_name: roomName,
                    last_seen_at: now,
                    last_message_at: now,
                    total_messages_sent: 1,
                    is_active: true
                });
        }
    } catch (error) {
        console.error('[채팅 로그] 활동 업데이트 오류:', error.message);
    }
}

/**
 * 사용자 통계 업데이트
 */
async function updateUserStatistics(roomName, senderName, senderId, wordCount, charCount) {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // 기존 통계 조회
        const { data: existing } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', senderName)
            .eq('room_name', roomName)
            .eq('date', today)
            .single();
        
        const currentHour = new Date().getHours();
        
        if (existing) {
            // 기존 통계 업데이트
            const hourlyCount = existing.hourly_message_count || {};
            hourlyCount[currentHour] = (hourlyCount[currentHour] || 0) + 1;
            
            await db.supabase
                .from('user_statistics')
                .update({
                    message_count: existing.message_count + 1,
                    total_char_count: existing.total_char_count + charCount,
                    total_word_count: existing.total_word_count + wordCount,
                    hourly_message_count: hourlyCount,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
        } else {
            // 새 통계 생성
            const hourlyCount = {};
            hourlyCount[currentHour] = 1;
            
            await db.supabase
                .from('user_statistics')
                .insert({
                    user_name: senderName,
                    user_id: senderId || null,
                    room_name: roomName,
                    date: today,
                    message_count: 1,
                    total_char_count: charCount,
                    total_word_count: wordCount,
                    hourly_message_count: hourlyCount
                });
        }
    } catch (error) {
        console.error('[채팅 로그] 통계 업데이트 오류:', error.message);
    }
}

/**
 * 반응 저장
 * 개선: reactorName 의존 제거, reactor_user_id (또는 reactor_id) 중심으로 저장
 * @param {number} messageId - 메시지 DB id
 * @param {string} reactionType - 반응 타입 (예: 'thumbs_up', 'heart')
 * @param {string|null} reactorName - 반응자 이름 (부가정보, 없어도 저장 가능)
 * @param {string|null} reactorId - 반응자 ID (필수 권장)
 * @param {boolean} isAdminReaction - 관리자 반응 여부
 */
async function saveReaction(messageId, reactionType, reactorName, reactorId, isAdminReaction = false) {
    try {
        // reactor_id가 없으면 경고 (하지만 저장은 진행)
        if (!reactorId) {
            console.warn('[반응 저장] ⚠️ reactor_id가 없음: reactorName=', reactorName, ', messageId=', messageId);
        }
        
        // reactor_name이 없으면 null로 저장 (reactor_id로 식별)
        const finalReactorName = reactorName || null;
        
        const { data, error } = await db.supabase
            .from('chat_reactions')
            .insert({
                message_id: messageId,
                reaction_type: reactionType,
                reactor_name: finalReactorName,  // null 가능
                reactor_id: reactorId || null,  // 필수 권장, 없으면 null
                is_admin_reaction: isAdminReaction
            })
            .select()
            .single();
        
        if (error) {
            // 중복 반응인 경우 무시
            if (error.code === '23505') { // unique_violation
                if (process.env.DEBUG_REACTION === '1') {
                    console.log('[반응 저장] 중복 반응 (무시):', { messageId, reactionType, reactorName: finalReactorName, reactorId });
                }
                return null;
            }
            console.error('[채팅 로그] 반응 저장 실패:', error.message, error.code);
            return null;
        }
        
        // 반응 통계 업데이트 (비동기, reactorName이 있어도 없어도 처리)
        if (finalReactorName) {
            updateReactionStatistics(messageId, finalReactorName, isAdminReaction).catch(err => {
                console.error('[채팅 로그] 반응 통계 업데이트 실패:', err.message);
            });
        }
        
        if (process.env.DEBUG_REACTION === '1') {
            console.log('[반응 저장] ✅ 성공:', { 
                id: data.id, 
                messageId, 
                reactionType, 
                reactorName: finalReactorName, 
                reactorId 
            });
        }
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 반응 저장 중 오류:', error.message);
        return null;
    }
}

/**
 * 반응 통계 업데이트
 */
async function updateReactionStatistics(messageId, reactorName, isAdminReaction) {
    try {
        // 메시지 정보 조회
        const { data: message } = await db.supabase
            .from('chat_messages')
            .select('sender_name, sender_id, room_name, created_at')
            .eq('id', messageId)
            .single();
        
        if (!message) return;
        
        const messageDate = new Date(message.created_at).toISOString().split('T')[0];
        
        // 메시지 작성자 통계 업데이트 (받은 반응)
        const { data: senderStats } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', message.sender_name)
            .eq('room_name', message.room_name)
            .eq('date', messageDate)
            .single();
        
        if (senderStats) {
            await db.supabase
                .from('user_statistics')
                .update({
                    received_reactions_count: senderStats.received_reactions_count + 1,
                    received_admin_reactions_count: isAdminReaction 
                        ? senderStats.received_admin_reactions_count + 1 
                        : senderStats.received_admin_reactions_count,
                    updated_at: new Date().toISOString()
                })
                .eq('id', senderStats.id);
        }
        
        // 반응을 준 사용자 통계 업데이트 (준 반응)
        const { data: reactorStats } = await db.supabase
            .from('user_statistics')
            .select('*')
            .eq('user_name', reactorName)
            .eq('room_name', message.room_name)
            .eq('date', messageDate)
            .single();
        
        if (reactorStats) {
            await db.supabase
                .from('user_statistics')
                .update({
                    given_reactions_count: reactorStats.given_reactions_count + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', reactorStats.id);
        }
    } catch (error) {
        console.error('[채팅 로그] 반응 통계 업데이트 오류:', error.message);
    }
}

/**
 * 기간별 채팅 조회
 */
async function getChatMessagesByPeriod(roomName, startDate, endDate, limit = 1000) {
    try {
        const { data, error } = await db.supabase
            .from('chat_messages')
            .select('*')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .order('created_at', { ascending: true })
            .limit(limit);
        
        if (error) {
            console.error('[채팅 로그] 메시지 조회 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[채팅 로그] 메시지 조회 중 오류:', error.message);
        return [];
    }
}

/**
 * 사용자별 채팅 통계 조회
 */
async function getUserChatStatistics(roomName, startDate, endDate) {
    try {
        // startDate와 endDate를 날짜만 추출 (YYYY-MM-DD)
        const startDateOnly = new Date(startDate).toISOString().split('T')[0];
        const endDateOnly = new Date(endDate).toISOString().split('T')[0];
        
        const { data, error } = await db.supabase
            .from('user_statistics')
            .select('user_name, user_id, message_count, total_char_count, total_word_count, received_reactions_count')
            .eq('room_name', roomName)
            .gte('date', startDateOnly)
            .lte('date', endDateOnly)
            .order('message_count', { ascending: false });
        
        if (error) {
            console.error('[채팅 로그] 통계 조회 실패:', error.message);
            return [];
        }
        
        // 사용자별로 집계 (여러 날짜의 통계를 합산)
        const userStats = {};
        (data || []).forEach(stat => {
            const userName = stat.user_name || '알 수 없음';
            if (!userStats[userName]) {
                userStats[userName] = {
                    user_name: userName,
                    user_id: stat.user_id,
                    message_count: 0,
                    total_char_count: 0,
                    total_word_count: 0,
                    received_reactions_count: 0
                };
            }
            userStats[userName].message_count += stat.message_count || 0;
            userStats[userName].total_char_count += stat.total_char_count || 0;
            userStats[userName].total_word_count += stat.total_word_count || 0;
            userStats[userName].received_reactions_count += stat.received_reactions_count || 0;
        });
        
        // 배열로 변환하고 메시지 수로 정렬
        return Object.values(userStats).sort((a, b) => b.message_count - a.message_count);
    } catch (error) {
        console.error('[채팅 로그] 통계 조회 중 오류:', error.message);
        return [];
    }
}

/**
 * 키워드로 메시지 검색 (FTS 사용)
 */
async function searchMessagesByKeyword(roomName, searchQuery, limit = 100) {
    try {
        // Supabase RPC를 사용하여 함수 호출
        const { data, error } = await db.supabase
            .rpc('search_messages', {
                p_room_name: roomName,
                p_search_query: searchQuery,
                p_limit: limit
            });
        
        if (error) {
            console.error('[채팅 로그] 검색 실패:', error.message);
            return [];
        }
        
        return data || [];
    } catch (error) {
        console.error('[채팅 로그] 검색 중 오류:', error.message);
        return [];
    }
}

/**
 * 일별 통계 자동 집계
 */
async function aggregateUserStatistics(roomName, date) {
    try {
        const { data, error } = await db.supabase
            .rpc('aggregate_user_statistics', {
                p_room_name: roomName,
                p_date: date
            });
        
        if (error) {
            console.error('[채팅 로그] 통계 집계 실패:', error.message);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('[채팅 로그] 통계 집계 중 오류:', error.message);
        return false;
    }
}

/**
 * 가장 반응 많이 받은 사용자 조회
 */
async function getMostReactedUser(roomName, startDate, endDate) {
    try {
        // 먼저 기간 내 메시지 ID 목록 조회
        const { data: messages, error: msgError } = await db.supabase
            .from('chat_messages')
            .select('id, sender_name')
            .eq('room_name', roomName)
            .gte('created_at', startDate)
            .lte('created_at', endDate);
        
        if (msgError) {
            console.error('[채팅 로그] 메시지 조회 실패:', msgError.message);
            return null;
        }
        
        if (!messages || messages.length === 0) {
            return null;
        }
        
        const messageIds = messages.map(m => m.id);
        
        // 해당 메시지들의 반응 조회
        const { data: reactions, error: reactError } = await db.supabase
            .from('chat_reactions')
            .select('message_id')
            .in('message_id', messageIds);
        
        if (reactError) {
            console.error('[채팅 로그] 반응 조회 실패:', reactError.message);
            return null;
        }
        
        if (!reactions || reactions.length === 0) {
            return null;
        }
        
        // 메시지 ID -> 발신자 매핑
        const messageToSender = {};
        messages.forEach(msg => {
            messageToSender[msg.id] = msg.sender_name;
        });
        
        // 사용자별 반응 수 집계
        const userReactions = {};
        reactions.forEach(reaction => {
            const senderName = messageToSender[reaction.message_id];
            if (senderName) {
                userReactions[senderName] = (userReactions[senderName] || 0) + 1;
            }
        });
        
        // 가장 많이 받은 사용자 찾기
        let maxReactions = 0;
        let topUser = null;
        for (const [userName, count] of Object.entries(userReactions)) {
            if (count > maxReactions) {
                maxReactions = count;
                topUser = userName;
            }
        }
        
        return topUser ? { user_name: topUser, reaction_count: maxReactions } : null;
    } catch (error) {
        console.error('[채팅 로그] 반응 통계 조회 중 오류:', error.message);
        return null;
    }
}

/**
 * 메시지 수정 저장
 */
async function saveMessageEdit(messageId, editedText, editedByUserId = null, editReason = null) {
    try {
        // 원본 메시지 조회
        const { data: message } = await db.supabase
            .from('chat_messages')
            .select('message_text, edit_count')
            .eq('id', messageId)
            .single();
        
        if (!message) {
            console.error('[채팅 로그] 메시지를 찾을 수 없음:', messageId);
            return null;
        }
        
        // 수정 이력 저장
        await db.supabase
            .from('message_edits')
            .insert({
                message_id: messageId,
                edited_by_user_id: editedByUserId,
                original_text: message.message_text,
                edited_text: editedText,
                edit_reason: editReason
            });
        
        // 메시지 업데이트
        const { data: updated, error } = await db.supabase
            .from('chat_messages')
            .update({
                message_text: editedText,
                is_edited: true,
                edited_at: new Date().toISOString(),
                edit_count: (message.edit_count || 0) + 1,
                original_message_text: message.original_message_text || message.message_text
            })
            .eq('id', messageId)
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 메시지 수정 실패:', error.message);
            return null;
        }
        
        return updated;
    } catch (error) {
        console.error('[채팅 로그] 메시지 수정 중 오류:', error.message);
        return null;
    }
}

/**
 * 메시지 삭제 저장
 */
async function saveMessageDeletion(messageId, deletedByUserId = null, deletionReason = null, deletionType = 'user') {
    try {
        // 삭제 이력 저장
        await db.supabase
            .from('message_deletions')
            .insert({
                message_id: messageId,
                deleted_by_user_id: deletedByUserId,
                deletion_reason: deletionReason,
                deletion_type: deletionType
            });
        
        // 메시지 업데이트
        const { data: updated, error } = await db.supabase
            .from('chat_messages')
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by_user_id: deletedByUserId
            })
            .eq('id', messageId)
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 메시지 삭제 실패:', error.message);
            return null;
        }
        
        return updated;
    } catch (error) {
        console.error('[채팅 로그] 메시지 삭제 중 오류:', error.message);
        return null;
    }
}

/**
 * 멘션 저장
 */
async function saveMentions(messageId, mentionedUserNames, mentionedUserIds = []) {
    try {
        const mentions = [];
        
        for (let i = 0; i < mentionedUserNames.length; i++) {
            const userName = mentionedUserNames[i];
            const userId = mentionedUserIds[i] || null;
            
            // 사용자 조회
            let user = null;
            if (userId) {
                const { data } = await db.supabase
                    .from('users')
                    .select('id')
                    .eq('kakao_user_id', userId)
                    .single();
                user = data;
            }
            
            mentions.push({
                message_id: messageId,
                mentioned_user_id: user?.id || null,
                mentioned_user_name: userName,
                mention_type: userName === 'all' || userName === 'here' ? userName : 'direct'
            });
        }
        
        if (mentions.length > 0) {
            const { error } = await db.supabase
                .from('message_mentions')
                .insert(mentions);
            
            if (error) {
                console.error('[채팅 로그] 멘션 저장 실패:', error.message);
            }
        }
    } catch (error) {
        console.error('[채팅 로그] 멘션 저장 중 오류:', error.message);
    }
}

/**
 * 첨부 파일 정보 저장
 */
async function saveAttachment(messageId, attachmentType, attachmentUrl, attachmentName = null, attachmentSize = null, mimeType = null, thumbnailUrl = null, metadata = null) {
    try {
        const { data, error } = await db.supabase
            .from('message_attachments')
            .insert({
                message_id: messageId,
                attachment_type: attachmentType,
                attachment_url: attachmentUrl,
                attachment_name: attachmentName,
                attachment_size: attachmentSize,
                mime_type: mimeType,
                thumbnail_url: thumbnailUrl,
                metadata: metadata
            })
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 첨부 파일 저장 실패:', error.message);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 첨부 파일 저장 중 오류:', error.message);
        return null;
    }
}

/**
 * 닉네임 변경 감지 및 알림
 */
async function checkNicknameChange(roomName, senderName, senderId) {
    try {
        if (!senderId) {
            // senderId가 없으면 비교 불가
            return null;
        }
        
        // senderId로 기존 사용자 조회
        const { data: existingUser } = await db.supabase
            .from('users')
            .select('id, display_name, kakao_user_id')
            .eq('kakao_user_id', senderId)
            .single();
        
        if (!existingUser) {
            // 새 사용자이므로 변경 없음
            return null;
        }
        
        // 현재 display_name과 비교
        if (existingUser.display_name === senderName) {
            // 이름이 같으면 변경 없음
            console.log('[닉네임 변경] 변경 없음:', {
                user_id: existingUser.id,
                kakao_user_id: senderId,
                display_name: existingUser.display_name,
                current_sender_name: senderName
            });
            return null;
        }
        
        // 이름이 변경된 경우
        console.log('[닉네임 변경] ✅ 변경 감지:', {
            user_id: existingUser.id,
            kakao_user_id: senderId,
            old_name: existingUser.display_name,
            new_name: senderName,
            room_name: roomName
        });
        
        // 이름 변경 이력 저장 (getOrCreateUser에서도 저장되지만, 여기서도 명시적으로 저장)
        const { error: historyError } = await db.supabase
            .from('user_name_history')
            .insert({
                user_id: existingUser.id,
                old_name: existingUser.display_name,
                new_name: senderName,
                changed_at: new Date().toISOString()
            });
        
        if (historyError) {
            console.error('[닉네임 변경] 이력 저장 실패:', historyError.message);
        }
        
        // 전체 변경 이력 조회
        const { data: allHistory } = await db.supabase
            .from('user_name_history')
            .select('*')
            .eq('user_id', existingUser.id)
            .order('changed_at', { ascending: true });
        
        if (allHistory && allHistory.length > 0) {
            // 변경 이력 메시지 생성
            const historyLines = allHistory.map(h => {
                const date = new Date(h.changed_at).toISOString().split('T')[0];
                return `\t- ${date} : ${h.old_name} → ${h.new_name}`;
            });
            
            // 현재 변경도 추가
            const currentDate = new Date().toISOString().split('T')[0];
            historyLines.push(`\t- ${currentDate} : ${existingUser.display_name} → ${senderName}`);
            
            const notification = `🚨 닉네임 변경 감지!\n\n닉네임 변경 되셨습니다. 닉네임변경이력 채팅로그에 변경이력 기록\n\n[닉네임 변경 이력]\n${historyLines.join('\n')}`;
            return notification;
        } else {
            // 이력이 없으면 간단한 메시지
            const notification = `🚨 닉네임 변경 감지!\n\n닉네임 변경 되셨습니다. 닉네임변경이력 채팅로그에 변경이력 기록\n\n${existingUser.display_name} → ${senderName}`;
            return notification;
        }
    } catch (error) {
        console.error('[채팅 로그] 닉네임 변경 감지 중 오류:', error.message);
        return null;
    }
}

/**
 * 신고 저장
 */
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general') {
    try {
        console.log(`[신고] saveReport 시작: messageId=${reportedMessageId}, reporter=${reporterName}`);
        
        // 신고 대상 메시지 조회 (Phase 3: kakao_log_id 기준 통일)
        // reportedMessageId는 kakao_log_id (카카오톡 원본 logId)를 의미
        let message = null;
        
        // 1. kakao_log_id로 직접 검색 (우선) - Phase 3
        if (reportedMessageId) {
            console.log(`[신고] 1. kakao_log_id로 검색: ${reportedMessageId}`);
            const numericLogId = parseInt(reportedMessageId);
            if (!isNaN(numericLogId)) {
                const { data: messageByLogId, error: err1 } = await db.supabase
            .from('chat_messages')
                    .select('*')
                    .eq('kakao_log_id', numericLogId)
            .single();
        
                if (messageByLogId) {
                    message = messageByLogId;
                    console.log(`[신고] ✅ kakao_log_id로 찾음: id=${message.id}, kakao_log_id=${message.kakao_log_id}`);
        } else {
                    console.log(`[신고] 1 실패: ${err1?.message || 'not found'}`);
                }
            }
        }
        
        // 2. fallback: metadata._id로 검색
        if (!message && reportedMessageId) {
            console.log(`[신고] 2. metadata._id로 검색: ${reportedMessageId}`);
            const { data: messageByMetadata, error: err2 } = await db.supabase
                .from('chat_messages')
                .select('*')
                .eq('metadata->>_id', String(reportedMessageId))
                .single();
            
            if (messageByMetadata) {
                message = messageByMetadata;
                console.log(`[신고] ✅ metadata._id로 찾음: id=${message.id}`);
            } else {
                console.log(`[신고] 2 실패: ${err2?.message || 'not found'}`);
            }
        }
        
        // 3. fallback: DB id로 검색 (숫자인 경우)
        if (!message && reportedMessageId && /^\d+$/.test(String(reportedMessageId))) {
            console.log(`[신고] 3. DB id로 검색: ${reportedMessageId}`);
            const { data: messageById, error: err3 } = await db.supabase
                        .from('chat_messages')
                .select('*')
                .eq('id', parseInt(reportedMessageId))
                        .single();
                    
            if (messageById) {
                message = messageById;
                console.log(`[신고] ✅ DB id로 찾음: id=${message.id}`);
            } else {
                console.log(`[신고] 3 실패: ${err3?.message || 'not found'}`);
            }
        }
        
        // 메시지를 찾지 못한 경우에도 신고 기록은 저장 (메시지 정보 없이)
        if (!message) {
            console.warn('[신고] 대상 메시지를 찾을 수 없음, 기본 정보로 신고 저장:', reportedMessageId);
            
            // 메시지 없이도 신고 저장 시도 (report_logs 테이블 사용)
            try {
                const moderationLogger = require('./moderationLogger');
                const result = await moderationLogger.saveReportLog({
                    roomName: '',  // 알 수 없음
                    reporterName: reporterName,
                    reporterId: reporterId,
                    reportedMessageId: String(reportedMessageId),
                    reportedMessageText: null,
                    reportedUserName: null,
                    reportedUserId: null,
                    reportReason: reportReason,
                    reportType: reportType
                });
                
                if (result) {
                    console.log('[신고] report_logs에 저장 성공 (메시지 정보 없음):', result.id);
                    return result;
                }
            } catch (modErr) {
                console.error('[신고] report_logs 저장 실패:', modErr.message);
            }
            
            return null;
        }
        
        // 신고자 사용자 조회/생성
        const reporterUser = await getOrCreateUser(message.room_name, reporterName, reporterId);
        
        // 피신고자 사용자 조회
        const reportedUser = message.user_id 
            ? await db.supabase
                .from('users')
                .select('id, display_name')
                .eq('id', message.user_id)
                .single()
            : null;
        
        // 피신고자 사용자 조회
        let reportedUserId = null;
        let reportedUserName = message.sender_name;
        
        if (message.user_id) {
            const { data: reportedUser } = await db.supabase
                .from('users')
                .select('id, display_name')
                .eq('id', message.user_id)
                .single();
            
            if (reportedUser) {
                reportedUserId = reportedUser.id;
                reportedUserName = reportedUser.display_name;
            }
        }
        
        // 신고 정보 저장
        const { data, error } = await db.supabase
            .from('reports')
            .insert({
                reported_message_id: reportedMessageId,
                reporter_user_id: reporterUser?.id || null,
                reporter_name: reporterName,
                reported_user_id: reportedUserId,
                reported_user_name: reportedUserName,
                original_message_text: message.message_text,
                original_message_time: message.created_at,
                report_reason: reportReason,
                report_type: reportType,
                status: 'pending'
            })
            .select()
            .single();
        
        if (error) {
            console.error('[채팅 로그] 신고 저장 실패:', error.message);
            return null;
        }
        
        // 로그 출력 (디버깅용)
        console.log('[신고 저장 완료]', {
            report_id: data.id,
            reported_message_id: reportedMessageId,
            reporter: reporterName,
            reported_user: message.sender_name,
            original_message: message.message_text.substring(0, 50) + '...',
            report_reason: reportReason
        });
        
        return data;
    } catch (error) {
        console.error('[채팅 로그] 신고 저장 중 오류:', error.message);
        return null;
    }
}

// 주기적 백필 작업 시작 (5분마다)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        backfillAllPendingReplies().catch(err => {
            console.error('[백필] 주기적 백필 작업 오류:', err.message);
        });
    }, 5 * 60 * 1000);  // 5분마다
}

module.exports = {
    getOrCreateUser,
    getOrCreateRoom,
    ensureRoomMembership,
    saveChatMessage,
    saveReaction,
    saveMessageEdit,
    saveMessageDeletion,
    saveMentions,
    saveAttachment,
    checkNicknameChange,
    saveReport,
    getChatMessagesByPeriod,
    getUserChatStatistics,
    getMostReactedUser,
    searchMessagesByKeyword,
    aggregateUserStatistics,
    backfillReplyLink,
    backfillAllPendingReplies
};

