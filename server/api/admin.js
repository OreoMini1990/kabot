// ============================================
// 관리자 API 라우터
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db/database');

// 인증 미들웨어
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default-admin-token-change-me';

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '인증 토큰이 필요합니다' });
    }
    
    const token = authHeader.substring(7);
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: '인증 실패' });
    }
    
    next();
}

// 모든 관리자 API에 인증 적용
router.use(authenticateAdmin);

// ============================================
// 비속어 필터 관리
// ============================================

// 비속어 목록 조회
router.get('/profanity', async (req, res) => {
    try {
        const { type } = req.query;
        let query = 'SELECT * FROM profanity_words';
        let params = [];
        
        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const words = await db.prepare(query).all(...params);
        res.json({ success: true, data: words });
    } catch (error) {
        console.error('[API] 비속어 목록 조회 실패:', error);
        console.error('[API] 쿼리:', query);
        console.error('[API] 파라미터:', params);
        console.error('[API] 오류 상세:', JSON.stringify(error, null, 2));
        res.status(500).json({ error: '조회 실패', message: error.message, details: error.code || error.hint });
    }
});

// 비속어 추가
router.post('/profanity', async (req, res) => {
    try {
        const { word, type } = req.body;
        
        if (!word || !type) {
            return res.status(400).json({ error: 'word와 type은 필수입니다' });
        }
        
        if (!['profanity', 'job_discrimination'].includes(type)) {
            return res.status(400).json({ error: 'type은 profanity 또는 job_discrimination이어야 합니다' });
        }
        
        const stmt = db.prepare('INSERT INTO profanity_words (word, type) VALUES (?, ?)');
        const result = await stmt.run(word.trim().toLowerCase(), type);
        
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
            return res.status(409).json({ error: '이미 존재하는 단어입니다' });
        }
        console.error('[API] 비속어 추가 실패:', error);
        res.status(500).json({ error: '추가 실패', message: error.message });
    }
});

// 비속어 수정
router.put('/profanity/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { word, type } = req.body;
        
        if (!word || !type) {
            return res.status(400).json({ error: 'word와 type은 필수입니다' });
        }
        
        if (!['profanity', 'job_discrimination'].includes(type)) {
            return res.status(400).json({ error: 'type은 profanity 또는 job_discrimination이어야 합니다' });
        }
        
        const stmt = db.prepare('UPDATE profanity_words SET word = ?, type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = await stmt.run(word.trim().toLowerCase(), type, id);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '단어를 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
            return res.status(409).json({ error: '이미 존재하는 단어입니다' });
        }
        console.error('[API] 비속어 수정 실패:', error);
        res.status(500).json({ error: '수정 실패', message: error.message });
    }
});

// 비속어 삭제
router.delete('/profanity/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM profanity_words WHERE id = ?');
        const result = await stmt.run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '단어를 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 비속어 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

// ============================================
// 공지 관리
// ============================================

// 공지 목록 조회
router.get('/notices', async (req, res) => {
    try {
        const notices = await db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all();
        
        // schedule_times JSON 파싱
        const parsedNotices = notices.map(notice => ({
            ...notice,
            schedule_times: notice.schedule_times ? JSON.parse(notice.schedule_times) : null,
            enabled: notice.enabled === true || notice.enabled === 1
        }));
        
        res.json({ success: true, data: parsedNotices });
    } catch (error) {
        console.error('[API] 공지 목록 조회 실패:', error);
        res.status(500).json({ error: '조회 실패', message: error.message });
    }
});

// 공지 추가
router.post('/notices', async (req, res) => {
    try {
        const { content, expiry_date, schedule_times, enabled } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'content는 필수입니다' });
        }
        
        const scheduleTimesJson = schedule_times ? JSON.stringify(schedule_times) : null;
        const enabledValue = enabled !== undefined ? enabled : true;
        
        const stmt = db.prepare('INSERT INTO notices (content, expiry_date, schedule_times, enabled) VALUES (?, ?, ?, ?)');
        const result = await stmt.run(content, expiry_date || null, scheduleTimesJson, enabledValue);
        
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('[API] 공지 추가 실패:', error);
        res.status(500).json({ error: '추가 실패', message: error.message });
    }
});

// 공지 수정
router.put('/notices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { content, expiry_date, schedule_times, enabled } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'content는 필수입니다' });
        }
        
        const scheduleTimesJson = schedule_times ? JSON.stringify(schedule_times) : null;
        const enabledValue = enabled !== undefined ? enabled : true;
        
        const stmt = db.prepare('UPDATE notices SET content = ?, expiry_date = ?, schedule_times = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = await stmt.run(content, expiry_date || null, scheduleTimesJson, enabledValue, id);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '공지를 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 공지 수정 실패:', error);
        res.status(500).json({ error: '수정 실패', message: error.message });
    }
});

// 공지 삭제
router.delete('/notices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM notices WHERE id = ?');
        const result = await stmt.run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '공지를 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 공지 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

// ============================================
// 로그 조회
// ============================================

// 필터 로그 조회
router.get('/filter-logs', async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const logs = await db.prepare('SELECT * FROM filter_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('[API] 필터 로그 조회 실패:', error);
        res.status(500).json({ error: '조회 실패', message: error.message });
    }
});

// 경고 기록 조회
router.get('/warnings', async (req, res) => {
    try {
        const warnings = await db.prepare('SELECT * FROM warnings ORDER BY count DESC, last_warning_at DESC').all();
        res.json({ success: true, data: warnings });
    } catch (error) {
        console.error('[API] 경고 기록 조회 실패:', error);
        res.status(500).json({ error: '조회 실패', message: error.message });
    }
});

// 필터 로그 삭제
router.delete('/filter-logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM filter_logs WHERE id = ?');
        const result = await stmt.run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '로그를 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 필터 로그 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

// 필터 로그 전체 삭제
router.delete('/filter-logs', async (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM filter_logs');
        const result = await stmt.run();
        
        res.json({ success: true, deleted: result.changes });
    } catch (error) {
        console.error('[API] 필터 로그 전체 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

// 경고 기록 삭제
router.delete('/warnings/:sender', async (req, res) => {
    try {
        const { sender } = req.params;
        const stmt = db.prepare('DELETE FROM warnings WHERE sender = ?');
        const result = await stmt.run(decodeURIComponent(sender));
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '경고 기록을 찾을 수 없습니다' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[API] 경고 기록 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

// 경고 기록 전체 삭제
router.delete('/warnings', async (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM warnings');
        const result = await stmt.run();
        
        res.json({ success: true, deleted: result.changes });
    } catch (error) {
        console.error('[API] 경고 기록 전체 삭제 실패:', error);
        res.status(500).json({ error: '삭제 실패', message: error.message });
    }
});

module.exports = router;

