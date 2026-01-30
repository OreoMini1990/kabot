/**
 * DB 파일 업로드 엔드포인트
 * 클라이언트에서 카카오톡 DB 파일을 서버로 업로드
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// 업로드 디렉토리 설정
const UPLOAD_BASE_DIR = path.join(__dirname, '../../sample_db');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 업로드 디렉토리 생성
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
    fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
    console.log(`[DB 업로드] 디렉토리 생성: ${UPLOAD_BASE_DIR}`);
}

// Multer 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 날짜별 폴더 생성 (YYYYMMDD)
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const dateDir = path.join(UPLOAD_BASE_DIR, dateStr);
        
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        
        cb(null, dateDir);
    },
    filename: (req, file, cb) => {
        // 원본 파일명 + 타임스탬프 + 확장자
        const originalName = file.originalname || 'KakaoTalk.db';
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const timestamp = Date.now();
        const filename = `${baseName}_${timestamp}${ext}`;
        
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        // .db 파일만 허용
        if (file.originalname.endsWith('.db') || file.mimetype === 'application/x-sqlite3') {
            cb(null, true);
        } else {
            cb(new Error('DB 파일만 업로드 가능합니다 (.db 파일)'));
        }
    }
});

/**
 * DB 파일 업로드 엔드포인트
 * POST /api/upload-db
 */
router.post('/upload-db', upload.single('db_file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'no_file',
                message: 'DB 파일이 업로드되지 않았습니다.'
            });
        }

        const file = req.file;
        const dbName = req.body.db_name || file.originalname || 'unknown.db';
        const fileSize = req.body.file_size || file.size;
        const fileHash = req.body.file_hash || null;
        const fileMtime = req.body.file_mtime || null;

        // 파일 해시 검증 (제공된 경우)
        let hashMatch = true;
        if (fileHash) {
            try {
                const fileBuffer = fs.readFileSync(file.path);
                const sha256 = crypto.createHash('sha256');
                sha256.update(fileBuffer);
                const calculatedHash = sha256.digest('hex');
                
                if (calculatedHash !== fileHash) {
                    hashMatch = false;
                    console.warn(`[DB 업로드] 해시 불일치: 제공=${fileHash.substring(0, 16)}..., 계산=${calculatedHash.substring(0, 16)}...`);
                }
            } catch (e) {
                console.warn(`[DB 업로드] 해시 검증 실패: ${e.message}`);
            }
        }

        // 파일 정보
        const fileInfo = {
            originalName: file.originalname,
            filename: file.filename,
            filePath: file.path,
            size: file.size,
            mimeType: file.mimetype,
            uploadedAt: new Date().toISOString(),
            dbName: dbName,
            hashMatch: hashMatch
        };

        console.log(`[DB 업로드] ✅ 파일 업로드 성공: ${dbName}`);
        console.log(`[DB 업로드]   경로: ${file.path}`);
        console.log(`[DB 업로드]   크기: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);

        res.json({
            success: true,
            message: 'DB 파일 업로드 성공',
            file_path: file.path,
            file_info: fileInfo
        });

    } catch (error) {
        console.error(`[DB 업로드] 오류: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'upload_failed',
            message: error.message
        });
    }
});

/**
 * 업로드된 DB 파일 목록 조회
 * GET /api/upload-db/list
 */
router.get('/upload-db/list', (req, res) => {
    try {
        const files = [];
        
        // 날짜별 폴더 순회
        if (fs.existsSync(UPLOAD_BASE_DIR)) {
            const dateDirs = fs.readdirSync(UPLOAD_BASE_DIR)
                .filter(item => {
                    const itemPath = path.join(UPLOAD_BASE_DIR, item);
                    return fs.statSync(itemPath).isDirectory() && /^\d{8}$/.test(item);
                })
                .sort()
                .reverse(); // 최신 날짜부터

            for (const dateDir of dateDirs) {
                const datePath = path.join(UPLOAD_BASE_DIR, dateDir);
                const dirFiles = fs.readdirSync(datePath)
                    .filter(item => item.endsWith('.db'))
                    .map(item => {
                        const filePath = path.join(datePath, item);
                        const stats = fs.statSync(filePath);
                        return {
                            filename: item,
                            date: dateDir,
                            path: filePath,
                            size: stats.size,
                            uploadedAt: stats.mtime.toISOString()
                        };
                    });
                
                files.push(...dirFiles);
            }
        }

        // 최신순 정렬
        files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json({
            success: true,
            count: files.length,
            files: files.slice(0, 100) // 최대 100개만 반환
        });

    } catch (error) {
        console.error(`[DB 업로드] 목록 조회 오류: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'list_failed',
            message: error.message
        });
    }
});

module.exports = router;

