// ============================================
// 랩봇 (LABBOT) - Node.js 버전
// 메신저봇R 스타일에서 Node.js WebSocket 환경으로 변환
// ============================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ========== 설정 ==========
const CONFIG = {
    ROOM_NAME: "의운모",
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
        USE_ONNOTI: false        // onNoti 함수 사용 (WebSocket 환경에서는 false)
    }
};

// ========== 비속어/욕설 필터 ==========
const PROFANITY_FILTER = {
    // 비속어 목록
    words: [
        "시발", "씨발", "개새끼", "병신", "좆", "지랄", "미친", "미친놈", "미친년",
        "개같은", "개소리", "좆같은", "지랄하네", "빠가", "바보", "멍청이",
        "죽어", "죽어라", "꺼져", "꺼지세요", "닥쳐", "닥치세요",
        "간조년"
    ],
    
    // 타직업 비하 표현
    jobDiscrimination: [
        "간호사", "간호사새끼", "간호사년", "간호사놈", "의사새끼", "의사년",
        "약사", "약사새끼", "약사년", "한의사", "한의사새끼"
    ],
    
    // 필터링 체크
    check: function(msg) {
        const lowerMsg = msg.toLowerCase();
        
        // 비속어 체크
        for (let i = 0; i < this.words.length; i++) {
            if (lowerMsg.indexOf(this.words[i].toLowerCase()) !== -1) {
                return { blocked: true, reason: "비속어 사용", word: this.words[i] };
            }
        }
        
        // 타직업 비하 체크
        for (let i = 0; i < this.jobDiscrimination.length; i++) {
            const pattern = this.jobDiscrimination[i].toLowerCase();
            if (lowerMsg.indexOf(pattern) !== -1) {
                const discriminationPatterns = ["새끼", "년", "놈", "개", "좆"];
                for (let j = 0; j < discriminationPatterns.length; j++) {
                    if (lowerMsg.indexOf(pattern + discriminationPatterns[j]) !== -1 ||
                        lowerMsg.indexOf(discriminationPatterns[j] + pattern) !== -1) {
                        return { blocked: true, reason: "타직업 비하 표현", word: this.jobDiscrimination[i] };
                    }
                }
            }
        }
        
        return { blocked: false };
    },
    
    // 로그 기록
    log: function(sender, msg, reason) {
        try {
            const logFile = CONFIG.FILE_PATHS.FILTER_LOG;
            const logEntry = new Date().toISOString() + " | " + sender + " | " + reason + " | " + msg + "\n";
            const existingLog = readFileSafe(logFile) || "";
            writeFileSafe(logFile, existingLog + logEntry);
        } catch (e) {
            // 로그 기록 실패는 무시
        }
    },
    
    // 경고 횟수 증가 및 반환
    addWarning: function(sender) {
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
                        warningDict[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
                    }
                }
            }
            
            if (!(sender in warningDict)) {
                warningDict[sender] = 0;
            }
            warningDict[sender] += 1;
            
            const newWarningData = Object.keys(warningDict).map(function(user) {
                return user + "|" + warningDict[user];
            }).join("\n") + "\n";
            
            writeFileSafe(warningFile, newWarningData);
            
            return warningDict[sender];
        } catch (e) {
            return 1;
        }
    },
    
    // 경고 횟수 조회
    getWarningCount: function(sender) {
        try {
            const warningFile = CONFIG.FILE_PATHS.WARNING_LOG;
            const warningData = readFileSafe(warningFile);
            
            if (!warningData) {
                return 0;
            }
            
            const lines = warningData.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i]) continue;
                const parts = lines[i].split("|");
                if (parts.length === 2 && parts[0].trim() === sender) {
                    return parseInt(parts[1].trim()) || 0;
                }
            }
            
            return 0;
        } catch (e) {
            return 0;
        }
    },
    
    // 경고 메시지 생성
    getWarningMessage: function(sender, warningCount) {
        const name = sender.split('/')[0];
        
        if (warningCount === 1) {
            return "⚠️ " + name + "님, 비속어 사용 시 강퇴될 수 있습니다.";
        } else if (warningCount === 2) {
            return "⚠️ " + name + "님, 비속어 사용 시 강퇴될 수 있습니다. (2회 경고)";
        } else if (warningCount >= 3) {
            return "🚨 " + name + "님, 운영진에게 보고됩니다. 강퇴 대상자 등록되었습니다. (3회 경고)";
        }
        
        return "⚠️ 부적절한 표현이 감지되었습니다. 존중하는 대화를 부탁드립니다.";
    }
};

// ========== 공지 시스템 ==========
const NOTICE_SYSTEM = {
    lastNoticeTime: null,
    
    // 마지막 공지 시간 로드
    loadLastNoticeTime: function() {
        try {
            const data = readFileSafe(CONFIG.FILE_PATHS.LAST_NOTICE_TIME);
            if (data) {
                this.lastNoticeTime = parseInt(data);
            }
        } catch (e) {
            this.lastNoticeTime = null;
        }
    },
    
    // 마지막 공지 시간 저장
    saveLastNoticeTime: function() {
        try {
            const now = new Date().getTime();
            writeFileSafe(CONFIG.FILE_PATHS.LAST_NOTICE_TIME, now.toString());
            this.lastNoticeTime = now;
        } catch (e) {
            // 저장 실패는 무시
        }
    },
    
    // 마지막 스케줄 발송 시간 로드
    loadLastScheduleTime: function() {
        try {
            const data = readFileSafe(CONFIG.FILE_PATHS.LAST_SCHEDULE);
            if (data) {
                const lines = data.split("\n");
                const scheduleDict = {};
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i]) continue;
                    const parts = lines[i].split("|");
                    if (parts.length === 2) {
                        scheduleDict[parts[0].trim()] = parts[1].trim();
                    }
                }
                return scheduleDict;
            }
            return {};
        } catch (e) {
            return {};
        }
    },
    
    // 마지막 스케줄 발송 시간 저장
    saveLastScheduleTime: function(scheduleKey, dateStr) {
        try {
            const scheduleDict = this.loadLastScheduleTime();
            scheduleDict[scheduleKey] = dateStr;
            
            const newData = Object.keys(scheduleDict).map(function(key) {
                return key + "|" + scheduleDict[key];
            }).join("\n") + "\n";
            
            writeFileSafe(CONFIG.FILE_PATHS.LAST_SCHEDULE, newData);
        } catch (e) {
            // 저장 실패는 무시
        }
    },
    
    // 공지 발송 필요 여부 체크
    shouldSendNotice: function() {
        if (!CONFIG.NOTICE_ENABLED) return false;
        
        this.loadLastNoticeTime();
        const now = new Date().getTime();
        
        if (this.lastNoticeTime === null) {
            return true;
        }
        
        return (now - this.lastNoticeTime) >= CONFIG.NOTICE_INTERVAL;
    },
    
    // 스케줄 기반 공지 발송 체크
    shouldSendScheduledNotice: function() {
        if (!CONFIG.NOTICE_ENABLED) return false;
        
        const notice = this.getNotice();
        if (!notice) return false;
        
        const lines = notice.split("\n");
        const header = lines[0];
        
        if (!header.includes("|")) {
            return false;
        }
        
        const parts = header.split("|");
        if (parts.length < 3) return false;
        
        const expiryDate = parts[0].trim();
        const scheduleTimes = parts[1].trim().split(",");
        const noticeContent = lines.slice(1).join("\n");
        
        const now = new Date();
        const expiry = new Date(expiryDate + "T23:59:59");
        if (now > expiry) {
            return false;
        }
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDateStr = now.getFullYear() + "-" + 
                            ("0" + (now.getMonth() + 1)).slice(-2) + "-" + 
                            ("0" + now.getDate()).slice(-2);
        
        for (let i = 0; i < scheduleTimes.length; i++) {
            const timeStr = scheduleTimes[i].trim();
            const timeParts = timeStr.split(":");
            if (timeParts.length !== 2) continue;
            
            const scheduleHour = parseInt(timeParts[0], 10);
            const scheduleMinute = parseInt(timeParts[1], 10);
            
            if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
                continue;
            }
            
            if (scheduleHour < 0 || scheduleHour > 23 || scheduleMinute < 0 || scheduleMinute > 59) {
                continue;
            }
            
            if (currentHour === scheduleHour && currentMinute === scheduleMinute) {
                const scheduleKey = currentDateStr + "_" + timeStr;
                const lastSchedule = this.loadLastScheduleTime();
                
                if (lastSchedule[scheduleKey] !== currentDateStr) {
                    this.saveLastScheduleTime(scheduleKey, currentDateStr);
                    return { shouldSend: true, content: noticeContent };
                }
            }
        }
        
        return false;
    },
    
    // 공지 읽기
    getNotice: function() {
        try {
            const noticeFile = CONFIG.FILE_PATHS.NOTICE;
            const notice = readFileSafe(noticeFile);
            
            if (!notice || notice.trim() === "") {
                return null;
            }
            
            return notice.trim();
        } catch (e) {
            return null;
        }
    },
    
    // 공지 발송 (replies 배열에 추가)
    sendNotice: function(replies) {
        const notice = this.getNotice();
        if (notice) {
            replies.push("📢 공지사항\n──────────\n" + notice);
            this.saveLastNoticeTime();
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

// ========== 유틸리티 함수 ==========

// 권한 체크
function isAdmin(sender) {
    return CONFIG.ADMIN_USERS.includes(sender);
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

function getChatRankings(startDate, endDate, title, sender) {
    const userChatCounts = {};
    const chatCountRoot = CONFIG.FILE_PATHS.CHAT_COUNT;
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const year = date.getFullYear();
        const month = ("0" + (date.getMonth() + 1)).slice(-2);
        const day = ("0" + date.getDate()).slice(-2);
        const dayFolder = path.join(chatCountRoot, year + "-" + month, day);
        
        if (fs.existsSync(dayFolder)) {
            const files = fs.readdirSync(dayFolder);
            for (let i = 0; i < files.length; i++) {
                const fileName = files[i];
                if (fileName.endsWith(".txt")) {
                    const user = fileName.replace(".txt", "").replace(/☞/g, '/');
                    const filePath = path.join(dayFolder, fileName);
                    const count = parseInt(readFileSafe(filePath)) || 0;
                    userChatCounts[user] = (userChatCounts[user] || 0) + count;
                }
            }
        }
    }

    let totalChats = 0;
    for (const user in userChatCounts) {
        if (userChatCounts.hasOwnProperty(user)) {
            totalChats += userChatCounts[user];
        }
    }

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
 * @returns {string[]} 응답 메시지 배열
 */
function handleMessage(room, msg, sender, isGroupChat) {
    const replies = [];
    
    // ========== 채팅방 필터링: "의운모" 채팅방만 반응 ==========
    // room 파라미터가 채팅방 이름 또는 ID일 수 있음
    const roomMatch = room === CONFIG.ROOM_NAME || 
                     (typeof room === 'string' && room.indexOf(CONFIG.ROOM_NAME) !== -1) ||
                     (typeof CONFIG.ROOM_NAME === 'string' && CONFIG.ROOM_NAME.indexOf(room) !== -1);
    
    if (!roomMatch) {
        // "의운모" 채팅방이 아니면 응답하지 않음
        return replies; // 빈 배열 반환
    }

    // ========== "의운모" 채팅방의 모든 메시지에 "helloworld" 응답 ==========
    replies.push("helloworld");
            return replies;

    // 공지 발송 체크 (명령어가 아닌 일반 메시지일 때만)
    if (!msg.startsWith('/')) {
        const scheduledNotice = NOTICE_SYSTEM.shouldSendScheduledNotice();
        if (scheduledNotice && scheduledNotice.shouldSend) {
            NOTICE_SYSTEM.sendScheduledNotice(replies, scheduledNotice.content);
        } else {
            const notice = NOTICE_SYSTEM.getNotice();
            let hasScheduledNotice = false;
            if (notice) {
                const lines = notice.split("\n");
                const header = lines[0];
                if (header.includes("|") && header.split("|").length >= 3) {
                    hasScheduledNotice = true;
                }
            }
            
            if (!hasScheduledNotice && NOTICE_SYSTEM.shouldSendNotice()) {
                NOTICE_SYSTEM.sendNotice(replies);
            }
        }
    }

    // 채팅 횟수 기록
    recordChatCount(sender);

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
        replies.push(getChatRankings(startOfMonth, endOfMonth, "이번달 순위 (" + periodText + ")", sender));
        return replies;
    }

    if (msg === "/이번주 채팅") {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const periodText = formatDate(startOfWeek) + " ~ " + formatDate(endOfWeek);
        replies.push(getChatRankings(startOfWeek, endOfWeek, "이번주 순위 (" + periodText + ")", sender));
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
        replies.push(getChatRankings(startOfLastMonth, endOfLastMonth, "저번달 순위 (" + periodText + ")", sender));
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
        replies.push(getChatRankings(startOfLastWeek, endOfLastWeek, "지난주 순위 (" + periodText + ")", sender));
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
        replies.push(getChatRankings(startDate, endDate, "오늘 순위 (" + periodText + ")", sender));
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
        replies.push(getChatRankings(startDate, endDate, "어제 순위 (" + periodText + ")", sender));
        return replies;
    }

    if (msg === "/전체 채팅") {
        const startOfAllTime = new Date(2000, 0, 1);
        const endOfAllTime = new Date();
        replies.push(getChatRankings(startOfAllTime, endOfAllTime, "전체 채팅 순위", sender));
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
        let usageGuide = "\n─────────────\n" +
            "💬 톡순위 [특정기간 사용자별 톡 수를 알려줘요]\n" +
            "/전체 채팅\n" +
            "/이번달 채팅\n" +
            "/이번주 채팅\n" +
            "/저번달 채팅\n" +
            "/저번주 채팅\n" +
            "/오늘 채팅\n" +
            "/어제 채팅\n\n";
        
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

    return replies;
}

module.exports = { handleMessage, CONFIG };

