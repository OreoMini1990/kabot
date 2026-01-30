// ============================================
// IRIS Core - HTTP + WebSocket Upgrade Server
// - irispy 호환: HTTP API + WS endpoint (/ws)
// - Express + ws를 사용한 단일 포트 공유
// - Port: process.env.PORT or 5002
// ============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { handleMessage, NOTICE_SYSTEM, CONFIG } = require('./labbot-node');
const { decryptKakaoTalkMessage } = require('./crypto/kakaoDecrypt');
const logManager = require('./core/logging/logManager');

// 단축 URL 전송 함수 (전역으로 export하여 labbot-node.js에서 사용 가능하도록)
let sendShortUrlMessageFunction = null;
function setSendShortUrlMessageFunction(fn) {
    sendShortUrlMessageFunction = fn;
}

// 후속 메시지 전송 함수 (네이버 카페 API 호출 완료 후 결과 전송용)
let sendFollowUpMessageFunction = null;
function setSendFollowUpMessageFunction(fn) {
  sendFollowUpMessageFunction = fn;
}

// 닉네임 변경 알림 전송 함수 (chatLogger에서 사용)
// 주의: 이 함수는 나중에 정의되는 getRoomKeyFromCache를 사용하므로,
// 실제 호출 시점에는 이미 정의되어 있어야 함
function sendNicknameChangeNotification(roomName, message) {
  console.log(`[닉네임 변경 알림] 전송 요청: roomName="${roomName}", message="${message.substring(0, 50)}..."`);
  
  // roomKey 캐시에서 최신 roomKey 가져오기
  let cachedRoomKey = roomName || CONFIG.ROOM_KEY || '';
  
  // getRoomKeyFromCache가 정의되어 있으면 사용
  if (typeof getRoomKeyFromCache === 'function') {
    const cached = getRoomKeyFromCache(roomName);
    if (cached) {
      cachedRoomKey = cached;
      console.log(`[닉네임 변경 알림] 캐시에서 roomKey 찾음: "${cachedRoomKey}" (원본: "${roomName}")`);
    } else {
      console.log(`[닉네임 변경 알림] 캐시에서 roomKey를 찾지 못함, 원본 사용: "${cachedRoomKey}"`);
      if (!cachedRoomKey) {
        cachedRoomKey = CONFIG.ROOM_KEY || '';
        console.log(`[닉네임 변경 알림] CONFIG.ROOM_KEY 사용: "${cachedRoomKey}"`);
      }
    }
  } else {
    console.log(`[닉네임 변경 알림] getRoomKeyFromCache 함수가 아직 정의되지 않음, 원본 사용: "${cachedRoomKey}"`);
    if (!cachedRoomKey) {
      cachedRoomKey = CONFIG.ROOM_KEY || '';
      console.log(`[닉네임 변경 알림] CONFIG.ROOM_KEY 사용: "${cachedRoomKey}"`);
    }
  }
  
  // 최종 확인: roomKey가 비어있으면 CONFIG.ROOM_KEY 사용
  if (!cachedRoomKey) {
    cachedRoomKey = CONFIG.ROOM_KEY || '';
    console.log(`[닉네임 변경 알림] 최종 fallback: CONFIG.ROOM_KEY="${cachedRoomKey}"`);
  }
  
  // Bridge APK 클라이언트 찾기
  const bridgeClients = [];
  if (wss && wss.clients) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client.isBridge === true) {
        bridgeClients.push(client);
      }
    }
  }
  
  if (bridgeClients.length > 0) {
    const sendMessage = {
      type: 'send',
      id: `nickname-change-${Date.now()}`,
      roomKey: cachedRoomKey,
      text: message,
      ts: Math.floor(Date.now() / 1000)
    };
    
    // 첫 번째 Bridge APK에게 전송
    bridgeClients[0].send(JSON.stringify(sendMessage));
    console.log(`[닉네임 변경 알림] ✅ Bridge APK로 전송 완료: roomKey="${cachedRoomKey}"`);
  } else {
    console.warn(`[닉네임 변경 알림] ⚠️ Bridge APK 클라이언트가 연결되어 있지 않음`);
  }
}

// chatLogger에서 사용할 수 있도록 전역 함수 등록
// 주의: 이 함수는 나중에 호출되므로, 실제 호출 시점에는 wss와 getRoomKeyFromCache가 정의되어 있어야 함
global.sendNicknameChangeNotification = sendNicknameChangeNotification;

// CONFIG의 ROOM_KEY가 없으면 ROOM_NAME 사용 (하위 호환성)
if (!CONFIG.ROOM_KEY) {
    CONFIG.ROOM_KEY = CONFIG.ROOM_NAME;
}
const adminRouter = require('./api/admin');
const bridgeRouter = require('./routes/bridge');
const naverOAuthRouter = require('./routes/naverOAuth');

const PORT = Number(process.env.PORT || 5002);
const BOT_ID = process.env.BOT_ID || 'iris-core';

// ============================================
// 로그 파일 관리 (모듈에서 import)
// ============================================
// 로그 관리 모듈 초기화
logManager.initialize();

// WebSocket 서버를 전역 변수로 선언 (나중에 할당)
let wss = null;

// Express 앱 생성
const app = express();

// JSON 파싱 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙 (관리자 패널)
// __dirname이 server 디렉토리이므로, 프로젝트 루트를 찾기 위해 상위 디렉토리로 이동
const projectRoot = path.join(__dirname, '..');
const adminPath = path.join(projectRoot, 'admin');

// 디렉토리 존재 여부 확인
if (!fs.existsSync(adminPath)) {
  console.error(`[경고] 관리자 패널 경로를 찾을 수 없습니다: ${adminPath}`);
}

app.use('/admin', express.static(adminPath));

// 관리자 페이지 라우트 (index.html 자동 서빙)
app.get('/admin', (req, res) => {
  const indexPath = path.join(adminPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ 
      ok: false, 
      error: 'Admin panel not found',
      path: indexPath,
      hint: 'Please check if admin/index.html exists'
    });
  }
});

// 관리자 API
app.use('/api/admin', adminRouter);
app.use('/bridge', bridgeRouter);
app.use('/auth/naver', naverOAuthRouter);

// DB 업로드 API
const dbUploadRouter = require('./routes/dbUpload');
app.use('/api', dbUploadRouter);

// 네이버 OAuth API (선택적 로딩)
try {
    const naverOAuthRouter = require('./api/naverOAuth');
    app.use('/api/naver/oauth', naverOAuthRouter);
    console.log('[서버] 네이버 OAuth 라우터 로드 완료');
} catch (error) {
    console.warn('[서버] 네이버 OAuth 라우터 로드 실패:', error.message);
    console.warn('[서버] OAuth 기능은 사용할 수 없습니다. server/api/naverOAuth.js 파일을 확인하세요.');
}

// 연동 직후 대기 질문 즉시 처리 (수동 트리거용)
app.get('/api/naver-oauth/process-pending', async (req, res) => {
    try {
        const { processPendingSubmits } = require('./utils/cafeDraftManager');
        await processPendingSubmits();
        res.json({ ok: true, message: '처리 완료. 서버 로그에서 [백그라운드 재개] 확인하세요.' });
    } catch (err) {
        console.error('[api/naver-oauth/process-pending] 오류:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ========== 네이버 카페 짧은 링크 리다이렉트 ==========
app.get('/go/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const db = require('./db/database');
        
        // DB에서 short_code로 조회
        const query = 'SELECT article_url, status FROM naver_cafe_posts WHERE short_code = ? LIMIT 1';
        const result = await db.prepare(query).get(code);
        
        if (result && result.article_url) {
            // 리다이렉트
            res.redirect(302, result.article_url);
        } else {
            // 404 페이지
            res.status(404).send(`
                <html>
                    <head><title>링크를 찾을 수 없습니다</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1>404 - 링크를 찾을 수 없습니다</h1>
                        <p>요청하신 링크가 존재하지 않거나 만료되었습니다.</p>
                        <p><a href="/admin">관리자 페이지로 돌아가기</a></p>
                    </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('[shortlink] 리다이렉트 오류:', error);
        res.status(500).send('Internal Server Error');
    }
});

// HTTP 요청 로깅 미들웨어 (모든 요청)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] HTTP ${req.method} ${req.url} (${req.socket.remoteAddress})`);
  next();
});

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// 루트 엔드포인트
app.get('/', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    service: 'iris-core',
    ts: new Date().toISOString()
  });
});

// ============================================
// 카카오톡 메시지 복호화 로직 (모듈에서 import)
// ============================================
// decryptKakaoTalkMessage는 위에서 이미 import됨

// 메시지 복호화 엔드포인트 (Iris 호환)
app.post('/decrypt', (req, res) => {
  try {
    const { message, v, userId, encType } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message 필드 필요' });
    }
    
    // v 필드에서 enc 추출
    let enc = encType || 31;
    if (v && typeof v === 'string') {
      try {
        const vParsed = JSON.parse(v);
        if (vParsed && typeof vParsed === 'object' && vParsed.enc !== undefined) {
          enc = vParsed.enc;
        }
      } catch (e) {
        // JSON 파싱 실패 시 기본값 사용
      }
    }
    
    // userId가 있으면 카카오톡 복호화 시도
    // 큰 정수 정밀도 손실 방지: 문자열로 전달
    if (userId) {
      // parseInt는 큰 정수에서 정밀도 손실 발생 가능하므로 문자열로 전달
      const userIdStr = String(userId);
      const decrypted = decryptKakaoTalkMessage(message, userIdStr, enc);
      if (decrypted) {
        return res.status(200).json({ 
          ok: true,
          message: decrypted 
        });
      }
    }
    
    // 복호화 실패 시 base64 디코딩 시도
    try {
      const decoded = Buffer.from(message, 'base64').toString('utf-8');
      return res.status(200).json({ 
        ok: true,
        message: decoded 
      });
    } catch (e) {
      return res.status(200).json({ 
        ok: true,
        message: message 
      });
    }
  } catch (error) {
    console.error('[decrypt 오류]', error);
    res.status(500).json({ error: '복호화 실패', message: error.message });
  }
});

// irispy가 요청하는 엔드포인트들
app.get('/aot', (req, res) => {
  // irispy-client가 dict를 기대하므로 boolean이 아닌 객체 반환
  res.status(200).json({ 
    ok: true, 
    aot: { enabled: true } 
  });
});

app.get('/config', (req, res) => {
  res.status(200).json({ 
    bot_id: BOT_ID,
    ws_path: '/ws'
  });
});

// 로컬 파일 업로드 엔드포인트
app.post('/sync/upload', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  let DATA_DIR = '/home/app/iris-core/data';
  
  try {
    const { CONFIG } = require('./labbot-node');
    DATA_DIR = CONFIG.DATA_DIR || DATA_DIR;
  } catch (e) {
    console.error('[Sync] CONFIG 로드 실패, 기본값 사용:', e.message);
  }
  
  const { filename, content } = req.body;
  
  if (!filename || !content) {
    res.status(400).json({ 
      ok: false, 
      error: 'Missing filename or content',
      required: ['filename', 'content']
    });
    return;
  }
  
  try {
    // Ensure content is a string (handle cases where it might be an object)
    let contentString = content;
    if (typeof content !== 'string') {
      if (content && typeof content === 'object') {
        // If content is an object, try to stringify it
        contentString = JSON.stringify(content);
      } else {
        contentString = String(content);
      }
    }
    
    const filePath = path.join(DATA_DIR, filename);
    
    // 디렉토리 생성
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 파일 저장
    fs.writeFileSync(filePath, contentString, 'utf8');
    
    const serverUrl = process.env.SERVER_URL || 'http://192.168.0.15:5002';
    const downloadUrl = `${serverUrl}/sync/file/${filename}`;
    
    res.json({
      ok: true,
      message: 'File uploaded successfully',
      filename: filename,
      downloadUrl: downloadUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 파일 업로드 오류:`, error);
    res.status(500).json({
      ok: false,
      error: 'File upload failed',
      message: error.message
    });
  }
});

// 파일 다운로드 엔드포인트
app.get('/sync/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const fs = require('fs');
  const path = require('path');
  let DATA_DIR = '/home/app/iris-core/data';
  
  try {
    const { CONFIG } = require('./labbot-node');
    DATA_DIR = CONFIG.DATA_DIR || DATA_DIR;
  } catch (e) {
    console.error('[Sync] CONFIG 로드 실패, 기본값 사용:', e.message);
  }
  
  const filePath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ 
      ok: false, 
      error: 'File not found',
      filename: filename
    });
    return;
  }
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileContent);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 파일 다운로드 오류:`, error);
    res.status(500).json({ 
      ok: false, 
      error: 'File read error',
      message: error.message
    });
  }
});

// 이미지 파일 제공 엔드포인트
app.get('/api/image/:filename', (req, res) => {
  const filename = req.params.filename;
  const IMAGE_DIR = '/home/app/iris-core/admin/data/img';
  
  // 보안: 파일명에 경로 탐색 문자 제거
  const safeFilename = path.basename(filename);
  const filePath = path.join(IMAGE_DIR, safeFilename);
  
  if (!fs.existsSync(filePath)) {
    console.error(`[이미지] 파일 없음: ${filePath}`);
    res.status(404).json({ 
      ok: false, 
      error: 'Image not found',
      filename: safeFilename
    });
    return;
  }
  
  try {
    // MIME 타입 결정
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = mimeTypes[ext] || 'image/jpeg';
    
    // 이미지 파일 읽기 (바이너리)
    const imageBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1시간 캐시
    res.send(imageBuffer);
    
    console.log(`[이미지] 제공 완료: ${safeFilename} (${imageBuffer.length} bytes)`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 이미지 제공 오류:`, error);
    res.status(500).json({ 
      ok: false, 
      error: 'Image read error',
      message: error.message
    });
  }
});

// WebSocket 브로드캐스트 유틸 함수 (중복 제거)
// irispy-client는 {msg, room, sender, json: {...}} 형식을 기대함
// irispy-client 소스 코드 93-94줄: data["raw"] = data.get("json"); del data["json"];
// 따라서 서버는 "json" 키를 사용해야 함 (클라이언트가 "json"을 "raw"로 변환)
function broadcastMessage(payload) {
  if (!wss) {
    console.error(`[${new Date().toISOString()}] WebSocket server not initialized`);
    return 0;
  }

  // irispy-client가 기대하는 형식:
  // {msg, room, sender, json: {...}}
  // payload가 {msg, room, sender, raw} 형식이면 raw를 json으로 변환
  const messagePayload = {
    msg: payload.msg,
    room: payload.room,
    sender: payload.sender,
    json: payload.raw || payload.json || {}  // raw를 json으로 변환
  };

  const messageStr = JSON.stringify(messagePayload);
  console.log(`[${new Date().toISOString()}] 브로드캐스트 전송:`, messageStr.substring(0, 200));

  let pushed = 0;
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(messageStr);
      pushed++;
    }
  });

  return pushed;
}

// 디버그 push 엔드포인트 (404 핸들러 이전에 정의)
// wss는 나중에 할당되므로, 여기서는 참조만 함
app.post('/debug/push', (req, res) => {
  if (!wss) {
    res.status(503).json({ 
      ok: false, 
      error: 'WebSocket server not initialized' 
    });
    return;
  }

  // req.body에서 msg, room, sender 추출 (fallback 포함)
  const msg = req.body?.msg || req.body?.text || req.body?.message || "!hi";
  const room = req.body?.room || "debug-room";
  const sender = req.body?.sender || "debug-sender";
  const isGroupChat = req.body?.isGroupChat !== undefined ? req.body.isGroupChat : true;

  // raw에는 카카오톡 원본 메시지 형식과 유사하게 구성
  // 레퍼런스에 따르면 Message 객체는 id, type, msg, attachment, v를 가짐
  // Room 객체는 id, name, type을 가짐
  // User 객체는 id, name, avatar, type을 가짐
  const raw = {
    // Message 객체 필드 (레퍼런스 기준)
    id: req.body?.id || Date.now(),
    type: req.body?.type || 0,  // 0: 텍스트
    msg: msg,
    attachment: req.body?.attachment || {},
    v: req.body?.v || {},
    
    // Room 객체 필드
    chat_id: req.body?.chat_id || 1,
    chat_name: room,  // Room.name에 사용
    
    // User 객체 필드
    user_id: req.body?.user_id || 1,
    user_name: sender,  // User.name에 사용
    
    // 추가 필드
    isGroupChat: isGroupChat,
    _id: Date.now(),  // MongoDB 형식
    message: msg  // 공식 API 레퍼런스 필드
  };

  // irispy-client가 기대하는 형식 확인 필요
  // 로컬에서 작동했던 형식을 참고하여 두 가지 형식 모두 시도
  // 주석 처리된 코드를 보면 {event: "message", json: {...}} 형식이 있었음
  // 하지만 오류 메시지를 보면 event/json을 처리하지 못함
  // 따라서 직접 {msg, room, sender, raw} 형식 사용
  
  // 최종 payload: irispy-client가 실제로 기대하는 형식
  // 레퍼런스와 오류 메시지를 종합하면 최상위에 msg, room, sender, raw만 필요
  const payload = {
    msg: msg,
    room: room,
    sender: sender,
    raw: raw
  };

  console.log(`[${new Date().toISOString()}] 디버그 push 요청 수신:`, { msg, room, sender });
  console.log(`[${new Date().toISOString()}] 연결된 클라이언트 수:`, wss.clients.size);
  console.log(`[${new Date().toISOString()}] 전송할 payload 구조:`, {
    hasMsg: !!payload.msg,
    hasRoom: !!payload.room,
    hasSender: !!payload.sender,
    hasRaw: !!payload.raw,
    rawKeys: Object.keys(payload.raw || {})
  });

  const pushed = broadcastMessage(payload);

  res.json({ ok: true, pushed });
});

// 404 핸들러 (정상 404 응답, reset하지 않음)
app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: 'Not Found', 
    path: req.url 
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] HTTP 에러:`, err);
  res.status(500).json({ 
    ok: false, 
    error: err.message 
  });
});

// HTTP 서버 생성 (Express 앱 사용)
const server = http.createServer(app);

// WebSocket 서버: HTTP 서버에 attach + path '/ws'
wss = new WebSocket.Server({
  server,             // 중요: HTTP 서버에 붙임
  path: '/ws',        // 중요: irispy는 ws://HOST:PORT/ws 를 사용
  perMessageDeflate: false
});

// 단축 URL 전송 함수 등록 (WebSocket 서버 생성 후)
setSendShortUrlMessageFunction((roomKey, shortUrl, title) => {
  const fixedRoomKey = CONFIG.ROOM_KEY || roomKey || '';
  const updateMessage = {
    type: 'send',
    id: `shorturl-${Date.now()}`,
    roomKey: fixedRoomKey,
    text: `🔗 단축 링크가 생성되었습니다!\n\n답변하러가기: ${shortUrl}`,
    ts: Math.floor(Date.now() / 1000)
  };
  
  let sentCount = 0;
  if (wss && wss.clients) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(updateMessage));
          sentCount++;
          break; // 첫 번째 Bridge APK에게만 전송
        } catch (err) {
          console.error(`[단축 URL 전송] 오류:`, err.message);
        }
      }
    }
  }
  console.log(`[단축 URL 전송] 완료: ${shortUrl}, 전송=${sentCount}개`);
});

// 후속 메시지 전송 함수 등록 (네이버 카페 API 호출 완료 후 결과 전송용)
// 주의: 이 함수는 나중에 정의되는 getRoomKeyFromCache를 사용하므로,
// 실제 호출 시점에는 이미 정의되어 있어야 함
setSendFollowUpMessageFunction((roomKey, message) => {
  console.log(`[후속 메시지 전송] 요청 수신: roomKey="${roomKey}", message="${message.substring(0, 50)}..."`);
  
  // roomKey 캐시에서 최신 roomKey 가져오기 (함수가 정의된 후 호출되므로 안전)
  let cachedRoomKey = roomKey || CONFIG.ROOM_KEY || '';
  
  // getRoomKeyFromCache가 정의되어 있으면 사용
  if (typeof getRoomKeyFromCache === 'function') {
    const cached = getRoomKeyFromCache(roomKey);
    if (cached) {
      cachedRoomKey = cached;
      console.log(`[후속 메시지 전송] 캐시에서 roomKey 찾음: "${cachedRoomKey}" (원본: "${roomKey}")`);
    } else {
      console.log(`[후속 메시지 전송] 캐시에서 roomKey를 찾지 못함, 원본 사용: "${cachedRoomKey}"`);
      
      // roomKey가 없으면 CONFIG.ROOM_KEY 사용
      if (!cachedRoomKey) {
        cachedRoomKey = CONFIG.ROOM_KEY || '';
        console.log(`[후속 메시지 전송] CONFIG.ROOM_KEY 사용: "${cachedRoomKey}"`);
      }
    }
  } else {
    console.log(`[후속 메시지 전송] getRoomKeyFromCache 함수가 아직 정의되지 않음, 원본 사용: "${cachedRoomKey}"`);
    // CONFIG.ROOM_KEY를 fallback으로 사용
    if (!cachedRoomKey) {
      cachedRoomKey = CONFIG.ROOM_KEY || '';
      console.log(`[후속 메시지 전송] CONFIG.ROOM_KEY 사용: "${cachedRoomKey}"`);
    }
  }
  
  // 최종 확인: roomKey가 비어있으면 CONFIG.ROOM_KEY 사용
  if (!cachedRoomKey) {
    cachedRoomKey = CONFIG.ROOM_KEY || '';
    console.log(`[후속 메시지 전송] 최종 fallback: CONFIG.ROOM_KEY="${cachedRoomKey}"`);
  }
  
  const followUpMessage = {
    type: 'send',
    id: `followup-${Date.now()}`,
    roomKey: cachedRoomKey,
    text: message,
    ts: Math.floor(Date.now() / 1000)
  };
  
  console.log(`[후속 메시지 전송] 메시지 생성: roomKey="${cachedRoomKey}", id="${followUpMessage.id}", text="${message.substring(0, 30)}..."`);
  
  let sentCount = 0;
  if (wss && wss.clients) {
    const clientsArray = Array.from(wss.clients);
    console.log(`[후속 메시지 전송] 연결된 클라이언트 수: ${clientsArray.length}`);
    
    for (const client of clientsArray) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(followUpMessage));
          sentCount++;
          console.log(`[후속 메시지 전송] Bridge APK에 전송 성공: roomKey="${cachedRoomKey}", client=${client.readyState}`);
          // 모든 Bridge APK 클라이언트에 전송 (첫 번째만이 아닌)
          // break; 제거하여 모든 클라이언트에 전송
        } catch (err) {
          console.error(`[후속 메시지 전송] 클라이언트 전송 오류:`, err.message);
        }
      } else {
        console.log(`[후속 메시지 전송] 클라이언트 상태가 OPEN이 아님: ${client.readyState}`);
      }
    }
  } else {
    console.warn(`[후속 메시지 전송] WebSocket 서버 또는 클라이언트가 없음: wss=${!!wss}, clients=${wss?.clients?.size || 0}`);
  }
  
  console.log(`[후속 메시지 전송] 완료: roomKey="${cachedRoomKey}", 전송=${sentCount}개`);
  
  // 전송 실패 시 재시도 로직 (선택사항)
  if (sentCount === 0) {
    console.error(`[후속 메시지 전송] 실패: 메시지가 전송되지 않았습니다. roomKey="${cachedRoomKey}"`);
  }
});

// labbot-node.js에 함수 전달
const { setSendShortUrlMessage, setSendFollowUpMessage } = require('./labbot-node');

// 전역으로 sendFollowUpMessageFunction 등록 (naverOAuth.js에서 사용)
global.sendFollowUpMessageFunction = sendFollowUpMessageFunction;

// 백필 작업 주기적 실행 (5분마다)
// 반응 카운트 pending 큐 재처리 (5분마다)
if (typeof setInterval !== 'undefined') {
    setInterval(async () => {
        try {
            const chatLogger = require('./db/chatLogger');
            await chatLogger.processReactionCountPending();
        } catch (err) {
            console.error('[반응 pending] 재처리 오류:', err.message);
        }
    }, 5 * 60 * 1000);  // 5분마다
    
    setInterval(async () => {
        try {
            const chatLogger = require('./db/chatLogger');
            await chatLogger.backfillAllPendingReplies();
        } catch (err) {
            console.error('[백필] 주기적 백필 작업 실패:', err.message);
        }
    }, 5 * 60 * 1000);  // 5분마다 실행
    
    console.log('[백필] 주기적 백필 작업 시작 (5분마다)');
    
    // 만료된 Draft 정리 (1시간마다)
    setInterval(async () => {
        try {
            const { cleanupExpiredDrafts } = require('./utils/cafeDraftManager');
            await cleanupExpiredDrafts();
        } catch (err) {
            console.error('[Draft] 정리 오류:', err.message);
        }
    }, 60 * 60 * 1000);  // 1시간마다

    // OAuth 연동 직후 대기 질문 자동 등록 (pending_oauth/pending_submit → 카페 게시)
    const runPendingSubmits = async () => {
        try {
            const { processPendingSubmits } = require('./utils/cafeDraftManager');
            await processPendingSubmits();
        } catch (err) {
            console.error('[Draft] pending 재개 오류:', err.message);
        }
    };
    setTimeout(runPendingSubmits, 5 * 1000);   // 5초 후 첫 실행
    setInterval(runPendingSubmits, 30 * 1000); // 30초마다
}
setSendShortUrlMessage(sendShortUrlMessageFunction);
setSendFollowUpMessage(sendFollowUpMessageFunction);

// 최근 메시지의 채팅방 정보 추적 (스케줄 공지 발송용)
let recentRoomInfo = {
    roomName: null,
    chatId: null,
    lastUpdate: null
};

// roomKey 캐시 (사용자가 메시지를 보낼 때 받은 roomKey 저장)
// Bridge APK가 알림에서 캐시한 roomKey와 일치하도록 사용
// 채팅방별로 캐시 관리 (여러 채팅방 지원)
let roomKeyCache = new Map(); // roomName -> { roomKey, chatId, lastUpdate }

// roomKey 캐시 관리 함수
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

function getRoomKeyFromCache(roomName) {
    const cached = roomKeyCache.get(roomName);
    if (cached) {
        // TTL 체크 (5분)
        const ttl = 5 * 60 * 1000;
        const age = Date.now() - cached.lastUpdate.getTime();
        if (age < ttl) {
            return cached.roomKey;
        } else {
            // TTL 만료
            roomKeyCache.delete(roomName);
            console.log(`[roomKey 캐시] 만료: roomName="${roomName}" (${Math.floor(age / 1000)}초 경과)`);
        }
    }
    return null;
}

console.log(`[${new Date().toISOString()}] IRIS Core 시작: http://0.0.0.0:${PORT} / ws://0.0.0.0:${PORT}/ws`);

// WebSocket 연결 이벤트
wss.on('connection', function connection(ws, req) {
  const clientIp = req.socket.remoteAddress;
  const timestamp = new Date().toISOString();
  
  // WS connection 로깅 (req.url, remoteAddress)
  console.log(`[${timestamp}] WS 연결: ${req.url} from ${clientIp}`);

  ws.on('close', function close() {
    console.log(`[${new Date().toISOString()}] WS 종료: ${clientIp}`);
  });

  ws.on('error', function error(err) {
    console.error(`[${new Date().toISOString()}] WS 에러:`, err.message);
  });

  ws.on('message', async function message(data) {
    // === RAW MESSAGE FROM CLIENT ===
    const timestamp = new Date().toISOString();
    let messageId = 'N/A';
    let messageType = 'unknown';
    
    try {
      const parsed = JSON.parse(data.toString());
      messageId = parsed.json?._id || parsed.json?.kakao_log_id || parsed._id || 'N/A';
      messageType = parsed.type || 'unknown';
    } catch (e) {
      // 파싱 실패는 무시
    }
    
    console.log(`[${timestamp}] === RAW MESSAGE FROM CLIENT ===`);
    console.log(`[${timestamp}] 메시지 ID: ${messageId}, 타입: ${messageType}`);
    console.log(`[${timestamp}] 메시지 길이: ${data.toString().length} bytes`);
    console.log(data.toString().substring(0, 500) + (data.toString().length > 500 ? '...' : ''));
    console.log(`[${timestamp}] ================================`);
    
    // 클라이언트 로그 수신 처리
    try {
      const json = JSON.parse(data.toString());
      if (json.type === 'client_logs' && Array.isArray(json.logs)) {
        // 클라이언트 로그를 logs 폴더에 통합 저장
        const fs = require('fs');
        const path = require('path');
        const LOG_DIR = path.join(__dirname, 'logs');
        const CLIENT_LOG_FILE = path.join(LOG_DIR, 'client.log');
        
        // 로그 디렉토리 확인
        if (!fs.existsSync(LOG_DIR)) {
          fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        
        // 클라이언트 로그를 파일에 추가
        const logLines = json.logs.map(log => `[CLIENT] ${log}`).join('\n') + '\n';
        fs.appendFileSync(CLIENT_LOG_FILE, logLines, 'utf8');
        
        // 클라이언트 로그도 최신 100줄만 유지
        const fileContent = fs.readFileSync(CLIENT_LOG_FILE, 'utf8');
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 100) {
          const trimmedLines = lines.slice(-100);
          fs.writeFileSync(CLIENT_LOG_FILE, trimmedLines.join('\n') + '\n', 'utf8');
        }
        
        console.log(`[클라이언트 로그] ${json.logs.length}줄 수신 및 저장 완료`);
        return; // 클라이언트 로그는 여기서 처리 종료
      }
    } catch (e) {
      // JSON 파싱 실패는 무시 (일반 메시지일 수 있음)
    }
    
    try {
      let messageData;
      try {
        // 큰 정수 정밀도 손실 방지: reviver 함수 사용
        // userId, user_id, myUserId, chat_id, _id 등은 문자열로 강제 변환하여 정밀도 손실 방지
        const rawData = data.toString();
        messageData = JSON.parse(rawData, (key, value) => {
          if (key === 'userId' || key === 'user_id' || key === 'myUserId' || key === 'chat_id' || key === '_id') {
            // 숫자 또는 문자열 모두 문자열로 통일
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

      // 1️⃣ IrisLink connect 타입 처리
      // ACK 메시지는 무시 (Bridge APK에서 전송 상태 알림)
      if (messageData.type === 'ack') {
        console.log(`[ACK 수신] Bridge APK에서 ACK 수신: id=${messageData.id}, status=${messageData.status}`);
        return; // ACK는 처리하지 않고 무시
      }
      
      // ========== 메시지 삭제 감지 (v.origin === 'SYNCDLMSG') ==========
      const { MESSAGE_DELETE_TRACKER, MEMBER_TRACKER } = require('./labbot-node');
      const moderationLogger = require('./db/moderationLogger');
      
      if (messageData.json?.origin === 'SYNCDLMSG') {
        console.log('[메시지 삭제] 감지됨:', { 
          message_id: messageData.json?._id,
          user_id: messageData.json?.user_id,
          room: messageData.room
        });
        
        // 삭제 횟수 추적 및 경고
        const userId = messageData.json?.user_id || messageData.json?.userId;
        if (userId && MESSAGE_DELETE_TRACKER) {
          const deleteCount = MESSAGE_DELETE_TRACKER.addDeleteLog(userId);
          // Phase 1.2: extractSenderName/extractSenderId 사용
          const { extractSenderName, extractSenderId } = require('./labbot-node');
          const senderName = extractSenderName(messageData.json, messageData.sender) || '사용자';
          const senderId = extractSenderId(messageData.json, messageData.sender) || userId;
          const warningLevel = Math.min(deleteCount, 3);
          
          if (deleteCount > 0) {
            const warningMsg = MESSAGE_DELETE_TRACKER.getWarningMessage(senderName, deleteCount);
            console.log(`[메시지 삭제] ${senderName} - ${deleteCount}회 감지`);
            
            // DB에 메시지 삭제 경고 저장
            moderationLogger.saveMessageDeleteWarning({
              roomName: messageData.room,
              senderName: senderName,
              senderId: senderId,
              deletedMessageId: messageData.json?._id,
              deletedMessageText: messageData.json?.message,  // 삭제된 메시지 내용 (있는 경우)
              deleteCount24h: deleteCount,
              warningLevel: warningLevel
            });
            
            // 경고 메시지 전송 (handleMessage 대신 직접 응답)
            ws.send(JSON.stringify({
              type: 'reply',
              replies: [warningMsg],
              room: messageData.room,
              chat_id: messageData.json?.chat_id
            }));
          }
        }
        return; // 삭제된 메시지는 추가 처리 안함
      }
      
      // ========== Feed 메시지 처리 (강퇴 등) ==========
      // msg_type이 특정 값일 때 Feed로 처리 (참고: DBManager의 Feed 타입)
      const msgType = messageData.json?.msg_type;
      const attachment = messageData.json?.attachment;
      
      // attachment가 JSON 문자열인 경우 파싱
      let feedData = null;
      if (attachment) {
        try {
          feedData = typeof attachment === 'string' ? JSON.parse(attachment) : attachment;
        } catch (e) {
          // 파싱 실패는 무시
        }
      }
      
      // feedType 확인 (attachment 내 feedType 필드)
      if (feedData && feedData.feedType && MEMBER_TRACKER) {
        const feedResult = MEMBER_TRACKER.processFeedMessage(
          feedData.feedType,
          feedData,
          messageData.room
        );
        
        if (feedResult.handled && feedResult.message) {
          console.log(`[Feed] ${feedResult.type} 처리됨:`, feedResult.message);
          
          // DB에 저장 (강퇴 또는 입퇴장)
          if (feedResult.type === 'kick') {
            // 강퇴 기록 저장
            moderationLogger.saveMemberKick({
              roomName: messageData.room,
              kickedUserName: feedData?.member?.nickName || feedData?.kickedUser?.nickName || '알 수 없음',
              kickedUserId: feedData?.member?.userId || feedData?.kickedUser?.userId,
              kickedByName: feedData?.kicker?.nickName || feedData?.kickedBy?.name || '관리자',
              kickedById: feedData?.kicker?.userId || feedData?.kickedBy?.userId,
              kickReason: feedData?.reason || null
            });
          } else if (feedResult.type === 'join' || feedResult.type === 'leave' || feedResult.type === 'invite') {
            // 입퇴장 기록 저장 (주석 해제 시 활성화)
            const members = feedData?.members || [feedData?.member];
            for (const member of members) {
              if (member) {
                moderationLogger.saveMemberActivity({
                  roomName: messageData.room,
                  userName: member?.nickName || '알 수 없음',
                  userId: member?.userId,
                  activityType: feedResult.type,
                  invitedByName: feedData?.inviter?.nickName,
                  invitedById: feedData?.inviter?.userId,
                  isKicked: feedData?.kicked === true
                });
              }
            }
          }
          
          // Feed 알림 메시지 전송
          ws.send(JSON.stringify({
            type: 'reply',
            replies: [feedResult.message],
            room: messageData.room,
            chat_id: messageData.json?.chat_id
          }));
          return; // Feed 메시지는 추가 처리 안함
        }
      }
      
      // 반응(reaction) 메시지 처리 (type: 'reaction' 또는 'reaction_update')
      if (messageData.type === 'reaction' || messageData.type === 'reaction_update' || messageData.type === 'like') {
        console.log(`[반응 처리] 반응 메시지 수신: type=${messageData.type}`);
        
        // room, sender 변수가 이미 선언되었을 수 있으므로 재선언하지 않고 재할당만 수행
        if (typeof room === 'undefined') {
          var room = messageData.room;
        } else {
          room = messageData.room;
        }
        if (typeof sender === 'undefined') {
          var sender = messageData.sender;
        } else {
          sender = messageData.sender;
        }
        const json = messageData.json;
        console.log(`[반응 처리] json keys: ${json ? Object.keys(json).join(', ') : 'null'}, sender="${sender}", room="${room}"`);
        
        // reaction_count_update 타입 처리 (경량 버전: 카운트만 저장)
        if (messageData.type === 'reaction_count_update') {
          console.log(`[반응 카운트] ========== 반응 카운트 업데이트 수신 ==========`);
          console.log(`[반응 카운트] [1단계] 이벤트 수신: type=${messageData.type}, room="${room}", sender="${sender}"`);
          
          try {
            const chatLogger = require('./db/chatLogger');
            const db = require('./db/database');
            
            // 데이터 추출
            const kakaoLogId = json?.kakao_log_id || json?.target_message_id || null;
            const chatId = json?.chat_id || null;
            const roomName = json?.room_name || room || '';
            const oldCount = json?.old_count || 0;
            const newCount = json?.new_count || 0;
            const observedAt = json?.observed_at || new Date().toISOString();
            
            console.log(`[반응 카운트] [2단계] 데이터 추출:`);
            console.log(`  - kakao_log_id: ${kakaoLogId} (type: ${typeof kakaoLogId})`);
            console.log(`  - chat_id: ${chatId}`);
            console.log(`  - room_name: ${roomName}`);
            console.log(`  - old_count: ${oldCount} -> new_count: ${newCount}`);
            
            // 메시지 ID 변환 (chat_id 기반 우선)
            console.log(`[반응 카운트] [3단계] 메시지 ID 변환 시작`);
            let actualMessageId = null;
            
            if (kakaoLogId) {
              try {
                const logIdStr = String(kakaoLogId).trim();
                
                if (logIdStr && /^\d+$/.test(logIdStr)) {
                  // chat_id 기반 매핑 (우선순위 1)
                  if (chatId) {
                    console.log(`[반응 카운트] [3-1] chat_id 기반 조회: kakao_log_id="${logIdStr}", chat_id=${chatId}`);
                    
                    // metadata에서 chat_id 확인 또는 직접 조회
                    const { data: messagesByLogId, error: queryError } = await db.supabase
                      .from('chat_messages')
                      .select('id, metadata')
                      .eq('kakao_log_id', logIdStr);
                    
                    if (queryError) {
                      console.error(`[반응 카운트] [3-1] DB 조회 오류:`, queryError);
                    } else if (messagesByLogId && messagesByLogId.length > 0) {
                      // chat_id가 metadata에 있는 경우 필터링
                      let targetMessage = null;
                      for (const msg of messagesByLogId) {
                        const msgChatId = msg.metadata?.chat_id || msg.metadata?._chat_id;
                        if (msgChatId && String(msgChatId) === String(chatId)) {
                          targetMessage = msg;
                          break;
                        }
                      }
                      
                      // chat_id 매칭 실패 시 첫 번째 메시지 사용 (하위 호환)
                      if (!targetMessage && messagesByLogId.length === 1) {
                        targetMessage = messagesByLogId[0];
                        console.log(`[반응 카운트] [3-1] ⚠️ chat_id 매칭 실패, 단일 메시지 사용`);
                      }
                      
                      if (targetMessage && targetMessage.id) {
                        actualMessageId = String(targetMessage.id);
                        console.log(`[반응 카운트] [3-1] ✅ 메시지 찾음: kakao_log_id="${logIdStr}", chat_id=${chatId} -> DB id=${actualMessageId}`);
                      }
                    }
                  }
                  
                  // chat_id 기반 매핑 실패 시 room_name 기반 (하위 호환)
                  if (!actualMessageId) {
                    console.log(`[반응 카운트] [3-2] room_name 기반 조회 (fallback): kakao_log_id="${logIdStr}", room_name="${roomName}"`);
                    
                    const { data: messageByLogId, error: queryError } = await db.supabase
                      .from('chat_messages')
                      .select('id')
                      .eq('kakao_log_id', logIdStr)
                      .eq('room_name', roomName || '')
                      .maybeSingle();
                    
                    if (queryError) {
                      console.error(`[반응 카운트] [3-2] DB 조회 오류:`, queryError);
                    } else if (messageByLogId && messageByLogId.id) {
                      actualMessageId = String(messageByLogId.id);
                      console.log(`[반응 카운트] [3-2] ✅ 메시지 찾음 (room_name): kakao_log_id="${logIdStr}" -> DB id=${actualMessageId}`);
                    }
                  }
                }
              } catch (err) {
                console.error('[반응 카운트] [3단계] 메시지 찾기 실패:', err.message);
              }
            }
            
            if (actualMessageId) {
              // 메시지 찾음: 스냅샷 저장
              console.log(`[반응 카운트] [4단계] 스냅샷 저장 시작: messageId=${actualMessageId}, count=${newCount}`);
              
              try {
                // chat_reaction_counts에 upsert
                const { data: summaryData, error: summaryError } = await db.supabase
                  .from('chat_reaction_counts')
                  .upsert({
                    message_id: actualMessageId,
                    kakao_log_id: BigInt(kakaoLogId) || null,
                    chat_id: chatId || null,
                    room_name: roomName,
                    reaction_count: newCount,
                    last_observed_at: observedAt,
                    updated_at: new Date().toISOString()
                  }, {
                    onConflict: 'message_id'
                  })
                  .select()
                  .single();
                
                if (summaryError) {
                  console.error(`[반응 카운트] [4단계] ❌ 스냅샷 저장 실패:`, summaryError);
                } else {
                  console.log(`[반응 카운트] [4단계] ✅ 스냅샷 저장 성공: id=${summaryData.id}`);
                  
                  // delta 저장 (선택)
                  if (oldCount !== newCount) {
                    const { error: deltaError } = await db.supabase
                      .from('chat_reaction_deltas')
                      .insert({
                        message_id: actualMessageId,
                        delta: newCount - oldCount,
                        old_count: oldCount,
                        new_count: newCount,
                        observed_at: observedAt
                      });
                    
                    if (deltaError) {
                      console.error(`[반응 카운트] [4-1] ❌ delta 저장 실패:`, deltaError);
                    } else {
                      console.log(`[반응 카운트] [4-1] ✅ delta 저장 성공`);
                    }
                  }
                }
              } catch (err) {
                console.error(`[반응 카운트] [4단계] 예외:`, err.message);
              }
            } else {
              // 메시지 찾기 실패: pending 큐에 적재
              console.log(`[반응 카운트] [5단계] 메시지 매핑 실패, pending 큐에 적재`);
              
              try {
                const { error: pendingError } = await db.supabase
                  .from('reaction_count_pending')
                  .insert({
                    chat_id: chatId || null,
                    kakao_log_id: BigInt(kakaoLogId) || null,
                    new_count: newCount,
                    room_name: roomName,
                    observed_at: observedAt
                  });
                
                if (pendingError) {
                  console.error(`[반응 카운트] [5단계] ❌ pending 적재 실패:`, pendingError);
                } else {
                  console.log(`[반응 카운트] [5단계] ✅ pending 적재 성공`);
                }
              } catch (err) {
                console.error(`[반응 카운트] [5단계] 예외:`, err.message);
              }
            }
          } catch (err) {
            console.error('[반응 카운트] 처리 중 오류:', err.message);
            console.error('[반응 카운트] 스택 트레이스:', err.stack);
          }
          
          return; // 처리 완료
        }
        
        // reaction_update 타입은 별도 처리 (v.defaultEmoticonsCount 기반) - 하위 호환
        if (messageData.type === 'reaction_update') {
          console.log(`[반응 업데이트] ========== 반응 이벤트 수신 시작 ==========`);
          console.log(`[반응 업데이트] [1단계] 이벤트 수신: type=${messageData.type}, room="${room}", sender="${sender}"`);
          
          try {
            const chatLogger = require('./db/chatLogger');
            const moderationLogger = require('./db/moderationLogger');
            const { extractSenderName, extractSenderId } = require('./labbot-node');
            const db = require('./db/database');
            
            // 데이터 추출
            const targetMessageId = json?.target_message_id || json?.message_id || null;
            const oldCount = json?.old_count || 0;
            const newCount = json?.new_count || json?.reaction_count || 0;
            const eventType = messageData.event_type || 'reaction_updated';
            let newReactions = json?.new_reactions || [];
            const removedReactions = json?.removed_reactions || [];
            let allReactions = json?.all_reactions || [];
            const supplement = json?.supplement || null;
            
            // ⚠️ 개선: reaction_update 수신 진입 로그 강화
            console.log(`[반응 업데이트] ⚠️⚠️⚠️ 서버 수신 진입: room="${room}", targetMessageId=${targetMessageId}, newReactions.length=${newReactions.length}, allReactions.length=${allReactions.length}, supplement=${supplement ? '있음' : '없음'}, newCount=${newCount}, oldCount=${oldCount}`);
            console.log(`[반응 업데이트] [1-1] 진입 확인: room="${room}", targetMessageId=${targetMessageId}, newReactions.length=${newReactions.length}, allReactions.length=${allReactions.length}, supplement=${supplement ? '있음' : '없음'}, newCount=${newCount}, oldCount=${oldCount}`);
            
            // ⚠️ 중요: supplement에서 allReactions 추출 시도 (클라이언트에서 전송하지 않은 경우)
            if ((!newReactions || newReactions.length === 0) && (!allReactions || allReactions.length === 0) && supplement) {
              try {
                const supplementObj = typeof supplement === 'string' ? JSON.parse(supplement) : supplement;
                console.log(`[반응 업데이트] [2-1] supplement 파싱 시도:`, JSON.stringify(supplementObj).substring(0, 200));
                
                if (supplementObj && typeof supplementObj === 'object') {
                  // 다양한 필드명 시도
                  const reactionsFromSupplement = 
                    (Array.isArray(supplementObj.reactions) ? supplementObj.reactions : null) ||
                    (Array.isArray(supplementObj.all_reactions) ? supplementObj.all_reactions : null) ||
                    (Array.isArray(supplementObj.emoticons) ? supplementObj.emoticons : null) ||
                    (Array.isArray(supplementObj.reactions?.all) ? supplementObj.reactions.all : null) ||
                    (Array.isArray(supplementObj.reactions?.list) ? supplementObj.reactions.list : null) ||
                    (Array.isArray(supplementObj.list) ? supplementObj.list : null) ||
                    [];
                  
                  if (reactionsFromSupplement.length > 0) {
                    allReactions = reactionsFromSupplement;
                    console.log(`[반응 업데이트] [2-1] ✅ supplement에서 allReactions 추출: ${allReactions.length}개`);
                  } else {
                    console.log(`[반응 업데이트] [2-1] ⚠️ supplement에 반응 정보 없음`);
                  }
                }
              } catch (err) {
                console.error(`[반응 업데이트] [2-1] supplement 파싱 오류:`, err.message);
                console.error(`[반응 업데이트] [2-1] supplement 원본:`, typeof supplement === 'string' ? supplement.substring(0, 200) : JSON.stringify(supplement).substring(0, 200));
              }
            }
            
            // ⚠️ 추가: newReactions가 비어있고 allReactions도 비어있으면 로그 출력
            if (newReactions.length === 0 && allReactions.length === 0 && newCount > 0) {
              console.warn(`[반응 업데이트] [2-2] ⚠️ 반응 개수는 ${newCount}개인데 newReactions와 allReactions가 모두 비어있음`);
              console.warn(`[반응 업데이트] [2-2] json 전체:`, JSON.stringify(json).substring(0, 500));
            }
            
            console.log(`[반응 업데이트] [2단계] 데이터 추출 완료:`);
            console.log(`  - event_type: ${eventType}`);
            console.log(`  - targetMessageId: ${targetMessageId}`);
            console.log(`  - old_count: ${oldCount} -> new_count: ${newCount}`);
            console.log(`  - new_reactions: ${newReactions.length}개`);
            console.log(`  - removed_reactions: ${removedReactions.length}개`);
            console.log(`  - all_reactions: ${allReactions.length}개`);
            console.log(`  - supplement: ${supplement ? '있음' : '없음'}`);
            
            // DB에서 실제 message id 찾기
            // ⚠️ 중요: kakao_log_id는 문자열로 처리 (64-bit 정밀도 보존)
            const chatId = json?.chat_id || null;
            console.log(`[반응 업데이트] [3단계] 메시지 ID 변환 시작: targetMessageId=${targetMessageId} (type: ${typeof targetMessageId}), chat_id=${chatId}, room="${room}"`);
            let actualMessageId = null;
            if (targetMessageId) {
              try {
                // 문자열로 변환 (숫자 변환 금지 - 정밀도 손실 방지)
                const logIdStr = String(targetMessageId).trim();
                console.log(`[반응 업데이트] [3-1] kakao_log_id 문자열: "${logIdStr}"`);
                
                if (logIdStr && /^\d+$/.test(logIdStr)) {
                  // chat_id 기반 매핑 (우선순위 1)
                  if (chatId) {
                    console.log(`[반응 업데이트] [3-2] chat_id 기반 조회: kakao_log_id="${logIdStr}", chat_id=${chatId}`);
                    
                    // metadata에서 chat_id 확인 또는 직접 chat_id 컬럼 사용
                    // 우선 kakao_log_id와 room_name으로 조회 시도
                    let query = db.supabase
                      .from('chat_messages')
                      .select('id, metadata')
                      .eq('kakao_log_id', logIdStr);
                    
                    // chat_id가 metadata에 저장되어 있다면 필터링
                    // 일단 kakao_log_id만으로 조회 후 chat_id 확인
                    const { data: messagesByLogId, error: queryError } = await query;
                    
                    if (queryError) {
                      console.error(`[반응 업데이트] [3-3] DB 조회 오류:`, queryError);
                    } else if (messagesByLogId && messagesByLogId.length > 0) {
                      // chat_id가 metadata에 있는 경우 필터링
                      let targetMessage = null;
                      for (const msg of messagesByLogId) {
                        const msgChatId = msg.metadata?.chat_id || msg.metadata?._chat_id;
                        if (msgChatId && String(msgChatId) === String(chatId)) {
                          targetMessage = msg;
                          break;
                        }
                      }
                      
                      // chat_id 매칭 실패 시 첫 번째 메시지 사용 (하위 호환)
                      if (!targetMessage && messagesByLogId.length === 1) {
                        targetMessage = messagesByLogId[0];
                        console.log(`[반응 업데이트] [3-3] ⚠️ chat_id 매칭 실패, 단일 메시지 사용`);
                      }
                      
                      if (targetMessage && targetMessage.id) {
                        actualMessageId = String(targetMessage.id);
                        console.log(`[반응 업데이트] [3-3] ✅ 메시지 찾음: kakao_log_id="${logIdStr}", chat_id=${chatId} -> DB id=${actualMessageId}`);
                      } else {
                        console.warn(`[반응 업데이트] [3-3] ⚠️ 메시지 없음: kakao_log_id="${logIdStr}", chat_id=${chatId}`);
                      }
                    } else {
                      console.warn(`[반응 업데이트] [3-3] ⚠️ 메시지 없음: kakao_log_id="${logIdStr}"`);
                    }
                  } else {
                    // chat_id가 없으면 room_name 기반 조회 (하위 호환)
                    console.log(`[반응 업데이트] [3-2] room_name 기반 조회 (chat_id 없음): kakao_log_id="${logIdStr}", room_name="${room}"`);
                    
                    const { data: messageByLogId, error: queryError } = await db.supabase
                      .from('chat_messages')
                      .select('id')
                      .eq('kakao_log_id', logIdStr)
                      .eq('room_name', room || '')
                      .maybeSingle();
                    
                    if (queryError) {
                      console.error(`[반응 업데이트] [3-3] DB 조회 오류:`, queryError);
                    } else if (messageByLogId && messageByLogId.id) {
                      actualMessageId = String(messageByLogId.id);
                      console.log(`[반응 업데이트] [3-3] ✅ 메시지 찾음 (room_name): kakao_log_id="${logIdStr}" -> DB id=${actualMessageId}`);
                    } else {
                      console.warn(`[반응 업데이트] [3-3] ⚠️ 메시지 없음: kakao_log_id="${logIdStr}", room="${room}"`);
                    }
                  }
                } else {
                  console.warn(`[반응 업데이트] [3-1] ⚠️ 유효하지 않은 형식: "${logIdStr}"`);
                }
              } catch (err) {
                console.error('[반응 업데이트] [3단계] 메시지 찾기 실패:', err.message);
                console.error('[반응 업데이트] [3단계] 스택 트레이스:', err.stack);
              }
            } else {
              console.warn(`[반응 업데이트] [3단계] ⚠️ targetMessageId가 없음`);
            }
            
            if (!actualMessageId) {
              console.error(`[반응 업데이트] [3단계] ❌ 메시지를 찾을 수 없음: targetMessageId=${targetMessageId}, room="${room}"`);
              console.error(`[반응 업데이트] [3단계] ❌ 처리 중단 (메시지가 없으면 반응 저장 불가)`);
              return; // 메시지를 찾을 수 없으면 처리 불가
            }
            
            console.log(`[반응 업데이트] [3단계] ✅ 메시지 ID 변환 완료: actualMessageId=${actualMessageId}`);
            
            const { CONFIG } = require('./labbot-node');
            
            // 1. 새로 추가된 반응 저장
            // ⚠️ 중요: newReactions가 비어있으면 allReactions 사용 (첫 실행 또는 전체 동기화)
            const reactionsToProcess = (Array.isArray(newReactions) && newReactions.length > 0) 
              ? newReactions 
              : (Array.isArray(allReactions) && allReactions.length > 0) 
                ? allReactions 
                : [];
            
            console.log(`[반응 업데이트] [4단계] 반응 저장 시작: newReactions=${newReactions.length}개, allReactions=${allReactions.length}개, 처리할 반응=${reactionsToProcess.length}개`);
            
            if (reactionsToProcess.length > 0) {
              for (let i = 0; i < reactionsToProcess.length; i++) {
                const reactionDetail = reactionsToProcess[i];
                console.log(`[반응 업데이트] [4-${i+1}] 반응 ${i+1}/${reactionsToProcess.length} 처리 시작:`, JSON.stringify(reactionDetail));
                
                const reactionTypeDetail = reactionDetail.type || reactionDetail.emoType || reactionDetail.reaction || 'thumbs_up';
                const reactorId = reactionDetail.userId || reactionDetail.user_id || null;
                
                console.log(`[반응 업데이트] [4-${i+1}-1] 반응 정보 추출: type=${reactionTypeDetail}, reactorId=${reactorId}`);
                
                // reactorId로 반응자 이름 조회 시도
                let reactorName = null;
                if (reactorId) {
                  try {
                    console.log(`[반응 업데이트] [4-${i+1}-2] 반응자 이름 조회 시작: reactorId=${reactorId}`);
                    const { data: userData, error: userQueryError } = await db.supabase
                      .from('chat_messages')
                      .select('sender_name')
                      .eq('sender_id', String(reactorId))
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    
                    if (userQueryError) {
                      console.warn(`[반응 업데이트] [4-${i+1}-2] 반응자 이름 조회 오류:`, userQueryError);
                    } else if (userData && userData.sender_name) {
                      reactorName = userData.sender_name;
                      console.log(`[반응 업데이트] [4-${i+1}-2] ✅ 반응자 이름 찾음: ${reactorName}`);
                    } else {
                      console.log(`[반응 업데이트] [4-${i+1}-2] ⚠️ 반응자 이름 없음 (reactorId만 사용)`);
                    }
                  } catch (err) {
                    console.error(`[반응 업데이트] [4-${i+1}-2] 반응자 이름 조회 예외:`, err.message);
                  }
                } else {
                  console.warn(`[반응 업데이트] [4-${i+1}-2] ⚠️ reactorId가 없음`);
                }
                
                // 관리자 반응 여부 확인
                const isAdminReaction = CONFIG.ADMIN_USERS.some(admin => {
                  const adminName = admin.includes('/') ? admin.split('/')[0] : admin;
                  const adminId = admin.includes('/') ? admin.split('/')[1] : null;
                  return (reactorName && adminName === reactorName) || (reactorId && adminId && String(reactorId) === adminId);
                });
                
                console.log(`[반응 업데이트] [4-${i+1}-3] 관리자 반응 여부: ${isAdminReaction}`);
                console.log(`[반응 업데이트] [4-${i+1}-4] saveReaction 호출 시작: messageId=${actualMessageId}, type=${reactionTypeDetail}, reactorName=${reactorName || 'null'}, reactorId=${reactorId || 'null'}`);
                
                // 반응 저장
                const reactionSaveResult = await chatLogger.saveReaction(
                  actualMessageId,
                  reactionTypeDetail,
                  reactorName,
                  reactorId ? String(reactorId) : null,
                  isAdminReaction
                );
                
                console.log(`[반응 업데이트] [4-${i+1}-5] saveReaction 결과:`, reactionSaveResult ? `성공 (id=${reactionSaveResult.id})` : '실패 또는 중복');
                
                if (reactionSaveResult) {
                  console.log(`[반응 업데이트] [4-${i+1}-6] 로그 저장 시작`);
                  try {
                    await moderationLogger.saveReactionLog({
                      roomName: room,
                      targetMessageId: String(targetMessageId),
                      targetMessageText: null,
                      reactorName: reactorName,
                      reactorId: reactorId ? String(reactorId) : null,
                      reactionType: reactionTypeDetail,
                      isAdminReaction: isAdminReaction
                    });
                    console.log(`[반응 업데이트] [4-${i+1}-6] ✅ 로그 저장 성공`);
                  } catch (logErr) {
                    console.error(`[반응 업데이트] [4-${i+1}-6] ❌ 로그 저장 실패:`, logErr.message);
                  }
                  console.log(`[반응 추가] ✅ 저장 성공: messageId=${actualMessageId}, type=${reactionTypeDetail}, reactor=${reactorName || reactorId}`);
                } else {
                  console.warn(`[반응 추가] ⚠️ 저장 실패 또는 중복: messageId=${actualMessageId}, type=${reactionTypeDetail}, reactor=${reactorName || reactorId}`);
                }
              }
            } else {
              console.log(`[반응 업데이트] [4단계] 처리할 반응 없음 (newReactions.length=${newReactions.length}, allReactions.length=${allReactions.length})`);
            }
            
            // 2. 제거된 반응 삭제
            console.log(`[반응 업데이트] [5단계] 제거된 반응 삭제 시작: ${removedReactions.length}개`);
            if (Array.isArray(removedReactions) && removedReactions.length > 0) {
              for (let i = 0; i < removedReactions.length; i++) {
                const reactionDetail = removedReactions[i];
                console.log(`[반응 업데이트] [5-${i+1}] 반응 삭제 ${i+1}/${removedReactions.length} 처리 시작:`, JSON.stringify(reactionDetail));
                
                const reactionTypeDetail = reactionDetail.type || reactionDetail.emoType || reactionDetail.reaction || 'thumbs_up';
                const reactorId = reactionDetail.userId || reactionDetail.user_id || null;
                
                if (reactorId) {
                  try {
                    console.log(`[반응 업데이트] [5-${i+1}] DB 삭제 시작: messageId=${actualMessageId}, reactorId=${reactorId}, type=${reactionTypeDetail}`);
                    
                    // 반응 삭제 (reactor_id와 reaction_type으로 식별)
                    const { data: deletedData, error: deleteError } = await db.supabase
                      .from('chat_reactions')
                      .delete()
                      .eq('message_id', actualMessageId)
                      .eq('reactor_id', String(reactorId))
                      .eq('reaction_type', reactionTypeDetail)
                      .select();
                    
                    if (deleteError) {
                      console.error(`[반응 업데이트] [5-${i+1}] ❌ 삭제 실패:`, deleteError);
                      console.error(`[반응 삭제] 실패: messageId=${actualMessageId}, reactorId=${reactorId}, type=${reactionTypeDetail}`, deleteError);
                    } else {
                      const deletedCount = deletedData ? deletedData.length : 0;
                      if (deletedCount > 0) {
                        console.log(`[반응 업데이트] [5-${i+1}] ✅ 삭제 성공: ${deletedCount}개 레코드 삭제됨`);
                        console.log(`[반응 삭제] ✅ 성공: messageId=${actualMessageId}, reactorId=${reactorId}, type=${reactionTypeDetail}`);
                      } else {
                        console.warn(`[반응 업데이트] [5-${i+1}] ⚠️ 삭제할 레코드 없음 (이미 삭제되었거나 존재하지 않음)`);
                      }
                    }
                  } catch (err) {
                    console.error(`[반응 업데이트] [5-${i+1}] ❌ 삭제 예외:`, err.message);
                    console.error(`[반응 삭제] 오류:`, err.message);
                    console.error(`[반응 삭제] 스택 트레이스:`, err.stack);
                  }
                } else {
                  console.warn(`[반응 업데이트] [5-${i+1}] ⚠️ reactorId가 없어서 삭제 불가`);
                }
              }
            } else {
              console.log(`[반응 업데이트] [5단계] 제거된 반응 없음 (removedReactions.length=${removedReactions.length})`);
            }
            
            // 3. fallback: new_reactions가 없고 supplement가 있는 경우 (기존 로직)
            console.log(`[반응 업데이트] [6단계] Fallback 처리 확인: newReactions=${newReactions.length}, removedReactions=${removedReactions.length}, supplement=${supplement ? '있음' : '없음'}, newCount=${newCount}`);
            if (newReactions.length === 0 && removedReactions.length === 0 && supplement && newCount > 0) {
              console.log(`[반응 업데이트] [6단계] Fallback 모드 시작: supplement에서 반응 정보 추출`);
              try {
                let supplementData = supplement;
                if (typeof supplement === 'string') {
                  console.log(`[반응 업데이트] [6-1] supplement 파싱 시작 (문자열)`);
                  supplementData = JSON.parse(supplement);
                  console.log(`[반응 업데이트] [6-1] ✅ supplement 파싱 성공`);
                } else {
                  console.log(`[반응 업데이트] [6-1] supplement는 이미 객체`);
                }
                
                if (supplementData && typeof supplementData === 'object') {
                  const reactions = supplementData.reactions || supplementData.emoticons || [];
                  console.log(`[반응 업데이트] [6-2] reactions 배열 추출: ${reactions.length}개`);
                  
                  if (Array.isArray(reactions) && reactions.length > 0) {
                    console.log(`[반응 업데이트] [6-3] fallback: supplement에서 ${reactions.length}개 반응 상세 정보 발견`);
                    
                    // 각 반응별로 저장 (중복 체크는 saveReaction에서 처리)
                    for (let i = 0; i < reactions.length; i++) {
                      const reactionDetail = reactions[i];
                      console.log(`[반응 업데이트] [6-3-${i+1}] 반응 ${i+1}/${reactions.length} 처리:`, JSON.stringify(reactionDetail));
                      
                      const reactionTypeDetail = reactionDetail.type || reactionDetail.emoType || reactionDetail.reaction || 'thumbs_up';
                      const reactorId = reactionDetail.userId || reactionDetail.user_id || null;
                      
                      let reactorName = null;
                      if (reactorId) {
                        try {
                          console.log(`[반응 업데이트] [6-3-${i+1}-1] 반응자 이름 조회: reactorId=${reactorId}`);
                          const { data: userData, error: userQueryError } = await db.supabase
                            .from('chat_messages')
                            .select('sender_name')
                            .eq('sender_id', String(reactorId))
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                          
                          if (userQueryError) {
                            console.warn(`[반응 업데이트] [6-3-${i+1}-1] 조회 오류:`, userQueryError);
                          } else if (userData && userData.sender_name) {
                            reactorName = userData.sender_name;
                            console.log(`[반응 업데이트] [6-3-${i+1}-1] ✅ 반응자 이름: ${reactorName}`);
                          }
                        } catch (err) {
                          console.error(`[반응 업데이트] [6-3-${i+1}-1] 조회 예외:`, err.message);
                        }
                      }
                      
                      const isAdminReaction = CONFIG.ADMIN_USERS.some(admin => {
                        const adminName = admin.includes('/') ? admin.split('/')[0] : admin;
                        const adminId = admin.includes('/') ? admin.split('/')[1] : null;
                        return (reactorName && adminName === reactorName) || (reactorId && adminId && String(reactorId) === adminId);
                      });
                      
                      console.log(`[반응 업데이트] [6-3-${i+1}-2] saveReaction 호출: messageId=${actualMessageId}, type=${reactionTypeDetail}, reactorName=${reactorName || 'null'}, reactorId=${reactorId || 'null'}`);
                      
                      const reactionSaveResult = await chatLogger.saveReaction(
                        actualMessageId,
                        reactionTypeDetail,
                        reactorName,
                        reactorId ? String(reactorId) : null,
                        isAdminReaction
                      );
                      
                      console.log(`[반응 업데이트] [6-3-${i+1}-2] saveReaction 결과:`, reactionSaveResult ? `성공 (id=${reactionSaveResult.id})` : '실패 또는 중복');
                      
                      if (reactionSaveResult) {
                        try {
                          await moderationLogger.saveReactionLog({
                            roomName: room,
                            targetMessageId: String(targetMessageId),
                            targetMessageText: null,
                            reactorName: reactorName,
                            reactorId: reactorId ? String(reactorId) : null,
                            reactionType: reactionTypeDetail,
                            isAdminReaction: isAdminReaction
                          });
                          console.log(`[반응 업데이트] [6-3-${i+1}-3] ✅ 로그 저장 성공`);
                        } catch (logErr) {
                          console.error(`[반응 업데이트] [6-3-${i+1}-3] ❌ 로그 저장 실패:`, logErr.message);
                        }
                        console.log(`[반응 업데이트] ✅ 저장 성공: messageId=${actualMessageId}, type=${reactionTypeDetail}, reactor=${reactorName || reactorId}`);
                      } else {
                        console.warn(`[반응 업데이트] ⚠️ 저장 실패 또는 중복: messageId=${actualMessageId}, type=${reactionTypeDetail}`);
                      }
                    }
                  } else {
                    console.log(`[반응 업데이트] [6-2] reactions 배열이 비어있음`);
                  }
                } else {
                  console.warn(`[반응 업데이트] [6-1] supplementData가 객체가 아님:`, typeof supplementData);
                }
              } catch (err) {
                console.error('[반응 업데이트] [6단계] supplement 파싱 오류:', err.message);
                console.error('[반응 업데이트] [6단계] 스택 트레이스:', err.stack);
              }
            } else {
              console.log(`[반응 업데이트] [6단계] Fallback 조건 불만족 (스킵)`);
            }
            
            console.log(`[반응 업데이트] ========== 반응 이벤트 처리 완료 ==========`);
          } catch (err) {
            console.error('[반응 업데이트] ========== 처리 오류 발생 ==========');
            console.error('[반응 업데이트] 오류 메시지:', err.message);
            console.error('[반응 업데이트] 스택 트레이스:', err.stack);
            console.error('[반응 업데이트] 오류 상세:', JSON.stringify({
              message: err.message,
              stack: err.stack,
              name: err.name
            }, null, 2));
          }
          return; // reaction_update는 여기서 처리 완료
        }
        
        // 기존 반응 메시지 처리 (type: 'reaction')
        const chatLogger = require('./db/chatLogger');
        
        try {
          // 반응 정보 추출 (더 많은 필드 확인)
          const targetMessageId = json?.target_message_id || json?.target_id || json?.message_id || json?.chat_id || null;
          const reactionType = json?.reaction_type || json?.reaction || json?.like || 'thumbs_up';
          
          // sender에서 이름과 ID 추출
          let reactorName = '';
          let reactorId = null;
          
          if (sender) {
            if (sender.includes('/')) {
              const parts = sender.split('/');
              reactorName = parts[0].trim();
              reactorId = parts[1] || null;
            } else {
              reactorName = sender;
              // json에서 user_id 찾기
              reactorId = json?.user_id || json?.userId || null;
            }
          }
          
          // 관리자 반응 여부 확인
          const { CONFIG } = require('./labbot-node');
          const isAdminReaction = CONFIG.ADMIN_USERS.some(admin => {
            const adminName = admin.includes('/') ? admin.split('/')[0] : admin;
            const adminId = admin.includes('/') ? admin.split('/')[1] : null;
            return (reactorName && adminName === reactorName) || (reactorId && adminId && reactorId === adminId);
          });
          
          if (targetMessageId && reactorName) {
            // targetMessageId는 kakao_log_id일 수 있으므로, 먼저 DB에서 실제 message id를 찾아야 함
            let actualMessageId = null;
            try {
              // ✅ 숫자만 구성된 문자열인지 검증
              const numericStr = String(targetMessageId).trim();
              if (/^\d+$/.test(numericStr)) {
                const numericLogId = parseInt(numericStr, 10);
                if (!isNaN(numericLogId) && numericLogId > 0) {
                  const db = require('./db/database');
                  const { data: messageByLogId } = await db.supabase
                    .from('chat_messages')
                    .select('id')
                    .eq('kakao_log_id', numericLogId)
                    .eq('room_name', room || decryptedRoomName || '')  // ✅ room scope 제한 추가
                    .maybeSingle();  // ✅ single() 대신 maybeSingle() 사용
                  if (messageByLogId && messageByLogId.id) {
                    actualMessageId = String(messageByLogId.id);
                    console.log(`[반응 저장] kakao_log_id(${numericLogId})로 메시지 찾음: DB id=${actualMessageId}, room="${room || decryptedRoomName || ''}"`);
                  }
                }
              }
            } catch (err) {
              console.warn('[반응 저장] kakao_log_id로 메시지 찾기 실패:', err.message);
            }
            
            // kakao_log_id로 찾지 못했으면 targetMessageId를 그대로 사용 (DB id일 수도 있음)
            const messageIdToSave = actualMessageId || String(targetMessageId);
            
            const reactionSaveResult = await chatLogger.saveReaction(
              messageIdToSave,
              reactionType,
              reactorName,
              reactorId ? String(reactorId) : null,
              isAdminReaction
            );
            
            if (reactionSaveResult) {
              // 반응 상세 로그도 저장 (kakao_log_id 사용)
              await moderationLogger.saveReactionLog({
                roomName: room,
                targetMessageId: String(targetMessageId), // kakao_log_id 저장
                targetMessageText: null,  // 대상 메시지 내용은 별도 조회 필요
                reactorName: reactorName,
                reactorId: reactorId,
                reactionType: reactionType,
                isAdminReaction: isAdminReaction
              });
              
              console.log('[반응 저장] ✅ 성공:', {
                db_id: messageIdToSave,
                kakao_log_id: targetMessageId,
                reaction_type: reactionType,
                reactor: reactorName,
                reactor_id: reactorId,
                is_admin: isAdminReaction,
                room: room,
                saved_reaction_id: reactionSaveResult.id
              });
            } else {
              console.warn('[반응 저장] ⚠️ saveReaction 반환값이 null (중복 또는 오류):', {
                messageIdToSave,
                targetMessageId,
                reactionType,
                reactorName
              });
            }
          } else {
            console.warn('[반응 저장] ❌ 실패: targetMessageId 또는 reactorName/reactorId 없음', {
              targetMessageId,
              reactorName,
              reactorId,
              sender: sender,
              room: room,
              json_keys: json ? Object.keys(json).join(', ') : 'null',
              json_preview: json ? JSON.stringify(json).substring(0, 200) : 'null'
            });
          }
        } catch (err) {
          console.error('[반응 저장] 오류:', err.message, err.stack);
        }
        
        return; // 반응 메시지는 추가 처리 불필요
      }
      
      // Bridge APK 식별 메시지 처리
      if (messageData.type === 'bridge_connect') {
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] ✓✓✓ Bridge APK 클라이언트 연결 확인 ✓✓✓`);
        console.log(`[${new Date().toISOString()}]   client: ${messageData.client || 'unknown'}`);
        // 클라이언트에 Bridge APK 플래그 설정
        ws.isBridge = true;
        console.log(`[${new Date().toISOString()}]   ws.isBridge = true 설정 완료`);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════════`);
        ws.send(JSON.stringify({
          type: 'bridge_connected',
          ok: true
        }));
        return;
      }
      
      if (messageData.type === 'connect') {
        console.log(`[${new Date().toISOString()}] Iris client handshake OK`);
        // Iris 클라이언트는 Bridge APK가 아님
        ws.isBridge = false;
        ws.send(JSON.stringify({
          type: 'connected',
          ok: true
        }));
        return;
      }

      // 2️⃣ IrisLink message 타입 처리
      if (messageData.type === 'message') {
        // ⚠️ 중요: 일반 메시지 수신 로그
        const kakaoLogId = messageData.json?._id || messageData.json?.kakao_log_id || 'N/A';
        console.log(`[메시지 수신] ⚠️⚠️⚠️ 일반 메시지 수신: type=message, kakao_log_id=${kakaoLogId}, room=${messageData.room || 'N/A'}, sender=${messageData.sender || 'N/A'}`);
        
        // room, sender, isGroupChat 변수가 이미 선언되었을 수 있으므로 재선언하지 않고 재할당만 수행
        if (typeof room === 'undefined') {
          var room = messageData.room;
        } else {
          room = messageData.room;
        }
        if (typeof sender === 'undefined') {
          var sender = messageData.sender;
        } else {
          sender = messageData.sender;
        }
        if (typeof isGroupChat === 'undefined') {
          var isGroupChat = messageData.isGroupChat;
        } else {
          isGroupChat = messageData.isGroupChat;
        }
        const message = messageData.message;
        const json = messageData.json;
        
        // 발신자 이름 처리:
        // 1. 클라이언트에서 이미 "이름/user_id" 형식으로 보낸 경우 그대로 사용
        // 2. sender가 암호화된 base64 문자열인 경우 복호화 시도
        // 3. sender가 숫자만 있는 경우 json에서 이름 찾아서 "이름/user_id" 형식으로 변환
        if (sender) {
          // 이미 "이름/user_id" 형식이면 그대로 사용
          if (sender.includes('/')) {
            const parts = sender.split('/');
            const namePart = parts[0].trim();
            const userIdPart = parts[1];
            
            // 이름 부분이 암호화되어 있는지 확인 (base64로 보이는 경우)
            const isBase64Like = namePart.length > 10 && 
                                 namePart.length % 4 === 0 &&
                                 /^[A-Za-z0-9+/=]+$/.test(namePart);
            
            if (isBase64Like && json) {
              // 이름 부분이 암호화되어 있으면 복호화 시도
              const myUserId = json.myUserId || json.userId || userIdPart;
              let decryptedName = null;
              
              for (const encTry of [31, 30, 32]) {
                decryptedName = decryptKakaoTalkMessage(namePart, String(myUserId), encTry);
                if (decryptedName && decryptedName !== namePart) {
                  const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decryptedName);
                  if (!hasControlChars) {
                    sender = `${decryptedName}/${userIdPart}`;
                    console.log(`[발신자 복호화] 성공: "${namePart}" -> "${decryptedName}" (enc=${encTry})`);
                    break;
                  }
                }
              }
              
              if (!decryptedName || decryptedName === namePart) {
                console.log(`[발신자 복호화] 실패: "${namePart}" 복호화 불가`);
              }
            } else {
              console.log(`[발신자] 클라이언트에서 전송한 형식 사용: "${sender}"`);
            }
          } else {
            // sender가 단일 값인 경우
            const senderStr = String(sender).trim();
            const isBase64Like = senderStr.length > 10 && 
                                 senderStr.length % 4 === 0 &&
                                 /^[A-Za-z0-9+/=]+$/.test(senderStr);
            
            if (isBase64Like) {
              // 암호화된 base64 문자열로 보임 - 복호화 시도
              console.log(`[발신자] 암호화된 문자열 감지, 복호화 시도: "${senderStr.substring(0, 20)}..."`);
              
              if (json) {
                // user_id가 필요함 (Iris 방식: botId로 복호화)
                const myUserId = json.myUserId || json.userId || json.user_id;
                
                if (myUserId) {
                  let decryptedName = null;
                  
                  // enc 후보: 31, 30, 32 순서로 시도
                  for (const encTry of [31, 30, 32]) {
                    decryptedName = decryptKakaoTalkMessage(senderStr, String(myUserId), encTry);
                    if (decryptedName && decryptedName !== senderStr) {
                      const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decryptedName);
                      if (!hasControlChars) {
                        const userIdPart = json.user_id || json.userId || myUserId;
                        sender = `${decryptedName}/${userIdPart}`;
                        console.log(`[발신자 복호화] 성공: "${senderStr.substring(0, 20)}..." -> "${decryptedName}" (enc=${encTry})`);
                        break;
                      }
                    }
                  }
                  
                  if (!decryptedName || decryptedName === senderStr) {
                    console.log(`[발신자 복호화] 실패: "${senderStr.substring(0, 20)}..." 복호화 불가 (myUserId=${myUserId})`);
                  }
                } else {
                  console.log(`[발신자 복호화] 실패: myUserId가 없어 복호화 불가`);
                }
              }
            } else if (/^\d+$/.test(senderStr)) {
              // 숫자만 있으면 user_id로 판단, json에서 이름 찾기
              if (json) {
                let userName = json.user_name || json.userName || json.sender_name;
                
                // 암호화되어 있다면 복호화 시도
                if (userName && typeof userName === 'string') {
                  const userNameIsBase64 = userName.length > 10 && 
                                           userName.length % 4 === 0 &&
                                           /^[A-Za-z0-9+/=]+$/.test(userName);
                  
                  if (userNameIsBase64 && json.userId) {
                    // 카카오톡 복호화 시도 (MY_USER_ID 사용)
                    const myUserId = json.myUserId || json.userId;
                    let decryptedName = null;
                    
                    for (const encTry of [31, 30, 32]) {
                      decryptedName = decryptKakaoTalkMessage(userName, String(myUserId), encTry);
                      if (decryptedName && decryptedName !== userName) {
                        const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decryptedName);
                        if (!hasControlChars) {
                          userName = decryptedName;
                          console.log(`[발신자 복호화] json.user_name 복호화 성공: "${userName}" (enc=${encTry})`);
                          break;
                        }
                      }
                    }
                  }
                }
                
                // 이름을 찾았으면 "이름/user_id" 형식으로 변환
                if (userName && !/^\d+$/.test(userName)) {
                  sender = `${userName}/${sender}`;
                  console.log(`[발신자 파싱] 닉네임 추가: "${sender}"`);
                }
              }
            }
          }
        }
        
        // 디버그: messageData 구조 확인
        console.log(`[디버그] messageData 구조: type=${messageData.type}, room=${room}, sender=${sender}`);
        console.log(`[디버그] messageData.json 존재 여부: ${!!json}, json 타입: ${typeof json}`);
        if (json) {
          console.log(`[디버그] json 객체 전체: ${JSON.stringify(json).substring(0, 500)}`);
          console.log(`[디버그] json.userId=${json.userId}, json.user_id=${json.user_id}, json.myUserId=${json.myUserId}`);
        }
        
        // 클라이언트에서 이미 복호화를 시도했으므로 그대로 사용
        // 만약 여전히 암호화되어 있다면 서버에서 추가 복호화 시도
        let decryptedMessage = message || '';
        
        // json 필드에서 원본 데이터 확인
        if (json && decryptedMessage) {
          // 디버그: 수신한 json 객체의 user_id 관련 필드 확인
          console.log(`[디버그] 수신한 json 객체: userId=${json.userId}, user_id=${json.user_id}, myUserId=${json.myUserId}`);
          console.log(`[디버그] json 객체 타입: ${typeof json.userId}, ${typeof json.user_id}, ${typeof json.myUserId}`);
          
          // base64로 보이는 경우 카카오톡 복호화 시도
          const isBase64Like = decryptedMessage.length > 10 && 
                               decryptedMessage.length % 4 === 0 &&
                               /^[A-Za-z0-9+/=]+$/.test(decryptedMessage);
          
          console.log(`[복호화 시도] 메시지 ID: ${json._id}, isBase64Like: ${isBase64Like}, 길이: ${decryptedMessage.length}`);
          
          if (isBase64Like) {
            // v 필드에서 enc 추출 (기본값: 31)
            // kakaodecrypt.py 테스트에서 enc=31이 가장 일반적이므로 기본값을 31로 고정
            let enc = 31;  // 기본값을 31로 고정
            console.log(`[복호화] 초기 enc: ${enc} (기본값 31)`);
            
            // v 필드에서 enc 추출 (우선순위 높음 - 가장 정확한 정보)
            if (json.v) {
              console.log(`[복호화] v 필드 타입: ${typeof json.v}, 값: ${typeof json.v === 'string' ? json.v.substring(0, 100) : json.v}`);
              
              if (typeof json.v === 'string') {
                try {
                  const vParsed = JSON.parse(json.v);
                  console.log(`[복호화] v 파싱 성공: ${JSON.stringify(vParsed)}`);
                  if (vParsed && typeof vParsed === 'object' && vParsed.enc !== undefined && vParsed.enc !== null) {
                    enc = Number(vParsed.enc);
                    console.log(`[복호화] v에서 enc 추출: ${enc}`);
                  }
                } catch (e) {
                  console.log(`[복호화] v JSON 파싱 실패: ${e.message}, 기본값 사용: ${enc}`);
                }
              } else if (typeof json.v === 'object' && json.v.enc !== undefined && json.v.enc !== null) {
                enc = Number(json.v.enc);
                console.log(`[복호화] v 객체에서 enc 추출: ${enc}`);
              }
            }
            
            // v 필드에서 enc를 찾지 못했을 때만 json.encType 사용 (fallback)
            if (enc === 31 && json.encType !== undefined && json.encType !== null) {
              const jsonEncType = Number(json.encType);
              if (jsonEncType !== 31) {
                console.log(`[복호화] v 필드에서 enc를 찾지 못함, json.encType 사용: ${jsonEncType}`);
                enc = jsonEncType;
              }
            }
            
            // ⚠️ 중요: 정상 작동 코드(55baa72) 기준으로 MY_USER_ID를 우선 사용
            // 클라이언트에서도 MY_USER_ID로 복호화하므로 서버에서도 동일하게 처리
            const myUserId = json.myUserId;  // 자신의 user_id (우선 사용)
            const senderUserId = json.user_id || json.userId;  // 발신자 user_id (fallback용, 하지만 잘못된 값일 수 있음)
            
            // userId=1 같은 잘못된 값 필터링
            const isValidUserId = (uid) => {
              if (!uid) return false;
              const uidNum = Number(uid);
              return uidNum > 1000;  // 1000보다 큰 값만 유효한 user_id로 간주
            };
            
            console.log(`[복호화] myUserId: ${myUserId}, senderUserId: ${senderUserId}`);
            console.log(`[디버그] json.userId=${json.userId}, json.user_id=${json.user_id}, json.myUserId=${json.myUserId}`);
            
            // 카카오톡 복호화 시도 (MY_USER_ID 우선 사용, 정상 작동 코드 기준)
            const decryptUserId = isValidUserId(myUserId) ? myUserId : (isValidUserId(senderUserId) ? senderUserId : null);
            
            if (decryptUserId) {
              try {
                // enc 후보: 우선 enc (v 필드 또는 json.encType에서 추출한 값), 이후 31, 30, 32 순으로 재시도
                // kakaodecrypt.py 테스트에서 enc=31이 가장 일반적이므로 우선순위 높임
                const encCandidates = [];
                if (enc !== undefined && enc !== null) encCandidates.push(enc);
                // 기본값 31을 우선 시도 (가장 일반적)
                encCandidates.push(31);
                // 다른 후보들
                encCandidates.push(30, 32);
                const encUnique = Array.from(new Set(encCandidates));
                console.log(`[복호화] enc 후보 목록: ${encUnique.join(', ')}, 사용할 user_id: ${decryptUserId} (${isValidUserId(myUserId) ? 'MY_USER_ID' : 'senderUserId'})`);

                // userId 후보: MY_USER_ID 우선, 없으면 senderUserId
                const userCandidates = [];
                if (isValidUserId(myUserId)) {
                  userCandidates.push(String(myUserId));
                  console.log(`[복호화] MY_USER_ID 우선 사용: ${myUserId}`);
                }
                if (isValidUserId(senderUserId) && senderUserId != myUserId) {
                  userCandidates.push(String(senderUserId));
                  console.log(`[복호화] senderUserId fallback 추가: ${senderUserId}`);
                }

                let decryptedFound = null;
                for (const uid of userCandidates) {
                  for (const encTry of encUnique) {
                    console.log(`[복호화] 시도: user_id=${uid}, enc=${encTry}, 메시지 길이=${decryptedMessage.length}`);
                    // userId는 문자열로, encType은 숫자로 전달
                    const d = decryptKakaoTalkMessage(decryptedMessage, String(uid), Number(encTry));
                    if (d && d !== decryptedMessage && d !== null) {
                      // 복호화된 결과가 원본과 다르고, 유효한 텍스트인지 확인
                      const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(d);
                      
                      // 추가 검증: 복호화된 결과가 의미 있는 텍스트인지 확인
                      // 1. 빈 문자열이 아니어야 함
                      // 2. 제어문자가 없어야 함
                      // 3. 너무 짧지 않아야 함 (최소 1자)
                      // 4. base64 패턴이 아니어야 함 (복호화 실패 시 base64가 그대로 나올 수 있음)
                      const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(d) && d.length > 20;
                      const isValidText = d.length > 0 && !hasControlChars && !isBase64Pattern;
                      
                      if (isValidText) {
                        decryptedFound = d;
                        console.log(`[✓ 복호화 성공] 메시지 ID: ${json._id}, user_id=${uid}, enc=${encTry}, 복호화 길이: ${d.length}`);
                        console.log(`[✓ 복호화 성공] 복호화된 메시지 미리보기: "${d.substring(0, 100)}${d.length > 100 ? '...' : ''}"`);
                        break;
                      } else {
                        console.log(`[복호화] 복호화 결과가 유효하지 않음: 제어문자=${hasControlChars}, base64패턴=${isBase64Pattern}, 길이=${d.length}`);
                        console.log(`[복호화] 복호화 결과 샘플: "${d.substring(0, 50)}${d.length > 50 ? '...' : ''}"`);
                      }
                    } else {
                      console.log(`[복호화] 복호화 실패 또는 결과 없음: d=${d ? '있음' : 'null'}, 원본과 동일=${d === decryptedMessage}`);
                    }
                  }
                  if (decryptedFound) break;
                }

                if (decryptedFound) {
                  decryptedMessage = decryptedFound;
                  console.log(`[✓ 복호화 성공] 최종 메시지: "${decryptedMessage.substring(0, 100)}${decryptedMessage.length > 100 ? '...' : ''}"`);
                } else {
                  console.log(`[✗ 복호화 실패] 메시지 ID: ${json._id}, 모든 enc/userId 시도 실패`);
                  console.log(`[경고] 복호화 실패했지만 원본 메시지를 사용하여 계속 진행합니다.`);
                  console.log(`[디버그] 시도한 user_id 후보: ${userCandidates.join(', ')}, enc 후보: ${encUnique.join(', ')}`);
                  console.log(`[디버그] MY_USER_ID 유효성: ${isValidUserId(myUserId)}, senderUserId 유효성: ${isValidUserId(senderUserId)}`);
                  // 복호화 실패해도 원본 메시지를 사용 (명령어 매칭을 위해)
                }
              } catch (e) {
                console.log(`[✗ 복호화 오류] 메시지 ID: ${json._id}, 오류: ${e.message}`);
                console.error(e);
              }
            } else {
              console.log(`[✗ 복호화 실패] 발신자 userId 없음: userId=${json.userId}, user_id=${json.user_id}`);
              console.log(`[경고] Iris 코드 기준: 발신자 user_id가 필요함 (ObserverHelper.kt 참조)`);
              // userId가 없으면 base64 디코딩만 시도 (일반적으로 실패할 가능성이 높음)
              try {
                const decoded = Buffer.from(decryptedMessage, 'base64').toString('utf-8');
                if (decoded && decoded.length > 0 && !decoded.match(/^[A-Za-z0-9+/=]+$/)) {
                  decryptedMessage = decoded;
                  console.log(`[복호화] base64 디코딩 성공`);
                }
              } catch (e) {
                console.log(`[복호화] base64 디코딩 실패: ${e.message}`);
              }
            }
          }
        }
        
        // ========== 채팅방 이름 복호화 및 필터링 ==========
        let decryptedRoomName = room;
        const TARGET_ROOM_NAME = '의운모';
        
        console.log(`[채팅방 필터링] 시작: room="${room}", 타입=${typeof room}`);
        
        // 클라이언트에서 이미 복호화한 이름이 있으면 우선 사용
        if (json && json.room_name_decrypted) {
          decryptedRoomName = json.room_name_decrypted;
          console.log(`[채팅방 이름] 클라이언트에서 복호화된 이름 사용: "${decryptedRoomName}"`);
        }
        // json 필드에서 채팅방 이름 정보 확인 (암호화된 경우 복호화 시도)
        else if (json && json.room_name) {
          const roomNameRaw = json.room_name;
          
          // base64로 보이는 경우 복호화 시도
          const isBase64Like = typeof roomNameRaw === 'string' && 
                               roomNameRaw.length > 10 && 
                               roomNameRaw.length % 4 == 0 &&
                               /^[A-Za-z0-9+/=]+$/.test(roomNameRaw);
          
          if (isBase64Like) {
            console.log(`[채팅방 이름 복호화] 시도: room_name 길이=${roomNameRaw.length}`);
            
            // enc 후보: private_meta에서 추출 시도
            let enc = 31; // 기본값
            
            // room_data에서 private_meta 확인
            if (json.room_data && json.room_data.private_meta) {
              try {
                const privateMetaStr = typeof json.room_data.private_meta === 'string' 
                  ? json.room_data.private_meta 
                  : JSON.stringify(json.room_data.private_meta);
                const privateMeta = JSON.parse(privateMetaStr);
                if (privateMeta && typeof privateMeta === 'object' && privateMeta.enc !== undefined) {
                  enc = Number(privateMeta.enc) || 31;
                  console.log(`[채팅방 이름 복호화] private_meta에서 enc 추출: ${enc}`);
                }
              } catch (e) {
                // 무시
              }
            }
            
            // v 필드에서 enc 추출
            if (json.v) {
              try {
                const vParsed = typeof json.v === 'string' ? JSON.parse(json.v) : json.v;
                if (vParsed && typeof vParsed === 'object' && vParsed.enc !== undefined) {
                  enc = Number(vParsed.enc) || 31;
                  console.log(`[채팅방 이름 복호화] v 필드에서 enc 추출: ${enc}`);
                }
              } catch (e) {
                // 무시
              }
            }
            
            // userId 후보: myUserId 우선 (채팅방 이름은 자신의 user_id로 복호화)
            const myUserId = json.myUserId;
            const senderUserId = json.userId || json.user_id;
            
            const userCandidates = [];
            if (myUserId) userCandidates.push(String(myUserId));
            if (senderUserId && senderUserId !== myUserId) userCandidates.push(String(senderUserId));
            
            const encCandidates = [enc, 31, 30]; // 32 제거 (잘못된 enc 값)
            const encUnique = Array.from(new Set(encCandidates));
            
            console.log(`[채팅방 이름 복호화] user_id 후보: ${userCandidates}, enc 후보: ${encUnique}`);
            
            let decryptedRoomFound = null;
            for (const uid of userCandidates) {
              for (const encTry of encUnique) {
                try {
                  const d = decryptKakaoTalkMessage(roomNameRaw, String(uid), Number(encTry));
                  if (d && d.length > 0) {
                    // 복호화 성공 시 유효한 텍스트인지 확인
                    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(d);
                    if (!hasControlChars) {
                      decryptedRoomFound = d;
                      console.log(`[✓ 채팅방 이름 복호화 성공] user_id=${uid}, enc=${encTry}, 이름="${d}"`);
                      break;
                    }
                  }
                } catch (e) {
                  // 복호화 실패는 무시하고 다음 시도
                }
              }
              if (decryptedRoomFound) break;
            }
            
            if (decryptedRoomFound) {
              decryptedRoomName = decryptedRoomFound;
            } else {
              console.log(`[✗ 채팅방 이름 복호화 실패] 모든 시도 실패, 원본 사용: "${roomNameRaw}"`);
            }
          } else {
            console.log(`[채팅방 이름] base64 형태가 아님: "${roomNameRaw}"`);
          }
        } else {
          console.log(`[채팅방 이름] json.room_name 없음, room 파라미터 사용: "${room}"`);
        }
        
        console.log(`[채팅방 필터링] 최종 room 이름: "${decryptedRoomName}"`);
        
        // "의운모" 채팅방인지 확인
        const isTargetRoom = decryptedRoomName === TARGET_ROOM_NAME || 
                            (typeof decryptedRoomName === 'string' && decryptedRoomName.indexOf(TARGET_ROOM_NAME) !== -1) ||
                            (typeof TARGET_ROOM_NAME === 'string' && TARGET_ROOM_NAME.indexOf(decryptedRoomName) !== -1);
        
        if (!isTargetRoom) {
          console.log(`[필터링] 채팅방 "${decryptedRoomName}"은(는) "${TARGET_ROOM_NAME}"이 아니므로 응답하지 않습니다.`);
          console.log(`[필터링 디버그] json.room_name_decrypted="${json?.room_name_decrypted}", json.room_name="${json?.room_name}", room="${room}"`);
          ws.send(JSON.stringify({
            type: 'reply',
            replies: []  // 빈 응답
          }));
          return;
        }
        
        // 발신자 이름 및 ID 추출 (Phase 1.2: extractSenderName/extractSenderId 함수 사용)
        const { extractSenderName, extractSenderId } = require('./labbot-node');
        
        // 디버깅: json 필드 확인
        console.log(`[발신자] 디버깅: json.sender_name_decrypted="${json?.sender_name_decrypted}", json.sender_name="${json?.sender_name}", json.user_name="${json?.user_name}", sender="${sender}"`);
        
        let senderName = extractSenderName(json, sender);
        let senderId = extractSenderId(json, sender);
        
        console.log(`[발신자] 추출 완료: senderName="${senderName}", senderId="${senderId}"`);
        
        // 최종 값 확인 (복호화된 값이어야 함)
        // senderName이 여전히 암호화되어 있거나 유효하지 않은 경우에만 fallback 처리
        if (!senderName) {
          // sender 필드에서 추출 시도 (하위 호환성)
          if (sender && sender.includes('/')) {
            const parts = sender.split('/');
            const namePart = parts[0];
            if (namePart && json) {
              // sender 필드의 이름 부분이 암호화되어 있는지 확인
              const isEncrypted = namePart.length > 10 && 
                                 namePart.length % 4 === 0 &&
                                 /^[A-Za-z0-9+/=]+$/.test(namePart);
              
              if (!isEncrypted && namePart !== '.' && !namePart.startsWith('/')) {
                // 이미 복호화된 것으로 보임
                senderName = namePart;
                console.log(`[발신자] sender 필드에서 복호화된 이름 추출: "${senderName}"`);
              } else if (isEncrypted) {
                // 암호화되어 있으면 복호화 시도 (최후의 수단)
                const myUserId = json.myUserId || json.userId || json.user_id || parts[1];
                const isValidUserId = (uid) => {
                  if (!uid) return false;
                  const uidNum = Number(uid);
                  return uidNum > 1000;
                };
                
                if (myUserId && isValidUserId(myUserId)) {
                  console.log(`[발신자] sender 필드의 암호화된 이름 복호화 시도: "${namePart.substring(0, 20)}..."`);
                  for (const encTry of [31, 30, 32]) {
                    try {
                      const decrypted = decryptKakaoTalkMessage(namePart, String(myUserId), encTry);
                      if (decrypted && decrypted !== namePart && !/[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted)) {
                        senderName = decrypted;
                        console.log(`[발신자] sender 필드에서 복호화 성공: "${namePart.substring(0, 20)}..." -> "${decrypted}"`);
                        break;
                      }
                    } catch (e) {
                      // 복호화 실패는 무시하고 다음 시도
                    }
                  }
                }
              }
            }
          }
          
          // 여전히 없으면 sender 그대로 사용 (fallback)
          if (!senderName) {
            if (sender && sender.includes('/')) {
              senderName = sender.split('/')[0].trim();
            } else if (sender) {
              senderName = String(sender).trim();
            } else {
              senderName = '';
            }
          }
        }
        
        // 최종 검증: senderName이 여전히 암호화되어 있으면 복호화 재시도
        // 하지만 sender 필드에 복호화된 이름이 있으면 그것을 우선 사용
        if (!senderName && sender && sender.includes('/')) {
          const senderParts = sender.split('/');
          const senderNamePart = senderParts.slice(0, -1).join('/'); // 마지막이 user_id이므로 제외
          const lastPart = senderParts[senderParts.length - 1];
          
          // 마지막 부분이 숫자(user_id)면, 나머지가 닉네임
          if (/^\d+$/.test(lastPart.trim())) {
            // 닉네임 부분이 base64로 보이지 않으면 복호화된 것으로 간주
            const isNotEncrypted = !(senderNamePart.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderNamePart));
            if (isNotEncrypted && senderNamePart.trim()) {
              senderName = senderNamePart.trim();
              console.log(`[발신자] sender 필드에서 복호화된 이름 추출 (최종 검증): "${senderName}"`);
            }
          }
        }
        
        // senderName이 여전히 없거나 암호화된 상태인 경우, sender 필드 재확인
        if (senderName) {
          // base64 형태 확인 (길이 조건 완화: 5자 이상)
          const isStillEncrypted = senderName.length > 5 && 
                                   /^[A-Za-z0-9+/=]+$/.test(senderName);
          if (isStillEncrypted && json) {
            // sender 필드에 복호화된 이름이 있는지 다시 확인
            if (sender && sender.includes('/')) {
              const senderParts = sender.split('/');
              const senderNamePart = senderParts.slice(0, -1).join('/');
              const lastPart = senderParts[senderParts.length - 1];
              
              if (/^\d+$/.test(lastPart.trim())) {
                const isNotEncrypted = !(senderNamePart.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderNamePart));
                if (isNotEncrypted && senderNamePart.trim()) {
                  // sender 필드에 복호화된 이름이 있으면 그것을 사용 (경고 없이)
                  senderName = senderNamePart.trim();
                  console.log(`[발신자] sender 필드에서 복호화된 이름 사용 (암호화 경고 무시): "${senderName}"`);
                } else {
                  // sender 필드도 암호화되어 있으면 경고 출력
                  console.warn(`[발신자] ⚠️ senderName이 여전히 암호화된 상태: "${senderName}"`);
                }
              } else {
                // sender 필드 파싱 실패 시 경고 출력
                console.warn(`[발신자] ⚠️ senderName이 여전히 암호화된 상태: "${senderName}"`);
              }
            } else {
              // sender 필드가 없거나 파싱 불가 시 경고 출력
              console.warn(`[발신자] ⚠️ senderName이 여전히 암호화된 상태: "${senderName}"`);
            }
            
            // 경고 출력 후에만 복호화 시도
            if (isStillEncrypted && senderName.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderName)) {
            const myUserId = json.myUserId || json.userId || json.user_id;
            if (myUserId) {
              console.log(`[발신자] 최종 복호화 시도: myUserId=${myUserId}, senderName="${senderName}"`);
              for (const encTry of [31, 30, 32]) {
                try {
                  const decrypted = decryptKakaoTalkMessage(senderName, String(myUserId), encTry);
                  if (decrypted && decrypted !== senderName) {
                    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                    if (!hasControlChars && decrypted.length > 0) {
                      console.log(`[발신자] ✅ 최종 복호화 성공: "${senderName}" -> "${decrypted}" (enc=${encTry})`);
                      senderName = decrypted;
                      break;
                    } else {
                      console.log(`[발신자] 최종 복호화 결과 무효: enc=${encTry}, 결과="${decrypted}", 제어문자=${hasControlChars}`);
                    }
                  }
                } catch (e) {
                  console.log(`[발신자] 최종 복호화 시도 실패: enc=${encTry}, 오류=${e.constructor.name}: ${e.message}`);
                }
              }
              
              // 여전히 암호화된 상태인지 확인
              const stillEncrypted = senderName.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderName);
              if (stillEncrypted) {
                console.warn(`[발신자] ❌ 최종 복호화 실패: senderName="${senderName}" (모든 enc 후보 시도 완료)`);
              }
            } else {
              console.warn(`[발신자] 최종 복호화 불가: myUserId 없음`);
            }
          }
        }
        
        console.log(`[${new Date().toISOString()}] WS 메시지 수신 (IrisLink):`, {
          room: decryptedRoomName,
          sender: senderName,
          sender_id: senderId,
          sender_original: sender,
          message: decryptedMessage?.substring(0, 50) + (decryptedMessage?.length > 50 ? '...' : ''),
          isGroupChat: isGroupChat !== undefined ? isGroupChat : true
        });
        
        // ⚠️ 중요: handleMessage 호출 전에 복호화된 senderName 사용
        // senderName이 복호화된 상태면 우선 사용, user_id가 없으면 sender에서 추출하여 조합
        let finalSender = sender || senderName || '';
        if (senderName && senderName !== sender) {
            // senderName이 복호화된 상태인지 확인 (base64 패턴이 아니면 복호화됨)
            const senderNameIsDecrypted = !(senderName.length > 10 && senderName.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(senderName));
            
            if (senderNameIsDecrypted) {
                // senderName에 user_id가 있는지 확인
                if (senderName.includes('/')) {
                    // 이미 "이름/user_id" 형식이면 그대로 사용
                    finalSender = senderName;
                    console.log(`[handleMessage 호출 전] ✅ 복호화된 senderName 사용: "${finalSender}"`);
                } else {
                    // senderName에 user_id가 없으면 sender에서 추출하여 조합
                    const extractedSenderId = sender && sender.includes('/') ? sender.split('/')[sender.split('/').length - 1] : senderId;
                    if (extractedSenderId && /^\d+$/.test(String(extractedSenderId))) {
                        finalSender = `${senderName}/${extractedSenderId}`;
                        console.log(`[handleMessage 호출 전] ✅ 복호화된 senderName + senderId 조합: "${finalSender}"`);
                    } else {
                        // senderId를 찾을 수 없으면 복호화된 senderName만 사용
                        finalSender = senderName;
                        console.log(`[handleMessage 호출 전] ⚠️ 복호화된 senderName 사용 (user_id 없음): "${finalSender}"`);
                    }
                }
            }
        }
        
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] handleMessage 호출 전:`);
        console.log(`  room: "${decryptedRoomName || ''}"`);
        console.log(`  msg: "${(decryptedMessage || '').substring(0, 100)}"`);
        console.log(`  sender (원본): "${sender || ''}"`);
        console.log(`  senderName (복호화): "${senderName || ''}"`);
        console.log(`  finalSender (최종): "${finalSender}"`);
        console.log(`  sender_id: "${senderId || '없음'}"`);
        console.log(`  isGroupChat: ${isGroupChat !== undefined ? isGroupChat : true}`);
        
        // ⚠️ 중요: 이미지 메시지 판단을 메시지 저장 전에 수행
        // 이미지 메시지가 텍스트 메시지로 처리되지 않도록 함
        let isImageMessageEarly = false;
        let imageUrlEarly = null;
        
        if (json) {
          try {
            // msg_type을 숫자 또는 문자열로 정규화
            let msgType = json.msg_type;
            if (msgType === null || msgType === undefined) {
              msgType = json.type;
            }
            if (typeof msgType === 'number') {
              msgType = String(msgType);
            }
            
            const imageUrlFromClient = json.image_url || null;
            const hasImageFromClient = json.has_image || false;
            const hasImageBool = hasImageFromClient === true || hasImageFromClient === 'true' || hasImageFromClient === 1 || hasImageFromClient === '1';
            
            // ⚠️ 중요: ref 코드 기준으로 이미지 타입은 2(PhotoChat), 27(MultiPhotoChat)만
            // type 12는 이모티콘이므로 이미지로 처리하지 않음
            const imageTypes = [2, 27, '2', '27'];
            // msg_type이 2 또는 27이면 무조건 이미지 메시지로 처리
            isImageMessageEarly = imageUrlFromClient || hasImageBool || (msgType && imageTypes.includes(String(msgType)));
            
            console.log(`[이미지 조기 감지] 판단 로직:`);
            console.log(`  - imageUrlFromClient: ${!!imageUrlFromClient} (${imageUrlFromClient ? imageUrlFromClient.substring(0, 50) + '...' : 'null'})`);
            console.log(`  - hasImageBool: ${hasImageBool} (원본: ${json.has_image}, 타입: ${typeof json.has_image})`);
            console.log(`  - msgType: ${msgType} (원본: ${json.msg_type}, 타입: ${typeof msgType})`);
            console.log(`  - imageTypes.includes(${msgType}): ${msgType ? imageTypes.includes(String(msgType)) : false}`);
            console.log(`  - isImageMessageEarly (초기): ${isImageMessageEarly}`);
            
            if (msgType && imageTypes.includes(String(msgType)) && !hasImageBool && !imageUrlFromClient) {
              // msg_type이 이미지 타입인데 has_image와 image_url이 없으면 강제로 이미지로 처리
              console.log(`[이미지 조기 감지] ⚠️ msg_type=${msgType}이지만 has_image와 image_url이 없음. 이미지 메시지로 강제 처리`);
              isImageMessageEarly = true;
            }
            
            console.log(`[이미지 조기 감지] 최종 isImageMessageEarly: ${isImageMessageEarly}`);
            
            if (isImageMessageEarly) {
              console.log(`[이미지 조기 감지] ✅ 이미지 메시지로 판단됨 (저장 전): msgType=${msgType}, image_url=${!!imageUrlFromClient}, has_image=${hasImageBool}`);
              
              // 이미지 URL 추출
              const { extractImageUrl } = require('./db/utils/attachmentExtractor');
              let attachmentData = json.attachment_decrypted || json.attachment || null;
              
              if (attachmentData && typeof attachmentData === 'string' && !json.attachment_decrypted) {
                try {
                  attachmentData = JSON.parse(attachmentData);
                } catch (e) {
                  // 파싱 실패
                }
              }
              
              imageUrlEarly = imageUrlFromClient;
              if (!imageUrlEarly && attachmentData) {
                imageUrlEarly = extractImageUrl(attachmentData, msgType);
              }
              
              if (imageUrlEarly) {
                console.log(`[이미지 조기 감지] ✅ 이미지 URL 추출 성공: ${imageUrlEarly.substring(0, 50)}...`);
              } else {
                console.log(`[이미지 조기 감지] ⚠️ 이미지 메시지로 판단되었지만 URL 추출 실패`);
              }
            }
          } catch (err) {
            console.error('[이미지 조기 감지] 오류:', err.message);
          }
        }
        
        // 채팅 메시지 저장 (비동기, 에러가 나도 계속 진행)
        const chatLogger = require('./db/chatLogger');
        
        // 메시지 메타데이터 추출
        // reply 체계 개선: reply_to_kakao_log_id (원본)와 reply_to_message_id (DB id) 분리
        const { extractReplyTarget } = require('./db/utils/attachmentExtractor');
        
        // 클라이언트에서 보내는 reply_to_message_id는 실제로 kakao_log_id
        const replyToKakaoLogIdRaw = json?.reply_to_message_id || json?.reply_to || json?.parent_message_id || null;
        console.log(`[답장 링크] 클라이언트에서 받은 값: reply_to_message_id=${json?.reply_to_message_id}, reply_to=${json?.reply_to}, parent_message_id=${json?.parent_message_id}, 최종=${replyToKakaoLogIdRaw}`);
        
        // attachment에서도 추출 시도 (단일 진실 소스 함수 사용)
        // ⚠️ 중요: msg_type이 26(답장)이거나 attachment/referer가 있으면 답장으로 처리
        const msgTypeForCheck = json?.msg_type || json?.type || json?.msgType || null;
        let replyToKakaoLogIdFromAttachment = null;
        
        // ⚠️ 개선: msg_type=0이어도 attachment나 referer가 있으면 답장으로 처리
        const hasAttachment = !!(json?.attachment || json?.attachment_decrypted);
        const hasReferer = !!(replyToKakaoLogIdRaw);
        const isReplyMessage = msgTypeForCheck === 26 || msgTypeForCheck === '26' || hasAttachment || hasReferer;
        
        if (isReplyMessage) {
            console.log(`[답장 링크] ⚠️⚠️⚠️ 답장 메시지 감지 시작: msg_type=${msgTypeForCheck}, hasAttachment=${hasAttachment}, hasReferer=${hasReferer}, kakao_log_id=${json?._id || json?.kakao_log_id || 'N/A'}`);
            
            // attachment 복호화 시도 (msg_type=26이거나 attachment가 있는 경우)
            let attachmentToUse = json?.attachment_decrypted || json?.attachment;
            console.log(`[답장 링크] ⚠️⚠️⚠️ attachmentToUse 초기값: 타입=${typeof attachmentToUse}, 존재=${!!attachmentToUse}, attachment_decrypted=${!!json?.attachment_decrypted}, attachment=${!!json?.attachment}`);
            
            // attachment_decrypted가 없고 attachment가 암호화된 문자열인 경우 복호화 시도
            // ⚠️ 개선: msg_type=0이어도 attachment가 있으면 복호화 시도
            if (!json?.attachment_decrypted && json?.attachment && typeof json.attachment === 'string' && (msgTypeForCheck === 26 || msgTypeForCheck === '26' || hasAttachment)) {
                try {
                    const myUserId = json?.myUserId || json?.userId || null;
                    const encType = json?.encType || null;
                    
                    // ⚠️ 중요: myUserId와 encType 상태 확인 로그
                    console.log(`[답장 링크] ⚠️⚠️⚠️ 복호화 조건 확인: myUserId=${myUserId}, encType=${encType}, 조건=${!!(myUserId && encType)}`);
                    
                    if (myUserId && encType) {
                        console.log(`[답장 링크] attachment 복호화 시도: myUserId=${myUserId}, encType=${encType}, attachment 길이=${json.attachment.length}`);
                        
                        // ⚠️ 개선: 여러 user_id 후보로 복호화 시도
                        const userIdCandidates = [
                            String(myUserId),  // 1순위: myUserId
                            String(json?.userId || json?.user_id || ''),  // 2순위: userId
                            String(json?.sender_id || '')  // 3순위: sender_id
                        ].filter(id => id && id !== '0' && id !== '');
                        
                        let decryptedAttachment = null;
                        console.log(`[답장 링크] ⚠️ 복호화 후보 목록: userIdCandidates=${JSON.stringify(userIdCandidates)}, encType=${encType}`);
                        
                        for (const userId of userIdCandidates) {
                            try {
                                console.log(`[답장 링크] 복호화 시도: userId=${userId}, encType=${encType}`);
                                const decrypted = decryptKakaoTalkMessage(json.attachment, userId, encType);
                                if (decrypted) {
                                    // ⚠️ 중요: 복호화 결과가 유효한지 확인 (제어 문자 체크)
                                    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                                    if (hasControlChars || decrypted.length === 0) {
                                        console.log(`[답장 링크] ⚠️ 복호화 결과가 바이너리 데이터 (제어 문자 포함 또는 빈 문자열), 다음 후보 시도: userId=${userId}, encType=${encType}`);
                                        continue;  // 다음 후보 시도
                                    }
                                    decryptedAttachment = decrypted;
                                    console.log(`[답장 링크] ✅ attachment 복호화 성공: userId=${userId}, encType=${encType}`);
                                    break;
                                } else {
                                    console.log(`[답장 링크] ⚠️ 복호화 결과 null: userId=${userId}, encType=${encType}`);
                                }
                            } catch (e) {
                                console.log(`[답장 링크] ⚠️ 복호화 예외: userId=${userId}, encType=${encType}, 오류=${e.message}`);
                                // 다음 후보 시도
                                continue;
                            }
                        }
                        
                        // encType 후보로도 시도 (31, 30, 32)
                        if (!decryptedAttachment) {
                            console.log(`[답장 링크] ⚠️ encType 후보로 복호화 시도 시작`);
                            const encTypeCandidates = [31, 30, 32];
                            for (const enc of encTypeCandidates) {
                                for (const userId of userIdCandidates) {
                                    try {
                                        console.log(`[답장 링크] 복호화 시도: userId=${userId}, encType=${enc}`);
                                        const decrypted = decryptKakaoTalkMessage(json.attachment, userId, enc);
                                        if (decrypted) {
                                            // ⚠️ 중요: 복호화 결과가 유효한지 확인 (제어 문자 체크)
                                            const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                                            if (hasControlChars || decrypted.length === 0) {
                                                console.log(`[답장 링크] ⚠️ 복호화 결과가 바이너리 데이터 (제어 문자 포함 또는 빈 문자열), 다음 후보 시도: userId=${userId}, encType=${enc}`);
                                                continue;  // 다음 후보 시도
                                            }
                                            decryptedAttachment = decrypted;
                                            console.log(`[답장 링크] ✅ attachment 복호화 성공: userId=${userId}, encType=${enc}`);
                                            break;
                                        } else {
                                            console.log(`[답장 링크] ⚠️ 복호화 결과 null: userId=${userId}, encType=${enc}`);
                                        }
                                    } catch (e) {
                                        console.log(`[답장 링크] ⚠️ 복호화 예외: userId=${userId}, encType=${enc}, 오류=${e.message}`);
                                        continue;
                                    }
                                }
                                if (decryptedAttachment) break;
                            }
                        }
                        
                        if (decryptedAttachment) {
                            // ⚠️ 중요: 복호화 결과가 유효한지 확인 (제어 문자 체크)
                            const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decryptedAttachment);
                            const isBinary = hasControlChars || decryptedAttachment.length === 0;
                            
                            if (isBinary) {
                                console.warn(`[답장 링크] ⚠️ 복호화 결과가 바이너리 데이터 (제어 문자 포함 또는 빈 문자열), 다음 후보 시도`);
                                decryptedAttachment = null;  // 다음 후보 시도
                            } else {
                                console.log(`[답장 링크] ✅ attachment 복호화 성공: ${decryptedAttachment.substring(0, 100)}...`);
                                // 복호화된 결과를 JSON으로 파싱 시도
                                try {
                                    attachmentToUse = JSON.parse(decryptedAttachment);
                                    console.log(`[답장 링크] ✅ 복호화 후 JSON 파싱 성공`);
                                } catch (parseError) {
                                    // ⚠️ 개선: JSON 파싱 실패 시 fallback + 로그 강화
                                    try {
                                        // 문자열이 JSON 형태인지 다시 시도
                                        attachmentToUse = JSON.parse(decryptedAttachment);
                                    } catch (parseError2) {
                                        // JSON이 아니면 문자열 그대로 사용
                                        attachmentToUse = decryptedAttachment;
                                        console.log(`[답장 링크] ⚠️ 복호화 후 JSON 파싱 실패, 문자열 그대로 사용: ${parseError.message}`);
                                        console.log(`[답장 링크] 디버그 - attachment 키/길이: ${typeof attachmentToUse === 'object' && attachmentToUse ? Object.keys(attachmentToUse).join(', ') : 'N/A'}, 길이=${typeof attachmentToUse === 'string' ? attachmentToUse.length : 'N/A'}`);
                                    }
                                }
                            }
                        } else {
                            console.log(`[답장 링크] ⚠️ attachment 복호화 실패 (모든 후보 시도 완료)`);
                        }
                    } else {
                        console.log(`[답장 링크] ⚠️ 복호화 불가: myUserId=${myUserId}, encType=${encType}`);
                    }
                } catch (decryptError) {
                    console.error(`[답장 링크] attachment 복호화 예외: ${decryptError.message}`);
                    console.error(`[답장 링크] 디버그 - attachment 타입: ${typeof json.attachment}, 길이: ${json.attachment ? json.attachment.length : 'N/A'}`);
                }
            }
            
            // ⚠️ 중요: attachmentToUse가 문자열인 경우에도 extractReplyTarget 시도
            console.log(`[답장 링크] ⚠️ extractReplyTarget 호출 전: attachmentToUse 타입=${typeof attachmentToUse}, 길이=${typeof attachmentToUse === 'string' ? attachmentToUse.length : 'N/A'}`);
            if (attachmentToUse && typeof attachmentToUse === 'object') {
                const keys = Object.keys(attachmentToUse);
                console.log(`[답장 링크] ⚠️⚠️⚠️ attachmentToUse 객체 키 목록: ${keys.join(', ')}`);
                if (attachmentToUse.src_logId !== undefined) {
                    console.log(`[답장 링크] ⚠️⚠️⚠️ attachmentToUse.src_logId: ${attachmentToUse.src_logId}, 타입=${typeof attachmentToUse.src_logId}`);
                }
                if (attachmentToUse.src_message !== undefined) {
                    console.log(`[답장 링크] ⚠️⚠️⚠️ attachmentToUse.src_message: ${attachmentToUse.src_message}, 타입=${typeof attachmentToUse.src_message}`);
                }
                if (attachmentToUse.logId !== undefined) {
                    console.log(`[답장 링크] ⚠️⚠️⚠️ attachmentToUse.logId: ${attachmentToUse.logId}, 타입=${typeof attachmentToUse.logId}`);
                }
            }
            replyToKakaoLogIdFromAttachment = extractReplyTarget(
                attachmentToUse,
                null,  // referer는 이미 위에서 확인
                msgTypeForCheck
            );
            console.log(`[답장 링크] ⚠️⚠️⚠️ extractReplyTarget 결과: ${replyToKakaoLogIdFromAttachment}, 타입=${typeof replyToKakaoLogIdFromAttachment}, isReplyMessage=${isReplyMessage}`);
            if (replyToKakaoLogIdFromAttachment) {
                console.log(`[답장 링크] ✅✅✅ attachment에서 추출 성공: ${replyToKakaoLogIdFromAttachment}`);
            } else if (isReplyMessage) {
                console.log(`[답장 링크] ⚠️ 답장 메시지인데 attachment에서 추출 실패`);
                console.log(`[답장 링크] 디버그 - attachmentToUse 타입: ${typeof attachmentToUse}, attachment 존재: ${!!json?.attachment}, attachment_decrypted 존재: ${!!json?.attachment_decrypted}`);
                console.log(`[답장 링크] 디버그 - json.msg_type=${json?.msg_type}, json.type=${json?.type}, json.msgType=${json?.msgType}, msgTypeForCheck=${msgTypeForCheck}`);
                console.log(`[답장 링크] 디버그 - hasAttachment=${hasAttachment}, hasReferer=${hasReferer}, replyToKakaoLogIdRaw=${replyToKakaoLogIdRaw}`);
                
                // ⚠️ 추가: 원본 attachment 문자열에서도 패턴 매칭 시도
                if (json?.attachment && typeof json.attachment === 'string') {
                    console.log(`[답장 링크] ⚠️ 원본 attachment 문자열에서 패턴 매칭 시도`);
                    const patternMatch = extractReplyTarget(json.attachment, null, msgTypeForCheck);
                    if (patternMatch) {
                        console.log(`[답장 링크] ✅ 원본 attachment에서 패턴 매칭으로 추출: ${patternMatch}`);
                        replyToKakaoLogIdFromAttachment = patternMatch;
                    }
                }
            }
        }
        
        // 최종 reply_to_kakao_log_id (우선순위: 클라이언트 reply_to_message_id > attachment 추출)
        // ⚠️ 개선: 클라이언트가 reply_to_message_id를 보내면 그 값을 우선 신뢰
        const msgType = json?.msg_type || json?.type || json?.msgType || null;
        const clientReplyToMessageId = json?.reply_to_message_id || null;
        
        // ⚠️ 개선: 클라이언트가 reply_to_message_id를 보내면 우선 사용
        const replyToKakaoLogId = clientReplyToMessageId 
            ? clientReplyToMessageId  // 클라이언트 필드 우선
            : ((isReplyMessage && replyToKakaoLogIdFromAttachment)
                ? replyToKakaoLogIdFromAttachment
                : (replyToKakaoLogIdRaw || replyToKakaoLogIdFromAttachment));
        
        console.log(`[답장 링크] 최종 reply_to_kakao_log_id: ${replyToKakaoLogId} (client=${clientReplyToMessageId}, raw=${replyToKakaoLogIdRaw}, attachment=${replyToKakaoLogIdFromAttachment}, msg_type=${msgType}, isReplyMessage=${isReplyMessage})`);
        
        // ⚠️ 디버그: 답장 메시지 감지 상세 로그
        if (isReplyMessage) {
            console.log(`[답장 링크] ⚠️ 답장 메시지 감지: replyToKakaoLogId=${replyToKakaoLogId}, replyToKakaoLogIdRaw=${replyToKakaoLogIdRaw}, replyToKakaoLogIdFromAttachment=${replyToKakaoLogIdFromAttachment}`);
            console.log(`[답장 링크] 상세: msg_type=${msgType}, hasAttachment=${hasAttachment}, hasReferer=${hasReferer}`);
        }
        
        // reply_to_kakao_log_id를 DB id로 변환 시도 (백필 가능하므로 실패해도 저장은 진행)
        let replyToMessageId = null;
        if (replyToKakaoLogId) {
            try {
                const { safeParseInt } = require('./db/utils/attachmentExtractor');
                const numericLogId = safeParseInt(replyToKakaoLogId);
                console.log(`[답장 링크] safeParseInt 결과: ${numericLogId}`);
                if (numericLogId) {
                    const db = require('./db/database');
                    const { data: replyToMessage } = await db.supabase
                        .from('chat_messages')
                        .select('id')
                        .eq('kakao_log_id', numericLogId)
                        .eq('room_name', decryptedRoomName || '')  // ✅ room scope로 제한
                        .maybeSingle();  // ✅ single() 대신 maybeSingle() 사용
                    
                    console.log(`[답장 링크] DB 조회 결과: ${replyToMessage ? `id=${replyToMessage.id}` : 'not found'}, room="${decryptedRoomName || ''}", kakao_log_id=${numericLogId}`);
                    
                    if (replyToMessage && replyToMessage.id) {
                        replyToMessageId = replyToMessage.id;
                        console.log(`[답장 링크] ✅ 즉시 변환 성공: kakao_log_id(${numericLogId}) → DB id(${replyToMessageId})`);
                    } else {
                        console.log(`[답장 링크] ⏳ 백필 필요: kakao_log_id(${numericLogId}), room="${decryptedRoomName || ''}"`);
                    }
                } else {
                    console.warn(`[답장 링크] ⚠️ safeParseInt 실패: replyToKakaoLogId=${replyToKakaoLogId}`);
                }
            } catch (err) {
                console.warn('[답장 링크] 변환 실패 (백필에서 재시도):', err.message, err.stack);
            }
        } else {
            console.log(`[답장 링크] reply_to_kakao_log_id가 없음 (일반 메시지)`);
        }
        
        const threadId = json?.thread_id || json?.thread_message_id || null;
        let chatId = json?.chat_id || null;  // let으로 변경 (이후 재할당 필요)
        
        // 메타데이터 구성
        const metadata = {
          chat_id: chatId,
          original_json: json ? {
            userId: json.userId,
            user_id: json.user_id,
            myUserId: json.myUserId,
            room_data: json.room_data ? 'present' : null
          } : null
        };
        
        // 채팅 메시지 저장 및 닉네임 변경 감지
        // 닉네임 변경 알림 변수 선언 (비동기 처리 전에 선언)
        let nicknameChangeNotification = null;
        
        // 메시지 저장 및 닉네임 변경 감지 (비동기, 에러가 나도 계속 진행)
        try {
          // Phase 1.3: raw_sender, kakao_log_id 전달
          // reply 체계 개선: reply_to_kakao_log_id와 reply_to_message_id 분리
          const savedMessage = await chatLogger.saveChatMessage(
            decryptedRoomName || '',
            senderName || sender || '',
            senderId,
            decryptedMessage || '',
            isGroupChat !== undefined ? isGroupChat : true,
            metadata,
            replyToMessageId,  // DB id (변환 성공 시, null 가능)
            threadId,
            sender,  // raw_sender (원본 sender 문자열)
            json?._id || json?.kakao_log_id,  // kakao_log_id
            replyToKakaoLogId  // reply_to_kakao_log_id (클라이언트에서 보내는 값)
          );
          
          // ⚠️ 중요: 메시지 저장 성공/실패 로그
          if (savedMessage) {
            console.log(`[메시지 저장] ✅ 성공: id=${savedMessage.id}, kakao_log_id=${savedMessage.kakao_log_id || json?._id || json?.kakao_log_id || 'N/A'}, room="${decryptedRoomName || ''}", sender="${senderName || sender || ''}"`);
          } else {
            console.error(`[메시지 저장] ❌ 실패: savedMessage가 null, kakao_log_id=${json?._id || json?.kakao_log_id || 'N/A'}, room="${decryptedRoomName || ''}", sender="${senderName || sender || ''}"`);
          }
          
          // 백필 작업은 saveChatMessage 내부에서 자동 처리됨
          
          // 이미지 첨부 정보 저장 (메시지 타입이 이미지인 경우 또는 image_url이 있는 경우)
          if (savedMessage && json) {
            try {
              // msg_type을 숫자 또는 문자열로 정규화
              let msgType = json.msg_type;
              if (msgType === null || msgType === undefined) {
                msgType = json.type;
              }
              // 숫자인 경우 문자열로 변환하여 비교
              if (typeof msgType === 'number') {
                msgType = String(msgType);
              }
              
              const imageUrlFromClient = json.image_url || null;  // 클라이언트에서 추출한 이미지 URL
              const hasImageFromClient = json.has_image || false;  // 클라이언트에서 이미지 여부 확인
              
              // 디버깅: 전체 JSON 구조 확인 (이미지 관련 필드)
              console.log(`[이미지 저장] ========== 이미지 메시지 감지 시작 ==========`);
              console.log(`[이미지 저장] msgType 확인: msgType=${msgType} (원본: ${json.msg_type}, type: ${typeof msgType})`);
              console.log(`[이미지 저장] 클라이언트 필드: image_url=${imageUrlFromClient ? imageUrlFromClient.substring(0, 50) + '...' : 'null'}, has_image=${hasImageFromClient} (타입: ${typeof json.has_image}, 원본값: ${JSON.stringify(json.has_image)})`);
              console.log(`[이미지 저장] attachment 필드: attachment=${!!json.attachment}, attachment_decrypted=${!!json.attachment_decrypted}`);
              if (json.attachment && typeof json.attachment === 'string') {
                console.log(`[이미지 저장] attachment (문자열) 샘플: ${json.attachment.substring(0, 200)}...`);
              }
              if (json.attachment_decrypted && typeof json.attachment_decrypted === 'object') {
                console.log(`[이미지 저장] attachment_decrypted (객체) keys: ${Object.keys(json.attachment_decrypted).slice(0, 10).join(', ')}`);
                // attachment_decrypted에서 직접 이미지 URL 확인
                const attachKeys = Object.keys(json.attachment_decrypted);
                const possibleImageKeys = ['url', 'thumbnailUrl', 'path', 'path_1', 'xl', 'l', 'm', 's', 'imageUrl', 'image_url', 'photoUrl', 'photo_url'];
                for (const key of possibleImageKeys) {
                  if (json.attachment_decrypted[key] && typeof json.attachment_decrypted[key] === 'string') {
                    console.log(`[이미지 저장] attachment_decrypted[${key}]: ${json.attachment_decrypted[key].substring(0, 50)}...`);
                  }
                }
              }
              
              // ⚠️ 중요: ref 코드 기준으로 이미지 타입은 2(PhotoChat), 27(MultiPhotoChat)만
              // type 12는 이모티콘이므로 이미지로 처리하지 않음
              // 이미지 타입: 2 (PhotoChat - 단일 사진), 27 (MultiPhotoChat - 멀티 사진)
              const imageTypes = [2, 27, '2', '27'];
              
              // 클라이언트에서 이미지 URL을 추출한 경우 또는 has_image가 true인 경우 또는 msgType이 이미지 타입인 경우
              // has_image가 문자열 "true" 또는 boolean true 모두 처리
              const hasImageBool = hasImageFromClient === true || hasImageFromClient === 'true' || hasImageFromClient === 1 || hasImageFromClient === '1';
              const isImageMessage = imageUrlFromClient || hasImageBool || (msgType && imageTypes.includes(String(msgType)));
              
              console.log(`[이미지 저장] 이미지 메시지 판단:`);
              console.log(`  - imageUrlFromClient 존재: ${!!imageUrlFromClient}`);
              console.log(`  - hasImageFromClient: ${hasImageFromClient} (원본: ${json.has_image})`);
              console.log(`  - msgType 매칭: ${msgType && imageTypes.includes(String(msgType))} (msgType=${msgType})`);
              console.log(`  - 최종 isImageMessage: ${isImageMessage}`);
              console.log(`[이미지 저장] ==========================================`);
              
              if (isImageMessage) {
                console.log(`[이미지 저장] ✅ 이미지 메시지 감지됨 - 질문 대기 상태 확인 시작`);
                
                // Phase 2: attachment 추출 함수 사용 (단일 진실 소스)
                const { extractImageUrl } = require('./db/utils/attachmentExtractor');
                
                // attachment_decrypted 우선 사용, 없으면 attachment
                let attachmentData = json.attachment_decrypted || json.attachment || null;
                let attachmentDecrypted = json.attachment_decrypted;
                
                // attachment가 암호화된 Base64 문자열이면 서버에서 복호화 시도
                if (!attachmentDecrypted && attachmentData && typeof attachmentData === 'string' && !json.attachment_decrypted) {
                    // JSON 파싱 시도
                    try {
                        attachmentData = JSON.parse(attachmentData);
                        console.log(`[이미지 저장] ✅ attachment JSON 파싱 성공`);
                    } catch (e) {
                        // JSON 파싱 실패 → Base64 암호화 문자열일 가능성
                        console.log(`[이미지 저장] ⚠️ attachment JSON 파싱 실패, 복호화 시도: ${e.message}`);
                        
                        // Base64 문자열인지 확인
                        const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(attachmentData.trim()) && attachmentData.length > 20;
                        
                        if (isBase64Like) {
                            const encType = json.encType || json.enc_type || 31;
                            
                            // userId 추출 (senderId에서 숫자 부분)
                            let decryptUserId = null;
                            if (senderId) {
                                const userIdMatch = String(senderId).match(/\d+/);
                                if (userIdMatch) {
                                    decryptUserId = parseInt(userIdMatch[0], 10);
                                }
                            }
                            
                            // myUserId도 시도
                            if (!decryptUserId && json.myUserId) {
                                const myUserIdNum = Number(json.myUserId);
                                if (myUserIdNum > 1000) {
                                    decryptUserId = myUserIdNum;
                                }
                            }
                            
                            if (decryptUserId) {
                                console.log(`[이미지 저장] 복호화 시도: userId=${decryptUserId}, encType=${encType}`);
                                const decrypted = decryptKakaoTalkMessage(attachmentData, decryptUserId, encType);
                                
                                if (decrypted) {
                                    console.log(`[이미지 저장] ✅ attachment 복호화 성공: ${decrypted.substring(0, 100)}...`);
                                    
                                    // 복호화된 결과를 JSON으로 파싱 시도
                                    try {
                                        attachmentDecrypted = JSON.parse(decrypted);
                                        console.log(`[이미지 저장] ✅ 복호화 후 JSON 파싱 성공`);
                                    } catch (parseError) {
                                        // JSON이 아니면 문자열 그대로 사용
                                        console.log(`[이미지 저장] ⚠️ 복호화 결과가 JSON이 아님: ${decrypted.substring(0, 100)}...`);
                                        // URL인지 확인
                                        if (decrypted.startsWith('http://') || decrypted.startsWith('https://') || decrypted.startsWith('file://') || decrypted.startsWith('content://')) {
                                            attachmentDecrypted = { url: decrypted };
                                        } else {
                                            attachmentDecrypted = { data: decrypted };
                                        }
                                    }
                                } else {
                                    console.log(`[이미지 저장] ⚠️ attachment 복호화 실패`);
                                }
                            } else {
                                console.log(`[이미지 저장] ⚠️ 복호화를 위한 userId를 찾을 수 없음: senderId=${senderId}, myUserId=${json.myUserId}`);
                            }
                        }
                    }
                }
                
                console.log(`[이미지 저장] msgType=${msgType}, attachment_decrypted 존재=${!!attachmentDecrypted}, attachment 존재=${!!json.attachment}, attachmentData 존재=${!!attachmentData}, attachmentData 타입=${attachmentData ? typeof attachmentData : 'null'}`);
                
                // ⚠️ 중요: 이미지 처리 파이프라인 사용 (Primary → Fallback)
                const { handleIncomingImageMessage } = require('./services/imageProcessor');
                const roomName = decryptedRoomName || '';
                
                const imageResult = await handleIncomingImageMessage({
                    roomName: roomName,
                    senderId: senderId,
                    senderName: senderName || sender || '',
                    msgType: msgType,
                    attachment: json.attachment,
                    attachmentDecrypted: attachmentDecrypted || json.attachment_decrypted,
                    imageUrlFromClient: imageUrlFromClient,
                    encType: json.encType || json.enc_type || 31,
                    kakaoLogId: json.kakao_log_id || json.id || null
                });

                // 로그: 처리 결과
                if (imageResult.success) {
                    console.log(`[이미지 저장] ✅ 이미지 처리 성공 (source=${imageResult.source}): ${imageResult.url}`);
                    if (imageResult.trace) {
                        console.log(`[이미지 저장] trace:`, JSON.stringify(imageResult.trace, null, 2));
                    }
                } else {
                    // P0-3: 에러 코드 기반 로깅
                    const errorCode = imageResult.errorCode || 'UNKNOWN';
                    const stage = imageResult.stage || 'unknown';
                    const detail = imageResult.detail || imageResult.error || '알 수 없는 오류';
                    const correlationId = imageResult.correlationId || 'unknown';
                    
                    console.log(`[이미지 저장] [${correlationId}] ❌ 이미지 처리 실패: errorCode=${errorCode}, stage=${stage}`);
                    console.log(`[이미지 저장] [${correlationId}] detail: ${detail}`);
                    if (imageResult.trace) {
                        console.log(`[이미지 저장] [${correlationId}] trace:`, JSON.stringify(imageResult.trace, null, 2));
                    }
                    
                    // ⚠️ 중요: 이미지 처리 실패 시에도 질문 대기 상태 확인
                    // Bridge fallback이 도착할 수 있으므로 질문 대기 상태를 유지
                    const { getPendingQuestion, shouldShowFailureNotice, markFailureNoticeShown } = require('./labbot-node');
                    const roomName = decryptedRoomName || '';
                    
                    if (senderId) {
                        const pendingQuestion = getPendingQuestion(roomName, senderId);
                        if (pendingQuestion) {
                            console.log(`[이미지 저장] [${correlationId}] ⚠️ 이미지 처리 실패했지만 질문 대기 상태 유지 (Bridge fallback 대기)`);
                            console.log(`[이미지 저장] [${correlationId}] ⚠️ 질문 대기 상태: title="${pendingQuestion.title}"`);
                            console.log(`[이미지 저장] [${correlationId}] ⚠️ Bridge fallback 이미지가 도착하면 자동으로 처리됩니다`);
                            
                            // P0-3: 실패 안내 메시지 1회만 표시
                            const cacheKey = `${roomName}|${senderId}`;
                            const shouldShow = shouldShowFailureNotice(cacheKey);
                            
                            if (shouldShow) {
                                // 사용자에게 명확한 피드백 제공 (1회만)
                                ws.pendingImageReply = {
                                    type: 'text',
                                    text: "📷 이미지를 받았습니다.\n\n" +
                                          "이미지 처리에 실패했습니다. (1) 다시 전송하거나 (2) '없음' 입력 시 이미지 없이 등록됩니다.\n\n" +
                                          "Bridge fallback 이미지가 도착하면 자동으로 질문에 첨부됩니다.\n" +
                                          "잠시만 기다려주세요..."
                                };
                                
                                // 안내 메시지 표시 표시
                                markFailureNoticeShown(cacheKey);
                                console.log(`[이미지 저장] [${correlationId}] ⚠️ 실패 안내 메시지 표시 (1회): key="${cacheKey}"`);
                            } else {
                                console.log(`[이미지 저장] [${correlationId}] ⚠️ 실패 안내 메시지 스킵 (이미 표시됨): key="${cacheKey}"`);
                            }
                            
                            // 질문 대기 상태는 유지하고, Bridge fallback을 기다림
                            // 이미지 없이 진행하려면 사용자가 "없음"을 입력해야 함
                            return; // 이미지 처리 실패 시 질문 대기 상태 유지
                        }
                    }
                }
                
                if (imageResult.success && imageResult.url) {
                  // 질문 대기 상태 확인 및 처리
                  const { getAndClearPendingQuestion, processQuestionSubmission, setPendingAttachment } = require('./labbot-node');
                  
                  console.log(`[이미지 + 질문] 디버그: roomName="${roomName}", senderId="${senderId}", sender="${sender}", senderName="${senderName}"`);
                  
                  if (senderId) {
                    // 질문 대기 상태 확인 (사용자별로 1:1 대응)
                    console.log(`[이미지 + 질문] 질문 대기 상태 확인 시작: roomName="${roomName}", senderId="${senderId}"`);
                    const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
                    
                    if (pendingQuestion) {
                      console.log(`[이미지 + 질문] ✅ 질문 대기 상태 발견 (사용자 ID: ${senderId}): 이미지와 함께 질문 처리`);
                      console.log(`[이미지 + 질문] 질문 정보: title="${pendingQuestion.title}", content="${pendingQuestion.content.substring(0, 30)}..."`);
                      console.log(`[이미지 + 질문] 이미지 URL: ${imageResult.url.substring(0, 100)}...`);
                      
                      // 질문과 함께 처리 (비동기 병렬 처리 가능)
                      const questionReplies = await processQuestionSubmission(roomName, sender || senderName || '', pendingQuestion.title, pendingQuestion.content, imageResult.url);
                      const { createCacheKey } = require('./db/utils/roomKeyNormalizer');
                      const cacheKey = createCacheKey(roomName, senderId);
                      console.log(`[이미지 + 질문] ✅ 질문 처리 완료 (key="${cacheKey}"): ${questionReplies.length}개 응답`);
                      
                      // 질문 응답을 ws 객체에 저장하여 이후 handleMessage 호출 전에 확인하도록 함
                      ws.pendingQuestionReplies = questionReplies || [];
                      
                      // ⚠️ 중요: 질문 대기 상태가 이미 getAndClearPendingQuestion에서 삭제되었는지 확인
                      // 혹시 모를 경우를 대비해 한 번 더 확인 및 삭제
                      const { getPendingQuestion } = require('./labbot-node');
                      const remainingQuestion = getPendingQuestion(roomName, senderId);
                      if (remainingQuestion) {
                        console.log(`[이미지 + 질문] ⚠️ 질문 대기 상태가 남아있음 - 강제 삭제`);
                        const { getAndClearPendingQuestion } = require('./labbot-node');
                        getAndClearPendingQuestion(roomName, senderId);
                      }
                      
                      // 질문 대기 상태 초기화 완료 확인
                      console.log(`[이미지 + 질문] ✅ 질문 대기 상태 초기화 완료 (사용자 ID: ${senderId})`);
                    } else {
                      console.log(`[이미지 + 질문] ⚠️ 질문 대기 상태 없음: roomName="${roomName}", senderId="${senderId}"`);
                      
                      // 캐시에만 저장 (나중에 !질문 명령어에서 사용)
                      // ⚠️ 중요: 질문 대기 상태가 없으면 답장을 보내지 않음 (무한루프 방지)
                      setPendingAttachment(roomName, senderId, imageResult.url);
                      console.log(`[이미지 저장] ✅ 이미지 캐시에 저장 완료 (답장 없음): ${imageResult.url.substring(0, 50)}...`);
                      console.log(`[이미지 저장] 💡 !질문 명령어를 사용하시면 자동으로 이미지가 첨부됩니다.`);
                      
                      // 답장을 보내지 않음 (무한루프 방지)
                      // ws.pendingImageReply는 설정하지 않음
                    }
                  } else {
                    console.warn(`[이미지 저장] ⚠️ senderId가 없어 캐시 저장 스킵: message_id=${savedMessage.id}`);
                  }
                } else {
                  console.log(`[이미지 저장] ⚠️ 이미지 URL 추출 실패: msgType=${msgType}, attachmentData 존재=${!!attachmentData}, attachmentData 타입=${attachmentData ? typeof attachmentData : 'null'}`);
                  if (attachmentData && typeof attachmentData === 'object') {
                    console.log(`[이미지 저장] attachmentData keys: ${Object.keys(attachmentData).join(', ')}`);
                    // attachmentData의 값 샘플 출력 (디버깅용)
                    const sampleKeys = Object.keys(attachmentData).slice(0, 5);
                    for (const key of sampleKeys) {
                      const value = attachmentData[key];
                      if (typeof value === 'string' && value.length > 0 && value.length < 200) {
                        console.log(`[이미지 저장] attachmentData[${key}]: ${value.substring(0, 100)}...`);
                      }
                    }
                  }
                  
                  // 이미지 URL 추출 실패했지만 질문 대기 상태가 있으면 경고
                  if (senderId) {
                    const { getAndClearPendingQuestion } = require('./labbot-node');
                    const roomName = decryptedRoomName || '';
                    const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
                    if (pendingQuestion) {
                      console.warn(`[이미지 저장] ⚠️⚠️⚠️ 질문 대기 상태가 있지만 이미지 URL 추출 실패! 질문은 이미지 없이 처리될 수 있습니다.`);
                      console.warn(`[이미지 저장] 질문 정보: title="${pendingQuestion.title}", msgType=${msgType}, imageUrlFromClient=${!!imageUrlFromClient}, hasImageFromClient=${hasImageFromClient}`);
                      // 질문 대기 상태를 다시 저장 (이미 getAndClearPendingQuestion에서 삭제되었으므로)
                      const { setPendingQuestion } = require('./labbot-node');
                      setPendingQuestion(roomName, senderId, pendingQuestion.title, pendingQuestion.content);
                      console.warn(`[이미지 저장] 질문 대기 상태 복원 완료 - 다음 메시지에서 재시도 가능`);
                    }
                  }
                }
              } else {
                // 이미지 메시지로 판단되지 않은 경우 상세 로그
                console.log(`[이미지 저장] ⚠️ 이미지 메시지가 아님: msgType=${msgType}, imageUrlFromClient=${!!imageUrlFromClient}, hasImageFromClient=${hasImageFromClient}`);
                console.log(`[이미지 저장] ⚠️ 원본 JSON 필드 확인:`);
                console.log(`  - json.image_url: ${json.image_url ? '존재' : '없음'} (타입: ${typeof json.image_url}, 값: ${json.image_url ? String(json.image_url).substring(0, 50) + '...' : 'null'})`);
                console.log(`  - json.has_image: ${json.has_image} (타입: ${typeof json.has_image}, 원본: ${JSON.stringify(json.has_image)})`);
                console.log(`  - json.msg_type: ${json.msg_type} (타입: ${typeof json.msg_type})`);
                console.log(`  - json.type: ${json.type} (타입: ${typeof json.type})`);
                console.log(`  - json.attachment 존재: ${!!json.attachment}`);
                console.log(`  - json.attachment_decrypted 존재: ${!!json.attachment_decrypted}`);
                
                // attachment에 이미지 URL이 있는지 재확인 (클라이언트에서 추출 실패했을 수 있음)
                if (json.attachment || json.attachment_decrypted) {
                  const { extractImageUrl } = require('./db/utils/attachmentExtractor');
                  let attachmentData = json.attachment_decrypted || json.attachment || null;
                  
                  if (attachmentData && typeof attachmentData === 'string' && !json.attachment_decrypted) {
                    try {
                      attachmentData = JSON.parse(attachmentData);
                    } catch (e) {
                      // 파싱 실패
                    }
                  }
                  
                  if (attachmentData) {
                    const fallbackImageUrl = extractImageUrl(attachmentData, msgType);
                    if (fallbackImageUrl) {
                      console.log(`[이미지 저장] ⚠️⚠️⚠️ 클라이언트에서 추출 실패했지만 서버에서 이미지 URL 발견: ${fallbackImageUrl.substring(0, 50)}...`);
                      console.log(`[이미지 저장] ⚠️⚠️⚠️ 이미지 메시지로 재판단하여 처리합니다.`);
                      
                      // 이미지 메시지로 재처리
                      const { getAndClearPendingQuestion, processQuestionSubmission, setPendingAttachment } = require('./labbot-node');
                      const roomName = decryptedRoomName || '';
                      
                      if (senderId) {
                        const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
                        if (pendingQuestion) {
                          console.log(`[이미지 저장] ✅ 질문 대기 상태 발견 (재처리): 이미지와 함께 질문 처리`);
                          const questionReplies = await processQuestionSubmission(roomName, sender || senderName || '', pendingQuestion.title, pendingQuestion.content, fallbackImageUrl);
                          ws.pendingQuestionReplies = questionReplies || [];
                          console.log(`[이미지 저장] ✅ 질문 처리 완료 (재처리): ${questionReplies.length}개 응답`);
                          return; // 이미지 메시지 처리 종료
                        } else {
                          // 질문 대기 상태가 없으면 캐시에만 저장
                          setPendingAttachment(roomName, senderId, fallbackImageUrl);
                          console.log(`[이미지 저장] ✅ 캐시 저장 (재처리): url=${fallbackImageUrl.substring(0, 50)}...`);
                        }
                      }
                    }
                  }
                }
                
                // 이미지 메시지가 아니지만 질문 대기 상태가 있으면 경고
                if (senderId) {
                  const { getAndClearPendingQuestion, setPendingQuestion } = require('./labbot-node');
                  const roomName = decryptedRoomName || '';
                  const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
                  if (pendingQuestion) {
                    console.warn(`[이미지 저장] ⚠️⚠️⚠️ 질문 대기 상태가 있지만 이미지 메시지가 아님! 텍스트 메시지로 처리될 수 있습니다.`);
                    console.warn(`[이미지 저장] 질문 정보: title="${pendingQuestion.title}", msgType=${msgType}, message="${(decryptedMessage || '').substring(0, 50)}"`);
                    // 질문 대기 상태를 다시 저장 (이미 getAndClearPendingQuestion에서 삭제되었으므로)
                    setPendingQuestion(roomName, senderId, pendingQuestion.title, pendingQuestion.content);
                    console.warn(`[이미지 저장] 질문 대기 상태 복원 완료 - 다음 메시지에서 재시도 가능`);
                  }
                }
              }
            } catch (imgErr) {
              console.error('[이미지 저장] ❌ 실패:', imgErr.message);
              console.error('[이미지 저장] 스택:', imgErr.stack);
            }
          }
          
          // 닉네임 변경 감지 및 알림
          if (savedMessage) {
            try {
              // senderId 추출 강화 - json에서 user_id 확인
              const effectiveSenderId = senderId || json?.user_id || json?.userId || json?.sender_id || null;
              console.log(`[닉네임 변경] 감지 시도: senderName="${senderName || sender}", senderId="${effectiveSenderId}"`);
              
              if (effectiveSenderId) {
                nicknameChangeNotification = await chatLogger.checkNicknameChange(
                  decryptedRoomName || '',
                  senderName || sender || '',
                  effectiveSenderId
                );
                if (nicknameChangeNotification) {
                  console.log('[닉네임 변경] ✅ 알림 생성:', nicknameChangeNotification);
                } else {
                  console.log('[닉네임 변경] 변경 없음 또는 새 사용자');
                }
              } else {
                console.log('[닉네임 변경] ⚠️ senderId 없음, 감지 스킵');
              }
            } catch (err) {
              console.error('[닉네임 변경] ❌ 감지 실패:', err.message, err.stack);
            }
          }
          
          // 반응(reaction) 저장 처리
          // json에서 반응 정보 확인
          if (json && (json.type === 'reaction' || json.reaction || json.like || json.thumbs)) {
            try {
              // 반응 타입 확인
              const reactionType = json.reaction_type || json.reaction || json.like || json.thumbs || 'thumbs_up';
              // 반응 대상 메시지 ID (현재 메시지가 반응인 경우 원본 메시지 ID)
              const targetMessageId = json.target_message_id || json.message_id || savedMessage?.id || null;
              // 반응한 사용자 (현재 메시지 발신자가 반응을 준 사람)
              const reactorName = senderName || sender || '';
              const reactorId = senderId || null;
              // 관리자 반응 여부 (Phase 1.2: extractSenderName 사용)
              const { extractSenderName } = require('./labbot-node');
              const isAdminReaction = CONFIG.ADMIN_USERS.some(admin => {
                const adminName = typeof admin === 'string' ? extractSenderName(null, admin) : extractSenderName(admin, null);
                return adminName === reactorName;
              });
              
              if (targetMessageId && reactorName) {
                // targetMessageId가 kakao_log_id일 수 있으므로 DB id 조회 시도
                let actualMessageId = null;
                try {
                  // ✅ 숫자만 구성된 문자열인지 검증
                  const numericStr = String(targetMessageId).trim();
                  if (/^\d+$/.test(numericStr)) {
                    const numericLogId = parseInt(numericStr, 10);
                    if (!isNaN(numericLogId) && numericLogId > 0) {
                      const db = require('./db/database');
                      const { data: messageByLogId } = await db.supabase
                        .from('chat_messages')
                        .select('id')
                        .eq('kakao_log_id', numericLogId)
                        .eq('room_name', room || decryptedRoomName || '')  // ✅ room scope 제한 추가
                        .maybeSingle();  // ✅ single() 대신 maybeSingle() 사용
                      if (messageByLogId && messageByLogId.id) {
                        actualMessageId = String(messageByLogId.id);
                        console.log(`[반응 저장] kakao_log_id(${numericLogId})로 메시지 찾음: DB id=${actualMessageId}`);
                      }
                    }
                  }
                } catch (err) {
                  console.warn('[반응 저장] kakao_log_id로 메시지 찾기 실패:', err.message);
                }
                
                const messageIdToSave = actualMessageId || String(targetMessageId);
                
                const reactionSaveResult = await chatLogger.saveReaction(
                  messageIdToSave,
                  reactionType,
                  reactorName,
                  reactorId,
                  isAdminReaction
                );
                
                if (reactionSaveResult) {
                  console.log('[반응 저장] ✅ 성공:', {
                    db_id: messageIdToSave,
                    kakao_log_id: targetMessageId,
                    reaction_type: reactionType,
                    reactor: reactorName,
                    reactor_id: reactorId,
                    is_admin: isAdminReaction,
                    saved_reaction_id: reactionSaveResult.id
                  });
                } else {
                  console.warn('[반응 저장] ⚠️ saveReaction 반환값이 null (중복 또는 오류)');
                }
              }
            } catch (err) {
              console.error('[반응 저장] 실패:', err.message);
            }
          }
        } catch (err) {
          const kakaoLogId = json?._id || json?.kakao_log_id || 'N/A';
          console.error(`[메시지 저장] ❌❌❌ 저장 실패 (예외 발생): kakao_log_id=${kakaoLogId}, room="${decryptedRoomName || ''}", sender="${senderName || sender || ''}"`);
          console.error(`[메시지 저장] ❌❌❌ 에러 메시지: ${err.message}`);
          console.error(`[메시지 저장] ❌❌❌ 스택 트레이스:`, err.stack);
        }
        
        // 이미지 메시지에서 질문 처리된 경우 replies가 ws 객체에 저장되었을 수 있음
        // 사용자별로 독립적으로 처리되므로 동시 요청 충돌 없음
        let replies = [];
        if (ws.pendingQuestionReplies && ws.pendingQuestionReplies.length > 0) {
          replies = ws.pendingQuestionReplies;
          ws.pendingQuestionReplies = null; // ws 객체 초기화
          console.log(`[질문 응답] ws 객체에서 replies 가져옴: ${replies.length}개`);
        } else if (ws.pendingImageReply) {
          // ⚠️ 중요: 이미지 메시지에 대한 답장 (서버에 저장된 이미지 URL)
          console.log(`[이미지 답장] ⚠️⚠️⚠️ ws.pendingImageReply 발견: ${JSON.stringify(ws.pendingImageReply)}`);
          replies.push(ws.pendingImageReply);
          ws.pendingImageReply = null; // ws 객체 초기화
          console.log(`[이미지 답장] ✅ ws 객체에서 이미지 답장 가져옴: ${replies[0].imageUrl}, replies.length=${replies.length}`);
        } else if (isImageMessageEarly && imageUrlEarly && senderId) {
          // ⚠️ 중요: 이미지 메시지가 조기 감지된 경우, 질문 대기 상태 확인
          console.log(`[이미지 조기 처리] 이미지 메시지로 확인됨 - 질문 대기 상태 확인: senderId="${senderId}"`);
          const { getAndClearPendingQuestion, processQuestionSubmission, setPendingAttachment } = require('./labbot-node');
          const roomName = decryptedRoomName || '';
          const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
          
          if (pendingQuestion) {
            console.log(`[이미지 조기 처리] ✅ 질문 대기 상태 발견: 이미지와 함께 질문 처리`);
            replies = await processQuestionSubmission(roomName, senderName || sender || '', pendingQuestion.title, pendingQuestion.content, imageUrlEarly);
            console.log(`[이미지 조기 처리] ✅ 질문 처리 완료: ${replies.length}개 응답`);
          } else {
            // ⚠️ 중요: 질문 대기 상태가 없어도 이미지를 서버에 저장하고 URL을 답장으로 전송
            const { downloadAndSaveImage } = require('./utils/imageDownloader');
            const downloadResult = await downloadAndSaveImage(imageUrlEarly);
            
            if (downloadResult.success) {
              console.log(`[이미지 조기 처리] ✅ 서버에 저장 완료: ${downloadResult.filename} -> ${downloadResult.url}`);
              
              // 캐시에도 저장 (나중에 !질문 명령어에서 사용)
              setPendingAttachment(roomName, senderId, downloadResult.url);
              
              // 답장으로 이미지 URL 전송
              replies.push({
                type: 'image',
                text: `📷 이미지가 서버에 저장되었습니다.\n\nURL: ${downloadResult.url}`,
                imageUrl: downloadResult.url
              });
              
              console.log(`[이미지 조기 처리] ✅ 답장 준비 완료: ${downloadResult.url}`);
            } else {
              console.error(`[이미지 조기 처리] ❌ 서버 저장 실패: ${downloadResult.error}`);
              // 원본 URL을 캐시에 저장 (다운로드 실패 시)
              setPendingAttachment(roomName, senderId, imageUrlEarly);
              console.log(`[이미지 조기 처리] ⚠️ 원본 URL을 캐시에 저장: ${imageUrlEarly.substring(0, 50)}...`);
              replies = [];
            }
          }
        } else {
          // ⚠️ 중요: 이미지 처리 실패 플래그가 설정되어 있으면
          // handleMessage에서 중복 메시지를 방지하기 위해 플래그 전달
          // 하지만 handleMessage는 ws 객체에 직접 접근할 수 없으므로
          // 여기서는 일반적으로 호출하고, ws.pendingImageReply가 있으면 우선 처리됨
          
          // ⚠️ 중요: handleMessage에 복호화된 sender 전달
          // finalSender는 위에서 이미 복호화된 senderName으로 설정됨
          replies = await handleMessage(
            decryptedRoomName || '',
            decryptedMessage || '',
            finalSender,  // 복호화된 sender 사용 (위에서 설정됨)
            isGroupChat !== undefined ? isGroupChat : true,
            replyToMessageId,  // 답장 메시지 ID 전달 (DB id)
            json,  // ⚠️ 중요: json 파라미터 전달 (복호화를 위해 필요)
            replyToKakaoLogId  // ⚠️ 중요: reply_to_kakao_log_id 전달 (신고 기능을 위해 필요)
          );
          
          // ⚠️ 중요: 이미지 처리 실패 플래그가 설정되어 있고
          // handleMessage에서 "이미지를 보내시면..." 메시지를 반환한 경우
          // ws.pendingImageReply가 우선이므로 여기서는 추가 처리 불필요
        }
        
        console.log(`[${new Date().toISOString()}] handleMessage 호출 후:`);
        console.log(`  replies.length: ${replies.length}`);
        if (replies.length > 0) {
          console.log(`  replies[0]: ${JSON.stringify(replies[0]).substring(0, 200)}...`);
        } else {
          console.log(`  ⚠⚠⚠ replies가 비어있습니다! ⚠⚠⚠`);
        }
        
        // 무단홍보 메시지 자동 삭제 명령 전송 (handleMessage 호출 후 확인)
        // ⚠️ 주석 처리: 자동 삭제 기능 비활성화
        /*
        const lastPromotionResult = global.lastPromotionResult;
        if (lastPromotionResult && lastPromotionResult.shouldDelete) {
          // Bridge APK 클라이언트 찾기
          const bridgeClients = [];
          if (wss && wss.clients) {
            for (const client of wss.clients) {
              if (client.readyState === WebSocket.OPEN && client.isBridge === true) {
                bridgeClients.push(client);
              }
            }
          }
          
          if (bridgeClients.length > 0) {
            // ⚠️ 중요: 복호화된 메시지 텍스트 사용 (Bridge APK가 메시지를 찾을 수 있도록)
            // decryptedMessage가 있으면 우선 사용, 없으면 원본 메시지 사용
            const messageTextForDelete = decryptedMessage || lastPromotionResult.messageText || lastPromotionResult.originalMessage || '';
            
            // roomKey도 복호화된 값 사용 (캐시에서 찾기)
            let roomKeyForDelete = lastPromotionResult.roomKey || decryptedRoomName || room || '';
            // roomKey 캐시에서 최신 roomKey 가져오기
            if (typeof getRoomKeyFromCache === 'function') {
              const cachedRoomKey = getRoomKeyFromCache(roomKeyForDelete);
              if (cachedRoomKey) {
                roomKeyForDelete = cachedRoomKey;
                console.log(`[무단홍보 삭제] ✅ 캐시에서 roomKey 찾음: "${roomKeyForDelete}"`);
              }
            }
            // 캐시에서 못 찾으면 CONFIG.ROOM_KEY 사용
            if (!roomKeyForDelete) {
              roomKeyForDelete = CONFIG.ROOM_KEY || CONFIG.ROOM_NAME || '';
              console.log(`[무단홍보 삭제] ⚠️ CONFIG.ROOM_KEY 사용: "${roomKeyForDelete}"`);
            }
            
            const deleteMessage = {
              type: 'delete',
              roomKey: roomKeyForDelete,
              messageText: messageTextForDelete
            };
            
            console.log(`[무단홍보 삭제] ═══════════════════════════════════════════════════════`);
            console.log(`[무단홍보 삭제] 삭제 명령 전송:`);
            console.log(`[무단홍보 삭제]   roomKey: "${deleteMessage.roomKey}"`);
            console.log(`[무단홍보 삭제]   messageText: "${deleteMessage.messageText.substring(0, 50)}${deleteMessage.messageText.length > 50 ? '...' : ''}"`);
            console.log(`[무단홍보 삭제]   messageText 길이: ${deleteMessage.messageText.length}`);
            console.log(`[무단홍보 삭제]   복호화 상태: ${decryptedMessage ? '복호화됨' : '원본 사용'}`);
            
            try {
              bridgeClients[0].send(JSON.stringify(deleteMessage));
              console.log(`[무단홍보 삭제] ✓✓✓ 삭제 명령 전송 성공 ✓✓✓`);
            } catch (err) {
              console.error(`[무단홍보 삭제] ✗✗✗ 삭제 명령 전송 실패 ✗✗✗`);
              console.error(`[무단홍보 삭제]   오류: ${err.message}`);
            }
            console.log(`[무단홍보 삭제] ═══════════════════════════════════════════════════════`);
          } else {
            console.warn(`[무단홍보 삭제] ⚠ Bridge APK 클라이언트가 연결되어 있지 않음`);
          }
          
          // 전역 변수 초기화
          global.lastPromotionResult = null;
        }
        */
        
        // 닉네임 변경 알림 추가 (있는 경우)
        if (nicknameChangeNotification) {
          replies.unshift(nicknameChangeNotification);
          console.log('[닉네임 변경] ✅ 알림을 replies에 추가:', nicknameChangeNotification.substring(0, 100));
        } else {
          console.log('[닉네임 변경] 알림 없음 (변경 없음 또는 새 사용자)');
        }
        
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════════`);
        
        // chat_id 추출 (클라이언트에서 숫자로 변환 가능하도록)
        // json.chat_id가 있으면 사용 (클라이언트에서 명시적으로 전송한 값)
        // 1560번 줄에서 이미 선언되었으므로 재할당만 수행
        chatId = json?.chat_id || chatId;
        
        // 디버그: chat_id 추출 과정 확인
        console.log(`[응답 생성] chat_id 추출: json.chat_id=${json?.chat_id}, 타입=${typeof json?.chat_id}`);
        
        // chat_id를 문자열로 유지 (큰 숫자 손실 방지)
        // JavaScript Number는 64비트 부동소수점이므로 큰 정수는 정확도 손실 가능
        // 따라서 문자열로 전달하고, 필요시에만 숫자로 변환
        if (chatId) {
          if (typeof chatId === 'string' && /^\d+$/.test(chatId)) {
            // 문자열로 유지 (큰 숫자 정확도 보장)
            console.log(`[응답 생성] chat_id 문자열 유지: ${chatId}`);
            // 숫자로 변환은 클라이언트에서 수행
          } else if (typeof chatId === 'number') {
            // 숫자로 받은 경우 문자열로 변환 (큰 숫자 손실 방지)
            chatId = String(chatId);
            console.log(`[응답 생성] chat_id 숫자를 문자열로 변환: ${chatId}`);
          } else {
            console.log(`[경고] chat_id가 유효하지 않음: ${chatId}, 타입=${typeof chatId}`);
            chatId = null;
          }
        }
        
        if (!chatId) {
          console.log(`[응답 생성] json.chat_id 없음, room 확인: room="${room}", 타입=${typeof room}`);
          // room이 숫자인지 확인 (원본 chat_id일 수 있음)
          // 문자열로 유지 (큰 숫자 정확도 보장)
          if (typeof room === 'string' && /^\d+$/.test(room)) {
            chatId = room;  // 문자열로 유지
            console.log(`[응답 생성] room에서 chat_id 추출 (문자열): ${chatId}`);
          } else if (typeof room === 'number') {
            chatId = String(room);  // 숫자를 문자열로 변환
            console.log(`[응답 생성] room에서 chat_id 추출 (숫자→문자열): ${chatId}`);
          }
        }
        
        console.log(`[응답 생성] replies 개수: ${replies.length}, 최종 chat_id: ${chatId}, room: "${decryptedRoomName}"`);
        
        // 최근 채팅방 정보 저장 (스케줄 공지 발송용)
        if (decryptedRoomName && decryptedRoomName === CONFIG.ROOM_NAME) {
            recentRoomInfo.roomName = decryptedRoomName;
            recentRoomInfo.chatId = chatId;
            recentRoomInfo.lastUpdate = new Date();
            console.log(`[채팅방 추적] 최근 채팅방 정보 저장: roomName="${decryptedRoomName}", chatId=${chatId}`);
        }
        
        // roomKey 캐시 업데이트 (사용자가 메시지를 보낼 때 받은 room 값 저장)
        // Bridge APK가 알림에서 캐시한 roomKey와 일치하도록 사용
        // decryptedRoomName을 키로 사용하여 채팅방별 캐시 관리
        // 중요: 사용자가 보낸 메시지에는 알림이 없을 수 있으므로,
        // 최근에 다른 사용자가 보낸 메시지의 알림을 활용할 수 있도록 캐시 유지
        // 캐시 TTL을 10분으로 연장하여 더 오래 유지
        const cacheKey = decryptedRoomName || room || CONFIG.ROOM_NAME;
        if (room && cacheKey) {
            updateRoomKeyCache(cacheKey, room, chatId);
            console.log(`[roomKey 캐시] 업데이트 완료: cacheKey="${cacheKey}", room="${room}", chatId=${chatId}`);
            
            // 캐시 상태 확인 및 로깅
            const cachedRoomKey = getRoomKeyFromCache(cacheKey);
            if (cachedRoomKey) {
                console.log(`[roomKey 캐시] 유효한 캐시 존재: cacheKey="${cacheKey}", cachedRoomKey="${cachedRoomKey}"`);
            } else {
                console.log(`[roomKey 캐시] 캐시 없음 또는 만료: cacheKey="${cacheKey}"`);
            }
        }
        
        if (replies.length === 0) {
          console.log(`[응답 생성] ⚠⚠⚠ 빈 응답 배열, 전송하지 않음 ⚠⚠⚠`);
          console.log(`[응답 생성] 디버깅 정보:`);
          console.log(`  - decryptedMessage: "${decryptedMessage?.substring(0, 100)}"`);
          console.log(`  - decryptedMessage 길이: ${decryptedMessage?.length || 0}`);
          const isStillEncrypted = decryptedMessage && decryptedMessage.length > 10 && decryptedMessage.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(decryptedMessage);
          console.log(`  - decryptedMessage가 여전히 암호화된 상태인지: ${isStillEncrypted}`);
          if (isStillEncrypted) {
            console.log(`  ⚠ 경고: 메시지가 복호화되지 않아 명령어 매칭이 실패했을 수 있습니다.`);
            console.log(`  ⚠ 해결: 클라이언트에서 복호화를 확인하거나, 복호화 키를 확인하세요.`);
            console.log(`  ⚠ json.userId=${json?.userId}, json.user_id=${json?.user_id}, json.myUserId=${json?.myUserId}`);
          }
          console.log(`  - decryptedRoomName: "${decryptedRoomName}"`);
          console.log(`  - senderName: "${senderName}"`);
          console.log(`  - isGroupChat: ${isGroupChat}`);
          ws.send(JSON.stringify({
            type: 'reply',
            replies: []
          }));
          return;
        }

        console.log(`[응답 생성] ✓ replies.length=${replies.length}, 응답 전송 시작`);

        // 기존 클라이언트용 reply 형식 전송
        const replyMessages = replies.map(reply => {
          // reply가 객체이고 imageUrl이 있으면 이미지 응답
          if (typeof reply === 'object' && reply !== null && reply.imageUrl) {
            console.log(`[응답 생성] 이미지 응답 감지: imageUrl="${reply.imageUrl}"`);
            return {
              type: 'image',
              text: reply.text || '📷',
              imageUrl: reply.imageUrl,
              room: decryptedRoomName,
              chat_id: chatId
            };
          }
          // 일반 텍스트 응답
          return {
            type: 'text',
            text: typeof reply === 'string' ? reply : (reply.text || String(reply)),
            room: decryptedRoomName,  // 복호화된 채팅방 이름
            chat_id: chatId  // 숫자 chat_id 추가 (클라이언트에서 사용)
          };
        });
        
        console.log(`[응답 생성] replyMessages 개수: ${replyMessages.length}`);
        ws.send(JSON.stringify({
          type: 'reply',
          replies: replyMessages
        }));
        
        // Bridge APK용 send 형식으로도 전송 (사용자가 보낸 메시지의 원본 room 값 사용)
        // Bridge APK가 알림에서 추출한 roomKey와 정확히 일치해야 함
        // 중요: decryptedRoomName이 아닌 원본 room 값을 사용 (Bridge APK는 알림에서 채팅방명을 추출)
        console.log(`[응답 생성] ═══════════════════════════════════════════════════════`);
        console.log(`[응답 생성] replies.length=${replies.length}`);
        if (replies.length > 0) {
          console.log(`[응답 생성] ✓ replies가 있음, Bridge APK로 전송 시작`);
          // Bridge APK가 알림에서 추출하는 roomKey는 채팅방명이므로, 원본 room 값을 우선 사용
          // decryptedRoomName은 복호화된 이름이므로 Bridge APK가 알림에서 추출한 값과 다를 수 있음
          const actualRoomKey = room || CONFIG.ROOM_KEY || '';
          
          console.log(`[Bridge 전송] roomKey 결정: room="${room}" (원본), decryptedRoomName="${decryptedRoomName}" (복호화), 최종="${actualRoomKey}"`);
          console.log(`[Bridge 전송] 중요: Bridge APK는 알림에서 채팅방명을 추출하므로 원본 room 값 사용`);
          
          // Bridge APK 클라이언트 찾기
          // 중요: ws.isBridge 플래그를 사용하여 정확히 Bridge APK 클라이언트만 찾기
          const bridgeClients = [];
          if (wss && wss.clients) {
            console.log(`[Bridge 전송] 전체 WebSocket 클라이언트 수: ${wss.clients.size}`);
            for (const client of wss.clients) {
              if (client.readyState === WebSocket.OPEN) {
                // ws.isBridge 플래그로 Bridge APK 클라이언트 식별
                if (client.isBridge === true) {
                  bridgeClients.push(client);
                  console.log(`[Bridge 전송] ✓ Bridge APK 클라이언트 발견 (isBridge=true)`);
                } else if (client === ws) {
                  console.log(`[Bridge 전송] 현재 클라이언트는 Iris 클라이언트이므로 제외 (isBridge=${client.isBridge})`);
                } else {
                  console.log(`[Bridge 전송] 클라이언트는 Bridge APK가 아님 (isBridge=${client.isBridge})`);
                }
              } else {
                console.log(`[Bridge 전송] 클라이언트 상태: ${client.readyState} (OPEN=1)`);
              }
            }
          }
          console.log(`[Bridge 전송] Bridge APK 클라이언트 수: ${bridgeClients.length}`);
          
          // Bridge APK에 즉시 전송 (사용자가 메시지를 보낼 때 알림이 발생하므로 roomKey가 이미 캐시됨)
          // 지연 없이 즉시 전송하여 빠른 응답 제공
          let sentCount = 0;
          for (let i = 0; i < replies.length; i++) {
            const reply = replies[i];
            
            // reply가 객체이고 imageUrl이 있으면 이미지 전송
            let text = '';
            let imageUrl = null;
            
            // 디버깅: reply 객체 구조 확인
            if (typeof reply === 'object' && reply !== null) {
              console.log(`[Bridge 전송] reply 객체 확인: type=${reply.type}, imageUrl=${reply.imageUrl ? '있음' : '없음'}, text="${reply.text || ''}"`);
            }
            
            if (typeof reply === 'object' && reply !== null && reply.imageUrl) {
              text = reply.text || '📷';
              imageUrl = reply.imageUrl;
              console.log(`[Bridge 전송] 이미지 포함: imageUrl="${imageUrl}", text="${text}"`);
            } else {
              text = typeof reply === 'string' ? reply : (reply.text || String(reply));
            }
            
            const sendMessage = {
              type: 'send',
              id: `reply-${Date.now()}-${i}`,
              roomKey: actualRoomKey, // 원본 room 값 사용 (Bridge APK가 알림에서 추출한 값과 일치)
              text: text,
              ts: Math.floor(Date.now() / 1000)
            };
            
            // imageUrl이 있으면 반드시 추가 (이미지만 전송할 수도 있음)
            if (imageUrl) {
              sendMessage.imageUrl = imageUrl;
              console.log(`[Bridge 전송] imageUrl 필드 추가됨: "${imageUrl}"`);
            }
            
            const messageStr = JSON.stringify(sendMessage);
            console.log(`[Bridge 전송] 전송할 메시지: ${messageStr.substring(0, 200)}...`);
            
            // 첫 번째 Bridge APK에게 즉시 전송
            console.log(`[Bridge 전송] ═══════════════════════════════════════════════════════`);
            console.log(`[Bridge 전송] 전송 시도: replies[${i}], bridgeClients.length=${bridgeClients.length}`);
            console.log(`[Bridge 전송] 메시지 내용: ${messageStr.substring(0, 200)}...`);
            
            if (bridgeClients.length > 0) {
              try {
                bridgeClients[0].send(messageStr);
                sentCount++;
                console.log(`[Bridge 전송] ✓✓✓ 메시지 전송 성공 ✓✓✓`);
                console.log(`[Bridge 전송]   id=${sendMessage.id}`);
                console.log(`[Bridge 전송]   roomKey="${sendMessage.roomKey}"`);
                console.log(`[Bridge 전송]   text="${sendMessage.text?.substring(0, 50)}..."`);
                console.log(`[Bridge 전송]   imageUrl=${imageUrl ? `"${imageUrl}"` : '없음'}`);
              } catch (err) {
                console.error(`[Bridge 전송] ✗✗✗ 클라이언트 전송 실패 ✗✗✗`);
                console.error(`[Bridge 전송]   오류: ${err.message}`);
                console.error(`[Bridge 전송]   스택: ${err.stack}`);
              }
            } else {
              console.error(`[Bridge 전송] ✗✗✗ Bridge APK 클라이언트가 연결되어 있지 않음 ✗✗✗`);
              console.error(`[Bridge 전송]   전체 WebSocket 클라이언트 수: ${wss?.clients?.size || 0}`);
              console.error(`[Bridge 전송]   현재 클라이언트 제외 후: ${bridgeClients.length}개`);
              console.error(`[Bridge 전송]   현재 클라이언트(ws)는 Iris 클라이언트이므로 제외됨`);
            }
            console.log(`[Bridge 전송] ═══════════════════════════════════════════════════════`);
          }
          
          console.log(`[Bridge 전송] 응답 ${replies.length}개 즉시 전송 완료: roomKey="${actualRoomKey}", Bridge APK 전송=${sentCount}개`);
        } else {
          console.warn(`[응답 생성] ⚠⚠⚠ replies가 비어있음! Bridge APK로 전송하지 않음 ⚠⚠⚠`);
          console.warn(`[응답 생성] 명령어가 매칭되지 않았거나 handleMessage가 빈 배열을 반환했습니다.`);
        }
        console.log(`[응답 생성] ═══════════════════════════════════════════════════════`);
        
        console.log(`[응답 전송] ${replies.length}개 응답 전송 완료, chat_id: ${chatId}`);
        return;
      }

      // 3️⃣ 기존 형식 호환 (room, sender, msg)
      // room, sender, isGroupChat 변수가 이미 선언되었을 수 있으므로 재선언하지 않고 재할당만 수행
      const msg = messageData.msg;
      
      // room, sender, isGroupChat는 이미 선언되었을 수 있으므로 재할당만 수행
      // 함수 스코프에서 var로 선언하여 중복 선언 방지
      if (typeof room === 'undefined') {
        var room = messageData.room;
      } else {
        room = messageData.room;
      }
      if (typeof sender === 'undefined') {
        var sender = messageData.sender;
      } else {
        sender = messageData.sender;
      }
      if (typeof isGroupChat === 'undefined') {
        var isGroupChat = messageData.isGroupChat !== undefined ? messageData.isGroupChat : true;
      } else {
        isGroupChat = messageData.isGroupChat !== undefined ? messageData.isGroupChat : true;
      }

      if (!room || !sender || !msg) {
        ws.send(JSON.stringify({
          error: "Missing required fields",
          required: ["room", "sender", "msg"]
        }));
        return;
      }

      console.log(`[${new Date().toISOString()}] WS 메시지 수신:`, {
        room,
        sender,
        msg: msg.substring(0, 50) + (msg.length > 50 ? '...' : ''),
        isGroupChat: isGroupChat !== undefined ? isGroupChat : true
      });
      
      // 디버깅: handleMessage 호출 전 로그
      console.log(`[서버] handleMessage 호출 전: room="${room}", msg="${msg.substring(0, 100)}", sender="${sender}"`);
      
      // messageData.json 추출 (복호화를 위해 필요)
      // json 변수가 이미 선언되어 있을 수 있으므로 재할당만 수행
      const messageJson = messageData.json || null;

      const replies = await handleMessage(
        room,
        msg,
        sender,
        isGroupChat !== undefined ? isGroupChat : true,
        null,  // replyToMessageId (기존 형식에서는 null)
        messageJson  // ⚠️ 중요: json 파라미터 전달 (복호화를 위해 필요)
      );
      
      // 디버깅: handleMessage 호출 후 로그
      console.log(`[서버] handleMessage 호출 후: replies.length=${replies.length}, replies=${JSON.stringify(replies)}`);

      // 기존 클라이언트용 reply 형식 전송
      const response = {
        replies: replies.map(text => ({
          type: "text",
          text,
          room
        }))
      };
      ws.send(JSON.stringify(response));
      
      // Bridge APK용 send 형식으로도 전송 (사용자가 보낸 메시지의 원본 room 값 사용)
      // Bridge APK가 알림에서 추출한 roomKey와 정확히 일치해야 함
      // 중요: 원본 room 값을 그대로 사용 (Bridge APK는 알림에서 채팅방명을 추출)
      if (replies.length > 0) {
        // Bridge APK가 알림에서 추출하는 roomKey는 채팅방명이므로, 원본 room 값을 사용
        const actualRoomKey = room || CONFIG.ROOM_KEY || '';
        
        console.log(`[Bridge 전송] roomKey 결정: room="${room}" (원본), 최종="${actualRoomKey}"`);
        console.log(`[Bridge 전송] 중요: Bridge APK는 알림에서 채팅방명을 추출하므로 원본 room 값 사용`);
        
        // Bridge APK 클라이언트 찾기 (ws.isBridge 플래그 사용)
        const bridgeClients = [];
        if (wss && wss.clients) {
          for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN && client.isBridge === true) {
              bridgeClients.push(client);
              console.log(`[Bridge 전송] ✓ Bridge APK 클라이언트 발견 (isBridge=true)`);
            }
          }
        }
        console.log(`[Bridge 전송] Bridge APK 클라이언트 수: ${bridgeClients.length}`);
        
          // Bridge APK에 즉시 전송 (사용자가 메시지를 보낼 때 알림이 발생하므로 roomKey가 이미 캐시됨)
          // 지연 없이 즉시 전송하여 빠른 응답 제공
          let sentCount = 0;
          for (let i = 0; i < replies.length; i++) {
            const sendMessage = {
              type: 'send',
              id: `reply-${Date.now()}-${i}`,
              roomKey: actualRoomKey, // 원본 room 값 사용 (Bridge APK가 알림에서 추출한 값과 일치)
              text: replies[i],
              ts: Math.floor(Date.now() / 1000)
            };
            const messageStr = JSON.stringify(sendMessage);
            
            // 첫 번째 Bridge APK에게 즉시 전송
            if (bridgeClients.length > 0) {
              try {
                bridgeClients[0].send(messageStr);
                sentCount++;
              } catch (err) {
                console.error(`[Bridge 전송] 클라이언트 전송 실패:`, err.message);
              }
            }
          }
          
          console.log(`[Bridge 전송] 응답 ${replies.length}개 즉시 전송 완료: roomKey="${actualRoomKey}", Bridge APK 전송=${sentCount}개`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류:`, error);
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류 스택:`, error.stack);
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류 상세:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류 메시지:`, error.message);
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류 이름:`, error.name);
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류 타입:`, typeof error);
      
      // 에러 객체의 모든 속성 출력
      if (error && typeof error === 'object') {
        console.error(`[${new Date().toISOString()}] 메시지 처리 오류 속성:`, Object.keys(error));
        for (const key in error) {
          if (error.hasOwnProperty(key)) {
            console.error(`[${new Date().toISOString()}] 메시지 처리 오류.${key}:`, error[key]);
          }
        }
      }
      
      ws.send(JSON.stringify({
        error: "Internal server error",
        message: error.message || String(error)
      }));
    }
  });

  // 연결 직후 첫 메시지 제거 (임시)
  // irispy가 먼저 메시지를 보내도록 대기
  // ws.send(JSON.stringify({
  //   type: "hello",
  //   bot_id: "iris-core",
  //   json: {}
  // }));

  // (옵션) 테스트용 message 이벤트 제거 (임시)
  // setTimeout(() => {
  //   if (ws.readyState === WebSocket.OPEN) {
  //     ws.send(JSON.stringify({
  //       event: "message",
  //       json: {
  //         room: "test",
  //         sender: "server",
  //         msg: "!hi",
  //         isGroupChat: true
  //       }
  //     }));
  //   }
  // }, 1500);
});

// 스케줄 공지 자동 발송 체크 (30분마다)
let scheduleNoticeInterval = null;

async function checkAndSendScheduledNotice() {
    try {
        // 한국 시간대(KST, UTC+9)로 현재 시간 가져오기
        const now = new Date();
        const kstOffset = 9 * 60; // UTC+9 (분 단위)
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kstTime = new Date(utcTime + (kstOffset * 60000));
        
        const currentTime = `${kstTime.getHours()}:${String(kstTime.getMinutes()).padStart(2, '0')}`;
        const currentMinute = kstTime.getMinutes();
        
        // 1분 간격 체크: 정확한 시간(예: 09:00, 09:15, 09:30, 14:00 등)에 발송
        // shouldSendScheduledNotice 내에서 정확한 시간 비교 수행
        
        const result = await NOTICE_SYSTEM.shouldSendScheduledNotice();
        
        if (result && result.shouldSend && result.content) {
            console.log(`[스케줄 공지] 자동 발송 시작: "${result.content.substring(0, 50)}..."`);
            
            // 모든 연결된 WebSocket 클라이언트에 공지 전송
            if (wss && wss.clients && wss.clients.size > 0) {
                // CONFIG에서 고정 roomKey 사용
                const FIXED_ROOM_KEY = CONFIG.ROOM_KEY || CONFIG.ROOM_NAME;
                let sentCount = 0;
                
                // WebSocket으로 공지 전송 (Bridge APK 형식: roomKey, text 사용)
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            const replyPayload = {
                                type: 'send',
                                id: `notice-${Date.now()}`,
                                roomKey: FIXED_ROOM_KEY,  // 고정 roomKey 사용
                                text: `📢 공지사항\n──────────\n${result.content}`,  // Bridge APK는 text 사용
                                ts: Math.floor(Date.now() / 1000)
                            };
                            client.send(JSON.stringify(replyPayload));
                            sentCount++;
                            console.log(`[스케줄 공지] 클라이언트 전송: roomKey="${FIXED_ROOM_KEY}" (고정값), text 길이=${replyPayload.text.length}`);
                        } catch (error) {
                            console.error(`[스케줄 공지] 클라이언트 전송 오류:`, error);
                        }
                    }
                });
                
                console.log(`[스케줄 공지] 전송 완료: ${sentCount}개 클라이언트에 전송 (roomKey: "${FIXED_ROOM_KEY}")`);
                console.log(`[스케줄 공지] 참고: Bridge APK가 replyAction 캐시를 확인합니다.`);
                console.log(`[스케줄 공지] - 캐시가 있으면: 즉시 전송 ✅`);
                console.log(`[스케줄 공지] - 캐시가 없으면: 큐에 저장 후, 다음 알림 시 자동 전송 ⏳`);
            } else {
                console.log(`[스케줄 공지] 전송 실패: 연결된 클라이언트 없음 (총 ${wss?.clients?.size || 0}개)`);
            }
        } else {
            // 발송할 공지가 없을 때는 로그 출력 안 함 (너무 많은 로그 방지)
        }
    } catch (error) {
        console.error(`[스케줄 공지] 체크 오류:`, error);
    }
}

// HTTP 서버 시작
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] HTTP listening on 0.0.0.0:${PORT}`);
  
  // 스케줄 공지 체크 시작 (1분마다 - 정확한 시간에 발송하기 위해)
  scheduleNoticeInterval = setInterval(async () => {
      await checkAndSendScheduledNotice();
  }, 60000); // 1분마다 체크 (60000ms = 1분) - 정확한 시간에 발송하기 위해
  
  console.log(`[${new Date().toISOString()}] 스케줄 공지 자동 체크 시작 (1분 간격)`);
  
  // 백필 작업 주기적 실행 (5분마다)
  setInterval(async () => {
    try {
      const chatLogger = require('./db/chatLogger');
      await chatLogger.backfillAllPendingReplies();
    } catch (err) {
      console.error('[백필] 주기적 백필 작업 실패:', err.message);
      console.error('[백필] 스택 트레이스:', err.stack);
    }
  }, 5 * 60 * 1000);  // 5분마다 실행
  
  console.log(`[${new Date().toISOString()}] 백필 작업 자동 실행 시작 (5분 간격)`);
});

// 종료 처리 (로그 스트림 닫기는 logManager에서 처리)
function shutdown(signal) {
  return function() {
    console.log(`[${new Date().toISOString()}] 서버 종료(${signal})...`);
    // 로그 정리는 logManager에서 처리
    logManager.shutdown();
    if (wss) {
      wss.close(() => {
        if (server) {
          server.close(() => process.exit(0));
        } else {
          process.exit(0);
        }
      });
    } else {
      process.exit(0);
    }
  };
}

process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

process.on('uncaughtException', function (error) {
  console.error(`[${new Date().toISOString()}] uncaughtException:`, error);
});

process.on('unhandledRejection', function (reason) {
  console.error(`[${new Date().toISOString()}] unhandledRejection:`, reason);
});

// decryptKakaoTalkMessage 함수 export (labbot-node.js에서 사용)
// circular dependency 방지를 위해 module.exports와 global 모두 설정
module.exports.decryptKakaoTalkMessage = decryptKakaoTalkMessage;
if (typeof global !== 'undefined') {
    global.decryptKakaoTalkMessage = decryptKakaoTalkMessage;
}

