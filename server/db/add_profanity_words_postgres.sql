-- ============================================
-- 비속어 필터링 강화를 위한 추가 단어 데이터
-- PostgreSQL/Supabase 전용 버전
-- ============================================

-- 추가 비속어 (자모 변형 포함)
INSERT INTO profanity_words (word, type) VALUES
    -- 자모 변형
    ('ㅆㅂ', 'profanity'),
    ('ㅅㅂ', 'profanity'),
    ('ㅈㄹ', 'profanity'),
    ('ㅈ', 'profanity'),
    ('좃', 'profanity'),
    ('ㅈ같', 'profanity'),
    ('좃같', 'profanity'),
    ('ㅅㄲ', 'profanity'),
    ('x끼', 'profanity'),
    ('X끼', 'profanity'),
    
    -- 추가 변형
    ('개새기', 'profanity'),
    ('개쉐끼', 'profanity'),
    ('쉐끼', 'profanity'),
    ('쌔끼', 'profanity'),
    ('병씬', 'profanity'),
    ('벙신', 'profanity'),
    ('미쳤', 'profanity'),
    ('미쳤네', 'profanity'),
    ('지랄하냐', 'profanity'),
    ('개같', 'profanity'),
    
    -- 추가 비속어
    ('씹', 'profanity'),
    ('시발년', 'profanity'),
    ('시발놈', 'profanity'),
    ('씨발년', 'profanity'),
    ('씨발놈', 'profanity'),
    ('개년', 'profanity'),
    ('개놈', 'profanity'),
    ('좆같네', 'profanity'),
    ('좆같은', 'profanity'),
    ('개소리', 'profanity'),
    ('좆소리', 'profanity'),
    ('지랄맞네', 'profanity'),
    ('지랄하네', 'profanity'),
    ('미친놈', 'profanity'),
    ('미친년', 'profanity'),
    ('빡쳐', 'profanity'),
    ('빡치네', 'profanity'),
    ('개씹', 'profanity'),
    ('씹년', 'profanity'),
    ('씹놈', 'profanity')
ON CONFLICT (word) DO NOTHING;

-- 추가 직종 비하 표현
INSERT INTO profanity_words (word, type) VALUES
    -- 의사 관련
    ('의새', 'job_discrimination'),
    ('의룡', 'job_discrimination'),
    ('의사놈', 'job_discrimination'),
    ('의사들', 'job_discrimination'),
    ('의사새기', 'job_discrimination'),
    ('의사쉐끼', 'job_discrimination'),
    
    -- 간호사 관련
    ('간조', 'job_discrimination'),
    ('간호사새기', 'job_discrimination'),
    ('간호사쉐끼', 'job_discrimination'),
    ('간호사놈', 'job_discrimination'),
    ('간호사들', 'job_discrimination'),
    ('조무사새끼', 'job_discrimination'),
    ('조무사년', 'job_discrimination'),
    ('조무사놈', 'job_discrimination'),
    ('간호조무사새끼', 'job_discrimination'),
    ('간호조무사년', 'job_discrimination'),
    
    -- 물리치료사 관련
    ('물치', 'job_discrimination'),
    ('물리치료사새끼', 'job_discrimination'),
    ('물리치료사년', 'job_discrimination'),
    ('물리치료사놈', 'job_discrimination'),
    
    -- 방사선사 관련
    ('방사', 'job_discrimination'),
    ('방사선사새끼', 'job_discrimination'),
    ('방사선사년', 'job_discrimination'),
    ('방사선사놈', 'job_discrimination'),
    
    -- 임상병리사 관련
    ('병리', 'job_discrimination'),
    ('임상병리사새끼', 'job_discrimination'),
    ('임상병리사년', 'job_discrimination'),
    ('임상병리사놈', 'job_discrimination'),
    
    -- 약사 관련
    ('약사놈', 'job_discrimination'),
    ('약사들', 'job_discrimination'),
    ('한의사년', 'job_discrimination'),
    ('한의사놈', 'job_discrimination'),
    
    -- 심평/공단 관련
    ('심평', 'job_discrimination'),
    ('심평원', 'job_discrimination'),
    ('심평새끼', 'job_discrimination'),
    ('심평년', 'job_discrimination'),
    ('심평놈', 'job_discrimination'),
    ('공단', 'job_discrimination'),
    ('건보공단', 'job_discrimination'),
    ('건강보험공단', 'job_discrimination'),
    ('공단새끼', 'job_discrimination'),
    ('공단년', 'job_discrimination'),
    ('공단놈', 'job_discrimination'),
    
    -- 기타 의료직
    ('치과의사새끼', 'job_discrimination'),
    ('치과의사년', 'job_discrimination'),
    ('한방의사새끼', 'job_discrimination'),
    ('한방의사년', 'job_discrimination'),
    ('수의사새끼', 'job_discrimination'),
    ('수의사년', 'job_discrimination')
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
--    psql -h localhost -U username -d database_name -f add_profanity_words_postgres.sql
--    또는 psql에서 직접 실행
--
-- 3. 확인:
--    SELECT COUNT(*) FROM profanity_words WHERE type = 'profanity';
--    SELECT COUNT(*) FROM profanity_words WHERE type = 'job_discrimination';
--
-- ============================================


















