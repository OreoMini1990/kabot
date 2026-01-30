-- ============================================
-- chat_id 컬럼 추가 마이그레이션
-- 실행 방법: Supabase SQL Editor에서 실행
-- 
-- 목적: 반응 감지 기능을 위한 chat_id 컬럼 추가
-- - chat_id: 카카오톡 채팅방 ID (매핑 개선용)
-- ============================================

-- 1. chat_id 컬럼 추가
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS chat_id BIGINT;

-- 2. 인덱스 생성 (반응 감지 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id 
ON public.chat_messages(chat_id) 
WHERE chat_id IS NOT NULL;

-- 3. chat_id와 kakao_log_id 복합 인덱스 (반응 매핑 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_kakao_log_id 
ON public.chat_messages(chat_id, kakao_log_id) 
WHERE chat_id IS NOT NULL AND kakao_log_id IS NOT NULL;

-- 4. 기존 데이터 백필 (metadata에서 chat_id 추출)
UPDATE public.chat_messages
SET chat_id = CAST(metadata->>'chat_id' AS BIGINT)
WHERE chat_id IS NULL 
  AND metadata IS NOT NULL 
  AND metadata->>'chat_id' IS NOT NULL
  AND metadata->>'chat_id' ~ '^[0-9]+$';  -- 숫자만 있는 경우만

-- metadata._chat_id도 확인
UPDATE public.chat_messages
SET chat_id = CAST(metadata->>'_chat_id' AS BIGINT)
WHERE chat_id IS NULL 
  AND metadata IS NOT NULL 
  AND metadata->>'_chat_id' IS NOT NULL
  AND metadata->>'_chat_id' ~ '^[0-9]+$';

-- 완료 확인 쿼리
-- SELECT 
--     COUNT(*) as total_messages,
--     COUNT(chat_id) as with_chat_id,
--     COUNT(kakao_log_id) as with_kakao_log_id,
--     COUNT(CASE WHEN chat_id IS NOT NULL AND kakao_log_id IS NOT NULL THEN 1 END) as with_both
-- FROM public.chat_messages;










