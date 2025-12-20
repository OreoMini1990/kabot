-- Phase 1.3: raw_sender, kakao_log_id 컬럼 추가 마이그레이션
-- 실행 방법: Supabase SQL Editor에서 실행

-- 1. raw_sender 컬럼 추가 (원본 sender 문자열, 디버깅용)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS raw_sender VARCHAR(512);

-- 2. kakao_log_id 컬럼 추가 (카카오톡 원본 메시지 logId)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS kakao_log_id BIGINT;

-- 3. 인덱스 생성 (신고/반응 등에서 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_kakao_log_id ON public.chat_messages(kakao_log_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_kakao_log_id ON public.chat_messages(room_name, kakao_log_id);

-- 4. 기존 데이터에 kakao_log_id 채우기 (metadata._id에서)
UPDATE public.chat_messages
SET kakao_log_id = CAST(metadata->>'_id' AS BIGINT)
WHERE kakao_log_id IS NULL 
  AND metadata IS NOT NULL 
  AND metadata->>'_id' IS NOT NULL
  AND metadata->>'_id' ~ '^[0-9]+$';  -- 숫자만 있는 경우만

-- 완료 확인 쿼리
-- SELECT COUNT(*) as total, COUNT(kakao_log_id) as with_kakao_log_id, COUNT(raw_sender) as with_raw_sender
-- FROM public.chat_messages;

