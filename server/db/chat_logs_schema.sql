-- ============================================
-- 채팅 로그 데이터베이스 스키마
-- ============================================

-- 채팅 메시지 테이블
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    room_name VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    sender_id VARCHAR(255),  -- user_id (숫자 또는 문자열)
    message_text TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',  -- text, image, file, etc.
    is_group_chat BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 통계 및 분석용 필드
    word_count INTEGER,  -- 단어 수
    char_count INTEGER,  -- 문자 수
    has_mention BOOLEAN DEFAULT false,  -- 멘션 포함 여부
    has_url BOOLEAN DEFAULT false,  -- URL 포함 여부
    has_image BOOLEAN DEFAULT false,  -- 이미지 포함 여부
    
    -- 인덱스는 PostgreSQL에서 CREATE INDEX로 별도 생성
);

-- 채팅 반응 테이블 (사용자 반응)
CREATE TABLE IF NOT EXISTS chat_reactions (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    reaction_type VARCHAR(50) NOT NULL,  -- 'thumbs_up', 'thumbs_down', 'heart', 'laugh', etc.
    reactor_name VARCHAR(255) NOT NULL,  -- 반응을 준 사용자 이름
    reactor_id VARCHAR(255),  -- 반응을 준 사용자 ID
    is_admin_reaction BOOLEAN DEFAULT false,  -- 관리자 반응 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스는 PostgreSQL에서 CREATE INDEX로 별도 생성
);

-- 사용자 통계 테이블 (집계용)
CREATE TABLE IF NOT EXISTS user_statistics (
    id BIGSERIAL PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    room_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,  -- 통계 날짜
    
    -- 메시지 통계
    message_count INTEGER DEFAULT 0,
    total_char_count INTEGER DEFAULT 0,
    total_word_count INTEGER DEFAULT 0,
    
    -- 반응 통계
    received_reactions_count INTEGER DEFAULT 0,  -- 받은 반응 수
    given_reactions_count INTEGER DEFAULT 0,  -- 준 반응 수
    received_admin_reactions_count INTEGER DEFAULT 0,  -- 받은 관리자 반응 수
    
    -- 시간대별 통계 (JSON 형식으로 저장)
    hourly_message_count JSONB,  -- { "0": 5, "1": 3, ... "23": 10 }
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스는 PostgreSQL에서 CREATE INDEX로 별도 생성
);

-- 키워드/주제 추출 테이블 (향후 확장용)
CREATE TABLE IF NOT EXISTS message_keywords (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    keyword_type VARCHAR(50),  -- 'topic', 'mention', 'hashtag', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스는 PostgreSQL에서 CREATE INDEX로 별도 생성
);

-- 읽기 전용 사용자 추적 (향후 확장용)
CREATE TABLE IF NOT EXISTS user_activity (
    id BIGSERIAL PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    room_name VARCHAR(255) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,  -- 최근 활동 여부
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_name ON chat_messages(room_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_name ON chat_messages(sender_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_name, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id ON chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_reactor_name ON chat_reactions(reactor_name);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_reaction_type ON chat_reactions(reaction_type);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_is_admin ON chat_reactions(is_admin_reaction);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reactions_message_reactor ON chat_reactions(message_id, reactor_name, reaction_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_statistics_user_room_date ON user_statistics(user_name, room_name, date);
CREATE INDEX IF NOT EXISTS idx_user_statistics_room_date ON user_statistics(room_name, date);
CREATE INDEX IF NOT EXISTS idx_user_statistics_date ON user_statistics(date);

CREATE INDEX IF NOT EXISTS idx_message_keywords_message_id ON message_keywords(message_id);
CREATE INDEX IF NOT EXISTS idx_message_keywords_keyword ON message_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_message_keywords_keyword_type ON message_keywords(keyword_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_user_room ON user_activity(user_name, room_name);
CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON user_activity(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON user_activity(is_active);

