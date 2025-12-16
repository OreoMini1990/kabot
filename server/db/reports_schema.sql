-- ============================================
-- 신고(reports) 테이블 스키마
-- ============================================

-- 신고 테이블
CREATE TABLE IF NOT EXISTS public.reports (
  id BIGSERIAL PRIMARY KEY,
  reported_message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reporter_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name VARCHAR(255) NOT NULL,
  report_reason TEXT,  -- 신고 사유 (사용자가 입력한 내용)
  report_type VARCHAR(50) DEFAULT 'general',  -- 'spam', 'abuse', 'inappropriate', 'other', 'general'
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'reviewed', 'resolved', 'dismissed'
  reviewed_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,  -- 관리자 처리 내용
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_message_id ON public.reports(reported_message_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_user_id ON public.reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at);

-- updated_at 트리거
DROP TRIGGER IF EXISTS trg_reports_set_updated_at ON public.reports;
CREATE TRIGGER trg_reports_set_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

