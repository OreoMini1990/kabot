/**
 * Bridge APK 업로드 엔드포인트
 * 알림 미리보기 이미지를 서버로 업로드
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

// Bridge API Key 인증
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || '';
const BRIDGE_PREVIEW_ENABLED = process.env.BRIDGE_PREVIEW_ENABLED !== 'false'; // 기본값 true

// 업로드 디렉토리
const UPLOAD_BASE_DIR = '/home/app/iris-core/uploads/bridge_previews';

// 디렉토리 생성
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
    fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

// 날짜별 디렉토리 생성 함수
function getDateDir() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const dateDir = path.join(UPLOAD_BASE_DIR, dateStr);
    if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
    }
    return dateDir;
}

// Multer 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getDateDir());
    },
    filename: (req, file, cb) => {
        const room = req.body.room || 'unknown';
        const senderId = req.body.senderId || 'unknown';
        const kakaoLogId = req.body.kakaoLogId || '';
        const timestamp = req.body.clientTs || Date.now();
        const ext = path.extname(file.originalname) || '.jpg';
        const safeRoom = room.replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 50);
        const safeSender = senderId.replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 30);
        const logIdPart = kakaoLogId ? `_${kakaoLogId.substring(0, 10)}` : '';
        const filename = `${safeRoom}_${safeSender}${logIdPart}_${timestamp}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

/**
 * Bridge API Key 인증 미들웨어
 * P0-2: 에러 코드 분류 및 로그 마스킹
 */
function authenticateBridge(req, res, next) {
    // P0-2: 에러 코드 분류
    let authStatus = 'unknown';
    let authErrorCode = null;
    
    if (!BRIDGE_PREVIEW_ENABLED) {
        authStatus = 'preview_disabled';
        authErrorCode = 'preview_disabled';
        console.warn(`[Bridge] [인증] ${authErrorCode}: Bridge preview feature is disabled`);
        return res.status(503).json({
            ok: false,
            error: 'Bridge preview feature is disabled',
            errorCode: authErrorCode
        });
    }

    const providedKey = req.headers['x-bridge-key'] || req.headers['X-Bridge-Key'];
    
    if (!BRIDGE_API_KEY) {
        authStatus = 'no_api_key';
        authErrorCode = 'no_api_key';
        console.warn(`[Bridge] [인증] ${authErrorCode}: BRIDGE_API_KEY가 설정되지 않음`);
        console.warn('[Bridge] [인증] .env 파일에 BRIDGE_API_KEY를 추가하세요');
        // 인증 비활성화 모드: 키가 없어도 업로드 허용 (개발/테스트용)
        // 프로덕션에서는 반드시 키를 설정하세요
        return next();
    }

    if (!providedKey) {
        authStatus = 'key_mismatch';
        authErrorCode = 'key_mismatch';
        // P0-2: 키 값 마스킹 (보안)
        const maskedExpected = BRIDGE_API_KEY.length > 8 ? 
            `${BRIDGE_API_KEY.substring(0, 4)}***${BRIDGE_API_KEY.substring(BRIDGE_API_KEY.length - 4)}` : 
            '***';
        console.warn(`[Bridge] [인증] ${authErrorCode}: 제공된 키 없음 (예상 키: ${maskedExpected})`);
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized: Bridge API Key required',
            errorCode: authErrorCode
        });
    }

    if (providedKey !== BRIDGE_API_KEY) {
        authStatus = 'key_mismatch';
        authErrorCode = 'key_mismatch';
        // P0-2: 키 값 마스킹 (보안)
        const maskedProvided = providedKey.length > 8 ? 
            `${providedKey.substring(0, 4)}***${providedKey.substring(providedKey.length - 4)}` : 
            '***';
        const maskedExpected = BRIDGE_API_KEY.length > 8 ? 
            `${BRIDGE_API_KEY.substring(0, 4)}***${BRIDGE_API_KEY.substring(BRIDGE_API_KEY.length - 4)}` : 
            '***';
        console.warn(`[Bridge] [인증] ${authErrorCode}: 키 불일치 (제공: ${maskedProvided}, 예상: ${maskedExpected})`);
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized: Invalid Bridge API Key',
            errorCode: authErrorCode
        });
    }

    authStatus = 'ok';
    console.log(`[Bridge] [인증] ${authStatus}: 인증 성공`);
    next();
}

/**
 * POST /bridge/preview-image
 * Bridge APK에서 알림 미리보기 이미지 업로드
 */
router.post('/preview-image', authenticateBridge, upload.single('image'), async (req, res) => {
    try {
        console.log(`[Bridge 업로드] ========== 이미지 업로드 시작 ==========`);
        
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                error: 'No image file provided'
            });
        }

        const room = req.body.room || '';
        const senderId = req.body.senderId || '';
        const senderName = req.body.senderName || '';
        const kakaoLogId = req.body.kakaoLogId || '';
        const clientTs = req.body.clientTs || Date.now();
        const mime = req.body.mime || req.file.mimetype || 'image/jpeg';
        const isGroupConversation = req.body.isGroupConversation === 'true' || req.body.isGroupConversation === true;

        console.log(`[Bridge 업로드] 파일 정보:`);
        console.log(`  - filename: ${req.file.filename}`);
        console.log(`  - size: ${req.file.size} bytes`);
        console.log(`  - mime: ${mime}`);
        console.log(`  - path: ${req.file.path}`);
        console.log(`[Bridge 업로드] 메타데이터:`);
        console.log(`  - room: "${room}"`);
        console.log(`  - senderId: "${senderId}"`);
        console.log(`  - senderName: "${senderName}"`);
        console.log(`  - kakaoLogId: "${kakaoLogId}"`);
        console.log(`  - clientTs: ${clientTs}`);
        console.log(`  - isGroupConversation: ${isGroupConversation}`);

        // PENDING_PREVIEW_CACHE에 저장
        const { setPendingPreview, getPendingQuestion, getAndClearPendingQuestion, processQuestionSubmission } = require('../labbot-node');
        
        // 여러 키로 저장 (매칭 성공률 향상)
        const previewData = {
            filePath: req.file.path,
            filename: req.file.filename,
            mime: mime,
            size: req.file.size,
            ts: parseInt(clientTs),
            kakaoLogId: kakaoLogId,
            room: room,
            senderId: senderId,
            senderName: senderName,
            isGroupConversation: isGroupConversation
        };

        // 키 후보들로 저장
        if (room && senderId) {
            setPendingPreview(room, senderId, previewData);
            console.log(`[Bridge 업로드] ✅ 캐시 저장: key="${room}|${senderId}"`);
        }
        if (room && senderName) {
            setPendingPreview(room, senderName, previewData);
            console.log(`[Bridge 업로드] ✅ 캐시 저장: key="${room}|${senderName}"`);
        }
        if (senderName) {
            setPendingPreview('', senderName, previewData); // 단독 키 (TTL 짧게)
            console.log(`[Bridge 업로드] ✅ 캐시 저장: key="|${senderName}"`);
        }
        
        // ⚠️ 중요: 질문 대기 상태 확인 및 자동 처리
        const serverUrl = process.env.SERVER_URL || process.env.PUBLIC_BASE_URL || 'http://192.168.0.15:5002';
        const imageUrl = `${serverUrl}/api/image/${req.file.filename}`;
        
        // 질문 대기 상태 확인 (여러 키로 시도)
        let pendingQuestion = null;
        if (room && senderId) {
            pendingQuestion = getPendingQuestion(room, senderId);
        }
        if (!pendingQuestion && room && senderName) {
            pendingQuestion = getPendingQuestion(room, senderName);
        }
        if (!pendingQuestion && senderName) {
            pendingQuestion = getPendingQuestion('', senderName);
        }
        
        if (pendingQuestion) {
            console.log(`[Bridge 업로드] ✅ 질문 대기 상태 발견 - 자동 처리 시작`);
            console.log(`[Bridge 업로드] 질문 정보: title="${pendingQuestion.title}"`);
            
            // 질문과 함께 처리
            try {
                const questionReplies = await processQuestionSubmission(
                    room,
                    senderName || senderId || '',
                    pendingQuestion.title,
                    pendingQuestion.content,
                    imageUrl
                );
                
                // 질문 대기 상태 삭제
                if (room && senderId) {
                    getAndClearPendingQuestion(room, senderId);
                }
                if (room && senderName) {
                    getAndClearPendingQuestion(room, senderName);
                }
                if (senderName) {
                    getAndClearPendingQuestion('', senderName);
                }
                
                console.log(`[Bridge 업로드] ✅ 질문 자동 처리 완료: ${questionReplies.length}개 응답`);
                
                // 응답은 WebSocket을 통해 전송되어야 하므로, 여기서는 로그만 남김
                // 실제 응답은 handleMessage에서 처리됨
            } catch (error) {
                console.error(`[Bridge 업로드] ❌ 질문 처리 실패:`, error);
            }
        } else {
            console.log(`[Bridge 업로드] 질문 대기 상태 없음 - 캐시에만 저장됨`);
        }

        console.log(`[Bridge 업로드] ✅ 업로드 성공: ${imageUrl}`);
        console.log(`[Bridge 업로드] ==========================================`);

        res.json({
            ok: true,
            message: 'Image uploaded successfully',
            filename: req.file.filename,
            url: imageUrl,
            size: req.file.size,
            mime: mime
        });
    } catch (error) {
        console.error(`[Bridge 업로드] ❌ 오류:`, error);
        res.status(500).json({
            ok: false,
            error: 'Upload failed',
            message: error.message
        });
    }
});

module.exports = router;

