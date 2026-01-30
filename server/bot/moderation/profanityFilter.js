// ============================================
// 비속어/욕설 필터 모듈
// ============================================

// DB 접근은 Supabase를 사용하도록 변경 (기존 SQLite 방식은 제거)
const db = require('../../db/database');
const CONFIG = require('../config');
const { extractSenderName, readFileSafe, writeFileSafe } = require('../utils/botUtils');

const PROFANITY_FILTER = {
    // 정규화 전처리 함수 (우회 문자 대응)
    normalizeText: function(text) {
        return text
            .toLowerCase()
            .replace(/[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, " ")
            .replace(/\s+/g, " ")
            .replace(/(.)\1{2,}/g, "$1$1")
            .trim();
    },
    
    // DB에서 비속어 목록 로드 (Supabase 사용)
    loadWords: async function() {
        try {
            // Supabase에서 비속어 목록 조회
            const { data: words, error } = await db.supabase
                .from('profanity_words')
                .select('word, type');
            
            if (error) {
                throw error;
            }
            
            if (words && words.length > 0) {
                this.words = words.filter(w => w.type === 'profanity').map(w => w.word);
                this.jobDiscrimination = words.filter(w => w.type === 'job_discrimination').map(w => w.word);
                this.compilePatterns();
                console.log(`[필터] ✅ 비속어 목록 로드 완료: 일반=${this.words.length}개, 직종비하=${this.jobDiscrimination.length}개`);
            } else {
                // DB에 데이터가 없으면 기본값 사용
                throw new Error('DB에 비속어 목록이 없음');
            }
        } catch (error) {
            console.error('[필터] DB 로드 실패, 기본값 사용:', error.message);
            this.words = ["시발", "씨발", "개새끼", "병신", "좆", "지랄", "미친", "미친놈", "미친년",
                "개같은", "개소리", "좆같은", "지랄하네", "빠가", "바보", "멍청이",
                "죽어", "죽어라", "꺼져", "꺼지세요", "닥쳐", "닥치세요", "간조년"];
            this.jobDiscrimination = ["간호사새끼", "간호사년", "간호사놈", "의사새끼", "의사년",
                "약사새끼", "약사년", "한의사새끼"];
            this.compilePatterns();
        }
    },
    
    // 정규식 패턴 컴파일
    compilePatterns: function() {
        const severeProfanityCore = [
            '씨+발+', 'ㅆㅂ', 'ㅅㅂ', '시발', 'ssibal', 'sibal',
            '미친', '미쳤', '미쳤네',
            '좆', 'ㅈ', '좃',
            'ㅈㄹ', '지랄',
            '개새끼', '개새기', '개쉐끼',
            '병신', '병씬', '벙신',
            '지랄하네', '지랄하냐',
            '좆같', 'ㅈ같', '좃같',
            '개같', '개같은',
            '새끼', '쉐끼', '쌔끼'
        ].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        
        const jobKeywords = [
            '의사', '의새', '의룡',
            '간호사', '간호조무사', '간조', '조무사',
            '물리치료사', '물치',
            '방사선사', '방사',
            '임상병리사', '병리',
            '약사', '한의사',
            '심평', '심평원',
            '공단', '건보공단', '건강보험공단'
        ].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        
        const discriminationSuffix = [
            '년들?', '놈들?', '새끼들?', '새끼', 
            'ㅅㄲ', 'x끼', 'X끼',
            '병신', '미친', '좆', 'ㅆㅂ', 'ㅅㅂ'
        ].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        
        this.severeJobPattern = new RegExp(
            `(?:${severeProfanityCore})\\s*(?:${jobKeywords})|` +
            `(?:${jobKeywords})\\s*(?:${discriminationSuffix})`,
            'i'
        );
        
        this.severeProfanityPattern = new RegExp(
            `(?:${severeProfanityCore})`,
            'i'
        );
    },
    
    // 필터링 체크
    check: async function(msg) {
        await this.loadWords();
        const normalizedMsg = this.normalizeText(msg);
        const originalLowerMsg = msg.toLowerCase();
        
        const severeJobMatch = this.severeJobPattern.test(normalizedMsg) || 
                               this.severeJobPattern.test(originalLowerMsg);
        if (severeJobMatch) {
            const match = normalizedMsg.match(this.severeJobPattern) || 
                         originalLowerMsg.match(this.severeJobPattern);
            return { 
                blocked: true, 
                reason: "타직업 비하 표현 (Level 3)", 
                word: match ? match[0] : "직종 비하",
                level: 3
            };
        }
        
        const severeMatch = this.severeProfanityPattern.test(normalizedMsg) || 
                           this.severeProfanityPattern.test(originalLowerMsg);
        if (severeMatch) {
            const match = normalizedMsg.match(this.severeProfanityPattern) || 
                         originalLowerMsg.match(this.severeProfanityPattern);
            return { 
                blocked: true, 
                reason: "비속어 사용 (Level 2)", 
                word: match ? match[0] : "강한 욕설",
                level: 2
            };
        }
        
        for (let i = 0; i < this.words.length; i++) {
            const word = this.words[i].toLowerCase();
            if (normalizedMsg.indexOf(word) !== -1 || originalLowerMsg.indexOf(word) !== -1) {
                return { 
                    blocked: true, 
                    reason: "비속어 사용", 
                    word: this.words[i],
                    level: 1
                };
            }
        }
        
        for (let i = 0; i < this.jobDiscrimination.length; i++) {
            const pattern = this.jobDiscrimination[i].toLowerCase();
            if (normalizedMsg.indexOf(pattern) !== -1 || originalLowerMsg.indexOf(pattern) !== -1) {
                return { 
                    blocked: true, 
                    reason: "타직업 비하 표현", 
                    word: this.jobDiscrimination[i],
                    level: 2
                };
            }
        }
        
        return { blocked: false };
    },
    
    // 로그 기록 (Supabase 사용)
    log: async function(sender, msg, reason, word) {
        try {
            // Supabase에 로그 저장 시도
            const { error } = await db.supabase
                .from('filter_logs')
                .insert({
                    sender: sender,
                    message: msg,
                    reason: reason,
                    word: word || null,
                    created_at: new Date().toISOString()
                });
            
            if (error) {
                throw error;
            }
        } catch (e) {
            console.error('[필터] 로그 저장 실패:', e.message);
            // 파일 로그로 fallback
            try {
                const logFile = CONFIG.FILE_PATHS.FILTER_LOG;
                const logEntry = new Date().toISOString() + " | " + sender + " | " + reason + " | " + msg + "\n";
                const existingLog = readFileSafe(logFile) || "";
                writeFileSafe(logFile, existingLog + logEntry);
            } catch (e2) {
                // 파일 저장도 실패하면 무시
            }
        }
    },
    
    // 경고 횟수 증가 및 반환 (Supabase 사용)
    addWarning: async function(sender) {
        try {
            // 기존 경고 조회
            const { data: existing } = await db.supabase
                .from('warnings')
                .select('id, count')
                .eq('sender', sender)
                .maybeSingle();
            
            if (existing) {
                const newCount = (existing.count || 0) + 1;
                await db.supabase
                    .from('warnings')
                    .update({
                        count: newCount,
                        last_warning_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
                return newCount;
            } else {
                const { data: newWarning } = await db.supabase
                    .from('warnings')
                    .insert({
                        sender: sender,
                        count: 1,
                        last_warning_at: new Date().toISOString(),
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                return 1;
            }
        } catch (e) {
            console.error('[필터] 경고 저장 실패:', e.message);
            return 1;
        }
    },
    
    // 경고 횟수 조회 (Supabase 사용)
    getWarningCount: async function(sender) {
        try {
            const { data: result } = await db.supabase
                .from('warnings')
                .select('count')
                .eq('sender', sender)
                .maybeSingle();
            return result ? (result.count || 0) : 0;
        } catch (e) {
            console.error('[필터] 경고 조회 실패:', e.message);
            return 0;
        }
    },
    
    // 경고 메시지 생성
    // ⚠️ sender는 전체 닉네임 (예: "랩장/AN/서울") 또는 senderId만 전달될 수 있음
    getWarningMessage: function(sender, warningCount) {
        // sender가 전체 닉네임인지 확인 (슬래시 포함 또는 숫자가 아닌 경우)
        let senderName = sender;
        
        // sender가 숫자만 있거나 null이면 기본 메시지
        if (!senderName || /^\d+$/.test(String(senderName).trim())) {
            if (warningCount === 1) {
                return "⚠️ 비속어 사용이 감지되어 채팅 기록에 저장되었습니다.";
            } else if (warningCount === 2) {
                return "⚠️ 비속어 사용이 감지되어 채팅 기록에 저장되었습니다. (2회)";
            } else if (warningCount >= 3) {
                return "🚨 비속어 사용이 관리자에게 보고되었습니다.";
            }
        } else {
            // 전체 닉네임 사용 (예: "랩장/AN/서울")
            if (warningCount === 1) {
                return "⚠️ " + senderName + "님, 비속어 사용이 감지되어 채팅 기록에 저장되었습니다.";
            } else if (warningCount === 2) {
                return "⚠️ " + senderName + "님, 비속어 사용이 감지되어 채팅 기록에 저장되었습니다. (2회)";
            } else if (warningCount >= 3) {
                return "🚨 " + senderName + "님, 비속어 사용이 관리자에게 보고되었습니다.";
            }
        }
        return "⚠️ 부적절한 표현이 감지되었습니다. 존중하는 대화를 부탁드립니다.";
    }
};

module.exports = PROFANITY_FILTER;




