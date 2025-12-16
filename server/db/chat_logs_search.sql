-- ============================================
-- FTS(Full Text Search) 검색 함수
-- ============================================

-- 키워드 검색 함수 (한국어 FTS 사용)
CREATE OR REPLACE FUNCTION public.search_messages(
  p_room_name VARCHAR(255),
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  sender_name VARCHAR(255),
  message_text TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.sender_name,
    cm.message_text,
    cm.created_at
  FROM public.chat_messages cm
  WHERE cm.room_name = p_room_name
    AND cm.message_text_tsvector @@ to_tsquery('simple', p_search_query)
  ORDER BY cm.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 키워드로 메시지 개수 조회
CREATE OR REPLACE FUNCTION public.count_messages_by_keyword(
  p_room_name VARCHAR(255),
  p_search_query TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.chat_messages
  WHERE room_name = p_room_name
    AND message_text_tsvector @@ to_tsquery('simple', p_search_query);
  
  RETURN v_count;
END;
$$;

