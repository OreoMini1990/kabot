// ============================================
// 랩봇 (LABBOT) - Node.js 버전
// 메신저봇R 스타일에서 Node.js WebSocket 환경으로 변환
// ============================================

// ========== Node.js 기본 모듈 ==========
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const axios = require('axios');

// ========== 데이터베이스 모듈 ==========
const db = require('./db/database');
const moderationLogger = require('./db/moderationLogger');
const chatLogger = require('./db/chatLogger');

// ========== 봇 설정 및 모더레이션 모듈 ==========
const CONFIG = require('./bot/config');
const PROFANITY_FILTER = require('./bot/moderation/profanityFilter');
const PROMOTION_DETECTOR = require('./bot/moderation/promotionDetector');
const NICKNAME_TRACKER = require('./bot/moderation/nicknameTracker');
const MESSAGE_DELETE_TRACKER = require('./bot/moderation/messageDeleteTracker');
const MEMBER_TRACKER = require('./bot/moderation/memberTracker');
const NOTICE_SYSTEM = require('./bot/systems/noticeSystem');

// ========== 유틸리티 모듈 ==========
const { extractSenderName, extractSenderId, isAdmin, readFileSafe, writeFileSafe, formatCurrency, formatDate, getFormattedDate } = require('./bot/utils/botUtils');
const { createCacheKey } = require('./db/utils/roomKeyNormalizer');

// ========== 캐시 관리 모듈 ==========
const { 
    setPendingAttachment, 
    getAndClearPendingAttachment, 
    cleanupPendingAttachmentCache,
    setPendingPreview,
    getAndClearPendingPreview,
    setPendingQuestion,
    getPendingQuestion,
    getAndClearPendingQuestion,
    cleanupPendingQuestionCache,
    shouldShowFailureNotice,
    markFailureNoticeShown,
    cleanupFailureNoticeCache,
    IMAGE_REQUEST_CACHE,
    IMAGE_REQUEST_INTERVAL
} = require('./bot/cache/cacheManager');

// ========== 통합 모듈 ==========
// submitQuestion, saveQuestionWithoutPermission은 questionService에서 사용됨

// ========== 명령어 처리 모듈 ==========
const { handleCommand, handleQuestionPendingState: handleQuestionPendingStateFromModule } = require('./bot/commands');

// 디버깅: 시작 시 NAVER_CAFE 기능 상태 로그
console.log(`[설정] NAVER_CAFE 기능: ${CONFIG.FEATURES.NAVER_CAFE} (환경변수: ${process.env.NAVER_CAFE_ENABLED})`);

// ========== 비속어/욕설 필터 (모듈에서 import됨) ==========
// PROFANITY_FILTER는 위에서 import됨

// ========== 무단 홍보 감지 시스템 (모듈에서 import됨) ==========
// PROMOTION_DETECTOR는 위에서 import됨

// ========== 닉네임 변경 감지 시스템 (모듈에서 import됨) ==========
// NICKNAME_TRACKER는 위에서 import됨

// ========== 메시지 삭제 감지 시스템 (모듈에서 import됨) ==========
// MESSAGE_DELETE_TRACKER는 위에서 import됨

// ========== 공지 시스템 (모듈에서 import됨) ==========
// NOTICE_SYSTEM은 위에서 import됨

// ========== 캐시 관리 (모듈에서 import됨) ==========
// 캐시 관련 함수들은 위에서 import됨 - 기존 정의 제거됨
// 기존 코드는 server/bot/cache/cacheManager.js로 이동됨

// ========== 유틸리티 함수 (모듈에서 import됨) ==========
// extractSenderName, extractSenderId, isAdmin, readFileSafe, writeFileSafe 등은 위에서 import됨

// ========== 서버 함수 전달 (server.js에서 사용) ==========
let sendShortUrlMessageFunction = null;
function setSendShortUrlMessage(fn) {
    sendShortUrlMessageFunction = fn;
}

let sendFollowUpMessageFunction = null;
function setSendFollowUpMessage(fn) {
    sendFollowUpMessageFunction = fn;
}


// ========== 파일 동기화 (로컬 파일 업로드용) ==========

// ========== 포인트 관리 ==========

function addPoints(sender, amount) {
    const pointsFile = CONFIG.FILE_PATHS.POINT;
    const backupFile = CONFIG.DATA_DIR + "/point_" + getFormattedDate() + ".txt";

    let currentData = readFileSafe(pointsFile);
    if (currentData === null || currentData === "") {
        writeFileSafe(pointsFile, sender + "|0\n");
        currentData = sender + "|0\n";
    }

    const pointsDict = {};
    const lines = currentData.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const parts = lines[i].split("|");
        if (parts.length === 2) {
            pointsDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    }

    if (!(sender in pointsDict)) pointsDict[sender] = 0;
    pointsDict[sender] += amount;

    const newData = Object.keys(pointsDict).map(function(user) {
        return user + "|" + pointsDict[user];
    }).join("\n") + "\n";

    if (!writeFileSafe(pointsFile, newData)) {
        return "파일 저장 중 오류가 발생했습니다.";
    }

    writeFileSafe(backupFile, newData);

    return sender + "님의 포인트가 " + formatCurrency(amount) + "만큼 증가하였습니다. 현재 포인트: " + formatCurrency(pointsDict[sender]);
}

function reducePoints(sender, amount) {
    const pointsFile = CONFIG.FILE_PATHS.POINT;
    const currentData = readFileSafe(pointsFile);
    
    if (currentData === null) {
        return "포인트 파일을 찾을 수 없습니다.";
    }

    const pointsDict = {};
    const lines = currentData.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const parts = lines[i].split("|");
        if (parts.length === 2 && parts[0] && parts[1]) {
            pointsDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    }

    if (!(sender in pointsDict)) pointsDict[sender] = 0;
    
    if (pointsDict[sender] < amount) {
        amount = pointsDict[sender];
    }
    
    pointsDict[sender] -= amount;

    const newData = Object.keys(pointsDict).map(function(user) {
        return user + "|" + pointsDict[user];
    }).join("\n") + "\n";

    if (!writeFileSafe(pointsFile, newData)) {
        return "파일 저장 중 오류가 발생했습니다.";
    }

    return sender + "님의 포인트가 " + formatCurrency(amount) + "만큼 감소하였습니다. 현재 포인트: " + formatCurrency(pointsDict[sender]);
}

// ========== 채팅 통계 ==========

function recordChatCount(sender) {
    const chatCountRoot = CONFIG.FILE_PATHS.CHAT_COUNT;
    
    if (!fs.existsSync(chatCountRoot)) {
        fs.mkdirSync(chatCountRoot, { recursive: true });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const day = ("0" + now.getDate()).slice(-2);
    
    const currentMonthRoot = path.join(chatCountRoot, year + "-" + month);
    const currentDayRoot = path.join(currentMonthRoot, day);
    
    if (!fs.existsSync(currentMonthRoot)) {
        fs.mkdirSync(currentMonthRoot, { recursive: true });
    }
    if (!fs.existsSync(currentDayRoot)) {
        fs.mkdirSync(currentDayRoot, { recursive: true });
    }

    const fileNameSender = sender.replace(/\//g, '☞');
    const chatCountFile = path.join(currentDayRoot, fileNameSender + ".txt");
    
    let currentCount = 0;
    const existingData = readFileSafe(chatCountFile);
    if (existingData !== null) {
        currentCount = parseInt(existingData) || 0;
    }
    
    currentCount++;
    writeFileSafe(chatCountFile, currentCount.toString());
}

// getChatRankings는 별도 모듈로 분리됨 (server/bot/commands/user/statsService.js)

// ========== 상점 관리 ==========

function registerItem(itemName, itemPrice, replies) {
    const shopFile = CONFIG.FILE_PATHS.SHOP;
    const currentData = readFileSafe(shopFile) || "";
    
    const newItem = itemName + " : " + itemPrice;
    const updatedData = currentData + (currentData ? "\n" : "") + newItem;

    if (writeFileSafe(shopFile, updatedData)) {
        replies.push(itemName + " 상품이 등록되었습니다. 가격: " + itemPrice);
    } else {
        replies.push("상품 등록 중 오류가 발생했습니다.");
    }
}

function removeItem(itemName, replies) {
    const shopFile = CONFIG.FILE_PATHS.SHOP;
    const shopData = readFileSafe(shopFile);
    
    if (shopData === null || !shopData) {
        replies.push("상점에 등록된 상품이 없습니다.");
        return;
    }

    const items = shopData.split("\n");
    const updatedItems = items.filter(function(item) {
        return !item.startsWith(itemName + " : ");
    });

    if (updatedItems.length === items.length) {
        replies.push("해당 상품을 찾을 수 없습니다.");
        return;
    }

    const updatedData = updatedItems.join("\n");
    if (writeFileSafe(shopFile, updatedData)) {
        replies.push(itemName + " 상품이 제거되었습니다.");
    } else {
        replies.push("상품 제거 중 오류가 발생했습니다.");
    }
}

// ========== 메인 함수 ==========

/**
 * 메시지를 처리하고 응답 배열을 반환합니다.
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {boolean} isGroupChat - 그룹 채팅 여부
 * @returns {Promise<string[]>} 응답 메시지 배열
 */

// processQuestionSubmission은 별도 모듈로 분리됨 (server/bot/commands/cafe/questionService.js)

/**
 * 메시지를 처리하고 응답 배열을 반환합니다.
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {boolean} isGroupChat - 그룹 채팅 여부
 * @param {number} replyToMessageId - 답장할 메시지 ID (optional, DB id)
 * @param {object} json - 메시지 JSON 데이터 (optional)
 * @param {string|number} replyToKakaoLogId - 답장할 메시지의 kakao_log_id (optional)
 * @returns {Promise<string[]>} 응답 메시지 배열
 */
async function handleMessage(room, msg, sender, isGroupChat, replyToMessageId = null, json = null, replyToKakaoLogId = null) {
    const replies = [];
    
    // 디버깅: 함수 호출 확인
    console.log(`[handleMessage] 호출됨: room="${room}", msg="${msg.substring(0, 50)}...", sender="${sender}", replyToMessageId=${replyToMessageId}`);
    
    // 메시지가 암호화된 상태인지 확인 (복호화 실패한 경우 대비)
    // base64로 보이는 경우 복호화 시도 (서버에서 복호화 실패했을 수 있음)
    let processedMsg = msg;
    const isBase64Like = msg && msg.length > 10 && msg.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(msg.trim());
    if (isBase64Like) {
        console.log(`[handleMessage] 경고: 메시지가 여전히 암호화된 상태로 보입니다. 복호화를 시도합니다.`);
        // 간단한 base64 디코딩 시도 (실제 복호화는 서버에서 이미 시도했지만 실패했을 수 있음)
        try {
            const decoded = Buffer.from(msg.trim(), 'base64').toString('utf-8');
            // 디코딩된 결과가 유효한 텍스트인지 확인 (base64만 있는 경우 제외)
            if (decoded && decoded.length > 0 && !decoded.match(/^[A-Za-z0-9+/=]+$/)) {
                processedMsg = decoded;
                console.log(`[handleMessage] base64 디코딩 성공: "${decoded.substring(0, 50)}..."`);
            }
        } catch (e) {
            console.log(`[handleMessage] base64 디코딩 실패: ${e.message}`);
        }
    }
    
    // msgLower 변수 정의 (질문 대기 상태 확인 전에 필요)
    const msgTrimmed = processedMsg.trim();
    const msgLower = msgTrimmed.toLowerCase();
    
    // ========== 신고 기능 처리 (최우선, replyToMessageId 필요) ==========
    // 신고 명령어 감지: !신고 또는 ! 신고 (공백 포함) 모두 처리
    const hasReportCommand = /![\s]*신고/.test(msgTrimmed) || msgLower.includes('!신고');
    
    if (hasReportCommand) {
        // json에서 reply_to_message_id 또는 reply_to_kakao_log_id 추출 시도
        let actualReplyToMessageId = replyToMessageId;
        let actualReplyToKakaoLogId = replyToKakaoLogId;
        
        // ⚠️ 중요: replyToKakaoLogId가 있으면 우선 사용 (서버에서 이미 추출했을 수 있음)
        if (!actualReplyToKakaoLogId && json) {
            // json 필드에서 직접 추출
            actualReplyToKakaoLogId = json.reply_to_message_id || 
                                     json.reply_to || 
                                     json.parent_message_id || 
                                     json.reply_to_kakao_log_id ||
                                     json.reply_to_kakao_log_id_raw ||
                                     json.src_message ||
                                     json.logId ||
                                     json.src_logId;
        }
        
        // json에서 직접 추출 시도 (서버에서 변환 실패했을 수 있음)
        // ⚠️ 중요: attachment에서도 추출 시도
        if (!actualReplyToMessageId && (actualReplyToKakaoLogId || json)) {
            // 1순위: 이미 추출한 actualReplyToKakaoLogId 사용
            let replyToKakaoLogId = actualReplyToKakaoLogId;
            
            // 2순위: json 필드에서 직접 추출 (더 많은 필드 확인)
            if (!replyToKakaoLogId && json) {
                replyToKakaoLogId = json.reply_to_message_id || 
                                    json.reply_to || 
                                    json.parent_message_id || 
                                    json.reply_to_kakao_log_id ||
                                    json.reply_to_kakao_log_id_raw ||
                                    json.src_message ||
                                    json.logId ||
                                    json.src_logId;
            }
            
            // 3순위: metadata에서 추출 시도
            if (!replyToKakaoLogId && json && json.metadata) {
                try {
                    const metadata = typeof json.metadata === 'string' ? JSON.parse(json.metadata) : json.metadata;
                    replyToKakaoLogId = metadata.reply_to_message_id || 
                                       metadata.reply_to || 
                                       metadata.reply_to_kakao_log_id ||
                                       metadata.src_message ||
                                       metadata.logId;
                    if (replyToKakaoLogId) {
                        console.log(`[신고] metadata에서 reply_to_kakao_log_id 추출: ${replyToKakaoLogId}`);
                    }
                } catch (err) {
                    console.error(`[신고] metadata 파싱 오류:`, err.message);
                }
            }
            
            // 4순위: attachment에서 추출 시도
            // ⚠️ 중요: msg_type이 26(답장)인 경우 attachment에서 반드시 추출 시도
            if (!replyToKakaoLogId && json && (json.attachment || json.attachment_decrypted || json.msg_type === 26 || json.type === 26)) {
                try {
                    const { extractReplyTarget } = require('./db/utils/attachmentExtractor');
                    const replyFromAttachment = extractReplyTarget(
                        json.attachment_decrypted || json.attachment,
                        null,
                        json.msg_type || json.type
                    );
                    if (replyFromAttachment) {
                        replyToKakaoLogId = replyFromAttachment;
                        console.log(`[신고] ✅ attachment에서 reply_to_kakao_log_id 추출: ${replyToKakaoLogId}`);
                    } else if (json.msg_type === 26 || json.type === 26) {
                        console.log(`[신고] ⚠️ msg_type=26인데 attachment에서 추출 실패`);
                        console.log(`[신고] attachment 존재: ${!!json.attachment}, attachment_decrypted 존재: ${!!json.attachment_decrypted}`);
                    }
                } catch (err) {
                    console.error(`[신고] attachment 추출 오류:`, err.message);
                }
            }
            
            if (replyToKakaoLogId) {
                console.log(`[신고] json에서 reply_to_kakao_log_id 추출: ${replyToKakaoLogId}`);
                // kakao_log_id를 DB id로 변환 시도
                try {
                    const db = require('./db/database');
                    const numericLogId = parseInt(replyToKakaoLogId);
                    if (!isNaN(numericLogId)) {
                        // ⚠️ 중요: metadata에서 kakao_log_id 조회
                        const { data: replyToMessage } = await db.supabase
                            .from('chat_messages')
                            .select('id, reply_to_message_id')
                            .eq('metadata->>kakao_log_id', String(numericLogId))  // ✅ metadata에서 kakao_log_id 조회
                            .eq('room_name', room)
                            .maybeSingle();
                        
                        if (replyToMessage && replyToMessage.id) {
                            actualReplyToMessageId = replyToMessage.id;
                            console.log(`[신고] ✅ kakao_log_id(${numericLogId}) → DB id(${actualReplyToMessageId}) 변환 성공`);
                        } else {
                            // DB id 변환 실패 시 kakao_log_id를 직접 사용 (saveReport에서 처리)
                            actualReplyToMessageId = replyToKakaoLogId;
                            console.log(`[신고] ⚠️ DB id 변환 실패, kakao_log_id 직접 사용: ${actualReplyToMessageId} (saveReport에서 처리)`);
                        }
                    } else {
                        // 숫자가 아니면 그대로 사용
                        actualReplyToMessageId = replyToKakaoLogId;
                        console.log(`[신고] ⚠️ 숫자 변환 실패, 원본 값 사용: ${actualReplyToMessageId}`);
                    }
                } catch (err) {
                    console.error(`[신고] reply_to_message_id 변환 오류:`, err.message);
                    // 변환 실패 시 kakao_log_id를 직접 사용 (saveReport에서 처리)
                    actualReplyToMessageId = replyToKakaoLogId;
                }
            } else {
                console.log(`[신고] ⚠️ json에서 reply_to_kakao_log_id를 찾을 수 없음`);
                // ⚠️ 디버그: attachment 요약 로그
                if (json && (json.attachment || json.attachment_decrypted)) {
                    const attach = json.attachment_decrypted || json.attachment;
                    const attachType = typeof attach;
                    const attachLength = attachType === 'string' ? attach.length : (attachType === 'object' && attach ? JSON.stringify(attach).length : 0);
                    const attachKeys = attachType === 'object' && attach ? Object.keys(attach).join(', ') : 'N/A';
                    console.log(`[신고] 디버그 - attachment 존재: type=${attachType}, length=${attachLength}, keys=${attachKeys.substring(0, 100)}`);
                } else {
                    console.log(`[신고] 디버그 - attachment 없음: attachment=${!!json?.attachment}, attachment_decrypted=${!!json?.attachment_decrypted}, msg_type=${json?.msg_type || json?.type}`);
                }
            }
        }
        
        console.log('[신고] ✅ 신고 요청 감지:', { 
            replyToMessageId, 
            actualReplyToMessageId,
            replyToMessageIdType: typeof replyToMessageId,
            replyToMessageIdValue: String(replyToMessageId),
            jsonReplyTo: json?.reply_to_message_id || json?.reply_to || json?.parent_message_id,
            reporter: sender, 
            message: msgTrimmed 
        });
        
        // replyToMessageId 또는 replyToKakaoLogId가 필수 (답장 버튼을 눌러야 함)
        // ⚠️ 개선: replyToKakaoLogId가 있으면 백필을 먼저 시도하거나 직접 사용
        if ((!actualReplyToMessageId || 
            actualReplyToMessageId === 'null' || 
            actualReplyToMessageId === 'undefined' || 
            String(actualReplyToMessageId).trim() === '') &&
            (!actualReplyToKakaoLogId || 
            actualReplyToKakaoLogId === 'null' || 
            actualReplyToKakaoLogId === 'undefined' || 
            String(actualReplyToKakaoLogId).trim() === '')) {
            console.log(`[신고] ⚠️ replyToMessageId와 replyToKakaoLogId 모두 없음: replyToMessageId=${actualReplyToMessageId}, replyToKakaoLogId=${actualReplyToKakaoLogId}`);
            const helpMessage = `📋 신고 방법 안내\n\n` +
                `신고하려는 메시지에 답장 버튼을 누르고\n` +
                `!신고 또는 !신고 [사유] 를 입력하세요\n\n` +
                `예시: !신고 부적절한 내용입니다`;
            replies.push(helpMessage);
            return replies;
        }
        
        // ⚠️ 개선: replyToMessageId가 없어도 replyToKakaoLogId가 있으면 백필 시도 또는 직접 사용
        if (!actualReplyToMessageId || 
            actualReplyToMessageId === 'null' || 
            actualReplyToMessageId === 'undefined' || 
            String(actualReplyToMessageId).trim() === '') {
            if (actualReplyToKakaoLogId) {
                // 백필을 먼저 시도해서 reply_to_message_id를 얻기
                try {
                    const chatLogger = require('./db/chatLogger');
                    const numericLogId = parseInt(actualReplyToKakaoLogId);
                    if (!isNaN(numericLogId)) {
                        // metadata에서 kakao_log_id로 메시지 찾기
                        const db = require('./db/database');
                        const { data: replyToMessage } = await db.supabase
                            .from('chat_messages')
                            .select('id, reply_to_message_id')
                            .eq('metadata->>kakao_log_id', String(numericLogId))
                            .eq('room_name', room)
                            .maybeSingle();
                        
                        if (replyToMessage && replyToMessage.id) {
                            actualReplyToMessageId = replyToMessage.id;
                            console.log(`[신고] ✅ 백필 후 kakao_log_id(${numericLogId}) → DB id(${actualReplyToMessageId}) 변환 성공`);
                        } else {
                            // 백필 실패 시 kakao_log_id를 직접 사용 (saveReport에서 처리)
                            actualReplyToMessageId = actualReplyToKakaoLogId;
                            console.log(`[신고] ⚠️ 백필 실패, kakao_log_id 직접 사용: ${actualReplyToMessageId} (saveReport에서 처리)`);
                        }
                    } else {
                        // 숫자가 아니면 그대로 사용
                        actualReplyToMessageId = actualReplyToKakaoLogId;
                        console.log(`[신고] ⚠️ 숫자 변환 실패, 원본 값 사용: ${actualReplyToMessageId}`);
                    }
                } catch (err) {
                    console.error(`[신고] 백필 시도 오류:`, err.message);
                    // 백필 실패 시 kakao_log_id를 직접 사용 (saveReport에서 처리)
                    actualReplyToMessageId = actualReplyToKakaoLogId;
                    console.log(`[신고] ⚠️ 백필 실패, kakao_log_id 직접 사용: ${actualReplyToMessageId} (saveReport에서 처리)`);
                }
            } else {
                // 둘 다 없으면 안내 메시지 (이미 위에서 처리됨)
                return replies;
            }
        }
        
        // 신고 사유 추출
        let reportReason = '신고 사유 없음';
        const reportMatch = msgTrimmed.match(/![\s]*신고[\s]*(.*)/i);
        if (reportMatch && reportMatch[1]) {
            const afterReport = reportMatch[1].trim();
            // 멘션 제거 (@랩봇 등)
            const cleanedReason = afterReport.replace(/@\w+/g, '').trim();
            if (cleanedReason) {
                reportReason = cleanedReason;
            }
        }
        
        // 신고자 정보 추출
        let reporterName = extractSenderName(json, sender) || sender || '알 수 없음';
        let reporterId = extractSenderId(json, sender);
        
        // targetMessageId는 actualReplyToMessageId (DB id 또는 kakao_log_id)
        const targetMessageId = actualReplyToMessageId;
        
        console.log('[신고] 처리 시작:', { 
            replyToMessageId: targetMessageId, 
            reporterName, 
            reporterId, 
            reportReason 
        });
        
        // saveReport 호출 (원문 내용 포함)
        try {
            // 원문 메시지 조회 (신고 저장 전에 미리 조회하여 로그 출력)
            let originalMessageText = null;
            try {
                const chatLogger = require('./db/chatLogger');
                // 간단한 조회 시도 (실제 저장은 saveReport에서 수행)
                // 여기서는 로그 출력용으로만 사용
                console.log('[신고] 원문 메시지 조회 시도: messageId=', targetMessageId);
            } catch (err) {
                console.log('[신고] 원문 메시지 조회 실패 (저장 시 자동 조회됨):', err.message);
            }
            
            console.log('[신고] saveReport 호출:', { 
                reportedMessageId: targetMessageId, 
                reporterName, 
                reporterId, 
                reportReason,
                originalMessageText: originalMessageText || '(저장 시 자동 조회)'
            });
            
            const reportResult = await chatLogger.saveReport(
                targetMessageId,  // replyToMessageId (DB id 또는 kakao_log_id)
                reporterName || sender,  // 신고자 이름
                reporterId,  // 신고자 ID
                reportReason,  // 신고 사유
                'general',  // 신고 타입
                room  // 채팅방 이름
            );
            
            console.log('[신고] 처리 결과:', reportResult ? '✅ 성공' : '❌ 실패');
            
            if (reportResult) {
                const successMessage = `✅ 신고 접수 완료!\n\n` +
                    `📝 신고 내용이 관리자에게 전달되었습니다.\n` +
                    `🔍 검토 후 적절한 조치가 이루어집니다.\n\n` +
                    `감사합니다. 🙏`;
                replies.push(successMessage);
            } else {
                const errorMessage = `❌ 신고 접수 실패\n\n` +
                    `죄송합니다. 신고 접수 중 오류가 발생했습니다.\n` +
                    `잠시 후 다시 시도해주세요.`;
                replies.push(errorMessage);
            }
        } catch (error) {
            console.error('[신고] 처리 중 오류:', error);
            const errorMessage = `❌ 신고 접수 실패\n\n` +
                `죄송합니다. 신고 접수 중 오류가 발생했습니다.\n` +
                `오류: ${error.message}`;
            replies.push(errorMessage);
        }
        
        // 신고 처리 완료 후 즉시 반환
        return replies;
    }
    
    // ========== 명령어 처리 (모듈화) ==========
    const commandReplies = await handleCommand(room, processedMsg, sender, json);
    if (commandReplies && commandReplies.length > 0) {
        return commandReplies;
    }
    
    // ========== 질문 대기 상태 확인 (명령어가 아닌 일반 메시지) ==========
    // ⚠️ 주의: 이미지 메시지는 server.js에서 처리하므로 여기서는 텍스트 메시지만 처리
    // 명령어가 아닌 경우에만 질문 대기 상태 확인
    if (!msgLower.startsWith("!")) {
        const questionPendingReplies = await handleQuestionPendingStateFromModule(room, processedMsg, sender, json);
        if (questionPendingReplies && questionPendingReplies.length > 0) {
            return questionPendingReplies;
        }
    }
    
    // ========== 비속어/욕설 필터링 ==========
    // ⚠️ 중요: 명령어가 아닌 일반 메시지만 필터링
    if (!msgLower.startsWith("!") && !msgLower.startsWith("/")) {
        try {
            const profanityResult = await PROFANITY_FILTER.check(processedMsg);
            if (profanityResult && profanityResult.blocked) {
                console.log(`[비속어 필터] 감지: reason="${profanityResult.reason}", word="${profanityResult.word}", level=${profanityResult.level}`);
                
                // 발신자 정보 추출
                let senderName = extractSenderName(json, sender) || sender || '알 수 없음';
                let senderId = extractSenderId(json, sender);
                
                // 경고 횟수 증가
                const warningCount = await PROFANITY_FILTER.addWarning(senderId || senderName);
                
                // 경고 메시지 생성 (전체 닉네임 전달)
                // ⚠️ senderName은 extractSenderName으로 추출한 전체 닉네임 (예: "랩장/AN/서울")
                const warningMessage = PROFANITY_FILTER.getWarningMessage(senderName || sender, warningCount);
                replies.push(warningMessage);
                
                // 로그 기록
                await PROFANITY_FILTER.log(senderName, processedMsg, profanityResult.reason, profanityResult.word);
                
                // 모더레이션 로그 저장
                try {
                    moderationLogger.saveProfanityWarning({
                        roomName: room,
                        senderName: senderName,
                        senderId: senderId,
                        messageText: processedMsg,
                        detectedWord: profanityResult.word,
                        violationType: profanityResult.reason,
                        violationLevel: profanityResult.level,
                        warningLevel: Math.min(warningCount, 3)
                    });
                } catch (modErr) {
                    console.error('[비속어 필터] 모더레이션 로그 저장 실패:', modErr.message);
                }
                
                // Level 3 (타직업 비하) 또는 3회 이상 경고 시 관리자 보고
                if (profanityResult.level >= 3 || warningCount >= 3) {
                    console.log(`[비속어 필터] 🚨 심각한 위반 또는 3회 이상! 관리자 보고: ${senderName}, level=${profanityResult.level}, warningCount=${warningCount}`);
                }
                
                // 비속어 메시지는 즉시 반환 (더 이상 처리하지 않음)
                return replies;
            }
        } catch (error) {
            console.error('[비속어 필터] 오류:', error);
            // 필터 오류가 발생해도 메시지 처리는 계속 진행
        }
    }
    
    // ========== 무단 홍보 감지 ==========
    if (CONFIG.FEATURES.PROMOTION_DETECTION) {
        const promotionResult = PROMOTION_DETECTOR.checkMessage(processedMsg, sender);
        console.log(`[무단 홍보] 체크 결과: detected=${promotionResult.detected}, URL=${promotionResult.url || 'N/A'}, banType=${promotionResult.banType || 'N/A'}, message="${processedMsg.substring(0, 50)}..."`);
        if (promotionResult.detected) {
            // sender에서 복호화된 이름 추출 (json에서 sender_name_decrypted 우선 사용)
            let senderName = extractSenderName(json, sender);
            
            // senderName이 여전히 null이면 sender 파싱 시도
            if (!senderName) {
                if (sender && sender.includes('/')) {
                    const parts = sender.split('/');
                    // 마지막 부분이 숫자면 나머지 전체를 닉네임으로
                    const lastPart = parts[parts.length - 1];
                    if (/^\d+$/.test(lastPart.trim())) {
                        senderName = parts.slice(0, -1).join('/').trim();
                    } else {
                        senderName = sender.trim();
                    }
                } else {
                    senderName = sender || null;
                }
            }
            
            // senderName이 여전히 암호화된 상태인지 확인 (base64 패턴)
            if (senderName && senderName.length > 10 && senderName.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(senderName)) {
                console.log(`[무단 홍보] ⚠️ senderName이 여전히 암호화된 상태: "${senderName.substring(0, 20)}..."`);
                // 복호화 모듈 사용 (json에서 myUserId 또는 userId 추출)
                let decryptUserId = null;
                if (json) {
                    decryptUserId = json.myUserId || json.userId || json.user_id;
                }
                
                // sender에서 user_id 추출 (fallback)
                if (!decryptUserId) {
                    const senderId = sender.includes('/') ? sender.split('/')[sender.split('/').length - 1] : null;
                    if (senderId && /^\d+$/.test(senderId)) {
                        decryptUserId = senderId;
                    }
                }
                
                if (decryptUserId) {
                    // decryptKakaoTalkMessage 복호화 모듈 사용 (circular dependency 방지를 위해 직접 호출)
                    try {
                        // server.js에서 export된 함수 사용 (circular dependency 해결)
                        let decryptKakaoTalkMessage = null;
                        
                        // 방법 1: module.exports로 export된 함수 사용
                        try {
                            const serverModule = require('./server');
                            decryptKakaoTalkMessage = serverModule.decryptKakaoTalkMessage;
                        } catch (requireErr) {
                            console.log(`[무단 홍보] require('./server') 실패: ${requireErr.message}`);
                        }
                        
                        // 방법 2: global 객체에서 함수 찾기 (fallback)
                        if (!decryptKakaoTalkMessage && typeof global !== 'undefined' && global.decryptKakaoTalkMessage) {
                            decryptKakaoTalkMessage = global.decryptKakaoTalkMessage;
                            console.log(`[무단 홍보] global 객체에서 decryptKakaoTalkMessage 찾음`);
                        }
                        
                        if (typeof decryptKakaoTalkMessage === 'function') {
                            // enc 후보: 31, 30, 32 순으로 시도
                            for (const encTry of [31, 30, 32]) {
                                const decrypted = decryptKakaoTalkMessage(senderName, String(decryptUserId), encTry);
                                if (decrypted && decrypted !== senderName) {
                                    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                                    // base64 패턴이 아니어야 함 (복호화 실패 시 base64가 그대로 나올 수 있음)
                                    const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
                                    const isValidText = !hasControlChars && !isBase64Pattern;
                                    
                                    if (isValidText) {
                                        senderName = decrypted;
                                        console.log(`[무단 홍보] ✅ senderName 복호화 성공: "${senderName}" (enc=${encTry}, userId=${decryptUserId})`);
                                    } else {
                                        console.log(`[무단 홍보] 복호화 결과가 유효하지 않음: 제어문자=${hasControlChars}, base64패턴=${isBase64Pattern}`);
                                    }
                                }
                            }
                        } else {
                            console.log(`[무단 홍보] ⚠️ decryptKakaoTalkMessage 함수를 찾을 수 없음 (require 실패 또는 함수 없음)`);
                        }
                    } catch (e) {
                        console.log(`[무단 홍보] 복호화 모듈 호출 실패: ${e.message}`);
                        console.error(`[무단 홍보] 복호화 오류 스택:`, e.stack);
                    }
                } else {
                    console.log(`[무단 홍보] ⚠️ 복호화를 위한 userId를 찾을 수 없음`);
                }
            }
            
            const senderId = sender.includes('/') ? sender.split('/')[sender.split('/').length - 1] : null;
            const count = PROMOTION_DETECTOR.addViolation(senderId || senderName);
            const warningLevel = Math.min(count, 3);
            const warningMessage = PROMOTION_DETECTOR.getWarningMessage(sender, promotionResult.banType, count, promotionResult.url, senderName);
            
            console.log(`[무단 홍보] 감지: ${promotionResult.banType}, URL=${promotionResult.url}, 횟수=${count}, senderName="${senderName}"`);
            replies.push(warningMessage);
            
            // DB에 저장
            moderationLogger.savePromotionViolation({
                roomName: room,
                senderName: senderName,
                senderId: senderId,
                messageText: processedMsg,
                detectedUrl: promotionResult.url,
                violationType: promotionResult.banType.replace(/\s+/g, '_').toLowerCase(),
                violationCount: count,
                warningLevel: warningLevel
            });
            
            // 3회 이상이면 관리자에게도 알림
            if (count >= 3) {
                console.log(`[무단 홍보] 🚨 3회 이상! 관리자 보고됨: ${senderName}`);
            }
            
            // 무단홍보 메시지 자동 삭제 명령 전송 (Bridge APK에)
            // ⚠️ 주석 처리: 자동 삭제 기능 비활성화
        }
    }
    
    return replies;
}

// ========== Export ==========
module.exports = {
    handleMessage,
    addPoints,
    reducePoints,
    recordChatCount,
    registerItem,
    removeItem,
    processQuestionSubmission: require('./bot/commands/cafe/questionService').processQuestionSubmission,
    getChatRankings: require('./bot/commands/user/statsService').getChatRankings,
    CONFIG,
    PROFANITY_FILTER,
    PROMOTION_DETECTOR,
    NICKNAME_TRACKER,
    MESSAGE_DELETE_TRACKER,
    MEMBER_TRACKER,
    NOTICE_SYSTEM,
    extractSenderName,
    extractSenderId,
    isAdmin,
    setPendingAttachment,
    getAndClearPendingAttachment,
    setPendingPreview,
    getAndClearPendingPreview,
    setPendingQuestion,
    getPendingQuestion,
    getAndClearPendingQuestion,
    shouldShowFailureNotice,
    markFailureNoticeShown,
    setSendShortUrlMessage,
    setSendFollowUpMessage
};