// ============================================
// 랩봇 (LABBOT) - Node.js 버전
// 메신저봇R 스타일에서 Node.js WebSocket 환경으로 변환
// ============================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const db = require('./db/database');
const moderationLogger = require('./db/moderationLogger');

// ========== 설정 ==========
const CONFIG = {
    ROOM_NAME: "의운모",
    ROOM_KEY: "의운모",  // Bridge APK용 고정 roomKey (스케줄 공지 자동 발송용)
    ADMIN_USERS: ["랩장/AN/서울"],
    DATA_DIR: "/home/app/iris-core/data",  // 데이터 디렉토리
    FILE_PATHS: {
        SHOP: "/home/app/iris-core/data/상점.txt",
        POINT: "/home/app/iris-core/data/point.txt",
        INVENTORY: "/home/app/iris-core/data/가방.txt",
        CHAT_COUNT: "/home/app/iris-core/data/채팅횟수1",
        ATTENDANCE: "/home/app/iris-core/data/출석.txt",
        STREAK: "/home/app/iris-core/data/연속출석.txt",
        NOTICE: "/home/app/iris-core/data/공지.txt",
        FILTER_LOG: "/home/app/iris-core/data/필터로그.txt",
        WARNING_LOG: "/home/app/iris-core/data/경고기록.txt",
        LAST_NOTICE_TIME: "/home/app/iris-core/data/마지막공지시간.txt",
        LAST_SCHEDULE: "/home/app/iris-core/data/마지막스케줄발송.txt"
    },
    SPREADSHEET_URL: "https://docs.google.com/spreadsheets/d/1v6efxxxRnyxyb3YFBtX6g10QxrchK94he5TSy9EuSP0/edit?gid=0#gid=0",
    NOTICE_INTERVAL: 24 * 60 * 60 * 1000,  // 공지 발송 간격 (24시간, 밀리초)
    NOTICE_ENABLED: true,  // 공지 기능 활성화 여부
    
    // ========== Feature Flags (기능 활성화/비활성화) ==========
    FEATURES: {
        POINT_SYSTEM: false,      // 포인트/랭킹 기능 (false = 비활성화)
        SHOP_SYSTEM: false,       // 상점 기능 (false = 비활성화)
        MEMBERSHIP_SYSTEM: false, // 멤버십/내정보 기능 (false = 비활성화)
        NAVER_CAFE: process.env.NAVER_CAFE_ENABLED === 'true',  // 네이버 카페 질문 기능
        USE_ONNOTI: false,        // onNoti 함수 사용 (WebSocket 환경에서는 false)
        // ========== 새 기능들 ==========
        PROMOTION_DETECTION: true,    // 무단 홍보 감지 (활성화)
        NICKNAME_CHANGE_DETECTION: true, // 닉네임 변경 감지 (활성화)
        MESSAGE_DELETE_DETECTION: true,  // 메시지 삭제 감지 (활성화)
        // JOIN_LEAVE_DETECTION: true,   // 입퇴장 감지 (주석 처리 - 비활성화)
        KICK_DETECTION: true          // 강퇴 감지 (활성화)
    },
    
    // ========== 무단 홍보 감지 설정 ==========
    PROMOTION_DETECTION: {
        // 금지 도메인 목록
        BANNED_DOMAINS: [
            'open.kakao.com',     // 오픈채팅 홍보
            'toss.me',            // 토스 홍보
            'toss.im',            // 토스 홍보
            'discord.gg',         // 디스코드 홍보
            'discord.com/invite'  // 디스코드 초대
        ],
        // 화이트리스트 도메인 (허용)
        WHITELIST_DOMAINS: [
            'naver.com',
            'google.com',
            'youtube.com',
            'youtu.be'
        ],
        // 경고 단계별 메시지
        WARNING_MESSAGES: {
            1: "⚠️ 무단 홍보가 감지되었습니다.\n첫 번째 경고입니다. 무단 홍보는 자제해 주세요.",
            2: "⚠️⚠️ 무단 홍보 2회 감지!\n두 번째 경고입니다. 계속 시 관리자에게 보고됩니다.",
            3: "🚨 무단 홍보 3회 감지!\n관리자에게 보고되었습니다."
        }
    },
    
    // ========== 메시지 삭제 감지 설정 ==========
    MESSAGE_DELETE_DETECTION: {
        WARNING_MESSAGES: {
            1: "💬 메시지 삭제가 감지되었습니다.\n메시지 삭제는 자제해 주세요.",
            2: "⚠️ 24시간 내 메시지 삭제 2회!\n계속 시 관리자에게 보고됩니다.",
            3: "🚨 24시간 내 메시지 삭제 3회!\n관리자에게 보고되었습니다."
        },
        TRACKING_PERIOD_HOURS: 24  // 삭제 횟수 추적 기간 (시간)
    },
    
    // ========== 봇 설정 ==========
    BOT_NAME: "랩봇"  // 봇 닉네임 (멘션용)
};

// 디버깅: 시작 시 NAVER_CAFE 기능 상태 로그
console.log(`[설정] NAVER_CAFE 기능: ${CONFIG.FEATURES.NAVER_CAFE} (환경변수: ${process.env.NAVER_CAFE_ENABLED})`);

// ========== 비속어/욕설 필터 (DB 기반) ==========
const PROFANITY_FILTER = {
    // 정규화 전처리 함수 (우회 문자 대응)
    normalizeText: function(text) {
        return text
            .toLowerCase()
            // 특수문자/띄어쓰기/개행 정규화
            .replace(/[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, " ")
            // 연속 공백을 1칸으로
            .replace(/\s+/g, " ")
            // 같은 문자 3회 이상 → 2회로 축약 (ㅋㅋㅋㅋ → ㅋㅋ, 씨발발발 → 씨발)
            .replace(/(.)\1{2,}/g, "$1$1")
            .trim();
    },
    
    // DB에서 비속어 목록 로드
    loadWords: async function() {
        try {
            const words = await db.prepare('SELECT word, type FROM profanity_words').all();
            this.words = words.filter(w => w.type === 'profanity').map(w => w.word);
            this.jobDiscrimination = words.filter(w => w.type === 'job_discrimination').map(w => w.word);
            
            // 정규식 패턴 컴파일 (성능 최적화)
            this.compilePatterns();
        } catch (error) {
            console.error('[필터] DB 로드 실패, 기본값 사용:', error.message);
            // 기본값 (DB 실패 시)
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
        // 강한 욕설 코어 패턴 (자모 변형 포함)
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
        
        // 직종 키워드 패턴
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
        
        // 비하 접미/접두 패턴
        const discriminationSuffix = [
            '년들?', '놈들?', '새끼들?', '새끼', 
            'ㅅㄲ', 'x끼', 'X끼',
            '병신', '미친', '좆', 'ㅆㅂ', 'ㅅㅂ'
        ].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        
        // Level 3: 즉시 차단 - 욕설(강) + 직종 조합
        // 패턴: (욕설) + (직종) 또는 (직종) + (비하접미)
        this.severeJobPattern = new RegExp(
            `(?:${severeProfanityCore})\\s*(?:${jobKeywords})|` +
            `(?:${jobKeywords})\\s*(?:${discriminationSuffix})`,
            'i'
        );
        
        // Level 2: 경고 - 강한 욕설 단독
        this.severeProfanityPattern = new RegExp(
            `(?:${severeProfanityCore})`,
            'i'
        );
    },
    
    // 필터링 체크 (정규화 + 정규식 기반)
    check: async function(msg) {
        // DB에서 최신 목록 로드 (캐싱 없이 매번 로드 - 관리자가 수정할 수 있으므로)
        await this.loadWords();
        
        // 정규화 전처리 (우회 문자 대응)
        const normalizedMsg = this.normalizeText(msg);
        const originalLowerMsg = msg.toLowerCase();
        
        // Level 3: 즉시 차단 - 욕설(강) + 직종 비하 조합
        const severeJobMatch = this.severeJobPattern.test(normalizedMsg) || 
                               this.severeJobPattern.test(originalLowerMsg);
        if (severeJobMatch) {
            // 매칭된 패턴 추출 (로그용)
            const match = normalizedMsg.match(this.severeJobPattern) || 
                         originalLowerMsg.match(this.severeJobPattern);
            return { 
                blocked: true, 
                reason: "타직업 비하 표현 (Level 3)", 
                word: match ? match[0] : "직종 비하",
                level: 3
            };
        }
        
        // Level 2: 경고 - 강한 욕설 단독
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
        
        // Level 1: 로그만 - 경미한 비속어 (DB 단어 목록 체크)
        // 기존 방식과 병행 (DB에서 관리하는 단어들)
        for (let i = 0; i < this.words.length; i++) {
            const word = this.words[i].toLowerCase();
            // 정규화된 메시지에서 체크
            if (normalizedMsg.indexOf(word) !== -1 || originalLowerMsg.indexOf(word) !== -1) {
                return { 
                    blocked: true, 
                    reason: "비속어 사용", 
                    word: this.words[i],
                    level: 1
                };
            }
        }
        
        // 타직업 비하 단어 목록 체크 (DB에서 관리)
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
    
    // 로그 기록 (DB 기반)
    log: async function(sender, msg, reason, word) {
        try {
            // DB에 저장
            const stmt = db.prepare('INSERT INTO filter_logs (sender, message, reason, word) VALUES (?, ?, ?, ?)');
            await stmt.run(sender, msg, reason, word || null);
        } catch (e) {
            console.error('[필터] 로그 저장 실패:', e.message);
            // 파일 백업 (DB 실패 시)
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
    
    // 경고 횟수 증가 및 반환 (DB 기반)
    addWarning: async function(sender) {
        try {
            // DB에서 조회 또는 생성
            const existing = await db.prepare('SELECT count FROM warnings WHERE sender = ?').get(sender);
            
            if (existing) {
                const newCount = existing.count + 1;
                await db.prepare('UPDATE warnings SET count = ?, last_warning_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE sender = ?').run(newCount, sender);
                return newCount;
            } else {
                await db.prepare('INSERT INTO warnings (sender, count) VALUES (?, 1)').run(sender);
                return 1;
            }
        } catch (e) {
            console.error('[필터] 경고 저장 실패:', e.message);
            return 1; // 오류 시 기본값 1 반환
        }
    },
    
    // 경고 횟수 조회 (DB 기반)
    getWarningCount: async function(sender) {
        try {
            const result = await db.prepare('SELECT count FROM warnings WHERE sender = ?').get(sender);
            return result ? result.count : 0;
        } catch (e) {
            console.error('[필터] 경고 조회 실패:', e.message);
            return 0;
        }
    },
    
    // 경고 메시지 생성
    getWarningMessage: function(sender, warningCount) {
        // sender에서 닉네임 추출
        const senderName = extractSenderName(sender);
        
        // user_id만 있으면 닉네임 없이 표시
        if (!senderName || /^\d+$/.test(String(senderName).trim())) {
            if (warningCount === 1) {
                return "⚠️ 비속어 사용 시 강퇴될 수 있습니다.";
            } else if (warningCount === 2) {
                return "⚠️ 비속어 사용 시 강퇴될 수 있습니다. (2회 경고)";
            } else if (warningCount >= 3) {
                return "🚨 운영진에게 보고됩니다. 강퇴 대상자 등록되었습니다. (3회 경고)";
            }
        } else {
            // 닉네임이 있으면 닉네임 표시
            if (warningCount === 1) {
                return "⚠️ " + senderName + "님, 비속어 사용 시 강퇴될 수 있습니다.";
            } else if (warningCount === 2) {
                return "⚠️ " + senderName + "님, 비속어 사용 시 강퇴될 수 있습니다. (2회 경고)";
            } else if (warningCount >= 3) {
                return "🚨 " + senderName + "님, 운영진에게 보고됩니다. 강퇴 대상자 등록되었습니다. (3회 경고)";
            }
        }
        
        return "⚠️ 부적절한 표현이 감지되었습니다. 존중하는 대화를 부탁드립니다.";
    }
};

// ========== 무단 홍보 감지 시스템 ==========
const PROMOTION_DETECTOR = {
    // 위반 기록 (메모리 캐시, 실제 환경에서는 DB 사용 권장)
    violations: new Map(),
    
    // URL 정규식
    urlRegex: /https?:\/\/[^\s]+/gi,
    
    // URL 검사
    checkMessage: function(msg, sender) {
        if (!CONFIG.FEATURES.PROMOTION_DETECTION) {
            return { detected: false };
        }
        
        const urls = msg.match(this.urlRegex);
        if (!urls || urls.length === 0) {
            return { detected: false };
        }
        
        // 각 URL 검사
        for (const url of urls) {
            const lowerUrl = url.toLowerCase();
            
            // 화이트리스트 도메인 체크
            const isWhitelisted = CONFIG.PROMOTION_DETECTION.WHITELIST_DOMAINS.some(domain => 
                lowerUrl.includes(domain)
            );
            if (isWhitelisted) continue;
            
            // 금지 도메인 체크
            for (const bannedDomain of CONFIG.PROMOTION_DETECTION.BANNED_DOMAINS) {
                if (lowerUrl.includes(bannedDomain)) {
                    // 위반 유형 결정
                    let banType = "링크 홍보";
                    if (bannedDomain.includes("kakao")) banType = "오픈채팅 무단 홍보";
                    else if (bannedDomain.includes("toss")) banType = "토스 무단 홍보";
                    else if (bannedDomain.includes("discord")) banType = "디스코드 무단 홍보";
                    
                    return {
                        detected: true,
                        url: url,
                        domain: bannedDomain,
                        banType: banType
                    };
                }
            }
        }
        
        return { detected: false };
    },
    
    // 위반 횟수 증가 및 반환
    addViolation: function(senderId) {
        const senderKey = String(senderId);
        const current = this.violations.get(senderKey) || { count: 0, lastTime: 0 };
        
        // 24시간 이후면 리셋
        const now = Date.now();
        if (now - current.lastTime > 24 * 60 * 60 * 1000) {
            current.count = 0;
        }
        
        current.count += 1;
        current.lastTime = now;
        this.violations.set(senderKey, current);
        
        return current.count;
    },
    
    // 경고 메시지 생성
    getWarningMessage: function(sender, banType, count, url) {
        const senderName = extractSenderName(sender);
        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        
        let message = `⚠️ ${banType}가 감지되었습니다.\n`;
        message += `📆 시간: ${now}\n`;
        message += `👤 사용자: ${senderName}\n`;
        message += `📌 무단 홍보 감지 ${count}회째입니다.\n`;
        
        if (count >= 3) {
            message += `🚨 관리자 분들은 확인해주세요.`;
        } else {
            message += `관리자 분들은 가려주세요.`;
        }
        
        return message;
    }
};

// ========== 닉네임 변경 감지 시스템 ==========
const NICKNAME_TRACKER = {
    // 닉네임 기록 (메모리 캐시 - 실제 환경에서는 DB 사용)
    nicknames: new Map(),
    
    // 닉네임 확인 및 변경 감지
    checkAndUpdate: function(senderId, senderName, roomId) {
        if (!CONFIG.FEATURES.NICKNAME_CHANGE_DETECTION) {
            return { changed: false };
        }
        
        if (!senderId || !senderName) {
            return { changed: false };
        }
        
        const key = `${roomId}_${senderId}`;
        const previous = this.nicknames.get(key);
        
        // 첫 기록
        if (!previous) {
            this.nicknames.set(key, {
                name: senderName,
                history: [{ name: senderName, timestamp: new Date().toISOString() }]
            });
            console.log(`[닉네임] 첫 기록: ${senderName} (ID: ${senderId})`);
            return { changed: false, isFirst: true };
        }
        
        // 닉네임 변경 확인
        if (previous.name !== senderName) {
            const oldName = previous.name;
            
            // 히스토리 업데이트
            previous.history.push({ name: senderName, timestamp: new Date().toISOString() });
            previous.name = senderName;
            this.nicknames.set(key, previous);
            
            console.log(`[닉네임 변경] ${oldName} -> ${senderName} (ID: ${senderId})`);
            
            return {
                changed: true,
                oldName: oldName,
                newName: senderName,
                history: previous.history
            };
        }
        
        return { changed: false };
    },
    
    // 닉네임 변경 알림 메시지
    getChangeMessage: function(oldName, newName) {
        return `📛 닉네임 변경 감지\n` +
               `이전 닉네임: ${oldName}\n` +
               `현재 닉네임: ${newName}`;
    }
};

// ========== 메시지 삭제 감지 시스템 ==========
const MESSAGE_DELETE_TRACKER = {
    // 삭제 기록 (userId -> 삭제 시간 배열)
    deleteLogs: new Map(),
    
    // 삭제 기록 추가 및 횟수 반환
    addDeleteLog: function(userId) {
        if (!CONFIG.FEATURES.MESSAGE_DELETE_DETECTION) {
            return 0;
        }
        
        const userKey = String(userId);
        const now = new Date();
        const cutoff = new Date(now.getTime() - CONFIG.MESSAGE_DELETE_DETECTION.TRACKING_PERIOD_HOURS * 60 * 60 * 1000);
        
        // 기존 기록 가져오기
        let logs = this.deleteLogs.get(userKey) || [];
        
        // 추적 기간 이전 기록 제거
        logs = logs.filter(time => new Date(time) > cutoff);
        
        // 새 기록 추가
        logs.push(now.toISOString());
        this.deleteLogs.set(userKey, logs);
        
        return logs.length;
    },
    
    // 경고 메시지 생성
    getWarningMessage: function(senderName, count) {
        const messages = CONFIG.MESSAGE_DELETE_DETECTION.WARNING_MESSAGES;
        
        if (count >= 3) {
            return `🚨 ${senderName}님, 24시간 내 메시지 삭제 ${count}회!\n관리자에게 보고되었습니다.`;
        } else if (count === 2) {
            return `⚠️ ${senderName}님, 24시간 내 메시지 삭제 ${count}회!\n계속 시 관리자에게 보고됩니다.`;
        } else {
            return `💬 ${senderName}님, 메시지 삭제가 감지되었습니다.\n메시지 삭제는 자제해 주세요.`;
        }
    }
};

// ========== 입퇴장/강퇴 감지 시스템 ==========
const MEMBER_TRACKER = {
    // Feed 타입 상수 (DBManager 참고)
    FEED_TYPES: {
        INVITE: 1,        // 초대
        LEAVE: 2,         // 퇴장
        OPEN_CHAT_JOIN: 4, // 오픈채팅 입장
        KICK: 6,          // 강퇴
        PROMOTE: 11,      // 부방장 승급
        DEMOTE: 12,       // 부방장 강등
        DELETE: 14,       // 메시지 삭제
        HANDOVER: 15      // 방장 위임
    },
    
    // Feed 메시지 처리
    processFeedMessage: function(feedType, feedData, roomName) {
        const result = { handled: false, message: null, type: null };
        
        switch (feedType) {
            case this.FEED_TYPES.KICK:
                // 강퇴 감지 (활성화)
                if (CONFIG.FEATURES.KICK_DETECTION) {
                    result.handled = true;
                    result.type = 'kick';
                    
                    const kickedUser = feedData?.member?.nickName || feedData?.kickedUser?.nickName || '알 수 없음';
                    const kickedBy = feedData?.kicker?.nickName || feedData?.kickedBy?.name || '관리자';
                    
                    result.message = `⚠️ 강퇴 감지\n` +
                        `${kickedBy}님이 ${kickedUser}님을 내보냈습니다.`;
                    
                    console.log(`[강퇴 감지] ${kickedBy} -> ${kickedUser} (방: ${roomName})`);
                }
                break;
                
            /* ========== 입퇴장 감지 (주석 처리) ==========
            case this.FEED_TYPES.INVITE:
                // 초대 감지
                if (CONFIG.FEATURES.JOIN_LEAVE_DETECTION) {
                    result.handled = true;
                    result.type = 'invite';
                    
                    const inviter = feedData?.inviter?.nickName || '알 수 없음';
                    const invitedUsers = feedData?.members?.map(m => m.nickName).join(', ') || '알 수 없음';
                    
                    result.message = `👋 ${inviter}님이 ${invitedUsers}님을 초대했습니다.`;
                    console.log(`[초대 감지] ${inviter} -> ${invitedUsers} (방: ${roomName})`);
                }
                break;
                
            case this.FEED_TYPES.LEAVE:
                // 퇴장 감지
                if (CONFIG.FEATURES.JOIN_LEAVE_DETECTION) {
                    result.handled = true;
                    result.type = 'leave';
                    
                    const leaveUser = feedData?.member?.nickName || '알 수 없음';
                    const isKicked = feedData?.kicked === true;
                    
                    if (isKicked) {
                        result.message = `⚠️ ${leaveUser}님이 강퇴당했습니다.`;
                    } else {
                        result.message = `👋 ${leaveUser}님이 나갔습니다.`;
                    }
                    console.log(`[퇴장 감지] ${leaveUser} (강퇴: ${isKicked}) (방: ${roomName})`);
                }
                break;
                
            case this.FEED_TYPES.OPEN_CHAT_JOIN:
                // 오픈채팅 입장 감지
                if (CONFIG.FEATURES.JOIN_LEAVE_DETECTION) {
                    result.handled = true;
                    result.type = 'join';
                    
                    const joinUsers = feedData?.members?.map(m => m.nickName).join(', ') || '알 수 없음';
                    
                    result.message = `🎉 ${joinUsers}님이 입장했습니다.`;
                    console.log(`[입장 감지] ${joinUsers} (방: ${roomName})`);
                }
                break;
            ========== 입퇴장 감지 (주석 처리 끝) ========== */
                
            case this.FEED_TYPES.PROMOTE:
                // 부방장 승급 (로그만)
                console.log(`[권한 변경] 부방장 승급: ${feedData?.member?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
                
            case this.FEED_TYPES.DEMOTE:
                // 부방장 강등 (로그만)
                console.log(`[권한 변경] 부방장 강등: ${feedData?.member?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
                
            case this.FEED_TYPES.HANDOVER:
                // 방장 위임 (로그만)
                console.log(`[권한 변경] 방장 위임: ${feedData?.prevHost?.nickName || '알 수 없음'} -> ${feedData?.newHost?.nickName || '알 수 없음'} (방: ${roomName})`);
                break;
        }
        
        return result;
    }
};

// ========== 공지 시스템 (DB 기반) ==========
const NOTICE_SYSTEM = {
    // 스케줄 기반 공지 발송 체크 (DB 기반)
    shouldSendScheduledNotice: async function() {
        if (!CONFIG.NOTICE_ENABLED) {
            console.log('[공지] 공지 기능이 비활성화되어 있습니다.');
            return false;
        }
        
        try {
            // 활성화된 공지 조회 (Supabase에서는 boolean)
            const notices = await db.prepare('SELECT * FROM notices WHERE enabled = true ORDER BY created_at DESC').all();
            
            if (notices.length === 0) {
                console.log('[공지] 활성화된 공지가 없습니다.');
                return false;
            }
            
            // 한국 시간대(KST, UTC+9)로 현재 시간 가져오기
            const now = new Date();
            const kstOffset = 9 * 60; // UTC+9 (분 단위)
            const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
            const kstTime = new Date(utcTime + (kstOffset * 60000));
            
            const currentHour = kstTime.getHours();
            const currentMinute = kstTime.getMinutes();
            const currentDateStr = kstTime.getFullYear() + "-" + 
                                ("0" + (kstTime.getMonth() + 1)).slice(-2) + "-" + 
                                ("0" + kstTime.getDate()).slice(-2);
            
            console.log(`[공지] 스케줄 체크: 현재 시간(KST) ${currentHour}:${String(currentMinute).padStart(2, '0')}, 활성 공지 ${notices.length}개`);
            
            // 각 공지 확인
            for (let i = 0; i < notices.length; i++) {
                const notice = notices[i];
                
                // 만료일 체크
                if (notice.expiry_date) {
                    const expiry = new Date(notice.expiry_date + "T23:59:59");
                    if (now > expiry) {
                        console.log(`[공지] 공지 ID ${notice.id} 만료됨 (만료일: ${notice.expiry_date})`);
                        continue; // 만료됨
                    }
                }
                
                // 스케줄 시간 확인
                if (!notice.schedule_times) {
                    console.log(`[공지] 공지 ID ${notice.id} 스케줄 시간 없음`);
                    continue;
                }
                
                let scheduleTimes;
                try {
                    scheduleTimes = JSON.parse(notice.schedule_times);
                } catch (e) {
                    console.error(`[공지] 공지 ID ${notice.id} 스케줄 시간 파싱 실패:`, e.message);
                    continue;
                }
                
                if (!Array.isArray(scheduleTimes) || scheduleTimes.length === 0) {
                    console.log(`[공지] 공지 ID ${notice.id} 스케줄 시간 배열이 비어있음`);
                    continue;
                }
                
                console.log(`[공지] 공지 ID ${notice.id} 스케줄 시간:`, scheduleTimes);
                
                // 각 스케줄 시간 확인
                for (let j = 0; j < scheduleTimes.length; j++) {
                    const timeStr = scheduleTimes[j].trim();
                    const timeParts = timeStr.split(":");
                    if (timeParts.length !== 2) {
                        console.log(`[공지] 공지 ID ${notice.id} 잘못된 시간 형식: ${timeStr}`);
                        continue;
                    }
                    
                    const scheduleHour = parseInt(timeParts[0], 10);
                    const scheduleMinute = parseInt(timeParts[1], 10);
                    
                    if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
                        console.log(`[공지] 공지 ID ${notice.id} 시간 파싱 실패: ${timeStr}`);
                        continue;
                    }
                    if (scheduleHour < 0 || scheduleHour > 23 || scheduleMinute < 0 || scheduleMinute > 59) {
                        console.log(`[공지] 공지 ID ${notice.id} 시간 범위 오류: ${timeStr}`);
                        continue;
                    }
                    
                    console.log(`[공지] 공지 ID ${notice.id} 시간 비교: 현재 ${currentHour}:${String(currentMinute).padStart(2, '0')} vs 스케줄 ${scheduleHour}:${String(scheduleMinute).padStart(2, '0')}`);
                    
                    // 현재 시간이 스케줄 시간과 정확히 일치하는지 확인
                    if (currentHour === scheduleHour && currentMinute === scheduleMinute) {
                        // 24시간 내 중복 발송 확인 (같은 공지의 같은 시간대) - 보내기 직전에만 확인
                        const scheduleKey = currentDateStr + "_" + timeStr;
                        
                        // 24시간 전 시각 계산 (PostgreSQL TIMESTAMPTZ 기준)
                        const oneDayAgoTimestamp = new Date(kstTime.getTime() - 24 * 60 * 60 * 1000);
                        const oneDayAgoISO = oneDayAgoTimestamp.toISOString();
                        
                        // 같은 공지의 같은 시간대(예: 09:00)가 24시간 이내에 발송되었는지 확인
                        // schedule_key에서 시간 부분(_09:00)을 추출하여 비교
                        const existing = await db.prepare(`
                            SELECT id, sent_at FROM notice_schedules 
                            WHERE notice_id = ? 
                            AND schedule_key LIKE ?
                            AND sent_at >= ?
                            ORDER BY sent_at DESC 
                            LIMIT 1
                        `).get(notice.id, `%_${timeStr}`, oneDayAgoISO);
                        
                        if (!existing) {
                            // 24시간 내 발송 기록 없음 - 발송 기록 저장 후 발송
                            await db.prepare('INSERT INTO notice_schedules (notice_id, schedule_key) VALUES (?, ?)').run(notice.id, scheduleKey);
                            console.log(`[공지] 공지 ID ${notice.id} 발송 예정 (${timeStr}): "${notice.content.substring(0, 50)}..."`);
                            return { shouldSend: true, content: notice.content };
                        } else {
                            console.log(`[공지] 공지 ID ${notice.id} 이미 24시간 내 발송됨 (${timeStr}, 마지막 발송: ${existing.sent_at})`);
                        }
                    }
                }
            }
            
            return false;
        } catch (e) {
            console.error('[공지] 스케줄 체크 실패:', e.message);
            console.error(e);
            return false;
        }
    },
    
    // 공지 읽기 (DB 기반)
    getNotice: async function() {
        try {
            // 활성화된 공지 중 가장 최근 것 조회
            const notice = await db.prepare('SELECT content FROM notices WHERE enabled = true ORDER BY created_at DESC LIMIT 1').get();
            return notice ? notice.content : null;
        } catch (e) {
            console.error('[공지] 조회 실패:', e.message);
            return null;
        }
    },
    
    // 공지 발송 (replies 배열에 추가)
    sendNotice: async function(replies) {
        const notice = await this.getNotice();
        if (notice) {
            replies.push("📢 공지사항\n──────────\n" + notice);
            return true;
        }
        return false;
    },
    
    // 스케줄 공지 발송
    sendScheduledNotice: function(replies, content) {
        replies.push("📢 공지사항\n──────────\n" + content);
        return true;
    }
};

// ========== Phase 4: pending_attachment 캐시 ==========
// 이미지 메시지와 질문 명령어를 연결하기 위한 캐시
const PENDING_ATTACHMENT_CACHE = new Map();
const ATTACHMENT_CACHE_TTL = 10 * 60 * 1000;  // 10분

/**
 * pending attachment 캐시에 이미지 저장
 * @param {string} roomName - 채팅방 이름
 * @param {string} senderId - 발신자 ID
 * @param {string} imageUrl - 이미지 URL
 */
function setPendingAttachment(roomName, senderId, imageUrl) {
    if (!roomName || !senderId || !imageUrl) {
        return;
    }
    
    const key = `${roomName}|${senderId}`;
    PENDING_ATTACHMENT_CACHE.set(key, {
        imageUrl: imageUrl,
        timestamp: Date.now()
    });
    
    console.log(`[이미지 캐시] 저장: key=${key}, url=${imageUrl.substring(0, 50)}...`);
}

/**
 * pending attachment 캐시에서 이미지 조회 및 삭제
 * @param {string} roomName - 채팅방 이름
 * @param {string} senderId - 발신자 ID
 * @returns {string|null} 이미지 URL 또는 null
 */
function getAndClearPendingAttachment(roomName, senderId) {
    if (!roomName || !senderId) {
        return null;
    }
    
    const key = `${roomName}|${senderId}`;
    const cached = PENDING_ATTACHMENT_CACHE.get(key);
    
    if (!cached) {
        return null;
    }
    
    // TTL 체크
    const age = Date.now() - cached.timestamp;
    if (age > ATTACHMENT_CACHE_TTL) {
        PENDING_ATTACHMENT_CACHE.delete(key);
        console.log(`[이미지 캐시] 만료됨: key=${key}, age=${age}ms`);
        return null;
    }
    
    // 조회 후 삭제
    PENDING_ATTACHMENT_CACHE.delete(key);
    console.log(`[이미지 캐시] 조회 및 삭제: key=${key}, url=${cached.imageUrl.substring(0, 50)}...`);
    
    return cached.imageUrl;
}

/**
 * 오래된 캐시 항목 정리 (주기적으로 호출)
 */
function cleanupPendingAttachmentCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, cached] of PENDING_ATTACHMENT_CACHE.entries()) {
        const age = now - cached.timestamp;
        if (age > ATTACHMENT_CACHE_TTL) {
            PENDING_ATTACHMENT_CACHE.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`[이미지 캐시] 정리 완료: ${cleaned}개 항목 삭제`);
    }
}

// 주기적으로 캐시 정리 (5분마다)
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupPendingAttachmentCache, 5 * 60 * 1000);
}

// ========== 유틸리티 함수 ==========

/**
 * 발신자 이름 추출 (Phase 1.2: json.sender_name 우선, fallback으로 sender 파싱)
 * @param {object} json - 메시지 JSON 데이터 (optional)
 * @param {string} sender - 기존 sender 필드 (하위 호환성)
 * @returns {string|null} 발신자 이름
 */
function extractSenderName(json, sender) {
    // json이 없거나 첫 번째 인자가 문자열이면 기존 방식 (하위 호환성)
    if (!json || typeof json === 'string') {
        sender = json || sender;
        json = null;
    }
    
    // 1. json.sender_name_decrypted 최우선 사용 (클라이언트에서 복호화된 값)
    if (json && json.sender_name_decrypted) {
        return json.sender_name_decrypted;
    }
    
    // 2. json.sender_name 또는 json.senderName 사용 (하위 호환성)
    if (json && (json.sender_name || json.senderName)) {
        return json.sender_name || json.senderName;
    }
    
    // 3. json.user_name 사용 (하위 호환성)
    if (json && json.user_name) {
        return json.user_name;
    }
    
    // 2. fallback: sender 파싱
    if (sender) {
        const senderStr = String(sender);
        const parts = senderStr.split('/');
        
        if (parts.length === 1) {
            return /^\d+$/.test(senderStr.trim()) ? null : senderStr.trim();
        }
        
        // 마지막 부분이 숫자면 나머지 전체를 닉네임으로
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart.trim())) {
            return parts.slice(0, -1).join('/').trim();
        }
        
        return senderStr.trim();
    }
    
    return null;
}

/**
 * 발신자 ID 추출 (Phase 1.2: json.sender_id 우선, fallback으로 sender 파싱)
 * @param {object} json - 메시지 JSON 데이터 (optional)
 * @param {string} sender - 기존 sender 필드 (하위 호환성)
 * @returns {string|null} 발신자 ID
 */
function extractSenderId(json, sender) {
    // json이 없거나 첫 번째 인자가 문자열이면 기존 방식 (하위 호환성)
    if (!json || typeof json === 'string') {
        sender = json || sender;
        json = null;
    }
    
    // 1. json.sender_id 우선 사용
    if (json && (json.sender_id || json.senderId || json.userId)) {
        return json.sender_id || json.senderId || json.userId;
    }
    
    // 2. fallback: sender 파싱
    if (sender) {
        const parts = String(sender).split('/');
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart.trim())) {
            return lastPart.trim();
        }
    }
    
    return null;
}

// 권한 체크
function isAdmin(sender) {
    // sender에서 닉네임만 추출 (예: "랩장/AN/서울" -> "랩장")
    const senderName = extractSenderName(sender);
    
    // ADMIN_USERS에서 닉네임만 추출하여 비교
    return CONFIG.ADMIN_USERS.some(admin => {
        const adminName = extractSenderName(admin);
        return adminName === senderName;
    });
}

// 파일 읽기 (에러 처리 포함)
function readFileSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return content ? content.trim() : "";
    } catch (e) {
        console.error('[readFileSafe] Error:', e.message);
        return null;
    }
}

// 파일 쓰기 (에러 처리 포함)
function writeFileSafe(filePath, content) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (e) {
        console.error('[writeFileSafe] Error:', e.message);
        return false;
    }
}

// 포인트 포맷팅
function formatCurrency(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 날짜 포맷팅
function formatDate(date) {
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const day = ("0" + date.getDate()).slice(-2);
    return month + "-" + day;
}

function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const day = ("0" + now.getDate()).slice(-2);
    return year + month + day;
}

// ========== 파일 동기화 (로컬 파일 업로드용) ==========

// ========== 포인트 관리 ==========

function addPoints(sender, amount) {
    const pointsFile = CONFIG.FILE_PATHS.POINT;
    const backupFile = CONFIG.DATA_DIR + "/point_" + getFormattedDate() + ".txt";

    let currentData = readFileSafe(pointsFile);
    if (currentData === null || currentData === "") {
        writeFileSafe(pointsFile, sender + "|0\n");
        currentData = sender + "|0\n";
    }

    const pointsDict = {};
    const lines = currentData.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const parts = lines[i].split("|");
        if (parts.length === 2) {
            pointsDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    }

    if (!(sender in pointsDict)) pointsDict[sender] = 0;
    pointsDict[sender] += amount;

    const newData = Object.keys(pointsDict).map(function(user) {
        return user + "|" + pointsDict[user];
    }).join("\n") + "\n";

    if (!writeFileSafe(pointsFile, newData)) {
        return "파일 저장 중 오류가 발생했습니다.";
    }

    writeFileSafe(backupFile, newData);

    return sender + "님의 포인트가 " + formatCurrency(amount) + "만큼 증가하였습니다. 현재 포인트: " + formatCurrency(pointsDict[sender]);
}

function reducePoints(sender, amount) {
    const pointsFile = CONFIG.FILE_PATHS.POINT;
    const currentData = readFileSafe(pointsFile);
    
    if (currentData === null) {
        return "포인트 파일을 찾을 수 없습니다.";
    }

    const pointsDict = {};
    const lines = currentData.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        const parts = lines[i].split("|");
        if (parts.length === 2 && parts[0] && parts[1]) {
            pointsDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    }

    if (!(sender in pointsDict)) pointsDict[sender] = 0;
    
    if (pointsDict[sender] < amount) {
        amount = pointsDict[sender];
    }
    
    pointsDict[sender] -= amount;

    const newData = Object.keys(pointsDict).map(function(user) {
        return user + "|" + pointsDict[user];
    }).join("\n") + "\n";

    if (!writeFileSafe(pointsFile, newData)) {
        return "파일 저장 중 오류가 발생했습니다.";
    }

    return sender + "님의 포인트가 " + formatCurrency(amount) + "만큼 감소하였습니다. 현재 포인트: " + formatCurrency(pointsDict[sender]);
}

// ========== 채팅 통계 ==========

function recordChatCount(sender) {
    const chatCountRoot = CONFIG.FILE_PATHS.CHAT_COUNT;
    
    if (!fs.existsSync(chatCountRoot)) {
        fs.mkdirSync(chatCountRoot, { recursive: true });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const day = ("0" + now.getDate()).slice(-2);
    
    const currentMonthRoot = path.join(chatCountRoot, year + "-" + month);
    const currentDayRoot = path.join(currentMonthRoot, day);
    
    if (!fs.existsSync(currentMonthRoot)) {
        fs.mkdirSync(currentMonthRoot, { recursive: true });
    }
    if (!fs.existsSync(currentDayRoot)) {
        fs.mkdirSync(currentDayRoot, { recursive: true });
    }

    const fileNameSender = sender.replace(/\//g, '☞');
    const chatCountFile = path.join(currentDayRoot, fileNameSender + ".txt");
    
    let currentCount = 0;
    const existingData = readFileSafe(chatCountFile);
    if (existingData !== null) {
        currentCount = parseInt(existingData) || 0;
    }
    
    currentCount++;
    writeFileSafe(chatCountFile, currentCount.toString());
}

async function getChatRankings(startDate, endDate, title, sender, room = '의운모') {
    try {
        // chatLogger 모듈 로드
        const chatLogger = require('./db/chatLogger');
        
        // DB에서 통계 조회
        const stats = await chatLogger.getUserChatStatistics(room, startDate.toISOString(), endDate.toISOString());
        
        if (!stats || stats.length === 0) {
            return `${title}\n────────\n• 그룹반 전체횟수: 0회\n• ${sender}: 순위 없음\n\n📭 해당 기간에 채팅 데이터가 없습니다.`;
        }
        
        // 사용자별 메시지 수 집계
        const userChatCounts = {};
        let totalChats = 0;
        
        stats.forEach(stat => {
            const userName = stat.user_name || stat.display_name || '알 수 없음';
            const count = stat.message_count || 0;
            userChatCounts[userName] = (userChatCounts[userName] || 0) + count;
            totalChats += count;
        });
        
        // 정렬
        const sortedUsers = Object.keys(userChatCounts).sort(function(a, b) {
            return userChatCounts[b] - userChatCounts[a];
        });
        
        let responseText = title + "\n" + "\u200b".repeat(500) + "\n────────\n";
        responseText += "• 그룹반 전체횟수: " + totalChats.toLocaleString() + "회\n";
        
        const senderRank = sortedUsers.indexOf(sender) + 1;
        if (senderRank > 0) {
            responseText += "• " + sender + ": " + senderRank + "위\n\n";
        } else {
            responseText += "• " + sender + ": 순위 없음\n\n";
        }
        
        const medals = ["🥇", "🥈", "🥉"];
        for (let i = 0; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            const count = userChatCounts[user];
            const percentage = totalChats > 0 ? ((count / totalChats) * 100).toFixed(2) : "0.00";
            
            let rankText = (i + 1) + "위: ";
            if (i < 3) {
                rankText = medals[i] + " " + rankText;
            }
            
            responseText += rankText + user + " (" + count.toLocaleString() + "회 | " + percentage + "%)\n";
            
            if ((i + 1) % 10 === 0) {
                responseText += "\n";
            }
        }
        
        return responseText;
    } catch (error) {
        console.error('[통계] getChatRankings 오류:', error.message);
        return `${title}\n────────\n❌ 통계 조회 중 오류가 발생했습니다: ${error.message}`;
    }
}

// ========== 상점 관리 ==========

function registerItem(itemName, itemPrice, replies) {
    const shopFile = CONFIG.FILE_PATHS.SHOP;
    const currentData = readFileSafe(shopFile) || "";
    
    const newItem = itemName + " : " + itemPrice;
    const updatedData = currentData + (currentData ? "\n" : "") + newItem;

    if (writeFileSafe(shopFile, updatedData)) {
        replies.push(itemName + " 상품이 등록되었습니다. 가격: " + itemPrice);
    } else {
        replies.push("상품 등록 중 오류가 발생했습니다.");
    }
}

function removeItem(itemName, replies) {
    const shopFile = CONFIG.FILE_PATHS.SHOP;
    const shopData = readFileSafe(shopFile);
    
    if (shopData === null || !shopData) {
        replies.push("상점에 등록된 상품이 없습니다.");
        return;
    }

    const items = shopData.split("\n");
    const updatedItems = items.filter(function(item) {
        return !item.startsWith(itemName + " : ");
    });

    if (updatedItems.length === items.length) {
        replies.push("해당 상품을 찾을 수 없습니다.");
        return;
    }

    const updatedData = updatedItems.join("\n");
    if (writeFileSafe(shopFile, updatedData)) {
        replies.push(itemName + " 상품이 제거되었습니다.");
    } else {
        replies.push("상품 제거 중 오류가 발생했습니다.");
    }
}

// ========== 메인 함수 ==========

/**
 * 메시지를 처리하고 응답 배열을 반환합니다.
 * @param {string} room - 채팅방 이름
 * @param {string} msg - 메시지 내용
 * @param {string} sender - 발신자
 * @param {boolean} isGroupChat - 그룹 채팅 여부
 * @returns {Promise<string[]>} 응답 메시지 배열
 */
async function handleMessage(room, msg, sender, isGroupChat, replyToMessageId = null) {
    const replies = [];
    
    // 디버깅: 함수 호출 확인
    console.log(`[handleMessage] 호출됨: room="${room}", msg="${msg.substring(0, 50)}...", sender="${sender}", replyToMessageId=${replyToMessageId}`);
    
    // 채팅 로거 모듈 로드 (함수 최상위에서 한 번만 선언)
    const chatLogger = require('./db/chatLogger');
    
    // 메시지가 암호화된 상태인지 확인 (복호화 실패한 경우 대비)
    // base64로 보이는 경우 복호화 시도 (서버에서 복호화 실패했을 수 있음)
    let processedMsg = msg;
    const isBase64Like = msg && msg.length > 10 && msg.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(msg.trim());
    if (isBase64Like) {
        console.log(`[handleMessage] 경고: 메시지가 여전히 암호화된 상태로 보입니다. 복호화를 시도합니다.`);
        // 간단한 base64 디코딩 시도 (실제 복호화는 서버에서 이미 시도했지만 실패했을 수 있음)
        try {
            const decoded = Buffer.from(msg.trim(), 'base64').toString('utf-8');
            // 디코딩된 결과가 유효한 텍스트인지 확인 (base64만 있는 경우 제외)
            if (decoded && decoded.length > 0 && !decoded.match(/^[A-Za-z0-9+/=]+$/)) {
                processedMsg = decoded;
                console.log(`[handleMessage] base64 디코딩 성공: "${decoded.substring(0, 50)}..."`);
            }
        } catch (e) {
            console.log(`[handleMessage] base64 디코딩 실패: ${e.message}`);
        }
    }
    
    // ========== 무단 홍보 감지 ==========
    if (CONFIG.FEATURES.PROMOTION_DETECTION) {
        const promotionResult = PROMOTION_DETECTOR.checkMessage(processedMsg, sender);
        if (promotionResult.detected) {
            const senderName = extractSenderName(sender);
            const senderId = sender.includes('/') ? sender.split('/')[1] : null;
            const count = PROMOTION_DETECTOR.addViolation(senderId || senderName);
            const warningLevel = Math.min(count, 3);
            const warningMessage = PROMOTION_DETECTOR.getWarningMessage(sender, promotionResult.banType, count, promotionResult.url);
            
            console.log(`[무단 홍보] 감지: ${promotionResult.banType}, URL=${promotionResult.url}, 횟수=${count}`);
            replies.push(warningMessage);
            
            // DB에 저장
            moderationLogger.savePromotionViolation({
                roomName: room,
                senderName: senderName,
                senderId: senderId,
                messageText: processedMsg,
                detectedUrl: promotionResult.url,
                violationType: promotionResult.banType.replace(/\s+/g, '_').toLowerCase(),
                violationCount: count,
                warningLevel: warningLevel
            });
            
            // 3회 이상이면 관리자에게도 알림
            if (count >= 3) {
                console.log(`[무단 홍보] 🚨 3회 이상! 관리자 보고됨: ${senderName}`);
            }
        }
    }
    
    // ========== 신고 기능 처리 (답장 버튼 + !신고만으로 처리, 멘션 불필요) ==========
    const msgTrimmed = processedMsg.trim();
    const msgLower = msgTrimmed.toLowerCase();
    // !신고 또는 ! 신고 (공백 포함) 모두 처리
    const hasReportCommand = /![\s]*신고/.test(msgTrimmed) || msgLower.includes('!신고');
    
    // !신고 명령어가 있으면 처리 (답장 버튼 필수)
    if (hasReportCommand) {
        console.log('[신고] ✅ 신고 요청 감지:', { replyToMessageId, reporter: sender, message: msg.trim() });
        
        // replyToMessageId가 필수 (답장 버튼을 눌러야 함)
        if (!replyToMessageId) {
            const helpMessage = `📋 신고 방법 안내\n\n` +
                `신고하려는 메시지에 답장 버튼을 누르고\n` +
                `!신고 또는 !신고 [사유] 를 입력하세요\n\n` +
                `예시: !신고 부적절한 내용입니다`;
            replies.push(helpMessage);
            return replies;
        }
        
        // !신고 다음 내용 추출 (신고 사유)
        let reportReason = '신고 사유 없음';
        const reportMatch = msgTrimmed.match(/![\s]*신고[\s]*(.*)/i);
        if (reportMatch && reportMatch[1]) {
            const afterReport = reportMatch[1].trim();
            // 멘션 제거 (@랩봇 등)
            const cleanedReason = afterReport.replace(/@\w+/g, '').trim();
            if (cleanedReason) {
                reportReason = cleanedReason;
            }
        }
        
        const targetMessageId = replyToMessageId;
        
        // 신고 처리
            console.log('[신고] 처리 시작:', {
                replyToMessageId: targetMessageId,
                reporter: sender,
                reporterId: sender.includes('/') ? sender.split('/')[1] : null,
                reportReason,
                room: room
            });
        
        try {
            const reportResult = await chatLogger.saveReport(
                targetMessageId,
                sender,
                sender.includes('/') ? sender.split('/')[1] : null,
                reportReason,
                'general'
            );
            
            console.log('[신고] 처리 결과:', reportResult ? '✅ 성공' : '❌ 실패');
            
            if (reportResult) {
                const successMessage = `✅ 신고 접수 완료!\n\n` +
                    `📝 신고 내용이 관리자에게 전달되었습니다.\n` +
                    `🔍 검토 후 적절한 조치가 이루어집니다.\n\n` +
                    `감사합니다. 🙏`;
                replies.push(successMessage);
            } else {
                const errorMessage = `❌ 신고 접수 실패\n\n` +
                    `죄송합니다. 신고 접수 중 오류가 발생했습니다.\n` +
                    `잠시 후 다시 시도해주세요.`;
                replies.push(errorMessage);
            }
        } catch (error) {
            console.error('[신고] 신고 처리 중 예외 발생:', error);
            const errorMessage = `❌ 신고 접수 실패\n\n` +
                `죄송합니다. 신고 접수 중 오류가 발생했습니다.\n` +
                `오류: ${error.message}`;
            replies.push(errorMessage);
        }
        
        return replies; // 신고 처리 후 종료
    }
    
    // 답장 버튼을 눌렀지만 형식이 맞지 않는 경우 (더 이상 멘션 불필요)
    // 이 부분은 제거 (답장 + !신고만으로 처리하므로)
    
    // ========== 채팅방 필터링: "의운모" 채팅방만 반응 ==========
    // room 파라미터가 채팅방 이름 또는 ID일 수 있음
    const roomMatch = room === CONFIG.ROOM_NAME || 
                     (typeof room === 'string' && room.indexOf(CONFIG.ROOM_NAME) !== -1) ||
                     (typeof CONFIG.ROOM_NAME === 'string' && CONFIG.ROOM_NAME.indexOf(room) !== -1);
    
    console.log(`[handleMessage] 채팅방 필터링: roomMatch=${roomMatch}, ROOM_NAME="${CONFIG.ROOM_NAME}", room="${room}"`);
    
    if (!roomMatch) {
        // "의운모" 채팅방이 아니면 응답하지 않음
        console.log(`[handleMessage] 채팅방 불일치로 반환: room="${room}"`);
        return replies; // 빈 배열 반환
    }

    // ========== 스케줄 공지 체크 (메시지 수신 시마다 체크) ==========
    // 메시지가 올 때 Bridge APK가 roomKey를 캐시하므로, 이때 스케줄 공지 발송
    // 주기적 체크는 알림이 없어서 Bridge APK가 roomKey를 찾지 못할 수 있음
    try {
        const noticeResult = await NOTICE_SYSTEM.shouldSendScheduledNotice();
        if (noticeResult && noticeResult.shouldSend && noticeResult.content) {
            NOTICE_SYSTEM.sendScheduledNotice(replies, noticeResult.content);
            console.log(`[스케줄 공지] 메시지 수신 시 발송: "${noticeResult.content.substring(0, 50)}..."`);
        }
    } catch (e) {
        // 공지 체크 오류는 무시하고 메시지 처리 계속
        console.error('[공지] 메시지 처리 중 스케줄 체크 오류:', e.message);
    }
    
    // ========== 비속어 필터링 (모든 메시지에 적용) ==========
    const filterResult = await PROFANITY_FILTER.check(msg);
    if (filterResult.blocked) {
        // 비속어 감지 시 경고 메시지 전송
        const warningCount = await PROFANITY_FILTER.addWarning(sender);
        
        // 발신자 닉네임 추출 (sender가 user_id만 있으면 닉네임 파싱 시도)
        const senderName = extractSenderName(sender);
        
        // Level에 따른 경고 메시지 차등화
        let warningMsg;
        if (filterResult.level === 3) {
            // Level 3: 즉시 강퇴 대상 (욕설 + 직종 비하)
            if (warningCount >= 1) {
                warningMsg = `🚨 ${senderName || "회원"}님, 타직업 비하 표현 사용으로 즉시 강퇴 대상입니다.`;
            } else {
                warningMsg = PROFANITY_FILTER.getWarningMessage(senderName || sender, warningCount);
            }
        } else {
            warningMsg = PROFANITY_FILTER.getWarningMessage(senderName || sender, warningCount);
        }
        
        replies.push(warningMsg);
        
        // 로그 기록 (닉네임과 user_id 모두 저장)
        await PROFANITY_FILTER.log(sender, msg, filterResult.reason, filterResult.word);
        
        // DB에 비속어 경고 저장
        const senderId = sender.includes('/') ? sender.split('/')[1] : null;
        moderationLogger.saveProfanityWarning({
            roomName: room,
            senderName: senderName || sender,
            senderId: senderId,
            messageText: msg,
            detectedWord: filterResult.word,
            warningLevel: filterResult.level || 1,
            warningCount: warningCount
        });
        
        // 비속어 메시지는 차단 (명령어만 처리, 일반 메시지는 무시)
        // return replies; // 주석 처리: 명령어도 처리 가능하도록
    }

    // ========== 명령어 체크 ==========
    // msgTrimmed와 msgLower는 이미 위에서 선언됨
    const trimmedMsg = msgTrimmed; // 별칭 생성 (하위 호환성)
    console.log(`[handleMessage] 명령어 체크: trimmedMsg="${trimmedMsg}", msgLower="${msgLower}"`);
    console.log(`[handleMessage] !이미지 체크: startsWith("!이미지")=${msgLower.startsWith("!이미지")}, startsWith("!image")=${msgLower.startsWith("!image")}`);
    
    // ========== 네이버 카페 질문 기능 (우선순위 높음) ==========
    // !질문을 !hi보다 먼저 체크하여 !질문이 !hi로 매칭되지 않도록 함
    console.log(`[handleMessage] 네이버 카페 체크: msgLower="${msgLower}", NAVER_CAFE=${CONFIG.FEATURES.NAVER_CAFE}, startsWith !질문=${msgLower.startsWith("!질문")}`);
    
    if (CONFIG.FEATURES.NAVER_CAFE && msgLower.startsWith("!질문")) {
        console.log('[네이버 카페] 질문 명령어 처리 시작');
        try {
            const questionText = trimmedMsg.substring(3).trim(); // "!질문" 제거
            const commaIndex = questionText.indexOf(',');
            
            if (commaIndex === -1) {
                replies.push("❌ 질문 형식이 올바르지 않습니다.\n사용법: !질문 제목,내용\n\n예시: !질문 의사 선생님께 질문,증상이 있는데 병원을 가야 할까요?");
                return replies;
            }
            
            const title = questionText.substring(0, commaIndex).trim();
            const content = questionText.substring(commaIndex + 1).trim();
            
            if (!title || title.length === 0) {
                replies.push("❌ 질문 제목을 입력해주세요.\n사용법: !질문 제목,내용");
                return replies;
            }
            
            if (!content || content.length === 0) {
                replies.push("❌ 질문 내용을 입력해주세요.\n사용법: !질문 제목,내용");
                return replies;
            }
            
            // ========== 연속 등록 제한 체크 (1시간 이내 같은 질문) ==========
            const questionSenderName = extractSenderName(sender);
            const questionSenderId = extractSenderId(null, sender) || (sender.includes('/') ? sender.split('/')[1] : null);
            
            // 1시간 이내 같은 제목/내용의 질문 확인
            try {
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                const recentQuestions = await chatLogger.getChatMessagesByPeriod(
                    room,
                    oneHourAgo,
                    new Date().toISOString(),
                    100
                );
                
                // 같은 사용자의 같은 제목/내용 질문 확인
                // 정확한 비교를 위해 질문 내용을 정확히 비교
                const duplicateQuestion = recentQuestions?.find(msg => {
                    if (msg.sender_name !== questionSenderName || !msg.message_text) {
                        return false;
                    }
                    
                    // 이전 질문의 전체 텍스트
                    const prevText = msg.message_text.toLowerCase().trim();
                    // 현재 질문의 전체 텍스트 (제목 + 내용)
                    const currentText = (title + ' ' + content).toLowerCase().trim();
                    
                    // 두 질문이 거의 동일한 경우만 중복으로 판단
                    // 1. 제목이 정확히 일치하고
                    // 2. 내용의 80% 이상이 일치하는 경우
                    const titleMatch = prevText.includes(title.toLowerCase()) && title.length >= 5;
                    
                    // 내용 유사도 계산 (간단한 방법: 공통 단어 비율)
                    const prevWords = prevText.split(/\s+/).filter(w => w.length > 2);
                    const currentWords = currentText.split(/\s+/).filter(w => w.length > 2);
                    const commonWords = prevWords.filter(w => currentWords.includes(w));
                    const similarity = prevWords.length > 0 ? (commonWords.length / prevWords.length) : 0;
                    
                    // 제목이 일치하고 유사도가 80% 이상이거나, 유사도가 90% 이상인 경우만 중복
                    return (titleMatch && similarity >= 0.8) || similarity >= 0.9;
                });
                
                if (duplicateQuestion) {
                    const cafeUrl = 'https://cafe.naver.com/ramrc';
                    replies.push(`⏸️ 연속 등록 제한\n\n` +
                        `1시간 이내에 같은 질문을 등록할 수 없습니다.\n\n` +
                        `카페에 직접 방문하여 작성해주세요:\n` +
                        `${cafeUrl}`);
                    return replies;
                }
            } catch (error) {
                console.error('[네이버 카페] 연속 등록 체크 실패:', error.message);
                // 체크 실패해도 질문 작성은 계속 진행
            }
            
            // Phase 4: 캐시에서 이미지 조회 (우선)
            let previousMessageImage = getAndClearPendingAttachment(room, questionSenderId);
            
            // 캐시에서 못 찾으면 DB 조회 (fallback)
            if (!previousMessageImage) {
                try {
                    // 최근 메시지 조회 (5분 이내)
                    const recentMessages = await chatLogger.getChatMessagesByPeriod(
                        room,
                        new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5분 이내
                        new Date().toISOString(),
                        20
                    );
                    
                    // 같은 사용자의 가장 최근 메시지 중 이미지가 있는 것 찾기 (user_id로 비교)
                    if (recentMessages && recentMessages.length > 0) {
                        for (const msg of recentMessages) {
                            // user_id로 비교 (더 정확함)
                            const msgUserId = msg.user_id || (msg.sender_id ? msg.sender_id : null);
                            const questionUserId = questionSenderId || null;
                            
                            // user_id가 있으면 user_id로 비교, 없으면 sender_name으로 비교
                            const isSameUser = (msgUserId && questionUserId && msgUserId === questionUserId) ||
                                              (!msgUserId && !questionUserId && msg.sender_name === questionSenderName);
                            
                            if (isSameUser && msg.has_image) {
                                // message_attachments 테이블에서 이미지 URL 조회
                                const db = require('./db/db');
                                const { data: attachments } = await db.supabase
                                    .from('message_attachments')
                                    .select('attachment_url')
                                    .eq('message_id', msg.id)
                                    .eq('attachment_type', 'image')
                                    .limit(1)
                                    .single();
                                
                                if (attachments && attachments.attachment_url) {
                                    previousMessageImage = attachments.attachment_url;
                                    console.log('[네이버 카페] 직전 메시지 이미지 발견 (DB 조회, 5분 이내, user_id 일치):', previousMessageImage);
                                    break;
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('[네이버 카페] 직전 메시지 이미지 조회 실패:', error.message);
                    // 이미지 조회 실패해도 질문 작성은 계속 진행
                }
            }
            
            // 환경변수 확인
            const naverEnabled = process.env.NAVER_CAFE_ENABLED === 'true';
            const accessToken = process.env.NAVER_ACCESS_TOKEN;
            const clientId = process.env.NAVER_CLIENT_ID;
            const clientSecret = process.env.NAVER_CLIENT_SECRET;
            const clubidStr = process.env.NAVER_CAFE_CLUBID;
            const menuidStr = process.env.NAVER_CAFE_MENUID;
            const headidStr = process.env.NAVER_CAFE_HEADID; // 말머리 ID (선택사항)
            let publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.SERVER_URL || 'http://211.218.42.222:5002';
            // 프로토콜이 없으면 추가
            if (!publicBaseUrl.startsWith('http://') && !publicBaseUrl.startsWith('https://')) {
                publicBaseUrl = `https://${publicBaseUrl}`;
            }
            
            // 디버깅: 환경변수 값 로깅
            console.log('[네이버 카페] 환경변수 확인:', {
                naverEnabled,
                accessToken: accessToken ? `있음(${accessToken.length}자)` : '없음',
                clientId: clientId ? '있음' : '없음',
                clientSecret: clientSecret ? '있음' : '없음',
                clubidStr: clubidStr || '없음',
                menuidStr: menuidStr || '없음'
            });
            
            if (!naverEnabled) {
                replies.push("❌ 네이버 카페 질문 기능이 현재 비활성화되어 있습니다.");
                return replies;
            }
            
            // Access Token 확인
            if (!accessToken || accessToken.trim() === '') {
                console.error('[네이버 카페] Access Token이 설정되지 않았습니다.');
                if (!clientId || !clientSecret) {
                    console.error('[네이버 카페] Access Token 또는 Client ID/Secret이 설정되지 않았습니다.');
                    replies.push("❌ 네이버 카페 설정 오류가 발생했습니다. 관리자에게 문의해주세요.");
                    return replies;
                }
                // TODO: Client ID/Secret으로 토큰 자동 발급 구현
                console.error('[네이버 카페] Access Token이 없습니다. OAuth 인증이 필요합니다.');
                replies.push("❌ 네이버 카페 인증이 필요합니다. 관리자에게 문의해주세요.");
                return replies;
            }
            
            // clubid, menuid 파싱 및 검증
            if (!clubidStr || !menuidStr) {
                console.error(`[네이버 카페] clubid 또는 menuid가 설정되지 않았습니다. clubid=${clubidStr}, menuid=${menuidStr}`);
                replies.push("❌ 네이버 카페 설정 오류가 발생했습니다. 관리자에게 문의해주세요.");
                return replies;
            }
            
            const clubid = parseInt(clubidStr, 10);
            const menuid = parseInt(menuidStr, 10);
            // headid는 항상 "단톡방질문" 문자열로 전달
            const headid = "단톡방질문"; // 항상 "단톡방질문"으로 고정
            
            if (isNaN(clubid) || isNaN(menuid)) {
                console.error(`[네이버 카페] clubid 또는 menuid가 유효한 숫자가 아닙니다. clubid=${clubidStr}(${clubid}), menuid=${menuidStr}(${menuid})`);
                replies.push("❌ 네이버 카페 설정 오류가 발생했습니다. 관리자에게 문의해주세요.");
                return replies;
            }
            
            console.log(`[네이버 카페] headid 설정: "${headid}" (문자열로 전달, 항상 "단톡방질문")`);
            
            // 네이버 카페 질문 서비스 호출
            const { submitQuestion, saveQuestionWithoutPermission } = require('./integrations/naverCafe/questionService');
            const senderName = extractSenderName(sender);
            // questionSenderId와 previousMessageImage는 위에서 이미 선언됨 (중복 선언 방지)
            
            // headid는 항상 "단톡방질문" 문자열로 전달
            const finalHeadid = headid;
            console.log(`[네이버 카페] headid 최종값: "${finalHeadid}" (문자열)`);
            
            // 네이버 카페 API 호출을 동기적으로 처리하여 완료 후 즉시 응답 반환
            // Bridge APK가 접근성 fallback을 사용하여 알림 없이도 즉시 전송 가능
            console.log(`[네이버 카페] 질문 처리 시작: title="${title}", content="${content.substring(0, 30)}..."`);
            console.log(`[네이버 카페] API 호출 대기 중... (접근성 fallback으로 즉시 전송 예정)`);
            
            // 이미지 다운로드 및 변환 (URL인 경우)
            let imageBuffers = null;
            if (previousMessageImage) {
                try {
                    const axios = require('axios');
                    console.log(`[네이버 카페] 이미지 다운로드 시작: ${previousMessageImage}`);
                    const imageResponse = await axios.get(previousMessageImage, {
                        responseType: 'arraybuffer',
                        timeout: 10000 // 10초 타임아웃
                    });
                    imageBuffers = [Buffer.from(imageResponse.data)];
                    console.log(`[네이버 카페] 이미지 다운로드 완료: ${imageBuffers[0].length} bytes`);
                } catch (error) {
                    console.error(`[네이버 카페] 이미지 다운로드 실패: ${error.message}`);
                    // 이미지 다운로드 실패해도 질문 작성은 계속 진행
                }
            }
            
            try {
                const result = await submitQuestion({
                    senderId: sender,
                    senderName: senderName,
                    roomId: room,
                    title: title,
                    content: content,
                    accessToken: accessToken,
                    clubid: clubid,
                    menuid: menuid,
                    headid: finalHeadid, // 유효한 경우에만 전달
                    images: imageBuffers // 이미지 Buffer 배열 전달
                });
                
                console.log(`[네이버 카페] API 호출 완료: success=${result.success}, error=${result.error || '없음'}`);
                
                if (result.success && result.articleUrl) {
                    // 성공 - 템플릿 형식으로 응답 (질문 답변 포함)
                    let replyMsg = `✅ 질문 작성 완료!\n\nQ. ${title}\n${content}\n\n`;
                    
                    // 이미지 첨부 여부 표시
                    if (previousMessageImage) {
                        replyMsg += `📷 (이미지 첨부)\n\n`;
                    } else {
                        replyMsg += `💡 참고: 사진이 첨부되어 있지 않다면 이미지 첨부도 가능합니다.\n` +
                            `질문 직전에 이미지를 보내시면 함께 첨부됩니다.\n\n`;
                    }
                    
                    replyMsg += `답변하러가기: ${result.articleUrl}`;
                    replies.push(replyMsg);
                } else if (result.error === 'no_permission') {
                    // 권한 없음 - DB에만 저장
                    await saveQuestionWithoutPermission({
                        senderId: sender,
                        senderName: senderName,
                        roomId: room,
                        title: title,
                        content: content,
                        clubid: clubid,
                        menuid: menuid,
                        headid: finalHeadid
                    });
                    
                    let replyMsg = `⏳ 카페 글쓰기 권한이 없어 질문이 임시 저장되었습니다.\n관리자가 확인 후 작성해드리겠습니다.\n\nQ. ${title}\n${content}\n\n`;
                    
                    if (previousMessageImage) {
                        replyMsg += `📷 (이미지 첨부)\n\n`;
                    } else {
                        replyMsg += `💡 참고: 사진이 첨부되어 있지 않다면 이미지 첨부도 가능합니다.\n`;
                    }
                    
                    replies.push(replyMsg);
                } else {
                    // 기타 오류
                    replies.push(`❌ 질문 작성 중 오류가 발생했습니다.\n${result.message || '알 수 없는 오류'}\n\n다시 시도해주시거나 관리자에게 문의해주세요.`);
                }
            } catch (error) {
                console.error('[네이버 카페] 질문 처리 오류:', error);
                console.error('[네이버 카페] 오류 스택:', error.stack);
                replies.push(`❌ 질문 처리 중 오류가 발생했습니다.\n오류: ${error.message}\n\n관리자에게 문의해주세요.`);
            }
            
            // API 호출 완료 후 즉시 응답 반환
            // Bridge APK가 받아서 처리할 때, RemoteInput이 WaitingNotification을 반환하면
            // 하이브리드 모드에서 접근성 방식으로 자동 fallback하여 즉시 전송됨
            console.log(`[네이버 카페] 응답 반환: replies.length=${replies.length}`);
            return replies;
            
        } catch (error) {
            console.error('[네이버 카페] 질문 처리 오류:', error);
            console.error('[네이버 카페] 오류 스택:', error.stack);
            console.error('[네이버 카페] 오류 상세:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            replies.push(`❌ 질문 처리 중 오류가 발생했습니다.\n오류: ${error.message}\n\n관리자에게 문의해주세요.`);
            return replies;
        }
    }
    
    // ========== "!뉴스" 명령어 ==========
    if (msgLower.startsWith("!뉴스") || msgLower.startsWith("!news")) {
        console.log('[handleMessage] !뉴스 명령어 처리');
        
        try {
            const naverNews = require('./integrations/naverSearch/naverNews');
            const clientId = process.env.NAVER_CLIENT_ID;
            const clientSecret = process.env.NAVER_CLIENT_SECRET;
            
            if (!clientId || !clientSecret) {
                replies.push("❌ 네이버 검색 API 인증 정보가 설정되지 않았습니다.\n관리자에게 문의해주세요.");
                return replies;
            }
            
            // 검색어 추출 (!뉴스 뒤의 텍스트)
            let searchQuery = '오늘 뉴스'; // 기본값
            if (msgLower.startsWith("!뉴스 ")) {
                searchQuery = trimmedMsg.substring(4).trim(); // "!뉴스 " 제거
            } else if (msgLower.startsWith("!news ")) {
                searchQuery = trimmedMsg.substring(6).trim(); // "!news " 제거
            }
            if (!searchQuery) {
                searchQuery = '오늘 뉴스'; // 빈 문자열이면 기본값
            }
            
            console.log(`[!뉴스] 검색어: "${searchQuery}"`);
            
            const newsResult = await naverNews.searchTodayNews(clientId, clientSecret, searchQuery, 5);
            
            if (newsResult && newsResult.success) {
                const newsText = `📰 최신 뉴스: ${searchQuery}\n──────────\n${newsResult.title}\n${newsResult.description}\n\n링크: ${newsResult.link}`;
                replies.push(newsText);
                console.log(`[!뉴스] 응답 추가 완료: replies.length=${replies.length}`);
            } else {
                const errorMsg = newsResult?.message || '알 수 없는 오류';
                replies.push(`❌ 뉴스를 가져오는 중 오류가 발생했습니다.\n${errorMsg}`);
                console.log(`[!뉴스] 오류 응답 추가: replies.length=${replies.length}`);
            }
            
            console.log(`[!뉴스] 함수 종료: replies.length=${replies.length}`);
            return replies;
        } catch (error) {
            console.error('[!뉴스] 오류:', error);
            replies.push("❌ 뉴스 조회 중 오류가 발생했습니다.\n오류: " + error.message);
            return replies;
        }
    }
    
    // ========== "!이미지" 명령어 ==========
    if (msgLower.startsWith("!이미지") || msgLower.startsWith("!image")) {
        console.log('[handleMessage] !이미지 명령어 처리');
        
        try {
            const imageFilename = 'catch.JPG';
            const imagePath = path.join('/home/app/iris-core/admin/data/img', imageFilename);
            
            // 이미지 파일 존재 확인
            if (!fs.existsSync(imagePath)) {
                replies.push("❌ 이미지 파일을 찾을 수 없습니다.\n파일 경로: " + imagePath);
                return replies;
            }
            
            // 서버 URL 구성
            let serverUrl = process.env.SERVER_URL || process.env.PUBLIC_BASE_URL || 'http://211.218.42.222:5002';
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = `http://${serverUrl}`;
            }
            
            // 이미지 URL 생성 (정적 파일 서빙 경로 사용: /admin/data/img/)
            const imageUrl = `${serverUrl}/admin/data/img/${imageFilename}`;
            
            console.log(`[!이미지] 이미지 파일 확인: ${imagePath}`);
            console.log(`[!이미지] 이미지 URL 생성: ${imageUrl}`);
            
            // 특별한 형식으로 응답 (서버에서 imageUrl 필드로 처리)
            // replies 배열에 특수 객체를 넣어서 서버에서 imageUrl로 변환
            console.log(`[!이미지] replies 배열에 이미지 객체 추가: imageUrl="${imageUrl}"`);
            replies.push({
                type: 'image',
                text: '📷', // 최소한의 텍스트 (빈 문자열 방지)
                imageUrl: imageUrl
            });
            
            console.log(`[!이미지] replies.length=${replies.length}, replies[0]=${JSON.stringify(replies[0])}`);
            console.log(`[!이미지] 함수 종료: replies.length=${replies.length}, imageUrl="${imageUrl}"`);
            return replies;
        } catch (error) {
            console.error('[!이미지] 오류:', error);
            replies.push("❌ 이미지 전송 중 오류가 발생했습니다.\n오류: " + error.message);
            return replies;
        }
    }
    
    // ========== "!hi" 명령어 ==========
    if (msgLower.startsWith("!hi")) {
        console.log('[handleMessage] !hi 명령어 처리');
        replies.push("helloworld");
        console.log(`[handleMessage] !hi 응답 추가: replies.length=${replies.length}`);
        return replies;
    }
    
    // 명령어가 매칭되지 않은 경우 로그
    if (trimmedMsg.startsWith("!")) {
        console.log(`[handleMessage] ⚠ 알 수 없는 명령어: "${trimmedMsg}"`);
        console.log(`[handleMessage] 명령어 체크 완료, replies.length=${replies.length}`);
    }
    
    // 비속어 필터 통과 후 명령어 처리 계속 진행 (아래 코드 실행)

    // ========== 관리자 명령어 ==========

    // 파일 동기화 확인
    if (msg === '/동기화' || msg === '/sync') {
        if (!isAdmin(sender)) {
            replies.push("[최고관리자 전용 기능이야!]");
            return replies;
        }
        
        // 서버에 업로드된 파일 확인
        const fileName = 'irispy.py';
        const filePath = path.join(CONFIG.DATA_DIR, fileName);
        
        if (fs.existsSync(filePath)) {
            const serverUrl = process.env.SERVER_URL || 'http://211.218.42.222:5002';
            const downloadUrl = `${serverUrl}/sync/file/${fileName}`;
            replies.push(`✅ 서버에 파일이 준비되어 있습니다.\n다운로드 URL: ${downloadUrl}`);
        } else {
            replies.push(`❌ 서버에 파일이 없습니다.\n로컬에서 파일을 업로드해주세요.`);
        }
        
        return replies;
    }

    // 공지 등록/수정
    if (msg.startsWith('/공지등록 ')) {
        if (!isAdmin(sender)) {
            replies.push("권한이 없습니다.");
            return replies;
        }
        
        const noticeContent = msg.substring(6).trim();
        if (noticeContent) {
            if (writeFileSafe(CONFIG.FILE_PATHS.NOTICE, noticeContent)) {
                replies.push("공지가 등록되었습니다.");
            } else {
                replies.push("공지 등록 중 오류가 발생했습니다.");
            }
        } else {
            replies.push("공지 내용을 입력해주세요. 형식: /공지등록 {공지내용}");
        }
        return replies;
    }

    // 스케줄 공지 등록
    if (msg.startsWith('/스케줄공지 ')) {
        if (!isAdmin(sender)) {
            replies.push("권한이 없습니다.");
            return replies;
        }
        
        const scheduleContent = msg.substring(7).trim();
        if (scheduleContent) {
            if (writeFileSafe(CONFIG.FILE_PATHS.NOTICE, scheduleContent)) {
                replies.push("스케줄 공지가 등록되었습니다.\n형식: 만료일|시간1,시간2,시간3|내용");
            } else {
                replies.push("스케줄 공지 등록 중 오류가 발생했습니다.");
            }
        } else {
            replies.push("사용법: /스케줄공지 만료일|시간1,시간2,시간3|공지내용\n예: /스케줄공지 2026-01-24|09:00,13:00,20:59|공지내용");
        }
        return replies;
    }

    // 공지 확인
    if (msg === '/공지') {
        const notice = NOTICE_SYSTEM.getNotice();
        if (notice) {
            const lines = notice.split("\n");
            const header = lines[0];
            let displayNotice = notice;
            
            if (header.includes("|") && header.split("|").length >= 3) {
                displayNotice = lines.slice(1).join("\n");
            }
            
            replies.push("📢 공지사항\n──────────\n" + displayNotice);
        } else {
            replies.push("등록된 공지가 없습니다.");
        }
        return replies;
    }

    // ========== 상점 기능 (Feature Flag로 제어) ==========
    if (CONFIG.FEATURES.SHOP_SYSTEM) {
        // 상품 등록
        if (msg.startsWith('/등록 ')) {
            if (!isAdmin(sender)) {
                replies.push("권한이 없습니다.");
                return replies;
            }
            
            const itemData = msg.substring(4).trim();
            const itemParts = itemData.split('==');
            
            if (itemParts.length === 2) {
                const itemName = itemParts[0].trim();
                const itemPrice = itemParts[1].trim();
                registerItem(itemName, itemPrice, replies);
            } else {
                replies.push("등록 형식이 올바르지 않습니다. 형식: /등록 {상품}=={상품 가격}");
            }
            return replies;
        }

        // 상품 제거
        if (msg.startsWith('/제거 ')) {
            if (!isAdmin(sender)) {
                replies.push("권한이 없습니다.");
                return replies;
            }
            
            const removeItemName = msg.substring(4).trim();
            removeItem(removeItemName, replies);
            return replies;
        }

        // 상품 소모
        if (msg.startsWith('/소모 ')) {
            if (!isAdmin(sender)) {
                replies.push("권한이 없습니다.");
                return replies;
            }
            
            const commandParts = msg.substring(4).trim().split('==');
            if (commandParts.length === 2) {
                const targetUser = commandParts[0].trim();
                const itemName = commandParts[1].trim();

                const inventoryFile = CONFIG.FILE_PATHS.INVENTORY;
                const inventoryData = readFileSafe(inventoryFile);
                
                if (!inventoryData) {
                    replies.push("가방에 등록된 정보가 없습니다.");
                    return replies;
                }

                const userInventory = inventoryData.split("\n");
                const updatedInventory = [];
                let found = false;
                
                for (let i = 0; i < userInventory.length; i++) {
                    if (userInventory[i].startsWith(targetUser + " : ")) {
                        found = true;
                        const items = userInventory[i].substring(targetUser.length + 3).split(", ");
                        const newItemList = [];
                        let itemFound = false;

                        for (let j = 0; j < items.length; j++) {
                            const itemParts = items[j].split(":");
                            const currentItemName = itemParts[0].trim();
                            let itemQuantity = parseInt(itemParts[1].trim());

                            if (currentItemName === itemName && itemQuantity > 0) {
                                itemQuantity--;
                                itemFound = true;
                            }

                            if (itemQuantity > 0) {
                                newItemList.push(currentItemName + ":" + itemQuantity);
                            }
                        }

                        if (!itemFound) {
                            replies.push(targetUser + "님은 해당 상품을 보유하고 있지 않습니다.");
                            return replies;
                        }

                        updatedInventory.push(targetUser + " : " + newItemList.join(", "));
                    } else {
                        updatedInventory.push(userInventory[i]);
                    }
                }

                if (found) {
                    writeFileSafe(inventoryFile, updatedInventory.join("\n"));
                    replies.push(targetUser + "님의 " + itemName + "이(가) 1개 차감되었습니다.");
                } else {
                    replies.push(targetUser + "님의 구매 기록을 찾을 수 없습니다.");
                }
            } else {
                replies.push("명령어 형식이 올바르지 않습니다. 사용법: /소모 닉네임==상품이름");
            }
            return replies;
        }
    }

    // ========== 포인트 기능 (Feature Flag로 제어) ==========
    if (CONFIG.FEATURES.POINT_SYSTEM) {
        // 포인트 증가
        if (msg.startsWith("/포인트증가")) {
            if (!isAdmin(sender)) {
                replies.push("권한이 없습니다.");
                return replies;
            }
            
            const parts = msg.substring(7).trim().split("==");
            if (parts.length === 2) {
                const target = parts[0].trim();
                const amount = parseInt(parts[1].trim());

                if (isNaN(amount) || amount <= 0) {
                    replies.push("포인트는 0보다 큰 숫자여야 합니다.");
                } else {
                    replies.push(addPoints(target, amount));
                }
            } else {
                replies.push("명령어 형식이 올바르지 않습니다. 사용법: /포인트증가 닉네임==포인트양");
            }
            return replies;
        }

        // 포인트 감소
        if (msg.startsWith("/포인트감소")) {
            if (!isAdmin(sender)) {
                replies.push("권한이 없습니다.");
                return replies;
            }
            
            const parts = msg.substring(7).trim().split("==");
            if (parts.length === 2) {
                const target = parts[0].trim();
                const amount = parseInt(parts[1].trim());

                if (isNaN(amount) || amount <= 0) {
                    replies.push("포인트는 0보다 큰 숫자여야 합니다.");
                } else {
                    replies.push(reducePoints(target, amount));
                }
            } else {
                replies.push("명령어 형식이 올바르지 않습니다. 사용법: /포인트감소 닉네임==포인트양");
            }
            return replies;
        }
    }

    // ========== 일반 사용자 명령어 ==========

    // 상점 확인
    if (CONFIG.FEATURES.SHOP_SYSTEM && msg === '/상점') {
        const shopFile = CONFIG.FILE_PATHS.SHOP;
        const shopData = readFileSafe(shopFile);
        
        if (!shopData) {
            replies.push("상점에 등록된 상품이 없습니다.");
            return replies;
        }

        let responseText = "상점 목록\n────────\n";
        const items = shopData.split("\n");

        items.forEach(function(item) {
            if (!item) return;
            const parts = item.split(" : ");
            if (parts.length === 2) {
                responseText += "• " + parts[0].trim() + " (" + parts[1].trim() + "ⓟ)\n";
            }
        });

        replies.push(responseText);
        return replies;
    }

    // 상품 구매
    if (CONFIG.FEATURES.SHOP_SYSTEM && msg.startsWith('/구매 ')) {
        const purchaseItem = msg.substring(4).trim();
        const shopFile = CONFIG.FILE_PATHS.SHOP;
        const shopData = readFileSafe(shopFile);
        
        if (!shopData) {
            replies.push("상점에 등록된 상품이 없습니다.");
            return replies;
        }

        const items = shopData.split("\n");
        let itemPrice = null;

        for (let i = 0; i < items.length; i++) {
            const parts = items[i].split(" : ");
            if (parts.length === 2 && parts[0].trim() === purchaseItem) {
                itemPrice = parseInt(parts[1].trim());
                break;
            }
        }
        
        if (itemPrice !== null) {
            const balanceFile = CONFIG.FILE_PATHS.POINT;
            const balanceData = readFileSafe(balanceFile);
            const balanceDict = {};
            
            if (balanceData) {
                const lines = balanceData.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i]) {
                        const parts = lines[i].split("|");
                        if (parts.length === 2) {
                            balanceDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
                        }
                    }
                }
            }

            if (sender in balanceDict) {
                let userBalance = balanceDict[sender];
                if (userBalance >= itemPrice) {
                    userBalance -= itemPrice;
                    balanceDict[sender] = userBalance;

                    const updatedBalanceData = Object.keys(balanceDict).map(function(key) {
                        return key + "|" + balanceDict[key];
                    }).join("\n");

                    writeFileSafe(balanceFile, updatedBalanceData);

                    const inventoryFile = CONFIG.FILE_PATHS.INVENTORY;
                    const inventoryData = readFileSafe(inventoryFile);
                    const inventoryDict = {};
                    
                    if (inventoryData) {
                        const lines = inventoryData.split("\n");
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i]) {
                                const parts = lines[i].split(" : ");
                                if (parts.length === 2) {
                                    const user = parts[0].trim();
                                    const items = parts[1].split(", ").reduce(function(acc, item) {
                                        const itemParts = item.split(":");
                                        if (itemParts.length === 2) {
                                            acc[itemParts[0].trim()] = parseInt(itemParts[1].trim()) || 0;
                                        }
                                        return acc;
                                    }, {});
                                    inventoryDict[user] = items;
                                }
                            }
                        }
                    }

                    if (!(sender in inventoryDict)) {
                        inventoryDict[sender] = {};
                    }
                    
                    if (!(purchaseItem in inventoryDict[sender])) {
                        inventoryDict[sender][purchaseItem] = 0;
                    }
                    inventoryDict[sender][purchaseItem] += 1;

                    const updatedInventoryData = Object.keys(inventoryDict).map(function(user) {
                        const items = inventoryDict[user];
                        const itemString = Object.keys(items).map(function(itemName) {
                            return itemName + ":" + items[itemName];
                        }).join(", ");
                        return user + " : " + itemString;
                    }).join("\n");

                    writeFileSafe(inventoryFile, updatedInventoryData);

                    replies.push(purchaseItem + " 구매가 완료되었습니다. 잔고: " + formatCurrency(userBalance) + "ⓟ");
                } else {
                    replies.push("잔고가 부족합니다. 현재 잔고: " + formatCurrency(userBalance) + "ⓟ");
                }
            } else {
                replies.push("잔고 정보가 없습니다.");
            }
        } else {
            replies.push("해당 상품을 찾을 수 없습니다.");
        }
        return replies;
    }

    // 가방 확인
    if (CONFIG.FEATURES.SHOP_SYSTEM && msg === '/가방') {
        const inventoryFile = CONFIG.FILE_PATHS.INVENTORY;
        const inventoryData = readFileSafe(inventoryFile);
        
        if (!inventoryData) {
            replies.push("구매 기록이 없습니다.");
            return replies;
        }

        const userInventory = inventoryData.split("\n");
        let responseText = "가방 목록\n────────\n";
        let found = false;

        for (let i = 0; i < userInventory.length; i++) {
            if (userInventory[i].startsWith(sender + " : ")) {
                responseText += userInventory[i] + "\n";
                found = true;
                break;
            }
        }

        if (!found) {
            replies.push("구매 기록이 없습니다.");
        } else {
            replies.push(responseText);
        }
        return replies;
    }

    // 구매 기록
    if (CONFIG.FEATURES.SHOP_SYSTEM && msg === '/구매기록') {
        const inventoryFile = CONFIG.FILE_PATHS.INVENTORY;
        const inventoryData = readFileSafe(inventoryFile);
        
        if (!inventoryData) {
            replies.push("등록된 구매 기록이 없습니다.");
            return replies;
        }

        const userInventory = inventoryData.split("\n");
        let responseText = "구매 기록 목록\n────────\n";

        for (let i = 0; i < userInventory.length; i++) {
            if (userInventory[i]) {
                responseText += userInventory[i] + "\n";
            }
        }

        replies.push(responseText);
        return replies;
    }

    // 채팅 통계
    if (msg === "/이번달 채팅") {
        const now = new Date();
        const year = now.getFullYear();
        const startOfMonth = new Date(year, now.getMonth(), 1);
        const endOfMonth = new Date(year, now.getMonth() + 1, 0);
        const currentMonth = ("0" + (now.getMonth() + 1)).slice(-2);
        const periodText = currentMonth + "월";
        replies.push(await getChatRankings(startOfMonth, endOfMonth, "이번달 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/이번주 채팅") {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const periodText = formatDate(startOfWeek) + " ~ " + formatDate(endOfWeek);
        replies.push(await getChatRankings(startOfWeek, endOfWeek, "이번주 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/지난달 채팅") {
        const now = new Date();
        const year = now.getFullYear();
        const lastMonthDate = new Date(year, now.getMonth() - 1, 1);
        const lastYear = lastMonthDate.getFullYear();
        const lastMonth = ("0" + (lastMonthDate.getMonth() + 1)).slice(-2);
        const startOfLastMonth = new Date(lastYear, lastMonthDate.getMonth(), 1);
        const endOfLastMonth = new Date(lastYear, lastMonthDate.getMonth() + 1, 0);
        const periodText = lastMonth + "월";
        replies.push(await getChatRankings(startOfLastMonth, endOfLastMonth, "저번달 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/지난주 채팅") {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfLastWeek = new Date(now);
        startOfLastWeek.setDate(now.getDate() - dayOfWeek - 7);
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
        const periodText = formatDate(startOfLastWeek) + " ~ " + formatDate(endOfLastWeek);
        replies.push(await getChatRankings(startOfLastWeek, endOfLastWeek, "지난주 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/오늘 채팅") {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const day = today.getDate();
        const startDate = new Date(year, month, day);
        const endDate = new Date(year, month, day);
        const periodText = formatDate(today);
        replies.push(await getChatRankings(startDate, endDate, "오늘 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/어제 채팅") {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const year = yesterday.getFullYear();
        const month = yesterday.getMonth();
        const day = yesterday.getDate();
        const startDate = new Date(year, month, day);
        const endDate = new Date(year, month, day);
        const periodText = formatDate(yesterday);
        replies.push(await getChatRankings(startDate, endDate, "어제 순위 (" + periodText + ")", sender, room));
        return replies;
    }

    if (msg === "/전체 채팅") {
        const startOfAllTime = new Date(2000, 0, 1);
        const endOfAllTime = new Date();
        replies.push(await getChatRankings(startOfAllTime, endOfAllTime, "전체 채팅 순위", sender, room));
        return replies;
    }

    // 랭킹
    if (CONFIG.FEATURES.POINT_SYSTEM && msg === '/랭킹') {
        const balanceFile = CONFIG.FILE_PATHS.POINT;
        const balanceData = readFileSafe(balanceFile);
        const balanceDict = {};

        if (balanceData) {
            const lines = balanceData.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (lines[i]) {
                    const parts = lines[i].split("|");
                    if (parts.length === 2) {
                        balanceDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
                    }
                }
            }
        }

        const sortedUsers = Object.keys(balanceDict).sort(function (a, b) {
            return (balanceDict[b] || 0) - (balanceDict[a] || 0);
        });

        if (sortedUsers.length === 0) {
            replies.push("랭킹 데이터가 없습니다.");
            return replies;
        }

        let result = "랭킹 현황\n─────────────\n";
        const medalList = ["🥇", "🥈", "🥉"];
        
        for (let i = 0; i < Math.min(sortedUsers.length, 3); i++) {
            const user = sortedUsers[i];
            result += medalList[i] + " " + (i + 1) + "위, " + user + "\n";
            result += "포인트: " + formatCurrency(balanceDict[user] || 0) + "ⓟ\n\n";
        }

        result += "\u200b".repeat(500) + "─────────────\n";

        for (let i = 3; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            result += (i + 1) + "위, " + user + "\n";
            result += "포인트: " + formatCurrency(balanceDict[user] || 0) + "ⓟ\n\n";
        }

        replies.push(result);
        return replies;
    }

    // 이번주 현황
    if (CONFIG.FEATURES.POINT_SYSTEM && msg === "/이번주현황") {
        const today = new Date();
        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - today.getDay() + 1);
        firstDayOfWeek.setHours(0, 0, 0, 0);

        const lastDayOfWeek = new Date(today);
        lastDayOfWeek.setDate(today.getDate() - today.getDay() + 7);
        lastDayOfWeek.setHours(23, 59, 59, 999);

        const pointFilesDir = CONFIG.DATA_DIR;
        const pointFilesPrefix = "point_획득_";
        const pointFilesSuffix = ".txt";

        const pointCount = {};
        const currentDate = new Date(firstDayOfWeek);
        
        while (currentDate <= lastDayOfWeek) {
            const currentDateForFile = currentDate.getFullYear() + ("0" + (currentDate.getMonth() + 1)).slice(-2) + ("0" + currentDate.getDate()).slice(-2);
            const pointFile = path.join(pointFilesDir, pointFilesPrefix + currentDateForFile + pointFilesSuffix);
            
            const pointData = readFileSafe(pointFile);
            if (pointData) {
                const lines = pointData.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i]) continue;
                    const parts = lines[i].split("|");
                    if (parts.length === 2) {
                        const user = parts[0].trim();
                        const point = parseInt(parts[1].trim()) || 0;
                        if (!(user in pointCount)) {
                            pointCount[user] = 0;
                        }
                        pointCount[user] += point;
                    }
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        const sortedUsers = Object.keys(pointCount).sort(function(a, b) {
            return pointCount[b] - pointCount[a];
        });

        if (sortedUsers.length === 0) {
            replies.push("이번 주 포인트를 획득한 사람이 없습니다.");
            return replies;
        }
        
        let result = "📅 이번 주 포인트 순위" + "\u200b".repeat(500) + "\n───────────────\n";
        const medals = ["🥇", "🥈", "🥉"];

        for (let i = 0; i < sortedUsers.length; i++) {
            const rank = (i < 3) ? medals[i] : (i + 1) + ".";
            result += rank + " " + sortedUsers[i] + " (ⓟ " + pointCount[sortedUsers[i]] + ")\n";
        }

        replies.push(result);
        return replies;
    }

    // 내정보 (멤버십 기능은 Google Sheets API 필요 - Node.js에서는 axios 등 사용 필요)
    if (CONFIG.FEATURES.MEMBERSHIP_SYSTEM && msg === "/내정보") {
        replies.push("멤버십 기능은 현재 비활성화되어 있습니다.");
        return replies;
    }

    // 멤버십
    if (CONFIG.FEATURES.MEMBERSHIP_SYSTEM && msg === "/멤버십") {
        replies.push("멤버십 기능은 현재 비활성화되어 있습니다.");
        return replies;
    }

    // 사용법
    if (msg === '/사용법') {
        // 관리자 전용 기능
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        let usageGuide = "\n─────────────\n" +
            "💬 채팅 조회 [특정기간 채팅 내역을 조회해요]\n" +
            "/전체 채팅\n" +
            "/이번달 채팅\n" +
            "/이번주 채팅\n" +
            "/저번달 채팅\n" +
            "/저번주 채팅\n" +
            "/오늘 채팅\n" +
            "/어제 채팅\n\n" +
            "📊 통계 [채팅 통계를 확인해요]\n" +
            "/통계\n" +
            "/이번주 통계\n" +
            "/이번달 통계\n\n";
        
        if (CONFIG.FEATURES.POINT_SYSTEM) {
            usageGuide += "🏆 랭킹 [사용자별 포인트 현황을 알 수 있어요]\n" +
                "/랭킹\n" +
                "/이번주현황\n\n";
        }
        
        if (CONFIG.FEATURES.SHOP_SYSTEM) {
            usageGuide += "🏪 상점관련\n" +
                "/상점\n" +
                "/구매 상품이름\n" +
                "/가방\n" +
                "/구매기록\n\n";
        }
        
        usageGuide += "📢 공지\n" +
            "/공지\n\n";
        
        if (CONFIG.FEATURES.MEMBERSHIP_SYSTEM) {
            usageGuide += "👤 내 정보\n" +
                "/내정보\n" +
                "/멤버십";
        }
        
        replies.push("봇사용법" + "\u200b".repeat(500) + usageGuide);
        return replies;
    }

    // 관리자 기능 안내
    if (msg === '/관리자') {
        if (!isAdmin(sender)) {
            replies.push("권한이 없습니다.");
            return replies;
        }
        
        let usageGuide = "\n─────────────\n";
        
        if (CONFIG.FEATURES.POINT_SYSTEM) {
            usageGuide += "💰 포인트관련\n" +
                "/포인트증가 닉네임 == 금액\n" +
                "/포인트감소 닉네임 == 금액\n\n";
        }
        
        if (CONFIG.FEATURES.SHOP_SYSTEM) {
            usageGuide += "🛒 상점관련\n" +
                "/등록 상품이름 == 가격\n" +
                "/제거 상품이름\n" +
                "/소모 닉네임 == 상품이름\n\n";
        }
        
        usageGuide += "📢 공지관련\n" +
            "/공지등록 {공지내용}\n\n" +
            "⚠️ 경고관련\n" +
            "/경고확인 [닉네임]\n" +
            "/경고초기화 닉네임";
        
        replies.push("관리자기능" + "\u200b".repeat(500) + usageGuide);
        return replies;
    }

    // 경고 확인
    if (msg.startsWith('/경고확인')) {
        if (!isAdmin(sender)) {
            replies.push("권한이 없습니다.");
            return replies;
        }
        
        const targetUser = msg.substring(5).trim();
        
        if (!targetUser) {
            const warningFile = CONFIG.FILE_PATHS.WARNING_LOG;
            const warningData = readFileSafe(warningFile);
            
            if (!warningData) {
                replies.push("경고 기록이 없습니다.");
                return replies;
            }
            
            const lines = warningData.split("\n");
            let responseText = "전체 경고 기록\n──────────\n";
            let hasWarning = false;
            
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i]) continue;
                const parts = lines[i].split("|");
                if (parts.length === 2) {
                    const user = parts[0].trim();
                    const count = parseInt(parts[1].trim()) || 0;
                    if (count > 0) {
                        responseText += "• " + user + ": " + count + "회\n";
                        hasWarning = true;
                    }
                }
            }
            
            if (!hasWarning) {
                replies.push("경고 기록이 없습니다.");
            } else {
                replies.push(responseText);
            }
        } else {
            const warningCount = PROFANITY_FILTER.getWarningCount(targetUser);
            if (warningCount > 0) {
                replies.push(targetUser + "님의 경고 횟수: " + warningCount + "회");
            } else {
                replies.push(targetUser + "님의 경고 기록이 없습니다.");
            }
        }
        return replies;
    }

    // 경고 초기화
    if (msg.startsWith('/경고초기화 ')) {
        if (!isAdmin(sender)) {
            replies.push("권한이 없습니다.");
            return replies;
        }
        
        const targetUser = msg.substring(7).trim();
        
        if (!targetUser) {
            replies.push("사용법: /경고초기화 닉네임");
            return replies;
        }
        
        try {
            const warningFile = CONFIG.FILE_PATHS.WARNING_LOG;
            const warningData = readFileSafe(warningFile);
            const warningDict = {};
            
            if (warningData) {
                const lines = warningData.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i]) continue;
                    const parts = lines[i].split("|");
                    if (parts.length === 2) {
                        const user = parts[0].trim();
                        if (user !== targetUser) {
                            warningDict[user] = parseInt(parts[1].trim()) || 0;
                        }
                    }
                }
            }
            
            const newWarningData = Object.keys(warningDict).map(function(user) {
                return user + "|" + warningDict[user];
            }).join("\n") + "\n";
            
            writeFileSafe(warningFile, newWarningData);
            replies.push(targetUser + "님의 경고 기록이 초기화되었습니다.");
        } catch (e) {
            replies.push("경고 초기화 중 오류가 발생했습니다.");
        }
        return replies;
    }

    // ========== 채팅 조회 기능 (관리자 전용) ==========
    // 전체 채팅
    if (msg === '/전체 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const messages = await chatLogger.getChatMessagesByPeriod(room, '1970-01-01', new Date().toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📜 전체 채팅 (최근 ${messages.length}개)\n──────────\n`;
            messages.slice(-50).forEach(msg => {
                const time = new Date(msg.created_at).toLocaleString('ko-KR');
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 100)}${msg.message_text.length > 100 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 오늘 채팅
    if (msg === '/오늘 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, today.toISOString(), tomorrow.toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 오늘 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 오늘 채팅 (${messages.length}개)\n──────────\n`;
            messages.forEach(msg => {
                const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 80)}${msg.message_text.length > 80 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 어제 채팅
    if (msg === '/어제 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const today = new Date(yesterday);
            today.setDate(today.getDate() + 1);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, yesterday.toISOString(), today.toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 어제 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 어제 채팅 (${messages.length}개)\n──────────\n`;
            messages.forEach(msg => {
                const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 80)}${msg.message_text.length > 80 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 이번주 채팅
    if (msg === '/이번주 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfWeek = new Date(today);
            firstDayOfWeek.setDate(today.getDate() - today.getDay() + 1);
            firstDayOfWeek.setHours(0, 0, 0, 0);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, firstDayOfWeek.toISOString(), new Date().toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 이번주 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 이번주 채팅 (${messages.length}개)\n──────────\n`;
            messages.slice(-50).forEach(msg => {
                const time = new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 60)}${msg.message_text.length > 60 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 이번달 채팅
    if (msg === '/이번달 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            firstDayOfMonth.setHours(0, 0, 0, 0);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, firstDayOfMonth.toISOString(), new Date().toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 이번달 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 이번달 채팅 (${messages.length}개)\n──────────\n`;
            messages.slice(-50).forEach(msg => {
                const time = new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 60)}${msg.message_text.length > 60 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 저번주 채팅
    if (msg === '/저번주 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfThisWeek = new Date(today);
            firstDayOfThisWeek.setDate(today.getDate() - today.getDay() + 1);
            firstDayOfThisWeek.setHours(0, 0, 0, 0);
            
            const firstDayOfLastWeek = new Date(firstDayOfThisWeek);
            firstDayOfLastWeek.setDate(firstDayOfLastWeek.getDate() - 7);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, firstDayOfLastWeek.toISOString(), firstDayOfThisWeek.toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 저번주 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 저번주 채팅 (${messages.length}개)\n──────────\n`;
            messages.slice(-50).forEach(msg => {
                const time = new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 60)}${msg.message_text.length > 60 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 저번달 채팅
    if (msg === '/저번달 채팅') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            lastDayOfLastMonth.setHours(23, 59, 59, 999);
            
            const messages = await chatLogger.getChatMessagesByPeriod(room, firstDayOfLastMonth.toISOString(), lastDayOfLastMonth.toISOString(), 1000);
            if (messages.length === 0) {
                replies.push("📭 저번달 저장된 채팅이 없습니다.");
                return replies;
            }
            
            let result = `📅 저번달 채팅 (${messages.length}개)\n──────────\n`;
            messages.slice(-50).forEach(msg => {
                const time = new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                result += `[${time}] ${msg.sender_name}: ${msg.message_text.substring(0, 60)}${msg.message_text.length > 60 ? '...' : ''}\n`;
            });
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 채팅 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 통계 기능
    if (msg === '/통계' || msg === '/이번주 통계') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfWeek = new Date(today);
            firstDayOfWeek.setDate(today.getDate() - today.getDay() + 1);
            firstDayOfWeek.setHours(0, 0, 0, 0);
            
            const stats = await chatLogger.getUserChatStatistics(room, firstDayOfWeek.toISOString().split('T')[0], today.toISOString().split('T')[0]);
            const mostReacted = await chatLogger.getMostReactedUser(room, firstDayOfWeek.toISOString(), today.toISOString());
            
            if (stats.length === 0) {
                replies.push("📊 이번주 통계 데이터가 없습니다.");
                return replies;
            }
            
            // TOP 3 사용자
            const top3 = stats.slice(0, 3);
            let result = "🗣 이번 주 말 많은 TOP 3\n──────────\n";
            top3.forEach((user, index) => {
                // user_statistics 테이블의 필드명: user_name, message_count
                const userName = user.user_name || user.sender_name || '알 수 없음';
                const messageCount = user.message_count || 0;
                result += `${index + 1}위: ${userName}님 (${messageCount}회)\n`;
            });
            
            // 가장 반응 많이 받은 사용자
            if (mostReacted) {
                result += `\n⭐ 가장 반응 많이 받은 유저\n──────────\n`;
                result += `1위: ${mostReacted.user_name}님 (${mostReacted.reaction_count}회)\n`;
            }
            
            // 관찰자 비율 계산
            const totalMessages = stats.reduce((sum, s) => sum + s.message_count, 0);
            const activeUsers = stats.filter(s => s.message_count > 0).length;
            const observerCount = stats.length - activeUsers;
            const observerRate = stats.length > 0 ? Math.round((observerCount / stats.length) * 100) : 0;
            result += `\n👀 읽기만 하는 관찰자 비율: ${observerRate}%\n`;
            
            // 가장 활발한 시간대
            const hourlyCounts = {};
            stats.forEach(user => {
                if (user.hourly_message_count) {
                    Object.entries(user.hourly_message_count).forEach(([hour, count]) => {
                        hourlyCounts[hour] = (hourlyCounts[hour] || 0) + count;
                    });
                }
            });
            
            let maxHour = 0;
            let maxCount = 0;
            Object.entries(hourlyCounts).forEach(([hour, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    maxHour = parseInt(hour);
                }
            });
            
            if (maxHour >= 0) {
                const nextHour = (maxHour + 1) % 24;
                result += `\n🔥 이번 주 가장 활발했던 시간대: ${maxHour}–${nextHour}시\n`;
            }
            
            // 주제별 통계 (향후 확장용 - 현재는 기본 메시지만 표시)
            result += `\n🧩 주제별 재미 통계\n──────────\n`;
            result += `(주제 분석 기능은 향후 추가 예정)\n`;
            
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 통계 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 이번달 통계
    if (msg === '/이번달 통계') {
        if (!isAdmin(sender)) {
            replies.push("❌ 권한이 없습니다. 관리자 전용 기능입니다.");
            return replies;
        }
        
        try {
            const today = new Date();
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            
            const stats = await chatLogger.getUserChatStatistics(room, firstDayOfMonth.toISOString().split('T')[0], today.toISOString().split('T')[0]);
            const mostReacted = await chatLogger.getMostReactedUser(room, firstDayOfMonth.toISOString(), today.toISOString());
            
            if (stats.length === 0) {
                replies.push("📊 이번달 통계 데이터가 없습니다.");
                return replies;
            }
            
            // TOP 3 사용자
            const top3 = stats.slice(0, 3);
            let result = "🗣 이번 달 말 많은 TOP 3\n──────────\n";
            top3.forEach((user, index) => {
                // user_statistics 테이블의 필드명: user_name, message_count
                const userName = user.user_name || user.sender_name || '알 수 없음';
                const messageCount = user.message_count || 0;
                result += `${index + 1}위: ${userName}님 (${messageCount}회)\n`;
            });
            
            // 가장 반응 많이 받은 사용자
            if (mostReacted) {
                result += `\n⭐ 가장 반응 많이 받은 유저\n──────────\n`;
                result += `1위: ${mostReacted.user_name}님 (${mostReacted.reaction_count}회)\n`;
            }
            
            replies.push(result);
        } catch (error) {
            replies.push(`❌ 통계 조회 중 오류: ${error.message}`);
        }
        return replies;
    }
    
    // 함수 끝에서 replies 상태 확인
    console.log(`[handleMessage] 함수 종료: replies.length=${replies.length}`);
    if (replies.length > 0) {
        console.log(`[handleMessage] replies 내용: ${JSON.stringify(replies).substring(0, 200)}...`);
    } else {
        console.log(`[handleMessage] ⚠⚠⚠ 빈 replies 배열 반환 ⚠⚠⚠`);
        console.log(`[handleMessage] 명령어가 매칭되지 않았거나 처리되지 않았습니다.`);
        console.log(`[handleMessage] msgLower="${msgLower}", trimmedMsg="${trimmedMsg}"`);
    }
    
    return replies;
}

// 단축 URL 전송 함수 (server.js에서 설정)
let sendShortUrlMessage = null;
function setSendShortUrlMessage(fn) {
    sendShortUrlMessage = fn;
}

// 후속 메시지 전송 함수 (server.js에서 설정)
let sendFollowUpMessage = null;
function setSendFollowUpMessage(fn) {
    sendFollowUpMessage = fn;
}

module.exports = { 
    handleMessage, 
    CONFIG, 
    NOTICE_SYSTEM, 
    setSendShortUrlMessage, 
    setSendFollowUpMessage,
    // 새로 추가된 모듈들
    PROMOTION_DETECTOR,
    NICKNAME_TRACKER,
    MESSAGE_DELETE_TRACKER,
    MEMBER_TRACKER,
    // Phase 4: 이미지 캐시 함수
    setPendingAttachment,
    getAndClearPendingAttachment,
    extractSenderName,
    extractSenderId
};

