-- ============================================
-- cafe_post_drafts 테이블에 draft_id, status 컬럼 추가 마이그레이션
-- 실행 방법: Supabase SQL Editor에서 실행
-- 
-- 목적: OAuth 연동 후 드래프트 자동 게시 재개 로직을 위한 draft_id 및 status 추가
-- ============================================

-- 1. draft_id 컬럼 추가 (UUID, PK로 변경)
ALTER TABLE public.cafe_post_drafts 
ADD COLUMN IF NOT EXISTS draft_id UUID DEFAULT gen_random_uuid();

-- 기존 레코드에 draft_id 생성
UPDATE public.cafe_post_drafts
SET draft_id = gen_random_uuid()
WHERE draft_id IS NULL;

-- draft_id를 NOT NULL로 변경
ALTER TABLE public.cafe_post_drafts 
ALTER COLUMN draft_id SET NOT NULL;

-- 기존 PK 제약 제거 (user_id UNIQUE)
ALTER TABLE public.cafe_post_drafts 
DROP CONSTRAINT IF EXISTS uq_cafe_post_drafts_user;

-- draft_id를 새로운 PK로 설정
ALTER TABLE public.cafe_post_drafts 
DROP CONSTRAINT IF EXISTS cafe_post_drafts_pkey;

ALTER TABLE public.cafe_post_drafts 
ADD PRIMARY KEY (draft_id);

-- user_id는 UNIQUE 제약 유지 (하지만 PK는 아님)
ALTER TABLE public.cafe_post_drafts 
ADD CONSTRAINT uq_cafe_post_drafts_user_id UNIQUE (user_id);

-- 2. status 컬럼 추가
ALTER TABLE public.cafe_post_drafts 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_oauth';

-- 기존 레코드는 pending_oauth로 설정
UPDATE public.cafe_post_drafts
SET status = 'pending_oauth'
WHERE status IS NULL;

-- status를 NOT NULL로 변경
ALTER TABLE public.cafe_post_drafts 
ALTER COLUMN status SET NOT NULL;

-- 3. error_last 컬럼 추가 (선택사항, 실패 원인 기록용)
ALTER TABLE public.cafe_post_drafts 
ADD COLUMN IF NOT EXISTS error_last TEXT;

-- 4. submitted_at 컬럼 추가 (제출 완료 시각)
ALTER TABLE public.cafe_post_drafts 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_cafe_post_drafts_user_id_status 
ON public.cafe_post_drafts(user_id, status) 
WHERE status IN ('pending_oauth', 'pending_submit');

CREATE INDEX IF NOT EXISTS idx_cafe_post_drafts_status 
ON public.cafe_post_drafts(status) 
WHERE status IN ('pending_oauth', 'pending_submit');

-- 완료 확인 쿼리
-- SELECT 
--     COUNT(*) as total,
--     COUNT(draft_id) as with_draft_id,
--     COUNT(CASE WHEN status = 'pending_oauth' THEN 1 END) as pending_oauth,
--     COUNT(CASE WHEN status = 'pending_submit' THEN 1 END) as pending_submit
-- FROM public.cafe_post_drafts;










