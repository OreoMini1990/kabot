// ============================================
// WebSocket 메시지 핸들러 모듈
// - server.js의 메시지 처리 로직 분리
// ============================================

const WebSocket = require('ws');
const { decryptKakaoTalkMessage } = require('../../crypto/kakaoDecrypt');
const { handleMessage, CONFIG } = require('../../labbot-node');

/**
 * WebSocket 메시지 핸들러 초기화
 * @param {WebSocket.Server} wss - WebSocket 서버 인스턴스
 * @param {Object} dependencies - 의존성 객체
 */
function setupMessageHandler(wss, dependencies = {}) {
  const {
    getRoomKeyFromCache,
    updateRoomKeyCache,
    sendNicknameChangeNotification
  } = dependencies;

  wss.on('connection', function connection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] WS 연결: ${req.url} from ${clientIp}`);

    ws.on('close', function close() {
      console.log(`[${new Date().toISOString()}] WS 종료: ${clientIp}`);
    });

    ws.on('error', function error(err) {
      console.error(`[${new Date().toISOString()}] WS 에러:`, err.message);
    });

    ws.on('message', async function message(data) {
      // 클라이언트 로그 수신 처리 등은 server.js에서 직접 처리
      // 여기서는 메시지 라우팅만 수행
      
      try {
        let messageData;
        try {
          const rawData = data.toString();
          messageData = JSON.parse(rawData, (key, value) => {
            if (key === 'userId' || key === 'user_id' || key === 'myUserId' || key === 'chat_id' || key === '_id') {
              return value !== undefined && value !== null ? String(value) : value;
            }
            return value;
          });
        } catch (parseError) {
          ws.send(JSON.stringify({
            error: "Invalid JSON format",
            message: parseError.message
          }));
          return;
        }

        // 메시지 타입별 라우팅
        if (messageData.type === 'ack') {
          console.log(`[ACK 수신] Bridge APK에서 ACK 수신: id=${messageData.id}, status=${messageData.status}`);
          return;
        }

        // 메시지 삭제, Feed, 반응 처리 등은 server.js에서 처리
        // 이 모듈은 기본적인 메시지 라우팅만 제공
        
        // 일반 메시지 처리
        if (messageData.type === 'message') {
          await handleRegularMessage(ws, messageData, {
            decryptKakaoTalkMessage,
            handleMessage,
            CONFIG,
            getRoomKeyFromCache,
            updateRoomKeyCache
          });
        } else if (messageData.type === 'connect' || messageData.type === 'bridge_connect') {
          handleConnectionMessage(ws, messageData);
        }
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] 메시지 처리 오류:`, error);
        ws.send(JSON.stringify({
          error: "Internal server error",
          message: error.message || String(error)
        }));
      }
    });
  });
}

/**
 * 일반 메시지 처리
 */
async function handleRegularMessage(ws, messageData, deps) {
  // 복호화 및 메시지 처리 로직
  // server.js의 로직을 여기로 이동 (간략화된 버전)
  // 실제 구현은 server.js의 기존 로직을 참고하여 구현
}

/**
 * 연결 메시지 처리
 */
function handleConnectionMessage(ws, messageData) {
  if (messageData.type === 'bridge_connect') {
    console.log(`[Bridge APK] 클라이언트 연결 확인`);
    ws.isBridge = true;
    ws.send(JSON.stringify({
      type: 'bridge_connected',
      ok: true
    }));
  } else if (messageData.type === 'connect') {
    console.log(`[Iris client] handshake OK`);
    ws.isBridge = false;
    ws.send(JSON.stringify({
      type: 'connected',
      ok: true
    }));
  }
}

module.exports = {
  setupMessageHandler
};






