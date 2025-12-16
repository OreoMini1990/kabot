-- ============================================
-- Supabase(Postgres) 채팅 로그 스키마 + updated_at 트리거 세팅
-- ============================================

-- 1) updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2) chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255),
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  is_group_chat BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 분석용 필드
  word_count INTEGER,
  char_count INTEGER,
  has_mention BOOLEAN DEFAULT false,
  has_url BOOLEAN DEFAULT false,
  has_image BOOLEAN DEFAULT false,
  
  -- 유저 식별용 해시 키 (sender_id 없을 때도 안정적 식별)
  room_user_key VARCHAR(255) GENERATED ALWAYS AS (
    MD5(COALESCE(room_name, '') || '|' || COALESCE(sender_name, '') || '|' || COALESCE(sender_id, ''))
  ) STORED,
  
  -- FTS(Full Text Search)용 벡터 (검색 성능 향상)
  message_text_tsvector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('korean', COALESCE(message_text, ''))
  ) STORED
);

-- 3) chat_reactions
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) NOT NULL,
  reactor_name VARCHAR(255) NOT NULL,
  reactor_id VARCHAR(255),
  is_admin_reaction BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 중복 반응 방지(= 기존 UNIQUE INDEX 역할)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_chat_reactions_message_reactor_type'
  ) THEN
    ALTER TABLE public.chat_reactions
      ADD CONSTRAINT uq_chat_reactions_message_reactor_type
      UNIQUE (message_id, reactor_name, reaction_type);
  END IF;
END $$;

-- 4) user_statistics
CREATE TABLE IF NOT EXISTS public.user_statistics (
  id BIGSERIAL PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  room_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,

  message_count INTEGER DEFAULT 0,
  total_char_count INTEGER DEFAULT 0,
  total_word_count INTEGER DEFAULT 0,

  received_reactions_count INTEGER DEFAULT 0,
  given_reactions_count INTEGER DEFAULT 0,
  received_admin_reactions_count INTEGER DEFAULT 0,

  hourly_message_count JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_user_room_date UNIQUE (user_name, room_name, date)
);

-- 5) message_keywords
CREATE TABLE IF NOT EXISTS public.message_keywords (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  keyword VARCHAR(255) NOT NULL,
  keyword_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6) user_activity
CREATE TABLE IF NOT EXISTS public.user_activity (
  id BIGSERIAL PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  room_name VARCHAR(255) NOT NULL,
  last_seen_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_user_room UNIQUE (user_name, room_name)
);

-- ============================================
-- 인덱스 생성
-- ============================================

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_name ON public.chat_messages(room_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_name ON public.chat_messages(sender_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON public.chat_messages(room_name, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_user_key ON public.chat_messages(room_user_key);
-- FTS 인덱스 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_text_tsvector ON public.chat_messages USING GIN(message_text_tsvector);

-- chat_reactions
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id ON public.chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_reactor_name ON public.chat_reactions(reactor_name);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_reaction_type ON public.chat_reactions(reaction_type);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_is_admin ON public.chat_reactions(is_admin_reaction);

-- user_statistics
CREATE INDEX IF NOT EXISTS idx_user_statistics_room_date ON public.user_statistics(room_name, date);
CREATE INDEX IF NOT EXISTS idx_user_statistics_date ON public.user_statistics(date);

-- message_keywords
CREATE INDEX IF NOT EXISTS idx_message_keywords_message_id ON public.message_keywords(message_id);
CREATE INDEX IF NOT EXISTS idx_message_keywords_keyword ON public.message_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_message_keywords_keyword_type ON public.message_keywords(keyword_type);

-- user_activity
CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON public.user_activity(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active);

-- ============================================
-- updated_at 트리거 연결
-- ============================================

-- chat_messages
DROP TRIGGER IF EXISTS trg_chat_messages_set_updated_at ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_set_updated_at
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- chat_reactions
DROP TRIGGER IF EXISTS trg_chat_reactions_set_updated_at ON public.chat_reactions;
CREATE TRIGGER trg_chat_reactions_set_updated_at
BEFORE UPDATE ON public.chat_reactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_statistics
DROP TRIGGER IF EXISTS trg_user_statistics_set_updated_at ON public.user_statistics;
CREATE TRIGGER trg_user_statistics_set_updated_at
BEFORE UPDATE ON public.user_statistics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- message_keywords
DROP TRIGGER IF EXISTS trg_message_keywords_set_updated_at ON public.message_keywords;
CREATE TRIGGER trg_message_keywords_set_updated_at
BEFORE UPDATE ON public.message_keywords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_activity
DROP TRIGGER IF EXISTS trg_user_activity_set_updated_at ON public.user_activity;
CREATE TRIGGER trg_user_activity_set_updated_at
BEFORE UPDATE ON public.user_activity
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
