// ============================================
// 캐시 관리 모듈
// ============================================

const PENDING_ATTACHMENT_CACHE = new Map();
const ATTACHMENT_CACHE_TTL = 10 * 60 * 1000;
const PENDING_PREVIEW_CACHE = new Map();
const PREVIEW_CACHE_TTL = 2 * 60 * 1000;
const PENDING_FAILURE_NOTICE_CACHE = new Map();
const FAILURE_NOTICE_TTL = 5 * 60 * 1000;
const PENDING_QUESTION_CACHE = new Map();
const QUESTION_WAIT_TTL = 3 * 60 * 1000;
const IMAGE_REQUEST_CACHE = new Map();
const IMAGE_REQUEST_INTERVAL = 30 * 1000;

const { createCacheKey, normalizeRoomNameForCache } = require('../../db/utils/roomKeyNormalizer');

function setPendingAttachment(roomName, senderId, imageUrl) {
    const key = createCacheKey(roomName, senderId);
    PENDING_ATTACHMENT_CACHE.set(key, {
        imageUrl: imageUrl,
        timestamp: Date.now()
    });
}

function getAndClearPendingAttachment(roomName, senderId) {
    const key = createCacheKey(roomName, senderId);
    const cached = PENDING_ATTACHMENT_CACHE.get(key);
    if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < ATTACHMENT_CACHE_TTL) {
            PENDING_ATTACHMENT_CACHE.delete(key);
            return cached.imageUrl;
        } else {
            PENDING_ATTACHMENT_CACHE.delete(key);
        }
    }
    return null;
}

function cleanupPendingAttachmentCache() {
    const now = Date.now();
    for (const [key, value] of PENDING_ATTACHMENT_CACHE.entries()) {
        if (now - value.timestamp > ATTACHMENT_CACHE_TTL) {
            PENDING_ATTACHMENT_CACHE.delete(key);
        }
    }
}

function setPendingPreview(roomName, senderId, previewData) {
    const key = createCacheKey(roomName, senderId);
    PENDING_PREVIEW_CACHE.set(key, {
        ...previewData,
        timestamp: Date.now()
    });
}

function getAndClearPendingPreview(roomName, senderId, withinMs = 90 * 1000) {
    const key = createCacheKey(roomName, senderId);
    const cached = PENDING_PREVIEW_CACHE.get(key);
    if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < withinMs) {
            PENDING_PREVIEW_CACHE.delete(key);
            return cached;
        } else {
            PENDING_PREVIEW_CACHE.delete(key);
        }
    }
    return null;
}

function setPendingQuestion(roomName, senderId, questionDataOrTitle, content) {
    const key = createCacheKey(roomName, senderId);
    let savedData;
    
    // questionDataOrTitle이 객체인 경우 (새로운 형식) 또는 title인 경우 (하위 호환성)
    if (typeof questionDataOrTitle === 'object' && questionDataOrTitle !== null && !Array.isArray(questionDataOrTitle)) {
        // 객체 형식: { step, title, content, room, sender, senderId, timestamp, ... }
        savedData = {
            ...questionDataOrTitle,
            timestamp: questionDataOrTitle.timestamp || Date.now()
        };
        PENDING_QUESTION_CACHE.set(key, savedData);
    } else {
        // 하위 호환성: title, content를 별도 파라미터로 받는 경우
        savedData = {
            title: questionDataOrTitle,
            content: content,
            timestamp: Date.now()
        };
        PENDING_QUESTION_CACHE.set(key, savedData);
    }
    
    // ⚠️ 중요: 저장 직후 로그 (step 필드 포함)
    console.log(`[캐시 저장] setPendingQuestion: room="${roomName}", senderId="${senderId}", step="${savedData.step || 'undefined'}", title="${savedData.title || 'N/A'}", content 길이=${savedData.content ? savedData.content.length : 0}`);
}

function getPendingQuestion(roomName, senderId) {
    const key = createCacheKey(roomName, senderId);
    const cached = PENDING_QUESTION_CACHE.get(key);
    if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < QUESTION_WAIT_TTL) {
            // ⚠️ 중요: 로드 직후 로그 (step 필드 포함)
            console.log(`[캐시 로드] getPendingQuestion: room="${roomName}", senderId="${senderId}", step="${cached.step || 'undefined'}", title="${cached.title || 'N/A'}", content 길이=${cached.content ? cached.content.length : 0}, age=${Math.round(age / 1000)}초`);
            return cached;
        } else {
            PENDING_QUESTION_CACHE.delete(key);
            console.log(`[캐시 만료] getPendingQuestion: room="${roomName}", senderId="${senderId}", age=${Math.round(age / 1000)}초 (TTL=${QUESTION_WAIT_TTL / 1000}초)`);
        }
    } else {
        console.log(`[캐시 없음] getPendingQuestion: room="${roomName}", senderId="${senderId}"`);
    }
    return null;
}

function getAndClearPendingQuestion(roomName, senderId) {
    const key = createCacheKey(roomName, senderId);
    const cached = PENDING_QUESTION_CACHE.get(key);
    if (cached) {
        PENDING_QUESTION_CACHE.delete(key);
        return cached;
    }
    return null;
}

async function cleanupPendingQuestionCache() {
    const now = Date.now();
    for (const [key, value] of PENDING_QUESTION_CACHE.entries()) {
        if (now - value.timestamp > QUESTION_WAIT_TTL) {
            PENDING_QUESTION_CACHE.delete(key);
        }
    }
}

function shouldShowFailureNotice(cacheKey) {
    const cached = PENDING_FAILURE_NOTICE_CACHE.get(cacheKey);
    if (!cached) return true;
    const age = Date.now() - cached.timestamp;
    return age >= FAILURE_NOTICE_TTL;
}

function markFailureNoticeShown(cacheKey) {
    PENDING_FAILURE_NOTICE_CACHE.set(cacheKey, {
        timestamp: Date.now()
    });
}

function cleanupFailureNoticeCache() {
    const now = Date.now();
    for (const [key, value] of PENDING_FAILURE_NOTICE_CACHE.entries()) {
        if (now - value.timestamp > FAILURE_NOTICE_TTL) {
            PENDING_FAILURE_NOTICE_CACHE.delete(key);
        }
    }
}

module.exports = {
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
};


