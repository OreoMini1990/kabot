-- ============================================
-- 모더레이션 관련 테이블 스키마 (Supabase/Postgres)
-- 무단홍보, 메시지삭제, 강퇴, 입퇴장 등 기록
-- ============================================

-- 1) promotion_violations (무단 홍보 감지 기록)
CREATE TABLE IF NOT EXISTS public.promotion_violations (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255),  -- 카카오 user_id (변하지 않음)
  message_text TEXT NOT NULL,  -- 감지된 메시지 내용 (광고 내용)
  detected_url TEXT,  -- 감지된 URL
  violation_type VARCHAR(100) NOT NULL,  -- 'open_chat', 'toss', 'discord', 'general_link'
  violation_count INTEGER DEFAULT 1,  -- 해당 사용자의 위반 횟수
  warning_level INTEGER DEFAULT 1,  -- 경고 단계 (1, 2, 3)
  is_reported_to_admin BOOLEAN DEFAULT false,  -- 관리자에게 보고 여부
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) message_delete_warnings (메시지 삭제 경고 기록)
CREATE TABLE IF NOT EXISTS public.message_delete_warnings (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255),  -- 카카오 user_id
  deleted_message_id VARCHAR(255),  -- 삭제된 메시지 ID (chat_logs._id)
  deleted_message_text TEXT,  -- 삭제된 메시지 내용 (캐시된 경우)
  delete_count_24h INTEGER DEFAULT 1,  -- 24시간 내 삭제 횟수
  warning_level INTEGER DEFAULT 1,  -- 경고 단계 (1, 2, 3)
  is_reported_to_admin BOOLEAN DEFAULT false,  -- 관리자에게 보고 여부
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) member_kicks (강퇴 기록)
CREATE TABLE IF NOT EXISTS public.member_kicks (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  kicked_user_name VARCHAR(255) NOT NULL,  -- 강퇴당한 사용자 닉네임
  kicked_user_id VARCHAR(255),  -- 강퇴당한 사용자 ID
  kicked_by_name VARCHAR(255),  -- 강퇴한 사용자 (관리자) 닉네임
  kicked_by_id VARCHAR(255),  -- 강퇴한 사용자 ID
  kick_reason TEXT,  -- 강퇴 사유 (있는 경우)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) member_activities (입퇴장 기록)
CREATE TABLE IF NOT EXISTS public.member_activities (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  activity_type VARCHAR(50) NOT NULL,  -- 'join', 'leave', 'kick', 'invite'
  invited_by_name VARCHAR(255),  -- 초대한 사람 (초대인 경우)
  invited_by_id VARCHAR(255),
  is_kicked BOOLEAN DEFAULT false,  -- 강퇴 여부
  join_count INTEGER DEFAULT 0,  -- 해당 방 입장 횟수
  leave_count INTEGER DEFAULT 0,  -- 해당 방 퇴장 횟수
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5) nickname_changes (닉네임 변경 기록) - user_name_history 보완
CREATE TABLE IF NOT EXISTS public.nickname_changes (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,  -- 카카오 user_id (변하지 않음)
  old_nickname VARCHAR(255) NOT NULL,
  new_nickname VARCHAR(255) NOT NULL,
  change_count INTEGER DEFAULT 1,  -- 총 변경 횟수
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6) profanity_warnings (비속어 경고 기록)
CREATE TABLE IF NOT EXISTS public.profanity_warnings (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_id VARCHAR(255),
  message_text TEXT NOT NULL,  -- 감지된 메시지
  detected_word VARCHAR(255),  -- 감지된 비속어
  warning_level INTEGER DEFAULT 1,  -- 경고 레벨
  warning_count INTEGER DEFAULT 1,  -- 누적 경고 횟수
  is_reported_to_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7) reaction_logs (반응 기록 - 상세 로그)
CREATE TABLE IF NOT EXISTS public.reaction_logs (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  target_message_id VARCHAR(255),  -- 반응 대상 메시지 ID
  target_message_text TEXT,  -- 대상 메시지 내용 (선택적)
  reactor_name VARCHAR(255) NOT NULL,
  reactor_id VARCHAR(255),
  reaction_type VARCHAR(50) NOT NULL,  -- 'heart', 'thumbs_up', 'check', 'surprised', 'sad'
  reaction_emoji VARCHAR(10),  -- 실제 이모지 (❤️, 👍, ✅, 😱, 😢)
  is_admin_reaction BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8) report_logs (신고 기록)
CREATE TABLE IF NOT EXISTS public.report_logs (
  id BIGSERIAL PRIMARY KEY,
  room_name VARCHAR(255) NOT NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reporter_id VARCHAR(255),
  reported_message_id VARCHAR(255),
  reported_message_text TEXT,
  reported_user_name VARCHAR(255),
  reported_user_id VARCHAR(255),
  report_reason TEXT,
  report_type VARCHAR(50) DEFAULT 'general',  -- 'general', 'spam', 'harassment', 'profanity'
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'reviewed', 'resolved', 'dismissed'
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스 생성
-- ============================================

-- promotion_violations
CREATE INDEX IF NOT EXISTS idx_promotion_violations_room ON public.promotion_violations(room_name);
CREATE INDEX IF NOT EXISTS idx_promotion_violations_sender ON public.promotion_violations(sender_name);
CREATE INDEX IF NOT EXISTS idx_promotion_violations_sender_id ON public.promotion_violations(sender_id);
CREATE INDEX IF NOT EXISTS idx_promotion_violations_created ON public.promotion_violations(created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_violations_type ON public.promotion_violations(violation_type);

-- message_delete_warnings
CREATE INDEX IF NOT EXISTS idx_message_delete_warnings_room ON public.message_delete_warnings(room_name);
CREATE INDEX IF NOT EXISTS idx_message_delete_warnings_sender ON public.message_delete_warnings(sender_name);
CREATE INDEX IF NOT EXISTS idx_message_delete_warnings_sender_id ON public.message_delete_warnings(sender_id);
CREATE INDEX IF NOT EXISTS idx_message_delete_warnings_created ON public.message_delete_warnings(created_at);

-- member_kicks
CREATE INDEX IF NOT EXISTS idx_member_kicks_room ON public.member_kicks(room_name);
CREATE INDEX IF NOT EXISTS idx_member_kicks_kicked_user ON public.member_kicks(kicked_user_name);
CREATE INDEX IF NOT EXISTS idx_member_kicks_kicked_user_id ON public.member_kicks(kicked_user_id);
CREATE INDEX IF NOT EXISTS idx_member_kicks_created ON public.member_kicks(created_at);

-- member_activities
CREATE INDEX IF NOT EXISTS idx_member_activities_room ON public.member_activities(room_name);
CREATE INDEX IF NOT EXISTS idx_member_activities_user ON public.member_activities(user_name);
CREATE INDEX IF NOT EXISTS idx_member_activities_user_id ON public.member_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_member_activities_type ON public.member_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_member_activities_created ON public.member_activities(created_at);

-- nickname_changes
CREATE INDEX IF NOT EXISTS idx_nickname_changes_room ON public.nickname_changes(room_name);
CREATE INDEX IF NOT EXISTS idx_nickname_changes_user_id ON public.nickname_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_nickname_changes_created ON public.nickname_changes(created_at);

-- profanity_warnings
CREATE INDEX IF NOT EXISTS idx_profanity_warnings_room ON public.profanity_warnings(room_name);
CREATE INDEX IF NOT EXISTS idx_profanity_warnings_sender ON public.profanity_warnings(sender_name);
CREATE INDEX IF NOT EXISTS idx_profanity_warnings_sender_id ON public.profanity_warnings(sender_id);
CREATE INDEX IF NOT EXISTS idx_profanity_warnings_created ON public.profanity_warnings(created_at);

-- reaction_logs
CREATE INDEX IF NOT EXISTS idx_reaction_logs_room ON public.reaction_logs(room_name);
CREATE INDEX IF NOT EXISTS idx_reaction_logs_target ON public.reaction_logs(target_message_id);
CREATE INDEX IF NOT EXISTS idx_reaction_logs_reactor ON public.reaction_logs(reactor_name);
CREATE INDEX IF NOT EXISTS idx_reaction_logs_created ON public.reaction_logs(created_at);

-- report_logs
CREATE INDEX IF NOT EXISTS idx_report_logs_room ON public.report_logs(room_name);
CREATE INDEX IF NOT EXISTS idx_report_logs_reporter ON public.report_logs(reporter_name);
CREATE INDEX IF NOT EXISTS idx_report_logs_reported_user ON public.report_logs(reported_user_name);
CREATE INDEX IF NOT EXISTS idx_report_logs_status ON public.report_logs(status);
CREATE INDEX IF NOT EXISTS idx_report_logs_created ON public.report_logs(created_at);

-- ============================================
-- updated_at 트리거 연결
-- ============================================

DROP TRIGGER IF EXISTS trg_promotion_violations_set_updated_at ON public.promotion_violations;
CREATE TRIGGER trg_promotion_violations_set_updated_at
BEFORE UPDATE ON public.promotion_violations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_report_logs_set_updated_at ON public.report_logs;
CREATE TRIGGER trg_report_logs_set_updated_at
BEFORE UPDATE ON public.report_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 권한 설정 (Supabase RLS)
-- ============================================

-- RLS 활성화 (필요에 따라)
-- ALTER TABLE public.promotion_violations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.message_delete_warnings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.member_kicks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.member_activities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.nickname_changes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.profanity_warnings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.reaction_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

