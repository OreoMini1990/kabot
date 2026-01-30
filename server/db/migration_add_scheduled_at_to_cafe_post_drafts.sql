-- cafe_post_drafts에 scheduled_at 컬럼 추가
-- 임시저장 시 "3분 후 자동 작성" 트리거용. scheduled_at <= now() 일 때만 워커가 처리.
-- OAuth 연동 완료 시 scheduled_at=now 로 바꿔 즉시 처리 가능.
--
-- 실행: Supabase SQL Editor에서 실행 (cafe_post_drafts 테이블이 있는 프로젝트)

ALTER TABLE public.cafe_post_drafts
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cafe_post_drafts.scheduled_at IS '이 시간 이후에만 자동 작성 워커가 처리. NULL이면 즉시 처리(기존 동작).';

CREATE INDEX IF NOT EXISTS idx_cafe_post_drafts_scheduled_at
ON public.cafe_post_drafts(scheduled_at)
WHERE status IN ('pending_oauth', 'pending_submit');
