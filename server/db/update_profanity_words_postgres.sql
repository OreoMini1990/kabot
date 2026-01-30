-- ============================================
-- 비속어 필터링 업데이트 (JSON 기반 필터링 규칙 반영)
-- PostgreSQL/Supabase 전용 버전
-- ============================================

-- exact_match: 강한 욕설 (profanity_high)
INSERT INTO profanity_words (word, type) VALUES
    ('씨발', 'profanity'),
    ('시발', 'profanity'),
    ('ㅅㅂ', 'profanity'),
    ('ㅆㅂ', 'profanity'),
    ('좆', 'profanity'),
    ('좆같', 'profanity'),
    ('좆도', 'profanity'),
    ('좆망', 'profanity'),
    ('병신', 'profanity'),
    ('ㅂㅅ', 'profanity'),
    ('지랄', 'profanity'),
    ('ㅈㄹ', 'profanity'),
    ('개새끼', 'profanity'),
    ('새끼야', 'profanity'),
    ('미친놈', 'profanity'),
    ('미친년', 'profanity'),
    ('미친새끼', 'profanity'),
    ('닥쳐', 'profanity'),
    ('꺼져', 'profanity'),
    ('꺼져라', 'profanity'),
    ('뒤져', 'profanity'),
    ('뒤져라', 'profanity'),
    ('죽어', 'profanity'),
    ('죽어라', 'profanity'),
    ('엿먹어', 'profanity'),
    ('엿같', 'profanity'),
    ('등신', 'profanity'),
    ('또라이', 'profanity')
ON CONFLICT (word) DO NOTHING;

-- exact_match: 성적 비하 (sexual_slur_high)
INSERT INTO profanity_words (word, type) VALUES
    ('보지년', 'profanity'),
    ('썅년', 'profanity'),
    ('좆년', 'profanity'),
    ('창년', 'profanity'),
    ('걸레년', 'profanity')
ON CONFLICT (word) DO NOTHING;

-- exact_match: 직종 비하 (명시적) - job_discrimination
INSERT INTO profanity_words (word, type) VALUES
    ('간조년', 'job_discrimination'),
    ('간조주제에', 'job_discrimination'),
    ('간조따리', 'job_discrimination'),
    ('간조새끼', 'job_discrimination'),
    ('물치애들', 'job_discrimination'),
    ('물치따리', 'job_discrimination'),
    ('물치새끼', 'job_discrimination'),
    ('방사따리', 'job_discrimination'),
    ('방사선사따리', 'job_discrimination'),
    ('조무따리', 'job_discrimination'),
    ('조무사따리', 'job_discrimination'),
    ('간호사따리', 'job_discrimination'),
    ('의사따리', 'job_discrimination'),
    ('의새', 'job_discrimination'),
    ('개원의따리', 'job_discrimination'),
    ('동네의사따리', 'job_discrimination')
ON CONFLICT (word) DO NOTHING;

-- exact_match: 집단 비하 (group_slur_strong)
INSERT INTO profanity_words (word, type) VALUES
    ('짱깨', 'profanity'),
    ('쪽바리', 'profanity'),
    ('조선족', 'profanity')
ON CONFLICT (word) DO NOTHING;

-- ============================================
-- 사용 방법
-- ============================================
-- 
-- 1. Supabase 사용 시:
--    - Supabase 대시보드 → SQL Editor
--    - 위 SQL을 복사하여 실행
--
-- 2. PostgreSQL 사용 시:
--    psql -h localhost -U username -d database_name -f update_profanity_words_postgres.sql
--    또는 psql에서 직접 실행
--
-- 3. 확인:
--    SELECT COUNT(*) FROM profanity_words WHERE type = 'profanity';
--    SELECT COUNT(*) FROM profanity_words WHERE type = 'job_discrimination';
--    SELECT word, type FROM profanity_words ORDER BY type, word;
--
-- ============================================

















