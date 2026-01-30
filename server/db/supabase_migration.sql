-- ============================================
-- KakaoBot 관리자 패널 DB 스키마
-- Supabase PostgreSQL 데이터베이스
-- ============================================

-- 비속어 필터 단어
CREATE TABLE IF NOT EXISTS profanity_words (
    id SERIAL PRIMARY KEY,
    word TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('profanity', 'job_discrimination')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 공지사항
CREATE TABLE IF NOT EXISTS notices (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    expiry_date DATE,
    schedule_times TEXT, -- JSON 배열: ["09:00", "13:00", "20:00"]
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 공지 스케줄 발송 기록
CREATE TABLE IF NOT EXISTS notice_schedules (
    id SERIAL PRIMARY KEY,
    notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    schedule_key TEXT NOT NULL, -- "YYYY-MM-DD_HH:MM"
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(notice_id, schedule_key)
);

-- 필터 로그
CREATE TABLE IF NOT EXISTS filter_logs (
    id SERIAL PRIMARY KEY,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    reason TEXT NOT NULL,
    word TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 경고 기록
CREATE TABLE IF NOT EXISTS warnings (
    id SERIAL PRIMARY KEY,
    sender TEXT NOT NULL UNIQUE,
    count INTEGER DEFAULT 1,
    last_warning_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_profanity_type ON profanity_words(type);
CREATE INDEX IF NOT EXISTS idx_notices_enabled ON notices(enabled);
CREATE INDEX IF NOT EXISTS idx_notice_schedules_key ON notice_schedules(schedule_key);
CREATE INDEX IF NOT EXISTS idx_filter_logs_created ON filter_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_warnings_sender ON warnings(sender);

-- 초기 데이터 (비속어)
INSERT INTO profanity_words (word, type) VALUES
    ('시발', 'profanity'),
    ('씨발', 'profanity'),
    ('개새끼', 'profanity'),
    ('병신', 'profanity'),
    ('좆', 'profanity'),
    ('지랄', 'profanity'),
    ('미친', 'profanity'),
    ('미친놈', 'profanity'),
    ('미친년', 'profanity'),
    ('개같은', 'profanity'),
    ('개소리', 'profanity'),
    ('좆같은', 'profanity'),
    ('지랄하네', 'profanity'),
    ('빠가', 'profanity'),
    ('바보', 'profanity'),
    ('멍청이', 'profanity'),
    ('죽어', 'profanity'),
    ('죽어라', 'profanity'),
    ('꺼져', 'profanity'),
    ('꺼지세요', 'profanity'),
    ('닥쳐', 'profanity'),
    ('닥치세요', 'profanity'),
    ('간조년', 'profanity')
ON CONFLICT (word) DO NOTHING;

-- 초기 데이터 (타직업 비하)
INSERT INTO profanity_words (word, type) VALUES
    ('간호사새끼', 'job_discrimination'),
    ('간호사년', 'job_discrimination'),
    ('간호사놈', 'job_discrimination'),
    ('의사새끼', 'job_discrimination'),
    ('의사년', 'job_discrimination'),
    ('약사새끼', 'job_discrimination'),
    ('약사년', 'job_discrimination'),
    ('한의사새끼', 'job_discrimination')
ON CONFLICT (word) DO NOTHING;

-- updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
DROP TRIGGER IF EXISTS update_profanity_words_updated_at ON profanity_words;
CREATE TRIGGER update_profanity_words_updated_at
    BEFORE UPDATE ON profanity_words
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notices_updated_at ON notices;
CREATE TRIGGER update_notices_updated_at
    BEFORE UPDATE ON notices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_warnings_updated_at ON warnings;
CREATE TRIGGER update_warnings_updated_at
    BEFORE UPDATE ON warnings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



















