-- ============================================
-- 네이버 카페 글쓰기 질문 기능 DB 스키마
-- Supabase PostgreSQL 및 SQLite 모두 지원
-- ============================================

-- ============================================
-- Supabase (PostgreSQL)용
-- ============================================

-- 네이버 카페 글쓰기 기록 및 대기 중인 질문 저장 테이블
CREATE TABLE IF NOT EXISTS naver_cafe_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- 카카오톡 정보
    kakao_room_id TEXT,
    kakao_sender_id TEXT NOT NULL,
    kakao_sender_name TEXT,  -- 닉네임
    
    -- 질문 정보
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- 네이버 카페 정보
    clubid INTEGER,
    menuid INTEGER,
    cafe_url TEXT,
    
    -- 글쓰기 결과
    article_id INTEGER,  -- 네이버 카페 API에서 받은 article ID
    article_url TEXT,    -- 네이버 카페 글 URL
    
    -- 짧은 링크
    short_code TEXT UNIQUE,  -- base62 인코딩된 짧은 코드
    
    -- 상태
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'created', 'failed', 'no_permission')),
    
    -- 오류 정보
    error_message TEXT,
    
    -- 인덱스
    CONSTRAINT idx_naver_cafe_posts_short_code UNIQUE (short_code)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_status ON naver_cafe_posts(status);
CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_sender ON naver_cafe_posts(kakao_sender_id);
CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_created_at ON naver_cafe_posts(created_at);

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_naver_cafe_posts_updated_at
    BEFORE UPDATE ON naver_cafe_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SQLite용 (별도 파일 또는 주석 해제하여 사용)
-- ============================================

/*
CREATE TABLE IF NOT EXISTS naver_cafe_posts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 카카오톡 정보
    kakao_room_id TEXT,
    kakao_sender_id TEXT NOT NULL,
    kakao_sender_name TEXT,
    
    -- 질문 정보
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- 네이버 카페 정보
    clubid INTEGER,
    menuid INTEGER,
    cafe_url TEXT,
    
    -- 글쓰기 결과
    article_id INTEGER,
    article_url TEXT,
    
    -- 짧은 링크
    short_code TEXT UNIQUE,
    
    -- 상태
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'created', 'failed', 'no_permission')),
    
    -- 오류 정보
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_status ON naver_cafe_posts(status);
CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_sender ON naver_cafe_posts(kakao_sender_id);
CREATE INDEX IF NOT EXISTS idx_naver_cafe_posts_created_at ON naver_cafe_posts(created_at);
*/

