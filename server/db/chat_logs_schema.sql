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

-- 1-1) users 테이블 (사용자 정규화)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  internal_user_id VARCHAR(255) UNIQUE NOT NULL,  -- 내부 사용자 ID (room_name + sender_name + sender_id 해시)
  kakao_user_id VARCHAR(255),  -- 카카오톡 user_id
  display_name VARCHAR(255) NOT NULL,  -- 현재 표시 이름
  original_name VARCHAR(255),  -- 최초 등록된 이름
  profile_image_url TEXT,  -- 프로필 이미지 URL
  is_active BOOLEAN DEFAULT true,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1-2) rooms 테이블 (채팅방 정규화)
CREATE TABLE IF NOT EXISTS public.rooms (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) UNIQUE NOT NULL,
  room_type VARCHAR(50) DEFAULT 'group',  -- 'group', 'direct', 'open'
  description TEXT,
  member_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1-3) room_members 테이블 (채팅방 멤버십)
CREATE TABLE IF NOT EXISTS public.room_members (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',  -- 'admin', 'moderator', 'member', 'guest'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uq_room_member UNIQUE (room_id, user_id)
);

-- 2) chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_name VARCHAR(255) NOT NULL,  -- 하위 호환성을 위해 유지
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  sender_name VARCHAR(255) NOT NULL,  -- 하위 호환성을 위해 유지
  sender_id VARCHAR(255),  -- 하위 호환성을 위해 유지
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',  -- 'text', 'image', 'file', 'video', 'audio', 'location', 'link', etc.
  is_group_chat BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 메시지 상태/변경 이력
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  edit_count INTEGER DEFAULT 0,
  original_message_text TEXT,  -- 수정 전 원본 메시지
  
  -- 답글/스레드 기능
  reply_to_message_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  thread_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,  -- 스레드 시작 메시지 ID
  thread_reply_count INTEGER DEFAULT 0,  -- 스레드 답글 수
  
  -- 분석용 필드
  word_count INTEGER,
  char_count INTEGER,
  has_mention BOOLEAN DEFAULT false,
  has_url BOOLEAN DEFAULT false,
  has_image BOOLEAN DEFAULT false,
  has_file BOOLEAN DEFAULT false,
  has_video BOOLEAN DEFAULT false,
  has_location BOOLEAN DEFAULT false,
  
  -- 메타데이터 (JSON 형식으로 확장 가능한 정보 저장)
  metadata JSONB,  -- 파일 정보, 위치 정보, 링크 미리보기 등
  
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
  user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255) NOT NULL,  -- 하위 호환성
  room_id BIGINT REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_name VARCHAR(255) NOT NULL,  -- 하위 호환성
  last_seen_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_reaction_at TIMESTAMPTZ,  -- 마지막 반응 시간
  total_messages_sent INTEGER DEFAULT 0,
  total_reactions_given INTEGER DEFAULT 0,
  total_reactions_received INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_user_activity_user_room UNIQUE (user_id, room_id)
);

-- 7) message_edits (메시지 수정 이력)
CREATE TABLE IF NOT EXISTS public.message_edits (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  edited_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  original_text TEXT NOT NULL,
  edited_text TEXT NOT NULL,
  edit_reason TEXT,  -- 수정 사유
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8) message_deletions (메시지 삭제 이력)
CREATE TABLE IF NOT EXISTS public.message_deletions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  deleted_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  deletion_reason TEXT,  -- 삭제 사유
  deletion_type VARCHAR(50) DEFAULT 'user',  -- 'user', 'admin', 'system', 'auto'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9) message_reads (메시지 읽음 상태 - 향후 확장용)
CREATE TABLE IF NOT EXISTS public.message_reads (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uq_message_read UNIQUE (message_id, user_id)
);

-- 10) message_mentions (멘션 정보)
CREATE TABLE IF NOT EXISTS public.message_mentions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  mentioned_user_name VARCHAR(255) NOT NULL,  -- 하위 호환성
  mention_type VARCHAR(50) DEFAULT 'direct',  -- 'direct', 'all', 'here'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11) message_attachments (첨부 파일 정보)
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  attachment_type VARCHAR(50) NOT NULL,  -- 'image', 'file', 'video', 'audio', 'location', 'link'
  attachment_url TEXT,
  attachment_name VARCHAR(255),
  attachment_size BIGINT,  -- 파일 크기 (bytes)
  mime_type VARCHAR(100),
  thumbnail_url TEXT,  -- 썸네일 URL
  metadata JSONB,  -- 추가 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12) message_forwarded (전달된 메시지 정보)
CREATE TABLE IF NOT EXISTS public.message_forwarded (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  original_message_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  original_room_id BIGINT REFERENCES public.rooms(id) ON DELETE SET NULL,
  original_sender_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  forwarded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13) user_name_history (사용자 이름 변경 이력)
CREATE TABLE IF NOT EXISTS public.user_name_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_name VARCHAR(255) NOT NULL,
  new_name VARCHAR(255) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스 생성
-- ============================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_internal_user_id ON public.users(internal_user_id);
CREATE INDEX IF NOT EXISTS idx_users_kakao_user_id ON public.users(kakao_user_id);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON public.users(display_name);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- rooms
CREATE INDEX IF NOT EXISTS idx_rooms_room_name ON public.rooms(room_name);
CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON public.rooms(is_active);

-- room_members
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_role ON public.room_members(role);
CREATE INDEX IF NOT EXISTS idx_room_members_is_active ON public.room_members(is_active);

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_name ON public.chat_messages(room_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_name ON public.chat_messages(sender_name);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON public.chat_messages(room_name, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_user_key ON public.chat_messages(room_user_key);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON public.chat_messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON public.chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_deleted ON public.chat_messages(is_deleted);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_edited ON public.chat_messages(is_edited);
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
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_room_id ON public.user_activity(room_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON public.user_activity(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active);

-- message_edits
CREATE INDEX IF NOT EXISTS idx_message_edits_message_id ON public.message_edits(message_id);
CREATE INDEX IF NOT EXISTS idx_message_edits_edited_by ON public.message_edits(edited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_message_edits_created_at ON public.message_edits(created_at);

-- message_deletions
CREATE INDEX IF NOT EXISTS idx_message_deletions_message_id ON public.message_deletions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_deleted_by ON public.message_deletions(deleted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_created_at ON public.message_deletions(created_at);

-- message_reads
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON public.message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON public.message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_read_at ON public.message_reads(read_at);

-- message_mentions
CREATE INDEX IF NOT EXISTS idx_message_mentions_message_id ON public.message_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_user_id ON public.message_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_user_name ON public.message_mentions(mentioned_user_name);

-- message_attachments
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_type ON public.message_attachments(attachment_type);

-- message_forwarded
CREATE INDEX IF NOT EXISTS idx_message_forwarded_message_id ON public.message_forwarded(message_id);
CREATE INDEX IF NOT EXISTS idx_message_forwarded_original_message ON public.message_forwarded(original_message_id);

-- user_name_history
CREATE INDEX IF NOT EXISTS idx_user_name_history_user_id ON public.user_name_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_name_history_changed_at ON public.user_name_history(changed_at);

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

-- users
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON public.users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- rooms
DROP TRIGGER IF EXISTS trg_rooms_set_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_set_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- room_members
DROP TRIGGER IF EXISTS trg_room_members_set_updated_at ON public.room_members;
CREATE TRIGGER trg_room_members_set_updated_at
BEFORE UPDATE ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_activity
DROP TRIGGER IF EXISTS trg_user_activity_set_updated_at ON public.user_activity;
CREATE TRIGGER trg_user_activity_set_updated_at
BEFORE UPDATE ON public.user_activity
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
