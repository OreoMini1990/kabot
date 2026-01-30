// ============================================
// RoomKey 캐시 관리 모듈
// - 채팅방별 roomKey 캐시 관리
// - TTL: 5분
// ============================================

const CACHE_TTL = 5 * 60 * 1000; // 5분
const roomKeyCache = new Map(); // roomName -> { roomKey, chatId, lastUpdate }

/**
 * RoomKey 캐시 업데이트
 * @param {string} roomName - 채팅방 이름
 * @param {string} roomKey - RoomKey
 * @param {string|null} chatId - Chat ID
 */
function updateRoomKeyCache(roomName, roomKey, chatId) {
  if (roomName && roomKey) {
    roomKeyCache.set(roomName, {
      roomKey: roomKey,
      chatId: chatId || null,
      lastUpdate: new Date()
    });
    console.log(`[roomKey 캐시] 업데이트: roomName="${roomName}", roomKey="${roomKey}", chatId=${chatId || '없음'}`);
  }
}

/**
 * RoomKey 캐시에서 조회
 * @param {string} roomName - 채팅방 이름
 * @returns {string|null} RoomKey 또는 null
 */
function getRoomKeyFromCache(roomName) {
  const cached = roomKeyCache.get(roomName);
  if (cached) {
    const ttl = CACHE_TTL;
    const age = Date.now() - cached.lastUpdate.getTime();
    if (age < ttl) {
      return cached.roomKey;
    } else {
      roomKeyCache.delete(roomName);
      console.log(`[roomKey 캐시] 만료: roomName="${roomName}" (${Math.floor(age / 1000)}초 경과)`);
    }
  }
  return null;
}

/**
 * 캐시 초기화
 */
function clearCache() {
  roomKeyCache.clear();
  console.log(`[roomKey 캐시] 전체 초기화 완료`);
}

module.exports = {
  updateRoomKeyCache,
  getRoomKeyFromCache,
  clearCache
};







