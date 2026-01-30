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
                    
                    // 닉네임 변경 안내 메시지 생성 및 반환
                    const notification = `📝 닉네임이 변경되었습니다.\n\n` +
                        `이전: ${existingUser.display_name}\n` +
                        `현재: ${senderName}\n\n` +
                        `변경 이력은 채팅 로그에 기록되었습니다.`;
                    
                    // 전역 함수를 통해 메시지 전송
                    if (typeof global.sendNicknameChangeNotification === 'function') {
                        global.sendNicknameChangeNotification(roomName, notification);
                        console.log('[닉네임 변경] ✅ 안내 메시지 전송 완료');
                    } else {
                        // 전역 함수가 없으면 메시지를 저장하여 나중에 전송
                        if (!global.pendingNicknameNotifications) {
                            global.pendingNicknameNotifications = [];
                        }
                        global.pendingNicknameNotifications.push({
                            roomName: roomName,
                            message: notification
                        });
                        console.log('[닉네임 변경] ⚠️ 전역 함수 없음, 대기 목록에 추가');
                    }
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
        // ⚠️ 중요: 함수 호출 시작 로그
        console.log(`[채팅 로그] ⚠️⚠️⚠️ saveChatMessage 호출: roomName="${roomName}", senderName="${senderName}", senderId="${senderId}", messageText_length=${messageText?.length || 0}, kakaoLogId=${kakaoLogId || 'N/A'}`);
        
        // 정규화된 사용자 및 채팅방 조회/생성
        const user = await getOrCreateUser(roomName, senderName, senderId);
        const room = await getOrCreateRoom(roomName, isGroupChat ? 'group' : 'direct');
        
        console.log(`[채팅 로그] ⚠️⚠️⚠️ 사용자/채팅방 조회 결과: user=${user ? `id=${user.id}` : 'null'}, room=${room ? `id=${room.id}` : 'null'}`);
        
        if (!user || !room) {
            console.error(`[채팅 로그] ❌❌❌ 사용자 또는 채팅방 조회 실패: user=${!!user}, room=${!!room}`);
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
        
        // ⚠️ 중요: 답장 메시지인 경우 원문 내용 조회 및 저장
        let replyToMessageText = null;
        let replyToSenderName = null;
        if (replyToMessageId || replyToKakaoLogId) {
            try {
                let targetMessage = null;
                
                // 1순위: reply_to_message_id로 조회
                if (replyToMessageId) {
                    const { data: msgById } = await db.supabase
                        .from('chat_messages')
                        .select('message_text, sender_name')
                        .eq('id', replyToMessageId)
                        .eq('room_name', roomName)
                        .maybeSingle();
                    
                    if (msgById) {
                        targetMessage = msgById;
                    }
                }
                
                // 2순위: reply_to_kakao_log_id로 조회 (metadata에서 조회)
                if (!targetMessage && replyToKakaoLogId) {
                    const numericLogId = parseInt(replyToKakaoLogId);
                    if (!isNaN(numericLogId)) {
                        const { data: msgByLogId } = await db.supabase
                            .from('chat_messages')
                            .select('message_text, sender_name')
                            .eq('metadata->>kakao_log_id', String(numericLogId))  // ✅ metadata에서 kakao_log_id 조회
                            .eq('room_name', roomName)
                            .maybeSingle();
                        
                        if (msgByLogId) {
                            targetMessage = msgByLogId;
                        }
                    }
                }
                
                if (targetMessage) {
                    replyToMessageText = targetMessage.message_text;
                    replyToSenderName = targetMessage.sender_name;
                    console.log(`[채팅 로그] ✅ 답장 원문 내용 조회 성공: 원문 길이=${replyToMessageText?.length || 0}, 원문 발신자="${replyToSenderName}"`);
                } else {
                    console.log(`[채팅 로그] ⚠️ 답장 원문 내용 조회 실패: reply_to_message_id=${replyToMessageId}, reply_to_kakao_log_id=${replyToKakaoLogId}`);
                }
            } catch (err) {
                console.error(`[채팅 로그] 답장 원문 내용 조회 오류:`, err.message);
            }
        }
        
        // ⚠️ 중요: finalMetadata에 kakao_log_id, reply_to_kakao_log_id, raw_sender 저장
        // (DB 스키마에 이 컬럼들이 없으므로 metadata에 저장)
        if (kakaoLogId) {
            if (!finalMetadata) finalMetadata = {};
            finalMetadata.kakao_log_id = kakaoLogId;
        }
        if (replyToKakaoLogId) {
            if (!finalMetadata) finalMetadata = {};
            finalMetadata.reply_to_kakao_log_id = replyToKakaoLogId;
        }
        if (rawSender) {
            if (!finalMetadata) finalMetadata = {};
            finalMetadata.raw_sender = rawSender;
        }
        
        // insert 데이터 구성 (chat_id는 조건부로 포함)
        // ⚠️ 중요: DB 스키마에 없는 컬럼(raw_sender, kakao_log_id, reply_to_kakao_log_id)은 metadata에 저장
        const insertData = {
            room_id: room?.id || null,
            room_name: roomName,
            user_id: user?.id || null,
            sender_name: senderName,
            sender_id: senderId || null,
            // raw_sender: rawSender || null,  // ❌ DB 스키마에 없음 → metadata에 저장
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
            reply_to_message_id: replyToMessageId || null,  // DB id (FK, 백필 가능)
            // reply_to_kakao_log_id: replyToKakaoLogId || null,  // ❌ DB 스키마에 없음 → metadata에 저장
            thread_id: threadId || null,
            // kakao_log_id: kakaoLogId || null,  // ❌ DB 스키마에 없음 → metadata에 저장
            metadata: finalMetadata || null
        };
        
        // ⚠️ 중요: 답장 메시지인 경우 원문 내용을 metadata에 저장
        // (스키마에 reply_to_message_text 컬럼이 없으므로 metadata에 저장)
        if (replyToMessageText) {
            if (!insertData.metadata) {
                insertData.metadata = {};
            }
            insertData.metadata.reply_to_message_text = replyToMessageText;
            insertData.metadata.reply_to_sender_name = replyToSenderName;
            console.log(`[채팅 로그] ✅ 답장 원문 내용 metadata에 저장: 원문 길이=${replyToMessageText.length}`);
        }
        
        // chat_id 추가 (metadata에서 추출, 있으면만 추가)
        // ⚠️ 중요: chat_id 컬럼이 DB에 없으면 에러 발생하므로, 주석 처리하여 안전하게 처리
        // chat_id는 metadata에만 저장하고 별도 컬럼으로는 저장하지 않음
        // const chatIdValue = metadata?.chat_id || metadata?._chat_id;
        // if (chatIdValue) {
        //     // 숫자로 변환 시도
        //     const chatIdNum = typeof chatIdValue === 'string' ? parseInt(chatIdValue, 10) : chatIdValue;
        //     if (!isNaN(chatIdNum) && chatIdNum > 0) {
        //         insertData.chat_id = chatIdNum;
        //     }
        // }
        
        // ⚠️ 중요: 저장 시도 전 로그
        console.log(`[채팅 로그] ⚠️⚠️⚠️ 메시지 저장 시도 시작: kakao_log_id=${kakaoLogId || 'N/A'}, room="${roomName}", sender="${senderName}", message_length=${messageText?.length || 0}`);
        console.log(`[채팅 로그] ⚠️⚠️⚠️ insertData 구조:`, JSON.stringify(insertData, null, 2).substring(0, 1000));
        
        const { data, error } = await db.supabase
            .from('chat_messages')
            .insert(insertData)
            .select()
            .single();
        
        if (error) {
            console.error(`[채팅 로그] ❌❌❌ 메시지 저장 실패: kakao_log_id=${kakaoLogId || 'N/A'}, room="${roomName}", sender="${senderName}"`);
            console.error(`[채팅 로그] ❌❌❌ 에러 메시지: ${error.message}`);
            console.error(`[채팅 로그] ❌❌❌ 에러 상세:`, error);
            console.error('[채팅 로그] 저장 시도 데이터:', {
                room_name: roomName,
                sender_name: senderName,
                sender_id: senderId,
                message_text_length: messageText?.length || 0,
                message_type: messageType,
                kakao_log_id: kakaoLogId,
                insertData_keys: Object.keys(insertData)
            });
            return null;
        }
        
        console.log('[채팅 로그] 메시지 저장 성공:', {
            id: data?.id,
            room_name: roomName,
            sender_name: senderName,
            sender_id: senderId,
            message_text_preview: messageText?.substring(0, 50) + (messageText?.length > 50 ? '...' : ''),
            message_type: messageType,
            reply_to_message_id: replyToMessageId,
            reply_to_kakao_log_id: replyToKakaoLogId,
            kakao_log_id: kakaoLogId
        });
        
        // reply_to_kakao_log_id 저장 확인
        if (replyToKakaoLogId) {
            console.log(`[채팅 로그] ✅ reply_to_kakao_log_id 저장: ${replyToKakaoLogId}`);
        }
        
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
        console.log(`[백필] ⚠️⚠️⚠️ 백필 시작: messageId=${messageId}, roomName="${roomName}", replyToKakaoLogId=${replyToKakaoLogId}`);
        
        if (!replyToKakaoLogId || !roomName) {
            console.warn(`[백필] ⚠️ 파라미터 누락: replyToKakaoLogId=${replyToKakaoLogId}, roomName="${roomName}"`);
            return;
        }
        
        // 안전한 숫자 파싱
        const numericLogId = safeParseInt(replyToKakaoLogId);
        if (!numericLogId) {
            console.warn(`[백필] ⚠️ 숫자 파싱 실패: replyToKakaoLogId=${replyToKakaoLogId}`);
            return;
        }
        
        // 1순위: 같은 room에서 metadata.kakao_log_id로 답장 대상 메시지 찾기
        // ⚠️ 중요: DB 스키마에 kakao_log_id 컬럼이 없으므로 metadata에서 조회
        let { data: targetMessage, error } = await db.supabase
            .from('chat_messages')
            .select('id')
            .eq('room_name', roomName)  // ✅ room scope로 제한
            .eq('metadata->>kakao_log_id', String(numericLogId))  // ✅ metadata에서 kakao_log_id 조회
            .maybeSingle();  // ✅ single() 대신 maybeSingle() 사용
        
        if (error) {
            console.warn(`[백필] 답장 대상 메시지 조회 실패: ${error.message}`);
            return;
        }
        
        // 2순위: metadata.kakao_log_id로 찾지 못한 경우, 답장 메시지의 생성 시간을 고려해서 가장 가까운 메시지 찾기
        if (!targetMessage || !targetMessage.id) {
            console.log(`[백필] ⚠️ metadata.kakao_log_id로 찾지 못함, 시간대 기반 검색 시도: kakao_log_id=${numericLogId}, room="${roomName}"`);
            
            // 답장 메시지의 생성 시간 가져오기
            const { data: replyMessage, error: replyError } = await db.supabase
                .from('chat_messages')
                .select('created_at')
                .eq('id', messageId)
                .single();
            
            if (replyError || !replyMessage) {
                console.warn(`[백필] 답장 메시지 조회 실패: ${replyError?.message || 'not found'}`);
                return;
            }
            
            // 답장 메시지보다 이전에 생성된 메시지 중에서 가장 가까운 메시지 찾기
            // (답장은 보통 원문 메시지 직후에 생성되므로, 최근 10개 메시지 중에서 찾기)
            const { data: recentMessages, error: recentError } = await db.supabase
                .from('chat_messages')
                .select('id, created_at, metadata')
                .eq('room_name', roomName)
                .lt('created_at', replyMessage.created_at)  // 답장 메시지보다 이전
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (recentError) {
                console.warn(`[백필] 최근 메시지 조회 실패: ${recentError.message}`);
                return;
            }
            
            if (recentMessages && recentMessages.length > 0) {
                // 가장 가까운 메시지를 원문으로 간주 (답장은 보통 원문 직후에 생성됨)
                targetMessage = { id: recentMessages[0].id };
                console.log(`[백필] ⚠️ 시간대 기반 검색으로 원문 메시지 찾음: message_id=${targetMessage.id}, kakao_log_id=${recentMessages[0].metadata?.kakao_log_id || recentMessages[0].metadata?._id || 'N/A'}`);
                console.log(`[백필] ⚠️⚠️⚠️ targetMessage 확인: id=${targetMessage.id}, 타입=${typeof targetMessage.id}`);
            } else {
                console.log(`[백필] 답장 대상 메시지 미발견 (레이스 조건): kakao_log_id=${numericLogId}, room="${roomName}"`);
                return;
            }
        }
        
        console.log(`[백필] ⚠️⚠️⚠️ 업데이트 전 확인: targetMessage=${targetMessage ? JSON.stringify(targetMessage) : 'null'}, messageId=${messageId}`);
        
        if (!targetMessage) {
            console.warn(`[백필] ⚠️ targetMessage가 null입니다. messageId=${messageId}`);
            return;
        }
        
        if (!targetMessage.id) {
            console.warn(`[백필] ⚠️ targetMessage.id가 없습니다. targetMessage=${JSON.stringify(targetMessage)}, messageId=${messageId}`);
            return;
        }
        
        try {
            console.log(`[백필] ⚠️⚠️⚠️ 업데이트 시작: messageId=${messageId}, targetMessageId=${targetMessage.id}`);
            
            // reply_to_message_id 업데이트
            // ⚠️ 중요: Supabase에서 null 비교는 .is()를 사용해야 함
            const { data: updateData, error: updateError } = await db.supabase
                .from('chat_messages')
                .update({ reply_to_message_id: targetMessage.id })
                .eq('id', messageId)
                .is('reply_to_message_id', null)  // null인 경우만 업데이트 (eq 대신 is 사용)
                .select('id, reply_to_message_id');  // 업데이트 결과 확인용
            
            console.log(`[백필] ⚠️⚠️⚠️ 업데이트 결과: updateError=${updateError ? updateError.message : 'null'}, updateData=${updateData ? JSON.stringify(updateData) : 'null'}, updateData.length=${updateData ? updateData.length : 0}`);
            
            if (updateError) {
                console.warn(`[백필] 답장 링크 업데이트 실패: ${updateError.message}`);
            } else if (updateData && updateData.length > 0) {
                console.log(`[백필] ✅ 답장 링크 연결 완료: message_id=${messageId}, reply_to_message_id=${targetMessage.id}, kakao_log_id=${numericLogId}`);
            } else {
                // 이미 업데이트되었거나 조건에 맞지 않는 경우
                console.log(`[백필] ⚠️ 업데이트 결과가 비어있음, 현재 상태 확인 중...`);
                const { data: checkData, error: checkError } = await db.supabase
                    .from('chat_messages')
                    .select('id, reply_to_message_id')
                    .eq('id', messageId)
                    .single();
                
                if (checkError) {
                    console.warn(`[백필] ⚠️ 상태 확인 실패: ${checkError.message}`);
                } else if (checkData && checkData.reply_to_message_id) {
                    console.log(`[백필] ⚠️ 이미 연결됨: message_id=${messageId}, reply_to_message_id=${checkData.reply_to_message_id}`);
                } else {
                    console.warn(`[백필] ⚠️ 업데이트 실패: message_id=${messageId}, 영향받은 행=0개, 현재 reply_to_message_id=${checkData?.reply_to_message_id || 'null'}`);
                }
            }
        } catch (updateException) {
            console.error(`[백필] ⚠️ 업데이트 중 예외 발생: ${updateException.message}`);
            console.error(`[백필] 스택: ${updateException.stack}`);
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
        // ⚠️ 중요: reply_to_kakao_log_id는 metadata에 저장되므로 metadata를 포함해서 조회
        const { data: allMessages, error } = await db.supabase
            .from('chat_messages')
            .select('id, room_name, metadata, reply_to_message_id')
            .is('reply_to_message_id', null)
            .limit(200);  // 더 많이 조회해서 필터링
        
        if (error) {
            console.error('[백필] pending 메시지 조회 실패:', error.message);
            return;
        }
        
        // metadata에 reply_to_kakao_log_id가 있는 메시지만 필터링
        const pendingMessages = (allMessages || []).filter(msg => {
            const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id;
            return replyToKakaoLogId != null;
        }).slice(0, 100);  // 최대 100개 처리
        
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
                // ⚠️ 중요: reply_to_kakao_log_id는 metadata에 저장됨
                const replyToKakaoLogId = msg.metadata?.reply_to_kakao_log_id;
                const numericLogId = safeParseInt(replyToKakaoLogId);
                if (!numericLogId) {
                    continue;
                }
                
                // 1순위: 같은 room에서 metadata.kakao_log_id로 답장 대상 메시지 찾기
                let { data: targetMessage, error: findError } = await db.supabase
                    .from('chat_messages')
                    .select('id')
                    .eq('metadata->>kakao_log_id', String(numericLogId))  // ✅ metadata에서 kakao_log_id 조회
                    .eq('room_name', msg.room_name)
                    .maybeSingle();
                
                // 2순위: metadata.kakao_log_id로 찾지 못한 경우, 시간대 기반 검색
                if (findError || !targetMessage) {
                    // 답장 메시지의 생성 시간 가져오기
                    const { data: replyMessage, error: replyError } = await db.supabase
                        .from('chat_messages')
                        .select('created_at')
                        .eq('id', msg.id)
                        .single();
                    
                    if (!replyError && replyMessage) {
                        // 답장 메시지보다 이전에 생성된 메시지 중에서 가장 가까운 메시지 찾기
                        const { data: recentMessages, error: recentError } = await db.supabase
                            .from('chat_messages')
                            .select('id, created_at, metadata')
                            .eq('room_name', msg.room_name)
                            .lt('created_at', replyMessage.created_at)  // 답장 메시지보다 이전
                            .order('created_at', { ascending: false })
                            .limit(10);
                        
                        if (!recentError && recentMessages && recentMessages.length > 0) {
                            // 가장 가까운 메시지를 원문으로 간주
                            targetMessage = { id: recentMessages[0].id };
                            findError = null;
                            console.log(`[백필] ⚠️ 시간대 기반 검색으로 원문 메시지 찾음: message_id=${targetMessage.id}, reply_message_id=${msg.id}`);
                        }
                    }
                }
                
                if (findError || !targetMessage) {
                    failCount++;
                    continue;
                }
                
                // reply_to_message_id 업데이트
                // ⚠️ 중요: Supabase에서 null 비교는 .is()를 사용해야 함
                const { error: updateError } = await db.supabase
                    .from('chat_messages')
                    .update({ reply_to_message_id: targetMessage.id })
                    .eq('id', msg.id)
                    .is('reply_to_message_id', null);  // null인 경우만 업데이트 (eq 대신 is 사용)
                
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
    console.log(`[반응 저장] ========== saveReaction 호출 시작 ==========`);
    console.log(`[반응 저장] [1단계] 파라미터 확인:`);
    console.log(`  - messageId: ${messageId} (type: ${typeof messageId})`);
    console.log(`  - reactionType: ${reactionType}`);
    console.log(`  - reactorName: ${reactorName || 'null'}`);
    console.log(`  - reactorId: ${reactorId || 'null'}`);
    console.log(`  - isAdminReaction: ${isAdminReaction}`);
    
    try {
        // reactor_id가 없으면 경고 (하지만 저장은 진행)
        if (!reactorId) {
            console.warn('[반응 저장] [1-1] ⚠️ reactor_id가 없음: reactorName=', reactorName, ', messageId=', messageId);
        }
        
        // reactor_name이 없으면 null로 저장 (reactor_id로 식별)
        const finalReactorName = reactorName || null;
        console.log(`[반응 저장] [1-2] 최종 reactorName: ${finalReactorName || 'null'}`);
        
        // 저장할 데이터 구성
        const insertData = {
            message_id: messageId,
            reaction_type: reactionType,
            reactor_name: finalReactorName,  // null 가능
            reactor_id: reactorId || null,  // 필수 권장, 없으면 null
            is_admin_reaction: isAdminReaction
        };
        
        console.log(`[반응 저장] [2단계] DB INSERT 시작:`, JSON.stringify(insertData, null, 2));
        
        const { data, error } = await db.supabase
            .from('chat_reactions')
            .insert(insertData)
            .select()
            .single();
        
        console.log(`[반응 저장] [2단계] DB INSERT 완료`);
        
        if (error) {
            console.error(`[반응 저장] [2단계] ❌ DB INSERT 오류 발생:`);
            console.error(`  - error.code: ${error.code}`);
            console.error(`  - error.message: ${error.message}`);
            console.error(`  - error.details: ${error.details || 'N/A'}`);
            console.error(`  - error.hint: ${error.hint || 'N/A'}`);
            
            // 중복 반응인 경우 무시
            if (error.code === '23505') { // unique_violation
                console.log(`[반응 저장] [2단계] ⚠️ 중복 반응 감지 (unique_violation)`);
                if (process.env.DEBUG_REACTION === '1') {
                    console.log('[반응 저장] 중복 반응 (무시):', { messageId, reactionType, reactorName: finalReactorName, reactorId });
                }
                return null;
            }
            
            console.error('[채팅 로그] 반응 저장 실패:', error.message, error.code);
            return null;
        }
        
        if (!data) {
            console.error(`[반응 저장] [2단계] ❌ DB INSERT 성공했지만 data가 null`);
            return null;
        }
        
        console.log(`[반응 저장] [2단계] ✅ DB INSERT 성공: id=${data.id}`);
        
        // 반응 통계 업데이트 (비동기, reactorName이 있어도 없어도 처리)
        if (finalReactorName) {
            console.log(`[반응 저장] [3단계] 통계 업데이트 시작 (비동기)`);
            updateReactionStatistics(messageId, finalReactorName, isAdminReaction).catch(err => {
                console.error('[반응 저장] [3단계] ❌ 통계 업데이트 실패:', err.message);
                console.error('[채팅 로그] 반응 통계 업데이트 실패:', err.message);
            });
        } else {
            console.log(`[반응 저장] [3단계] 통계 업데이트 스킵 (reactorName 없음)`);
        }
        
        // 반응 저장 성공 로그 (항상 출력)
        console.log('[반응 저장] ✅ 성공:', { 
            id: data.id, 
            messageId, 
            reactionType, 
            reactorName: finalReactorName, 
            reactorId 
        });
        console.log(`[반응 저장] ========== saveReaction 완료 ==========`);
        
        return data;
    } catch (error) {
        console.error(`[반응 저장] ========== 예외 발생 ==========`);
        console.error('[반응 저장] 예외 메시지:', error.message);
        console.error('[반응 저장] 예외 스택:', error.stack);
        console.error('[반응 저장] 예외 상세:', JSON.stringify({
            message: error.message,
            stack: error.stack,
            name: error.name
        }, null, 2));
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
        
        // 깔끔한 닉네임 변경 안내 메시지 생성
        const notification = `📝 닉네임이 변경되었습니다.\n\n` +
            `이전: ${existingUser.display_name}\n` +
            `현재: ${senderName}\n\n` +
            `변경 이력은 채팅 로그에 기록되었습니다.`;
        
        return notification;
    } catch (error) {
        console.error('[채팅 로그] 닉네임 변경 감지 중 오류:', error.message);
        return null;
    }
}

/**
 * 신고 저장
 */
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general', roomName = null) {
    try {
        console.log(`[신고] saveReport 시작: messageId=${reportedMessageId}, reporter=${reporterName}, room=${roomName || 'N/A'}`);
        
        // 신고 대상 메시지 조회 (개선: DB id와 kakao_log_id 모두 지원)
        // reportedMessageId는 DB id 또는 kakao_log_id일 수 있음
        let message = null;
        
        // 1. DB id로 직접 검색 (우선) - 숫자이고 작은 값이면 DB id일 가능성
        if (reportedMessageId && /^\d+$/.test(String(reportedMessageId))) {
            const numericId = parseInt(reportedMessageId);
            // DB id는 보통 작은 숫자 (예: 1, 2, 3...)
            // kakao_log_id는 매우 큰 숫자 (예: 4959219027917264)
            if (numericId < 1000000) {  // 100만 미만이면 DB id로 간주
                console.log(`[신고] 1-1. DB id로 검색 시도: ${numericId}`);
                let query = db.supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('id', numericId);
                
                if (roomName) {
                    query = query.eq('room_name', roomName);
                }
                
                const { data: messageById, error: err1 } = await query.maybeSingle();
                
                if (messageById) {
                    message = messageById;
                    const kakaoLogIdFromMetadata = message.metadata?.kakao_log_id || 'N/A';
                    console.log(`[신고] ✅ DB id로 찾음: id=${message.id}, kakao_log_id=${kakaoLogIdFromMetadata}`);
                } else {
                    console.log(`[신고] 1-1 실패: ${err1?.message || 'not found'}`);
                }
            }
        }
        
        // 2. kakao_log_id로 검색 (DB id 검색 실패 시 또는 큰 숫자인 경우)
        if (!message && reportedMessageId) {
            console.log(`[신고] 2. metadata.kakao_log_id로 검색: ${reportedMessageId}`);
            const numericLogId = parseInt(reportedMessageId);
            if (!isNaN(numericLogId)) {
                let query = db.supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('metadata->>kakao_log_id', String(numericLogId));  // ✅ metadata에서 kakao_log_id 조회
                
                if (roomName) {
                    query = query.eq('room_name', roomName);
                }
                
                const { data: messageByLogId, error: err2 } = await query.maybeSingle();
                
                if (messageByLogId) {
                    message = messageByLogId;
                    const kakaoLogIdFromMetadata = message.metadata?.kakao_log_id || 'N/A';
                    console.log(`[신고] ✅ metadata.kakao_log_id로 찾음: id=${message.id}, kakao_log_id=${kakaoLogIdFromMetadata}`);
                } else {
                    console.log(`[신고] 2 실패: ${err2?.message || 'not found'}`);
                }
            }
        }
        
        // 3. fallback: metadata._id로 검색
        if (!message && reportedMessageId) {
            console.log(`[신고] 3. metadata._id로 검색: ${reportedMessageId}`);
            let query = db.supabase
                .from('chat_messages')
                .select('*')
                .eq('metadata->>_id', String(reportedMessageId));
            
            if (roomName) {
                query = query.eq('room_name', roomName);
            }
            
            const { data: messageByMetadata, error: err3 } = await query.maybeSingle();
            
            if (messageByMetadata) {
                message = messageByMetadata;
                console.log(`[신고] ✅ metadata._id로 찾음: id=${message.id}`);
            } else {
                console.log(`[신고] 3 실패: ${err3?.message || 'not found'}`);
            }
        }
        
        // 메시지를 찾지 못한 경우에도 신고 기록은 저장 (메시지 정보 없이)
        if (!message) {
            console.warn('[신고] 대상 메시지를 찾을 수 없음, 기본 정보로 신고 저장:', {
                reportedMessageId,
                roomName: roomName || 'N/A',
                reporter: reporterName
            });
            
            // 메시지 없이도 신고 저장 시도 (report_logs 테이블 사용)
            try {
                const moderationLogger = require('./moderationLogger');
                const result = await moderationLogger.saveReportLog({
                    roomName: roomName || '',  // roomName 전달
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
                    console.log('[신고] ✅ report_logs에 저장 성공 (메시지 정보 없음):', result.id);
                    // ⚠️ 중요: 메시지를 찾지 못해도 신고 기록은 저장되었으므로 성공으로 반환
                    return result;
                } else {
                    console.error('[신고] ❌ report_logs 저장 실패: result가 null');
                    return null;
                }
            } catch (modErr) {
                console.error('[신고] report_logs 저장 실패:', modErr.message);
                return null;
            }
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
            original_message_text: message.message_text ? message.message_text.substring(0, 100) + '...' : '(없음)',
            original_message_time: message.created_at,
            report_reason: reportReason,
            report_type: reportType
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

/**
 * 반응 카운트 스냅샷 저장 (chat_reaction_counts 테이블)
 * @param {string|number} messageId - 메시지 DB id
 * @param {string|number} kakaoLogId - 카카오톡 로그 ID (선택)
 * @param {string|number} chatId - 채팅방 ID (선택)
 * @param {string} roomName - 채팅방 이름 (선택)
 * @param {number} reactionCount - 반응 개수
 * @param {string} observedAt - 관찰 시각 (ISO 문자열)
 */
async function saveReactionSummary(messageId, kakaoLogId = null, chatId = null, roomName = null, reactionCount, observedAt = null) {
    try {
        console.log(`[반응 카운트] saveReactionSummary 시작: messageId=${messageId}, count=${reactionCount}`);
        
        const now = new Date().toISOString();
        const observedAtValue = observedAt || now;
        
        const upsertData = {
            message_id: messageId,
            reaction_count: reactionCount,
            last_observed_at: observedAtValue,
            updated_at: now
        };
        
        if (kakaoLogId) {
            upsertData.kakao_log_id = typeof kakaoLogId === 'string' ? BigInt(kakaoLogId) : kakaoLogId;
        }
        if (chatId) {
            upsertData.chat_id = typeof chatId === 'string' ? BigInt(chatId) : chatId;
        }
        if (roomName) {
            upsertData.room_name = roomName;
        }
        
        const { data, error } = await db.supabase
            .from('chat_reaction_counts')
            .upsert(upsertData, {
                onConflict: 'message_id'
            })
            .select()
            .single();
        
        if (error) {
            console.error(`[반응 카운트] 저장 실패:`, error);
            return null;
        }
        
        console.log(`[반응 카운트] ✅ 저장 성공: id=${data.id}, count=${reactionCount}`);
        return data;
    } catch (err) {
        console.error(`[반응 카운트] 예외 발생:`, err.message);
        return null;
    }
}

/**
 * 반응 개수 변경 이력 저장 (chat_reaction_deltas 테이블)
 * @param {string|number} messageId - 메시지 DB id
 * @param {number} oldCount - 이전 반응 개수
 * @param {number} newCount - 현재 반응 개수
 * @param {string} observedAt - 관찰 시각 (ISO 문자열)
 */
async function saveReactionCountLog(messageId, oldCount, newCount, observedAt = null) {
    try {
        console.log(`[반응 delta] saveReactionCountLog 시작: messageId=${messageId}, ${oldCount} -> ${newCount}`);
        
        const delta = newCount - oldCount;
        const observedAtValue = observedAt || new Date().toISOString();
        
        const { data, error } = await db.supabase
            .from('chat_reaction_deltas')
            .insert({
                message_id: messageId,
                delta: delta,
                old_count: oldCount,
                new_count: newCount,
                observed_at: observedAtValue
            })
            .select()
            .single();
        
        if (error) {
            console.error(`[반응 delta] 저장 실패:`, error);
            return null;
        }
        
        console.log(`[반응 delta] ✅ 저장 성공: id=${data.id}, delta=${delta}`);
        return data;
    } catch (err) {
        console.error(`[반응 delta] 예외 발생:`, err.message);
        return null;
    }
}

/**
 * 반응 카운트 pending 큐 재처리
 * 메시지 매핑이 실패했던 반응 카운트 이벤트를 재시도
 */
async function processReactionCountPending() {
    try {
        console.log(`[반응 pending] 재처리 시작`);
        
        // pending 큐에서 항목 조회
        const { data: pendingItems, error: fetchError } = await db.supabase
            .from('reaction_count_pending')
            .select('*')
            .order('first_seen_at', { ascending: true })
            .limit(100);  // 한 번에 최대 100개만 처리
        
        if (fetchError) {
            console.error(`[반응 pending] 조회 실패:`, fetchError);
            return { processed: 0, failed: 0 };
        }
        
        if (!pendingItems || pendingItems.length === 0) {
            console.log(`[반응 pending] 처리할 항목 없음`);
            return { processed: 0, failed: 0 };
        }
        
        console.log(`[반응 pending] ${pendingItems.length}개 항목 발견`);
        
        let processed = 0;
        let failed = 0;
        
        for (const item of pendingItems) {
            try {
                const kakaoLogId = String(item.kakao_log_id);
                const chatId = item.chat_id;
                const roomName = item.room_name;
                const newCount = item.new_count;
                const observedAt = item.observed_at;
                
                console.log(`[반응 pending] 처리 시도: kakao_log_id=${kakaoLogId}, chat_id=${chatId}`);
                
                // 메시지 매핑 시도 (우선순위: (kakao_log_id, chat_id) -> (kakao_log_id))
                let message = null;
                
                if (chatId) {
                    // 1순위: (metadata.kakao_log_id, chat_id)
                    const { data: msg1 } = await db.supabase
                        .from('chat_messages')
                        .select('id, chat_id')
                        .eq('metadata->>kakao_log_id', String(kakaoLogId))  // ✅ metadata에서 kakao_log_id 조회
                        .eq('chat_id', String(chatId))
                        .maybeSingle();
                    
                    if (msg1) {
                        message = msg1;
                        console.log(`[반응 pending] ✅ 메시지 찾음 (metadata.kakao_log_id, chat_id): message_id=${message.id}`);
                    }
                }
                
                if (!message) {
                    // 2순위: (metadata.kakao_log_id) 단독
                    const { data: msg2 } = await db.supabase
                        .from('chat_messages')
                        .select('id, chat_id')
                        .eq('metadata->>kakao_log_id', String(kakaoLogId))  // ✅ metadata에서 kakao_log_id 조회
                        .maybeSingle();
                    
                    if (msg2) {
                        message = msg2;
                        console.log(`[반응 pending] ✅ 메시지 찾음 (kakao_log_id): message_id=${message.id}`);
                    }
                }
                
                if (!message) {
                    // 여전히 찾지 못함: 다음 재처리 때 다시 시도
                    console.log(`[반응 pending] ⏳ 메시지 찾지 못함, 다음 재처리 때 재시도: kakao_log_id=${kakaoLogId}`);
                    continue;
                }
                
                // 메시지를 찾았으므로 스냅샷 및 로그 저장
                const messageId = message.id;
                const messageChatId = message.chat_id;
                
                // 기존 카운트 조회 (old_count 계산용)
                const { data: existingCount } = await db.supabase
                    .from('chat_reaction_counts')
                    .select('reaction_count')
                    .eq('message_id', messageId)
                    .maybeSingle();
                
                const oldCount = existingCount?.reaction_count || 0;
                
                // 스냅샷 저장 (upsert)
                await saveReactionSummary(
                    messageId,
                    kakaoLogId,
                    messageChatId || chatId,
                    roomName,
                    newCount,
                    observedAt
                );
                
                // 변경 이력 저장 (변화가 있을 때만)
                if (oldCount !== newCount) {
                    await saveReactionCountLog(
                        messageId,
                        oldCount,
                        newCount,
                        observedAt
                    );
                }
                
                // pending 항목 삭제
                const { error: deleteError } = await db.supabase
                    .from('reaction_count_pending')
                    .delete()
                    .eq('id', item.id);
                
                if (deleteError) {
                    console.error(`[반응 pending] 삭제 실패:`, deleteError);
                } else {
                    console.log(`[반응 pending] ✅ 처리 완료 및 삭제: id=${item.id}, message_id=${messageId}`);
                    processed++;
                }
                
            } catch (itemErr) {
                console.error(`[반응 pending] 항목 처리 오류 (id=${item.id}):`, itemErr.message);
                failed++;
            }
        }
        
        console.log(`[반응 pending] 재처리 완료: 처리=${processed}개, 실패=${failed}개`);
        return { processed, failed };
        
    } catch (err) {
        console.error(`[반응 pending] 재처리 예외:`, err.message);
        return { processed: 0, failed: 0 };
    }
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
    backfillAllPendingReplies,
    saveReactionSummary,
    saveReactionCountLog,
    processReactionCountPending
};

