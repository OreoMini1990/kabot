-- ============================================
-- naver_oauth_tokens 테이블에 is_active 컬럼 추가 마이그레이션
-- 실행 방법: Supabase SQL Editor에서 실행
-- 
-- 목적: user_id당 active 토큰 1개만 유지하여 중복 토큰 문제 해결
-- ============================================

-- 1. is_active 컬럼 추가
ALTER TABLE public.naver_oauth_tokens 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 기존 레코드는 모두 활성으로 설정
UPDATE public.naver_oauth_tokens
SET is_active = true
WHERE is_active IS NULL;

-- is_active를 NOT NULL로 변경
ALTER TABLE public.naver_oauth_tokens 
ALTER COLUMN is_active SET NOT NULL;

-- 2. Partial Unique Index: user_id당 active는 1개만 허용
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_token_per_user
ON public.naver_oauth_tokens (user_id)
WHERE is_active = true;

-- 3. 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_naver_oauth_tokens_user_id_active 
ON public.naver_oauth_tokens(user_id, is_active) 
WHERE is_active = true;

-- 완료 확인 쿼리
-- SELECT 
--     COUNT(*) as total,
--     COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
--     COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_count
-- FROM public.naver_oauth_tokens;










