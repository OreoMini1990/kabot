-- ============================================
-- reply_to_kakao_log_id 컬럼 추가 마이그레이션
-- 실행 방법: Supabase SQL Editor에서 실행
-- 
-- 목적: 답장 메시지 ID를 kakao_log_id와 DB id로 명확히 분리
-- - reply_to_kakao_log_id: 클라이언트에서 보내는 값 (kakao_log_id)
-- - reply_to_message_id: DB 내부 FK (chat_messages.id 참조)
-- ============================================

-- 1. reply_to_kakao_log_id 컬럼 추가
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS reply_to_kakao_log_id BIGINT;

-- 2. 인덱스 생성 (백필 작업 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_kakao_log_id 
ON public.chat_messages(reply_to_kakao_log_id) 
WHERE reply_to_kakao_log_id IS NOT NULL;

-- 3. room_name과 reply_to_kakao_log_id 복합 인덱스 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_reply_kakao_log_id 
ON public.chat_messages(room_name, reply_to_kakao_log_id) 
WHERE reply_to_kakao_log_id IS NOT NULL;

-- 4. 기존 데이터 백필 (metadata에서 reply_to_message_id가 kakao_log_id일 가능성이 있는 경우)
-- 주의: 이 쿼리는 metadata에 reply_to_message_id가 kakao_log_id 형태로 저장된 경우를 가정합니다.
-- 실제로는 metadata 구조를 확인 후 필요 시 수정하여 실행하세요.
-- UPDATE public.chat_messages
-- SET reply_to_kakao_log_id = CAST(metadata->>'reply_to_message_id' AS BIGINT)
-- WHERE reply_to_kakao_log_id IS NULL
--   AND metadata IS NOT NULL
--   AND metadata->>'reply_to_message_id' IS NOT NULL
--   AND metadata->>'reply_to_message_id' ~ '^[0-9]+$';

-- 완료 확인 쿼리
-- SELECT 
--     COUNT(*) as total_messages,
--     COUNT(reply_to_kakao_log_id) as with_reply_kakao_log_id,
--     COUNT(reply_to_message_id) as with_reply_message_id,
--     COUNT(CASE WHEN reply_to_kakao_log_id IS NOT NULL AND reply_to_message_id IS NULL THEN 1 END) as pending_link
-- FROM public.chat_messages;

