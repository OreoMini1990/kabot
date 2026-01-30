-- naver_oauth_tokens에 user_name(채팅 닉네임) 컬럼 추가
-- 토큰 조회는 user_id 기준, user_name은 연동 표시용

ALTER TABLE public.naver_oauth_tokens
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);

COMMENT ON COLUMN public.naver_oauth_tokens.user_name IS '카카오 채팅 닉네임 (연동 표시용, 조회는 user_id 기준)';
