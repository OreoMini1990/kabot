// ============================================
// 봇 설정 모듈
// ============================================

const CONFIG = {
    ROOM_NAME: "의운모",
    ROOM_KEY: "의운모",
    ADMIN_USERS: ["랩장/AN/서울"],
    ADMIN_USER_IDS: ["4897202238384074000", "18473878600493456"],
    DATA_DIR: "/home/app/iris-core/data",
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
    NOTICE_INTERVAL: 24 * 60 * 60 * 1000,
    NOTICE_ENABLED: true,
    FEATURES: {
        POINT_SYSTEM: false,
        SHOP_SYSTEM: false,
        MEMBERSHIP_SYSTEM: false,
        NAVER_CAFE: process.env.NAVER_CAFE_ENABLED === 'true',
        USE_ONNOTI: false,
        PROMOTION_DETECTION: true,
        NICKNAME_CHANGE_DETECTION: true,
        MESSAGE_DELETE_DETECTION: true,
        KICK_DETECTION: true
    },
    PROMOTION_DETECTION: {
        BANNED_DOMAINS: [
            'open.kakao.com',
            'toss.me',
            'toss.im',
            'discord.gg',
            'discord.com/invite'
        ],
        WHITELIST_DOMAINS: [
            'naver.com',
            'google.com',
            'youtube.com',
            'youtu.be'
        ],
        WARNING_MESSAGES: {
            1: "⚠️ 무단 홍보가 감지되었습니다.\n첫 번째 경고입니다. 무단 홍보는 자제해 주세요.",
            2: "⚠️⚠️ 무단 홍보 2회 감지!\n두 번째 경고입니다. 계속 시 관리자에게 보고됩니다.",
            3: "🚨 무단 홍보 3회 감지!\n관리자에게 보고되었습니다."
        }
    },
    MESSAGE_DELETE_DETECTION: {
        WARNING_MESSAGES: {
            1: "💬 메시지 삭제가 감지되었습니다.\n메시지 삭제는 자제해 주세요.",
            2: "⚠️ 24시간 내 메시지 삭제 2회!\n계속 시 관리자에게 보고됩니다.",
            3: "🚨 24시간 내 메시지 삭제 3회!\n관리자에게 보고되었습니다."
        },
        TRACKING_PERIOD_HOURS: 24
    },
    BOT_NAME: "랩봇"
};

module.exports = CONFIG;




