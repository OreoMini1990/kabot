// ============================================
// IRIS Core - HTTP + WebSocket Upgrade Server
// - irispy 호환: HTTP API + WS endpoint (/ws)
// - Express + ws를 사용한 단일 포트 공유
// - Port: process.env.PORT or 5002
// ============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { handleMessage } = require('./labbot-node');

const PORT = Number(process.env.PORT || 5002);
const BOT_ID = process.env.BOT_ID || 'iris-core';

// ============================================
// 로그 파일 관리 (최근 10개만 유지)
// ============================================
const LOG_DIR = '/home/app/iris-core'; // 로그 저장 디렉토리
const MAX_LOG_FILES = 10; // 최대 보관 로그 파일 수

// 로그 디렉토리 생성 (없으면 생성)
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  console.error(`[로그] 디렉토리 생성 실패: ${LOG_DIR}`, e.message);
}

// 로그 파일명 생성 (YYYYMMDD-HHMMSS 형식)
function getLogFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `server-${year}${month}${day}-${hour}${minute}${second}.log`;
}

// 오래된 로그 파일 정리 (최근 10개만 유지)
function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('server-') && file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(LOG_DIR, file),
        mtime: fs.statSync(path.join(LOG_DIR, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime); // 최신순 정렬

    // 최근 10개를 제외한 나머지 삭제
    if (files.length > MAX_LOG_FILES) {
      const filesToDelete = files.slice(MAX_LOG_FILES);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`[로그 정리] 오래된 로그 파일 삭제: ${file.name}`);
        } catch (e) {
          console.error(`[로그 정리] 파일 삭제 실패: ${file.name}`, e.message);
        }
      });
    }
  } catch (e) {
    console.error(`[로그 정리] 오류:`, e.message);
  }
}

// 로그 파일 스트림 생성
const logFileName = getLogFileName();
const logFilePath = path.join(LOG_DIR, logFileName);
let logStream = null;

try {
  logStream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
  console.log(`[로그] 로그 파일 생성: ${logFileName}`);
  console.log(`[로그] 로그 파일 경로: ${logFilePath}`);
  console.log(`[로그] 최대 보관 파일 수: ${MAX_LOG_FILES}개`);
  
  // 시작 시 오래된 로그 정리
  cleanupOldLogs();
} catch (e) {
  console.error(`[로그] 로그 파일 생성 실패:`, e.message);
}

// 로그 기록 함수 (콘솔 + 파일)
function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  
  // 콘솔 출력 (원본 함수 사용하여 무한 루프 방지)
  if (level === 'ERROR') {
    originalError(...args);
  } else {
    originalLog(...args);
  }
  
  // 파일 출력
  if (logStream) {
    try {
      logStream.write(logLine);
    } catch (e) {
      // 파일 쓰기 실패해도 서버는 계속 동작 (원본 함수 사용)
      originalError(`[로그] 파일 쓰기 실패:`, e.message);
    }
  }
}

// console.log, console.error 래핑
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  writeLog('INFO', ...args);
};

console.error = function(...args) {
  writeLog('ERROR', ...args);
};

// 종료 시 로그 스트림 닫기 (하단의 shutdown 함수에서 처리)
process.on('exit', () => {
  if (logStream) {
    logStream.end();
  }
});

// WebSocket 서버를 전역 변수로 선언 (나중에 할당)
let wss = null;

// Express 앱 생성
const app = express();

// JSON 파싱 미들웨어
app.use(express.json());

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
// 카카오톡 메시지 복호화 로직 (Python 코드와 동일)
// ============================================

const KAKAO_IV = Buffer.from([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53]);
const KAKAO_PASSWORD = Buffer.from([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6]);
// kakaodecrypt.py의 KAKAO_PREFIXES와 동일하게 구성
// 인덱스 31: incept(830819) = 'extr.ursra'
// 인덱스 32: 'veil'
const KAKAO_PREFIXES = [
  '', '', '12', '24', '18', '30', '36', '12', '48', '7', '35', '40',
  '17', '23', '29', 'isabel', 'kale', 'sulli', 'van', 'merry', 'kyle',
  'james', 'maddux', 'tony', 'hayden', 'paul', 'elijah', 'dorothy',
  'sally', 'bran', incept(830819), 'veil'
];

function incept(n) {
  const dict1 = ['adrp.ldrsh.ldnp', 'ldpsw', 'umax', 'stnp.rsubhn', 'sqdmlsl', 'uqrshl.csel', 'sqshlu', 'umin.usubl.umlsl', 'cbnz.adds', 'tbnz',
    'usubl2', 'stxr', 'sbfx', 'strh', 'stxrb.adcs', 'stxrh', 'ands.urhadd', 'subs', 'sbcs', 'fnmadd.ldxrb.saddl',
    'stur', 'ldrsb', 'strb', 'prfm', 'ubfiz', 'ldrsw.madd.msub.sturb.ldursb', 'ldrb', 'b.eq', 'ldur.sbfiz', 'extr',
    'fmadd', 'uqadd', 'sshr.uzp1.sttrb', 'umlsl2', 'rsubhn2.ldrh.uqsub', 'uqshl', 'uabd', 'ursra', 'usubw', 'uaddl2',
    'b.gt', 'b.lt', 'sqshl', 'bics', 'smin.ubfx', 'smlsl2', 'uabdl2', 'zip2.ssubw2', 'ccmp', 'sqdmlal',
    'b.al', 'smax.ldurh.uhsub', 'fcvtxn2', 'b.pl'];
  const dict2 = ['saddl', 'urhadd', 'ubfiz.sqdmlsl.tbnz.stnp', 'smin', 'strh', 'ccmp', 'usubl', 'umlsl', 'uzp1', 'sbfx',
    'b.eq', 'zip2.prfm.strb', 'msub', 'b.pl', 'csel', 'stxrh.ldxrb', 'uqrshl.ldrh', 'cbnz', 'ursra', 'sshr.ubfx.ldur.ldnp',
    'fcvtxn2', 'usubl2', 'uaddl2', 'b.al', 'ssubw2', 'umax', 'b.lt', 'adrp.sturb', 'extr', 'uqshl',
    'smax', 'uqsub.sqshlu', 'ands', 'madd', 'umin', 'b.gt', 'uabdl2', 'ldrsb.ldpsw.rsubhn', 'uqadd', 'sttrb',
    'stxr', 'adds', 'rsubhn2.umlsl2', 'sbcs.fmadd', 'usubw', 'sqshl', 'stur.ldrsh.smlsl2', 'ldrsw', 'fnmadd', 'stxrb.sbfiz',
    'adcs', 'bics.ldrb', 'l1ursb', 'subs.uhsub', 'ldurh', 'uabd', 'sqdmlal'];
  const word1 = dict1[n % dict1.length];
  const word2 = dict2[(n + 31) % dict2.length];
  return word1 + '.' + word2;
}

function generateSalt(userId, encType) {
  // Python 코드와 정확히 동일: gen_salt(user_id, enc)
  // Python: s = (KAKAO_PREFIXES[enc] + str(user_id))[:16]
  // Python: s = s + "\0" * (16 - len(s))
  // Python: return s.encode("utf-8")
  
  const userIdStr = String(userId);
  const encTypeNum = Number(encType);
  
  // Python: prefix = KAKAO_PREFIXES[enc]
  const prefix = KAKAO_PREFIXES[encTypeNum] || '';
  
  // Python: s = (prefix + str(user_id))[:16]
  let saltStr = (prefix + userIdStr).substring(0, 16);
  
  // Python: s = s + "\0" * (16 - len(s))
  // Buffer.alloc(16, 0)로 이미 0으로 초기화되어 있음
  const salt = Buffer.alloc(16, 0);
  const saltBytes = Buffer.from(saltStr, 'utf-8');
  const copyLen = Math.min(saltBytes.length, 16);
  saltBytes.copy(salt, 0, 0, copyLen);
  
  return salt;
}

function pkcs16adjust(aArray, aOff, b) {
  // aArray는 Buffer 또는 Uint8Array (직접 수정 가능)
  // Python 코드와 동일: pkcs16adjust(I, j * v, B)
  let x = (b[b.length - 1] & 0xff) + (aArray[aOff + b.length - 1] & 0xff) + 1;
  aArray[aOff + b.length - 1] = x % 256;
  x = x >> 8;
  for (let i = b.length - 2; i >= 0; i--) {
    x = x + (b[i] & 0xff) + (aArray[aOff + i] & 0xff);
    aArray[aOff + i] = x % 256;
    x = x >> 8;
  }
}

function generateSecretKey(salt) {
  // PKCS12 키 유도 방식 (PBEWITHSHAAND256BITAES-CBC-BC)
  // Python 코드: password = (password + b'\0').decode('ascii').encode('utf-16-be')
  // Python의 .decode('ascii')는 각 바이트를 ASCII 문자로 변환
  // Python의 .encode('utf-16-be')는 각 문자를 2바이트(Big Endian)로 변환
  const password = Buffer.from(KAKAO_PASSWORD);
  // password + null byte
  const passwordWithNull = Buffer.concat([password, Buffer.from([0])]);
  
  // Python: (password + b'\0').decode('ascii').encode('utf-16-be')
  // 각 바이트를 ASCII 문자로 디코딩한 후 UTF-16-BE로 인코딩
  // ASCII 범위(0-127)의 바이트는 UTF-16-BE로 인코딩할 때 High byte=0, Low byte=원본 값
  const passwordUtf16be = Buffer.alloc(passwordWithNull.length * 2);
  for (let i = 0; i < passwordWithNull.length; i++) {
    const byte = passwordWithNull[i];
    // UTF-16-BE: High byte = 0, Low byte = 원본 바이트 값
    passwordUtf16be[i * 2] = 0;           // High byte (항상 0, ASCII는 0-127)
    passwordUtf16be[i * 2 + 1] = byte;     // Low byte (원본 바이트 값)
  }
  
  const hasher = crypto.createHash('sha1');
  const v = 64; // SHA1 block size
  const u = 20; // SHA1 digest size
  
  const D = Buffer.alloc(v, 1);
  // Python 코드와 정확히 동일: math.ceil(len(salt) / v)
  const saltLen = Math.ceil(salt.length / v);
  const S = Buffer.alloc(v * saltLen);
  for (let i = 0; i < S.length; i++) {
    S[i] = salt[i % salt.length];
  }
  
  // Python 코드와 정확히 동일: math.ceil(len(password) / v)
  const passLen = Math.ceil(passwordUtf16be.length / v);
  const P = Buffer.alloc(v * passLen);
  for (let i = 0; i < P.length; i++) {
    P[i] = passwordUtf16be[i % passwordUtf16be.length];
  }
  
  const I = Buffer.concat([S, P]);
  const B = Buffer.alloc(v);
  const dkeySize = 32;
  const c = Math.ceil((dkeySize + u - 1) / u);
  const dKey = Buffer.alloc(dkeySize);
  
  for (let i = 1; i <= c; i++) {
    const hash1 = crypto.createHash('sha1');
    hash1.update(D);
    hash1.update(I);
    let A = Buffer.from(hash1.digest());
    
    // kakaodecrypt.py와 동일: for _ in range(1, iterations) - iterations=2일 때 1번 반복
    // Python: range(1, 2)는 [1]만 생성하므로 1번 반복
    // JavaScript: for (let j = 1; j < 2; j++) - j=1만 실행 (1번 반복)
    for (let j = 1; j < 2; j++) { // iterations = 2일 때 1번 반복
      const hash2 = crypto.createHash('sha1');
      hash2.update(A);
      A = Buffer.from(hash2.digest());
    }
    
    for (let j = 0; j < B.length; j++) {
      B[j] = A[j % A.length];
    }
    
    // Python 코드와 동일: I를 직접 수정
    // Buffer는 Uint8Array의 서브클래스이므로 직접 수정 가능
    for (let j = 0; j < Math.floor(I.length / v); j++) {
      pkcs16adjust(I, j * v, B);
    }
    
    // kakaodecrypt.py와 동일한 로직
    const start = (i - 1) * u;
    const remaining = dkeySize - start;
    if (remaining > 0) {
      // kakaodecrypt.py: write_len = min(remaining, len(A))
      const writeLen = Math.min(remaining, A.length);
      // kakaodecrypt.py: dKey[start:start + write_len] = A[:write_len]
      A.copy(dKey, start, 0, writeLen);
    }
  }
  
  return dKey;
}

function decryptKakaoTalkMessage(encryptedText, userId, encType = 31) {
  try {
    if (!encryptedText || encryptedText === '{}' || encryptedText === '[]') {
      return encryptedText;
    }
    
    // userId를 문자열로 변환 (큰 정수 정밀도 손실 방지)
    const userIdStr = String(userId);
    // encType을 숫자로 변환
    const encTypeNum = Number(encType);
    
    const salt = generateSalt(userIdStr, encTypeNum);
    console.log(`[복호화] Salt 생성: userId=${userId}, encType=${encType}, salt hex=${salt.toString('hex').substring(0, 32)}`);
    
    const secretKey = generateSecretKey(salt);
    console.log(`[복호화] SecretKey 생성: key hex=${secretKey.toString('hex').substring(0, 32)}`);
    
    // kakaodecrypt.py와 동일: base64 디코딩
    let decoded;
    try {
      decoded = Buffer.from(encryptedText, 'base64');
    } catch (e) {
      // base64 디코딩 실패 시 null 반환 (kakaodecrypt.py와 동일)
      console.log(`[복호화] Base64 디코딩 실패: ${e.message}`);
      return null;
    }
    
    console.log(`[복호화] Base64 디코딩: 암호문 길이=${decoded.length}`);
    
    // kakaodecrypt.py: if len(ct) == 0 or len(ct) % 16 != 0: return None
    if (decoded.length === 0 || decoded.length % 16 !== 0) {
      console.log(`[복호화] 실패: 암호문 길이가 0이거나 16의 배수가 아님: ${decoded.length}`);
      return null;
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, KAKAO_IV);
    decipher.setAutoPadding(false);
    
    // Iris 방식: cipher.doFinal() with BadPaddingException handling
    let padded;
    try {
      padded = Buffer.concat([decipher.update(decoded), decipher.final()]);
      console.log(`[복호화] AES 복호화 완료: padded 길이=${padded.length}`);
    } catch (e) {
      // Iris 코드: BadPaddingException catch 후 원본 반환
      console.log(`[복호화] BadPaddingException 또는 복호화 오류: ${e.message}`);
      console.log(`[복호화] 잘못된 키 또는 데이터일 수 있습니다. 원본 ciphertext 반환`);
      return encryptedText;
    }
    
    // PKCS5Padding 제거 (제공된 코드 방식: padded[:-padded[-1]])
    let plaintext;
    try {
      if (padded.length === 0) {
        console.log(`[복호화] 경고: 복호화된 데이터가 비어있음`);
        return null;
      }
      
      // Iris 방식: 마지막 바이트를 패딩 길이로 사용
      // Iris 코드: val paddingLength = padded[padded.size - 1].toInt()
      // Kotlin의 toInt()는 signed integer로 변환하지만, 바이트 값은 unsigned로 처리됨
      // JavaScript에서는 바이트 값이 이미 0-255 범위이므로 & 0xff는 불필요하지만 명시적으로 사용
      const lastByte = padded[padded.length - 1];
      const paddingLength = lastByte & 0xff;  // unsigned로 변환 (0-255)
      console.log(`[복호화] 패딩 확인: padded 길이=${padded.length}, 마지막 바이트=${lastByte}, paddingLength=${paddingLength}`);
      
      // Iris 방식: require(!(paddingLength <= 0 || paddingLength > cipher.blockSize))
      // cipher.blockSize = 16 (AES 블록 크기)
      // Iris는 require() 실패 시 예외 발생하지만, 여기서는 복호화 실패로 간주
      if (paddingLength <= 0 || paddingLength > 16) {
        console.log(`[복호화] 실패: 잘못된 패딩 길이 (${paddingLength}), 복호화 키가 잘못되었을 수 있습니다`);
        console.log(`[복호화] 디버그: padded 마지막 바이트=${lastByte}, paddingLength=${paddingLength}, padded 길이=${padded.length}`);
        return null;
      }
      
      if (paddingLength > padded.length) {
        console.log(`[복호화] 실패: 패딩 길이(${paddingLength})가 데이터 길이(${padded.length})보다 큼`);
        return null;
      }
      
      // Iris 방식: plaintextBytes = ByteArray(padded.size - paddingLength)
      // Iris는 패딩 바이트 검증을 하지 않고, 패딩 길이만 체크합니다
      plaintext = padded.slice(0, padded.length - paddingLength);
      console.log(`[복호화] PKCS5 패딩 제거: paddingLength=${paddingLength}, plaintext 길이=${plaintext.length}`);
      
      // 패딩 제거 후 길이가 0이면 실패로 간주
      if (plaintext.length === 0) {
        console.log(`[복호화] 실패: 패딩 제거 후 길이가 0`);
        return null;
      }
    } catch (e) {
      // IndexError: 패딩 제거 실패
      console.log(`[복호화] 패딩 제거 실패: ${e.message}, 원본 데이터 사용`);
      plaintext = padded;
    }
    
    if (plaintext.length === 0) {
      console.log(`[복호화] 경고: plaintext가 비어있음`);
      return null;
    }
    
    // UTF-8 디코딩 (Iris 방식: String(plaintextBytes, StandardCharsets.UTF_8))
    try {
      const result = plaintext.toString('utf-8');
      
      // 복호화된 메시지가 유효한 텍스트인지 확인
      if (result && result.length > 0) {
        // 제어 문자나 깨진 문자 확인 (Iris는 체크하지 않지만, 안전을 위해 추가)
        const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(result);
        if (hasControlChars) {
          console.log(`[복호화] 경고: 제어 문자 포함, 바이너리 데이터일 수 있음`);
          // 제어 문자가 많으면 복호화 실패로 간주
          const controlCharCount = (result.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g) || []).length;
          if (controlCharCount > result.length * 0.1) {  // 10% 이상이면 실패
            console.log(`[복호화] 실패: 제어 문자 비율이 너무 높음 (${controlCharCount}/${result.length})`);
            return null;
          }
        }
        console.log(`[복호화] UTF-8 디코딩 성공: "${result.substring(0, 50)}${result.length > 50 ? '...' : ''}"`);
        return result;
      }
      return null;
    } catch (e) {
      // Iris는 UTF-8 디코딩 실패 시 예외를 발생시키지만, 여기서는 null 반환
      console.log(`[복호화] UTF-8 디코딩 실패: ${e.message}`);
      return null;
    }
  } catch (e) {
    console.log(`[복호화] 예외 발생: ${e.message}`);
    console.error(e);
    return null;
  }
}

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
    
    const serverUrl = process.env.SERVER_URL || 'http://211.218.42.222:5002';
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
    console.log("=== RAW MESSAGE FROM CLIENT ===");
    console.log(data.toString());
    console.log("================================");
    
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
      if (messageData.type === 'connect') {
        console.log(`[${new Date().toISOString()}] Iris client handshake OK`);
        ws.send(JSON.stringify({
          type: 'connected',
          ok: true
        }));
        return;
      }

      // 2️⃣ IrisLink message 타입 처리
      if (messageData.type === 'message') {
        const { room, sender, message, isGroupChat, json } = messageData;
        
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
            
            // Iris 코드 기준: ObserverHelper.kt에서 발신자의 user_id를 사용
            // Iris 코드: val userId = cursor.getLong(columnNames.indexOf("user_id"))
            // Iris 코드: KakaoDecrypt.decrypt(enc, message, userId) - 발신자의 user_id 사용
            // 따라서 복호화에는 발신자의 user_id를 사용해야 함
            const senderUserId = json.userId || json.user_id;  // 발신자 user_id (우선 사용, 문자열 유지)
            const myUserId = json.myUserId;  // 자신의 user_id (참고용, fallback용)
            console.log(`[복호화] 발신자 userId: ${senderUserId}, myUserId: ${myUserId}, 타입: ${typeof senderUserId}`);
            console.log(`[디버그] json.userId=${json.userId}, json.user_id=${json.user_id}, 선택된 senderUserId=${senderUserId}`);
            
            // 카카오톡 복호화 시도 (발신자 user_id 우선 사용, Iris 코드 기준)
            if (senderUserId) {
              try {
                // enc 후보: 우선 enc (v 필드 또는 json.encType에서 추출한 값), 이후 31, 32, 30 순으로 재시도
                // kakaodecrypt.py 테스트에서 enc=31이 가장 일반적이므로 우선순위 높임
                const encCandidates = [];
                if (enc !== undefined && enc !== null) encCandidates.push(enc);
                // 기본값 31을 우선 시도 (가장 일반적)
                encCandidates.push(31);
                // 다른 후보들
                encCandidates.push(32, 30);
                const encUnique = Array.from(new Set(encCandidates));
                console.log(`[복호화] enc 후보 목록: ${encUnique.join(', ')}`);

                // userId 후보: 발신자 → myUserId
                const userCandidates = [];
                userCandidates.push(String(senderUserId));
                if (myUserId && myUserId != senderUserId) userCandidates.push(String(myUserId));

                let decryptedFound = null;
                for (const uid of userCandidates) {
                  for (const encTry of encUnique) {
                    console.log(`[복호화] 시도: user_id=${uid}, enc=${encTry}, 메시지 길이=${decryptedMessage.length}`);
                    // userId는 문자열로, encType은 숫자로 전달
                    const d = decryptKakaoTalkMessage(decryptedMessage, String(uid), Number(encTry));
                    if (d) {
                      decryptedFound = d;
                      console.log(`[✓ 복호화 성공] 메시지 ID: ${json._id}, user_id=${uid}, enc=${encTry}, 복호화 길이: ${d.length}`);
                      break;
                    }
                  }
                  if (decryptedFound) break;
                }

                if (decryptedFound) {
                  decryptedMessage = decryptedFound;
                } else {
                  console.log(`[✗ 복호화 실패] 메시지 ID: ${json._id}, 모든 enc/userId 시도 실패`);
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
        
        console.log(`[${new Date().toISOString()}] WS 메시지 수신 (IrisLink):`, {
          room: decryptedRoomName,
          sender,
          message: decryptedMessage?.substring(0, 50) + (decryptedMessage?.length > 50 ? '...' : ''),
          isGroupChat: isGroupChat !== undefined ? isGroupChat : true
        });

        const replies = handleMessage(
          decryptedRoomName || '',
          decryptedMessage || '',
          sender || '',
          isGroupChat !== undefined ? isGroupChat : true
        );

        // chat_id 추출 (클라이언트에서 숫자로 변환 가능하도록)
        // json.chat_id가 있으면 사용 (클라이언트에서 명시적으로 전송한 값)
        let chatId = json?.chat_id;
        
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
        
        if (replies.length === 0) {
          console.log(`[응답 생성] 빈 응답 배열, 전송하지 않음`);
          ws.send(JSON.stringify({
            type: 'reply',
            replies: []
          }));
          return;
        }

        // 기존 클라이언트용 reply 형식 전송
        ws.send(JSON.stringify({
          type: 'reply',
          replies: replies.map(text => ({
            type: 'text',
            text: text,
            room: decryptedRoomName,  // 복호화된 채팅방 이름
            chat_id: chatId  // 숫자 chat_id 추가 (클라이언트에서 사용)
          }))
        }));
        
        // Bridge APK용 send 형식으로도 전송 (Bridge APK만 대상, 클라이언트는 제외)
        replies.forEach((text, index) => {
          const sendMessage = {
            type: 'send',
            id: `reply-${Date.now()}-${index}`,
            roomKey: decryptedRoomName || room || '',
            text: text,
            ts: Math.floor(Date.now() / 1000)
          };
          const messageStr = JSON.stringify(sendMessage);
          
          // Bridge APK만 대상으로 전송 (현재 클라이언트 제외)
          let sentCount = 0;
          if (wss && wss.clients) {
            wss.clients.forEach((client) => {
              // 현재 클라이언트(ws)는 제외하고 Bridge APK만 전송
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                try {
                  client.send(messageStr);
                  sentCount++;
                } catch (err) {
                  console.error(`[Bridge 전송] 클라이언트 전송 실패:`, err.message);
                }
              }
            });
          }
          
          console.log(`[Bridge 전송] 응답 ${index + 1}/${replies.length}: roomKey="${decryptedRoomName || room}", text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}", Bridge APK 전송=${sentCount}개`);
        });
        
        console.log(`[응답 전송] ${replies.length}개 응답 전송 완료, chat_id: ${chatId}`);
        return;
      }

      // 3️⃣ 기존 형식 호환 (room, sender, msg)
      const { room, sender, msg, isGroupChat } = messageData;

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

      const replies = handleMessage(
        room,
        msg,
        sender,
        isGroupChat !== undefined ? isGroupChat : true
      );

      // 기존 클라이언트용 reply 형식 전송
      const response = {
        replies: replies.map(text => ({
          type: "text",
          text,
          room
        }))
      };
      ws.send(JSON.stringify(response));
      
      // Bridge APK용 send 형식으로도 전송 (Bridge APK만 대상, 클라이언트는 제외)
      replies.forEach((text, index) => {
        const sendMessage = {
          type: 'send',
          id: `reply-${Date.now()}-${index}`,
          roomKey: room || '',
          text: text,
          ts: Math.floor(Date.now() / 1000)
        };
        const messageStr = JSON.stringify(sendMessage);
        
        // Bridge APK만 대상으로 전송 (현재 클라이언트 제외)
        let sentCount = 0;
        if (wss && wss.clients) {
          wss.clients.forEach((client) => {
            // 현재 클라이언트(ws)는 제외하고 Bridge APK만 전송
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              try {
                client.send(messageStr);
                sentCount++;
              } catch (err) {
                console.error(`[Bridge 전송] 클라이언트 전송 실패:`, err.message);
              }
            }
          });
        }
        
        console.log(`[Bridge 전송] 응답 ${index + 1}/${replies.length}: roomKey="${room}", text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}", Bridge APK 전송=${sentCount}개`);
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 메시지 처리 오류:`, error);
      ws.send(JSON.stringify({
        error: "Internal server error",
        message: error.message
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

// HTTP 서버 시작
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] HTTP listening on 0.0.0.0:${PORT}`);
});

// 종료 처리 (로그 스트림 닫기 포함)
function shutdown(signal) {
  return function() {
    console.log(`[${new Date().toISOString()}] 서버 종료(${signal})...`);
    if (logStream) {
      logStream.end();
    }
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
