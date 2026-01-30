-- ============================================
-- 일별 통계 자동 집계 함수
-- ============================================

-- user_statistics를 자동으로 채워주는 집계 함수
CREATE OR REPLACE FUNCTION public.aggregate_user_statistics(
  p_room_name VARCHAR(255),
  p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_record RECORD;
  v_hourly_count JSONB;
  v_hour INTEGER;
  v_count INTEGER;
BEGIN
  -- 해당 날짜의 모든 사용자별로 통계 집계
  FOR v_user_record IN
    SELECT DISTINCT
      sender_name,
      sender_id,
      room_name
    FROM public.chat_messages
    WHERE room_name = p_room_name
      AND DATE(created_at) = p_date
  LOOP
    -- 시간대별 메시지 수 집계
    v_hourly_count := '{}'::JSONB;
    
    FOR v_hour IN 0..23 LOOP
      SELECT COUNT(*) INTO v_count
      FROM public.chat_messages
      WHERE room_name = p_room_name
        AND sender_name = v_user_record.sender_name
        AND DATE(created_at) = p_date
        AND EXTRACT(HOUR FROM created_at) = v_hour;
      
      IF v_count > 0 THEN
        v_hourly_count := v_hourly_count || jsonb_build_object(v_hour::TEXT, v_count);
      END IF;
    END LOOP;
    
    -- 통계 UPSERT
    INSERT INTO public.user_statistics (
      user_name,
      user_id,
      room_name,
      date,
      message_count,
      total_char_count,
      total_word_count,
      hourly_message_count
    )
    SELECT
      v_user_record.sender_name,
      v_user_record.sender_id,
      p_room_name,
      p_date,
      COUNT(*),
      COALESCE(SUM(char_count), 0),
      COALESCE(SUM(word_count), 0),
      v_hourly_count
    FROM public.chat_messages
    WHERE room_name = p_room_name
      AND sender_name = v_user_record.sender_name
      AND DATE(created_at) = p_date
    GROUP BY sender_name, sender_id
    ON CONFLICT (user_name, room_name, date)
    DO UPDATE SET
      message_count = EXCLUDED.message_count,
      total_char_count = EXCLUDED.total_char_count,
      total_word_count = EXCLUDED.total_word_count,
      hourly_message_count = EXCLUDED.hourly_message_count,
      updated_at = NOW();
  END LOOP;
END;
$$;

-- 특정 기간의 통계를 일괄 집계하는 함수
CREATE OR REPLACE FUNCTION public.aggregate_user_statistics_range(
  p_room_name VARCHAR(255),
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_date DATE;
BEGIN
  v_current_date := p_start_date;
  
  WHILE v_current_date <= p_end_date LOOP
    PERFORM public.aggregate_user_statistics(p_room_name, v_current_date);
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- 어제 통계 자동 집계 (스케줄 작업용)
CREATE OR REPLACE FUNCTION public.aggregate_yesterday_statistics()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_record RECORD;
  v_yesterday DATE;
BEGIN
  v_yesterday := CURRENT_DATE - INTERVAL '1 day';
  
  -- 모든 채팅방에 대해 어제 통계 집계
  FOR v_room_record IN
    SELECT DISTINCT room_name
    FROM public.chat_messages
    WHERE DATE(created_at) = v_yesterday
  LOOP
    PERFORM public.aggregate_user_statistics(v_room_record.room_name, v_yesterday);
  END LOOP;
END;
$$;















